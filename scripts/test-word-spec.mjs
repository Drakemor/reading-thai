/**
 * Word-spec tests: Thai assembly + rule-derived romanizations match expectations.
 * Run: node scripts/test-word-spec.mjs
 */
import fs from 'fs';
import vm from 'vm';

const root = new URL('..', import.meta.url);
const dataCode = fs.readFileSync(new URL('js/data.js', root), 'utf8');
const analysisCode = fs.readFileSync(new URL('js/reading-analysis.js', root), 'utf8');
const wordSpecCode = fs.readFileSync(new URL('js/word-spec.js', root), 'utf8');

const sandbox = { console, globalThis: null };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(
  dataCode + '\n' + analysisCode + '\n' + wordSpecCode + '\n' +
  'globalThis.__WS = { WORDS, WORD_SPECS, WordSpec, ReadingAnalysis };\n',
  sandbox
);

const { WORDS, WORD_SPECS, WordSpec, ReadingAnalysis } = sandbox.__WS;

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL:', msg);
}

assert(Array.isArray(WORD_SPECS) && WORD_SPECS.length > 0, 'WORD_SPECS defined');
assert(Array.isArray(WORDS) && WORDS.length === WORD_SPECS.length, 'WORDS compiled from specs');

for (const spec of WORD_SPECS) {
  const word = WORDS.find(w => w.id === spec.id);
  assert(word, `compiled word ${spec.id}`);

  // Thai: explicit or assembled must match compiled
  if (spec.thai) {
    assert(word.thai === spec.thai, `${spec.id} thai preserved: ${word.thai} vs ${spec.thai}`);
  } else if (!(spec.rules || []).includes('multi-syllable')) {
    const assembled = WordSpec.assembleThai(spec);
    assert(word.thai === assembled, `${spec.id} assembled thai ${assembled} got ${word.thai}`);
  }

  // Rule roman is primary expected answer
  const ruleRoman = ReadingAnalysis.buildRomanFromUnits(ReadingAnalysis.getReadingUnits(word));
  assert(word.ruleRoman === ruleRoman, `${spec.id} ruleRoman cached`);
  assert(
    word.romanizations.includes(ruleRoman),
    `${spec.id} romanizations include ruleRoman ${ruleRoman}: [${word.romanizations.join(', ')}]`
  );

  // Scoring uses rules: typing ruleRoman is correct
  const analysis = ReadingAnalysis.analyzeReadingAnswer(word, ruleRoman);
  assert(analysis.correct, `${spec.id} accepts ruleRoman "${ruleRoman}"`);

  // Optional spelling alternates (primary answer always comes from rules)
  if (spec.romanAlternates?.length) {
    for (const leg of spec.romanAlternates) {
      const norm = ReadingAnalysis.normRoman(leg);
      if (!norm.includes('-')) {
        const a = ReadingAnalysis.analyzeReadingAnswer(word, leg);
        assert(
          a.correct || word.romanizations.includes(norm),
          `${spec.id} alternate "${leg}" accepted (${word.romanizations.join('|')})`
        );
      }
    }
  }
}

// Rule-based scoring rejects wrong answers
const nuu = WORDS.find(w => w.id === 'nuu');
assert(!ReadingAnalysis.analyzeReadingAnswer(nuu, 'hmuu').correct, 'nuu rejects hmuu');
assert(ReadingAnalysis.analyzeReadingAnswer(nuu, 'nuu').correct, 'nuu accepts rule roman');

const khii = WORDS.find(w => w.id === 'khii');
assert(ReadingAnalysis.analyzeReadingAnswer(khii, 'khiip').correct, 'khii accepts khiip (final p rule)');
assert(!ReadingAnalysis.analyzeReadingAnswer(khii, 'khiib').correct, 'khii rejects khiib');

console.log(`\nword-spec: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
