import { useEffect, useMemo, useState } from 'react';
import { compile, houseSong } from '../../../../packages/core/src/houseband.ts';
import { parseLrc, parseUltrastar, type Lyrics } from '../../../../packages/core/src/lyrics.ts';
import { romanize, needsRoman } from '../../../../packages/core/src/romanize.ts';

/** Adds a Latin spelling to every word written in a script the singer may not read. */
export function withRoman(l: Lyrics): Lyrics {
  if (!l.lines.some((ln) => ln.words.some((w) => !w.roman && needsRoman(w.text)))) return l;
  return { ...l, lines: l.lines.map((ln) => ({ ...ln, words: ln.words.map((w) => (w.roman || !needsRoman(w.text) ? w : { ...w, roman: romanize(w.text.replace(/-$/, '')) + (w.text.endsWith('-') ? '-' : '') })) })) };
}
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
      return setState({ lyrics: withRoman(l), status: l.lines.length ? 'ready' : 'none', credit: 'Your lyrics file' });
    }
    if (!song.key.startsWith('dz:')) return setState({ lyrics: null, status: 'none', credit: null });
    let live = true;
    setState({ lyrics: null, status: 'loading', credit: null });
    api<{ format: string; lrc?: string; plain?: string }>(`/songs/${song.key}/lyrics`)
      .then((r) => live && setState(r.format === 'lrc' ? { lyrics: withRoman(parseLrc(r.lrc!, song.duration)), status: 'ready', credit: 'Synced lyrics from LRCLIB' } : { lyrics: null, status: 'none', credit: null, plain: r.plain }))
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

/**
 * English lines for a non-English song, merged under each lyric line. A cached translation loads
 * for anyone; making a new one needs a signed-in user (it spends the server's translation allowance).
 */
export function useTranslation(song: SongMeta | null, lyrics: Lyrics | null, enabled: boolean) {
  const [lines, setLines] = useState<string[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    setLines(null);
    setNote(null);
    if (!enabled || !song || !song.key.startsWith('dz:')) return;
    let live = true;
    (async () => {
      const r = await api<{ lines: string[] | null; available?: boolean; canCreate?: boolean }>(`/songs/${song.key}/translation`);
      if (r.lines) return live && setLines(r.lines);
      if (!r.available) return live && setNote('English translation is not set up on this server yet.');
      if (!r.canCreate) return live && setNote('Sign in to translate this song for the first time; after that it is ready for everyone.');
      if (live) setNote('Translating…');
      const made = await api<{ lines: string[] }>(`/songs/${song.key}/translation`, { method: 'POST' });
      if (live) {
        setLines(made.lines);
        setNote(null);
      }
    })().catch((e) => live && setNote((e as Error).message));
    return () => {
      live = false;
    };
  }, [song?.key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  const merged = useMemo(() => (lyrics && lines ? { ...lyrics, lines: lyrics.lines.map((l, i) => ({ ...l, translation: lines[i] ?? l.translation })) } : lyrics), [lyrics, lines]);
  return { lyrics: merged, note };
}

/** Whether a translation toggle makes sense: the song is not English, or not written in Latin script. */
export const canTranslate = (song: SongMeta | null, lyrics: Lyrics | null) =>
  !!song && (song.language !== 'en' || !!lyrics?.lines.some((l) => l.words.some((w) => w.roman)) || !!lyrics?.lines.some((l) => l.translation));
