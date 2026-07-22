/**
 * Curriculum order tests: words in tests/practice must be introduced by their lesson.
 * Run: node scripts/test-curriculum-order.mjs
 */
import fs from 'fs';
import vm from 'vm';

const root = new URL('..', import.meta.url);
const dataCode = fs.readFileSync(new URL('js/data.js', root), 'utf8');
const analysisCode = fs.readFileSync(new URL('js/reading-analysis.js', root), 'utf8');
const wordSpecCode = fs.readFileSync(new URL('js/word-spec.js', root), 'utf8');
const appCode = fs.readFileSync(new URL('js/app.js', root), 'utf8');

const sandbox = {
  console,
  localStorage: (() => {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
  })(),
  document: { getElementById: () => null, addEventListener() {}, documentElement: { style: { setProperty() {} } }, body: { classList: { add() {}, remove() {}, toggle() {} }, offsetWidth: 0 } },
  window: { addEventListener() {}, visualViewport: null },
  alert: () => {},
  ChipAudio: { testStart() {}, testCorrect() {}, testWrong() {}, testDeath() {}, testPass() {}, testFail() {}, lessonUnlock() {}, uiSelect() {}, uiSlide() {}, uiReveal() {}, isMuted: () => false, getVolume: () => 0.5, setVolume() {}, setMuted() {}, toggleMute() {} },
  requestAnimationFrame: fn => fn(),
  setTimeout: fn => fn(),
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(
  dataCode + '\n' + analysisCode + '\n' + wordSpecCode + '\n' +
  appCode.replace(/\napplyDemoFromQuery\(\);[\s\S]*$/, '\n') + `
  globalThis.__TRQ = {
    WORDS, WORD_SPECS, LESSONS, SYMBOLS,
    wordIsKnown, buildTestKnown, getKnownBefore, wordLessonOrder,
    generateQuestions, getLessonWordIdsForTest, getNewLessonWords,
    defaultState,
    get state() { return state; },
    set state(v) { state = v; },
  };
`,
  sandbox
);

const {
  WORDS, LESSONS, SYMBOLS,
  wordIsKnown, buildTestKnown, wordLessonOrder, generateQuestions,
  getLessonWordIdsForTest, defaultState,
} = sandbox.__TRQ;

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL:', msg);
}

function seedCompletedThrough(lessonId) {
  const target = LESSONS.find(l => l.id === lessonId);
  const done = LESSONS.filter(l => l.order < target.order).map(l => l.id);
  sandbox.__TRQ.state = {
    ...defaultState(),
    completedLessons: done,
    unlockedLessons: [...done, lessonId],
    currentLessonId: lessonId,
  };
}

// Every symbol's exampleWordId is known at its introducedIn lesson
for (const sym of SYMBOLS) {
  if (!sym.exampleWordId) continue;
  const word = WORDS.find(w => w.id === sym.exampleWordId);
  const lesson = LESSONS.find(l => l.id === sym.introducedIn);
  if (!word || !lesson) continue;
  seedCompletedThrough(lesson.id);
  sandbox.__TRQ.state.completedLessons.push(lesson.id);
  const known = buildTestKnown(lesson);
  assert(
    wordIsKnown(word, known),
    `example ${sym.exampleWordId} for ${sym.symbol} known at ${lesson.id}`
  );
}

// Each word is known when taking its home lesson test
for (const lesson of LESSONS.filter(l => !l.isBoss)) {
  seedCompletedThrough(lesson.id);
  const known = buildTestKnown(lesson);
  const homeWords = WORDS.filter(w => w.lessonId === lesson.id);
  for (const w of homeWords) {
    assert(
      wordIsKnown(w, known),
      `${w.id} (${w.thai}) known at home lesson ${lesson.id}`
    );
  }
}

// Lesson practice + example word ids are known at test time
for (const lesson of LESSONS) {
  seedCompletedThrough(lesson.id);
  const known = buildTestKnown(lesson);
  for (const id of getLessonWordIdsForTest(lesson)) {
    const w = WORDS.find(x => x.id === id);
    assert(w, `${lesson.id} references missing word ${id}`);
    if (w) {
      assert(
        wordIsKnown(w, known),
        `${lesson.id} test/practice word ${id} must be known at lesson test`
      );
    }
  }
}

// Generated question words are always known
for (const lesson of LESSONS.filter(l => !l.isBoss)) {
  seedCompletedThrough(lesson.id);
  const known = buildTestKnown(lesson);
  const qs = generateQuestions(lesson, known, false);
  for (const q of qs) {
    if (!q.word || q.word.id === 'rule') continue;
    assert(
      wordIsKnown(q.word, known),
      `${lesson.id} generated Q word ${q.word.id} not known`
    );
    assert(
      wordLessonOrder(q.word) <= lesson.order,
      `${lesson.id} Q word ${q.word.id} is from a future lesson (spoiler)`
    );
  }
}

// Boss tests: all words in pool should be known
for (const lesson of LESSONS.filter(l => l.isBoss)) {
  seedCompletedThrough(lesson.id);
  const known = buildTestKnown(lesson);
  const qs = generateQuestions(lesson, known, true);
  for (const q of qs) {
    if (!q.word || q.word.id === 'rule') continue;
    assert(wordIsKnown(q.word, known), `boss ${lesson.id} Q word ${q.word.id} not known`);
  }
}

// Words must not require rules/vowels/consonants from lessons after their lessonId
for (const w of WORDS) {
  const home = LESSONS.find(l => l.id === w.lessonId);
  if (!home) continue;
  const allowed = buildTestKnown(home);
  if (!wordIsKnown(w, allowed)) {
    // Diagnose which tag is ahead of curriculum
    const missingC = w.consonants.filter(c => !allowed.consonants.has(c));
    const missingV = w.vowels.filter(v => !allowed.vowels.has(v));
    const missingR = w.rules.filter(r => !allowed.rules.has(r));
    assert(false, `${w.id} tags ahead of ${home.id}: C=[${missingC}] V=[${missingV}] R=[${missingR}]`);
  } else {
    assert(true, `${w.id} curriculum tags OK at ${home.id}`);
  }
}

console.log(`\ncurriculum-order: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
