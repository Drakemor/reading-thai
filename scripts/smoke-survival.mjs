/**
 * Smoke test: survival scoring + state shape (no browser DOM).
 * Run: node scripts/smoke-survival.mjs
 */
import fs from 'fs';
import vm from 'vm';
import { pathToFileURL } from 'url';

const root = new URL('..', import.meta.url);
const dataCode = fs.readFileSync(new URL('js/data.js', root), 'utf8');
const appCode = fs.readFileSync(new URL('js/app.js', root), 'utf8');

// Minimal stubs for browser bits referenced at load time
const sandbox = {
  console,
  localStorage: (() => {
    const m = new Map();
    return {
      getItem: k => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: k => m.delete(k),
    };
  })(),
  document: {
    getElementById: () => null,
    body: { classList: { add() {}, remove() {} }, offsetWidth: 0 },
    onkeydown: null,
  },
  window: {},
  alert: () => {},
  ChipAudio: {
    testStart() {}, testCorrect() {}, testWrong() {}, testDeath() {}, testPass() {},
    uiSelect() {}, uiSlide() {}, uiReveal() {},
    isMuted: () => false, getVolume: () => 0.5, setVolume() {}, setMuted() {},
  },
  requestAnimationFrame: fn => fn(),
  setTimeout: fn => fn(),
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(
  dataCode + '\n' + appCode.replace(/\nrender\(\);\s*$/, '\n') + `
  globalThis.__TRQ = {
    WORDS, LESSONS, survivalPointsForWord, recordSurvivalScore, defaultState,
    getSurvivalWordPool, generateSurvivalQuestions, SURVIVAL_TOP_N, SURVIVAL_HEARTS,
    get state() { return state; },
    set state(v) { state = v; },
  };
`,
  sandbox
);

const {
  WORDS, survivalPointsForWord, recordSurvivalScore, defaultState,
  getSurvivalWordPool, generateSurvivalQuestions, SURVIVAL_TOP_N, SURVIVAL_HEARTS,
} = sandbox.__TRQ;

// Force fresh state
sandbox.__TRQ.state = { ...defaultState() };

const gaa = WORDS.find(w => w.id === 'gaa');
const maak = WORDS.find(w => w.id === 'maak');
const sawasdee = WORDS.find(w => w.id === 'sawasdee');

const pGaa = survivalPointsForWord(gaa);
const pMaak = survivalPointsForWord(maak);
const pLong = survivalPointsForWord(sawasdee);

console.assert(pGaa >= 1, 'gaa points');
console.assert(pMaak > pGaa, `longer maak (${pMaak}) should score more than gaa (${pGaa})`);
console.assert(pLong > pMaak, `สวัสดี (${pLong}) should score more than มาก (${pMaak})`);

const pool = getSurvivalWordPool();
console.assert(pool.length >= 2, 'fallback pool size');
const used = new Set();
const qs = generateSurvivalQuestions(pool, 8, 0, used);
console.assert(qs.length >= 4, 'generated survival questions ' + qs.length);
console.assert(qs.every(q => q.word && q.type), 'question shape');

recordSurvivalScore(12);
recordSurvivalScore(40);
recordSurvivalScore(25);
console.assert(sandbox.__TRQ.state.survivalBest === 40, 'best score');
console.assert(sandbox.__TRQ.state.survivalScores.length === 3, 'history length');
console.assert(sandbox.__TRQ.state.survivalScores[0].score === 40, 'sorted desc');
console.assert(sandbox.__TRQ.state.survivalScores[0].date.includes('T'), 'ISO date');

// Cap at top N
for (let i = 0; i < 20; i++) recordSurvivalScore(i);
console.assert(sandbox.__TRQ.state.survivalScores.length === SURVIVAL_TOP_N, 'top N cap');
console.assert(SURVIVAL_HEARTS === 3, '3 hearts');

const filler = WORDS.filter(w => /\(syllable\)|\(particle\)/.test(w.meaning || ''));
console.assert(filler.length === 0, 'no syllable fillers: ' + filler.map(w => w.id).join(','));
const noEmoji = WORDS.filter(w => !w.emoji);
console.assert(noEmoji.length === 0, 'all words have emoji');

console.log('OK — survival scoring + state shape');
console.log({ pGaa, pMaak, pLong, pool: pool.length, qs: qs.length, best: sandbox.__TRQ.state.survivalBest });
