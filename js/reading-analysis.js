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
    'silent-mark': { label: '์ silences a letter', thai: '์', roman: '', hint: 'Garan ์ marks a letter silent — it does not add a sound.' },
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
    // และ: แ-+ะ = one short ae (not “aea”)
    if (set.has('แ-') && set.has('ะ')) {
      return {
        kind: 'vowel',
        key: 'vowel:แ-ะ',
        symbols: ['แ-', 'ะ'],
        label: 'แ◌ะ = ae',
        thai: 'แ◌ะ',
        roman: 'ae',
        hint: 'One fused vowel — not “aea”.',
      };
    }
    // เ + า (with optional tone marks) = ao
    if (set.has('เ-า') || (set.has('เ-') && set.has('า') && !set.has('ะ') && !set.has('ิ') && !set.has('เ-อ'))) {
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
    // Written อ after a consonant = sara o (ร้อน, มอง) — not the silent carrier alone.
    if (set.has('อ') && !r.has('compound-oe') && !set.has('เ-อ') && !set.has('เ-')) {
      return {
        kind: 'vowel',
        key: 'vowel:อ',
        symbols: ['อ'],
        symbol: 'อ',
        label: 'อ = o',
        thai: 'อ',
        roman: 'o',
        hint: 'อ written after the consonant is short o.',
      };
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

  function hasLeadingH(word) {
    if (!word?.consonants?.length) return false;
    if ((word.rules || []).includes('leading-h')) return word.consonants[0] === 'ห';
    return wordNeedsLeadingH(word);
  }

  function autoReadingUnits(word) {
    if (!word) return [];
    const rules = new Set(word.rules || []);

    // Multi-syllable words are not one cluster+vowel+final. Require explicit readingUnits.
    if (rules.has('multi-syllable')) return [];

    let consonants = [...(word.consonants || [])];
    const vowels = [...(word.vowels || [])];
    const units = [];

    // ำ already includes final m — drop phantom ม coda from onset/final parse.
    if (vowels.includes('ำ') && consonants[consonants.length - 1] === 'ม') {
      consonants = consonants.slice(0, -1);
    }

    // -วย: ว+ย are the vowel, not an onset cluster.
    if (rules.has('w-vowel-ua') || vowels.includes('-วย')) {
      const onset = consonants.filter(c => c !== 'ว' && c !== 'ย');
      if (onset.length === 1) {
        units.push({
          kind: 'consonant',
          key: 'consonant:' + onset[0],
          symbol: onset[0],
          label: onset[0] + ' = ' + consonantRoman(onset[0], 'initial', rules),
          thai: onset[0],
          roman: consonantRoman(onset[0], 'initial', rules),
          role: 'initial',
        });
      }
      const vowelUnit = detectVowelUnit(vowels, word.rules || []);
      if (vowelUnit) units.push(vowelUnit);
      return units;
    }

    // Silent ์ usually marks ล/ร as silent (ไมล์) — do not drop the real final coda (ฟิล์ม).
    if (rules.has('silent-mark') && vowels.includes('์')) {
      consonants = consonants.filter(c => c !== 'ล' && c !== 'ร');
    }

    // เ + C + อ: อ is part of the oe vowel, not a second onset consonant.
    if (rules.has('compound-oe') || (vowels.includes('เ-') && vowels.includes('เ-อ'))) {
      consonants = consonants.filter(c => c !== 'อ');
    }

    let finalSym = null;
    let initials = consonants;
    const leadingH = hasLeadingH(word);

    if (leadingH) {
      const rest = consonants.slice(1);
      if (rules.has('final-consonant') && rest.length >= 2) {
        finalSym = rest[rest.length - 1];
        initials = rest.slice(0, -1);
      } else {
        initials = rest.slice(0, 1);
      }
    } else if (rules.has('final-consonant') && consonants.length >= 2) {
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

    if (leadingH) {
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

    if (rules.has('silent-mark') && vowels.includes('์')) {
      units.push({
        kind: 'rule',
        key: 'rule:silent-mark',
        rule: 'silent-mark',
        label: RULE_SPOT_LABELS['silent-mark'].label,
        thai: RULE_SPOT_LABELS['silent-mark'].thai,
        roman: '',
        hint: RULE_SPOT_LABELS['silent-mark'].hint,
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

  function consonantAlternatives(sym, role, rules) {
    const primary = consonantRoman(sym, role, rules);
    const meta = symbolMeta(sym);
    if (!meta) return [primary];
    const alts = String(meta.sound)
      .replace(/\(.*?\)/g, '')
      .split('/')
      .map(s => normRoman(s.trim()))
      .filter(Boolean);
    return [...new Set([primary, ...alts])];
  }

  /** True when units are a single open/closed syllable (suffix-prefix scoring works). */
  function isSimpleSyllableUnits(units) {
    const spoken = (units || []).filter(u => u.roman);
    const initials = spoken.filter(u => u.kind === 'cluster' || (u.kind === 'consonant' && u.role !== 'final'));
    const vowels = spoken.filter(u => u.kind === 'vowel' || (u.kind === 'rule' && u.roman));
    const finals = spoken.filter(u => u.role === 'final');
    return initials.length <= 1 && vowels.length <= 1 && finals.length <= 1
      && spoken.length === initials.length + vowels.length + finals.length;
  }

  /**
   * Left-to-right unit match for multi-syllable / interleaved patterns.
   * (Suffix-first scoring invents nonsense when vowels and consonants alternate.)
   */
  function scoreUnitsSequential(units, typedRoman) {
    const rules = new Set();
    const scored = units.map(u => ({ ...u }));
    let tRem = typedRoman;

    for (const unit of scored) {
      if (unit.rule === 'leading-h') {
        const spuriousH = /^h/.test(typedRoman);
        unit.ok = !spuriousH;
        unit.expected = '(silent)';
        unit.got = spuriousH
          ? (typedRoman.match(/^h[a-z]*?(?=[aeiouy]|$)/)?.[0] || 'h')
          : '(none)';
        if (spuriousH && tRem.startsWith('h')) tRem = tRem.slice(1);
        continue;
      }

      if (!unit.roman) {
        unit.ok = true;
        unit.expected = '—';
        unit.got = '—';
        continue;
      }

      const exp = unit.roman;
      let alts = [exp];
      if (unit.kind === 'consonant' && unit.symbol) {
        alts = consonantAlternatives(unit.symbol, unit.role || 'initial', rules);
        if (unit.role === 'final' && FINAL_SOUND_MAP[unit.symbol]) {
          // Accept mapped final sound as primary, keep letter-name as diagnostic alternate only for matching typos.
          alts = [...new Set([exp, FINAL_SOUND_MAP[unit.symbol], ...alts])];
        }
      }

      const matched = alts.find(a => a && tRem.startsWith(a));
      if (matched) {
        // Final-sound-map: letter-name match (e.g. "r" for ร) is still wrong if mapped sound is required.
        if (unit.role === 'final' && FINAL_SOUND_MAP[unit.symbol] && matched !== exp
            && matched === consonantRoman(unit.symbol, 'initial', new Set())) {
          unit.ok = false;
          unit.expected = exp;
          unit.got = matched;
          tRem = tRem.slice(matched.length);
          continue;
        }
        unit.ok = true;
        unit.expected = exp;
        unit.got = matched;
        tRem = tRem.slice(matched.length);
        continue;
      }

      unit.ok = false;
      unit.expected = exp;
      unit.got = tRem.slice(0, Math.max(exp.length, 1)) || tRem || '—';
      if (tRem.length >= exp.length) tRem = tRem.slice(exp.length);
      else tRem = '';
    }

    return scored;
  }

  /** Match units using suffix (vowel/final) then prefix (consonant) — not blind char positions. */
  function scoreUnits(units, expectedRoman, typedRoman) {
    if (!isSimpleSyllableUnits(units)) {
      return scoreUnitsSequential(units, typedRoman);
    }

    const rules = new Set();
    const scored = units.map(u => ({ ...u }));

    // Suffix units: finals and vowels, last in word first.
    const suffixUnits = scored.filter(u =>
      u.roman && (u.role === 'final' || u.kind === 'vowel' || (u.kind === 'rule' && u.roman))
    );
    let tRem = typedRoman;
    let eRem = expectedRoman;

    for (let i = suffixUnits.length - 1; i >= 0; i--) {
      const unit = suffixUnits[i];
      const exp = unit.roman;
      const expLen = exp.length;
      const typedSuffix = tRem.slice(-expLen);
      const expectedHas = eRem.endsWith(exp);

      if (expectedHas && typedSuffix === exp) {
        unit.ok = true;
        unit.expected = exp;
        unit.got = exp;
        tRem = tRem.slice(0, -expLen);
        eRem = eRem.slice(0, -expLen);
        continue;
      }

      // Typed vowel/final sound correct even when initial consonant was wrong (haa vs thaa).
      if (typedSuffix === exp) {
        unit.ok = true;
        unit.expected = exp;
        unit.got = exp;
        tRem = tRem.slice(0, -expLen);
        if (expectedHas) eRem = eRem.slice(0, -expLen);
        continue;
      }

      unit.ok = false;
      unit.expected = exp;
      unit.got = typedSuffix || tRem || '—';
      if (expectedHas) eRem = eRem.slice(0, -expLen);
      if (tRem.length >= expLen) tRem = tRem.slice(0, -expLen);
      else tRem = '';
    }

    // Prefix units: initial consonants and clusters on what remains.
    const prefixUnits = scored.filter(u =>
      u.roman && (u.kind === 'cluster' || (u.kind === 'consonant' && u.role !== 'final'))
    );

    const leadingHUnit = scored.find(u => u.rule === 'leading-h');
    if (leadingHUnit) {
      const spuriousH = /^h/.test(typedRoman);
      leadingHUnit.ok = !spuriousH;
      leadingHUnit.expected = '(silent)';
      leadingHUnit.got = spuriousH
        ? (typedRoman.match(/^h[a-z]*?(?=[aeiouy]|$)/)?.[0] || 'h')
        : '(none)';
      if (spuriousH && tRem.startsWith('h')) tRem = tRem.slice(1);
    }

    for (const unit of prefixUnits) {
      const exp = unit.roman;
      const alts = unit.kind === 'cluster'
        ? [exp]
        : consonantAlternatives(unit.symbol, unit.role || 'initial', rules);

      const matched = alts.find(a => a && tRem.startsWith(a));
      if (matched) {
        unit.ok = true;
        unit.expected = exp;
        unit.got = matched;
        tRem = tRem.slice(matched.length);
        if (eRem.startsWith(exp)) eRem = eRem.slice(exp.length);
        continue;
      }

      unit.ok = false;
      unit.expected = exp;
      // Whole leftover is what they wrote for this consonant slot.
      unit.got = tRem || '—';
      tRem = '';
      if (eRem.startsWith(exp)) eRem = eRem.slice(exp.length);
    }

    // Silent / display-only units (์, etc.) — no roman to match.
    for (const unit of scored) {
      if (unit.ok === undefined && !unit.roman) {
        unit.ok = true;
        unit.expected = '—';
        unit.got = '—';
      }
    }

    return scored;
  }

  function unitCountsForSummary(u) {
    return Boolean(u.roman || u.rule === 'leading-h');
  }

  function buildMistakeSummary(scored) {
    const wrong = scored.filter(u => !u.ok && unitCountsForSummary(u));
    const right = scored.filter(u => u.ok && unitCountsForSummary(u));
    if (!wrong.length) return { wrongLines: [], rightParts: right, wrongParts: wrong, headline: '' };

    const wrongLines = wrong.map(u => {
      const exp = u.expected || u.roman || '—';
      const got = u.got || '—';
      if (u.rule === 'leading-h') {
        return { kind: 'rule', text: `${u.label}: do not write “h” — you wrote “${got}”` };
      }
      if (u.kind === 'vowel' || (u.kind === 'rule' && u.roman)) {
        return { kind: 'vowel', text: `Vowel ${u.label}: expected “${exp}”, you wrote “${got}”` };
      }
      if (u.kind === 'cluster') {
        return { kind: 'cluster', text: `Cluster ${u.label}: expected “${exp}”, you wrote “${got}”` };
      }
      if (u.role === 'final') {
        return { kind: 'final', text: `Final ${u.label}: expected “${exp}”, you wrote “${got}”` };
      }
      return { kind: 'consonant', text: `Consonant ${u.label}: expected “${exp}”, you wrote “${got}”` };
    });

    const rightLabels = right.map(u => u.label).filter(Boolean);
    return {
      wrongLines,
      wrongParts: wrong,
      rightParts: right,
      headline: wrongLines.map(w => w.text).join(' · '),
      rightNote: rightLabels.length ? `Correct: ${rightLabels.join(', ')}` : '',
    };
  }

  /** Expected answers: curated romanizations first, then rule-built (never alone for empty units). */
  function getExpectedRomans(word) {
    const fromWord = (word?.romanizations || []).map(normRoman).filter(Boolean);
    const units = getReadingUnits(word);
    const built = units.length ? normRoman(buildRomanFromUnits(units)) : '';
    const rulePrimary = units.length ? normRoman(word?.ruleRoman || built) : '';
    return [...new Set([...fromWord, rulePrimary, built].filter(Boolean))];
  }

  function analyzeReadingAnswer(word, typed) {
    const units = getReadingUnits(word);
    const typedNorm = normRoman(typed);
    const expectedNorms = getExpectedRomans(word);
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

    const bestExpected = pickClosestExpected(expectedNorms, typedNorm);
    const scored = units.length ? scoreUnits(units, bestExpected, typedNorm) : [];
    const summary = scored.length
      ? buildMistakeSummary(scored)
      : {
          wrongLines: [{ kind: 'word', text: `Expected “${bestExpected || expectedNorms[0] || '—'}”, you wrote “${typedNorm || '—'}”` }],
          wrongParts: [],
          rightParts: [],
          headline: `Expected “${bestExpected || expectedNorms[0] || '—'}”, you wrote “${typedNorm || '—'}”`,
          rightNote: '',
        };

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
      summary,
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
    getExpectedRomans,
    analyzeReadingAnswer,
    letterSpotMeta,
    wordUsesLetterKey,
    buildRomanFromUnits,
    buildMistakeSummary,
    RULE_SPOT_LABELS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
