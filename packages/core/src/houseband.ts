// The house band: public-domain songs written out as notes, so Croon can play a real full-length
// backing track (synthesised in the browser), time every syllable exactly, and score pitch against
// the actual melody. Nothing here is a recording.
//
// Authoring format
//   melody  "D4:1 | G4:2 B4:.5 +G4:.5"  note:beats; "+" continues the previous syllable (melisma);
//           "r:beats" is a rest; "|" is a bar line for the reader and is ignored.
//   lyrics  one string per verse; syllables separated by spaces; a trailing "-" joins the next
//           syllable into the same word; "/" starts a new lyric line; "かな=roman" gives a romanisation.
//   chords  one entry per bar after the pickup, "|" separated; two chords in a bar split it evenly.
import { joinWords, type Line, type Lyrics, type Word } from './lyrics.ts';

export type Style = 'waltz' | 'pop' | 'swing' | 'ballad' | 'sparse';
type Section = { id: string; pickup: number; melody: string; chords: string; verses: string[]; translation?: string[] };
export type HouseSong = {
  slug: string;
  title: string;
  artist: string;
  year: number;
  language: string;
  genre: string;
  /** Why it is free to use, shown on the song page. */
  rights: string;
  bpm: number;
  meter: number;
  style: Style;
  introBars: number;
  sections: Section[];
  /** Which section and verse plays, in order. */
  form: [string, number][];
  difficulty: 1 | 2 | 3 | 4 | 5;
};

const SONGS: HouseSong[] = [
  {
    slug: 'happy-birthday', title: 'Happy Birthday to You', artist: 'Mildred & Patty Hill (trad.)', year: 1893, language: 'en', genre: 'Classics',
    rights: 'Public domain in the US since the 2016 settlement of Marya v. Warner/Chappell; melody from 1893.',
    bpm: 100, meter: 3, style: 'waltz', introBars: 2, difficulty: 1,
    sections: [{
      id: 'v', pickup: 1,
      melody: 'G4:.75 G4:.25 | A4:1 G4:1 C5:1 | B4:2 G4:.75 G4:.25 | A4:1 G4:1 D5:1 | C5:2 G4:.75 G4:.25 | G5:1 E5:1 C5:1 | B4:1 A4:1 F5:.75 F5:.25 | E5:1 C5:1 D5:1 | C5:2',
      chords: 'C | G7 | G7 | C | C7 | F | C G7 | C',
      verses: [
        'Hap- py birth- day to you / Hap- py birth- day to you / Hap- py birth- day dear sing- er / Hap- py birth- day to you',
        'Hap- py birth- day to you / Hap- py birth- day to you / Hap- py birth- day dear old friend / Hap- py birth- day to you',
      ],
    }],
    form: [['v', 0], ['v', 1]],
  },
  {
    slug: 'twinkle-twinkle', title: 'Twinkle, Twinkle, Little Star', artist: 'Jane Taylor (trad. melody)', year: 1806, language: 'en', genre: 'Classics',
    rights: 'Poem published 1806; melody is the 18th-century French air "Ah! vous dirai-je, maman".',
    bpm: 96, meter: 4, style: 'ballad', introBars: 2, difficulty: 1,
    sections: [{
      id: 'v', pickup: 0,
      melody: 'C4:1 C4:1 G4:1 G4:1 | A4:1 A4:1 G4:2 | F4:1 F4:1 E4:1 E4:1 | D4:1 D4:1 C4:2 | G4:1 G4:1 F4:1 F4:1 | E4:1 E4:1 D4:2 | G4:1 G4:1 F4:1 F4:1 | E4:1 E4:1 D4:2 | C4:1 C4:1 G4:1 G4:1 | A4:1 A4:1 G4:2 | F4:1 F4:1 E4:1 E4:1 | D4:1 D4:1 C4:2',
      chords: 'C | F C | F C | G C | C F | C G | C F | C G | C | F C | F C | G C',
      verses: [
        'Twin- kle twin- kle lit- tle star / How I won- der what you are / Up a- bove the world so high / Like a dia- mond in the sky / Twin- kle twin- kle lit- tle star / How I won- der what you are',
        'When the blaz- ing sun is gone / When he noth- ing shines up- on / Then you show your lit- tle light / Twin- kle twin- kle all the night / Twin- kle twin- kle lit- tle star / How I won- der what you are',
      ],
    }],
    form: [['v', 0], ['v', 1]],
  },
  {
    slug: 'amazing-grace', title: 'Amazing Grace', artist: 'John Newton (words), trad. "New Britain"', year: 1779, language: 'en', genre: 'Gospel',
    rights: 'Words 1779, tune first printed 1829.',
    bpm: 84, meter: 3, style: 'waltz', introBars: 2, difficulty: 2,
    sections: [{
      id: 'v', pickup: 1,
      melody: 'D4:1 | G4:2 B4:.5 +G4:.5 | B4:2 A4:1 | G4:2 E4:1 | D4:2 D4:1 | G4:2 B4:.5 +G4:.5 | B4:2 A4:1 | D5:5 B4:1 | D5:2 B4:.5 +G4:.5 | B4:2 A4:1 | G4:2 E4:1 | D4:2 D4:1 | G4:2 B4:.5 +G4:.5 | B4:2 A4:1 | G4:3 | r:2',
      chords: 'G | G | C | G | G | G | D | D | G | G7 | C | G | G | D | G | G',
      verses: [
        'A- ma- zing grace how sweet the sound / That saved a wretch like me / I once was lost but now am found / Was blind but now I see',
        "'Twas grace that taught my heart to fear / And grace my fears re- lieved / How pre- cious did that grace ap- pear / The hour I first be- lieved",
        'Through ma- ny dan- gers, toils and snares / I have al- rea- dy come / \'Tis grace hath brought me safe thus far / And grace will lead me home',
      ],
    }],
    form: [['v', 0], ['v', 1], ['v', 2]],
  },
  {
    slug: 'joyful-joyful', title: 'Joyful, Joyful (Ode to Joy)', artist: 'Beethoven, words by Henry van Dyke', year: 1907, language: 'en', genre: 'Classical',
    rights: 'Melody from Beethoven\'s Ninth (1824); English words by van Dyke (1907, author died 1933).',
    bpm: 108, meter: 4, style: 'pop', introBars: 2, difficulty: 2,
    sections: [{
      id: 'v', pickup: 0,
      melody: 'F#4:1 F#4:1 G4:1 A4:1 | A4:1 G4:1 F#4:1 E4:1 | D4:1 D4:1 E4:1 F#4:1 | F#4:1.5 E4:.5 E4:2 | F#4:1 F#4:1 G4:1 A4:1 | A4:1 G4:1 F#4:1 E4:1 | D4:1 D4:1 E4:1 F#4:1 | E4:1.5 D4:.5 D4:2 | E4:1 E4:1 F#4:1 D4:1 | E4:1 F#4:.5 +G4:.5 F#4:1 D4:1 | E4:1 F#4:.5 +G4:.5 F#4:1 E4:1 | D4:1 E4:1 A3:2 | F#4:1 F#4:1 G4:1 A4:1 | A4:1 G4:1 F#4:1 E4:1 | D4:1 D4:1 E4:1 F#4:1 | E4:1.5 D4:.5 D4:2',
      chords: 'D | A | D | A D | D | A | D | A D | A | A D | A | D A | D | A | D | A D',
      verses: [
        'Joy- ful, joy- ful, we a- dore thee / God of glo- ry, Lord of love / Hearts un- fold like flow\'rs be- fore thee / Op- \'ning to the sun a- bove / Melt the clouds of sin and sad- ness / Drive the dark of doubt a- way / Giv- er of im- mor- tal glad- ness / Fill us with the light of day',
        'All thy works with joy sur- round thee / Earth and heav\'n re- flect thy rays / Stars and an- gels sing a- round thee / Cen- ter of un- bro- ken praise / Field and for- est, vale and moun- tain / Flow\'r- y mea- dow, flash- ing sea / Sing- ing bird and flow- ing foun- tain / Call us to re- joice in thee',
      ],
    }],
    form: [['v', 0], ['v', 1]],
  },
  {
    slug: 'jingle-bells', title: 'Jingle Bells', artist: 'James Lord Pierpont', year: 1857, language: 'en', genre: 'Holiday',
    rights: 'Published 1857.',
    bpm: 120, meter: 4, style: 'pop', introBars: 2, difficulty: 2,
    sections: [
      {
        id: 'v', pickup: 0,
        melody: 'C4:1 A4:1 G4:1 F4:1 | C4:3 C4:.5 C4:.5 | C4:1 A4:1 G4:1 F4:1 | D4:4 | D4:1 Bb4:1 A4:1 G4:1 | E4:4 | C5:1 C5:1 Bb4:1 G4:1 | A4:4 | C4:1 A4:1 G4:1 F4:1 | C4:4 | C4:1 A4:1 G4:1 F4:1 | D4:4 | D4:1 Bb4:1 A4:1 G4:1 | C5:1 C5:1 C5:1 C5:1 | D5:1 C5:1 Bb4:1 G4:1 | F4:1 F4:3',
        chords: 'F | F | F | Gm | Gm | C | C7 | F | F | F | F | Gm | Gm | C | C7 | F C7',
        verses: ['Dash- ing through the snow in a one horse o- pen sleigh / O\'er the fields we go, laugh- ing all the way / Bells on bob- tail ring, mak- ing spir- its bright / What fun it is to ride and sing a sleigh- ing song to- night'],
      },
      {
        id: 'c', pickup: 0,
        melody: 'A4:1 A4:1 A4:2 | A4:1 A4:1 A4:2 | A4:1 C5:1 F4:1.5 G4:.5 | A4:4 | Bb4:1 Bb4:1 Bb4:1.5 Bb4:.5 | Bb4:1 A4:1 A4:1 A4:.5 A4:.5 | A4:1 G4:1 G4:1 A4:1 | G4:2 C5:2 | A4:1 A4:1 A4:2 | A4:1 A4:1 A4:2 | A4:1 C5:1 F4:1.5 G4:.5 | A4:4 | Bb4:1 Bb4:1 Bb4:1 Bb4:1 | Bb4:1 A4:1 A4:1 A4:.5 A4:.5 | C5:1 C5:1 Bb4:1 G4:1 | F4:4',
        chords: 'F | F | F | F | Bb | F | G7 | C7 | F | F | F | F | Bb | F | C7 | F',
        verses: ['Jin- gle bells, jin- gle bells, jin- gle all the way / Oh what fun it is to ride in a one horse o- pen sleigh, hey! / Jin- gle bells, jin- gle bells, jin- gle all the way / Oh what fun it is to ride in a one horse o- pen sleigh'],
      },
    ],
    form: [['v', 0], ['c', 0], ['c', 0]],
  },
  {
    slug: 'when-the-saints', title: 'When the Saints Go Marching In', artist: 'Traditional spiritual', year: 1896, language: 'en', genre: 'Gospel',
    rights: 'Traditional; earliest printed versions from the 1890s.',
    bpm: 112, meter: 4, style: 'swing', introBars: 2, difficulty: 2,
    sections: [{
      id: 'v', pickup: 3,
      melody: 'C4:1 E4:1 F4:1 | G4:4 | r:1 C4:1 E4:1 F4:1 | G4:4 | r:1 C4:1 E4:1 F4:1 | G4:2 E4:2 | C4:2 E4:2 | D4:4 | r:1 E4:1 E4:1 D4:1 | C4:3 C4:1 | E4:2 G4:1 G4:1 | F4:3 F4:1 | r:1 E4:1 F4:1 G4:1 | E4:2 C4:2 | D4:4 | C4:4 | r:1',
      chords: 'C | C | C | C | C | C | G | G7 | C | C7 | F | F | C | G7 | C | C',
      verses: [
        'Oh when the saints / go march- ing in / Oh when the saints go march- ing in / Oh Lord I want to be in that num- ber / When the saints go march- ing in',
        'Oh when the sun / re- fuse to shine / Oh when the sun re- fuse to shine / Oh Lord I want to be in that num- ber / When the sun re- fuse to shine',
        'Oh when the stars / fall from the sky / Oh when the stars fall from the sky / Oh Lord I want to be in that num- ber / When the stars fall from the sky',
      ],
    }],
    form: [['v', 0], ['v', 1], ['v', 2], ['v', 0]],
  },
  {
    slug: 'clementine', title: 'Oh My Darling, Clementine', artist: 'Percy Montrose (attr.)', year: 1884, language: 'en', genre: 'Folk',
    rights: 'Published 1884.',
    bpm: 104, meter: 3, style: 'waltz', introBars: 2, difficulty: 2,
    sections: [{
      id: 'v', pickup: 1,
      melody: 'F4:.5 F4:.5 | F4:1 C4:1 A4:.5 A4:.5 | A4:1 F4:1 F4:.5 A4:.5 | C5:1 C5:1 Bb4:.5 A4:.5 | G4:2 G4:.5 A4:.5 | Bb4:1 Bb4:1 A4:.5 G4:.5 | A4:1 F4:1 F4:.5 A4:.5 | G4:1 C4:1 E4:.5 G4:.5 | F4:2',
      chords: 'F | F | F | C | C7 | F | C7 | F',
      verses: [
        'In a cav- ern, in a can- yon, ex- ca- vat- ing for a mine / Dwelt a min- er, for- ty- nin- er, and his daugh- ter Clem- en- tine',
        'Oh my dar- ling, oh my dar- ling, oh my dar- ling Clem- en- tine / You are lost and gone for- ev- er, dread- ful sor- ry, Clem- en- tine',
        'Light she was and like a fair- y, and her shoes were num- ber nine / Her- ring box- es with- out top- ses, san- dals were for Clem- en- tine',
      ],
    }],
    form: [['v', 0], ['v', 1], ['v', 2], ['v', 1]],
  },
  {
    slug: 'sakura-sakura', title: 'Sakura Sakura', artist: 'Traditional (Japan)', year: 1888, language: 'ja', genre: 'Folk',
    rights: 'Traditional Japanese song; current words first published 1888.',
    bpm: 72, meter: 4, style: 'sparse', introBars: 2, difficulty: 3,
    sections: [{
      id: 'v', pickup: 0,
      melody: 'A4:1 A4:1 B4:2 | A4:1 A4:1 B4:2 | A4:1 B4:1 C5:1 B4:1 | A4:1 B4:.5 +A4:.5 F4:2 | E4:1 C4:1 E4:1 F4:1 | E4:1 E4:.5 +C4:.5 B3:2 | A4:1 B4:1 C5:1 B4:1 | A4:1 B4:.5 +A4:.5 F4:2 | E4:1 C4:1 E4:1 F4:1 | E4:1 E4:.5 +C4:.5 B3:2 | A4:1 A4:1 B4:2 | A4:1 A4:1 B4:2 | E4:1 F4:1 B4:.5 +A4:.5 F4:1 | E4:4',
      chords: 'Am | Am | Am | Dm | Am | E | Am | Dm | Am | E | Am | Am | Dm | E',
      verses: ['さ=sa- く=ku- ら=ra さ=sa- く=ku- ら=ra / や=ya- よ=yo- い=i の=no そ=so- ら=ra は=wa / み=mi- わ=wa- た=ta- す=su か=ka- ぎ=gi- り=ri / か=ka- す=su- み=mi か=ka く=ku- も=mo か=ka / に=ni- お=o- い=i ぞ=zo い=i- ず=zu- る=ru / い=i- ざ=za- や=ya い=i- ざ=za- や=ya / み=mi- に=ni ゆ=yu- か=ka- ん=n'],
      translation: ['Cherry blossoms, cherry blossoms', 'Across the spring sky', 'As far as the eye can see', 'Is it mist, or is it cloud?', 'Their scent drifts out', 'Come now, come now', 'Let us go and see'],
    }],
    form: [['v', 0], ['v', 0]],
  },
  {
    slug: 'silent-night', title: 'Silent Night', artist: 'Franz Gruber, words by Joseph Mohr (trans. John F. Young)', year: 1818, language: 'en', genre: 'Holiday',
    rights: 'Composed 1818; English translation 1859.',
    bpm: 138, meter: 6, style: 'ballad', introBars: 2, difficulty: 3,
    sections: [{
      id: 'v', pickup: 0,
      melody: 'G4:3 A4:1 +G4:2 | E4:6 | G4:3 A4:1 +G4:2 | E4:6 | D5:4 D5:2 | B4:6 | C5:4 C5:2 | G4:6 | A4:4 A4:2 | C5:3 B4:1 +A4:2 | G4:3 A4:1 G4:2 | E4:6 | A4:4 A4:2 | C5:3 B4:1 A4:2 | G4:3 A4:1 G4:2 | E4:6 | D5:4 D5:2 | F5:3 D5:1 B4:2 | C5:6 | +E5:6 | C5:3 G4:1 E4:2 | G4:3 F4:1 +D4:2 | C4:12',
      chords: 'C | C | C | C | G | G | C | C | F | F | C | C | F | F | C | C | G | G7 | C | C | C | G7 | C | C',
      verses: [
        'Si- lent night, ho- ly night / All is calm, all is bright / Round yon vir- gin mo- ther and child / Ho- ly in- fant so ten- der and mild / Sleep in heav- en- ly peace / Sleep in heav- en- ly peace',
        'Si- lent night, ho- ly night / Shep- herds quake at the sight / Glo- ries stream from heav- en a- far / Heav- en- ly hosts sing Al- le- lu- ia / Christ the Sav- ior is born / Christ the Sav- ior is born',
      ],
    }],
    form: [['v', 0], ['v', 1]],
  },
];

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function noteToMidi(n: string): number {
  const m = n.match(/^([A-G])(#|b)?(-?\d)$/);
  if (!m) throw new Error(`bad note ${n}`);
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

type Tok = { rest: boolean; cont: boolean; midi: number; beats: number };
export function parseMelody(s: string): Tok[] {
  return s.split(/\s+/).filter((t) => t && t !== '|').map((t) => {
    const cont = t.startsWith('+');
    const [n, b] = t.replace(/^\+/, '').split(':');
    const beats = Number(b);
    if (!(beats > 0)) throw new Error(`bad duration in ${t}`);
    return n === 'r' ? { rest: true, cont: false, midi: 0, beats } : { rest: false, cont, midi: noteToMidi(n), beats };
  });
}

/** Syllables of one verse, each with whether it starts a new lyric line. */
export function parseVerse(v: string) {
  const out: { text: string; roman?: string; newLine: boolean }[] = [];
  let newLine = true;
  for (const tok of v.split(/\s+/).filter(Boolean)) {
    if (tok === '/') {
      newLine = true;
      continue;
    }
    // In "さ=sa-" the joining hyphen trails the romanisation but belongs to the whole syllable.
    const join = tok.endsWith('-') ? '-' : '';
    const [text, roman] = tok.replace(/-$/, '').split('=');
    out.push({ text: text + join, roman: roman === undefined ? undefined : roman + join, newLine });
    newLine = false;
  }
  return out;
}

const QUALITY: Record<string, number[]> = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6] };
export function chordNotes(sym: string): { root: number; tones: number[] } {
  const m = sym.match(/^([A-G])(#|b)?(m7|maj7|m|7|dim)?$/);
  if (!m) throw new Error(`bad chord ${sym}`);
  const root = PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return { root, tones: QUALITY[m[3] ?? ''].map((i) => root + i) };
}

export type BandEvent = { t: number; d: number; voice: 'lead' | 'bass' | 'keys' | 'kick' | 'snare' | 'hat' | 'click'; midi: number; vel: number };
export type Compiled = { song: HouseSong; lyrics: Lyrics; events: BandEvent[]; duration: number; beat: number };

/** Turns a song into timed lyrics (with pitch targets) and the band's note events. */
export function compile(song: HouseSong): Compiled {
  const beat = 60 / song.bpm;
  const sec = (b: number) => b * beat;
  const sections = new Map(song.sections.map((s) => [s.id, s]));
  const events: BandEvent[] = [];
  const lines: Line[] = [];
  const chordBars: { at: number; sym: string; beats: number }[] = [];
  const first = sections.get(song.form[0][0])!;
  let cursor = song.introBars * song.meter - first.pickup;

  for (const [sid, vi] of song.form) {
    const s = sections.get(sid)!;
    const toks = parseMelody(s.melody);
    const syl = parseVerse(s.verses[vi]);
    const sung = toks.filter((t) => !t.rest && !t.cont).length;
    if (sung !== syl.length) throw new Error(`${song.slug} ${sid}/${vi}: ${sung} notes for ${syl.length} syllables`);
    let b = cursor, si = 0, lineIdx = -1;
    let word: Word | null = null;
    for (const tk of toks) {
      if (tk.rest) {
        b += tk.beats;
        continue;
      }
      if (!tk.cont) {
        const s1 = syl[si++];
        if (s1.newLine) {
          lineIdx++;
          lines.push({ t: sec(b), end: 0, words: [], part: 0, translation: s.translation?.[lineIdx % (s.translation?.length || 1)] });
        }
        word = { t: sec(b), d: sec(tk.beats), text: s1.text, note: tk.midi, ...(s1.roman ? { roman: s1.roman } : {}) };
        lines[lines.length - 1].words.push(word);
      } else if (word) {
        // A melisma: the syllable is held across another pitch.
        word.notes ??= [{ t: word.t, d: word.d, note: word.note! }];
        word.notes.push({ t: sec(b), d: sec(tk.beats), note: tk.midi });
        word.d = sec(b + tk.beats) - word.t;
      }
      events.push({ t: sec(b), d: sec(tk.beats) * 0.95, voice: 'lead', midi: tk.midi, vel: 0.8 });
      b += tk.beats;
    }
    const bars = s.chords.split('|').map((x) => x.trim().split(/\s+/));
    bars.forEach((syms, i) => syms.forEach((sym, j) => chordBars.push({ at: cursor + s.pickup + i * song.meter + (j * song.meter) / syms.length, sym, beats: song.meter / syms.length })));
    cursor = b;
  }
  for (const ln of lines) {
    const last = ln.words[ln.words.length - 1];
    ln.end = last.t + last.d;
  }

  // Intro holds the first chord; the outro holds the last chord for two bars.
  const totalBeats = Math.max(cursor, chordBars[chordBars.length - 1].at + chordBars[chordBars.length - 1].beats) + song.meter * 2;
  chordBars.unshift({ at: 0, sym: chordBars[0].sym, beats: chordBars[0].at });
  const lastC = chordBars[chordBars.length - 1];
  chordBars.push({ at: lastC.at + lastC.beats, sym: lastC.sym, beats: totalBeats - (lastC.at + lastC.beats) });
  for (const c of chordBars) if (c.beats > 0) arrange(song, c, events, sec);
  // Count-in clicks on the last intro bar so singers know when to come in.
  const introEnd = song.introBars * song.meter;
  for (let k = 0; k < song.meter; k++) events.push({ t: sec(introEnd - song.meter + k), d: 0.05, voice: 'click', midi: 0, vel: k === 0 ? 1 : 0.6 });
  events.sort((a, b) => a.t - b.t);

  return { song, lyrics: { lines, wordTimed: true, pitched: true }, events, duration: sec(totalBeats), beat };
}

/** One chord's worth of accompaniment in the song's style. */
function arrange(song: HouseSong, c: { at: number; sym: string; beats: number }, ev: BandEvent[], sec: (b: number) => number) {
  const { root, tones } = chordNotes(c.sym);
  const voiced = tones.map((n) => 55 + ((n - 55) % 12 + 12) % 12).sort((a, b) => a - b); // close voicing from G3
  const bass = 36 + root; // C2 region
  const push = (beat: number, d: number, voice: BandEvent['voice'], midi: number, vel: number) => {
    if (beat < c.at + c.beats - 1e-6) ev.push({ t: sec(beat), d: sec(d), voice, midi, vel });
  };
  for (let b = c.at; b < c.at + c.beats - 1e-6; b += 1) {
    const inBar = Math.round((b % song.meter) * 1000) / 1000;
    switch (song.style) {
      case 'waltz':
        if (inBar === 0) push(b, 1, 'bass', bass, 0.9);
        else voiced.forEach((n) => push(b, 0.6, 'keys', n, 0.45));
        if (inBar === 0) push(b, 0.1, 'kick', 0, 0.5);
        break;
      case 'pop':
        if (inBar === 0 || inBar === 2) push(b, 1.5, 'bass', inBar === 0 ? bass : bass + 7, 0.85);
        if (inBar === 0) voiced.forEach((n) => push(b, Math.min(c.beats, song.meter), 'keys', n, 0.35));
        push(b, 0.1, inBar === 1 || inBar === 3 ? 'snare' : 'kick', 0, 0.7);
        push(b, 0.05, 'hat', 0, 0.35);
        push(b + 0.5, 0.05, 'hat', 0, 0.2);
        break;
      case 'swing': {
        const walk = [0, 4, 7, 9];
        push(b, 0.9, 'bass', bass + walk[inBar % 4], 0.85);
        if (inBar === 1 || inBar === 3) voiced.forEach((n) => push(b, 0.5, 'keys', n, 0.4));
        push(b, 0.05, 'hat', 0, 0.4);
        push(b + 2 / 3, 0.05, 'hat', 0, 0.25);
        if (inBar === 1 || inBar === 3) push(b, 0.1, 'snare', 0, 0.45);
        break;
      }
      case 'ballad': {
        // Arpeggiated keys; compound meters (6) group in threes.
        if (inBar === 0 || (song.meter === 6 && inBar === 3)) push(b, song.meter === 6 ? 3 : 2, 'bass', bass, 0.75);
        const arp = [voiced[0], voiced[1], voiced[2], voiced[1]];
        const steps = song.meter === 6 ? 1 : 0.5;
        for (let k = 0; k < 1; k += steps) push(b + k, steps * 1.6, 'keys', arp[Math.round((inBar + k) / steps) % arp.length] + 12, 0.32);
        break;
      }
      case 'sparse':
        if (inBar === 0) {
          push(b, song.meter, 'bass', bass, 0.6);
          voiced.forEach((n, i) => push(b + i * 0.33, song.meter - i * 0.33, 'keys', n + 12, 0.3));
        }
        break;
    }
  }
}

export const HOUSE_BAND = SONGS;
export const houseSong = (slug: string) => SONGS.find((s) => s.slug === slug);

/** Display text of a verse line for search: "Hap- py" becomes "Happy". */
export const houseLyricText = (song: HouseSong) =>
  song.sections.flatMap((s) => s.verses.map((v) => joinWords(parseVerse(v).map((x) => x.text)))).join('\n');
