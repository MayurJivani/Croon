// Monophonic pitch detection (YIN, de Cheveigné & Kawahara 2002) on one window of samples.
// Runs on the singer's own device; audio never leaves it.

export type Pitch = { freq: number; clarity: number } | null;

/**
 * How far back a reading's sound lies, as a fraction of the window: YIN only names a new note once
 * about 85% of the window holds it (measured 0.80 to 0.97 on note changes), not at the halfway mark.
 */
export const PITCH_LAG = 0.85;

export function yin(buf: Float32Array, sampleRate: number, threshold = 0.15, minHz = 70, maxHz = 1100): Pitch {
  const maxTau = Math.min(Math.floor(sampleRate / minHz), buf.length >> 1);
  const minTau = Math.max(2, Math.floor(sampleRate / maxHz));
  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let s = 0;
    for (let i = 0; i < maxTau; i++) {
      const x = buf[i] - buf[i + tau];
      s += x * x;
    }
    d[tau] = s;
  }
  // Cumulative mean normalised difference.
  let run = 0;
  d[0] = 1;
  for (let tau = 1; tau <= maxTau; tau++) {
    run += d[tau];
    d[tau] = run ? (d[tau] * tau) / run : 1;
  }
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (d[t] < threshold) {
      while (t + 1 <= maxTau && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  // Parabolic interpolation around the minimum for sub-sample precision.
  const a = d[tau - 1] ?? d[tau], b = d[tau], c = d[tau + 1] ?? d[tau];
  const den = a + c - 2 * b;
  const shift = den ? (a - c) / (2 * den) : 0;
  return { freq: sampleRate / (tau + shift), clarity: 1 - b };
}

export const freqToMidi = (f: number) => 69 + 12 * Math.log2(f / 440);
export const midiToFreq = (m: number) => 440 * 2 ** ((m - 69) / 12);

export function rms(buf: Float32Array) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}
