/**
 * Letter-level reading analysis: break words into consonant/vowel/rule units,
 * score typed romanizations per unit, and emit weak-letter keys for drills.
 */
(function (global) {
  'use strict';

  const FINAL_SOUND_MAP = { ร: 'n', ล: 'n', ด: 't', ต: 't', บ: 'p', ป: 'p' };
  const TONE_MARKS = new Set(['่', '้', '๊', '๋']);

  const RULE_SPOT_LABELS = {
    'compound-short-e': { label: 'เ◌ะ = short e', thai: 'เ◌ะ', roman: 'e', hint: 'One fused vowel — not “ea”.' },
    'compound-short-o': { label: 'โ◌ะ = short o', thai: 'โ◌ะ', roman: 'o', hint: 'One fused vowel — not “oa”.' },
    'compound-oe': { label: 'เ + ◌ + อ = oe', thai: 'เ◌อ', roman: 'oe', hint: 'อ completes the vowel — not silent.' },
    'compound-oe-i': { label: 'เ◌ิ = oe (not i)', thai: 'เ◌ิ', roman: 'oe', hint: 'Read as oe — do not add a separate i vowel.' },
    'final-sound-map': { label: 'Final letter ≠ sound', thai: '◌ร/◌ล → n', roman: '', hint: 'Final ร/ล often sound like n; ด/ต→t, บ/ป→p.' },
    'leading-h': { label: 'Leading ห is silent', thai: 'ห + sonorant', roman: '', hint: 'ห before ม/น/ง: read m/n/ng, not hm/hn/hng.' },
    'implicit-o': { label: 'Hidden short o', thai: '◌◌', roman: 'o', hint: 'Two consonants with no written vowel → short o between them.' },
    'w-vowel-ua': { label: 'ว + ย = uay', thai: '-วย', roman: 'uay', hint: 'ว is the ua vowel here, not consonant w.' },
  };

  function normRoman(s) {
    return String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  }

  function symbolMeta(sym) {
    if (typeof SYMBOLS === 'undefined') return null;
    return SYMBOLS.find(s => s.symbol === sym) || null;
  }

  function primaryRoman(sound) {
    if (!sound) return '';
    const cleaned = String(sound).replace(/\(.*?\)/g, '').trim();
    const part = cleaned.split('/')[0].trim();
    return normRoman(part);
  }

  function consonantRoman(sym, role, rules) {
    if (role === 'final' && rules && rules.has('final-sound-map') && FINAL_SOUND_MAP[sym]) {
      return FINAL_SOUND_MAP[sym];
    }
    const meta = symbolMeta(sym);
    if (!meta) return normRoman(sym);
    const raw = primaryRoman(meta.sound);
    if (role === 'final' && FINAL_SOUND_MAP[sym] && !rules?.has('final-sound-map')) {
      return primaryRoman(meta.sound.split('/').pop());
    }
    return raw;
  }

  function vowelRoman(sym) {
    const meta = symbolMeta(sym);
    return meta ? primaryRoman(meta.sound) : normRoman(sym);
  }

  function detectVowelUnit(vowels, rules) {
    const set = new Set(vowels || []);
    const r = new Set(rules || []);

    if (r.has('compound-oe') || (set.has('เ-') && set.has('เ-อ'))) {
      return {
        kind: 'vowel',
        key: 'rule:compound-oe',
        rule: 'compound-oe',
        symbols: ['เ-', 'เ-อ'],
        label: RULE_SPOT_LABELS['compound-oe'].label,
        thai: RULE_SPOT_LABELS['compound-oe'].thai,
        roman: 'oe',
        hint: RULE_SPOT_LABELS['compound-oe'].hint,
      };
    }
    if (r.has('compound-oe-i') || (set.has('เ-') && set.has('ิ') && !set.has('ะ') && !set.has('เ-อ'))) {
      return {
        kind: 'vowel',
        key: 'rule:compound-oe-i',
        rule: 'compound-oe-i',
        symbols: ['เ-', 'ิ'],
        label: RULE_SPOT_LABELS['compound-oe-i'].label,
        thai: RULE_SPOT_LABELS['compound-oe-i'].thai,
        roman: 'oe',
        hint: RULE_SPOT_LABELS['compound-oe-i'].hint,
      };
    }
    if (r.has('compound-short-e') || (set.has('เ-') && set.has('ะ'))) {
      return {
        kind: 'vowel',
        key: 'rule:compound-short-e',
        rule: 'compound-short-e',
        symbols: ['เ-', 'ะ'],
        label: RULE_SPOT_LABELS['compound-short-e'].label,
        thai: RULE_SPOT_LABELS['compound-short-e'].thai,
        roman: 'e',
        hint: RULE_SPOT_LABELS['compound-short-e'].hint,
      };
    }
    if (r.has('compound-short-o') || (set.has('โ-') && set.has('ะ'))) {
      return {
        kind: 'vowel',
        key: 'rule:compound-short-o',
        rule: 'compound-short-o',
        symbols: ['โ-', 'ะ'],
        label: RULE_SPOT_LABELS['compound-short-o'].label,
        thai: RULE_SPOT_LABELS['compound-short-o'].thai,
        roman: 'o',
        hint: RULE_SPOT_LABELS['compound-short-o'].hint,
      };
    }
    if (set.has('เ-า')) {
      return { kind: 'vowel', key: 'vowel:เ-า', symbols: ['เ-า'], label: 'เ-า = ao', thai: 'เ◌า', roman: 'ao' };
    }
    if (set.has('-วย') || r.has('w-vowel-ua')) {
      return {
        kind: 'vowel',
        key: 'rule:w-vowel-ua',
        rule: 'w-vowel-ua',
        symbols: ['-วย'],
        label: RULE_SPOT_LABELS['w-vowel-ua'].label,
        thai: '◌วย',
        roman: 'uay',
        hint: RULE_SPOT_LABELS['w-vowel-ua'].hint,
      };
    }
    if (set.has('ำ')) {
      return { kind: 'vowel', key: 'vowel:ำ', symbols: ['ำ'], label: 'ำ = am', thai: '◌ำ', roman: 'am' };
    }

    const contentVowels = (vowels || []).filter(v => !TONE_MARKS.has(v) && v !== '์');
    if (contentVowels.length === 1) {
      const v = contentVowels[0];
      return {
        kind: 'vowel',
        key: 'vowel:' + v,
        symbols: [v],
        symbol: v,
        label: (symbolMeta(v)?.role || v) + ' = ' + vowelRoman(v),
        thai: v.replace('-', '◌'),
        roman: vowelRoman(v),
      };
    }
    if (contentVowels.length > 1 && !r.has('compound-short-e') && !r.has('compound-short-o')) {
      const joined = contentVowels.map(vowelRoman).join('');
      return {
        kind: 'vowel',
        key: 'vowel:' + contentVowels.join('+'),
        symbols: contentVowels,
        label: contentVowels.join(' + '),
        thai: contentVowels.join(''),
        roman: joined,
      };
    }
    if (r.has('implicit-o')) {
      return {
        kind: 'vowel',
        key: 'rule:implicit-o',
        rule: 'implicit-o',
        label: RULE_SPOT_LABELS['implicit-o'].label,
        thai: '◌◌',
        roman: 'o',
        hint: RULE_SPOT_LABELS['implicit-o'].hint,
      };
    }
    return null;
  }

  function autoReadingUnits(word) {
    if (!word) return [];
    const rules = new Set(word.rules || []);
    const consonants = [...(word.consonants || [])];
    const vowels = [...(word.vowels || [])];
    const units = [];

    let finalSym = null;
    let initials = consonants;
    if (rules.has('final-consonant') && consonants.length >= 2) {
      finalSym = consonants[consonants.length - 1];
      initials = consonants.slice(0, -1);
    }

    if (initials.length > 1) {
      const roman = initials.map(c => consonantRoman(c, 'initial', rules)).join('');
      units.push({
        kind: 'cluster',
        key: 'cluster:' + initials.join('+'),
        symbols: initials,
        label: initials.join(' + ') + ' = ' + roman,
        thai: initials.join(''),
        roman,
        hint: 'Consonant cluster — read together.',
      });
    } else if (initials.length === 1) {
      const sym = initials[0];
      units.push({
        kind: 'consonant',
        key: 'consonant:' + sym,
        symbol: sym,
        label: sym + ' = ' + consonantRoman(sym, 'initial', rules),
        thai: sym,
        roman: consonantRoman(sym, 'initial', rules),
        role: 'initial',
      });
    }

    const vowelUnit = detectVowelUnit(vowels, word.rules || []);
    if (vowelUnit) units.push(vowelUnit);

    if (finalSym) {
      const roman = consonantRoman(finalSym, 'final', rules);
      const mapped = rules.has('final-sound-map') && FINAL_SOUND_MAP[finalSym];
      units.push({
        kind: 'consonant',
        key: 'consonant:' + finalSym + ':final',
        symbol: finalSym,
        label: mapped ? finalSym + ' → ' + roman + ' (final)' : finalSym + ' = ' + roman + ' (final)',
        thai: finalSym,
        roman,
        role: 'final',
        hint: mapped ? 'Final ' + finalSym + ' sounds like ' + roman + ', not “' + consonantRoman(finalSym, 'initial', rules) + '”.' : '',
      });
    }

    if (wordNeedsLeadingH(word)) {
      units.unshift({
        kind: 'rule',
        key: 'rule:leading-h',
        rule: 'leading-h',
        label: RULE_SPOT_LABELS['leading-h'].label,
        thai: 'ห…',
        roman: '',
        hint: RULE_SPOT_LABELS['leading-h'].hint,
      });
    }

    return units;
  }

  function wordNeedsLeadingH(w) {
    if (!w?.consonants?.length) return false;
    const sonorants = new Set(['ม', 'น', 'ง', 'ว', 'ย', 'ร', 'ล']);
    return w.consonants[0] === 'ห' && sonorants.has(w.consonants[1]);
  }

  function getReadingUnits(word) {
    if (!word) return [];
    if (word.readingUnits?.length) return word.readingUnits.map(u => ({ ...u }));
    return autoReadingUnits(word);
  }

  function buildRomanFromUnits(units) {
    return units.map(u => u.roman || '').join('');
  }

  function pickClosestExpected(expectedList, typed) {
    if (!expectedList.length) return typed;
    let best = expectedList[0];
    let bestScore = Infinity;
    for (const exp of expectedList) {
      const score = levenshtein(exp, typed);
      if (score < bestScore) {
        bestScore = score;
        best = exp;
      }
    }
    return best;
  }

  function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[m][n];
  }

  function scoreUnits(units, expectedRoman, typedRoman) {
    let expPos = 0;
    let typPos = 0;
    return units.map(unit => {
      const expSeg = unit.roman || '';
      if (!expSeg.length) {
        return { ...unit, ok: true, expected: '—', got: '—' };
      }
      const expSlice = expectedRoman.slice(expPos, expPos + expSeg.length);
      const typSlice = typedRoman.slice(typPos, typPos + expSeg.length);
      const ok = expSlice === typSlice && expSlice === expSeg;
      expPos += expSeg.length;
      typPos += expSeg.length;
      return {
        ...unit,
        ok,
        expected: expSeg,
        got: typSlice || '—',
      };
    });
  }

  function analyzeReadingAnswer(word, typed) {
    const units = getReadingUnits(word);
    const typedNorm = normRoman(typed);
    const expectedNorms = (word?.romanizations || []).map(normRoman).filter(Boolean);
    const correct = expectedNorms.some(r => r === typedNorm);

    if (correct) {
      return {
        correct: true,
        typed: typedNorm,
        expected: expectedNorms[0] || buildRomanFromUnits(units),
        units: units.map(u => ({ ...u, ok: true, expected: u.roman || '—', got: u.roman || '—' })),
        wrongKeys: [],
      };
    }

    const built = buildRomanFromUnits(units);
    const candidates = [...new Set([...expectedNorms, built].filter(Boolean))];
    const bestExpected = pickClosestExpected(candidates, typedNorm);
    const scored = scoreUnits(units, bestExpected, typedNorm);

    const wrongKeys = [];
    scored.forEach(u => {
      if (!u.ok && u.key) wrongKeys.push(u.key);
      if (!u.ok && u.rule) wrongKeys.push('rule:' + u.rule);
    });

    return {
      correct: false,
      typed: typedNorm,
      expected: bestExpected,
      units: scored,
      wrongKeys: [...new Set(wrongKeys)],
    };
  }

  function letterSpotMeta(key) {
    if (!key) return null;
    if (key.startsWith('rule:')) {
      const rule = key.slice(5);
      const spot = RULE_SPOT_LABELS[rule];
      if (spot) return { kind: 'rule', key, rule, ...spot };
    }
    if (key.startsWith('cluster:')) {
      const syms = key.slice(8).split('+');
      const roman = syms.map(s => consonantRoman(s, 'initial', new Set())).join('');
      return {
        kind: 'cluster',
        key,
        symbols: syms,
        label: syms.join(' + ') + ' = ' + roman,
        thai: syms.join(''),
        roman,
        hint: 'Consonant cluster — read as one block.',
      };
    }
    if (key.startsWith('consonant:')) {
      const parts = key.slice(10).split(':');
      const sym = parts[0];
      const role = parts[1] || 'initial';
      const rules = role === 'final' ? new Set(['final-sound-map']) : new Set();
      const roman = consonantRoman(sym, role, rules);
      return {
        kind: 'consonant',
        key,
        symbol: sym,
        label: sym + (role === 'final' ? ' (final)' : '') + ' = ' + roman,
        thai: sym,
        roman,
      };
    }
    if (key.startsWith('vowel:')) {
      const sym = key.slice(6);
      const meta = symbolMeta(sym);
      return {
        kind: 'vowel',
        key,
        symbol: sym,
        label: (meta?.role || sym) + ' = ' + vowelRoman(sym),
        thai: sym.replace('-', '◌'),
        roman: vowelRoman(sym),
      };
    }
    return { kind: 'unknown', key, label: key };
  }

  function wordUsesLetterKey(word, key) {
    return getReadingUnits(word).some(u => u.key === key || (u.rule && 'rule:' + u.rule === key));
  }

  global.ReadingAnalysis = {
    normRoman,
    getReadingUnits,
    analyzeReadingAnswer,
    letterSpotMeta,
    wordUsesLetterKey,
    buildRomanFromUnits,
    RULE_SPOT_LABELS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
