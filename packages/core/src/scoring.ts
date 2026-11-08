// Singing score. The phone measures pitch frames; this turns frames into a score. It runs on the
// server for anything that is saved, so a leaderboard entry is computed, not claimed.
//
// Fairness rules, deliberately:
// - Octave-agnostic: a bass singing a soprano line an octave down is on pitch.
// - Latency-agnostic: the best constant offset in ±400 ms is found first, so a slow Bluetooth
//   speaker or a laggy phone mic does not cost points.
// - Unvoiced frames count as missed notes, never as wrong ones, so a noisy room is not punished
//   twice once the calibration floor has gated it.
import type { Line, Target } from './lyrics.ts';

/** One measurement: song time (s), detected MIDI pitch (null = no voice). */
export type Frame = [t: number, midi: number | null];

export type Score = {
  kind: 'full' | 'lite';
  total: number;
  pitch: number | null;
  timing: number;
  stability: number;
  completion: number;
  consistency: number;
  /** The latency the scorer absorbed, ms. Shown so people can see the correction happened. */
  offsetMs: number;
  grade: Grade;
};

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';
export const GRADE_NAME: Record<Grade, string> = { S: 'Headliner', A: 'Encore', B: 'Crowd pleaser', C: 'Open mic', D: 'Shower solo' };
export const gradeOf = (total: number): Grade => (total >= 90 ? 'S' : total >= 80 ? 'A' : total >= 68 ? 'B' : total >= 50 ? 'C' : 'D');

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** Distance in semitones ignoring octave, 0..6. */
export const pcDistance = (a: number, b: number) => Math.abs((((a - b) % 12) + 18) % 12 - 6);
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

/** Frames inside [from, to), assuming frames are sorted by time. */
function between(frames: Frame[], from: number, to: number, shift: number) {
  const out: Frame[] = [];
  for (const f of frames) {
    const t = f[0] + shift;
    if (t >= to) break;
    if (t >= from) out.push(f);
  }
  return out;
}

const hit = (sung: number, target: number) => clamp01(1.5 - pcDistance(sung, target)); // full credit within half a semitone

function pitchAt(frames: Frame[], ts: Target[], shift: number) {
  const per: number[] = [];
  for (const n of ts) {
    const fs = between(frames, n.t, n.t + n.d, shift);
    if (!fs.length) continue;
    per.push(mean(fs.map((f) => (f[1] === null ? 0 : hit(f[1], n.note)))));
  }
  return per;
}

// Nearest-to-zero first, so ties keep the uncorrected timing.
const OFFSETS = Array.from({ length: 17 }, (_, i) => -0.4 + i * 0.05).sort((a, b) => Math.abs(a) - Math.abs(b));

/** Full scoring against pitch targets. */
export function scoreFull(frames: Frame[], ts: Target[]): Score {
  frames = [...frames].sort((a, b) => a[0] - b[0]);
  let shift = 0, bestAcc = -1;
  for (const s of OFFSETS) {
    const acc = mean(pitchAt(frames, ts, s));
    if (acc > bestAcc + 1e-9) {
      bestAcc = acc;
      shift = s;
    }
  }
  const per = pitchAt(frames, ts, shift);
  const pitch = mean(per);

  const timing: number[] = [], stab: number[] = [];
  let done = 0;
  ts.forEach((n, i) => {
    const inside = between(frames, n.t, n.t + n.d, shift);
    const voiced = inside.filter((f) => f[1] !== null);
    if (inside.length && voiced.length / inside.length >= 0.3) done++;
    // Timing: when did the singer arrive on this note's pitch? A repeated pitch carries no onset
    // information in legato singing, so those notes are left out rather than guessed.
    const prev = ts[i - 1];
    if (!(prev && pcDistance(prev.note, n.note) === 0 && prev.t + prev.d >= n.t - 0.05)) {
      const arrive = between(frames, n.t - 0.35, n.t + Math.min(n.d, 0.6), shift).find((f) => f[1] !== null && pcDistance(f[1], n.note) <= 1);
      timing.push(arrive ? clamp01(1 - Math.max(0, Math.abs(arrive[0] + shift - n.t) - 0.05) / 0.3) : 0);
    }
    if (voiced.length >= 3) {
      const ms = voiced.map((f) => f[1] as number);
      const centre = ms[Math.floor(ms.length / 2)];
      stab.push(clamp01(1 - sd(ms.map((m) => centre + ((((m - centre) % 12) + 18) % 12) - 6)) / 0.9));
    }
  });
  const completion = ts.length ? done / ts.length : 0;
  const consistency = per.length > 4 ? clamp01(1 - sd(per) * 1.6) : mean(per);
  const t = mean(timing), s = mean(stab);
  const total = Math.round(100 * (0.45 * pitch + 0.2 * t + 0.1 * s + 0.2 * completion + 0.05 * consistency));
  return finish('full', total, pitch, t, s, completion, consistency, shift);
}

/**
 * Lite scoring for songs without melody data (line-timed lyrics only): did you sing when the lyric
 * said to, how steadily, and how much of it. No pitch accuracy, and the UI says so.
 */
export function scoreLite(frames: Frame[], lines: Line[]): Score {
  frames = [...frames].sort((a, b) => a[0] - b[0]);
  const coverage = (s: number) =>
    mean(lines.map((l) => {
      const fs = between(frames, l.t, l.end, s);
      return fs.length ? fs.filter((f) => f[1] !== null).length / fs.length : 0;
    }));
  let shift = 0, best = -1;
  for (const s of OFFSETS) {
    const c = coverage(s);
    if (c > best + 1e-9) {
      best = c;
      shift = s;
    }
  }
  let done = 0;
  const timing: number[] = [], stab: number[] = [];
  for (const l of lines) {
    const fs = between(frames, l.t - 0.4, l.end, shift);
    const voiced = fs.filter((f) => f[1] !== null);
    if (voiced.length / Math.max(1, between(frames, l.t, l.end, shift).length) >= 0.35) done++;
    if (!voiced.length) continue;
    // Onset = voice starting after a breath. Singing straight through from the previous line gives
    // no onset to judge, so that line is left out of timing.
    const onset = fs.find((f) => {
      if (f[1] === null) return false;
      const k = frames.indexOf(f);
      return k === 0 || frames[k - 1][1] === null || f[0] - frames[k - 1][0] > 0.12;
    });
    if (onset) timing.push(clamp01(1 - Math.max(0, Math.abs(onset[0] + shift - l.t) - 0.1) / 0.5));
    // Steadiness: how little the pitch jitters frame to frame within voiced runs.
    const jumps: number[] = [];
    for (let i = 1; i < voiced.length; i++) jumps.push(Math.min(pcDistance(voiced[i][1]!, voiced[i - 1][1]!), 3));
    if (jumps.length >= 3) stab.push(clamp01(1 - mean(jumps) / 1.5));
  }
  const completion = lines.length ? done / lines.length : 0;
  const t = mean(timing), s = mean(stab);
  const total = Math.round(100 * (0.4 * completion + 0.35 * t + 0.25 * s));
  return finish('lite', total, null, t, s, completion, s, shift);
}

function finish(kind: Score['kind'], total: number, pitch: number | null, timing: number, stability: number, completion: number, consistency: number, shift: number): Score {
  const pct = (x: number) => Math.round(x * 100);
  return {
    kind,
    total: Math.max(0, Math.min(100, total)),
    pitch: pitch === null ? null : pct(pitch),
    timing: pct(timing),
    stability: pct(stability),
    completion: pct(completion),
    consistency: pct(consistency),
    offsetMs: Math.round(shift * -1000),
    grade: gradeOf(total),
  };
}

/** Upper bound on frames a performance may submit: 25 a second over the song, plus slack. */
export const maxFrames = (durationSec: number) => Math.ceil((durationSec + 30) * 25);
