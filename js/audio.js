// Thai Reading Quest — 8-bit chip synth
// Tone of Asteroids (arcade beeps), Boulder Dash (sparkle / dig), Prince of Persia (fanfare / sting)
const AUDIO_STORAGE_KEY = 'thaiReadingQuestAudio';

const ChipAudio = (() => {
  let ctx = null;
  let master = null;
  let volume = 0.75;
  let muted = false;

  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(AUDIO_STORAGE_KEY) || '{}');
      if (typeof p.volume === 'number') volume = Math.max(0, Math.min(1, p.volume));
      if (typeof p.muted === 'boolean') muted = p.muted;
    } catch (_) {}
  }

  function savePrefs() {
    localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify({ volume, muted }));
  }

  function applyMasterGain() {
    if (!master || !ctx) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(muted ? 0 : volume, ctx.currentTime);
  }

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.connect(ctx.destination);
      applyMasterGain();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    ensure();
    applyMasterGain();
    savePrefs();
  }

  function setMuted(m) {
    muted = !!m;
    ensure();
    applyMasterGain();
    savePrefs();
  }

  function toggleMute() {
    setMuted(!muted);
    return muted;
  }

  function getVolume() { return volume; }
  function isMuted() { return muted; }

  function tone({ freq = 440, dur = 0.08, type = 'square', amp = 0.7, slideTo = null, delay = 0, duty = null }) {
    const c = ensure();
    if (!c || !master || muted || volume <= 0) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    // pulse via periodic wave when duty given (Prince / NES-ish thin pulse)
    if (duty != null && duty > 0 && duty < 1) {
      const n = 32;
      const real = new Float32Array(n);
      const imag = new Float32Array(n);
      for (let i = 1; i < n; i++) {
        imag[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
      }
      osc.setPeriodicWave(c.createPeriodicWave(real, imag));
    } else {
      osc.type = type;
    }
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + Math.max(dur, 0.02));
    }
    const attack = Math.min(0.01, dur * 0.15);
    const peak = Math.max(0.05, Math.min(1, amp));
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.linearRampToValueAtTime(peak * 0.9, t0 + dur * 0.45);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function noise({ dur = 0.06, amp = 0.35, delay = 0, band = null }) {
    const c = ensure();
    if (!c || !master || muted || volume <= 0) return;
    const t0 = c.currentTime + delay;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    let node = src;
    if (band) {
      const f = c.createBiquadFilter();
      f.type = band.type || 'bandpass';
      f.frequency.value = band.freq || 1200;
      f.Q.value = band.q || 1.2;
      src.connect(f);
      node = f;
    }
    const g = c.createGain();
    g.gain.setValueAtTime(amp, t0);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    node.connect(g);
    g.connect(master);
    src.start(t0);
  }

  function seq(notes) {
    notes.forEach(n => tone(n));
  }

  // Asteroids-style UI blip
  function uiSelect() {
    tone({ freq: 1200, dur: 0.04, type: 'square', amp: 0.5, slideTo: 1800 });
    noise({ dur: 0.025, amp: 0.12, delay: 0, band: { type: 'highpass', freq: 3000, q: 0.7 } });
  }

  // Short double-confirm (coin / menu)
  function uiConfirm() {
    seq([
      { freq: 660, dur: 0.05, type: 'square', amp: 0.65, duty: 0.25 },
      { freq: 990, dur: 0.08, type: 'square', amp: 0.7, duty: 0.25, delay: 0.045 },
    ]);
  }

  // Soft cursor tick
  function uiNav() {
    tone({ freq: 520, dur: 0.028, type: 'square', amp: 0.38, duty: 0.125 });
  }

  // Boulder Dash diamond sparkle
  function uiReveal() {
    seq([
      { freq: 880, dur: 0.05, type: 'triangle', amp: 0.7 },
      { freq: 1175, dur: 0.05, type: 'triangle', amp: 0.75, delay: 0.04 },
      { freq: 1480, dur: 0.05, type: 'triangle', amp: 0.8, delay: 0.08 },
      { freq: 1976, dur: 0.12, type: 'triangle', amp: 0.85, delay: 0.12 },
      { freq: 2637, dur: 0.16, type: 'square', amp: 0.45, duty: 0.125, delay: 0.2 },
    ]);
  }

  // Dig / sand sift (Boulder Dash)
  function uiSlide() {
    noise({ dur: 0.07, amp: 0.28, band: { type: 'bandpass', freq: 900, q: 0.8 } });
    tone({ freq: 180, dur: 0.08, type: 'sawtooth', amp: 0.22, slideTo: 90, delay: 0.01 });
  }

  // Asteroids ship fire / success blip chain
  function testCorrect() {
    // zip up like a clean shot + sparkle
    tone({ freq: 420, dur: 0.06, type: 'square', amp: 0.7, slideTo: 840 });
    seq([
      { freq: 880, dur: 0.06, type: 'square', amp: 0.75, duty: 0.5, delay: 0.06 },
      { freq: 1175, dur: 0.06, type: 'square', amp: 0.78, duty: 0.5, delay: 0.11 },
      { freq: 1568, dur: 0.1, type: 'square', amp: 0.82, duty: 0.25, delay: 0.16 },
      { freq: 2093, dur: 0.14, type: 'triangle', amp: 0.7, delay: 0.24 },
    ]);
  }

  // Asteroids debris / fail thud
  function testWrong() {
    tone({ freq: 220, dur: 0.1, type: 'sawtooth', amp: 0.65, slideTo: 70 });
    tone({ freq: 110, dur: 0.18, type: 'square', amp: 0.75, slideTo: 55, delay: 0.05 });
    noise({ dur: 0.14, amp: 0.45, delay: 0.02, band: { type: 'lowpass', freq: 800, q: 0.6 } });
    noise({ dur: 0.08, amp: 0.25, delay: 0.08, band: { type: 'highpass', freq: 2000, q: 0.5 } });
  }

  // Level fanfare start (PoP / arcade)
  function testStart() {
    seq([
      { freq: 392, dur: 0.1, type: 'square', amp: 0.72, duty: 0.5 },
      { freq: 392, dur: 0.08, type: 'square', amp: 0.55, duty: 0.5, delay: 0.1 },
      { freq: 523.25, dur: 0.1, type: 'square', amp: 0.78, duty: 0.5, delay: 0.18 },
      { freq: 659.25, dur: 0.12, type: 'square', amp: 0.82, duty: 0.25, delay: 0.28 },
      { freq: 784, dur: 0.22, type: 'square', amp: 0.88, duty: 0.25, delay: 0.4 },
      // harmony bed
      { freq: 261.63, dur: 0.35, type: 'triangle', amp: 0.35, delay: 0.28 },
    ]);
  }

  // Prince of Persia victory / oasis fanfare
  function testPass() {
    const melody = [
      [523.25, 0], [659.25, 0.1], [783.99, 0.2], [1046.5, 0.32],
      [987.77, 0.5], [880, 0.6], [1046.5, 0.72], [1318.5, 0.9],
    ];
    melody.forEach(([f, d], i) => {
      tone({ freq: f, dur: i === melody.length - 1 ? 0.32 : 0.12, type: 'square', amp: 0.8, duty: 0.25, delay: d });
      tone({ freq: f / 2, dur: i === melody.length - 1 ? 0.32 : 0.12, type: 'triangle', amp: 0.35, delay: d });
    });
    // sparkling diamonds on the finish
    seq([
      { freq: 1568, dur: 0.08, type: 'triangle', amp: 0.55, delay: 1.1 },
      { freq: 2093, dur: 0.1, type: 'triangle', amp: 0.5, delay: 1.18 },
      { freq: 2637, dur: 0.18, type: 'square', amp: 0.4, duty: 0.125, delay: 1.26 },
    ]);
  }

  // Dramatic death sting (PoP / arcade) — end-of-test fail
  function testFail() {
    seq([
      { freq: 466.16, dur: 0.14, type: 'square', amp: 0.8, duty: 0.5 },
      { freq: 440, dur: 0.14, type: 'square', amp: 0.78, duty: 0.5, delay: 0.14 },
      { freq: 369.99, dur: 0.16, type: 'square', amp: 0.8, duty: 0.25, delay: 0.28 },
      { freq: 277.18, dur: 0.35, type: 'sawtooth', amp: 0.7, slideTo: 140, delay: 0.44 },
    ]);
    tone({ freq: 110, dur: 0.4, type: 'square', amp: 0.55, delay: 0.5 });
    noise({ dur: 0.25, amp: 0.35, delay: 0.55, band: { type: 'lowpass', freq: 500, q: 0.5 } });
  }

  /** Mid-test out-of-hearts death — longer, heavier, more chaotic than testFail. */
  function testDeath() {
    // Alarm chirps
    seq([
      { freq: 880, dur: 0.07, type: 'square', amp: 0.85, duty: 0.5 },
      { freq: 660, dur: 0.07, type: 'square', amp: 0.85, duty: 0.5, delay: 0.08 },
      { freq: 880, dur: 0.07, type: 'square', amp: 0.9, duty: 0.5, delay: 0.16 },
      { freq: 520, dur: 0.09, type: 'square', amp: 0.9, duty: 0.25, delay: 0.24 },
    ]);
    // Falling death slide
    tone({ freq: 392, dur: 0.55, type: 'sawtooth', amp: 0.85, slideTo: 55, delay: 0.32 });
    tone({ freq: 196, dur: 0.65, type: 'square', amp: 0.7, slideTo: 40, delay: 0.38 });
    tone({ freq: 98, dur: 0.7, type: 'triangle', amp: 0.55, slideTo: 40, delay: 0.45 });
    // Explosion debris
    noise({ dur: 0.35, amp: 0.55, delay: 0.5, band: { type: 'lowpass', freq: 700, q: 0.45 } });
    noise({ dur: 0.22, amp: 0.4, delay: 0.62, band: { type: 'highpass', freq: 1800, q: 0.6 } });
    noise({ dur: 0.4, amp: 0.3, delay: 0.75, band: { type: 'bandpass', freq: 300, q: 0.4 } });
    // Final thud
    tone({ freq: 70, dur: 0.35, type: 'square', amp: 0.9, delay: 0.85 });
  }

  // Treasure / door unlock (PoP + Boulder Dash gems)
  function lessonUnlock() {
    seq([
      { freq: 523.25, dur: 0.08, type: 'square', amp: 0.72, duty: 0.25 },
      { freq: 659.25, dur: 0.08, type: 'square', amp: 0.75, duty: 0.25, delay: 0.07 },
      { freq: 783.99, dur: 0.08, type: 'square', amp: 0.78, duty: 0.25, delay: 0.14 },
      { freq: 1046.5, dur: 0.1, type: 'square', amp: 0.82, duty: 0.125, delay: 0.22 },
      { freq: 1318.5, dur: 0.12, type: 'triangle', amp: 0.75, delay: 0.3 },
      { freq: 1568, dur: 0.2, type: 'triangle', amp: 0.8, delay: 0.4 },
    ]);
    // gem ping trail
    seq([
      { freq: 2093, dur: 0.1, type: 'square', amp: 0.4, duty: 0.125, delay: 0.55 },
      { freq: 2794, dur: 0.18, type: 'triangle', amp: 0.45, delay: 0.65 },
    ]);
  }

  loadPrefs();

  ['pointerdown', 'keydown'].forEach(ev => {
    window.addEventListener(ev, () => ensure(), { once: true, passive: true });
  });

  return {
    ensure, setVolume, setMuted, toggleMute, getVolume, isMuted,
    uiSelect, uiConfirm, uiNav, uiReveal, uiSlide,
    testCorrect, testWrong, testStart, testPass, testFail, testDeath, lessonUnlock,
  };
})();
