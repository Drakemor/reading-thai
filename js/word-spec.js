/**
 * Word specs → Thai script + rule-derived romanizations.
 * Specs define consonants, vowels, and rules; Thai is assembled when possible.
 */
(function (global) {
  'use strict';

  const TONE_MARKS = new Set(['่', '้', '๊', '๋']);
  const BEFORE_VOWELS = new Set(['เ-', 'โ-', 'แ-', 'ไ-', 'ใ-']);
  const ABOVE_MARKS = new Set(['ิ', 'ี', 'ั', '่', '้', '๊', '๋']);
  const BELOW_MARKS = new Set(['ุ', 'ู']);

  function vowelPrefix(key) {
    if (key === 'เ-') return 'เ';
    if (key === 'โ-') return 'โ';
    if (key === 'แ-') return 'แ';
    if (key === 'ไ-') return 'ไ';
    if (key === 'ใ-') return 'ใ';
    return '';
  }

  /** Apply vowel + tone marks to a consonant cluster (first consonant carries marks). */
  function applyVowelMarks(onset, vowels, rules) {
    const r = new Set(rules || []);
    const content = (vowels || []).filter(v => v !== '์' && v !== '-วย' && v !== 'เ-อ');
    const tones = content.filter(v => TONE_MARKS.has(v));
    const nonTone = content.filter(v => !TONE_MARKS.has(v));

    if (r.has('w-vowel-ua')) {
      // ส + ว + ย
      const base = onset.join('');
      return base + 'วย';
    }

    if (r.has('compound-oe')) {
      const c = onset[0] || '';
      return 'เ' + c + 'อ';
    }

    if (r.has('compound-oe-i')) {
      const c = onset.join('');
      return 'เ' + c + 'ิ';
    }

    if (r.has('compound-short-e') || (nonTone.includes('เ-') && nonTone.includes('ะ'))) {
      const c = onset[0] || '';
      return 'เ' + c + 'ะ';
    }

    if (r.has('compound-short-o') || (nonTone.includes('โ-') && nonTone.includes('ะ'))) {
      const c = onset[0] || '';
      return 'โ' + c + 'ะ';
    }

    if (nonTone.includes('เ-า')) {
      const c = onset[0] || '';
      return 'เ' + c + 'า';
    }

    if (nonTone.includes('ำ')) {
      const c = onset[0] || '';
      const tone = tones[0] || '';
      return c + 'ำ' + tone;
    }

    const before = nonTone.find(v => BEFORE_VOWELS.has(v));
    if (before) {
      const c = onset.join('');
      const tone = tones[0] || '';
      return vowelPrefix(before) + c + tone;
    }

    const c = onset[0] || '';
    const rest = onset.slice(1).join('');
    let core = c + rest;

    const above = nonTone.filter(v => ABOVE_MARKS.has(v));
    const below = nonTone.filter(v => BELOW_MARKS.has(v));
    const after = nonTone.filter(v => v === 'า' || v === 'ะ');

    // Above marks attach to first consonant
    if (above.length) core = c + above.join('') + rest;
    if (below.length) core = c + below.join('') + rest;
    if (after.length) core = c + after.join('') + rest;
    if (tones.length && !above.length) core = c + tones.join('') + rest;

    if (vowels?.includes('์')) {
      core += '์';
    }

    return core;
  }

  function splitOnsetFinal(consonants, rules) {
    const r = new Set(rules || []);
    let leadingH = r.has('leading-h') && consonants[0] === 'ห';
    let rest = leadingH ? consonants.slice(1) : consonants;

    let final = null;
    let onset = rest;
    if (r.has('final-consonant') && rest.length >= 2) {
      final = rest[rest.length - 1];
      onset = rest.slice(0, -1);
    }

    const prefix = leadingH ? 'ห' : '';
    return { prefix, onset, final };
  }

  /** Build one Thai syllable from structural tags. */
  function assembleSingleSyllable(consonants, vowels, rules) {
    const r = new Set(rules || []);

    if (r.has('implicit-o') && r.has('vowel-carrier') && !(vowels || []).length) {
      return consonants.join('');
    }

    const { prefix, onset, final } = splitOnsetFinal(consonants, rules);
    if (!onset.length && !prefix) return '';

    let body = applyVowelMarks(onset, vowels, rules);
    if (final) body += final;
    return prefix + body;
  }

  /** Interleave consonants + vowels for compound forms like มานะ, กิโล. */
  function assembleSequential(consonants, vowels, rules) {
    if (!consonants?.length) return '';
    if (consonants.length === 1) {
      return assembleSingleSyllable(consonants, vowels, rules);
    }

    // ม + า + น + ะ pattern
    if (vowels?.length === consonants.length && !(rules || []).includes('final-consonant')) {
      let out = '';
      for (let i = 0; i < consonants.length; i++) {
        const chunk = assembleSingleSyllable(
          [consonants[i]],
          vowels[i] ? [vowels[i]] : [],
          i === 0 ? rules : ['open-syllable']
        );
        out += chunk;
      }
      return out;
    }

    return assembleSingleSyllable(consonants, vowels, rules);
  }

  function assembleThai(spec) {
    if (spec.thai) return spec.thai;
    if ((spec.rules || []).includes('multi-syllable')) {
      throw new Error(`Word "${spec.id}" is multi-syllable and needs explicit thai`);
    }
    return assembleSequential(spec.consonants || [], spec.vowels || [], spec.rules || []);
  }

  /** Collect consonant-sound alternates from SYMBOLS (k/g → variants). */
  function symbolSoundAlts(sym) {
    if (typeof SYMBOLS === 'undefined') return [];
    const meta = SYMBOLS.find(s => s.symbol === sym);
    if (!meta?.sound) return [];
    return String(meta.sound)
      .replace(/\(.*?\)/g, '')
      .split('/')
      .map(s => ReadingAnalysis.normRoman(s.trim()))
      .filter(Boolean);
  }

  /** Build expected romanizations: curated alternates are authoritative when present. */
  function deriveExpectedRomans(word, extraAlternates) {
    if (!global.ReadingAnalysis) {
      return (extraAlternates || []).map(r => String(r || '').toLowerCase().replace(/[^a-z]/g, '')).filter(Boolean);
    }
    const RA = ReadingAnalysis;
    const curated = [];
    (extraAlternates || []).forEach(r => {
      const n = RA.normRoman(r);
      if (n && !curated.includes(n)) curated.push(n);
    });

    const units = RA.getReadingUnits(word);
    const built = units.length ? RA.buildRomanFromUnits(units) : '';

    // When the author listed alternates, curated order is authoritative (primary first).
    if (curated.length) {
      const alts = [...curated];
      // Still expand initial consonant sound swaps on the primary curated form.
      const primary = alts[0];
      const initialUnit = units.find(u => u.kind === 'consonant' && u.role !== 'final');
      if (initialUnit?.symbol) {
        const head = RA.normRoman(initialUnit.roman);
        if (head && primary.startsWith(head)) {
          const tail = primary.slice(head.length);
          symbolSoundAlts(initialUnit.symbol).forEach(a => {
            if (a && a !== head) {
              const form = a + tail;
              if (!alts.includes(form)) alts.push(form);
            }
          });
        }
      }
      return alts;
    }

    const alts = new Set();
    if (built) alts.add(built);
    const initialUnit = units.find(u => u.kind === 'consonant' && u.role !== 'final')
      || units.find(u => u.kind === 'cluster');
    if (initialUnit?.kind === 'consonant' && initialUnit.symbol && built) {
      const primary = RA.normRoman(initialUnit.roman);
      const tail = primary && built.startsWith(primary) ? built.slice(primary.length) : '';
      symbolSoundAlts(initialUnit.symbol).forEach(a => {
        if (a && a !== primary) alts.add(a + tail);
      });
    }
    return [...alts].filter(Boolean);
  }

  function compileWordSpec(spec) {
    const thai = assembleThai(spec);
    const word = {
      id: spec.id,
      thai,
      meaning: spec.meaning,
      emoji: spec.emoji,
      level: spec.level,
      lessonId: spec.lessonId,
      consonants: [...(spec.consonants || [])],
      vowels: [...(spec.vowels || [])],
      rules: [...(spec.rules || [])],
      explanation: spec.explanation,
    };
    if (spec.readingUnits) word.readingUnits = spec.readingUnits.map(u => ({ ...u }));
    word._romanAlternates = spec.romanAlternates || null;
    return word;
  }

  function finalizeWordBank(specs) {
    const compiled = specs.map(compileWordSpec);
    if (!global.ReadingAnalysis) return compiled;
    return compiled.map(w => {
      const hadCurated = !!(w._romanAlternates && w._romanAlternates.length);
      const romanizations = deriveExpectedRomans(w, w._romanAlternates);
      delete w._romanAlternates;
      const units = ReadingAnalysis.getReadingUnits(w);
      const built = units.length ? ReadingAnalysis.buildRomanFromUnits(units) : '';
      // Curated list order wins when the author set romanAlternates; otherwise prefer unit-built.
      const primary = hadCurated
        ? (romanizations[0] || built || '')
        : (built && romanizations.includes(built))
          ? built
          : (romanizations[0] || built || '');
      const romanizationsOut = primary
        ? [primary, ...romanizations.filter(r => r !== primary)]
        : romanizations;
      return {
        ...w,
        romanizations: romanizationsOut,
        ruleRoman: primary,
      };
    });
  }

  function compileWordBank(specs) {
    return finalizeWordBank(specs);
  }

  global.WordSpec = {
    assembleThai,
    assembleSingleSyllable,
    compileWordSpec,
    compileWordBank,
    deriveExpectedRomans,
  };

  if (typeof WORD_SPECS !== 'undefined' && Array.isArray(WORD_SPECS)) {
    global.WORDS = compileWordBank(WORD_SPECS);
  }
})(typeof window !== 'undefined' ? window : globalThis);
