// The shared playback clock. The server owns one Timeline per room; every client derives the song
// position from it and its own estimate of the server's clock, so nobody streams audio to anybody.

export type Timeline = {
  playing: boolean;
  /** Server time (ms) at which the song was at `anchorPos`. */
  anchorAt: number;
  /** Song position (s) at `anchorAt`. */
  anchorPos: number;
};

export const stopped = (pos = 0): Timeline => ({ playing: false, anchorAt: 0, anchorPos: pos });

/** Song position in seconds at a given server time. */
export const positionAt = (tl: Timeline, serverNow: number) => (tl.playing ? tl.anchorPos + (serverNow - tl.anchorAt) / 1000 : tl.anchorPos);

export const play = (tl: Timeline, serverNow: number, leadMs = 0): Timeline => ({ playing: true, anchorAt: serverNow + leadMs, anchorPos: positionAt(tl, serverNow) });
export const pause = (tl: Timeline, serverNow: number): Timeline => ({ playing: false, anchorAt: serverNow, anchorPos: Math.max(0, positionAt(tl, serverNow)) });
export const seek = (tl: Timeline, serverNow: number, pos: number): Timeline => ({ playing: tl.playing, anchorAt: serverNow, anchorPos: Math.max(0, pos) });

export type ClockSample = { sent: number; server: number; received: number };

/**
 * Server clock offset (server - local, ms) from ping samples. The sample with the shortest round
 * trip has the least room for asymmetric delay, so it wins (the NTP/Cristian approach).
 */
export function clockOffset(samples: ClockSample[]): { offset: number; rtt: number } {
  let best = samples[0];
  for (const s of samples) if (s.received - s.sent < best.received - best.sent) best = s;
  return { offset: best.server - (best.sent + best.received) / 2, rtt: best.received - best.sent };
}

/**
 * How a player that owns the speakers should correct toward the timeline. Small drift is absorbed
 * by nudging playback rate (inaudible), large drift by a hard seek. Phones playing along with the
 * stage seek sooner (`seekOver` 0.15): two speakers 150 ms apart already sound like an echo.
 */
export function correction(drift: number, seekOver = 0.35): { seek: boolean; rate: number } {
  const a = Math.abs(drift);
  if (a > seekOver) return { seek: true, rate: 1 };
  if (a < 0.04) return { seek: false, rate: 1 };
  return { seek: false, rate: 1 - Math.max(-0.05, Math.min(0.05, drift * 0.5)) };
}
