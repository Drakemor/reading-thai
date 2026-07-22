/**
 * Comprehensive unit tests for letter-level reading analysis.
 * Run: npm test  |  node scripts/test-reading-analysis.mjs
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
  'globalThis.__RA = ReadingAnalysis;\n' +
  'globalThis.__WORDS = WORDS;\n',
  sandbox
);

const RA = sandbox.__RA;
const {
  analyzeReadingAnswer,
  getReadingUnits,
  buildRomanFromUnits,
  buildMistakeSummary,
  normRoman,
  RULE_SPOT_LABELS,
} = RA;
const WORDS = sandbox.__WORDS;

let passed = 0;
let failed = 0;

function word(id) {
  const w = WORDS.find(x => x.id === id);
  if (!w) throw new Error('missing word: ' + id);
  return w;
}

function assert(cond, msg) {
  if (cond) {
    passed++;
    return;
  }
  failed++;
  console.error('FAIL:', msg);
}

function unitMap(analysis) {
  const m = new Map();
  for (const u of analysis.units) {
    m.set(u.key || u.rule, u);
  }
  return m;
}

function expectCase(wordId, typed, spec = {}) {
  const {
    correct,
    unitOk = {},
    unitBad = [],
    noCluster = false,
    wrongKeys = null,
    hasSummary = null,
  } = spec;

  const w = word(wordId);
  const a = analyzeReadingAnswer(w, typed);
  const label = `${wordId} “${typed}”`;

  if (correct !== undefined) {
    assert(a.correct === correct, `${label}: correct=${a.correct} expected ${correct}`);
  }

  const units = getReadingUnits(w);
  if (noCluster) {
    assert(!units.some(u => u.kind === 'cluster'), `${wordId}: should not have cluster unit`);
  }

  const m = unitMap(a);
  for (const [key, ok] of Object.entries(unitOk)) {
    const u = m.get(key);
    assert(u && u.ok === ok, `${label}: ${key} ok=${u?.ok} expected ${ok}`);
  }
  for (const key of unitBad) {
    const u = m.get(key);
    assert(u && u.ok === false, `${label}: ${key} should be wrong`);
  }

  if (wrongKeys !== null) {
    const got = [...a.wrongKeys].sort().join(',');
    const exp = [...wrongKeys].sort().join(',');
    assert(got === exp, `${label}: wrongKeys=[${got}] expected [${exp}]`);
  }

  if (hasSummary === true) {
    assert(Boolean(a.summary?.headline || a.summary?.wrongLines?.length), `${label}: expected mistake summary`);
  }
  if (hasSummary === false) {
    assert(!a.summary?.headline, `${label}: should not have headline`);
  }

  return a;
}

function wordsWithRule(rule) {
  return WORDS.filter(w => (w.rules || []).includes(rule));
}

function primaryRoman(w) {
  return normRoman((w.romanizations || [])[0]);
}

function compoundShortEWords() {
  return wordsWithRule('compound-short-e');
}

function compoundShortOWords() {
  return wordsWithRule('compound-short-o');
}

function leadingHWords() {
  return wordsWithRule('leading-h');
}

function implicitOWords() {
  return wordsWithRule('implicit-o').filter(w => !w.rules?.includes('multi-syllable'));
}

function finalSoundMapWords() {
  return wordsWithRule('final-sound-map').filter(w => !w.rules?.includes('multi-syllable'));
}

// ---------------------------------------------------------------------------
// Helpers & rule registry
// ---------------------------------------------------------------------------

assert(typeof RULE_SPOT_LABELS === 'object', 'RULE_SPOT_LABELS exported');
for (const rule of [
  'compound-short-e', 'compound-short-o', 'compound-oe', 'compound-oe-i',
  'leading-h', 'implicit-o', 'w-vowel-ua',
]) {
  assert(RULE_SPOT_LABELS[rule], `RULE_SPOT_LABELS has ${rule}`);
}

assert(normRoman('Thaa!') === 'thaa', 'normRoman strips non-alpha');
assert(normRoman('') === '', 'normRoman empty');

// ---------------------------------------------------------------------------
// Unit structure
// ---------------------------------------------------------------------------

for (const id of ['nuu', 'muu', 'maa_dog', 'ngi']) {
  const units = getReadingUnits(word(id));
  assert(units.some(u => u.rule === 'leading-h'), `${id} has leading-h rule`);
  assert(!units.some(u => u.kind === 'cluster'), `${id} must not spuriously cluster ห+sonorant`);
}

assert(
  getReadingUnits(word('nuu')).some(u => u.key === 'consonant:น'),
  'nuu has consonant น'
);
assert(
  buildRomanFromUnits(getReadingUnits(word('nuu'))) === 'nuu',
  'nuu units rebuild to nuu'
);
assert(
  !getReadingUnits(word('haa')).some(u => u.rule === 'leading-h'),
  'haa is pronounced h — no leading-h rule'
);

const ngiUnits = getReadingUnits(word('ngi'));
assert(ngiUnits.some(u => u.key === 'consonant:ง'), 'ngi has consonant ง');
assert(ngiUnits.some(u => u.key === 'consonant:ก:final'), 'ngi has final ก');
assert(!ngiUnits.some(u => u.kind === 'cluster'), 'ngi must not cluster ห+ง');

const pheUnits = getReadingUnits(word('phe'));
assert(pheUnits.some(u => u.key === 'cluster:พ+ล'), 'phe uses explicit cluster unit');
assert(pheUnits.some(u => u.key === 'rule:compound-oe-i'), 'phe has compound-oe-i');

// ---------------------------------------------------------------------------
// Auto: every taught single-syllable word accepts its primary romanization
// ---------------------------------------------------------------------------

const singleSyllable = WORDS.filter(w =>
  !(w.rules || []).includes('multi-syllable') &&
  (w.romanizations || []).some(r => !r.includes('-'))
);

for (const w of singleSyllable) {
  const typed = (w.romanizations || []).find(r => !r.includes('-'));
  const a = analyzeReadingAnswer(w, typed);
  assert(a.correct, `${w.id} accepts primary “${typed}”`);
  assert(a.wrongKeys.length === 0, `${w.id} primary has no wrongKeys`);
}

// Auto: alternate romanizations also accepted
const altCases = [
  ['gaa', 'kaa'], ['ke', 'ge'], ['ko', 'go'], ['khii', 'khip'], ['khii', 'khiip'],
  ['phe', 'pleun'], ['suay', 'suai'], ['re', 'roe'], ['re', 'reu'], ['je', 'joe'],
  ['bpeert', 'pert'], ['bpit', 'pit'], ['ni', 'nil'], ['we', 'wen'],
];
for (const [id, typed] of altCases) {
  expectCase(id, typed, { correct: true });
}

// Auto: curated simple words rebuild to a known romanization
const rebuildWhitelist = [
  'gaa', 'maa', 'naa', 'haa', 'thaa', 'chaa', 'phaa', 'khaa', 'duu', 'mii', 'mi',
  'le', 'ko', 'lo', 'be', 'ke', 'nuu', 'muu', 'maa_dog', 'faa', 'ngaa', 'ngii',
  'ro', 'pho', 'khon', 'nom', 'bon', 'jon', 'mong', 'fon', 'kho', 'som', 'awk',
  'ni', 'khii', 'we', 'bpit', 'jaa', 'me', 'mo', 'gae', 'bpai',
];
for (const id of rebuildWhitelist) {
  const w = word(id);
  const built = buildRomanFromUnits(getReadingUnits(w));
  const norms = (w.romanizations || []).map(normRoman).filter(r => !r.includes('-'));
  assert(norms.includes(built), `${id} built=${built} not in ${norms.join('|')}`);
}

// ---------------------------------------------------------------------------
// Open syllables — consonant vs vowel isolation
// ---------------------------------------------------------------------------

expectCase('haa', 'thaa', {
  correct: false,
  unitOk: { 'vowel:า': true },
  unitBad: ['consonant:ห'],
  hasSummary: true,
});
expectCase('haa', 'haa', { correct: true });
expectCase('thaa', 'thaa', { correct: true });
expectCase('thaa', 'haa', {
  correct: false,
  unitOk: { 'vowel:า': true },
  unitBad: ['consonant:ท'],
});
expectCase('maa', 'naa', {
  correct: false,
  unitOk: { 'vowel:า': true },
  unitBad: ['consonant:ม'],
});
expectCase('khaa', 'phaa', {
  correct: false,
  unitOk: { 'vowel:า': true },
  unitBad: ['consonant:ค'],
});
expectCase('ngaa', 'gaa', {
  correct: false,
  unitBad: ['consonant:ง'],
});

// Vowel length mistakes
expectCase('mii', 'mi', { correct: false, unitBad: ['vowel:ี'] });
expectCase('mii', 'mii', { correct: true });
expectCase('mi', 'me', { correct: false, unitBad: ['vowel:ิ'] });
expectCase('duu', 'du', { correct: false, unitBad: ['vowel:ู'] });
expectCase('ngii', 'ngu', { correct: false, unitBad: ['vowel:ู'] });

// ---------------------------------------------------------------------------
// Leading ห is silent — all leading-h words + mistake matrix
// ---------------------------------------------------------------------------

for (const w of leadingHWords()) {
  const good = primaryRoman(w);
  expectCase(w.id, good, {
    correct: true,
    unitOk: { 'rule:leading-h': true },
    noCluster: true,
  });
}

expectCase('nuu', 'hmuu', {
  correct: false,
  noCluster: true,
  unitOk: { 'vowel:ู': true },
  unitBad: ['rule:leading-h', 'consonant:น'],
  wrongKeys: ['rule:leading-h', 'consonant:น'],
  hasSummary: true,
});
expectCase('nuu', 'hnuu', {
  correct: false,
  unitOk: { 'vowel:ู': true, 'consonant:น': true },
  unitBad: ['rule:leading-h'],
});
expectCase('nuu', 'muu', {
  correct: false,
  unitBad: ['consonant:น'],
  unitOk: { 'rule:leading-h': true, 'vowel:ู': true },
});
expectCase('muu', 'hmuu', {
  correct: false,
  unitOk: { 'vowel:ู': true, 'consonant:ม': true },
  unitBad: ['rule:leading-h'],
});
expectCase('muu', 'muu', { correct: true, unitOk: { 'rule:leading-h': true } });
expectCase('maa_dog', 'hmaa', {
  correct: false,
  unitOk: { 'vowel:า': true, 'consonant:ม': true },
  unitBad: ['rule:leading-h'],
});
expectCase('maa_dog', 'hmaa', {
  correct: false,
  unitBad: ['rule:leading-h'],
});
expectCase('ngi', 'hngik', {
  correct: false,
  unitBad: ['rule:leading-h'],
  unitOk: { 'consonant:ง': true, 'vowel:ิ': true, 'consonant:ก:final': true },
});
expectCase('ngi', 'ngik', { correct: true });
expectCase('ngi', 'ngit', {
  correct: false,
  unitOk: { 'rule:leading-h': true, 'consonant:ง': true, 'vowel:ิ': true },
  unitBad: ['consonant:ก:final'],
});

// Real ห initial — must keep h
expectCase('haa', 'haa', { correct: true, unitOk: { 'consonant:ห': true } });
expectCase('haa', 'aa', { correct: false, unitBad: ['consonant:ห'] });

// ---------------------------------------------------------------------------
// Compound short e (เ◌ะ) — auto + hand-picked
// ---------------------------------------------------------------------------

for (const w of compoundShortEWords()) {
  const good = primaryRoman(w);
  const bad = good + 'a';
  expectCase(w.id, good, { correct: true, unitOk: { 'rule:compound-short-e': true } });
  expectCase(w.id, bad, {
    correct: false,
    unitBad: ['rule:compound-short-e'],
    hasSummary: true,
  });
}

expectCase('le', 'lea', { correct: false, unitBad: ['rule:compound-short-e'] });
expectCase('le', 'le', { correct: true });
expectCase('ke', 'kea', { correct: false, unitBad: ['rule:compound-short-e'] });
expectCase('be', 'bea', { correct: false, unitBad: ['rule:compound-short-e'] });
expectCase('dte', 'dtea', { correct: false, unitBad: ['rule:compound-short-e'] });
expectCase('bpe', 'bpea', { correct: false, unitBad: ['rule:compound-short-e'] });

// ---------------------------------------------------------------------------
// Compound short o (โ◌ะ)
// ---------------------------------------------------------------------------

for (const w of compoundShortOWords()) {
  const good = primaryRoman(w);
  expectCase(w.id, good, { correct: true, unitOk: { 'rule:compound-short-o': true } });
  expectCase(w.id, good + 'a', { correct: false, unitBad: ['rule:compound-short-o'] });
}

expectCase('ko', 'koa', { correct: false, unitBad: ['rule:compound-short-o'] });
expectCase('lo', 'loa', { correct: false, unitBad: ['rule:compound-short-o'] });
expectCase('ko', 'ko', { correct: true });

// ---------------------------------------------------------------------------
// Compound oe (เ◌อ) & compound oe-i (เ◌ิ)
// ---------------------------------------------------------------------------

expectCase('re', 'roe', { correct: true, unitOk: { 'rule:compound-oe': true } });
expectCase('re', 'rea', { correct: false, unitBad: ['rule:compound-oe'] });
expectCase('re', 'rei', { correct: false, unitBad: ['rule:compound-oe'] });
expectCase('je', 'joe', { correct: true, unitOk: { 'rule:compound-oe': true } });
expectCase('je', 'jea', { correct: false, unitBad: ['rule:compound-oe'] });
expectCase('je', 'jei', { correct: false, unitBad: ['rule:compound-oe'] });

expectCase('phe', 'phloen', {
  correct: true,
  unitOk: { 'cluster:พ+ล': true, 'rule:compound-oe-i': true, 'consonant:น:final': true },
});
expectCase('phe', 'phelin', { correct: false, unitBad: ['rule:compound-oe-i'] });
expectCase('phe', 'phlien', { correct: false, unitBad: ['rule:compound-oe-i'] });
expectCase('phe', 'ploen', { correct: false, unitBad: ['cluster:พ+ล'] });
expectCase('phe', 'phloen', { correct: true });
expectCase('phe', 'phloem', {
  correct: false,
  unitOk: { 'cluster:พ+ล': true, 'rule:compound-oe-i': true },
  unitBad: ['consonant:น:final'],
});

// ---------------------------------------------------------------------------
// Consonant clusters (non-leading-h)
// ---------------------------------------------------------------------------

expectCase('phe', 'ploen', { correct: false, unitBad: ['cluster:พ+ล'] });
expectCase('phe', 'phoen', { correct: false, unitBad: ['cluster:พ+ล'] });

// ---------------------------------------------------------------------------
// Final consonants & final-sound-map
// ---------------------------------------------------------------------------

expectCase('jaa', 'jaan', { correct: true, unitOk: { 'consonant:น:final': true } });
expectCase('jaa', 'jaa', { correct: false, unitBad: ['consonant:น:final'] });
expectCase('jaa', 'jaam', { correct: false, unitBad: ['consonant:น:final'] });

for (const w of finalSoundMapWords()) {
  const good = primaryRoman(w);
  expectCase(w.id, good, { correct: true });
}

expectCase('khii', 'khiip', { correct: true, unitOk: { 'consonant:บ:final': true } });
expectCase('khii', 'khiib', {
  correct: false,
  unitBad: ['consonant:บ:final'],
  wrongKeys: ['consonant:บ:final'],
});
expectCase('ni', 'nin', { correct: true, unitOk: { 'consonant:ล:final': true } });
expectCase('ni', 'nil', { correct: true });
expectCase('ni', 'nil', { correct: true, unitOk: { 'consonant:ล:final': true } });
expectCase('ni', 'nill', { correct: false, unitBad: ['consonant:ล:final'] });
expectCase('we', 'ween', { correct: true, unitOk: { 'consonant:ร:final': true } });
expectCase('we', 'weer', { correct: false, unitBad: ['consonant:ร:final'] });
expectCase('bpeert', 'bpeert', { correct: true, unitOk: { 'consonant:ด:final': true } });
expectCase('bpeert', 'bpeerd', { correct: false, unitBad: ['consonant:ด:final'] });
expectCase('bpit', 'bpit', { correct: true });
expectCase('bpit', 'bpid', { correct: false, unitBad: ['consonant:ด:final'] });

// ---------------------------------------------------------------------------
// Implicit o
// ---------------------------------------------------------------------------

for (const w of implicitOWords()) {
  const good = primaryRoman(w);
  expectCase(w.id, good, { correct: true, unitOk: { 'rule:implicit-o': true } });
}

expectCase('ro', 'ro', { correct: true, unitOk: { 'rule:implicit-o': true } });
expectCase('ro', 'r', { correct: false, unitBad: ['rule:implicit-o'] });
expectCase('pho', 'pho', { correct: true, unitOk: { 'rule:implicit-o': true } });
expectCase('pho', 'ph', { correct: false, unitBad: ['rule:implicit-o'] });
expectCase('khon', 'khon', { correct: true, unitOk: { 'rule:implicit-o': true } });
expectCase('khon', 'khn', { correct: false, unitBad: ['rule:implicit-o'] });
expectCase('khon', 'kon', {
  correct: false,
  unitOk: { 'rule:implicit-o': true },
  unitBad: ['consonant:ค'],
});
expectCase('nom', 'nom', { correct: true });
expectCase('nom', 'nm', { correct: false, unitBad: ['rule:implicit-o'] });
expectCase('bon', 'bn', { correct: false, unitBad: ['rule:implicit-o'] });
expectCase('mong', 'mong', { correct: true });
expectCase('mong', 'mng', { correct: false, unitBad: ['rule:implicit-o'] });
expectCase('jon', 'jon', { correct: true });
expectCase('jon', 'jn', { correct: false, unitBad: ['rule:implicit-o'] });
expectCase('kho', 'kho', { correct: true });
expectCase('kho', 'kh', { correct: false, unitBad: ['rule:implicit-o'] });
expectCase('som', 'som', { correct: true });
expectCase('som', 'sm', { correct: false, unitBad: ['rule:implicit-o'] });
expectCase('fon', 'fon', { correct: true });
expectCase('awk', 'awk', { correct: true });
expectCase('awk', 'ak', { correct: false, unitBad: ['rule:implicit-o'] });

// ---------------------------------------------------------------------------
// w-vowel-ua (◌วย)
// ---------------------------------------------------------------------------

expectCase('suay', 'suay', { correct: true, unitOk: { 'rule:w-vowel-ua': true } });
expectCase('suay', 'suai', { correct: true });
expectCase('suay', 'sway', { correct: false, unitBad: ['rule:w-vowel-ua'] });
expectCase('suay', 'suwai', { correct: false, unitBad: ['rule:w-vowel-ua'] });
expectCase('suay', 'say', {
  correct: false,
  unitBad: ['rule:w-vowel-ua'],
});

// ---------------------------------------------------------------------------
// Other vowel patterns
// ---------------------------------------------------------------------------

expectCase('nge', 'ngao', { correct: true, unitOk: { 'vowel:เ-า': true } });
expectCase('nge', 'ngaao', { correct: true });
expectCase('nge', 'ngae', { correct: false, unitBad: ['vowel:เ-า'] });
expectCase('che', 'chao', { correct: true }); // tone stripped in normRoman path — เ-า composite
expectCase('me', 'men', { correct: true, unitOk: { 'vowel:เ-': true, 'consonant:น:final': true } });
expectCase('me', 'man', {
  correct: false,
  unitBad: ['vowel:เ-'],
  unitOk: { 'consonant:น:final': true },
});
expectCase('mo', 'mo', { correct: true, unitOk: { 'vowel:โ-': true } });
expectCase('mo', 'ma', { correct: false, unitBad: ['vowel:โ-'] });
expectCase('gae', 'gae', { correct: true, unitOk: { 'vowel:แ-': true } });
expectCase('gae', 'ga', { correct: false, unitBad: ['vowel:แ-'] });
expectCase('bpai', 'bpai', { correct: true, unitOk: { 'vowel:ไ-': true } });
expectCase('bpai', 'pai', { correct: true }); // alternate romanization
expectCase('bpai', 'bpy', { correct: false, unitBad: ['vowel:ไ-'] });
expectCase('bpai', 'bi', { correct: false, unitBad: ['consonant:ป'] });

// ---------------------------------------------------------------------------
// buildMistakeSummary / wrongKeys integration
// ---------------------------------------------------------------------------

{
  const a = expectCase('nuu', 'hmuu', { correct: false, hasSummary: true });
  const summary = buildMistakeSummary(a.units.filter(u => u.ok !== undefined));
  assert(summary.wrongParts.length >= 2, 'hmuu summary has multiple wrong parts');
  assert(summary.rightParts.some(u => u.key === 'vowel:ู'), 'hmuu summary credits vowel');
  assert(summary.headline.includes('Leading'), 'hmuu headline mentions leading-h');
}

{
  const a = expectCase('haa', 'thaa', { correct: false });
  assert(a.wrongKeys.includes('consonant:ห'), 'haa/thaa flags consonant:ห');
  assert(!a.wrongKeys.includes('vowel:า'), 'haa/thaa does not flag vowel');
}

// ---------------------------------------------------------------------------
// Plausible multi-error combos (real learner mistakes)
// ---------------------------------------------------------------------------

expectCase('nuu', 'hm', {
  correct: false,
  unitBad: ['rule:leading-h', 'consonant:น', 'vowel:ู'],
});
expectCase('phe', 'pelin', {
  correct: false,
  unitBad: ['cluster:พ+ล', 'rule:compound-oe-i'],
});
expectCase('khon', 'hon', {
  correct: false,
  unitBad: ['consonant:ค'],
  unitOk: { 'rule:implicit-o': true, 'consonant:น:final': true },
});
expectCase('we', 'wer', {
  correct: false,
  unitBad: ['consonant:ร:final'],
  unitOk: { 'vowel:เ-': true },
});
expectCase('ngi', 'hngit', {
  correct: false,
  unitBad: ['rule:leading-h', 'consonant:ก:final'],
  unitOk: { 'consonant:ง': true, 'vowel:ิ': true },
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`\nreading-analysis: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
