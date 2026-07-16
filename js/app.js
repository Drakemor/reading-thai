// Thai Reading Quest - Application Logic
const STORAGE_KEY = 'thaiReadingQuestState';
const FONT_MODES = ['looped','modern'];
const FONT_CLASSES = {looped:'font-thai-looped',modern:'font-thai-modern'};
const PASS_NORMAL = 0.8, PASS_BOSS = 0.85;
const TEST_MIN = 20;
const TEST_MAX = 30;
const LESSON_WORD_LIMIT = 5;
const SURVIVAL_HEARTS = 3;
const SURVIVAL_BATCH = 12;
const SURVIVAL_TOP_N = 10;

/** Spaced-repetition intervals after successive fails (ms). */
const SRS_INTERVALS_MS = [
  30 * 1000,
  2 * 60 * 1000,
  10 * 60 * 1000,
  45 * 60 * 1000,
  3 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
];

function defaultState() {
  return {completedLessons:[],unlockedLessons:['basic-1'],lessonScores:{},wordMastery:{},weakWords:[],
    failMemory:{},
    totalAttempts:0,correctAttempts:0,attemptsByFont:{looped:0,modern:0},
    correctByFont:{looped:0,modern:0},accuracyByExerciseType:{},totalScore:0,
    lastActiveDate:null,streak:0,currentLessonId:'basic-1',
    bossTestsPassedByFont:{basic:false,medium:false,advanced:false},
    survivalBest:0,survivalScores:[]};
}

let state = loadState();
let currentScreen = 'dashboard';
let testSession = null;
let lessonReveal = {};
let selectedOptionIdx = 0;
let lessonSlideIdx = 0;
let lessonSlides = null;
let navBtnIdx = 0;
let animCtx = { slideDir: 0, timerId: null, cardFlip: false };

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s) return {...defaultState(),...s};
  } catch(e) {}
  return defaultState();
}
/** When true (via ?demo=…), progress is not written to localStorage. */
let DEMO_MODE = false;

function saveState() {
  if (DEMO_MODE) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (window.CloudSync) CloudSync.scheduleUpload(state);
}

function updateStreak() {
  const today = new Date().toISOString().slice(0,10);
  if (state.lastActiveDate === today) return;
  const y = new Date(); y.setDate(y.getDate()-1);
  state.streak = state.lastActiveDate === y.toISOString().slice(0,10) ? (state.streak||0)+1 : 1;
  state.lastActiveDate = today;
  saveState();
}

function getFontClass(mode) {
  if (!mode || mode === 'mixed') mode = FONT_MODES[Math.floor(Math.random()*FONT_MODES.length)];
  return FONT_CLASSES[mode] || FONT_CLASSES.looped;
}
function resolveFont(mode) {
  if (!mode || mode === 'mixed') return FONT_MODES[Math.floor(Math.random()*FONT_MODES.length)];
  return mode;
}
function pickReadingFont(idx) {
  return FONT_MODES[(idx == null ? Math.floor(Math.random()*FONT_MODES.length) : idx) % FONT_MODES.length];
}

function renderWordAllFonts(thai, sizeClass) {
  const sz = sizeClass || 'thai-glyph-hero';
  const shown = escHtml(displayThaiText(thai));
  return `<div class="symbol-duo anim-stagger-tight">
    <div class="symbol-card"><p class="symbol-duo-label">Looped</p><p class="${sz} font-thai-looped anim-thai" lang="th">${shown}</p></div>
    <div class="symbol-card"><p class="symbol-duo-label">Modern</p><p class="${sz} font-thai-modern anim-thai" lang="th">${shown}</p></div>
  </div>`;
}

function renderWordFlipCard(word, { revealed = false, animateFlip = false, kicker = 'Word', footerHtml = '' } = {}) {
  if (!word) return '';
  const flippedClass = revealed && !animateFlip ? ' is-flipped' : '';
  const emoji = word.emoji ? `<span class="flip-emoji" aria-hidden="true">${word.emoji}</span>` : '';
  return `<div class="flip-scene">
    <div class="flip-card${flippedClass}" id="lesson-flip-card">
      <div class="flip-face flip-front panel">
        <p class="flip-kicker">${escHtml(kicker)}</p>
        ${renderWordAllFonts(word.thai, 'thai-glyph-hero')}
        <p class="flip-hint">Press Enter to flip</p>
      </div>
      <div class="flip-face flip-back panel">
        <p class="flip-kicker">${escHtml(kicker)}</p>
        ${renderWordAllFonts(word.thai, 'thai-glyph-pair')}
        <p class="flip-roman">${escHtml(word.romanizations.join(' / '))}</p>
        <p class="flip-meaning">${emoji}<strong>${escHtml(word.meaning || '')}</strong></p>
        <p class="flip-explain">${formatMixedThai(word.explanation || '', 'thai-glyph')}</p>
        ${footerHtml || ''}
      </div>
    </div>
  </div>`;
}

/** Dotted circle carrier so combining marks never float onto neighboring Latin text. */
const THAI_CARRIER = '\u25CC';
const THAI_COMBINING_RE = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/;
const THAI_ONLY_COMBINING_RE = /^[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]+$/;

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Normalize a Thai symbol/token for display.
 * - Hyphen placeholders in curriculum ids (เ-, โ-, เ-อ) become ◌ carriers.
 * - Bare combining marks (tone marks, above/below vowels) get a leading ◌.
 */
function displayThaiText(raw) {
  let s = String(raw ?? '');
  if (!s) return '';
  // Curriculum tokens use ASCII "-" as a consonant slot (เ-, เ-อ, โ-ะ patterns).
  if (/[\u0E00-\u0E7F]/.test(s) && s.includes('-')) {
    s = s.replace(/-/g, THAI_CARRIER);
  }
  if (THAI_ONLY_COMBINING_RE.test(s)) {
    return THAI_CARRIER + s;
  }
  // Orphan combining mark at start of a string (e.g. after a bad split).
  if (THAI_COMBINING_RE.test(s.charAt(0))) {
    s = THAI_CARRIER + s;
  }
  // Combining mark immediately after a non-Thai / non-carrier character.
  s = s.replace(/([^\u0E00-\u0E7F\u25CC])([\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]+)/g,
    (_, before, marks) => before + THAI_CARRIER + marks);
  return s;
}

function thaiGlyph(raw, extraClass, fontClass) {
  const cls = ['thai-glyph', extraClass, fontClass].filter(Boolean).join(' ');
  return `<span class="${cls}" lang="th">${escHtml(displayThaiText(raw))}</span>`;
}

/** Wrap Thai runs inside mixed Latin/Thai copy (lesson titles, teaching cards, prompts). */
function formatMixedThai(text, glyphClass) {
  const gClass = glyphClass || 'thai-glyph-title';
  return String(text ?? '').replace(/([\u0E00-\u0E7F][\u0E00-\u0E7F\u25CC\-]*|[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]+)/g, (m) => {
    return `<span class="thai-glyph ${gClass}" lang="th">${escHtml(displayThaiText(m))}</span>`;
  });
}

function formatSymbolList(symbols) {
  if (!symbols || !symbols.length) return '';
  return `<div class="thai-inline-list">${symbols.map(s => thaiGlyph(s)).join('')}</div>`;
}

function normRoman(s) {
  // Normalize input and canonical romanizations to letters only (no spaces/punct/symbols)
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}
function checkRoman(input, word) {
  const n = normRoman(input);
  return word.romanizations.some(r => normRoman(r) === n);
}

function getKnownSymbols() {
  const c = new Set(), v = new Set(), r = new Set();
  state.completedLessons.forEach(lid => {
    const l = LESSONS.find(x => x.id === lid);
    if (l) { l.introduces.consonants.forEach(s=>c.add(s)); l.introduces.vowels.forEach(s=>v.add(s)); l.introduces.rules.forEach(s=>r.add(s)); }
  });
  const cur = LESSONS.find(x => x.id === state.currentLessonId);
  if (cur && currentScreen === 'lesson') {
    cur.introduces.consonants.forEach(s=>c.add(s)); cur.introduces.vowels.forEach(s=>v.add(s)); cur.introduces.rules.forEach(s=>r.add(s));
  }
  return {consonants:c, vowels:v, rules:r};
}

/** Symbols/rules unlocked by progress so far (completed + current lesson). */
function getProgressKnown() {
  const k = {consonants:new Set(), vowels:new Set(), rules:new Set()};
  const cur = LESSONS.find(l => l.id === state.currentLessonId);
  const maxOrder = cur ? cur.order : Infinity;
  LESSONS.forEach(l => {
    if (l.order > maxOrder) return;
    if (!state.completedLessons.includes(l.id) && l.id !== state.currentLessonId && !state.unlockedLessons.includes(l.id)) return;
    l.introduces.consonants.forEach(s => k.consonants.add(s));
    l.introduces.vowels.forEach(s => k.vowels.add(s));
    l.introduces.rules.forEach(s => k.rules.add(s));
  });
  return k;
}

/** Drop weak/SRS entries for words that use untaught rules (e.g. old หมู before leading-h). */
function pruneUntaughtProgressWords() {
  const known = getProgressKnown();
  const beforeWeak = state.weakWords.length;
  state.weakWords = (state.weakWords || []).filter(w => {
    const word = WORDS.find(x => x.id === w.id);
    return word && wordIsKnown(word, known);
  });
  if (state.failMemory) {
    Object.keys(state.failMemory).forEach(id => {
      const word = WORDS.find(x => x.id === id);
      if (!word || !wordIsKnown(word, known)) delete state.failMemory[id];
    });
  }
  if (state.weakWords.length !== beforeWeak) saveState();
}

function wordNeedsLeadingH(w) {
  if (!w?.consonants?.length) return false;
  // True leading-ห cluster: ห + sonorant (หมู, หนู, หมา, หงิก). Not plain หา, and not mid-word ห in อาหาร.
  const sonorants = new Set(['ม', 'น', 'ง', 'ว', 'ย', 'ร', 'ล']);
  return w.consonants[0] === 'ห' && sonorants.has(w.consonants[1]);
}

/** Finals whose spoken sound ≠ letter name: ด/ต→t, บ/ป→p, ร/ล→n (taught in medium-9). */
function wordNeedsFinalSoundMap(w) {
  if (!w?.consonants?.length) return false;
  if (!w.rules?.includes('final-consonant')) return false;
  const changing = new Set(['ร', 'ล', 'ด', 'ต', 'บ', 'ป']);
  return changing.has(w.consonants[w.consonants.length - 1]);
}

function wordNeedsMaiHanAkat(w) {
  return !!(w?.thai && w.thai.includes('\u0E31'));
}

/** -วย pattern: ว is the ua vowel (สวย), not consonant w + implicit o. */
function wordNeedsWVowelUa(w) {
  if (w?.rules?.includes('w-vowel-ua')) return true;
  if (!w?.thai) return false;
  const base = w.thai.replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '');
  return /วย/.test(base);
}

function wordIsKnown(w, known) {
  if (!w.consonants.every(s => known.consonants.has(s))) return false;
  if (!w.vowels.every(s => known.vowels.has(s))) return false;
  if (!w.rules.every(s => known.rules.has(s))) return false;
  // Hard gate even if a word forgot the leading-h rule tag
  if (wordNeedsLeadingH(w) && !known.rules.has('leading-h')) return false;
  // Hard gate letter≠sound finals (เวร, นิล, คีบ, ปิด, …) until medium-9 map is taught
  if (wordNeedsFinalSoundMap(w) && !known.rules.has('final-sound-map')) return false;
  // Hard gate mai han-akat (ั) words like ฟัน / สวัสดี until the mark is taught
  if (wordNeedsMaiHanAkat(w) && !known.vowels.has('ั')) return false;
  // Hard gate -วย (ว as ua vowel) until taught — สวย is not “implicit o”
  if (wordNeedsWVowelUa(w) && !known.rules.has('w-vowel-ua')) return false;
  return true;
}

function getKnownBefore(lesson) {
  const k = {consonants:new Set(),vowels:new Set(),rules:new Set()};
  LESSONS.filter(l => l.order < lesson.order).forEach(l => {
    l.introduces.consonants.forEach(s=>k.consonants.add(s));
    l.introduces.vowels.forEach(s=>k.vowels.add(s));
    l.introduces.rules.forEach(s=>k.rules.add(s));
  });
  return k;
}

function filterKnownWords(ids, extraKnown) {
  const k = extraKnown || getKnownSymbols();
  return ids.map(id => WORDS.find(w=>w.id===id)).filter(w => {
    if (!w) return false;
    if (!wordIsKnown(w, k)) { console.warn('[Thai Reading Quest] Skipping word not yet known:', w.id, w.thai); return false; }
    return true;
  });
}

function getLessonWordIds(lesson, max = LESSON_WORD_LIMIT) {
  const ids = [...new Set([...(lesson.examples || []), ...(lesson.practiceWordIds || [])])];
  return max == null ? ids : ids.slice(0, max);
}

/** Full lesson word list for tests (not capped like lesson slides). */
function getLessonWordIdsForTest(lesson) {
  return getLessonWordIds(lesson, null);
}

function wordLessonOrder(word) {
  if (!word) return Infinity;
  const byId = LESSONS.find(l => l.id === word.lessonId);
  return byId ? byId.order : Infinity;
}

/** Words whose symbols are known AND that belong to this lesson or an earlier one (no advanced spoilers). */
function wordsKnownWith(known, atOrBeforeLesson) {
  return WORDS.filter(w => {
    if (!wordIsKnown(w, known)) return false;
    if (!atOrBeforeLesson) return true;
    return wordLessonOrder(w) <= atOrBeforeLesson.order;
  });
}

function getRevisionWords(lesson) {
  const knownBefore = getKnownBefore(lesson);
  const ids = [];
  LESSONS.filter(l => l.order < lesson.order && !l.isBoss).forEach(l => {
    ids.push(...getLessonWordIdsForTest(l));
  });
  const fromLessons = filterKnownWords(ids, knownBefore);
  // Bank extras only from earlier lessons — never pull advanced review duplicates into basic tests
  const fromBank = wordsKnownWith(knownBefore).filter(w => wordLessonOrder(w) < lesson.order);
  return [...new Map([...fromLessons, ...fromBank].map(w => [w.id, w])).values()];
}

function getNewLessonWords(lesson, known) {
  const ids = getLessonWordIdsForTest(lesson);
  const fromLesson = filterKnownWords(ids, known);
  const newSyms = new Set([...lesson.introduces.consonants, ...lesson.introduces.vowels]);
  const fromBank = wordsKnownWith(known, lesson).filter(w =>
    wordLessonOrder(w) <= lesson.order &&
    (w.consonants.some(s => newSyms.has(s)) ||
      w.vowels.some(v => newSyms.has(v) || [...newSyms].some(s => v.includes(s))))
  );
  return [...new Map([...fromLesson, ...fromBank].map(w => [w.id, w])).values()];
}


function pickReadingType(idx) {
  const roll = idx % 10;
  if (roll < 5) return 'type_roman';
  // bias slightly toward MCQ sometimes
  if (roll < 8) return 'choose_pron';
  return 'type_roman';
}

function buildReadingQuestion(type, word, wordPool, font) {
  if (!word) return null;
  if (type === 'type_roman') return {type, word, font, prompt:'Read this. Type the pronunciation:'};
  if (type === 'choose_pron') {
    const pool = wordPool.length > 1 ? wordPool : [word];
    const opts = shuffle([word.romanizations[0], ...getDistractorRomans(word, pool)].slice(0, 4));
    return {type, word, font, options: opts, prompt:'Read this. Choose the pronunciation:'};
  }
  if (type === 'build_syllable') {
    // Simplify: treat as normal typed reading without decomposition hints
    return {type:'type_roman', word, font, prompt:'Read this. Type the pronunciation:'};
  }
  return null;
}

/** Choose-pronunciation with look-alike distractors forced into the options. */
function buildConfusingChooseQuestion(word, twinWord, font) {
  if (!word || !twinWord) return null;
  const extras = getDistractorRomans(word, WORDS).filter(r =>
    normRoman(r) !== normRoman(word.romanizations[0]) &&
    normRoman(r) !== normRoman(twinWord.romanizations[0])
  );
  const opts = shuffle([
    word.romanizations[0],
    twinWord.romanizations[0],
    ...extras,
  ].slice(0, 4));
  return {
    type: 'choose_pron',
    word,
    font,
    options: opts,
    prompt: 'Look carefully — these letters can look alike. Choose the pronunciation:',
  };
}

function getActiveConfusingPairs(known) {
  return (typeof CONFUSING_PAIRS !== 'undefined' ? CONFUSING_PAIRS : []).filter(p => {
    const need = p.knownAs || { consonants: [p.a, p.b] };
    const consOk = (need.consonants || []).every(s => known.consonants.has(s));
    const vowsOk = (need.vowels || []).every(s => known.vowels.has(s));
    return consOk && vowsOk;
  });
}

function confusingPairJobs(pair, known) {
  const wordsA = pair.wordsA.map(id => WORDS.find(w => w.id === id)).filter(w => w && wordIsKnown(w, known));
  const wordsB = pair.wordsB.map(id => WORDS.find(w => w.id === id)).filter(w => w && wordIsKnown(w, known));
  const jobs = [];
  wordsB.forEach((wb, i) => {
    const wa = wordsA[i] || wordsA[0];
    if (wa && wb) jobs.push([wb, wa], [wa, wb]);
  });
  return shuffle(jobs);
}

/** Force look-alike MCQs into the test by replacing existing items (never skip because word already used). */
function injectConfusingPairQuestions(qs, known, usedKeys, startIdx) {
  let idx = startIdx || qs.length;
  getActiveConfusingPairs(known).forEach(pair => {
    const jobs = confusingPairJobs(pair, known).slice(0, 4);
    const claimed = new Set();
    jobs.forEach(([word, twin]) => {
      if (!word || !twin || claimed.has(word.id)) return;
      claimed.add(word.id);
      const font = pickReadingFont(idx++);
      const q = buildConfusingChooseQuestion(word, twin, font);
      if (!q) return;

      const existingIdx = qs.findIndex(qq => qq.word && qq.word.id === word.id);
      if (existingIdx >= 0) {
        q.font = qs[existingIdx].font || font;
        releaseQuestionKeys(qs[existingIdx], usedKeys);
        qs[existingIdx] = q;
        markQuestionUsed(q, usedKeys);
        return;
      }

      if (isWordUsed(word, usedKeys)) return;
      if (tryAddQuestion(qs, q, usedKeys)) return;

      // Bank full — overwrite a weaker item (never invent a second copy of this word).
      let replaceIdx = qs.findIndex(qq =>
        qq.type === 'choose_pron' &&
        qq.prompt &&
        !qq.prompt.includes('look alike') &&
        qq.word &&
        !claimed.has(qq.word.id) &&
        qq.word.thai !== word.thai
      );
      if (replaceIdx < 0) {
        replaceIdx = qs.findIndex(qq =>
          qq.type === 'choose_pron' && qq.word && !claimed.has(qq.word.id) && qq.word.thai !== word.thai
        );
      }
      if (replaceIdx < 0) return;
      releaseQuestionKeys(qs[replaceIdx], usedKeys);
      qs[replaceIdx] = q;
      markQuestionUsed(q, usedKeys);
    });
  });
  return idx;
}

function questionKey(q) {
  if (!q) return null;
  if (q.type === 'rule') return 'rule:' + q.prompt;
  if (q.word?.id && q.word.id !== 'rule') {
    // Same Thai script counts as the same item — never twice in one test.
    if (q.word.thai) return 'thai:' + q.word.thai;
    return 'word:' + q.word.id;
  }
  return null;
}

function markQuestionUsed(q, usedKeys) {
  const key = questionKey(q);
  if (key) usedKeys.add(key);
  if (q?.word?.id && q.word.id !== 'rule') usedKeys.add('word:' + q.word.id);
  if (q?.word?.thai) usedKeys.add('thai:' + q.word.thai);
}

function releaseQuestionKeys(q, usedKeys) {
  if (!q) return;
  const key = questionKey(q);
  if (key) usedKeys.delete(key);
  if (q.word?.id && q.word.id !== 'rule') usedKeys.delete('word:' + q.word.id);
  if (q.word?.thai) usedKeys.delete('thai:' + q.word.thai);
}

function isWordUsed(word, usedKeys) {
  if (!word) return true;
  if (usedKeys.has('word:' + word.id)) return true;
  if (word.thai && usedKeys.has('thai:' + word.thai)) return true;
  return false;
}

function tryAddQuestion(qs, q, usedKeys) {
  const key = questionKey(q);
  if (!key || usedKeys.has(key)) return false;
  if (q.word && isWordUsed(q.word, usedKeys)) return false;
  markQuestionUsed(q, usedKeys);
  qs.push(q);
  return true;
}

function unusedWords(words, usedKeys) {
  return words.filter(w => !isWordUsed(w, usedKeys));
}

/** Drop duplicate Thai / word ids (safety net after injections). */
function dedupeQuestions(qs) {
  const seen = new Set();
  const out = [];
  qs.forEach(q => {
    const key = questionKey(q);
    if (!key) { out.push(q); return; }
    if (seen.has(key)) return;
    if (q.word?.id && q.word.id !== 'rule' && seen.has('word:' + q.word.id)) return;
    seen.add(key);
    if (q.word?.id && q.word.id !== 'rule') seen.add('word:' + q.word.id);
    out.push(q);
  });
  return out;
}

function pickUnusedWordForSymbol(sym, words, usedKeys) {
  const pool = unusedWords(words, usedKeys);
  return pool.find(w => w.consonants.includes(sym) || w.vowels.some(v => v.includes(sym) || v === sym) || w.thai.includes(sym)) || null;
}

function generateReadingQuestions(count, words, startIdx, wordPool, usedKeys) {
  if (!words.length || count <= 0) return [];
  const qs = [];
  const available = shuffle(unusedWords(words, usedKeys));
  for (let i = 0; i < count && i < available.length; i++) {
    const word = available[i];
    const q = buildReadingQuestion(pickReadingType(startIdx + i), word, wordPool || words, pickReadingFont(startIdx + i));
    tryAddQuestion(qs, q, usedKeys);
  }
  return qs;
}


function regularLessonIndex(lesson) {
  const regular = LESSONS.filter(l => !l.isBoss);
  return Math.max(0, regular.findIndex(l => l.id === lesson.id));
}

function progressiveTestSize(lesson) {
  if (lesson.isBoss) return lesson.bossQuestions || TEST_MAX;
  const regular = LESSONS.filter(l => !l.isBoss);
  const i = regularLessonIndex(lesson);
  const t = regular.length <= 1 ? 0 : i / (regular.length - 1);
  return Math.round(TEST_MIN + t * (TEST_MAX - TEST_MIN));
}

function uniqueTestWordCount(lesson, known) {
  // Count by Thai script so the bank size matches unique reading items.
  const map = new Map();
  const add = (w) => { if (w?.thai) map.set(w.thai, w); else if (w) map.set(w.id, w); };
  getNewLessonWords(lesson, known).forEach(add);
  getRevisionWords(lesson).forEach(add);
  return map.size;
}

/**
 * Progressive 20→30 once the word bank can support it.
 * Never larger than unique material — no duplicate words in a test.
 */
function testSizeForLesson(lesson, known) {
  const progressive = progressiveTestSize(lesson);
  if (!known) return progressive;

  const material = uniqueTestWordCount(lesson, known);
  if (lesson.isBoss) {
    return Math.max(1, Math.min(progressive, material || progressive));
  }

  const coverageFloor = Math.max(
    getNewLessonWords(lesson, known).length,
    lesson.introduces.consonants.length +
      lesson.introduces.vowels.length +
      lesson.introduces.rules.length
  );

  if (material <= 0) return Math.max(1, coverageFloor);
  return Math.max(Math.min(coverageFloor, material), Math.min(progressive, material));
}

function lessonNumberLabel(lesson) {
  if (!lesson) return 'Lesson';
  if (lesson.isBoss) return `${lesson.level[0].toUpperCase()}${lesson.level.slice(1)} Boss`;
  const regular = LESSONS.filter(l => !l.isBoss);
  return `Lesson ${regularLessonIndex(lesson) + 1}/${regular.length}`;
}

function remainingToLevels() {
  return ['basic', 'medium', 'advanced'].map(level => {
    const boss = LESSONS.find(l => l.level === level && l.isBoss);
    const label = level[0].toUpperCase() + level.slice(1);
    if (!boss) return { level, label, left: 0, cleared: true };
    if (state.completedLessons.includes(boss.id)) return { level, label, left: 0, cleared: true };
    const left = LESSONS.filter(l =>
      l.level === level && l.order <= boss.order && !state.completedLessons.includes(l.id)
    ).length;
    return { level, label, left, cleared: false };
  });
}

function renderProgressHeader(lesson, { compact = false } = {}) {
  const L = lesson || LESSONS.find(l => l.id === state.currentLessonId) || LESSONS[0];
  const rem = remainingToLevels().map(r =>
    r.cleared ? `<span class="text-emerald-400">${r.label} ✓</span>` : `<span>${r.label} <strong class="text-slate-300">${r.left}</strong> left</span>`
  ).join('<span class="text-slate-600 mx-1.5">·</span>');
  if (compact) {
    return `<div class="meta-row progress-head">
      <span class="stat-inline">${lessonNumberLabel(L)}</span>
      <span class="font-semibold text-slate-100">${formatMixedThai(L.title)}</span>
      <span class="stat-inline capitalize">${L.level}${L.isBoss ? ' · Boss' : ''}</span>
    </div>`;
  }
  return `<div class="progress-head panel panel-quiet">
    <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <p class="text-sm font-semibold text-slate-100">${lessonNumberLabel(L)} · ${formatMixedThai(L.title)}</p>
      <p class="text-xs text-slate-400 capitalize">${L.level}${L.isBoss ? ' · Boss' : ''}</p>
    </div>
    <p class="text-xs text-slate-500 mt-1">${rem}</p>
  </div>`;
}

function generateNewConceptQuestions(lesson, known, newWords, startIdx, newTarget, usedKeys) {
  const qs = [];
  let idx = startIdx || 0;
  const symbols = [...lesson.introduces.consonants, ...lesson.introduces.vowels];

  symbols.forEach(sym => {
    const word = pickUnusedWordForSymbol(sym, newWords, usedKeys);
    if (!word) return;
    const q = buildReadingQuestion(pickReadingType(idx), word, newWords, pickReadingFont(idx++));
    tryAddQuestion(qs, q, usedKeys);
  });

  lesson.introduces.rules.forEach(ruleId => {
    const q = buildRuleQuestion(known, ruleId);
    if (q) {
      q.font = pickReadingFont(idx++);
      if (tryAddQuestion(qs, q, usedKeys)) return;
    }
    const available = unusedWords(newWords, usedKeys);
    if (available.length) {
      const word = available[Math.floor(Math.random() * available.length)];
      const rq = buildReadingQuestion(pickReadingType(idx), word, newWords, pickReadingFont(idx++));
      tryAddQuestion(qs, rq, usedKeys);
    }
  });

  const target = newTarget || Math.max(qs.length, 10);
  const extra = Math.max(0, target - qs.length);
  const remaining = unusedWords(newWords, usedKeys);
  if (extra && remaining.length) {
    qs.push(...generateReadingQuestions(extra, newWords, idx, newWords, usedKeys));
  } else if (!symbols.length && !lesson.introduces.rules.length && remaining.length) {
    qs.push(...generateReadingQuestions(Math.min(target, remaining.length), newWords, idx, newWords, usedKeys));
  }

  return qs;
}

function generateMixedQuestions(count, words, known, startIdx, usedKeys) {
  if (!words.length) return [];
  const types = [];
  const typed = Math.ceil(count * 0.50), chooseP = Math.ceil(count * 0.30), ruleB = Math.ceil(count * 0.20);
  for (let i = 0; i < typed; i++) types.push('type_roman');
  for (let i = 0; i < chooseP; i++) types.push('choose_pron');
  for (let i = 0; i < ruleB; i++) types.push('rule');
  while (types.length < count) types.push('type_roman');
  const qs = [];
  shuffle(types).slice(0, count).forEach((type, i) => {
    const font = pickReadingFont(startIdx + i);
    if (type === 'rule') {
      const rq = buildRuleQuestion(known);
      if (rq) {
        rq.font = font;
        if (tryAddQuestion(qs, rq, usedKeys)) return;
      }
      type = 'type_roman';
    }
    const available = unusedWords(words, usedKeys);
    if (!available.length) return;
    const word = available[Math.floor(Math.random() * available.length)];
    const q = buildReadingQuestion(type, word, words, font);
    tryAddQuestion(qs, q, usedKeys);
  });
  return qs;
}

function buildTestKnown(lesson) {
  const known = getKnownBefore(lesson);
  lesson.introduces.consonants.forEach(s => known.consonants.add(s));
  lesson.introduces.vowels.forEach(s => known.vowels.add(s));
  lesson.introduces.rules.forEach(s => known.rules.add(s));
  return known;
}

function testPreviewLine(lesson) {
  const known = buildTestKnown(lesson);
  const qs = generateQuestions(lesson, known, lesson.isBoss);
  const newIds = new Set(getNewLessonWords(lesson, known).map(w => w.id));
  const newCount = qs.filter(q => q.word && newIds.has(q.word.id)).length;
  const revCount = qs.length - newCount;
  const pass = lesson.isBoss ? 85 : 80;
  const hearts = heartsForTest(qs.length, lesson.isBoss);
  const heartBit = hearts === 0 ? '1 heart (perfect)' : `${hearts} heart${hearts === 1 ? '' : 's'}`;
  const material = uniqueTestWordCount(lesson, known);
  if (lesson.isBoss) return `${qs.length} boss questions · ${heartBit} · need ${pass}%`;
  if (material < TEST_MIN) {
    return `${qs.length} questions · ${heartBit} · need ${pass}%`;
  }
  return `${qs.length} questions (${newCount} new + ${revCount} rev) · ${heartBit} · need ${pass}%`;
}

function getMastery(wordId, font) {
  const m = state.wordMastery[wordId];
  if (!m) return 0;
  return typeof m === 'number' ? m : (m[font]||0);
}
function setMastery(wordId, font, val) {
  if (!state.wordMastery[wordId]) state.wordMastery[wordId] = {looped:0,modern:0};
  if (typeof state.wordMastery[wordId] === 'number') {
    const old = state.wordMastery[wordId];
    state.wordMastery[wordId] = {looped:old,modern:old};
  }
  state.wordMastery[wordId][font] = Math.max(0, Math.min(5, val));
}
function addWeakWord(wordId, font) {
  const exists = state.weakWords.some(w => w.id===wordId && w.fontMode===font);
  if (!exists) state.weakWords.push({id:wordId, fontMode:font, addedAt:Date.now()});
}

function passRateFor(isBoss) {
  return isBoss ? PASS_BOSS : PASS_NORMAL;
}

/** Max wrong answers while still able to hit the pass %. */
function maxMissesForPass(questionCount, isBoss) {
  const n = Math.max(1, questionCount | 0);
  const need = Math.ceil(n * passRateFor(isBoss));
  return Math.max(0, n - need);
}

function heartsForTest(questionCount, isBoss) {
  return maxMissesForPass(questionCount, isBoss);
}

function recordFailMemory(wordId) {
  if (!wordId || wordId === 'rule') return;
  if (!state.failMemory) state.failMemory = {};
  const prev = state.failMemory[wordId] || { fails: 0, streak: 0 };
  const fails = (prev.fails || 0) + 1;
  const streak = (prev.streak || 0) + 1;
  const interval = SRS_INTERVALS_MS[Math.min(streak - 1, SRS_INTERVALS_MS.length - 1)];
  state.failMemory[wordId] = {
    fails,
    streak,
    lastFail: Date.now(),
    nextDue: Date.now() + interval,
  };
}

function recordFailMemorySuccess(wordId) {
  if (!wordId || wordId === 'rule' || !state.failMemory?.[wordId]) return;
  const prev = state.failMemory[wordId];
  // Soften schedule on success (like SRS “ease”)
  const streak = Math.max(0, (prev.streak || 1) - 1);
  if (streak === 0 && (prev.fails || 0) <= 1) {
    delete state.failMemory[wordId];
    return;
  }
  const interval = SRS_INTERVALS_MS[Math.min(Math.max(streak, 1) - 1, SRS_INTERVALS_MS.length - 1)];
  state.failMemory[wordId] = {
    ...prev,
    streak,
    lastSuccess: Date.now(),
    nextDue: Date.now() + interval * 2,
  };
}

function srsPriority(wordId) {
  const m = state.failMemory?.[wordId];
  if (!m) return 0;
  const now = Date.now();
  const overdue = m.nextDue != null ? Math.max(0, now - m.nextDue) : 0;
  return (m.fails || 0) * 10 + (m.streak || 0) * 5 + (overdue > 0 ? 40 + Math.min(overdue / 60000, 40) : 0);
}

function getDueSrsWords(known, lesson) {
  if (!state.failMemory) return [];
  const maxOrder = lesson ? lesson.order : Infinity;
  return Object.keys(state.failMemory)
    .map(id => WORDS.find(w => w.id === id))
    .filter(w => w && wordIsKnown(w, known) && wordLessonOrder(w) <= maxOrder)
    .sort((a, b) => srsPriority(b.id) - srsPriority(a.id));
}

/** Inject / rewrite slots so overdue failed words appear more often (spaced repetition). */
function injectSrsWords(qs, known, lesson, usedKeys) {
  const due = getDueSrsWords(known, lesson);
  if (!due.length || !qs.length) return;

  const quota = Math.min(due.length, Math.max(2, Math.ceil(qs.length * 0.25)));
  const isProtected = (q) => q && q.prompt && q.prompt.includes('look alike');
  const pool = wordsForLessonBank(lesson, known);
  const placed = new Set();

  for (let i = 0; i < due.length && placed.size < quota; i++) {
    const word = due[i];
    if (!word || placed.has(word.id) || (word.thai && placed.has('thai:' + word.thai))) continue;
    // Already in the test — leave that single slot; never add a second copy.
    if (qs.some(qq => qq.word && (qq.word.id === word.id || qq.word.thai === word.thai))) {
      placed.add(word.id);
      if (word.thai) placed.add('thai:' + word.thai);
      continue;
    }

    const q = buildReadingQuestion(
      pickReadingType(qs.length + i + 3),
      word,
      pool.length ? pool : [word],
      pickReadingFont(qs.length + i + 3)
    );
    if (!q) continue;

    const candidates = qs
      .map((qq, idx) => ({ qq, idx }))
      .filter(({ qq }) =>
        qq.word &&
        !isProtected(qq) &&
        srsPriority(qq.word.id) < srsPriority(word.id)
      );
    if (!candidates.length) continue;
    const slot = candidates[Math.floor(Math.random() * candidates.length)];
    releaseQuestionKeys(slot.qq, usedKeys);
    qs[slot.idx] = q;
    markQuestionUsed(q, usedKeys);
    placed.add(word.id);
    if (word.thai) placed.add('thai:' + word.thai);
  }
}

function renderHeartsBar(heartsTotal, mistakes) {
  // Hearts = allowed misses. If none allowed, show 1 heart (perfect-run life).
  const allowed = Math.max(0, heartsTotal | 0);
  const total = Math.max(1, allowed);
  const lost = allowed === 0
    ? ((mistakes | 0) > 0 ? 1 : 0)
    : Math.min(total, mistakes | 0);
  const hearts = Array.from({ length: total }, (_, i) => {
    // Lost hearts fill from the right: ♥♥♥♡ → ♥♥♡♡
    const dead = i >= total - lost;
    const justLost = dead && i === total - lost && testSession?.lastFeedback && !testSession.lastFeedback.correct;
    return `<span class="heart ${dead ? 'heart-dead' : 'heart-live'}${justLost ? ' heart-break' : ''}" aria-hidden="true">♥</span>`;
  }).join('');
  const left = Math.max(0, total - lost);
  const danger = allowed > 0 && left === 0;
  return `<div class="hearts-bar${allowed === 0 ? ' hearts-bar-perfect' : ''}${danger ? ' hearts-bar-danger' : ''}" role="img" aria-label="${left} of ${total} hearts remaining">
    ${hearts}
    <span class="hearts-label">${allowed === 0 ? 'Perfect' : danger ? 'Last chance' : `${left}/${total}`}</span>
  </div>`;
}

function recordAttempt(correct, font, exType) {
  state.totalAttempts++;
  if (correct) state.correctAttempts++;
  const f = font === 'mixed' ? resolveFont('mixed') : font;
  if (f && f !== 'mixed') {
    state.attemptsByFont[f] = (state.attemptsByFont[f]||0)+1;
    if (correct) state.correctByFont[f] = (state.correctByFont[f]||0)+1;
  }
  if (!state.accuracyByExerciseType[exType]) state.accuracyByExerciseType[exType] = {c:0,t:0};
  state.accuracyByExerciseType[exType].t++;
  if (correct) state.accuracyByExerciseType[exType].c++;
  if (correct) state.totalScore += 10;
  saveState();
}

function fontAccuracy(font) {
  const t = state.attemptsByFont[font]||0, c = state.correctByFont[font]||0;
  return t === 0 ? 0 : Math.round(c/t*100);
}

function overallProgress() {
  const total = LESSONS.filter(l => !l.isBoss).length;
  const done = state.completedLessons.filter(id => !LESSONS.find(l=>l.id===id)?.isBoss).length;
  return Math.round(done/total*100);
}

function overallAccuracy() {
  return state.totalAttempts === 0 ? 0 : Math.round(state.correctAttempts/state.totalAttempts*100);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i=a.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

function goScreen(s) {
  ChipAudio.uiConfirm();
  animCtx.slideDir = 0; currentScreen = s; navBtnIdx = 0; if (s !== 'lesson') lessonSlides = null; render();
}
function goLesson(id) {
  ChipAudio.uiConfirm();
  animCtx.slideDir = 0; state.currentLessonId = id; lessonSlideIdx = 0; lessonSlides = null; lessonReveal = {}; navBtnIdx = 0; currentScreen = 'lesson'; saveState(); render();
}

function getKbButtons() {
  return [...document.querySelectorAll('.kb-btn')].filter(el => {
    const details = el.closest('details');
    if (details && !details.open) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}
function focusKbButton(idx) {
  const btns = getKbButtons();
  if (!btns.length) return;
  const next = ((idx % btns.length) + btns.length) % btns.length;
  if (next !== navBtnIdx) ChipAudio.uiNav();
  navBtnIdx = next;
  btns.forEach((el, i) => el.classList.toggle('kb-selected', i === navBtnIdx));
  btns[navBtnIdx].focus();
}

function startTestFromLesson() {
  const lesson = LESSONS.find(l => l.id === state.currentLessonId);
  if (lesson) startTest(lesson.id, lesson.isBoss || false);
}

function continueAfterTest() {
  if (!testSession) return;
  if (!testSession.passed) {
    startTest(testSession.lessonId, testSession.isBoss);
    return;
  }
  const lessonId = testSession.lessonId;
  testSession = null;
  navBtnIdx = 0;
  const next = LESSONS.find(l => l.unlockAfter === lessonId);
  if (next && state.unlockedLessons.includes(next.id)) goLesson(next.id);
  else goScreen('dashboard');
}

function buildLessonSlides(lesson) {
  const known = getKnownBefore(lesson);
  const knownExtended = {
    consonants: new Set([...known.consonants, ...lesson.introduces.consonants]),
    vowels: new Set([...known.vowels, ...lesson.introduces.vowels]),
    rules: new Set([...known.rules, ...lesson.introduces.rules])
  };
  const slides = [{type:'intro'}];
  [...lesson.introduces.consonants, ...lesson.introduces.vowels].forEach(sym => slides.push({type:'symbol', sym}));
  (lesson.confusingPairIds || []).forEach(id => {
    const pair = CONFUSING_PAIRS.find(p => p.id === id);
    if (pair) slides.push({type:'contrast', pairId: pair.id});
  });
  lesson.teachingCards.forEach((_, i) => slides.push({type:'teaching', index: i}));
  filterKnownWords(getLessonWordIds(lesson), knownExtended).forEach(w => slides.push({type:'practice', wordId: w.id}));
  slides.push({type:'test'});
  slides._lessonId = lesson.id;
  return slides;
}

function renderContrastSlide(pair) {
  if (!pair) return '';
  const a = escHtml(displayThaiText(pair.a));
  const b = escHtml(displayThaiText(pair.b));
  return `<div class="slide-body"><div class="contrast-slide anim-card">
    <p class="contrast-banner">Stop — these look alike</p>
    <h2 class="contrast-title"><span class="thai-glyph thai-glyph-pair font-thai-looped" lang="th">${a}</span> <span class="contrast-vs">vs</span> <span class="thai-glyph thai-glyph-pair font-thai-looped" lang="th">${b}</span></h2>
    <p class="contrast-tip">${formatMixedThai(pair.tip, 'thai-glyph')}</p>
    <div class="contrast-pair-grid">
      <div class="contrast-glyph-card contrast-glyph-a">
        <p class="contrast-sound-label">${escHtml(pair.aSound)} sound</p>
        <p class="contrast-glyph thai-glyph font-thai-looped anim-thai" lang="th">${a}</p>
        <p class="contrast-glyph-sm thai-glyph font-thai-modern" lang="th">${a}</p>
        <p class="contrast-meta">${formatMixedThai(pair.aName, 'thai-glyph')}</p>
        <p class="contrast-roman">${escHtml(pair.aSound)}</p>
      </div>
      <div class="contrast-glyph-card contrast-glyph-b">
        <p class="contrast-sound-label">${escHtml(pair.bSound)} sound</p>
        <p class="contrast-glyph thai-glyph font-thai-looped anim-thai" lang="th" style="animation-delay:.08s">${b}</p>
        <p class="contrast-glyph-sm thai-glyph font-thai-modern" lang="th">${b}</p>
        <p class="contrast-meta">${formatMixedThai(pair.bName, 'thai-glyph')}</p>
        <p class="contrast-roman">${escHtml(pair.bSound)}</p>
      </div>
    </div>
    <p class="contrast-notch">${formatMixedThai(pair.tellApart || '', 'thai-glyph')}</p>
    <div class="contrast-compare-grid">
      ${pair.compare.map(c => `
        <div class="contrast-compare-item">
          <p class="contrast-compare-thai thai-glyph font-thai-looped" lang="th">${escHtml(displayThaiText(c.thai))}</p>
          <p class="contrast-compare-thai-sm thai-glyph font-thai-modern" lang="th">${escHtml(displayThaiText(c.thai))}</p>
          <p class="contrast-compare-roman">${escHtml(c.roman)}</p>
          <p class="contrast-compare-note">${formatMixedThai(c.note, 'thai-glyph')}</p>
        </div>`).join('')}
    </div>
    <p class="contrast-footer">${formatMixedThai(pair.footer || '', 'thai-glyph')}</p>
  </div></div>`;
}

function lessonNextSlide() {
  if (lessonSlideIdx < lessonSlides.length - 1) {
    ChipAudio.uiSlide();
    animCtx.slideDir = 1; lessonSlideIdx++; render();
  }
}

function lessonPrevSlide() {
  if (lessonSlideIdx > 0) {
    ChipAudio.uiSlide();
    animCtx.slideDir = -1; lessonSlideIdx--; render();
  }
}

function startTest(lessonId, isBoss) {
  const lesson = LESSONS.find(l => l.id === lessonId);
  const known = buildTestKnown(lesson);
  const questions = generateQuestions(lesson, known, isBoss);
  if (!questions.length) { alert('Not enough unique material for a test yet.'); return; }
  const heartsTotal = heartsForTest(questions.length, isBoss);
  ChipAudio.testStart();
  selectedOptionIdx = 0;
  animCtx.slideDir = 0;
  testSession = {
    lessonId,
    isBoss,
    questions,
    current: 0,
    score: 0,
    speedBonusTotal: 0,
    mistakes: 0,
    heartsTotal,
    answers: [],
    lastFeedback: null,
    finished: false,
    passed: false,
    died: false,
    dying: false,
    awaitingResults: false,
  };
  currentScreen = 'test';
  testSession.questionStartMs = Date.now();
  render();
}

function generateQuestions(lesson, known, isBoss) {
  const usedKeys = new Set();
  const revisionWords = getRevisionWords(lesson);
  const newWords = getNewLessonWords(lesson, known);
  let qs = [];
  let idx = 0;
  const target = testSizeForLesson(lesson, known);

  if (isBoss) {
    const levelWords = WORDS.filter(w => {
      const lvl = lesson.level;
      if (lvl === 'basic') return w.level === 'basic';
      if (lvl === 'medium') return w.level === 'basic' || w.level === 'medium';
      return true;
    }).filter(w => wordIsKnown(w, known));
    qs = generateMixedQuestions(target, levelWords, known, idx, usedKeys);
    // Pad with unused revision only — never recycle the same Thai twice.
    const need = target - qs.length;
    if (need > 0 && levelWords.length) {
      qs.push(...generateReadingQuestions(need, levelWords, qs.length, levelWords, usedKeys));
    }
  } else {
    // Include every new word (and new-symbol/rule coverage), then pad with unique revision.
    // Order does not matter — questions are shuffled before the test starts.
    const newTarget = Math.max(
      newWords.length,
      lesson.introduces.consonants.length + lesson.introduces.vowels.length + lesson.introduces.rules.length
    );
    qs = generateNewConceptQuestions(lesson, known, newWords, idx, newTarget, usedKeys);
    const missingNew = unusedWords(newWords, usedKeys);
    if (missingNew.length) {
      qs.push(...generateReadingQuestions(missingNew.length, missingNew, qs.length, newWords, usedKeys));
    }
    idx = qs.length;

    const need = Math.max(0, target - qs.length);
    if (need > 0) {
      const revPool = revisionWords.length ? revisionWords : newWords;
      if (revPool.length) {
        qs.push(...generateReadingQuestions(need, revPool, idx, revPool, usedKeys));
      }
    }
  }

  // After the bank is full: rewrite slots into look-alike recognition items (ม vs ท, etc.).
  injectConfusingPairQuestions(qs, known, usedKeys, qs.length);
  // Medium+: keep closed / multi-consonant words in the mix; advanced also forces 3+ consonant items.
  injectComplexWordCoverage(qs, lesson, known, usedKeys);
  // Spaced repetition: resurface words the learner has failed (still one slot each).
  injectSrsWords(qs, known, lesson, usedKeys);

  return shuffle(dedupeQuestions(qs));
}

function consonantCount(word) {
  return word && Array.isArray(word.consonants) ? word.consonants.length : 0;
}

/** Survival: more points for longer written forms (Thai length + consonant weight). */
function survivalPointsForWord(word) {
  if (!word) return 1;
  const thaiLen = Math.max(1, [...(word.thai || '')].length);
  const cons = Math.max(1, consonantCount(word));
  return thaiLen + Math.max(0, cons - 1);
}

function getSurvivalAnchorLesson() {
  const done = (state.completedLessons || [])
    .map(id => LESSONS.find(l => l.id === id))
    .filter(Boolean)
    .sort((a, b) => b.order - a.order);
  if (done.length) return done[0];
  const unlocked = (state.unlockedLessons || [])
    .map(id => LESSONS.find(l => l.id === id))
    .filter(Boolean)
    .sort((a, b) => b.order - a.order);
  return unlocked[0] || LESSONS.find(l => l.id === 'basic-1');
}

const SURVIVAL_SKIP_IDS = new Set(['card_mid', 'card_high', 'card_low', 'tone_ek', 'tone_tho', 'silent_ex']);

function getSurvivalWordPool() {
  const lesson = getSurvivalAnchorLesson();
  const known = buildTestKnown(lesson);
  let pool = wordsKnownWith(known, lesson).filter(w =>
    w.romanizations?.length && !SURVIVAL_SKIP_IDS.has(w.id)
  );
  if (pool.length < 4) {
    const basic1 = LESSONS.find(l => l.id === 'basic-1');
    const k = buildTestKnown(basic1);
    pool = WORDS.filter(w => wordIsKnown(w, k) && (w.lessonId === 'basic-1' || w.id === 'gaa' || w.id === 'maa'));
  }
  if (pool.length < 2) pool = WORDS.filter(w => w.id === 'gaa' || w.id === 'maa');
  return pool;
}

function generateSurvivalQuestions(pool, count, startIdx, usedKeys) {
  const qs = [];
  let idx = startIdx | 0;
  let guard = 0;
  while (qs.length < count && pool.length && guard++ < count * 20) {
    let available = unusedWords(pool, usedKeys);
    if (!available.length) {
      // Endless mode: recycle the bank only after every unique Thai has been used.
      usedKeys.clear();
      available = pool.slice();
    }
    const word = available[Math.floor(Math.random() * available.length)];
    const type = pickReadingType(idx);
    const q = buildReadingQuestion(type, word, pool, pickReadingFont(idx++));
    if (!q) continue;
    // Never force-push duplicates (tryAdd owns uniqueness by Thai / id).
    tryAddQuestion(qs, q, usedKeys);
  }
  return qs;
}

function appendSurvivalQuestions(session, count = SURVIVAL_BATCH) {
  if (!session?.wordPool?.length) return;
  const usedKeys = session.usedKeys || new Set();
  const more = generateSurvivalQuestions(session.wordPool, count, session.questions.length, usedKeys);
  session.questions.push(...more);
  session.usedKeys = usedKeys;
}

function startSurvival() {
  const pool = getSurvivalWordPool();
  const usedKeys = new Set();
  const questions = generateSurvivalQuestions(pool, SURVIVAL_BATCH, 0, usedKeys);
  if (!questions.length) { alert('Not enough known words for Survival yet — finish Basic 1 first.'); return; }
  ChipAudio.testStart();
  selectedOptionIdx = 0;
  animCtx.slideDir = 0;
  testSession = {
    isSurvival: true,
    lessonId: null,
    isBoss: false,
    questions,
    wordPool: pool,
    usedKeys,
    current: 0,
    score: 0,
    survivalPoints: 0,
    speedBonusTotal: 0,
    mistakes: 0,
    heartsTotal: SURVIVAL_HEARTS,
    answers: [],
    lastFeedback: null,
    finished: false,
    passed: false,
    died: false,
    dying: false,
    awaitingResults: false,
  };
  currentScreen = 'test';
  testSession.questionStartMs = Date.now();
  render();
}

function recordSurvivalScore(pts) {
  const date = new Date().toISOString();
  const entry = { score: pts, date };
  const list = [...(state.survivalScores || []), entry]
    .sort((a, b) => (b.score - a.score) || String(b.date).localeCompare(String(a.date)))
    .slice(0, SURVIVAL_TOP_N);
  state.survivalScores = list;
  state.survivalBest = Math.max(state.survivalBest || 0, pts);
  state.totalScore = (state.totalScore || 0) + pts;
  saveState();
  return entry;
}

function failSurvivalOutOfHearts() {
  if (!testSession || testSession.dying || testSession.finished) return;
  testSession.dying = true;
  testSession.died = true;
  testSession.passed = false;
  saveState();
  ChipAudio.testDeath();
  flashScreen('death');
  navBtnIdx = 0;
  render();
}

function finishSurvival() {
  if (!testSession?.isSurvival) return;
  const pts = testSession.survivalPoints || 0;
  recordSurvivalScore(pts);
  testSession.dying = false;
  testSession.finished = true;
  navBtnIdx = 0;
  render();
}

function formatSurvivalDate(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    return d.toISOString().slice(0, 10);
  } catch (e) {
    return String(iso).slice(0, 10);
  }
}

function renderSurvivalResults() {
  const pts = testSession.survivalPoints || 0;
  const best = state.survivalBest || 0;
  const isPB = pts >= best && pts > 0;
  const rows = (state.survivalScores || []).slice(0, SURVIVAL_TOP_N);
  return `<div class="shell-frame anim-screen anim-results anim-results-fail">
    <header class="shell-chrome shell-chrome-compact"><span class="stat-inline">Survival</span></header>
    <div class="test-stage-block shell-stage text-center space-y-4">
      <h1 class="anim-result-item text-3xl font-bold m-0" style="animation-delay:80ms">Survival over</h1>
      <p class="anim-score text-6xl font-bold text-amber-400" style="animation-delay:140ms">${pts}</p>
      <p class="anim-result-item text-slate-400" style="animation-delay:200ms">${testSession.score} correct · ${testSession.mistakes||0} miss${(testSession.mistakes||0)===1?'':'es'}${isPB ? ' · Personal best!' : ''}</p>
      <p class="anim-result-item text-slate-400 text-sm" style="animation-delay:240ms">Best ever: <strong class="text-slate-200">${best}</strong></p>
      <div class="anim-result-item panel text-left space-y-2 max-h-56 overflow-y-auto" style="animation-delay:300ms">
        <p class="text-sm font-semibold text-slate-300">Top runs</p>
        ${rows.length ? rows.map((r, i) =>
          `<div class="text-sm flex justify-between gap-3"><span class="text-slate-500">${i + 1}.</span><span class="text-slate-400">${formatSurvivalDate(r.date)}</span><strong class="text-amber-300">${r.score}</strong></div>`
        ).join('') : '<p class="text-sm text-slate-500">No scores yet</p>'}
      </div>
      <button type="button" id="primary-action" class="anim-result-item kb-btn kb-selected w-full py-4 bg-amber-400 text-slate-950 rounded-2xl font-bold" style="animation-delay:360ms" data-kb-index="0" onclick="startSurvival()">Play again (Enter)</button>
      <button type="button" class="anim-result-item kb-btn w-full py-3 bg-slate-800 rounded-2xl" style="animation-delay:420ms" data-kb-index="1" onclick="testSession=null;goScreen('dashboard')">Dashboard</button>
      <p class="anim-result-item hint-footer" style="animation-delay:460ms">↑ ↓ navigate · Enter select</p>
    </div>
  </div>`;
}

function wordsForLessonBank(lesson, known) {
  return WORDS.filter(w => wordIsKnown(w, known) && wordLessonOrder(w) <= lesson.order);
}

/** Ensure medium/advanced tests include longer written forms, not only CV syllables. */
function injectComplexWordCoverage(qs, lesson, known, usedKeys) {
  if (!qs.length || lesson.level === 'basic') return;

  const pool = wordsForLessonBank(lesson, known);
  const pool2 = pool.filter(w => consonantCount(w) >= 2);
  const pool3 = pool.filter(w => consonantCount(w) >= 3);
  if (!pool2.length) return;

  const need2 = Math.max(2, Math.ceil(qs.length * (lesson.level === 'advanced' ? 0.35 : 0.3)));
  const need3 = lesson.level === 'advanced' && pool3.length
    ? Math.max(2, Math.ceil(qs.length * 0.2))
    : 0;

  const countGe = (n) => qs.filter(q => consonantCount(q.word) >= n).length;
  const isProtected = (q) => q && q.prompt && q.prompt.includes('look alike');

  const replaceWith = (word, maxKeep) => {
    // Already present (by id or Thai) — counts toward coverage; do not duplicate.
    if (qs.some(qq => qq.word && (qq.word.id === word.id || qq.word.thai === word.thai))) {
      return true;
    }

    const q = buildReadingQuestion(
      pickReadingType(qs.length + consonantCount(word)),
      word,
      pool,
      pickReadingFont(qs.length + consonantCount(word))
    );
    if (!q) return false;

    let candidates = qs
      .map((qq, i) => ({ qq, i }))
      .filter(({ qq }) => qq.word && !isProtected(qq) && consonantCount(qq.word) < maxKeep);
    if (!candidates.length) {
      candidates = qs
        .map((qq, i) => ({ qq, i }))
        .filter(({ qq }) => qq.word && !isProtected(qq));
    }
    if (!candidates.length) return false;

    const slot = candidates[Math.floor(Math.random() * candidates.length)];
    releaseQuestionKeys(slot.qq, usedKeys);
    qs[slot.i] = q;
    markQuestionUsed(q, usedKeys);
    return true;
  };

  let guard = 0;
  while (countGe(3) < need3 && guard++ < 50) {
    const word = pool3[Math.floor(Math.random() * pool3.length)];
    if (!replaceWith(word, 3)) break;
  }
  guard = 0;
  while (countGe(2) < need2 && guard++ < 50) {
    const word = pool2[Math.floor(Math.random() * pool2.length)];
    if (!replaceWith(word, 2)) break;
  }
}

function buildSyllablePieces(word) {
  if (word.thai.length <= 2) return word.thai.split('').join(' + ');
  const c = word.consonants[0]||'';
  const v = word.vowels[0]||'';
  if (v.startsWith('เ')||v.startsWith('โ')||v.startsWith('แ')||v.startsWith('ไ')||v.startsWith('ใ')) return v + ' + ' + c;
  return c + ' + ' + v;
}

function getDistractorRomans(word, words) {
  return shuffle(words.filter(w=>w.id!==word.id).map(w=>w.romanizations[0])).slice(0,3);
}

function ruleIsAvailable(r, known) {
  if (!r.requires) return true;
  if (r.requires.rules && !r.requires.rules.every(x => known.rules.has(x))) return false;
  if (r.requires.vowels && !r.requires.vowels.every(x => known.vowels.has(x))) return false;
  if (r.requires.consonants && !r.requires.consonants.every(x => known.consonants.has(x))) return false;
  return true;
}

function isThaiText(s) {
  return /[\u0E00-\u0E7F]/.test(s);
}

function formatPromptHtml(text, fontClass) {
  const fc = fontClass || 'font-thai-looped';
  return String(text).replace(/([\u0E00-\u0E7F][\u0E00-\u0E7F\u25CC\-]*|[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]+)/g, (m) =>
    `<span class="prompt-thai thai-glyph ${fc}" lang="th">${escHtml(displayThaiText(m))}</span>`);
}

function renderRulePrompt(prompt, font) {
  const fc = getFontClass(font);
  const text = String(prompt);
  // Avoid hero breakdown for formula-style prompts like "เ + consonant + ะ..."
  const formulaLike = /\+/.test(text) || /makes one sound/i.test(text);
  const m = !formulaLike ? text.match(/^([\u0E00-\u0E7F]{2,})(\s*)(.*)$/) : null;
  if (m && m[1]) {
    const rest = (m[3] || '').trim() || 'is read as...';
    return `<div class="text-center mb-5 space-y-3">
      <p class="prompt-thai-hero thai-glyph ${fc} anim-thai" lang="th">${escHtml(displayThaiText(m[1]))}</p>
      <p class="text-slate-400 text-lg">${formatPromptHtml(rest, fc)}</p>
    </div>`;
  }
  return `<p class="text-slate-300 mb-4 text-lg leading-relaxed text-center">${formatPromptHtml(prompt, fc)}</p>`;
}

function escAttr(s) {
  return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
}

function optionBtnClass(opt, extra) {
  const thai = isThaiText(opt);
  return `test-option w-full py-4 bg-slate-800 rounded-2xl font-medium border-2 border-transparent ${thai ? 'test-option-thai font-thai-looped text-center' : 'text-left px-5 text-lg'} ${extra||''}`;
}

function renderOptionLabel(opt) {
  if (!isThaiText(opt)) return escHtml(opt);
  return `<span class="thai-glyph thai-glyph-pair font-thai-looped" lang="th">${escHtml(displayThaiText(opt))}</span>`;
}

function renderOptionButtons(options, qType) {
  const btns = options.map((o, i) =>
    `<button type="button" class="${optionBtnClass(o, i===selectedOptionIdx?'test-option-selected':'')}" style="animation-delay:${i*45}ms" data-option-index="${i}" tabindex="${i===selectedOptionIdx?0:-1}" onclick="submitAnswer('${escAttr(o)}')">${renderOptionLabel(o)}</button>`
  );
  if (options.length === 4) {
    return `<div class="grid grid-cols-2 gap-3" role="listbox" aria-label="Answer choices">${btns.join('')}</div>`;
  }
  return `<div class="space-y-3" role="listbox" aria-label="Answer choices">${btns.join('')}</div>`;
}

function buildRuleQuestion(known, requiredRuleId) {
  const rules = [
    {q:'Thai syllables are built around a main...', opts:['consonant','vowel','tone mark'], a:'consonant', requires:{rules:['consonant-core']}},
    {q:'The vowel า comes... the consonant', opts:['after','before','above'], a:'after', requires:{vowels:['า']}},
    {q:'The vowel เ- is written before the consonant but pronounced...', opts:['after it','before it','not at all'], a:'after it', requires:{vowels:['เ-']}},
    {q:'The vowel โ- is written before the consonant but pronounced...', opts:['after it','before it','not at all'], a:'after it', requires:{vowels:['โ-']}},
    {q:'Does ้ affect pronunciation/tone?', opts:['Yes','No'], a:'Yes', requires:{vowels:['้']}},
    {q:'Do tone marks replace vowels?', opts:['Yes','No'], a:'No', requires:{rules:['tone-mark']}},
    {q:'Final consonants in Thai can...', opts:['end a syllable','replace vowels','be ignored'], a:'end a syllable', requires:{rules:['final-consonant']}},
    {q:'As a final consonant, ร is pronounced like...', opts:['n','r','l'], a:'n', requires:{rules:['final-sound-map'],consonants:['ร']}},
    {q:'As a final consonant, ล is pronounced like...', opts:['n','l','r'], a:'n', requires:{rules:['final-sound-map'],consonants:['ล']}},
    {q:'As a final consonant, ด or ต is pronounced like...', opts:['t','d','k'], a:'t', requires:{rules:['final-sound-map']}},
    {q:'As a final consonant, บ or ป is pronounced like...', opts:['p','b','m'], a:'p', requires:{rules:['final-sound-map']}},
    {q:'The mark ั above a consonant is...', opts:['short a','long aa','a tone mark'], a:'short a', requires:{vowels:['ั']}},
    {q:'In สวย, the letter ว is read as...', opts:['part of the uay vowel','consonant w','silent'], a:'part of the uay vowel', requires:{rules:['w-vowel-ua'],consonants:['ว','ย']}},
    {q:'If two consonants appear without a vowel, Thai often inserts...', opts:['short o','long aa','tone mark'], a:'short o', requires:{rules:['implicit-o']}},
    {q:'Which class is ก?', opts:['Mid','High','Low'], a:'Mid', requires:{rules:['consonant-class']}},
    {q:'Which class is ส?', opts:['Mid','High','Low'], a:'High', requires:{rules:['consonant-class'],consonants:['ส']}},
    {q:'Which class is ค?', opts:['Mid','High','Low'], a:'Low', requires:{rules:['consonant-class'],consonants:['ค']}},
    {q:'Which symbol is the mai ek tone mark?', opts:['่','้','๊','๋'], a:'่', requires:{vowels:['่']}},
    {q:'The silent mark ์ makes a letter...', opts:['silent','louder','a vowel'], a:'silent', requires:{rules:['silent-mark']}},
    {q:'เก is read as...', opts:['ke/ge','ek','gek'], a:'ke/ge', requires:{vowels:['เ-'],consonants:['ก']}},
    {q:'เกะ is read as...', opts:['ke/ge (short e)','kea (e + a)','ek'], a:'ke/ge (short e)', requires:{rules:['compound-short-e']}},
    {q:'เละ is read as...', opts:['le (short e)','lea (e then a)','laa'], a:'le (short e)', requires:{rules:['compound-short-e'],consonants:['ล']}},
    {q:'โกะ is read as...', opts:['ko/go (short o)','koa (o + a)','ok'], a:'ko/go (short o)', requires:{rules:['compound-short-o']}},
  ];
  let eligible = rules.filter(r => ruleIsAvailable(r, known));
  if (requiredRuleId) {
    const matched = eligible.filter(r => r.requires?.rules?.includes(requiredRuleId));
    if (matched.length) eligible = matched;
  }
  if (!eligible.length) return null;
  const r = eligible[Math.floor(Math.random()*eligible.length)];
  return {type:'rule', prompt:r.q, options:shuffle(r.opts), answer:r.a, font:'looped',
    word:{id:'rule',thai:'',romanizations:[r.a],meaning:'',explanation:r.a}};
}

function flashScreen(kind) {
  const el = document.getElementById('screen-flash');
  if (!el) return;
  el.className = 'screen-flash';
  void el.offsetWidth;
  el.classList.add('flash-' + kind);
  if (kind === 'fail' || kind === 'fail-big' || kind === 'death') {
    document.body.classList.remove('screen-shake', 'screen-shake-hard');
    void document.body.offsetWidth;
    document.body.classList.add(kind === 'death' ? 'screen-shake-hard' : 'screen-shake');
    setTimeout(() => {
      document.body.classList.remove('screen-shake', 'screen-shake-hard');
    }, kind === 'death' ? 900 : 420);
  }
}

function canStillPass(session) {
  if (!session) return false;
  const remaining = session.questions.length - session.current;
  // After answering current (already incremented), check if max score still clears bar.
  const maxPossible = session.score + remaining;
  const need = Math.ceil(session.questions.length * passRateFor(session.isBoss));
  return maxPossible >= need;
}

function failTestOutOfHearts() {
  if (!testSession || testSession.dying || testSession.finished) return;
  if (testSession.isSurvival) {
    failSurvivalOutOfHearts();
    return;
  }
  testSession.dying = true;
  testSession.died = true;
  testSession.passed = false;
  testSession.finished = false;
  testSession.awaitingResults = false;
  saveState();
  ChipAudio.testDeath();
  flashScreen('death');
  navBtnIdx = 0;
  render();
}

/** After out-of-hearts: user must dismiss so the missed word stays on screen. */
function continueAfterDeath() {
  if (!testSession?.dying) return;
  if (testSession.isSurvival) {
    finishSurvival();
    return;
  }
  const lessonId = testSession.lessonId;
  const isBoss = testSession.isBoss;
  const isReview = !!testSession.isReview;
  if (isReview) startReview();
  else startTest(lessonId, isBoss);
}

function submitAnswer(answer) {
  if (!testSession || testSession.dying || testSession.finished || testSession.awaitingResults) return;
  const startedAt = testSession.questionStartMs || Date.now();
  const q = testSession.questions[testSession.current];
  let correct = false;
  if (q.type === 'type_roman') correct = checkRoman(answer, q.word);
  else if (q.type === 'choose_pron') correct = q.word.romanizations.some(r => normRoman(answer) === normRoman(r));
  else if (q.type === 'build_syllable') correct = checkRoman(answer, q.word);
  else if (q.type === 'rule') correct = answer === q.answer;

  const font = resolveFont(q.font);
  recordAttempt(correct, font, q.type);
  const durationMs = Math.max(0, Date.now() - startedAt);
  // Simple speed bonus: very fast +3, fast +1
  let speedBonus = 0;
  if (correct) {
    if (durationMs <= 1500) speedBonus = 3;
    else if (durationMs <= 3000) speedBonus = 1;
  }
  if (q.word && q.word.id && q.word.id !== 'rule') {
    const m = getMastery(q.word.id, font);
    if (correct) {
      setMastery(q.word.id, font, m + 1);
      recordFailMemorySuccess(q.word.id);
    } else {
      setMastery(q.word.id, font, m - 1);
      addWeakWord(q.word.id, font);
      recordFailMemory(q.word.id);
    }
  }
  if (correct) {
    testSession.score++;
    if (speedBonus) {
      testSession.speedBonusTotal = (testSession.speedBonusTotal || 0) + speedBonus;
      state.totalScore = (state.totalScore || 0) + speedBonus;
    }
    if (testSession.isSurvival && q.word) {
      testSession.survivalPoints = (testSession.survivalPoints || 0) + survivalPointsForWord(q.word);
    }
  } else {
    testSession.mistakes = (testSession.mistakes || 0) + 1;
  }

  if (correct) ChipAudio.testCorrect();
  else ChipAudio.testWrong();
  flashScreen(correct ? 'success' : 'fail');
  testSession.answers.push({q, answer, correct, font, durationMs, speedBonus});
  testSession.lastFeedback = {q, answer, correct, font, durationMs, speedBonus};
  testSession.current++;
  selectedOptionIdx = 0;
  // Start timer for next question
  testSession.questionStartMs = Date.now();
  saveState();

  if (testSession.isSurvival) {
    if (!correct && (testSession.mistakes || 0) >= (testSession.heartsTotal || SURVIVAL_HEARTS)) {
      failSurvivalOutOfHearts();
      return;
    }
    if (testSession.current >= testSession.questions.length - 2) {
      appendSurvivalQuestions(testSession);
    }
    render();
    return;
  }

  // Out of hearts / cannot meet pass bar → dramatic restart
  if (!correct && !canStillPass(testSession)) {
    failTestOutOfHearts();
    return;
  }

  // Hold on the last answer card before jumping to the summary
  if (testSession.current >= testSession.questions.length) {
    holdLastAnswerBeforeResults();
    return;
  }
  render();
}

/** Pause on the final answer feedback so it is not skipped by the results screen. */
function holdLastAnswerBeforeResults() {
  if (!testSession || testSession.finished || testSession.dying) return;
  testSession.awaitingResults = true;
  navBtnIdx = 0;
  render();
}

function continueToResults() {
  if (!testSession?.awaitingResults) return;
  testSession.awaitingResults = false;
  finishTest();
}

function displayMeaning(word) {
  if (!word?.meaning) return '';
  return String(word.meaning).trim();
}

function displayEmoji(word) {
  if (!word || word.id === 'rule') return '';
  return word.emoji || '';
}

function renderLastFeedback() {
  if (!testSession?.lastFeedback) return '';
  const ans = testSession.lastFeedback;
  const word = ans.q.word && ans.q.word.id !== 'rule' ? ans.q.word : null;
  const label = ans.correct ? 'Correct' : 'Incorrect';
  const card = ans.correct
    ? 'fb-card fb-card-ok'
    : 'fb-card fb-card-bad';
  const muted = ans.correct ? 'text-emerald-100' : 'text-rose-100';
  let answerLine = '';
  if (ans.q.type === 'rule') {
    if (!ans.correct) answerLine = `<span class="${muted}">Answer:</span> <strong class="text-white">${ans.q.answer}</strong>`;
  } else if (word?.romanizations?.[0]) {
    const primary = word.romanizations[0];
    const alts = word.romanizations.slice(1);
    answerLine = `<span class="${muted}">${ans.correct ? 'Read as' : 'Answer'}:</span> <strong class="text-white">${primary}</strong>${alts.length ? ` <span class="${muted}">(also ${alts.join('/')})</span>` : ''}`;
  }
  const thai = word?.thai
    ? `<span class="${getFontClass(ans.font)} fb-thai thai-glyph anim-thai" lang="th">${escHtml(displayThaiText(word.thai))}</span>`
    : '';
  const emoji = displayEmoji(word);
  const meaning = displayMeaning(word);
  const fbAnim = ans.correct ? 'anim-feedback anim-feedback-correct' : 'anim-feedback anim-feedback-wrong';
  return `<div class="${card} ${fbAnim}">
    ${emoji ? `<div class="fb-emoji" aria-hidden="true">${emoji}</div>` : ''}
    <div class="fb-body">
      <p class="fb-label">${label}${thai ? ` · ${thai}` : ''}</p>
      ${answerLine ? `<p class="fb-answer">${answerLine}</p>` : ''}
      ${typeof ans.speedBonus === 'number' ? `<p class="text-xs text-amber-300">${ans.speedBonus>0?`+${ans.speedBonus} speed bonus`:''}${ans.durationMs!=null?`${ans.speedBonus>0?' · ':''}${(ans.durationMs/1000).toFixed(1)}s` : ''}</p>` : ''}
      ${meaning ? `<p class="fb-meaning">${meaning}</p>` : ''}
    </div>
  </div>`;
}

function renderTestSummary() {
  const wrong = testSession.answers.filter(a => !a.correct);
  if (!wrong.length) return '';
  return `<div class="anim-result-summary bg-slate-900 border border-slate-800 rounded-2xl p-4 text-left space-y-2 max-h-48 overflow-y-auto" style="animation-delay:320ms">
    <p class="text-sm font-semibold text-slate-300">Missed (${wrong.length})</p>
    ${wrong.map(ans => {
      const w = ans.q.word && ans.q.word.id !== 'rule' ? ans.q.word : null;
      const thai = w?.thai
        ? `<span class="${getFontClass(ans.font)} thai-glyph" lang="th">${escHtml(displayThaiText(w.thai))}</span>`
        : formatMixedThai(ans.q.prompt, 'thai-glyph');
      const correct = ans.q.type === 'rule' ? ans.q.answer : (w?.romanizations?.join('/') || '—');
      const emoji = displayEmoji(w);
      const meaning = displayMeaning(w);
      return `<div class="anim-missed-row text-sm flex flex-wrap items-center gap-x-2 gap-y-1"><span class="text-rose-400">✗</span>${emoji ? `<span>${emoji}</span>` : ''}${thai}<span class="text-slate-500">→</span><strong>${correct}</strong>${meaning ? `<span class="text-slate-400">· ${meaning}</span>` : ''}</div>`;
    }).join('')}
  </div>`;
}

function finishTest() {
  const pct = testSession.score / testSession.questions.length;
  const lesson = LESSONS.find(l => l.id === testSession.lessonId);
  const passed = testSession.isBoss ? pct >= PASS_BOSS : pct >= PASS_NORMAL;
  let newlyUnlocked = false;
  if (passed && lesson && !testSession.isReview) {
    if (!state.completedLessons.includes(testSession.lessonId)) state.completedLessons.push(testSession.lessonId);
    const next = LESSONS.find(l => l.unlockAfter === testSession.lessonId);
    if (next && !state.unlockedLessons.includes(next.id)) {
      state.unlockedLessons.push(next.id);
      newlyUnlocked = true;
    }
    if (testSession.isBoss) state.bossTestsPassedByFont[lesson.level] = true;
    state.lessonScores[testSession.lessonId] = Math.max(state.lessonScores[testSession.lessonId]||0, Math.round(pct*100));
  }
  saveState();
  testSession.awaitingResults = false;
  testSession.finished = true;
  testSession.pct = pct;
  testSession.passed = passed;
  navBtnIdx = 0;
  if (passed) ChipAudio.testPass();
  else ChipAudio.testFail();
  if (newlyUnlocked) setTimeout(() => ChipAudio.lessonUnlock(), 520);
  if (passed && testSession.isBoss) launchConfetti();
  setTimeout(() => flashScreen(passed ? 'success-big' : 'fail-big'), 900);
  render();
}

function launchConfetti() {
  const colors = ['#fbbf24','#34d399','#fb7185','#60a5fa','#a78bfa'];
  for (let i=0;i<50;i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.left = Math.random()*100+'vw';
    el.style.background = colors[Math.floor(Math.random()*colors.length)];
    el.style.animationDelay = Math.random()*2+'s';
    document.body.appendChild(el);
    setTimeout(()=>el.remove(), 4000);
  }
}

function resetProgress() {
  if (confirm('Reset all progress? This cannot be undone.')) {
    state = defaultState(); saveState(); render();
  }
}
function exportProgress() {
  const blob = new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='thai-reading-quest-progress.json'; a.click();
}
function importProgress() {
  const inp = document.createElement('input'); inp.type='file'; inp.accept='.json';
  inp.onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { state = {...defaultState(),...JSON.parse(r.result)}; saveState(); render(); } catch(err){ alert('Invalid file'); } };
    r.readAsText(f);
  };
  inp.click();
}

function startReview() {
  pruneUntaughtProgressWords();
  const known = getProgressKnown();
  let words = state.weakWords
    .map(w => ({...w, word:WORDS.find(x=>x.id===w.id)}))
    .filter(w => w.word && wordIsKnown(w.word, known));
  // Prefer SRS-due fails at the front of the review queue
  words.sort((a, b) => srsPriority(b.id) - srsPriority(a.id));
  if (words.length === 0) { alert('No weak words to review!'); return; }
  ChipAudio.testStart();
  const qs = words.slice(0,15).map((w, i) => ({
    type:'type_roman', word:w.word, font:pickReadingFont(i),
    prompt:'Read this. Type the pronunciation:'
  }));
  const heartsTotal = heartsForTest(qs.length, false);
  testSession = {
    lessonId: 'review',
    isBoss: false,
    questions: qs,
    current: 0,
    score: 0,
    speedBonusTotal: 0,
    mistakes: 0,
    heartsTotal,
    answers: [],
    isReview: true,
    lastFeedback: null,
    finished: false,
    passed: false,
    died: false,
    dying: false,
    awaitingResults: false,
  };
  selectedOptionIdx = 0;
  animCtx.slideDir = 0;
  currentScreen = 'test';
  testSession.questionStartMs = Date.now();
  render();
}

function setAudioVolume(v) {
  ChipAudio.setVolume(Number(v) / 100);
  const label = document.getElementById('vol-label');
  if (label) label.textContent = ChipAudio.isMuted() ? 'Muted' : Math.round(ChipAudio.getVolume() * 100) + '%';
  const muteBtn = document.getElementById('mute-btn');
  if (muteBtn) muteBtn.textContent = ChipAudio.isMuted() ? 'Unmute' : 'Mute';
  ChipAudio.uiSelect();
}

function toggleAudioMute() {
  ChipAudio.toggleMute();
  ChipAudio.uiSelect();
  const label = document.getElementById('vol-label');
  if (label) label.textContent = ChipAudio.isMuted() ? 'Muted' : Math.round(ChipAudio.getVolume() * 100) + '%';
  const muteBtn = document.getElementById('mute-btn');
  if (muteBtn) muteBtn.textContent = ChipAudio.isMuted() ? 'Unmute' : 'Mute';
  const slider = document.getElementById('vol-slider');
  if (slider) slider.setAttribute('aria-valuenow', Math.round(ChipAudio.getVolume() * 100));
}

function wordMasteryLevel(wordId) {
  return Math.min(...FONT_MODES.map(f => getMastery(wordId, f)));
}

function masteryDots(wordId) {
  const m = wordMasteryLevel(wordId);
  return `<span title="Combined mastery ${m}/5">${[0,1,2,3,4].map(i=>`<span class="mastery-dot ${i<m?'filled':'empty'}"></span>`).join('')}</span>`;
}

function markWordKnown(wordId) {
  FONT_MODES.forEach(f => setMastery(wordId, f, 5));
  state.weakWords = state.weakWords.filter(w => w.id !== wordId);
  if (state.failMemory) delete state.failMemory[wordId];
  saveState(); render();
}

function render() {
  updateStreak();
  const app = document.getElementById('app');
  if (!app) return;
  let html = '';
  switch(currentScreen) {
    case 'dashboard': html = renderDashboard(); break;
    case 'lessons': html = renderLessons(); break;
    case 'lesson': html = renderLessonView(); break;
    case 'test': html = renderTest(); break;
    case 'review': html = renderReview(); break;
  }
  app.innerHTML = html;
  const shouldFlip = animCtx.cardFlip;
  animCtx.slideDir = 0;
  animCtx.cardFlip = false;
  attachKeyboard();
  focusPrimaryUI();
  if (shouldFlip) {
    const card = document.getElementById('lesson-flip-card');
    if (card) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => card.classList.add('is-flipped'));
      });
    }
  }
}

function focusPrimaryUI() {
  requestAnimationFrame(() => {
    if (currentScreen === 'test') { focusTestUI(); return; }
    if (currentScreen === 'lesson') {
      document.getElementById('slide-primary-btn')?.focus();
      return;
    }
    focusKbButton(navBtnIdx);
  });
}

function getTestHint(q) {
  if (q.type === 'type_roman' || q.type === 'build_syllable') return 'Type your answer, then press Enter';
  const n = q.options ? q.options.length : 0;
  if (n <= 1) return 'Press Enter to select';
  if (n === 4) return '↑ ↓ ← → move · Enter select · 1–4 quick pick';
  return '↑ ↓ move · Enter to select · 1–' + Math.min(n, 9) + ' quick pick';
}

function getTestOptions() {
  return [...document.querySelectorAll('.test-option')];
}

function highlightOption(idx, { wrap = false } = {}) {
  const opts = getTestOptions();
  if (!opts.length) return;
  let next = idx | 0;
  if (wrap) {
    next = ((next % opts.length) + opts.length) % opts.length;
  } else {
    next = Math.min(opts.length - 1, Math.max(0, next));
  }
  if (next !== selectedOptionIdx) ChipAudio.uiSelect();
  selectedOptionIdx = next;
  opts.forEach((el, i) => {
    el.classList.toggle('test-option-selected', i === selectedOptionIdx);
    el.tabIndex = i === selectedOptionIdx ? 0 : -1;
  });
  opts[selectedOptionIdx].focus();
}

function highlightOptionGrid(deltaRow, deltaCol) {
  const opts = getTestOptions();
  if (opts.length !== 4) {
    highlightOption(selectedOptionIdx + (deltaRow > 0 || deltaCol > 0 ? 1 : -1), { wrap: false });
    return;
  }
  const cols = 2;
  const curRow = Math.floor(selectedOptionIdx / cols);
  const curCol = selectedOptionIdx % cols;
  const nextRow = Math.min(1, Math.max(0, curRow + deltaRow));
  const nextCol = Math.min(1, Math.max(0, curCol + deltaCol));
  highlightOption(nextRow * cols + nextCol, { wrap: false });
}
function submitSelectedOption() {
  const opts = getTestOptions();
  if (!opts.length) return;
  opts[selectedOptionIdx]?.click();
}

function focusTestUI() {
  if (currentScreen !== 'test' || !testSession) return;
  requestAnimationFrame(() => {
    if (testSession.dying) { focusKbButton(navBtnIdx || 0); return; }
    // Start/update per-question timer
    if (animCtx.timerId) { try { clearInterval(animCtx.timerId); } catch(e) {} animCtx.timerId = null; }
    const timerEl = document.getElementById('q-timer');
    if (timerEl && testSession.questionStartMs) {
      const update = () => {
        const ms = Math.max(0, Date.now() - (testSession.questionStartMs || Date.now()));
        timerEl.textContent = (ms / 1000).toFixed(1);
      };
      update();
      animCtx.timerId = setInterval(update, 100);
    }
    if (testSession.awaitingResults) { focusKbButton(navBtnIdx || 0); return; }
    if (testSession.finished) { focusKbButton(navBtnIdx); return; }
    const inp = document.getElementById('answer-input');
    if (inp) { inp.focus(); inp.select?.(); return; }
    highlightOption(selectedOptionIdx || 0);
  });
}

function renderCloudSyncSection() {
  if (!window.CloudSync) return '';
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const s = CloudSync.getStatus();
  if (!s.enabled) {
    return `<div class="panel-body space-y-2">
      <p class="text-slate-400 text-sm">Sign in with Google to save progress across devices. Copy <code class="text-slate-300">js/config.example.js</code> to <code class="text-slate-300">js/config.js</code> and add your Firebase keys.</p>
    </div>`;
  }
  if (s.signedIn) {
    const label = esc(s.name || s.email || 'Signed in');
    const synced = s.lastSyncedAt ? esc(new Date(s.lastSyncedAt).toLocaleString()) : 'not yet';
    const err = s.lastError ? `<p class="text-xs text-rose-400 mt-1">${esc(s.lastError)}</p>` : '';
    return `<div class="panel-body space-y-3">
      <div class="flex justify-between items-start gap-3">
        <div>
          <p class="text-sm text-emerald-400">Signed in as ${label}</p>
          <p class="text-xs text-slate-500 mt-1">Last synced: ${synced}${s.pendingUpload ? ' · pending upload' : ''}</p>
          ${err}
        </div>
        <button type="button" class="px-3 py-2 bg-slate-800 rounded-xl text-sm shrink-0" onclick="signOutCloud()">Sign out</button>
      </div>
      <p class="text-slate-400 text-sm">Progress syncs automatically while you play.</p>
    </div>`;
  }
  return `<div class="panel-body space-y-3">
    <p class="text-slate-400 text-sm">Back up progress and continue on another device. Local play still works offline.</p>
    <button type="button" class="w-full py-3 bg-white text-slate-900 rounded-2xl font-semibold flex items-center justify-center gap-2" onclick="signInCloud()">
      <span aria-hidden="true">G</span> Sign in with Google
    </button>
  </div>`;
}

async function signInCloud() {
  if (!window.CloudSync || !CloudSync.isEnabled()) return;
  try {
    await CloudSync.signInWithGoogle();
  } catch (e) {
    alert('Sign-in failed: ' + (e.message || e));
  }
}

async function signOutCloud() {
  if (!window.CloudSync) return;
  try {
    await CloudSync.signOut();
    render();
  } catch (e) {
    alert('Sign-out failed: ' + (e.message || e));
  }
}

function renderDashboard() {
  const wp = overallProgress(), wa = overallAccuracy();
  const nextLesson = LESSONS.find(l => state.unlockedLessons.includes(l.id) && !state.completedLessons.includes(l.id)) || LESSONS[0];
  const doneCount = state.completedLessons.filter(id => !LESSONS.find(l => l.id === id)?.isBoss).length;
  return `
  <div class="shell-frame anim-screen">
    <header class="shell-chrome">
      <div class="hero-brand">
        <h1>Thai Reading Quest</h1>
        <p>Learn to read Thai script</p>
      </div>
      <div class="meta-row">
        <span class="stat-inline">${getCurrentLevel()}</span>
        <span class="stat-inline">${wp}% done</span>
        <span class="stat-inline">🔥 ${state.streak || 0}d</span>
      </div>
    </header>

    <div class="shell-grid shell-grid-dash">
      <main class="panel space-y-5">
        ${renderProgressHeader(nextLesson)}
        <div>
          <p class="text-slate-400 text-sm">Continue with</p>
          <p class="text-2xl font-bold mt-1">${formatMixedThai(nextLesson.title)}</p>
          <p class="text-slate-500 text-sm mt-1 capitalize">${nextLesson.level}${nextLesson.isBoss ? ' · Boss' : ''} · ${lessonNumberLabel(nextLesson)}</p>
        </div>
        <div class="cta-stack cta-stack-primary">
          <button type="button" class="kb-btn w-full py-4 bg-amber-400 text-slate-950 rounded-2xl font-bold text-lg kb-selected" data-kb-index="0" onclick="goLesson('${nextLesson.id}')">Continue Learning</button>
          <button type="button" class="kb-btn w-full py-4 bg-rose-900/80 text-rose-100 border border-rose-700/60 rounded-2xl font-semibold" data-kb-index="1" onclick="startSurvival()">Survival · 3 hearts${state.survivalBest ? ` · best ${state.survivalBest}` : ''}</button>
        </div>
        <div class="cta-stack" style="grid-template-columns:1fr 1fr">
          <button type="button" class="kb-btn w-full py-3 bg-slate-800 text-slate-100 rounded-2xl font-semibold" data-kb-index="2" onclick="goScreen('review')">Weak Words</button>
          <button type="button" class="kb-btn w-full py-3 bg-slate-800 text-slate-100 rounded-2xl font-semibold" data-kb-index="3" onclick="goScreen('lessons')">All Lessons</button>
        </div>
        <p class="hint-footer">↑ ↓ navigate · Enter select</p>
      </main>

      <aside class="dash-aside">
        <details class="panel" open>
          <summary>Progress</summary>
          <div class="panel-body">
            <div class="stat-list">
              <div class="stat-list-row"><span>Level</span><strong>${getCurrentLevel()}</strong></div>
              <div class="stat-list-row"><span>Lessons done</span><strong>${doneCount}</strong></div>
              <div class="stat-list-row"><span>Score</span><strong>${state.totalScore}</strong></div>
              <div class="stat-list-row"><span>Accuracy</span><strong>${wa}%</strong></div>
              <div class="stat-list-row"><span>Weak words</span><strong>${state.weakWords.length}</strong></div>
            </div>
            <div class="mt-3">
              <div class="flex justify-between text-sm mb-1"><span class="text-slate-400">Overall</span><span>${wp}%</span></div>
              <div class="h-2 bg-slate-800 rounded-full anim-progress"><div class="h-2 bg-amber-400 rounded-full" style="width:${wp}%"></div></div>
            </div>
            <div class="mt-3 space-y-1 text-sm">
              <div class="stat-list-row"><span>Looped font</span><span>${fontAccuracy('looped')}%</span></div>
              <div class="stat-list-row"><span>Modern font</span><span>${fontAccuracy('modern')}%</span></div>
            </div>
          </div>
        </details>

        <details class="panel">
          <summary>Sound</summary>
          <div class="panel-body space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-sm text-slate-400">Chip beeps</span>
              <span id="vol-label" class="text-sm text-slate-300">${ChipAudio.isMuted() ? 'Muted' : Math.round(ChipAudio.getVolume() * 100) + '%'}</span>
            </div>
            <div class="flex items-center gap-3">
              <input id="vol-slider" type="range" min="0" max="100" value="${Math.round(ChipAudio.getVolume() * 100)}"
                class="flex-1 accent-amber-400" oninput="setAudioVolume(this.value)" aria-label="Volume">
              <button type="button" id="mute-btn" class="px-3 py-2 bg-slate-800 rounded-xl text-sm border-2 border-transparent hover:border-amber-400" onclick="toggleAudioMute()">${ChipAudio.isMuted() ? 'Unmute' : 'Mute'}</button>
            </div>
          </div>
        </details>

        <details class="panel">
          <summary>Cloud sync</summary>
          ${renderCloudSyncSection()}
        </details>

        <details class="panel panel-quiet">
          <summary>Data</summary>
          <div class="panel-body flex gap-2">
            <button type="button" class="kb-btn flex-1 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm" data-kb-index="4" onclick="exportProgress()">Export</button>
            <button type="button" class="kb-btn flex-1 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm" data-kb-index="5" onclick="importProgress()">Import</button>
            <button type="button" class="kb-btn flex-1 py-2 bg-slate-800 text-rose-400 rounded-xl text-sm" data-kb-index="6" onclick="resetProgress()">Reset</button>
          </div>
        </details>
      </aside>
    </div>
  </div>`;
}

function getCurrentLevel() {
  if (state.completedLessons.includes('advanced-boss')) return 'Advanced ✓';
  if (state.completedLessons.includes('medium-boss')) return 'Advanced';
  if (state.completedLessons.includes('basic-boss')) return 'Medium';
  return 'Basic';
}

function renderLessons() {
  const levels = ['basic','medium','advanced'];
  let kbIdx = 0;
  const cur = LESSONS.find(l => l.id === state.currentLessonId) || LESSONS[0];
  let html = `<div class="shell-frame anim-screen">
    <header class="shell-chrome shell-chrome-compact">
      <button type="button" class="kb-btn text-slate-300 text-sm kb-selected px-2 py-1 rounded-lg" data-kb-index="${kbIdx++}" onclick="goScreen('dashboard')">← Dashboard</button>
      <h1 class="text-lg font-bold m-0">All Lessons</h1>
      ${renderProgressHeader(cur, { compact: true })}
    </header>
    <div class="shell-grid" style="gap:1.25rem">`;
  levels.forEach(lvl => {
    const lessons = LESSONS.filter(l => l.level === lvl);
    html += `<section class="lessons-level"><h2>${lvl}</h2><div class="shell-grid shell-grid-lessons">`;
    lessons.forEach(l => {
      const locked = !state.unlockedLessons.includes(l.id);
      const done = state.completedLessons.includes(l.id);
      const score = state.lessonScores[l.id];
      const syms = [...l.introduces.consonants, ...l.introduces.vowels];
      const badge = locked
        ? '<span class="stat-inline">Locked</span>'
        : `<span class="stat-inline ${done ? 'text-emerald-400' : 'text-amber-300'}">${done ? '✓ Done' : 'Open'}</span>`;
      const body = `<div class="lesson-card-top">
            <div>
              <p class="font-semibold m-0">${formatMixedThai(l.title)}</p>
              <p class="lesson-card-meta">${l.isBoss ? 'Boss Test' : 'Lesson'}${score != null ? ` · Best ${score}%` : ''}</p>
            </div>
            ${badge}
          </div>
          ${syms.length ? `<div class="lesson-card-syms">${syms.map(s => thaiGlyph(s)).join('')}</div>` : ''}`;
      if (locked) {
        html += `<div class="lesson-card is-locked" aria-disabled="true">${body}</div>`;
      } else {
        html += `<button type="button" class="kb-btn lesson-card" data-kb-index="${kbIdx++}" onclick="goLesson('${l.id}')">${body}</button>`;
      }
    });
    html += `</div></section>`;
  });
  return html + `</div><p class="hint-footer">↑ ↓ navigate · Enter open · Esc dashboard</p></div>`;
}

function renderSymbolCard(sym) {
  const s = SYMBOLS.find(x => x.symbol === sym);
  if (!s) return '';
  const exWord = s.exampleWordId ? WORDS.find(w => w.id === s.exampleWordId) : null;
  const typeLabel = s.type === 'consonant' ? 'consonant' : s.type === 'vowel' ? (s.role || 'vowel') : s.type;
  const shown = escHtml(displayThaiText(sym));
  return `<div class="panel teach-card space-y-4 anim-card">
    <h3>${s.type === 'vowel' ? 'Thai vowel' : s.type === 'consonant' ? 'Thai letter' : 'Thai ' + s.type}: ${thaiGlyph(sym, 'thai-glyph-title')}</h3>
    <div class="symbol-duo anim-stagger-tight">
      <div class="symbol-card"><p class="symbol-duo-label">Looped</p><p class="thai-glyph-hero font-thai-looped anim-thai" lang="th">${shown}</p></div>
      <div class="symbol-card"><p class="symbol-duo-label">Modern</p><p class="thai-glyph-hero font-thai-modern anim-thai" lang="th">${shown}</p></div>
    </div>
    <div><span class="text-slate-400">Sound:</span> <strong>${escHtml(s.sound)}</strong></div>
    <div><span class="text-slate-400">Role:</span> <strong>${escHtml(typeLabel)}</strong></div>
    ${s.warning ? `<p class="text-amber-400 text-sm">⚠ ${formatMixedThai(s.warning, 'thai-glyph')}</p>` : ''}
    ${exWord ? `<div><span class="text-slate-400">Example:</span> ${renderWordAllFonts(exWord.thai, 'thai-glyph-pair')}<p class="mt-2"><strong>${exWord.romanizations.join('/')}</strong></p><p class="text-slate-300 mt-1">${exWord.emoji ? `${exWord.emoji} ` : ''}${escHtml(exWord.meaning || '')}</p></div>` : ''}
  </div>`;
}

function renderLessonView() {
  const lesson = LESSONS.find(l => l.id === state.currentLessonId);
  if (!lesson) return '';
  if (!lessonSlides || lessonSlides._lessonId !== lesson.id) {
    lessonSlides = buildLessonSlides(lesson);
    lessonSlideIdx = Math.min(lessonSlideIdx, lessonSlides.length - 1);
  }
  const slide = lessonSlides[lessonSlideIdx];
  const total = lessonSlides.length;
  const known = getKnownBefore(lesson);
  let body = '';
  let stageClass = 'lesson-stage';

  if (slide.type === 'intro') {
    const knownSyms = [...known.consonants, ...known.vowels];
    const newSyms = [...lesson.introduces.consonants, ...lesson.introduces.vowels];
    const newRules = lesson.introduces.rules.join(', ');
    stageClass += ' lesson-stage-wide';
    body = `<div class="slide-body space-y-5 anim-stagger">
      <div>
        <p class="text-slate-400 text-sm uppercase tracking-wide">Lesson overview</p>
        <h1 class="text-3xl font-bold mt-2">${formatMixedThai(lesson.title)}</h1>
        <span class="intro-pill">${lesson.level}${lesson.isBoss ? ' · Boss' : ''}</span>
        <p class="text-slate-400 text-sm mt-3">Every symbol is shown in looped and modern fonts from the start.</p>
      </div>
      <div class="shell-grid" style="grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))">
        <div class="panel panel-quiet">
          <p class="text-slate-400 text-sm">Known before</p>
          <div class="mt-2">${knownSyms.length ? formatSymbolList(knownSyms) : '<p class="text-slate-500">None yet</p>'}</div>
        </div>
        <div class="panel">
          <p class="text-slate-400 text-sm">New today</p>
          <div class="mt-2">${newSyms.length ? formatSymbolList(newSyms) : '<p class="text-slate-500">—</p>'}</div>
          ${newRules ? `<p class="text-slate-400 text-sm mt-3">Rules: ${escHtml(newRules)}</p>` : ''}
        </div>
      </div>
    </div>`;
  } else if (slide.type === 'symbol') {
    body = `<div class="slide-body">${renderSymbolCard(slide.sym)}</div>`;
  } else if (slide.type === 'contrast') {
    stageClass += ' lesson-stage-contrast';
    body = renderContrastSlide(CONFUSING_PAIRS.find(p => p.id === slide.pairId));
  } else if (slide.type === 'teaching') {
    const card = lesson.teachingCards[slide.index];
    stageClass += ' lesson-stage-wide';
    body = `<div class="slide-body"><div class="panel teach-card anim-card">
      <h3>${formatMixedThai(card.title)}</h3>
      <p class="teach-copy">${formatMixedThai(card.body, 'thai-glyph')}</p>
    </div></div>`;
  } else if (slide.type === 'example' || slide.type === 'practice') {
    const w = WORDS.find(x => x.id === slide.wordId);
    const revealed = !!lessonReveal[w.id];
    const animateFlip = !!(animCtx.cardFlip && revealed);
    const kicker = slide.type === 'practice' ? 'Practice' : 'Example';
    const footer = slide.type === 'practice' ? `<div class="mt-2">${masteryDots(w.id)}</div>` : '';
    body = `<div class="slide-body">${renderWordFlipCard(w, {
      revealed,
      animateFlip,
      kicker,
      footerHtml: footer,
    })}</div>`;
  } else if (slide.type === 'test') {
    body = `<div class="slide-body"><div class="panel text-center space-y-6 anim-card">
      <h2 class="text-3xl font-bold m-0">Ready for the test?</h2>
      <p class="text-slate-400">${testPreviewLine(lesson)}</p>
      <button type="button" id="slide-primary-btn" class="kb-btn kb-selected w-full py-5 bg-amber-400 text-slate-950 rounded-2xl font-bold text-xl" onclick="startTestFromLesson()">Start Test (Enter)</button>
    </div></div>`;
  }

  const hint = slide.type === 'test' ? 'Enter start test · ← back'
    : (slide.type === 'practice' || slide.type === 'example') && !lessonReveal[slide.wordId]
      ? 'Enter flip for sound + meaning · → next · ← back · Esc lessons'
      : '→ or Enter next · ← back · Esc lessons';

  const slideAnim = animCtx.slideDir > 0 ? 'anim-slide-forward' : animCtx.slideDir < 0 ? 'anim-slide-back' : 'anim-slide-fade';
  return `<div class="shell-frame lesson-rail anim-screen ${slideAnim}">
    <header class="shell-chrome shell-chrome-compact">
      <button type="button" class="kb-btn text-slate-300 px-2 py-1 rounded-lg" onclick="goScreen('lessons')">← Lessons</button>
      ${renderProgressHeader(lesson, { compact: true })}
      <span class="stat-inline">Slide ${lessonSlideIdx + 1}/${total}</span>
    </header>
    <div class="h-1.5 bg-slate-800 rounded-full anim-progress"><div class="h-1.5 bg-amber-400 rounded-full" style="width:${(lessonSlideIdx + 1) / total * 100}%"></div></div>
    <div class="${stageClass}">${body}</div>
    <p class="hint-footer">${hint}</p>
  </div>`;
}

function renderTest() {
  if (!testSession) return '';
  const testLesson = LESSONS.find(l => l.id === testSession.lessonId);
  const heartsHtml = renderHeartsBar(testSession.heartsTotal ?? 0, testSession.mistakes ?? 0);
  const chromeLesson = testLesson
    ? renderProgressHeader(testLesson, { compact: true })
    : (testSession.isSurvival ? '<span class="stat-inline">Survival</span>' : '');

  if (testSession.dying) {
    const survivalDying = !!testSession.isSurvival;
    navBtnIdx = 0;
    return `<div class="shell-frame death-screen anim-screen" aria-live="assertive">
      <header class="shell-chrome shell-chrome-compact">${chromeLesson}${heartsHtml}</header>
      <div class="death-burst" aria-hidden="true"></div>
      <h1 class="death-title">Out of hearts!</h1>
      ${renderLastFeedback()}
      <p class="death-sub">${survivalDying
        ? 'Three strikes — run over.'
        : `Too many misses to hit ${testSession.isBoss ? '85' : '80'}%.`}</p>
      <p class="death-score">${survivalDying
        ? `Score ${testSession.survivalPoints || 0} · ${testSession.score} correct`
        : `${testSession.score}/${testSession.questions.length} before the wipe`}</p>
      <button type="button" id="primary-action" class="kb-btn kb-selected w-full max-w-md py-4 bg-amber-400 text-slate-950 rounded-2xl font-bold mt-2" data-kb-index="0" onclick="continueAfterDeath()">${survivalDying ? 'See results (Enter)' : 'Try again (Enter)'}</button>
      <p class="hint-footer">Press Enter to continue</p>
    </div>`;
  }

  if (testSession.awaitingResults) {
    navBtnIdx = 0;
    const total = testSession.questions.length;
    const ok = !!testSession.lastFeedback?.correct;
    return `<div class="shell-frame anim-screen" aria-live="polite">
      <header class="shell-chrome shell-chrome-compact test-chrome-bar">
        ${chromeLesson}
        ${heartsHtml}
        <span class="stat-inline">${total}/${total}</span>
      </header>
      <div class="test-stage-block shell-stage text-center">
        ${renderLastFeedback()}
        <p class="text-slate-400">${ok ? 'Nice — last one done.' : 'Last one noted — review it, then see your score.'}</p>
        <p class="text-slate-500 text-sm">Score so far: ${testSession.score}/${total}</p>
        <button type="button" id="primary-action" class="kb-btn kb-selected w-full py-4 bg-amber-400 text-slate-950 rounded-2xl font-bold" data-kb-index="0" onclick="continueToResults()">See results (Enter)</button>
        <p class="hint-footer">Press Enter to continue</p>
      </div>
    </div>`;
  }

  if (testSession.finished) {
    if (testSession.isSurvival) return renderSurvivalResults();
    navBtnIdx = 0;
    const pct = Math.round(testSession.pct*100);
    const next = LESSONS.find(l => l.unlockAfter === testSession.lessonId);
    const nextLabel = testSession.passed && next ? `Next: ${formatMixedThai(next.title)}` : null;
    const resultAnim = testSession.passed ? 'anim-results-pass' : 'anim-results-fail';
    return `<div class="shell-frame anim-screen anim-results ${resultAnim}">
      <header class="shell-chrome shell-chrome-compact test-chrome-bar">
        ${chromeLesson}
        ${heartsHtml}
      </header>
      <div class="test-stage-block shell-stage text-center space-y-4">
        <h1 class="anim-result-item text-3xl font-bold m-0" style="animation-delay:80ms">${testSession.passed?'Passed!':'Keep practicing'}</h1>
        <p class="anim-score text-6xl font-bold ${testSession.passed?'text-emerald-400':'text-rose-400'}" style="animation-delay:140ms">${pct}%</p>
        <p class="anim-result-item text-slate-400" style="animation-delay:220ms">${testSession.score}/${testSession.questions.length} correct · ${testSession.mistakes||0} miss${(testSession.mistakes||0)===1?'':'es'}</p>
        ${testSession.speedBonusTotal ? `<p class="anim-result-item text-amber-300" style="animation-delay:240ms">Speed bonus: +${testSession.speedBonusTotal}</p>` : ''}
        <p class="anim-result-item text-slate-400" style="animation-delay:260ms">${testSession.passed ? (testSession.isBoss?'Boss test cleared!':'Lesson complete!') : `Need ${testSession.isBoss?85:80}% to pass`}</p>
        ${renderTestSummary()}
        ${nextLabel ? `<p class="anim-result-item text-amber-400 text-sm" style="animation-delay:360ms">${nextLabel}</p>` : ''}
        <button type="button" id="primary-action" class="anim-result-item kb-btn kb-selected w-full py-4 bg-amber-400 text-slate-950 rounded-2xl font-bold" style="animation-delay:420ms" data-kb-index="0" onclick="continueAfterTest()">${testSession.passed ? 'Next Lesson (Enter)' : 'Practice Again (Enter)'}</button>
        <button type="button" class="anim-result-item kb-btn w-full py-3 bg-slate-800 rounded-2xl" style="animation-delay:480ms" data-kb-index="1" onclick="testSession=null;goScreen('dashboard')">Dashboard</button>
        <p class="anim-result-item hint-footer" style="animation-delay:520ms">Press Enter to continue · ↑ ↓ navigate</p>
      </div>
    </div>`;
  }
  const q = testSession.questions[testSession.current];
  if (!q) return '';
  const total = testSession.questions.length;
  const cur = testSession.current;

  let content = '';
  const fc = getFontClass(q.font);
  const fb = testSession.lastFeedback;
  const scoreAnim = fb?.correct ? 'anim-score-bump' : fb && !fb.correct ? 'anim-score-dip' : '';
  const thaiHero = (t) =>
    `<p class="thai-glyph-hero text-center mb-4 ${fc} anim-thai" lang="th">${escHtml(displayThaiText(t))}</p>`;

  if (q.type === 'rule') {
    content = `${renderRulePrompt(q.prompt, q.font)}
      ${renderOptionButtons(q.options)}`;
  } else if (q.type === 'build_syllable') {
    content = `${thaiHero(q.word.thai)}
      <p class="text-slate-400 mb-4 anim-reveal whitespace-nowrap" style="animation-delay:70ms">Read this. Type the pronunciation:</p>
      <input id="answer-input" type="text" class="w-full py-4 px-5 bg-slate-800 border-2 border-slate-700 focus:border-amber-400 rounded-2xl text-lg anim-reveal" style="animation-delay:100ms" placeholder="Type pronunciation..." autocomplete="off" autofocus>`;
  } else if (q.type === 'choose_pron') {
    content = `${thaiHero(q.word.thai)}
      <p class="text-slate-400 mb-4 anim-reveal whitespace-nowrap" style="animation-delay:70ms">${q.prompt}</p>
      ${renderOptionButtons(q.options)}`;
  } else {
    content = `${thaiHero(q.word.thai)}
      <p class="text-slate-400 mb-4 anim-reveal whitespace-nowrap" style="animation-delay:70ms">${q.prompt}</p>
      <input id="answer-input" type="text" class="w-full py-4 px-5 bg-slate-800 border-2 border-slate-700 focus:border-amber-400 rounded-2xl text-lg anim-reveal" style="animation-delay:100ms" placeholder="Type pronunciation..." autocomplete="off" autofocus>`;
  }

  return `<div class="shell-frame" id="test-question">
    <header class="shell-chrome shell-chrome-compact test-chrome-bar">
      ${chromeLesson}
      <span class="stat-inline whitespace-nowrap">${testSession.isSurvival ? `Q ${cur + 1}` : `${cur + 1}/${total}`}</span>
      ${heartsHtml}
      <span class="stat-inline ${scoreAnim}">${testSession.isSurvival
        ? `Pts ${testSession.survivalPoints || 0}`
        : `Score ${testSession.score}`}</span>
      <span class="stat-inline" aria-live="off"><span id="q-timer">0.0</span>s</span>
    </header>
    <div class="h-1.5 bg-slate-800 rounded-full anim-progress"><div class="h-1.5 bg-amber-400 rounded-full" style="width:${cur/total*100}%"></div></div>
    <div class="test-stage-block shell-stage">
      ${renderLastFeedback()}
      <div class="anim-test-content">${content}</div>
      <p class="hint-footer anim-reveal" style="animation-delay:180ms">${getTestHint(q)}</p>
    </div>
  </div>`;
}

function renderReview() {
  pruneUntaughtProgressWords();
  const known = getProgressKnown();
  const weak = state.weakWords.filter(w => {
    const word = WORDS.find(x => x.id === w.id);
    return word && wordIsKnown(word, known);
  });
  const cur = LESSONS.find(l => l.id === state.currentLessonId) || LESSONS[0];
  return `<div class="shell-frame anim-screen">
    <header class="shell-chrome shell-chrome-compact">
      <button type="button" class="kb-btn text-slate-300 text-sm px-2 py-1 rounded-lg" onclick="goScreen('dashboard')">← Dashboard</button>
      <h1 class="text-lg font-bold m-0">Weak Words</h1>
      ${renderProgressHeader(cur, { compact: true })}
      <span class="stat-inline">${weak.length} words</span>
    </header>
    <div class="shell-stage shell-stage-wide space-y-4">
      <button type="button" class="kb-btn kb-selected w-full py-4 bg-amber-400 text-slate-950 rounded-2xl font-bold" data-kb-index="0" onclick="startReview()">Start Review (Enter)</button>
      <div class="shell-grid shell-grid-lessons">
        ${weak.slice(0, 20).map(w => {
          const word = WORDS.find(x => x.id === w.id);
          return word ? `<div class="panel space-y-2 anim-card">
            ${renderWordAllFonts(word.thai, 'thai-glyph-pair')}
            <div class="flex justify-end">
              <button type="button" class="kb-btn text-xs px-2 py-1 bg-slate-800 rounded-lg text-emerald-400" onclick="markWordKnown('${w.id}')">Mark known</button>
            </div></div>` : '';
        }).join('')}
      </div>
      <p class="hint-footer">↑ ↓ navigate · Enter select · Esc dashboard</p>
    </div>
  </div>`;
}

function handleNavKey(e) {
  const btns = getKbButtons();
  if (!btns.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); focusKbButton(navBtnIdx + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); focusKbButton(navBtnIdx - 1); }
  else if (e.key === 'Enter') { e.preventDefault(); btns[navBtnIdx]?.click(); }
  else if (e.key === 'Escape' && currentScreen !== 'dashboard') { e.preventDefault(); goScreen('dashboard'); }
}

function handleLessonKey(e) {
  if (!lessonSlides || !lessonSlides.length) return;
  const slide = lessonSlides[lessonSlideIdx];
  if (e.key === 'Escape') { e.preventDefault(); goScreen('lessons'); return; }
  if (slide.type === 'test') {
    if (e.key === 'Enter') { e.preventDefault(); startTestFromLesson(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); lessonPrevSlide(); }
    return;
  }
  if ((slide.type === 'practice' || slide.type === 'example') && !lessonReveal[slide.wordId]) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      ChipAudio.uiReveal();
      animCtx.cardFlip = true;
      lessonReveal[slide.wordId] = true;
      render();
    }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); lessonPrevSlide(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); /* stay until flipped */ }
    return;
  }
  if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); lessonNextSlide(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); lessonPrevSlide(); }
}

function handleTestKey(e) {
  if (!testSession) return;
  if (testSession.dying) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      continueAfterDeath();
    }
    return;
  }
  if (testSession.awaitingResults) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      continueToResults();
    }
    return;
  }
  if (testSession.finished) {
    const btns = getKbButtons();
    if (e.key === 'ArrowDown') { e.preventDefault(); focusKbButton(navBtnIdx + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusKbButton(navBtnIdx - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); btns[navBtnIdx]?.click(); }
    return;
  }
  const inp = document.getElementById('answer-input');
  const opts = getTestOptions();
  if (inp && document.activeElement === inp) {
    if (e.key === 'Enter') { e.preventDefault(); submitAnswer(inp.value); }
    return;
  }
  if (!opts.length) return;
  // Tab moves browser focus without updating selection, so Enter submits the wrong answer.
  if (e.key === 'Tab') {
    e.preventDefault();
    highlightOption(selectedOptionIdx, { wrap: false });
    return;
  }
  let handled = false;
  if (opts.length === 4) {
    if (e.key === 'ArrowRight') { e.preventDefault(); highlightOptionGrid(0, +1); handled = true; }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); highlightOptionGrid(0, -1); handled = true; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); highlightOptionGrid(+1, 0); handled = true; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlightOptionGrid(-1, 0); handled = true; }
  } else {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); highlightOption(selectedOptionIdx + 1, { wrap: false }); handled = true; }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); highlightOption(selectedOptionIdx - 1, { wrap: false }); handled = true; }
  }
  if (handled) return;
  if (e.key === 'Enter') { e.preventDefault(); submitSelectedOption(); }
  else if (e.key >= '1' && e.key <= '9') {
    const idx = parseInt(e.key, 10) - 1;
    if (idx < opts.length) { e.preventDefault(); highlightOption(idx, { wrap: false }); submitSelectedOption(); }
  }
}

function attachKeyboard() {
  document.onkeydown = e => {
    if (currentScreen === 'test') return handleTestKey(e);
    if (currentScreen === 'lesson') return handleLessonKey(e);
    if (['dashboard','lessons','review'].includes(currentScreen)) return handleNavKey(e);
  };
}

/** Seed curriculum progress through (not including) a lesson id — for demos/screenshots. */
function seedProgressBefore(lessonId) {
  const lesson = LESSONS.find(l => l.id === lessonId) || LESSONS[0];
  const completed = LESSONS.filter(l => l.order < lesson.order).map(l => l.id);
  const unlocked = LESSONS.filter(l => l.order <= lesson.order).map(l => l.id);
  const next = LESSONS.find(l => l.unlockAfter === lesson.id);
  if (next && !unlocked.includes(next.id)) unlocked.push(next.id);
  state = {
    ...defaultState(),
    completedLessons: completed,
    unlockedLessons: unlocked.length ? unlocked : ['basic-1'],
    currentLessonId: lesson.id,
    streak: 4,
    totalScore: 860,
    survivalBest: 128,
    survivalScores: [
      { score: 128, date: '2026-07-14T12:00:00.000Z' },
      { score: 96, date: '2026-07-12T18:30:00.000Z' },
      { score: 74, date: '2026-07-10T09:15:00.000Z' },
    ],
    lessonScores: Object.fromEntries(completed.map(id => [id, 85 + (id.length % 10)])),
    totalAttempts: 120,
    correctAttempts: 98,
  };
}

function demoQuizSession(opts = {}) {
  const word = WORDS.find(w => w.id === (opts.wordId || 'maa')) || WORDS[0];
  const q = {
    type: opts.type || 'type_roman',
    word,
    font: opts.font || 'looped',
    prompt: 'Read this. Type the pronunciation:',
  };
  return {
    lessonId: opts.lessonId || 'basic-1',
    isBoss: false,
    isSurvival: !!opts.isSurvival,
    questions: [q, q, q],
    current: opts.current != null ? opts.current : 1,
    score: opts.score != null ? opts.score : 2,
    survivalPoints: opts.survivalPoints || 0,
    mistakes: opts.mistakes != null ? opts.mistakes : 0,
    heartsTotal: opts.heartsTotal != null ? opts.heartsTotal : 3,
    answers: opts.answers || [],
    lastFeedback: opts.lastFeedback || null,
    finished: !!opts.finished,
    passed: !!opts.passed,
    died: !!opts.died,
    dying: !!opts.dying,
    awaitingResults: !!opts.awaitingResults,
    wordPool: [word],
    usedKeys: new Set(),
  };
}

/**
 * Demo scenes for README screenshots / QA.
 * Open with ?demo=dashboard|lesson|quiz|feedback|death|survival
 * Demo mode does not write localStorage.
 */
function applyDemoFromQuery() {
  let params;
  try { params = new URLSearchParams(location.search); } catch (e) { return; }
  const scene = (params.get('demo') || '').toLowerCase();
  if (!scene) return;

  DEMO_MODE = true;
  try { ChipAudio.setMuted(true); } catch (e) {}

  if (scene === 'dashboard') {
    seedProgressBefore('medium-1');
    currentScreen = 'dashboard';
    testSession = null;
    return;
  }

  if (scene === 'lesson') {
    seedProgressBefore('basic-1');
    state.currentLessonId = 'basic-1';
    currentScreen = 'lesson';
    lessonSlideIdx = 0;
    lessonSlides = null;
    lessonReveal = {};
    testSession = null;
    return;
  }

  if (scene === 'quiz') {
    seedProgressBefore('basic-6');
    currentScreen = 'test';
    testSession = demoQuizSession({
      wordId: 'baa',
      lessonId: 'basic-6',
      current: 0,
      score: 4,
      mistakes: 1,
      heartsTotal: 3,
      lastFeedback: null,
    });
    return;
  }

  if (scene === 'feedback') {
    seedProgressBefore('basic-9');
    const word = WORDS.find(w => w.id === 'le') || WORDS[0];
    const q = { type: 'type_roman', word, font: 'looped', prompt: 'Read this. Type the pronunciation:' };
    currentScreen = 'test';
    testSession = demoQuizSession({
      wordId: 'be',
      lessonId: 'basic-9',
      current: 1,
      score: 3,
      mistakes: 1,
      heartsTotal: 3,
      lastFeedback: { q, answer: 'lea', correct: false, font: 'looped' },
    });
    return;
  }

  if (scene === 'death') {
    seedProgressBefore('basic-6');
    const word = WORDS.find(w => w.id === 'be') || WORDS[0];
    const q = { type: 'type_roman', word, font: 'looped', prompt: 'Read this. Type the pronunciation:' };
    currentScreen = 'test';
    testSession = demoQuizSession({
      wordId: 'be',
      lessonId: 'basic-6',
      current: 5,
      score: 2,
      mistakes: 3,
      heartsTotal: 3,
      dying: true,
      died: true,
      lastFeedback: { q, answer: 'bea', correct: false, font: 'looped' },
    });
    return;
  }

  if (scene === 'survival') {
    seedProgressBefore('medium-3');
    currentScreen = 'test';
    testSession = demoQuizSession({
      wordId: 'gin',
      isSurvival: true,
      current: 0,
      score: 18,
      survivalPoints: 96,
      mistakes: 1,
      heartsTotal: 3,
      lastFeedback: null,
    });
    return;
  }

  // Unknown scene → still mute + no persist, show dashboard
  seedProgressBefore('basic-3');
  currentScreen = 'dashboard';
  testSession = null;
}

applyDemoFromQuery();
attachKeyboard();

async function bootstrap() {
  if (window.CloudSync) {
    CloudSync.addListener(() => {
      if (currentScreen === 'dashboard' && document.getElementById('app')) render();
    });
    await CloudSync.init({
      storageKey: STORAGE_KEY,
      getDefaultState: defaultState,
      onStateMerged: merged => { state = merged; },
    });
  }
  pruneUntaughtProgressWords();
  if (document.getElementById('app')) render();
}

bootstrap();
