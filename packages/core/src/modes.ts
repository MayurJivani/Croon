// Game modes. A mode decides who sings, what the room sees, and how a performance resolves.
// Adding a mode means adding one entry here; rooms, queue and stage read only this shape.
import { lineText, sungEnd, type Line, type Lyrics } from './lyrics.ts';

export type ModeId = 'solo' | 'duet' | 'battle' | 'group' | 'challenge' | 'blind' | 'roulette' | 'team';

export type ModeResult = { headline: string; winners: string[] };
export type Mode = {
  id: ModeId;
  name: string;
  blurb: string;
  /** Singers on one performance: [min, max]. */
  singers: [number, number];
  /** Each singer takes their own lines. */
  parts?: boolean;
  /** Title and artist stay hidden until the results. */
  hidesSong?: boolean;
  /** Who picks: the person queueing, or the room's dice. */
  picks?: 'song' | 'singer-and-song';
  /** Scores count toward team totals. */
  teams?: boolean;
  resolve(scores: { pid: string; name: string; total: number }[]): ModeResult;
};

const best = (s: { pid: string; name: string; total: number }[]) => {
  const top = Math.max(...s.map((x) => x.total));
  return s.filter((x) => x.total === top);
};
const solo: Mode['resolve'] = (s) => (s.length ? { headline: `${s[0].name} scored ${s[0].total}`, winners: [s[0].pid] } : { headline: 'Sung for the joy of it', winners: [] });

export const MODES: Record<ModeId, Mode> = {
  solo: { id: 'solo', name: 'Solo', blurb: 'One singer, one shot at a personal best.', singers: [1, 1], resolve: solo },
  duet: {
    id: 'duet', name: 'Duet', blurb: 'Two singers split the lines and share the score.', singers: [2, 2], parts: true,
    resolve: (s) => ({ headline: s.length ? `Together: ${Math.round(s.reduce((a, x) => a + x.total, 0) / s.length)}` : 'Duet complete', winners: s.map((x) => x.pid) }),
  },
  battle: {
    id: 'battle', name: 'Battle', blurb: 'Two singers, same song, highest score takes it.', singers: [2, 2],
    resolve: (s) => {
      if (!s.length) return { headline: 'No scores, no winner', winners: [] };
      const w = best(s);
      return { headline: w.length > 1 ? `Dead heat at ${w[0].total}` : `${w[0].name} wins the battle`, winners: w.map((x) => x.pid) };
    },
  },
  group: {
    id: 'group', name: 'Group', blurb: 'Everybody in. The room sings as one.', singers: [2, 12],
    resolve: (s) => ({ headline: s.length ? `The room averaged ${Math.round(s.reduce((a, x) => a + x.total, 0) / s.length)}` : 'What a chorus', winners: s.map((x) => x.pid) }),
  },
  challenge: { id: 'challenge', name: 'Random challenge', blurb: 'The dice pick the song. No backing out.', singers: [1, 1], picks: 'song', resolve: solo },
  blind: { id: 'blind', name: 'Blind karaoke', blurb: 'No title, no artist. Work it out from the intro.', singers: [1, 1], hidesSong: true, resolve: solo },
  roulette: { id: 'roulette', name: 'Party roulette', blurb: 'A random singer gets a random song.', singers: [1, 1], picks: 'singer-and-song', resolve: solo },
  team: {
    id: 'team', name: 'Team battle', blurb: 'Every score adds to your team. Highest total wins the night.', singers: [1, 2], teams: true,
    resolve: (s) => ({ headline: s.length ? `+${s.reduce((a, x) => a + x.total, 0)} for the team` : 'No points this time', winners: s.map((x) => x.pid) }),
  },
};

/**
 * Gives a duet its parts. Lines already marked (UltraStar P1/P2) keep theirs; P3, or the same line
 * written under both singers, is sung together. Unmarked songs hand over by verse: a pause of 3 s
 * or more, or four lines in a row, passes to the other singer, and the final line is sung together.
 */
export function withParts(l: Lyrics): Lyrics {
  if (l.lines.some((x) => x.part)) {
    const out: Line[] = [];
    for (const x of l.lines) {
      const twin = out.find((y) => y.part && y.part !== x.part && Math.abs(y.t - x.t) < 0.05 && lineText(y) === lineText(x));
      if (twin) twin.part = 0;
      else out.push({ ...x, part: x.part > 2 ? 0 : x.part });
    }
    return { ...l, lines: out };
  }
  let part = 1, run = 0;
  let lines = l.lines.map((x, i) => {
    const prev = l.lines[i - 1];
    if (prev && (run >= 4 || x.t - sungEnd(prev, l.wordTimed) >= 3)) [part, run] = [3 - part, 0];
    run++;
    return { ...x, part: i && i === l.lines.length - 1 ? 0 : part };
  });
  // A song too short to hand over still gives the second singer lines of their own.
  if (!lines.some((x) => x.part === 2)) lines = l.lines.map((x, i) => ({ ...x, part: i && i === l.lines.length - 1 ? 0 : (i % 2) + 1 }));
  return { ...l, lines };
}
