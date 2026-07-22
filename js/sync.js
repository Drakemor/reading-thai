/**
 * Google sign-in + cloud progress sync via Firebase (Auth + Firestore).
 * Offline-first: localStorage remains the source of truth; cloud is debounced backup.
 */
(function () {
  const META_KEY = 'thaiReadingQuestSyncMeta';
  const UPLOAD_DEBOUNCE_MS = 2000;

  let app = null;
  let auth = null;
  let db = null;
  let user = null;
  let uploadTimer = null;
  let listeners = [];
  let hooks = {
    storageKey: 'thaiReadingQuestState',
    onStateMerged: null,
    mergeStates: null,
    getDefaultState: null,
  };

  function isEnabled() {
    const cfg = window.SYNC_CONFIG;
    return !!(cfg && cfg.enabled && cfg.firebase && window.firebase && firebase.app);
  }

  function notify() {
    listeners.forEach(fn => {
      try { fn(user); } catch (e) { console.warn('[CloudSync]', e); }
    });
  }

  function loadMeta() {
    try {
      return JSON.parse(localStorage.getItem(META_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveMeta(meta) {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  }

  function readLocalState() {
    try {
      const raw = localStorage.getItem(hooks.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return hooks.getDefaultState ? { ...hooks.getDefaultState(), ...parsed } : parsed;
    } catch (e) {
      return null;
    }
  }

  function writeLocalState(next) {
    localStorage.setItem(hooks.storageKey, JSON.stringify(next));
    if (typeof hooks.onStateMerged === 'function') hooks.onStateMerged(next);
  }

  function defaultMerge(local, remote) {
    const base = hooks.getDefaultState ? hooks.getDefaultState() : {};
    const a = { ...base, ...(local || {}) };
    const b = { ...base, ...(remote || {}) };

    const union = (x, y) => [...new Set([...(x || []), ...(y || [])])];
    const maxNum = (x, y) => Math.max(Number(x) || 0, Number(y) || 0);
    const maxObj = (x, y) => {
      const out = { ...(y || {}) };
      Object.keys(x || {}).forEach(k => {
        out[k] = Math.max(Number(x[k]) || 0, Number(out[k]) || 0);
      });
      return out;
    };

    const lessonScores = maxObj(a.lessonScores, b.lessonScores);
    const attemptsByFont = {
      looped: maxNum(a.attemptsByFont?.looped, b.attemptsByFont?.looped),
      modern: maxNum(a.attemptsByFont?.modern, b.attemptsByFont?.modern),
    };
    const correctByFont = {
      looped: maxNum(a.correctByFont?.looped, b.correctByFont?.looped),
      modern: maxNum(a.correctByFont?.modern, b.correctByFont?.modern),
    };
    const accuracyByExerciseType = maxObj(a.accuracyByExerciseType, b.accuracyByExerciseType);

    const wordMastery = { ...(b.wordMastery || {}) };
    Object.keys(a.wordMastery || {}).forEach(wordId => {
      const av = a.wordMastery[wordId];
      const bv = wordMastery[wordId];
      if (typeof av === 'number' && typeof bv === 'number') {
        wordMastery[wordId] = Math.max(av, bv);
      } else if (typeof av === 'number') {
        wordMastery[wordId] = {
          looped: Math.max(av, typeof bv === 'number' ? bv : (bv?.looped || 0)),
          modern: Math.max(av, typeof bv === 'number' ? bv : (bv?.modern || 0)),
        };
      } else {
        const an = av || { looped: 0, modern: 0 };
        const bn = typeof bv === 'number' ? { looped: bv, modern: bv } : (bv || { looped: 0, modern: 0 });
        wordMastery[wordId] = {
          looped: Math.max(an.looped || 0, bn.looped || 0),
          modern: Math.max(an.modern || 0, bn.modern || 0),
        };
      }
    });

    const weakKey = w => `${w.id}::${w.fontMode}`;
    const weakMap = new Map();
    [...(a.weakWords || []), ...(b.weakWords || [])].forEach(w => {
      if (!w || !w.id) return;
      const key = weakKey(w);
      const prev = weakMap.get(key);
      if (!prev || (w.addedAt || 0) < (prev.addedAt || 0)) weakMap.set(key, w);
    });

    const letterKeyFn = k => k;
    const letterMap = new Map();
    [...(a.weakLetters || []), ...(b.weakLetters || [])].forEach(w => {
      if (!w || !w.key) return;
      const key = letterKeyFn(w.key);
      const prev = letterMap.get(key);
      if (!prev) {
        letterMap.set(key, { ...w });
        return;
      }
      letterMap.set(key, {
        ...prev,
        ...w,
        mistakes: Math.max(prev.mistakes || 0, w.mistakes || 0),
        lastFail: Math.max(prev.lastFail || 0, w.lastFail || 0),
        addedAt: Math.min(prev.addedAt || Infinity, w.addedAt || Infinity),
      });
    });

    const failMemory = { ...(b.failMemory || {}) };
    Object.keys(a.failMemory || {}).forEach(wordId => {
      const av = a.failMemory[wordId];
      const bv = failMemory[wordId];
      if (!bv) {
        failMemory[wordId] = av;
        return;
      }
      const pick = (av.fails || 0) >= (bv.fails || 0) ? av : bv;
      const other = pick === av ? bv : av;
      failMemory[wordId] = {
        ...other,
        ...pick,
        fails: Math.max(av.fails || 0, bv.fails || 0),
        streak: Math.max(av.streak || 0, bv.streak || 0),
        lastFail: Math.max(av.lastFail || 0, bv.lastFail || 0),
        nextDue: Math.min(
          av.nextDue == null ? Infinity : av.nextDue,
          bv.nextDue == null ? Infinity : bv.nextDue
        ),
      };
      if (failMemory[wordId].nextDue === Infinity) delete failMemory[wordId].nextDue;
    });

    const survivalScores = [...(a.survivalScores || []), ...(b.survivalScores || [])]
      .sort((x, y) => (y.score - x.score) || String(y.date).localeCompare(String(x.date)))
      .slice(0, 10);

    const bossTestsPassedByFont = {
      basic: !!(a.bossTestsPassedByFont?.basic || b.bossTestsPassedByFont?.basic),
      medium: !!(a.bossTestsPassedByFont?.medium || b.bossTestsPassedByFont?.medium),
      advanced: !!(a.bossTestsPassedByFont?.advanced || b.bossTestsPassedByFont?.advanced),
    };

    const completedLessons = union(a.completedLessons, b.completedLessons);
    const unlockedLessons = union(a.unlockedLessons, b.unlockedLessons);
    const pickSide = (a.totalScore || 0) >= (b.totalScore || 0) ? a : b;

    return {
      ...base,
      completedLessons,
      unlockedLessons,
      lessonScores,
      wordMastery,
      weakWords: [...weakMap.values()],
      weakLetters: [...letterMap.values()],
      failMemory,
      totalAttempts: maxNum(a.totalAttempts, b.totalAttempts),
      correctAttempts: maxNum(a.correctAttempts, b.correctAttempts),
      attemptsByFont,
      correctByFont,
      accuracyByExerciseType,
      totalScore: maxNum(a.totalScore, b.totalScore),
      lastActiveDate: [a.lastActiveDate, b.lastActiveDate].filter(Boolean).sort().pop() || null,
      streak: maxNum(a.streak, b.streak),
      currentLessonId: pickSide.currentLessonId || a.currentLessonId || b.currentLessonId || base.currentLessonId,
      bossTestsPassedByFont,
      survivalBest: maxNum(a.survivalBest, b.survivalBest),
      survivalScores,
    };
  }

  async function fetchRemoteProgress() {
    if (!db || !user) return null;
    try {
      const docRef = db.collection('user_progress').doc(user.uid);
      const snap = await docRef.get();
      if (!snap.exists) return null;
      const data = snap.data();
      return { state: data.state, updatedAt: data.updatedAt };
    } catch (e) {
      console.warn('[CloudSync] fetch failed', e.message);
      return null;
    }
  }

  async function uploadState(stateObj) {
    if (!db || !user || !stateObj) return { ok: false };
    const updatedAt = new Date().toISOString();
    try {
      await db.collection('user_progress').doc(user.uid).set({
        state: stateObj,
        updatedAt,
      }, { merge: true });
      saveMeta({ ...loadMeta(), pendingUpload: false, lastSyncedAt: updatedAt, remoteUpdatedAt: updatedAt, lastError: null });
      return { ok: true, updatedAt };
    } catch (e) {
      console.warn('[CloudSync] upload failed', e.message);
      saveMeta({ ...loadMeta(), pendingUpload: true, lastError: e.message });
      return { ok: false, error: e };
    }
  }

  async function syncNow(stateObj) {
    if (!isSignedIn()) return null;
    const remote = await fetchRemoteProgress();
    const local = stateObj || readLocalState();
    if (!remote) {
      if (local) await uploadState(local);
      return local;
    }
    const merge = hooks.mergeStates || defaultMerge;
    const merged = merge(local, remote.state);
    writeLocalState(merged);
    await uploadState(merged);
    return merged;
  }

  function scheduleUpload(stateObj) {
    if (!isSignedIn()) return;
    clearTimeout(uploadTimer);
    uploadTimer = setTimeout(() => {
      uploadState(stateObj || readLocalState());
    }, UPLOAD_DEBOUNCE_MS);
  }

  async function init(options) {
    hooks = { ...hooks, ...(options || {}) };
    if (!isEnabled()) return false;

    const cfg = window.SYNC_CONFIG.firebase;
    app = firebase.initializeApp(cfg);
    auth = firebase.auth();
    db = firebase.firestore();
    // Optional: enable local cache (still writes to our own localStorage too)
    try { await db.enablePersistence({ synchronizeTabs: true }); } catch (_) {}

    auth.onAuthStateChanged(async (u) => {
      user = u || null;
      if (user) await syncNow(readLocalState());
      notify();
    });

    user = auth.currentUser || null;
    if (user) await syncNow(readLocalState());

    const meta = loadMeta();
    if (meta.pendingUpload && user) {
      await uploadState(readLocalState());
    }

    notify();
    return true;
  }

  async function signInWithGoogle() {
    if (!auth) throw new Error('Cloud sync is not configured');
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      // Prefer popup for GitHub Pages; redirect fallback if blocked
      await auth.signInWithPopup(provider);
    } catch (e) {
      if (e && String(e.code || '').includes('popup')) {
        await auth.signInWithRedirect(provider);
        return;
      }
      throw e;
    }
  }

  async function signOut() {
    if (!auth) return;
    clearTimeout(uploadTimer);
    await auth.signOut();
    user = null;
    notify();
  }

  function isSignedIn() {
    return !!user;
  }

  function getUser() {
    return user;
  }

  function getStatus() {
    const meta = loadMeta();
    return {
      enabled: isEnabled(),
      signedIn: isSignedIn(),
      email: user?.email || null,
      name: user?.displayName || null,
      lastSyncedAt: meta.lastSyncedAt || null,
      pendingUpload: !!meta.pendingUpload,
      lastError: meta.lastError || null,
    };
  }

  function addListener(fn) {
    listeners.push(fn);
    return () => { listeners = listeners.filter(x => x !== fn); };
  }

  window.CloudSync = {
    init,
    isEnabled,
    isSignedIn,
    getUser,
    getStatus,
    signInWithGoogle,
    signOut,
    scheduleUpload,
    syncNow,
    addListener,
  };
})();
