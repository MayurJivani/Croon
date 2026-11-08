// Growing the library: find any song or a whole discography on Deezer (keyless metadata), add it
// to the catalogue, then auto-find what makes it singable: synced lyrics from LRCLIB and, when a
// YouTube Data API key is configured, a karaoke video. Every found video is checked through
// oEmbed and only karaoke or instrumental versions are attached, never an original recording.
import { randomUUID } from 'node:crypto';
import { sql } from '../db/client.ts';
import { logger } from '../logger.ts';
import { isUnwantedVersion, stripVersionSuffix, normalizeTitle } from '../utils/trackFilters.ts';
import { addExtraSong, catalogRaw, songMeta, addSourceToMemory, type Raw } from './catalog.ts';
import { lyricsFor } from './lyrics.ts';
import { searchKaraoke, searchAvailable, verifyVideo, QuotaError } from './youtube.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The song a track title names, or null for alternate versions. A radio or single edit is still the
 * song (karaoke needs the song, not that exact recording), so it is kept under its clean title;
 * remixes, live, acoustic, karaoke and the rest stay out.
 */
export function songTitle(title: string): string | null {
  if (!isUnwantedVersion(title)) return title;
  const edit = /[([-]\s*(radio|single|clean|explicit)\s+(edit|version)\s*[)\]]?/i;
  if (!edit.test(title)) return null;
  const cleaned = title.replace(new RegExp(edit.source, 'gi'), '').replace(/\s+\)/g, ')').trim();
  return isUnwantedVersion(cleaned) ? null : cleaned;
}

async function deezer<T>(path: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`https://api.deezer.com/${path}`, { signal: AbortSignal.timeout(8000) });
    const j = (await r.json()) as T & { error?: { code?: number; message?: string } };
    // Deezer answers 200 with an error body; code 4 is its rate limit (50 requests per 5 seconds).
    if (j.error?.code === 4) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (j.error) throw new Error(`Deezer: ${j.error.message ?? 'error'}`);
    return j;
  }
  throw new Error('Deezer is rate limiting; try again shortly.');
}

type DzTrack = { id: number; title: string; title_short?: string; duration: number; rank?: number; isrc?: string; artist: { id: number; name: string }; album?: { id: number; title: string; cover_medium?: string } };
type DzAlbum = { id: number; title: string; record_type?: string; release_date?: string; cover_medium?: string; genres?: { data: { name: string }[] }; tracks?: { data: DzTrack[] }; artist?: { id: number; name: string } };

const GENRE: Record<string, string> = { 'R&B': 'R&B and Soul', 'Rap/Hip Hop': 'Hip-Hop', Dance: 'EDM', Electro: 'Electronic', Films: 'Soundtrack', 'Films/Games': 'Soundtrack', Alternative: 'Indie', 'Asian Music': 'World', 'Bollywood': 'Bollywood', 'Latin Music': 'Latin', 'K-Pop': 'K-Pop', 'J-Pop': 'J-Pop' };
/** Language from the title's script; Latin script defaults to English (editable later). */
export function guessLanguage(text: string): string {
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  if (/[਀-੿]/.test(text)) return 'pa';
  if (/[가-힯ᄀ-ᇿ]/.test(text)) return 'ko';
  if (/[぀-ヿ]/.test(text)) return 'ja';
  if (/[஀-௿]/.test(text)) return 'ta';
  if (/[áéíóúñ¿¡]/i.test(text)) return 'es';
  return 'en';
}

function toRaw(t: DzTrack, album: DzAlbum | null): Raw {
  return {
    id: String(t.id),
    title: t.title_short || t.title,
    artist: t.artist.name,
    album: album?.title ?? t.album?.title ?? null,
    year: album?.release_date ? Number(album.release_date.slice(0, 4)) || null : null,
    genre: GENRE[album?.genres?.data?.[0]?.name ?? ''] ?? album?.genres?.data?.[0]?.name ?? 'Pop',
    language: guessLanguage(`${t.title} ${t.artist.name}`),
    region: null,
    scene: 'imported',
    artwork: album?.cover_medium ?? t.album?.cover_medium ?? null,
    duration: t.duration,
    difficulty: null,
    rank: t.rank ?? 0,
  };
}

async function saveExtra(raw: Raw, userId: string | null) {
  await sql`insert into extra_songs (deezer_id, data, added_by) values (${raw.id}, ${sql.json(raw as never)}, ${userId}) on conflict (deezer_id) do nothing`;
  addExtraSong(raw);
}

/** Search Deezer for songs and artists, marking which songs Croon already has. */
export async function discover(q: string) {
  const [tracks, artists] = await Promise.all([
    deezer<{ data: DzTrack[] }>(`search?${new URLSearchParams({ q, limit: '20' })}`),
    deezer<{ data: { id: number; name: string; picture_medium: string; nb_album: number; nb_fan: number }[] }>(`search/artist?${new URLSearchParams({ q, limit: '4' })}`),
  ]);
  return {
    songs: tracks.data.filter((t) => !isUnwantedVersion(t.title)).map((t) => ({
      deezerId: String(t.id), title: t.title_short || t.title, artist: t.artist.name, album: t.album?.title ?? null, artwork: t.album?.cover_medium ?? null,
      duration: t.duration, inCatalog: !!catalogRaw(`dz:${t.id}`), key: `dz:${t.id}`,
    })),
    // Several artists often share a name; the one people actually listen to comes first.
    artists: artists.data.sort((a, b) => b.nb_fan - a.nb_fan).map((a) => ({ id: String(a.id), name: a.name, picture: a.picture_medium, albums: a.nb_album, fans: a.nb_fan })),
  };
}

/** Adds one Deezer track to the catalogue. */
export async function importTrack(deezerId: string, userId: string | null) {
  const key = `dz:${deezerId}`;
  if (catalogRaw(key)) return songMeta(key)!;
  const t = await deezer<DzTrack & { album: { id: number } }>(`track/${deezerId}`);
  const album = t.album?.id ? await deezer<DzAlbum>(`album/${t.album.id}`).catch(() => null) : null;
  await saveExtra(toRaw(t, album), userId);
  return songMeta(key)!;
}

/**
 * Every original song in an artist's discography, one recording each: alternate versions are
 * dropped, and when a song appears on several releases the most-played recording wins.
 */
export async function discography(artistId: string): Promise<Raw[]> {
  const albums: DzAlbum[] = [];
  for (let url = `artist/${artistId}/albums?limit=100`; url; ) {
    const page = await deezer<{ data: DzAlbum[]; next?: string }>(url);
    albums.push(...page.data);
    url = page.next ? page.next.replace('https://api.deezer.com/', '') : '';
  }
  const best = new Map<string, Raw>();
  for (const a of albums.filter((x) => x.record_type !== 'compile')) {
    const full = await deezer<DzAlbum>(`album/${a.id}`);
    await sleep(120);
    for (const t of full.tracks?.data ?? []) {
      const name = songTitle(t.title_short || t.title);
      if (String(t.artist?.id) !== artistId || !name) continue;
      const raw = { ...toRaw(t, full), title: name };
      const k = normalizeTitle(stripVersionSuffix(raw.title));
      const prev = best.get(k);
      // Keep the most-played recording; on a tie, the earliest release (the original).
      if (!prev || raw.rank > prev.rank || (raw.rank === prev.rank && (raw.year ?? 9999) < (prev.year ?? 9999))) best.set(k, raw);
    }
  }
  // Hits that live on soundtracks and compilations ("I Don't Wanna Live Forever") or whose single is
  // only an edit never appear in the album list; the artist's top tracks catch them.
  const top = await deezer<{ data: (DzTrack & { album: { id: number } })[] }>(`artist/${artistId}/top?limit=100`);
  for (const t of top.data) {
    const name = songTitle(t.title_short || t.title);
    if (String(t.artist?.id) !== artistId || !name) continue;
    const k = normalizeTitle(stripVersionSuffix(name));
    if (best.has(k)) continue;
    const album = await deezer<DzAlbum>(`album/${t.album.id}`).catch(() => null);
    await sleep(120);
    best.set(k, { ...toRaw(t, album), title: name });
  }
  return [...best.values()].sort((a, b) => b.rank - a.rank);
}

/**
 * Is this video a karaoke or instrumental take of this song? It must name the artist (title or
 * channel), contain every main word of the song's title, and not be a vocals-only, reaction,
 * lesson or speed-changed upload. Loose matching once attached an unrelated song to "Fatal".
 */
export function videoMatches(videoTitle: string, channel: string, title: string, artist: string): boolean {
  const t = normalizeTitle(videoTitle);
  if (!/\b(karaoke|instrumental|backing track|minus one|sing along|singalong)\b/.test(t)) return false;
  if (/\b(acapella|a cappella|acappella|vocals only|reaction|tutorial|lesson|slowed|sped up|nightcore|8d)\b/.test(t)) return false;
  const lead = normalizeTitle(artist.split(/,|&| feat| ft\b/i)[0]);
  const who = `${t} ${normalizeTitle(channel)}`;
  if (lead && !lead.split(' ').filter((w) => w.length > 1).every((w) => new RegExp(`\\b${w}\\b`).test(who))) return false;
  const words = normalizeTitle(stripVersionSuffix(title).replace(/\((feat|ft)[^)]*\)/gi, '')).split(' ').filter((w) => w.length > 2).slice(0, 4);
  return words.every((w) => new RegExp(`\\b${w}\\b`).test(t));
}

async function rejectedVideos(key: string) {
  return new Set((await sql<{ video_id: string }[]>`select video_id from song_sources where song_key = ${key} and rejected`).map((r) => r.video_id));
}

export type AutoFind = { key: string; lyrics: 'word' | 'line' | 'none'; video: 'attached' | 'had' | 'none' | 'skipped' | 'no-key' | 'quota' };

/** Synced lyrics, then a karaoke video, for one song. Never re-searches a song that has a video. */
export async function autoFind(key: string, userId: string | null): Promise<AutoFind> {
  const l = await lyricsFor(key).catch(() => ({ synced: null, wordTimed: false }));
  const lyrics = l.synced ? (l.wordTimed ? 'word' : 'line') : 'none';
  const meta = songMeta(key);
  if (!meta) return { key, lyrics, video: 'none' };
  if (meta.sources.length) return { key, lyrics, video: 'had' };
  if (!searchAvailable()) return { key, lyrics, video: 'no-key' };
  let found;
  try {
    found = await searchKaraoke(meta.title, meta.artist);
  } catch (err) {
    if (err instanceof QuotaError) return { key, lyrics, video: 'quota' };
    throw err;
  }
  const rejected = await rejectedVideos(key);
  for (const cand of found) {
    if (rejected.has(cand.videoId) || !videoMatches(cand.videoTitle, cand.channel, meta.title, meta.artist)) continue;
    const v = await verifyVideo(cand.videoId);
    if (!v || v.label === 'original') continue;
    await sql`insert into song_sources (song_key, video_id, video_title, channel, label, added_by) values (${key}, ${v.videoId}, ${v.videoTitle}, ${v.channel}, ${v.label}, ${userId}) on conflict do nothing`;
    addSourceToMemory(key, v);
    return { key, lyrics, video: 'attached' };
  }
  return { key, lyrics, video: 'none' };
}

export type ImportJob = {
  id: string; artist: string; status: 'running' | 'done' | 'failed'; total: number; added: number; already: number;
  lyrics: number; videos: number; videoNote: string | null; current: string | null; error: string | null; keys: string[]; startedAt: string;
};
const jobs = new Map<string, ImportJob>();
export const getJob = (id: string) => jobs.get(id) ?? null;

/** Imports a whole discography in the background and auto-finds lyrics and videos for it. */
export function startArtistImport(artistId: string, artistName: string, userId: string | null): ImportJob {
  const running = [...jobs.values()].find((j) => j.status === 'running');
  if (running) return running; // one import at a time keeps Deezer, LRCLIB and the YouTube quota polite
  const job: ImportJob = { id: randomUUID(), artist: artistName, status: 'running', total: 0, added: 0, already: 0, lyrics: 0, videos: 0, videoNote: null, current: 'Reading the discography', error: null, keys: [], startedAt: new Date().toISOString() };
  jobs.set(job.id, job);
  void (async () => {
    try {
      const songs = await discography(artistId);
      job.total = songs.length;
      for (const raw of songs) {
        const key = `dz:${raw.id}`;
        job.keys.push(key);
        if (catalogRaw(key)) job.already++;
        else {
          await saveExtra(raw, userId);
          job.added++;
        }
      }
      for (const key of job.keys) {
        job.current = songMeta(key)?.title ?? key;
        const r = await autoFind(key, userId);
        if (r.lyrics !== 'none') job.lyrics++;
        if (r.video === 'attached' || r.video === 'had') job.videos++;
        if (r.video === 'no-key') job.videoNote = 'No YouTube API key is configured, so karaoke videos were not searched. Attach them from each song page.';
        if (r.video === 'quota') job.videoNote = "Today's YouTube search quota ran out; run the import again tomorrow to finish videos (it skips songs that already have one).";
        await sleep(1000); // LRCLIB asks for gentle traffic
      }
      job.status = 'done';
      job.current = null;
      logger.info({ artist: artistName, total: job.total, added: job.added, lyrics: job.lyrics, videos: job.videos }, 'artist import finished');
    } catch (err) {
      job.status = 'failed';
      job.error = (err as Error).message;
      logger.warn({ err, artistId }, 'artist import failed');
    }
  })();
  return job;
}
