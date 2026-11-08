// Synced lyrics from LRCLIB (lrclib.net): free, keyless, community-sourced. Fetched on demand per
// song, cached (misses included), never bulk-exported. House band songs carry their own lyrics.
import { sql } from '../db/client.ts';
import { logger } from '../logger.ts';
import { catalogRaw, noteLyrics, playableKeys } from './catalog.ts';

const UA = 'Croon karaoke (https://github.com/IcarusFalls/Croon)';
type Lrclib = { id: number; trackName: string; artistName: string; duration: number; syncedLyrics: string | null; plainLyrics: string | null; instrumental: boolean };
export type CachedLyrics = { synced: string | null; plain: string | null; wordTimed: boolean };

const inflight = new Map<string, Promise<CachedLyrics>>();
const ENHANCED = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/;

async function lrclib(path: string): Promise<unknown> {
  const r = await fetch(`https://lrclib.net/api/${path}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`LRCLIB ${r.status}`);
  return r.json();
}

/** Picks the result with synced lyrics whose length is closest to the song's. */
function best(list: Lrclib[], duration: number) {
  return list.filter((x) => x.syncedLyrics && !x.instrumental).sort((a, b) => Math.abs(a.duration - duration) - Math.abs(b.duration - duration))[0];
}

async function fetchFor(key: string): Promise<CachedLyrics> {
  const s = catalogRaw(key);
  if (!s) return { synced: null, plain: null, wordTimed: false };
  const q = new URLSearchParams({ artist_name: s.artist, track_name: s.title, duration: String(s.duration) });
  let hit = (await lrclib(`get?${q}`)) as Lrclib | null;
  if (!hit?.syncedLyrics) {
    const list = ((await lrclib(`search?${new URLSearchParams({ track_name: s.title, artist_name: s.artist })}`)) ?? []) as Lrclib[];
    hit = best(list, s.duration) ?? hit;
  }
  const out = { synced: hit?.syncedLyrics ?? null, plain: hit?.plainLyrics ?? null, wordTimed: !!hit?.syncedLyrics && ENHANCED.test(hit.syncedLyrics) };
  await sql`insert into lyrics_cache (song_key, synced, plain, word_timed, lrclib_id) values (${key}, ${out.synced}, ${out.plain}, ${out.wordTimed}, ${hit?.id ?? null})
    on conflict (song_key) do update set synced = excluded.synced, plain = excluded.plain, word_timed = excluded.word_timed, lrclib_id = excluded.lrclib_id, fetched_at = now()`;
  noteLyrics(key, out.synced, out.plain, out.wordTimed);
  return out;
}

export async function lyricsFor(key: string): Promise<CachedLyrics> {
  const [row] = await sql<{ synced: string | null; plain: string | null; word_timed: boolean; fetched_at: Date }[]>`select synced, plain, word_timed, fetched_at from lyrics_cache where song_key = ${key}`;
  // Misses are retried after a week: LRCLIB is community-edited and grows.
  if (row && (row.synced || Date.now() - row.fetched_at.getTime() < 7 * 86400_000)) return { synced: row.synced, plain: row.plain, wordTimed: row.word_timed };
  let p = inflight.get(key);
  if (!p) {
    p = fetchFor(key).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

/** Fetches lyrics for playable songs that have none cached, one a second, in the background. */
export async function warmLyrics() {
  const have = new Set((await sql<{ song_key: string }[]>`select song_key from lyrics_cache`).map((r) => r.song_key));
  const todo = playableKeys().filter((k) => k.startsWith('dz:') && !have.has(k));
  if (!todo.length) return;
  logger.info({ songs: todo.length }, 'warming lyrics cache');
  for (const k of todo) {
    await lyricsFor(k).catch((err) => logger.warn({ err: String(err), key: k }, 'lyrics warm failed'));
    await new Promise((r) => setTimeout(r, 1000));
  }
  logger.info('lyrics cache warm');
}

/** Lyrics for a song that is not in the catalogue (a guest's own file), looked up by name. Not cached. */
export async function lookupLyrics(artist: string, title: string, duration?: number) {
  const q = new URLSearchParams({ artist_name: artist, track_name: title, ...(duration ? { duration: String(Math.round(duration)) } : {}) });
  let hit = (await lrclib(`get?${q}`)) as Lrclib | null;
  if (!hit?.syncedLyrics) hit = best(((await lrclib(`search?${new URLSearchParams({ track_name: title, artist_name: artist })}`)) ?? []) as Lrclib[], duration ?? 0) ?? hit;
  return hit?.syncedLyrics ? { lrc: hit.syncedLyrics, title: hit.trackName, artist: hit.artistName } : null;
}
