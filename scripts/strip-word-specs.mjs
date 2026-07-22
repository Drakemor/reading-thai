/**
 * Strip hand-authored thai/romanizations from WORD_SPECS where rules cover them.
 * Run: node scripts/strip-word-specs.mjs
 */
import fs from 'fs';
import vm from 'vm';

const dataPath = 'js/data.js';
const dataCode = fs.readFileSync(dataPath, 'utf8');
const analysisCode = fs.readFileSync('js/reading-analysis.js', 'utf8');
const wordSpecCode = fs.readFileSync('js/word-spec.js', 'utf8');

const sandbox = { console, globalThis: null };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(
  dataCode + '\n' + analysisCode + '\n' + wordSpecCode + '\n' +
  'globalThis.__ = { WORD_SPECS, WordSpec };\n',
  sandbox
);

const { WORD_SPECS, WordSpec } = sandbox.__;

const stripThaiIds = new Set();
for (const spec of WORD_SPECS) {
  if (!spec.thai) continue;
  if ((spec.rules || []).includes('multi-syllable')) continue;
  try {
    const asm = WordSpec.assembleThai({ ...spec, thai: undefined });
    if (asm === spec.thai) stripThaiIds.add(spec.id);
  } catch { /* keep thai */ }
}

function stripEntryLine(line) {
  const m = line.match(/\bid:'([^']+)'/);
  if (!m) return line;
  const id = m[1];
  let out = line;
  // Hand-authored romanizations → optional alternates only (primary comes from rules)
  out = out.replace(/,romanizations:/, ',romanAlternates:');
  if (stripThaiIds.has(id)) {
    out = out.replace(/,thai:'(?:\\'|[^'])*'/, '');
  }
  return out;
}

const lines = dataCode.split('\n');
const outLines = lines.map(line => {
  if (line.trimStart().startsWith('{id:')) return stripEntryLine(line);
  return line;
});

fs.writeFileSync(dataPath, outLines.join('\n'), 'utf8');
console.log(`Renamed romanizations→romanAlternates; stripped thai from ${stripThaiIds.size} specs`);
console.log('Kept thai for:', WORD_SPECS.filter(s => s.thai && !stripThaiIds.has(s.id)).map(s => s.id).join(', '));
