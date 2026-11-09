// Timed lyrics: one model for LRC (line level), enhanced LRC (word level), UltraStar (word level
// plus pitch) and the house band's own songs. Times are seconds on the song's own clock.

export type Word = {
  /** Start, seconds. */
  t: number;
  /** Duration, seconds. */
  d: number;
  text: string;
  /** Target pitch as a MIDI note number, when the source has one (UltraStar, house band). */
  note?: number;
  /** A held syllable sung over several pitches (a melisma). When present it replaces `note`. */
  notes?: Target[];
  /** Romanised spelling, shown under scripts the singer may not read. */
  roman?: string;
};

/** One pitch the singer is meant to hit, for scoring and the pitch lane. */
export type Target = { t: number; d: number; note: number };

export type Line = {
  t: number;
  end: number;
  words: Word[];
  /** Duet part: 0 = everyone, 1 or 2 = that singer. */
  part: number;
  translation?: string;
};

export type Lyrics = {
  lines: Line[];
  /** True when every word carries its own time. False means only lines are timed and the
   *  player must not pretend otherwise by wiping across words. */
  wordTimed: boolean;
  /** True when words carry target pitches, so full pitch scoring is possible. */
  pitched: boolean;
};

const TAG = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
const WORD_TAG = /<(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)>/g;
const toSec = (m: string, s: string) => Number(m) * 60 + Number(s.replace(':', '.'));

/** Splits a line into words with evenly spread placeholder times. Only used where no word timing exists. */
function looseWords(text: string, t: number, end: number): Word[] {
  const parts = text.split(/\s+/).filter(Boolean);
  const step = (end - t) / Math.max(1, parts.length);
  return parts.map((w, i) => ({ t: t + i * step, d: step, text: w }));
}

/**
 * Parses LRC. Handles several time tags on one line, `[offset:ms]`, and enhanced LRC word tags
 * (`<mm:ss.xx>word`). `duration` closes the final line; without it the last line gets 6 seconds.
 */
export function parseLrc(text: string, duration?: number): Lyrics {
  let offset = 0;
  const raw: { t: number; body: string }[] = [];
  for (const row of text.split(/\r?\n/)) {
    const off = row.match(/^\[offset:\s*([+-]?\d+)\]/i);
    if (off) offset = Number(off[1]) / 1000;
    const times = [...row.matchAll(TAG)];
    if (!times.length) continue;
    const body = row.replace(TAG, '').trim();
    for (const m of times) raw.push({ t: toSec(m[1], m[2]), body });
  }
  raw.sort((a, b) => a.t - b.t);
  // LRC offset is "lyrics appear this much earlier", so a positive offset subtracts.
  const shifted = raw.map((r) => ({ t: Math.max(0, r.t - offset), body: r.body }));
  const lines: Line[] = [];
  let wordTimed = shifted.length > 0;
  for (let i = 0; i < shifted.length; i++) {
    const { t, body } = shifted[i];
    if (!body) continue; // a blank timed row only marks where the previous line ends
    const end = shifted[i + 1]?.t ?? (duration ?? t + 6);
    const tags = [...body.matchAll(WORD_TAG)];
    let words: Word[];
    if (tags.length) {
      words = [];
      const segs = body.split(WORD_TAG);
      // split() with two capture groups yields [lead, m, s, text, m, s, text, ...]
      for (let k = 1; k + 2 < segs.length + 1; k += 3) {
        const wt = Math.max(0, toSec(segs[k], segs[k + 1]) - offset);
        const txt = (segs[k + 2] ?? '').trim();
        if (txt) words.push({ t: wt, d: 0, text: txt });
      }
      for (let k = 0; k < words.length; k++) words[k].d = Math.max(0.05, (words[k + 1]?.t ?? end) - words[k].t);
      if (segs[0].trim()) words.unshift(...looseWords(segs[0].trim(), t, words[0]?.t ?? end));
    } else {
      wordTimed = false;
      words = looseWords(body, t, end);
    }
    if (words.length) lines.push({ t, end, words, part: 0 });
  }
  return { lines, wordTimed: wordTimed && lines.length > 0, pitched: false };
}

export type UltrastarMeta = { title?: string; artist?: string; bpm: number; gap: number; audio?: string };

/**
 * Parses an UltraStar .txt: `: start length pitch text` notes (`*` golden, `F` freestyle,
 * `R`/`G` rap variants), `- beat` line breaks, `P1`/`P2` duet parts. Pitch 0 is C4 (MIDI 60).
 * A beat lasts 60 / (BPM * 4) seconds, as UltraStar defines it.
 */
export function parseUltrastar(text: string): { meta: UltrastarMeta; lyrics: Lyrics } {
  const meta: UltrastarMeta = { bpm: 0, gap: 0 };
  const lines: Line[] = [];
  let cur: Word[] = [];
  let part = 0;
  const beat = () => 60 / (meta.bpm * 4);
  const close = () => {
    if (cur.length) {
      const last = cur[cur.length - 1];
      lines.push({ t: cur[0].t, end: last.t + last.d, words: cur, part });
    }
    cur = [];
  };
  for (const row of text.split(/\r?\n/)) {
    const head = row.match(/^#([A-Z0-9]+):(.*)$/i);
    if (head) {
      const [, k, v] = head;
      const key = k.toUpperCase();
      if (key === 'BPM') meta.bpm = Number(v.trim().replace(',', '.'));
      else if (key === 'GAP') meta.gap = Number(v.trim().replace(',', '.')) / 1000;
      else if (key === 'TITLE') meta.title = v.trim();
      else if (key === 'ARTIST') meta.artist = v.trim();
      else if (key === 'MP3' || key === 'AUDIO') meta.audio = v.trim();
      continue;
    }
    if (!meta.bpm) continue;
    const p = row.match(/^P\s*(\d)/);
    if (p) {
      close();
      part = Number(p[1]);
      continue;
    }
    if (row.startsWith('-')) {
      close();
      continue;
    }
    if (row.startsWith('E')) break;
    const n = row.match(/^([:*FRG])\s+(-?\d+)\s+(\d+)\s+(-?\d+)\s?(.*)$/);
    if (!n) continue;
    const [, kind, start, len, pitch, txt] = n;
    const t = meta.gap + Number(start) * beat();
    const d = Number(len) * beat();
    const free = kind === 'F' || kind === 'R' || kind === 'G';
    // UltraStar marks a syllable that continues a word by omitting the leading space; a leading
    // "~" is a held note on the previous syllable. Both stay as their own timed pieces.
    cur.push({ t, d, text: txt.replace(/^~$/, '~'), ...(free ? {} : { note: 60 + Number(pitch) }) });
  }
  close();
  return { meta, lyrics: { lines, wordTimed: true, pitched: lines.some((l) => l.words.some((w) => w.note !== undefined)) } };
}

/** Index of the line being sung (or most recently sung) at time t; -1 before the first line. */
export function lineAt(lyrics: Lyrics, t: number): number {
  let lo = 0, hi = lyrics.lines.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lyrics.lines[mid].t <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** 0..1 through a word at time t. */
export const wordProgress = (w: Word, t: number) => (t <= w.t ? 0 : t >= w.t + w.d ? 1 : (t - w.t) / w.d);

/**
 * When a line has been sung out. Word-timed: its last word ends. Line-timed lyrics only say when a
 * line starts, so it is estimated from the text's length, never past the next line's start.
 */
// shortcut: a flat ~8 characters a second plus a lead-in, wrong for very slow or fast songs; word-timed lyrics replace it.
export function sungEnd(line: Line, wordTimed: boolean): number {
  const last = line.words.at(-1);
  if (wordTimed && last) return last.t + last.d;
  const chars = line.words.reduce((n, w) => n + [...w.text].length, 0);
  return Math.min(line.end, line.t + 0.5 + chars * 0.12);
}

/** How far each word of a line is filled (0 to 1) at time t; line-timed words share the estimate by length. */
export function wordFills(line: Line, t: number, wordTimed: boolean): number[] {
  if (wordTimed) return line.words.map((w) => wordProgress(w, t));
  const lens = line.words.map((w) => [...w.text].length || 1);
  const total = lens.reduce((a, b) => a + b, 0);
  const span = sungEnd(line, false) - line.t;
  let at = line.t;
  return lens.map((n) => {
    const d = (span * n) / total;
    const p = d > 0 ? Math.min(1, Math.max(0, (t - at) / d)) : t >= at ? 1 : 0;
    at += d;
    return p;
  });
}

/**
 * Sync points pin lyric times to media times: [when the lyrics say a line starts, when this video
 * sings it]. One point is a plain offset. Two or more stretch the lyrics between them, which absorbs
 * karaoke edits that run at a slightly different speed or cut and extend sections.
 */
export type Anchor = [lyricT: number, mediaT: number];

/** A function from lyric time to media time through the sync points. */
export function timeMap(anchors: Anchor[]): (t: number) => number {
  const a = [...anchors].sort((x, y) => x[0] - y[0]);
  if (!a.length) return (t) => t;
  const first = a[0], last = a[a.length - 1];
  return (t) => {
    // Before the first and after the last point the song runs at normal speed.
    if (a.length === 1 || t <= first[0]) return t + (first[1] - first[0]);
    if (t >= last[0]) return t + (last[1] - last[0]);
    const i = a.findIndex((p) => p[0] > t);
    const [x0, y0] = a[i - 1], [x1, y1] = a[i];
    const slope = Math.max(0.25, Math.min(4, (y1 - y0) / (x1 - x0)));
    return y0 + (t - x0) * slope;
  };
}

/** The lyrics as this media plays them. */
export function mapLyrics(l: Lyrics, anchors: Anchor[]): Lyrics {
  if (!anchors.length) return l;
  const f = timeMap(anchors);
  const span = (t: number, d: number) => ({ t: f(t), d: Math.max(0.05, f(t + d) - f(t)) });
  return {
    ...l,
    lines: l.lines.map((ln) => ({
      ...ln, t: f(ln.t), end: f(ln.end),
      words: ln.words.map((w) => ({ ...w, ...span(w.t, w.d), notes: w.notes?.map((n) => ({ ...n, ...span(n.t, n.d) })) })),
    })),
  };
}

/**
 * Adds a sync point. Points within three seconds of it (in lyric time) are replaced, and any that
 * would make time run backwards against it are dropped, so a careless tap cannot tangle the map.
 */
export function addAnchor(anchors: Anchor[], lyricT: number, mediaT: number): Anchor[] {
  const keep = anchors.filter(([x, y]) => Math.abs(x - lyricT) >= 3 && (x < lyricT ? y < mediaT : y > mediaT));
  const r = (n: number) => Math.round(n * 100) / 100;
  return [...keep, [r(lyricT), r(mediaT)] as Anchor].sort((a, b) => a[0] - b[0]).slice(-60);
}

/**
 * Nudges the lyrics at one line only: pins that line `by` seconds from where it plays now. Earlier
 * sync points stay, so each nudge adds a point and fixes one section without undoing the others.
 */
export const nudgeAt = (anchors: Anchor[], lyricT: number, by: number): Anchor[] => addAnchor(anchors, lyricT, timeMap(anchors)(lyricT) + by);

/** Moves every sync point by `by` seconds (the whole-song nudge); with none, makes one. */
export const nudgeAnchors = (anchors: Anchor[], by: number): Anchor[] =>
  anchors.length ? anchors.map(([x, y]) => [x, Math.round((y + by) * 100) / 100] as Anchor) : [[0, Math.round(by * 100) / 100]];

/** Shifts every time by `by` seconds (positive = later). Used for the per-song lyric offset nudge. */
export function shiftLyrics(l: Lyrics, by: number): Lyrics {
  if (!by) return l;
  return {
    ...l,
    lines: l.lines.map((ln) => ({ ...ln, t: ln.t + by, end: ln.end + by, words: ln.words.map((w) => ({ ...w, t: w.t + by, notes: w.notes?.map((n) => ({ ...n, t: n.t + by })) })) })),
  };
}

/** Joins a line's words for display, respecting syllables that continue a word ("Hap" + "-py"). */
export const lineText = (l: Line) => joinWords(l.words.map((w) => w.text));
export const joinWords = (parts: string[]) => parts.join(' ').replace(/ ~/g, '').replace(/- /g, '').replace(/ +/g, ' ').trim();

/** Every pitch target in time order, optionally only one duet part's (part 0 lines count for everyone). */
export function targets(l: Lyrics, part = 0): Target[] {
  const out: Target[] = [];
  for (const ln of l.lines) {
    if (part && ln.part && ln.part !== part) continue;
    for (const w of ln.words) {
      if (w.notes) out.push(...w.notes);
      else if (w.note !== undefined) out.push({ t: w.t, d: w.d, note: w.note });
    }
  }
  return out;
}

/** Lowest and highest target note, or null when the song has no pitch data. */
export function vocalRange(l: Lyrics): [number, number] | null {
  const ts = targets(l);
  if (!ts.length) return null;
  return [Math.min(...ts.map((x) => x.note)), Math.max(...ts.map((x) => x.note))];
}

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (midi: number) => `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
