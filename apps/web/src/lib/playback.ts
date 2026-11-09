// Playback state over an engine. Solo: the engine is the clock. Room: the server timeline is the
// clock; the device that owns the speakers chases it, every other device only reads it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { makeEngine, type Engine } from '../audio/engines.ts';
import { positionAt, correction, type Timeline } from '../../../../packages/core/src/timeline.ts';
import type { SongMeta } from '../../../../packages/core/src/protocol.ts';

export function useEngine(song: SongMeta | null, o: { videoEl: HTMLElement | null; fileUrl?: string | null; enabled: boolean }) {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const src = song?.sources[0];
  const needsVideo = src?.kind === 'youtube';
  useEffect(() => {
    if (!song || !src || !o.enabled || (needsVideo && !o.videoEl) || (src.kind === 'file' && !o.fileUrl)) return;
    let e: Engine;
    try {
      e = makeEngine(src, { videoEl: o.videoEl, fileUrl: o.fileUrl ?? undefined });
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    let live = true;
    setError(null);
    e.load().then(({ duration }) => {
      if (!live) return e.destroy();
      setDuration(duration || song.duration);
      setEngine(e);
    }).catch((err) => live && setError((err as Error).message));
    return () => {
      live = false;
      setEngine(null);
      e.destroy();
    };
  }, [song?.key, src?.kind === 'youtube' ? src.videoId : src?.kind, o.enabled, o.videoEl, o.fileUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  return { engine, duration, error };
}

/** Makes an audio device follow the room's timeline. */
export function useFollow(engine: Engine | null, timeline: Timeline | null, serverNow: () => number, active: boolean, seekOver?: number) {
  const startTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!engine || !timeline || !active) return;
    const tick = () => {
      const target = positionAt(timeline, serverNow());
      if (!timeline.playing) {
        if (engine.playing()) engine.pause();
        return;
      }
      if (target < 0) {
        // Inside the lead-in: start exactly when the anchor arrives.
        if (startTimer.current === null) startTimer.current = window.setTimeout(() => {
          startTimer.current = null;
          engine.play(0);
        }, -target * 1000);
        return;
      }
      if (!engine.playing()) return engine.play(target);
      const c = correction(engine.position() - target, seekOver);
      if (c.seek) engine.play(target);
      else engine.setRate(c.rate);
    };
    tick();
    const t = window.setInterval(tick, 250);
    return () => {
      clearInterval(t);
      if (startTimer.current !== null) clearTimeout(startTimer.current);
      startTimer.current = null;
    };
  }, [engine, timeline, serverNow, active, seekOver]);
}

/** Lock-screen and headset controls through the Media Session API. */
export function useMediaSession(song: SongMeta | null, h: { play(): void; pause(): void; seek(s: number): void; next?(): void; prev?(): void }) {
  const ref = useRef(h);
  ref.current = h;
  useEffect(() => {
    if (!song || !('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: song.title, artist: song.artist, album: song.album ?? 'Croon', artwork: song.artwork ? [{ src: song.artwork, sizes: '250x250', type: 'image/jpeg' }] : [] });
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => ref.current.play());
    ms.setActionHandler('pause', () => ref.current.pause());
    ms.setActionHandler('seekto', (d) => d.seekTime !== undefined && ref.current.seek(d.seekTime));
    ms.setActionHandler('nexttrack', ref.current.next ? () => ref.current.next!() : null);
    ms.setActionHandler('previoustrack', ref.current.prev ? () => ref.current.prev!() : null);
    return () => {
      for (const a of ['play', 'pause', 'seekto', 'nexttrack', 'previoustrack'] as const) ms.setActionHandler(a, null);
    };
  }, [song]);
}

/** A stable getter for a value that changes every frame, without re-rendering. */
export function useGetter<T>(fn: () => T) {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback(() => ref.current(), []);
}
