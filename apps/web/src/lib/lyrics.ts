import { useEffect, useMemo, useState } from 'react';
import { compile, houseSong } from '../../../../packages/core/src/houseband.ts';
import { parseLrc, parseUltrastar, type Lyrics } from '../../../../packages/core/src/lyrics.ts';
import type { SongMeta } from '../../../../packages/core/src/protocol.ts';
import { api } from './api.ts';

export type LyricsState = { lyrics: Lyrics | null; status: 'loading' | 'ready' | 'none' | 'error'; credit: string | null; plain?: string | null };

/** Timed lyrics for a song from wherever they live: house band data, a guest's file, or LRCLIB. */
export function useSongLyrics(song: SongMeta | null, inline?: string | null): LyricsState {
  const house = useMemo(() => (song?.key.startsWith('hb:') ? compile(houseSong(song.key.slice(3))!).lyrics : null), [song?.key]);
  const [state, setState] = useState<LyricsState>({ lyrics: null, status: 'loading', credit: null });
  useEffect(() => {
    if (!song) return;
    if (house) return setState({ lyrics: house, status: 'ready', credit: 'Croon house band' });
    if (inline) {
      const l = /^#BPM:/im.test(inline) ? parseUltrastar(inline).lyrics : parseLrc(inline, song.duration);
      return setState({ lyrics: l, status: l.lines.length ? 'ready' : 'none', credit: 'Your lyrics file' });
    }
    if (!song.key.startsWith('dz:')) return setState({ lyrics: null, status: 'none', credit: null });
    let live = true;
    setState({ lyrics: null, status: 'loading', credit: null });
    api<{ format: string; lrc?: string; plain?: string }>(`/songs/${song.key}/lyrics`)
      .then((r) => live && setState(r.format === 'lrc' ? { lyrics: parseLrc(r.lrc!, song.duration), status: 'ready', credit: 'Synced lyrics from LRCLIB' } : { lyrics: null, status: 'none', credit: null, plain: r.plain }))
      .catch(() => live && setState({ lyrics: null, status: 'error', credit: null }));
    return () => {
      live = false;
    };
  }, [song?.key, house, inline]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

export type LyricPrefs = { style: 'classic' | 'word' | 'line' | 'cinematic' | 'dual'; size: number; position: 'top' | 'middle' | 'bottom'; roman: boolean; translation: boolean };
export const DEFAULT_PREFS: LyricPrefs = { style: 'classic', size: 1, position: 'middle', roman: true, translation: false };

export function usePrefs<T extends object>(key: string, initial: T): [T, (p: Partial<T>) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      return { ...initial, ...JSON.parse(localStorage.getItem(key) ?? '{}') };
    } catch {
      return initial;
    }
  });
  const set = (p: Partial<T>) =>
    setV((old) => {
      const n = { ...old, ...p };
      try {
        localStorage.setItem(key, JSON.stringify(n));
      } catch {
        /* ignore */
      }
      return n;
    });
  return [v, set];
}
