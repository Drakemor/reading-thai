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

  // Primary Accepted form is ruleRoman (curated alternates win over broken unit mashups).
  assert(word.ruleRoman, `${spec.id} has ruleRoman`);
  assert(
    word.romanizations.includes(word.ruleRoman),
    `${spec.id} romanizations include ruleRoman ${word.ruleRoman}: [${word.romanizations.join(', ')}]`
  );
  if (spec.romanAlternates?.length) {
    const curated = spec.romanAlternates.map(ReadingAnalysis.normRoman).filter(Boolean);
    assert(
      curated.includes(word.ruleRoman) || word.ruleRoman === ReadingAnalysis.buildRomanFromUnits(ReadingAnalysis.getReadingUnits(word)),
      `${spec.id} ruleRoman ${word.ruleRoman} should match curated or unit-built`
    );
  }

  // Scoring uses rules: typing ruleRoman is correct
  const analysis = ReadingAnalysis.analyzeReadingAnswer(word, word.ruleRoman);
  assert(analysis.correct, `${spec.id} accepts ruleRoman "${word.ruleRoman}"`);

  // Optional spelling alternates
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
