/**
 * Smoke test: survival scoring + state shape (no browser DOM).
 * Run: node scripts/smoke-survival.mjs
 */
import fs from 'fs';
import vm from 'vm';
import { pathToFileURL } from 'url';

const root = new URL('..', import.meta.url);
const dataCode = fs.readFileSync(new URL('js/data.js', root), 'utf8');
const wordSpecCode = fs.readFileSync(new URL('js/word-spec.js', root), 'utf8');
const readingCode = fs.readFileSync(new URL('js/reading-analysis.js', root), 'utf8');
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
    addEventListener() {},
    documentElement: { style: { setProperty() {} } },
    body: { classList: { add() {}, remove() {}, toggle() {} }, offsetWidth: 0 },
    onkeydown: null,
  },
  window: { addEventListener() {}, visualViewport: null },
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
  dataCode + '\n' + readingCode + '\n' + wordSpecCode + '\n' +
  appCode.replace(/\napplyDemoFromQuery\(\);[\s\S]*$/, '\n') + `
  globalThis.__TRQ = {
    WORDS, LESSONS, survivalPointsForWord, recordSurvivalScore, defaultState,
    getSurvivalWordPool, generateSurvivalQuestions, SURVIVAL_TOP_N, SURVIVAL_HEARTS,
    submitAnswer, continueToResults, finishTest, holdLastAnswerBeforeResults,
    displayThaiText, formatMixedThai,
    wordIsKnown, getKnownBefore, wordNeedsFinalSoundMap, wordNeedsMaiHanAkat, wordNeedsWVowelUa,
    wordNeedsLeadingH, migrateCurriculumState, buildTestKnown,
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

function seedCompletedBefore(lessonId) {
  const target = sandbox.__TRQ.LESSONS.find(l => l.id === lessonId);
  const done = sandbox.__TRQ.LESSONS.filter(l => l.order < target.order).map(l => l.id);
  sandbox.__TRQ.state = {
    ...defaultState(),
    completedLessons: done,
    unlockedLessons: [...done, lessonId],
    currentLessonId: lessonId,
  };
}

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

// Final ร/ล → n must stay gated until medium-9 final-sound-map
{
  const { WORDS, LESSONS, wordIsKnown, getKnownBefore, wordNeedsFinalSoundMap } = sandbox.__TRQ;
  const we = WORDS.find(w => w.id === 'we');
  const ni = WORDS.find(w => w.id === 'ni');
  const maak = WORDS.find(w => w.id === 'maak');
  const m9 = LESSONS.find(l => l.id === 'medium-9');
  const a1 = LESSONS.find(l => l.id === 'advanced-1');
  seedCompletedBefore('medium-9');
  const before = getKnownBefore(m9);
  console.assert(wordNeedsFinalSoundMap(we), 'เวร needs final-sound-map');
  console.assert(wordNeedsFinalSoundMap(ni), 'นิล needs final-sound-map');
  console.assert(!wordNeedsFinalSoundMap(maak), 'มาก does not need final-sound-map');
  console.assert(!wordIsKnown(we, before), 'เวร blocked before medium-9');
  console.assert(!wordIsKnown(ni, before), 'นิล blocked before medium-9');
  console.assert(wordIsKnown(maak, before), 'มาก allowed before medium-9');
  console.assert(m9.introduces.rules.includes('final-sound-map'), 'medium-9 teaches final-sound-map');
  console.assert(/ร\/ล/.test(m9.teachingCards.map(c => c.body).join(' ')), 'medium-9 teaches final ร/ล → n');
  console.assert(/เวร/.test(a1.teachingCards.map(c => c.body).join(' ')), 'advanced-1 reminds final ร → n with เวร');
  console.assert(a1.practiceWordIds.includes('we'), 'advanced-1 practices เวร before its test');
}

// Old lesson 21 split: consonants first, then ถ/ผ/ฝ, then leading-ห + ั
{
  const { WORDS, LESSONS, wordIsKnown, getKnownBefore, wordNeedsMaiHanAkat, wordNeedsLeadingH, buildTestKnown, migrateCurriculumState, defaultState } = sandbox.__TRQ;
  const a1 = LESSONS.find(l => l.id === 'advanced-1');
  const a1b = LESSONS.find(l => l.id === 'advanced-1b');
  const a1c = LESSONS.find(l => l.id === 'advanced-1c');
  const a2 = LESSONS.find(l => l.id === 'advanced-2');
  console.assert(a1 && a1b && a1c, 'advanced-1 split into three lessons');
  console.assert(a1b.unlockAfter === 'advanced-1', '1b unlocks after 1');
  console.assert(a1c.unlockAfter === 'advanced-1b', '1c unlocks after 1b');
  console.assert(a2.unlockAfter === 'advanced-1c', 'advanced-2 unlocks after 1c');
  console.assert(a1.introduces.consonants.join('') === 'ขสฟซ', 'advanced-1 teaches ข ส ฟ ซ');
  console.assert(!a1.introduces.vowels.includes('ั'), 'advanced-1 does not teach ั');
  console.assert(!a1.introduces.rules.includes('leading-h'), 'advanced-1 does not teach leading-h');
  console.assert(a1b.introduces.consonants.join('') === 'ถผฝ', 'advanced-1b teaches ถ ผ ฝ');
  console.assert(a1c.introduces.vowels.includes('ั'), 'advanced-1c teaches ั');
  console.assert(a1c.introduces.rules.includes('leading-h'), 'advanced-1c teaches leading-h');

  const fan = WORDS.find(w => w.id === 'fan');
  const fuu = WORDS.find(w => w.id === 'fuu');
  const muu = WORDS.find(w => w.id === 'muu');
  const sawasdee = WORDS.find(w => w.id === 'sawasdee');
  console.assert(fan.lessonId === 'advanced-1c', 'ฟัน lives in advanced-1c');
  console.assert(muu.lessonId === 'advanced-1c', 'หมู lives in advanced-1c');
  console.assert(fan.thai === 'ฟัน' && fan.vowels.includes('ั'), 'ฟัน tagged with ั');
  console.assert(!fan.rules.includes('implicit-o'), 'ฟัน is not implicit-o');
  console.assert(wordNeedsMaiHanAkat(fan), 'ฟัน needs mai han-akat');
  console.assert(wordNeedsMaiHanAkat(sawasdee), 'สวัสดี needs mai han-akat');
  console.assert(wordNeedsLeadingH(muu), 'หมู needs leading-h');

  // During advanced-1: ฟู ok, ฟัน/หมู blocked
  seedCompletedBefore('advanced-1');
  const duringA1 = buildTestKnown(a1);
  console.assert(wordIsKnown(fuu, duringA1), 'ฟู allowed in advanced-1');
  console.assert(!wordIsKnown(fan, duringA1), 'ฟัน blocked during advanced-1');
  console.assert(!wordIsKnown(muu, duringA1), 'หมู blocked during advanced-1');

  // During advanced-1b: still no ั / leading-h
  seedCompletedBefore('advanced-1b');
  const duringA1b = buildTestKnown(a1b);
  console.assert(!wordIsKnown(fan, duringA1b), 'ฟัน blocked during advanced-1b');
  console.assert(!wordIsKnown(muu, duringA1b), 'หมู blocked during advanced-1b');
  for (const id of a1b.practiceWordIds) {
    const w = WORDS.find(x => x.id === id);
    console.assert(wordIsKnown(w, duringA1b), `advanced-1b practice ${id} is known`);
  }

  // During advanced-1c: ฟัน + leading-ห words ok; สวัสดี still later
  seedCompletedBefore('advanced-1c');
  const beforeA1c = getKnownBefore(a1c);
  const duringA1c = buildTestKnown(a1c);
  console.assert(!wordIsKnown(fan, beforeA1c), 'ฟัน blocked before advanced-1c');
  console.assert(wordIsKnown(fan, duringA1c), 'ฟัน allowed once ั taught');
  console.assert(wordIsKnown(muu, duringA1c), 'หมู allowed once leading-h taught');
  for (const id of a1c.practiceWordIds) {
    const w = WORDS.find(x => x.id === id);
    console.assert(wordIsKnown(w, duringA1c), `advanced-1c practice ${id} is known`);
  }
  console.assert(!wordIsKnown(sawasdee, duringA1c), 'สวัสดี still blocked in advanced-1c');

  // Migration: old completed advanced-1 credits 1b + 1c
  const migrated = migrateCurriculumState({
    ...defaultState(),
    completedLessons: ['advanced-1'],
    unlockedLessons: ['advanced-1', 'advanced-2'],
  });
  console.assert(migrated.completedLessons.includes('advanced-1b'), 'migrate completes 1b');
  console.assert(migrated.completedLessons.includes('advanced-1c'), 'migrate completes 1c');
  console.assert(migrated.unlockedLessons.includes('advanced-2'), 'migrate keeps advanced-2 unlocked');
}

// -วย (ว as ua vowel) must not appear as “implicit o” in early advanced
{
  const { WORDS, LESSONS, wordIsKnown, wordNeedsWVowelUa, buildTestKnown } = sandbox.__TRQ;
  const suay = WORDS.find(w => w.id === 'suay');
  const a1 = LESSONS.find(l => l.id === 'advanced-1');
  const a1c = LESSONS.find(l => l.id === 'advanced-1c');
  const a2 = LESSONS.find(l => l.id === 'advanced-2');
  seedCompletedBefore('advanced-1');
  const duringA1 = buildTestKnown(a1);
  console.assert(suay.thai === 'สวย', 'สวย present');
  console.assert(wordNeedsWVowelUa(suay), 'สวย needs w-vowel-ua');
  console.assert(!suay.rules.includes('implicit-o'), 'สวย is not implicit-o');
  console.assert(suay.lessonId === 'advanced-2', 'สวย lives in advanced-2');
  console.assert(!wordIsKnown(suay, duringA1), 'สวย blocked during advanced-1');
  seedCompletedBefore('advanced-1c');
  console.assert(!wordIsKnown(suay, buildTestKnown(a1c)), 'สวย blocked during advanced-1c');
  console.assert(a2.introduces.rules.includes('w-vowel-ua'), 'advanced-2 teaches w-vowel-ua');
  seedCompletedBefore('advanced-2');
  console.assert(wordIsKnown(suay, buildTestKnown(a2)), 'สวย allowed once -วย taught');
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
