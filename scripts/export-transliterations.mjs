/**
 * Export every word's Thai + accepted transliterations for human/agent review.
 * Run: node scripts/export-transliterations.mjs
 * Writes: docs/transliteration-audit.txt
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const root = new URL('..', import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'docs', 'transliteration-audit.txt');

const sandbox = { console, globalThis: null };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(new URL('js/data.js', root), 'utf8') + '\n' +
  fs.readFileSync(new URL('js/reading-analysis.js', root), 'utf8') + '\n' +
  fs.readFileSync(new URL('js/word-spec.js', root), 'utf8') + '\n' +
  'globalThis.__ = { WORDS, WORD_SPECS, LESSONS, ReadingAnalysis };\n',
  sandbox
);

const { WORDS, WORD_SPECS, LESSONS, ReadingAnalysis } = sandbox.__;

function lessonOrder(id) {
  const l = LESSONS.find(x => x.id === id);
  return l ? l.order : 999;
}

const lines = [];
lines.push('Thai Reading Quest — transliteration audit dump');
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push(`Word count: ${WORDS.length}`);
lines.push('');
lines.push('Format per word:');
lines.push('  id | lesson | level');
lines.push('  Thai: <script>');
lines.push('  Accepted: <comma-separated romanizations used for grading>');
lines.push('  RuleRoman: <primary rule-built form>');
lines.push('  SpecAlternates: <from WORD_SPECS.romanAlternates, if any>');
lines.push('  Units: <reading unit key=roman ...>');
lines.push('  Meaning: <english>');
lines.push('  Rules: <tags>');
lines.push('');
lines.push('Review task: for each word, confirm Accepted transliterations match how the Thai should be read.');
lines.push('Flag mistakes: wrong primary reading, missing common alternates that should pass, garbage forms, or units that invent false clusters.');
lines.push('─'.repeat(72));
lines.push('');

const sorted = [...WORDS].sort((a, b) =>
  lessonOrder(a.lessonId) - lessonOrder(b.lessonId) || a.id.localeCompare(b.id)
);

for (const w of sorted) {
  const spec = WORD_SPECS.find(s => s.id === w.id);
  const units = ReadingAnalysis.getReadingUnits(w);
  const unitStr = units.length
    ? units.map(u => `${u.key || u.rule || '?'}=${u.roman || '∅'}`).join(' · ')
    : '(no units — multi-syllable without readingUnits, or empty)';
  const alts = (spec?.romanAlternates || []).join(', ') || '—';

  lines.push(`${w.id} | ${w.lessonId || '?'} | ${w.level || '?'}`);
  lines.push(`Thai: ${w.thai}`);
  lines.push(`Accepted: ${(w.romanizations || []).join(', ')}`);
  lines.push(`RuleRoman: ${w.ruleRoman || '—'}`);
  lines.push(`SpecAlternates: ${alts}`);
  lines.push(`Units: ${unitStr}`);
  lines.push(`Meaning: ${w.meaning || ''}`);
  lines.push(`Rules: ${(w.rules || []).join(', ') || '—'}`);
  lines.push('');
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(`Wrote ${sorted.length} words → ${outPath}`);
