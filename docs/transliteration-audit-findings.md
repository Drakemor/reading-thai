# Thai Reading Quest — Transliteration Audit Findings

Source: `docs/transliteration-audit.txt` (147 words, generated 2026-07-22).  
Style assumed: app RTGS-ish learner spellings (`aa`/`ii`/`uu`, `kh`/`ph`/`th`, `bp`/`dt`, final `ร`/`ล`→`n`, `บ`/`ป`→`p`, `ด`/`ต`→`t`, leading `ห` silent before sonorants, curated `k`/`g` etc.).

Rules tags in the dump are treated as curriculum intent. Where Rules/Units **concatenate letters into nonsense**, that is called out even if a SpecAlternate happens to be correct.

---

## 1. Summary counts

| Category | Count |
| --- | ---: |
| Total words | 147 |
| OK (reading + Accepted adequate) | 114 |
| Critical mistakes | 13 |
| Medium issues | 20 |

**Critical** = garbage Accepted form, wrong primary RuleRoman that teaches a false reading, and/or Thai that cannot be produced by the claimed units.  
**Medium** = useful alternate missing, odd primary preference, unit/Thai mismatch that does not remove the correct answer from Accepted, or stale id vs Thai.

Root cause pattern for most critical bugs: `autoReadingUnits` treats every non-final consonant as one **onset cluster** and concatenates every vowel symbol’s roman, so multi-syllable / special-vowel / silent-mark words without explicit `readingUnits` invent forms like `mnaaa`, `klio`, `swyuay`, `mlai`, `thyeiing`.

---

## 2. Critical mistakes

| id | Thai | Problem | Suggested Accepted |
| --- | --- | --- | --- |
| `ma` | มานะ | **Garbage** RuleRoman `mnaaa`. Units invent cluster `ม+น=mn` and vowel mash `า+ะ=aaa`. SpecAlternates (`maana`) are fine but primary teaches nonsense. Needs `multi-syllable` + `readingUnits` (or sequential syllables). | `maana`, `mana` (optional), `maa-na` |
| `na` | นานา | RuleRoman **`naa`** is only the first syllable; **`naa` is Accepted**, so an incomplete answer grades correct. Units only cover one `น+า`. SpecAlternates `naanaa` are right. | `naanaa` only (drop bare `naa`) |
| `ki` | กิโล | **Garbage** `klio`. False cluster `ก+ล` across syllables; vowels mashed to `io`. SpecAlternates `kilo`/`gilo`/`kiloo` OK. | `kiloo`, `kilo`, `gilo` |
| `lae` | และ | RuleRoman **`laea`** concatenates `แ-+ะ` → `aea`. Correct learner form is **`lae`** (compound short ae). | `lae` |
| `naam` | น้ำ | RuleRoman **`namm`**. Spec lists phantom consonant `ม` while `ำ` already means `am`; units do `am` + final `m`. Thai `น้ำ` has no separate `ม`. SpecAlternate `naam` is correct. | `naam` |
| `che` | เช้า | RuleRoman **`cheaa`** (เ+า mashed). Real reading **`chao`**. `chaao` in SpecAlternates is also wrong length. | `chao` |
| `suay` | สวย | **Garbage** `swyuay`. Units cluster `ส+ว+ย=swy` **and** apply `w-vowel-ua=uay`, contradicting the Rules tag (ว is the ua vowel, not a consonant w). SpecAlternates `suay`/`suai` correct. | `suay`, `suai` |
| `mai` | ไมล์ | **Garbage** `mlai`. Silent `์` on `ล` ignored; false cluster `ม+ล`. SpecAlternates `mai`/`mail` correct. | `mai`, `mail` |
| `silent_ex` | เธอร์ม | **Garbage** `thmoe`. Tagged `compound-oe` but word is loan **therm-** with silent `ร์`; consonants omit `ร`. SpecAlternate `term` is the intended reading. | `term`, `therm` |
| `khao2` | เข้า | RuleRoman **`khe`**. Vowels listed as `เ-`+tone only — **missing `า`**, so เ-า → ao is lost. SpecAlternate `khao` is correct (same vowel as `เขา`). | `khao` |
| `ne` | เนย | RuleRoman **`nye`**. False cluster `น+ย` + bare `เ-=e`. Butter is **`noei`/`neoy`**. SpecAlternates mostly OK; drop `nye`. | `noei`, `neoy`, `ney` |
| `thiang` | เที่ยง | **Garbage** `thyeiing`. False `ท+ย` cluster; `เ-+ี` mashed to `eii` instead of **เ-ีย = ia**. SpecAlternate `thiang` correct. | `thiang` |
| `bpeert` | เปิด | RuleRoman **`bpet`** / Accepted `pet`. Thai is **เ◌ิ** (`/ɤː/`), not plain `เ-`. Same family as `เพลิน` → `phloen`. Spec vowels omit `ิ` and omit `compound-oe-i`. `bpeert`/`peert` are wrong quality (long e). | `bpoet`, `poet`, `bpert`, `pert` |

### Critical detail notes

- **`ma` / `na` / `ki`**: curriculum explanations already describe two syllables (`maa + na`, `นา + นา`, `กิ + โล`), but missing `multi-syllable` + explicit units lets the cluster builder invent mashups that then become RuleRoman and Accepted.
- **`naam`**: SpecAlternates do **not** contradict Thai; **Units/RuleRoman do**. Fix consonants to `['น']` (ำ carries the final m).
- **`silent_ex`**: SpecAlternates (`term`) match Thai intent; RuleRoman/`compound-oe` do not.
- **`bpeert`**: Accepted list actively rewards wrong vowel (`bpet`, `pet`, `bpeert`).

---

## 3. Medium issues

### Wrong or weak primary (correct form still Accepted)

| id | Thai | Issue |
| --- | --- | --- |
| `jing` | จริง | RuleRoman `jring` spells the cluster; spoken/common learner form is **`jing`** (already Accepted). Prefer `jing` as primary; keep `jring` only if teaching orthographic ร. |
| `awk` | ออก | RuleRoman `ok` via `implicit-o`; learner-common **`awk`** is already Accepted — better primary. |
| `khaao` | ข้าว | RuleRoman `khaaw` (final ว→w) is consistent with `maew`; `khaao` is the more common typed form. Both fine; optional primary swap. |

### Bad / dubious alternates still Accepted

| id | Thai | Issue |
| --- | --- | --- |
| `nge` | เงา | SpecAlternate **`ngaao`** invents long aa; vowel is เ-า → **`ngao` only**. |
| `che` | เช้า | **`chaao`** (also listed under critical) should not be Accepted. |
| `jo` | โจ๊ก | **`joke`** is English orthography, not Thai decoding — optional remove or keep as explicit loan allowance. |

### Missing useful learner alternates

| id | Thai | Missing (should accept) |
| --- | --- | --- |
| `re` | เรอ | `rer` (parallel to `jer` on `เจอ`) |
| `sawasdee` | สวัสดี | `sawadee`, `sawatdee` (very common) |
| `ahaan` | อาหาร | `ahan`, `aharn` |
| `khopkhun` | ขอบคุณ | `kobkhun`, `khobkhun` |
| `bpeert` | เปิด | `bpoet` / `poet` (see critical) |
| `ne` | เนย | already has noei/neoy; ensure `noey` if desired |
| `gaafae` | กาแฟ | optional `gafae` / `kaafe` |

Hyphenated SpecAlternates (`aa-haan`, `khop-khun`, etc.) are OK: grading strips non-letters via `normRoman`.

### Units / Thai / Spec mismatches (primary answer still usable)

| id | Thai | Issue |
| --- | --- | --- |
| `ron` | ร้อน | Thai uses vowel **อ**; Units claim `โ-=o`. Reading `ron` is correct; tags/units lie about the glyph. |
| `mong` | มอง | Thai shows **อ**; Rules/Units use `implicit-o` as if written `มง`. Reading `mong` OK. |
| `fim` | ฟิล์ม | Thai has silent `ล์`; units only `ฟ+ิ+ม` — reading `fim`/`film` OK, silent mark invisible in unit breakdown. |
| `mai` | ไมล์ | Same silent-mark class as `fim`, but here silent `ล` is wrongly kept as onset (critical). |
| `je` / `re` | เจอ / เรอ | Units label `cluster:C+อ` with อ contributing `∅` roman — works for `joe`/`roe` but is a confusing cluster model for a vowel-carrier. |
| `naam` | น้ำ | Phantom `ม` in consonant list (critical RuleRoman). |
| `khao2` | เข้า | Missing `า` / `เ-า` in vowel list (critical). |
| `bpeert` | เปิด | Missing `ิ` + `compound-oe-i` (critical). |
| `thiang` | เที่ยง | Missing `เ-ีย` as one vowel; `ย` treated as onset (critical). |
| `suay` | สวย | `w-vowel-ua` not excluding `ว`/`ย` from onset cluster (critical). |

### Stale ids (Thai/Accepted OK; id names lie)

These do **not** break grading if Accepted matches Thai, but confuse audits and SRS:

| id | Actual Thai | Actual reading |
| --- | --- | --- |
| `bii` | บาน | `baan` |
| `jaa` | จาน | `jaan` |
| `me` | เมน | `men` |
| `ngii` | งู | `nguu` |
| `nu` | ลุง | `lung` |
| `pu` | มุม | `mum` |
| `nge` | เงา | `ngao` |
| `faa` | ฟัน | `fan` |

---

## 4. Words that look OK

**Count: 114** (147 − 13 critical − 20 medium; disjoint)

Ids only:

`gaa`, `maa`, `naa`, `ka`, `mi`, `mii`, `ke`, `baa`, `be`, `bpe`, `paa`, `pii`, `bo`, `bpo`, `ko`, `mo`, `no`, `dte`, `dtii`, `dto`, `taa`, `laa`, `le`, `lo`, `raa`, `ngaa`, `bpaak`, `gin`, `haa`, `khaa`, `kon`, `maak`, `naan`, `phaa`, `dtaak`, `jaak`, `phaan`, `waa`, `yaa`, `chaa`, `chaan`, `dii`, `din`, `duu`, `thaa`, `tho`, `aa_carrier`, `e_carrier`, `ii_carrier`, `o_carrier`, `bae`, `gae`, `nae`, `phae`, `puu`, `bai`, `bpai`, `gai`, `jai`, `ao`, `bao`, `mao`, `rao`, `bpit`, `khii`, `mu`, `ni`, `we`, `bon`, `jon`, `khon`, `nom`, `pho`, `ro`, `fuu`, `khaa2`, `saa`, `sii`, `sii_zee`, `faa2`, `fon`, `phaa2`, `phii`, `thaa2`, `thung`, `maa_dog`, `muu`, `ngi`, `nuu`, `baan`, `khaa_tone`, `khao`, `kho`, `klaang`, `nii`, `raan`, `som`, `bpong`, `kii`, `mae`, `ngo`, `tone_ek`, `tone_tho`, `card_high`, `card_low`, `card_mid`, `bplaa`, `gaafae`, `maew`, `nakrian`, `phe`, `roongraem`, `roongrian`, `thanon`

Medium word ids (20), for cross-check:  
`jing`, `nge`, `ron`, `mong`, `fim`, `re`, `sawasdee`, `ahaan`, `khopkhun`, `awk`, `jo`, `khaao`, `bii`, `jaa`, `me`, `ngii`, `nu`, `pu`, `faa`, `je`

---

## 5. Recommended unit-test cases

Format: `id` + typed input → expected **correct** / **incorrect**.

### Must reject (garbage / incomplete currently Accepted)

| id | typed | expected |
| --- | --- | --- |
| `ma` | `mnaaa` | incorrect |
| `na` | `naa` | incorrect |
| `ki` | `klio` | incorrect |
| `lae` | `laea` | incorrect |
| `naam` | `namm` | incorrect |
| `che` | `cheaa` | incorrect |
| `che` | `chaao` | incorrect |
| `suay` | `swyuay` | incorrect |
| `mai` | `mlai` | incorrect |
| `silent_ex` | `thmoe` | incorrect |
| `khao2` | `khe` | incorrect |
| `ne` | `nye` | incorrect |
| `thiang` | `thyeiing` | incorrect |
| `bpeert` | `bpet` | incorrect |
| `bpeert` | `pet` | incorrect |
| `bpeert` | `bpeert` | incorrect |
| `nge` | `ngaao` | incorrect |

### Must accept (correct readings)

| id | typed | expected |
| --- | --- | --- |
| `ma` | `maana` | correct |
| `na` | `naanaa` | correct |
| `ki` | `kilo` | correct |
| `ki` | `kiloo` | correct |
| `lae` | `lae` | correct |
| `naam` | `naam` | correct |
| `che` | `chao` | correct |
| `suay` | `suay` | correct |
| `suay` | `suai` | correct |
| `mai` | `mai` | correct |
| `mai` | `mail` | correct |
| `silent_ex` | `term` | correct |
| `khao2` | `khao` | correct |
| `ne` | `noei` | correct |
| `thiang` | `thiang` | correct |
| `bpeert` | `bpoet` | correct |
| `bpeert` | `poet` | correct |
| `jing` | `jing` | correct |
| `nge` | `ngao` | correct |
| `maa_dog` | `maa` | correct |
| `maa_dog` | `hmaa` | incorrect |
| `bpit` | `bpit` | correct |
| `ni` | `nin` | correct |
| `sawasdee` | `sawatdii` | correct |
| `sawasdee` | `sawadee` | correct (after adding alternate) |
| `khao` | `khao` | correct |
| `awk` | `awk` | correct |
| `fim` | `fim` | correct |
| `phe` | `phloen` | correct |

### Regression: simple words still green

| id | typed | expected |
| --- | --- | --- |
| `gaa` | `kaa` | correct |
| `paa` | `bpaa` | correct |
| `dtii` | `dtii` | correct |
| `gin` | `kin` | correct |
| `muu` | `muu` | correct |
| `bplaa` | `bplaa` | correct |
| `klaang` | `klaang` | correct |

---

## Fix-pass priority (for implementers)

1. **Stop promoting `buildRomanFromUnits` mashups into Accepted** when SpecAlternates exist — or fix `autoReadingUnits` for multi-syllable / `ำ` / `-วย` / silent `์` / `เ-ีย` / `แ-ะ` / `เ-า`.
2. Patch the 13 critical WORD_SPECS (vowels, consonants, `readingUnits`, `compound-oe-i` on `เปิด`).
3. Remove garbage strings from Accepted (`mnaaa`, `klio`, `swyuay`, `mlai`, `thmoe`, `thyeiing`, `laea`, `namm`, `cheaa`, `khe`, `nye`, bare `naa` for `นานา`).
4. Add high-value learner alternates (`sawadee`, `rer`, `bpoet`, …).
5. Rename stale ids when convenient (`bii`→`baan`, etc.).
