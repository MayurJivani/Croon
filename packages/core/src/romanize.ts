// Romanisation for lyrics in scripts a singer may not read: Devanagari, Gurmukhi, Tamil, Hangul
// and Japanese kana. Readable spellings for singing along, not scholarly transliteration: no
// diacritics, and Hindi's silent inherent vowel is dropped the way people write it in Latin
// ("dil" not "dila"). Kanji need a dictionary, so they pass through unchanged.

const BRAHMIC = {
  // Devanagari (Hindi, Marathi, Nepali)
  deva: {
    cons: { क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'n', च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n', ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n', त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n', प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm', य: 'y', र: 'r', ल: 'l', व: 'v', श: 'sh', ष: 'sh', स: 's', ह: 'h', क़: 'q', ख़: 'kh', ग़: 'gh', ज़: 'z', ड़: 'r', ढ़: 'rh', फ़: 'f', ळ: 'l' } as Record<string, string>,
    vowels: { अ: 'a', आ: 'aa', इ: 'i', ई: 'ee', उ: 'u', ऊ: 'oo', ऋ: 'ri', ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au', ऑ: 'o' } as Record<string, string>,
    signs: { 'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o' } as Record<string, string>,
    virama: '्', nukta: '़', nasal: { 'ं': 'n', 'ँ': 'n', 'ः': 'h' } as Record<string, string>,
    digits: '०१२३४५६७८९',
  },
  // Gurmukhi (Punjabi)
  guru: {
    cons: { ਕ: 'k', ਖ: 'kh', ਗ: 'g', ਘ: 'gh', ਙ: 'n', ਚ: 'ch', ਛ: 'chh', ਜ: 'j', ਝ: 'jh', ਞ: 'n', ਟ: 't', ਠ: 'th', ਡ: 'd', ਢ: 'dh', ਣ: 'n', ਤ: 't', ਥ: 'th', ਦ: 'd', ਧ: 'dh', ਨ: 'n', ਪ: 'p', ਫ: 'ph', ਬ: 'b', ਭ: 'bh', ਮ: 'm', ਯ: 'y', ਰ: 'r', ਲ: 'l', ਵ: 'v', ੜ: 'r', ਸ: 's', ਹ: 'h', ਸ਼: 'sh', ਖ਼: 'kh', ਗ਼: 'gh', ਜ਼: 'z', ਫ਼: 'f', ਲ਼: 'l' } as Record<string, string>,
    vowels: { ਅ: 'a', ਆ: 'aa', ਇ: 'i', ਈ: 'ee', ਉ: 'u', ਊ: 'oo', ਏ: 'e', ਐ: 'ai', ਓ: 'o', ਔ: 'au' } as Record<string, string>,
    signs: { 'ਾ': 'aa', 'ਿ': 'i', 'ੀ': 'ee', 'ੁ': 'u', 'ੂ': 'oo', 'ੇ': 'e', 'ੈ': 'ai', 'ੋ': 'o', 'ੌ': 'au' } as Record<string, string>,
    virama: '੍', nukta: '਼', nasal: { 'ਂ': 'n', 'ੰ': 'n', 'ਃ': 'h' } as Record<string, string>,
    digits: '੦੧੨੩੪੫੬੭੮੯',
  },
  // Tamil
  taml: {
    cons: { க: 'k', ங: 'ng', ச: 'ch', ஞ: 'nj', ட: 't', ண: 'n', த: 'th', ந: 'n', ப: 'p', ம: 'm', ய: 'y', ர: 'r', ல: 'l', வ: 'v', ழ: 'zh', ள: 'l', ற: 'r', ன: 'n', ஜ: 'j', ஷ: 'sh', ஸ: 's', ஹ: 'h' } as Record<string, string>,
    vowels: { அ: 'a', ஆ: 'aa', இ: 'i', ஈ: 'ee', உ: 'u', ஊ: 'oo', எ: 'e', ஏ: 'e', ஐ: 'ai', ஒ: 'o', ஓ: 'o', ஔ: 'au' } as Record<string, string>,
    signs: { 'ா': 'aa', 'ி': 'i', 'ீ': 'ee', 'ு': 'u', 'ூ': 'oo', 'ெ': 'e', 'ே': 'e', 'ை': 'ai', 'ொ': 'o', 'ோ': 'o', 'ௌ': 'au' } as Record<string, string>,
    virama: '்', nukta: '', nasal: { 'ஂ': 'm', 'ஃ': 'h' } as Record<string, string>,
    digits: '௦௧௨௩௪௫௬௭௮௯',
  },
};
type Brahmic = (typeof BRAHMIC)['deva'];
// NFC splits precomposed nukta letters (फ़ becomes फ + ़), so the tables are keyed the same way.
for (const sys of Object.values(BRAHMIC)) for (const k of Object.keys(sys.cons)) sys.cons[k.normalize('NFC')] = sys.cons[k];

/** One word of a Brahmic script as syllables: consonant (+ vowel sign | virama | inherent a). */
function brahmicWord(word: string, s: Brahmic, schwaDelete: boolean): string {
  const ch = [...word.normalize('NFC')];
  type Syl = { c: string; v: string; inherent: boolean };
  const syl: (Syl | string)[] = [];
  for (let i = 0; i < ch.length; i++) {
    let c = ch[i];
    if (s.nukta && ch[i + 1] === s.nukta) c += ch[++i];
    if (s.cons[c] !== undefined) {
      const next = ch[i + 1];
      if (next === s.virama) {
        syl.push({ c: s.cons[c], v: '', inherent: false });
        i++;
      } else if (next !== undefined && s.signs[next] !== undefined) {
        syl.push({ c: s.cons[c], v: s.signs[next], inherent: false });
        i++;
      } else syl.push({ c: s.cons[c], v: 'a', inherent: true });
    } else if (s.vowels[c] !== undefined) syl.push({ c: '', v: s.vowels[c], inherent: false });
    else if (s.nasal[c] !== undefined) syl.push(s.nasal[c]);
    else if (s.digits.includes(c)) syl.push(String(s.digits.indexOf(c)));
    else if (c !== s.virama && c !== '‍' && c !== '‌') syl.push(c);
  }
  if (schwaDelete) {
    // Hindi drops the inherent vowel at the end of a word, and in the middle where a vowel comes
    // before and a full syllable after (the V C(a) C V pattern): "dilavaale" is sung "dilwaale".
    const isSyl = (x: Syl | string | undefined): x is Syl => typeof x === 'object';
    const last = syl.findLastIndex(isSyl);
    if (last > 0 && isSyl(syl[last]) && (syl[last] as Syl).inherent && syl.filter(isSyl).length > 1) (syl[last] as Syl).v = '';
    for (let i = syl.length - 2; i > 0; i--) {
      const [p, x, n] = [syl[i - 1], syl[i], syl[i + 1]];
      if (isSyl(x) && x.inherent && x.c && isSyl(p) && p.v && isSyl(n) && n.c && n.v) x.v = '';
    }
  }
  const out = syl.map((x) => (typeof x === 'string' ? x : x.c + x.v)).join('');
  // Lyric sheets write a word-final long vowel short: "mera", "hi", "tu", not "meraa", "hee", "too".
  return schwaDelete ? out.replace(/aa$/, 'a').replace(/ee$/, 'i').replace(/oo$/, 'u') : out;
}

// ---- Hangul: Revised Romanization, syllable by syllable ------------------------------------
const L = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const V = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const T = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
function hangul(text: string): string {
  let out = '';
  for (const c of text) {
    const code = c.codePointAt(0)! - 0xac00;
    if (code < 0 || code > 11171) {
      out += c;
      continue;
    }
    const l = Math.floor(code / 588), v = Math.floor((code % 588) / 28), t = code % 28;
    out += L[l] + V[v] + T[t];
  }
  return out;
}

// ---- Kana: Hepburn ----------------------------------------------------------------------------
const KANA: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o', か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko', さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to', な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no', は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo', や: 'ya', ゆ: 'yu', よ: 'yo', ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro', わ: 'wa', を: 'o', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo', だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo', ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po', ゔ: 'vu',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
};
const SMALL_Y: Record<string, string> = { ゃ: 'ya', ゅ: 'yu', ょ: 'yo' };
function kana(text: string): string {
  // Katakana to hiragana first: the same sounds, one table.
  const h = [...text].map((c) => {
    const n = c.codePointAt(0)!;
    return n >= 0x30a1 && n <= 0x30f6 ? String.fromCodePoint(n - 0x60) : c;
  });
  let out = '';
  for (let i = 0; i < h.length; i++) {
    const c = h[i], next = h[i + 1];
    if (c === 'っ') {
      const r = KANA[next] ?? '';
      out += r.startsWith('ch') ? 't' : r[0] ?? '';
      continue;
    }
    if (c === 'ー') {
      out += out.at(-1) ?? '';
      continue;
    }
    let r = KANA[c];
    if (r === undefined) {
      out += c;
      continue;
    }
    if (next && SMALL_Y[next]) {
      const y = SMALL_Y[next];
      r = /^(sh|ch|j)/.test(r) ? r.slice(0, -1) + y.slice(1) : r.slice(0, -1) + y;
      i++;
    }
    out += r;
  }
  return out;
}

const SCRIPT = { deva: /[ऀ-ॿ]/, guru: /[਀-੿]/, taml: /[஀-௿]/, hang: /[가-힯]/, kana: /[぀-ヿ]/ };

/** True when the text is in a script this module romanises. */
export const needsRoman = (text: string) => Object.values(SCRIPT).some((r) => r.test(text));

/** A readable Latin spelling of a word or line; text already in Latin script comes back unchanged. */
export function romanize(text: string): string {
  if (!needsRoman(text)) return text;
  let s = text;
  if (SCRIPT.hang.test(s)) s = hangul(s);
  if (SCRIPT.kana.test(s)) s = kana(s);
  for (const [key, sys] of [['deva', BRAHMIC.deva], ['guru', BRAHMIC.guru], ['taml', BRAHMIC.taml]] as const) {
    if (SCRIPT[key].test(s)) s = s.replace(/[ऀ-௿‌‍]+/g, (w) => brahmicWord(w, sys, key !== 'taml'));
  }
  return s;
}
