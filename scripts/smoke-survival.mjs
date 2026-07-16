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
    testStart() {}, testCorrect() {}, testWrong() {}, testDeath() {}, testPass() {}, testFail() {},
    lessonUnlock() {},
    uiSelect() {}, uiSlide() {}, uiReveal() {},
    isMuted: () => false, getVolume: () => 0.5, setVolume() {}, setMuted() {}, toggleMute() {},
  },
  requestAnimationFrame: fn => fn(),
  setTimeout: fn => fn(),
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(
  dataCode + '\n' + appCode.replace(/\n(?:render|bootstrap)\(\);\s*$/, '\n') + `
  globalThis.__TRQ = {
    WORDS, LESSONS, survivalPointsForWord, recordSurvivalScore, defaultState,
    getSurvivalWordPool, generateSurvivalQuestions, SURVIVAL_TOP_N, SURVIVAL_HEARTS,
    submitAnswer, continueToResults, finishTest, holdLastAnswerBeforeResults,
    displayThaiText, formatMixedThai,
    get state() { return state; },
    set state(v) { state = v; },
    get testSession() { return testSession; },
    set testSession(v) { testSession = v; },
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

// Last answer must hold feedback before summary (not jump straight to finished)
{
  const word = WORDS.find(w => w.id === 'maa') || WORDS[0];
  const q = {
    type: 'type_roman',
    word,
    font: 'looped',
    prompt: 'Read this. Type the pronunciation:',
  };
  sandbox.__TRQ.testSession = {
    lessonId: 'basic-1',
    isBoss: false,
    questions: [q],
    current: 0,
    score: 0,
    mistakes: 0,
    heartsTotal: 1,
    answers: [],
    lastFeedback: null,
    finished: false,
    passed: false,
    died: false,
    dying: false,
    awaitingResults: false,
  };
  sandbox.__TRQ.submitAnswer(word.romanizations[0]);
  const sess = sandbox.__TRQ.testSession;
  console.assert(sess.awaitingResults === true, 'last answer holds feedback');
  console.assert(sess.finished === false, 'summary not yet shown');
  console.assert(sess.lastFeedback && sess.lastFeedback.correct === true, 'last feedback recorded');
  sandbox.__TRQ.continueToResults();
  console.assert(sess.awaitingResults === false, 'hold cleared');
  console.assert(sess.finished === true, 'results after continue');
}

// Thai display: carriers for combining marks + hyphen placeholders
{
  const { displayThaiText, formatMixedThai } = sandbox.__TRQ;
  const C = '\u25CC';
  console.assert(displayThaiText('่') === C + '่', 'tone mark gets carrier');
  console.assert(displayThaiText('้') === C + '้', 'mai tho gets carrier');
  console.assert(displayThaiText('์') === C + '์', 'garan gets carrier');
  console.assert(displayThaiText('เ-') === 'เ' + C, 'leading e uses carrier slot');
  console.assert(displayThaiText('เ-อ') === 'เ' + C + 'อ', 'oe pattern uses carrier');
  console.assert(displayThaiText('มาก') === 'มาก', 'full words unchanged');
  const mixed = formatMixedThai('Vowel before consonant: เ-');
  console.assert(mixed.includes(C), 'mixed title uses carrier for เ-');
  console.assert(mixed.includes('thai-glyph'), 'mixed title wraps thai glyph');
}

console.log('OK — survival scoring + state shape');
console.log({ pGaa, pMaak, pLong, pool: pool.length, qs: qs.length, best: sandbox.__TRQ.state.survivalBest });
