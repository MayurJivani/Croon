// The song library. Metadata for 3,950 songs comes from the Chorus song bank (data/catalog.json);
// the house band's songs come from packages/core. Both live in memory: the whole catalogue is a
// couple of megabytes and an in-memory scan answers a search in well under a millisecond.
// shortcut: in-memory search, fine to ~100k songs; past that move it to Postgres full-text search.
import { readFileSync, existsSync } from 'node:fs';
import { HOUSE_BAND, compile, houseLyricText } from '../../../../packages/core/src/houseband.ts';
import { vocalRange } from '../../../../packages/core/src/lyrics.ts';
import type { SongMeta, Source } from '../../../../packages/core/src/protocol.ts';
import { sql } from '../db/client.ts';
import { logger } from '../logger.ts';

export type Raw = { id: string; title: string; artist: string; featured?: string[]; album: string | null; year: number | null; genre: string; language: string; region: string | null; scene: string; artwork: string | null; duration: number; difficulty: number | null; rank: number };
type YtSource = Extract<Source, { kind: 'youtube' }>;

const DATA = new URL('../../../../data/', import.meta.url);
const raw: Raw[] = (JSON.parse(readFileSync(new URL('catalog.json', DATA), 'utf8')) as Raw[]).filter((s) => s.language !== 'instrumental');
const byId = new Map(raw.map((s) => [s.id, s]));
const curated: Record<string, Omit<YtSource, 'kind'> | null> = existsSync(new URL('karaoke-sources.json', DATA)) ? JSON.parse(readFileSync(new URL('karaoke-sources.json', DATA), 'utf8')) : {};

const house = HOUSE_BAND.map((s) => ({ song: s, compiled: compile(s), text: houseLyricText(s) }));
const houseBySlug = new Map(house.map((h) => [h.song.slug, h]));

/** Attached videos per song key, curated first, then the ones people added. */
const sources = new Map<string, YtSource[]>();
const sourceAddedAt = new Map<string, string>();
for (const [id, v] of Object.entries(curated)) if (v && byId.has(id)) sources.set(`dz:${id}`, [{ kind: 'youtube', ...v }]);

/** What LRCLIB told us per song: word/line timed, none. Plain text indexed for lyric search. */
const lyricState = new Map<string, 'word' | 'line' | 'none'>();
const lyricText = new Map<string, string>();

export async function loadCatalogState() {
  const rows = await sql<{ song_key: string; video_id: string; video_title: string; channel: string; label: YtSource['label']; lyric_anchors: [number, number][] | null; created_at: Date }[]>`select song_key, video_id, video_title, channel, label, lyric_anchors, created_at from song_sources where not rejected order by created_at`;
  for (const r of await sql<{ song_key: string; video_id: string }[]>`select song_key, video_id from song_sources where rejected`) dropSourceFromMemory(r.song_key, r.video_id);
  for (const r of rows) addSourceToMemory(r.song_key, { kind: 'youtube', videoId: r.video_id, videoTitle: r.video_title, channel: r.channel, label: r.label, lyricAnchors: r.lyric_anchors }, r.created_at);
  const extras = await sql<{ data: Raw }[]>`select data from extra_songs order by created_at`;
  for (const e of extras) addExtraSong(e.data);
  const lyr = await sql<{ song_key: string; synced: string | null; plain: string | null; word_timed: boolean }[]>`select song_key, synced, plain, word_timed from lyrics_cache`;
  for (const r of lyr) noteLyrics(r.song_key, r.synced, r.plain, r.word_timed);
  logger.info({ songs: raw.length + house.length, playable: sources.size + house.length, lyrics: lyr.length }, 'catalogue loaded');
}

/** A song imported from Deezer joins the in-memory catalogue alongside the bundled ones. */
export function addExtraSong(r: Raw) {
  if (byId.has(r.id)) return;
  raw.push(r);
  byId.set(r.id, r);
}

export function addSourceToMemory(key: string, src: YtSource, at = new Date()) {
  const list = sources.get(key) ?? [];
  const had = list.find((s) => s.videoId === src.videoId);
  if (had) had.lyricAnchors = src.lyricAnchors ?? had.lyricAnchors;
  else list.push(src);
  // Karaoke versions first, then instrumentals, then originals.
  const rank = { karaoke: 0, instrumental: 1, original: 2 };
  list.sort((a, b) => rank[a.label] - rank[b.label]);
  sources.set(key, list);
  sourceAddedAt.set(key, at.toISOString());
}

export function dropSourceFromMemory(key: string, videoId: string) {
  const list = (sources.get(key) ?? []).filter((s) => s.videoId !== videoId);
  if (list.length) sources.set(key, list);
  else sources.delete(key);
}

/** Flags a video as the wrong song: it leaves the song now and is never auto-attached again. */
export async function rejectSource(key: string, videoId: string, userId: string | null) {
  const src = sources.get(key)?.find((s) => s.videoId === videoId);
  if (!src) return false;
  await sql`insert into song_sources (song_key, video_id, video_title, channel, label, added_by, rejected)
    values (${key}, ${videoId}, ${src.videoTitle}, ${src.channel}, ${src.label}, ${userId}, true)
    on conflict (song_key, video_id) do update set rejected = true`;
  dropSourceFromMemory(key, videoId);
  return true;
}

/** Saves how far a video's edit sits from the lyric timing, for everyone who plays it next. */
export async function saveLyricAnchors(key: string, videoId: string, anchors: [number, number][], userId: string | null) {
  const src = sources.get(key)?.find((s) => s.videoId === videoId);
  if (!src) return false;
  const value = anchors.length ? anchors : null;
  await sql`insert into song_sources (song_key, video_id, video_title, channel, label, added_by, lyric_anchors)
    values (${key}, ${videoId}, ${src.videoTitle}, ${src.channel}, ${src.label}, ${userId}, ${value ? sql.json(value) : null})
    on conflict (song_key, video_id) do update set lyric_anchors = excluded.lyric_anchors`;
  src.lyricAnchors = value;
  return true;
}

export function noteLyrics(key: string, synced: string | null, plain: string | null, wordTimed: boolean) {
  lyricState.set(key, synced ? (wordTimed ? 'word' : 'line') : 'none');
  if (plain) lyricText.set(key, fold(plain));
}

export const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

const LANG: Record<string, string> = { en: 'English', hi: 'Hindi', pa: 'Punjabi', ko: 'Korean', ja: 'Japanese', es: 'Spanish', ta: 'Tamil', other: 'Other' };
export const languageName = (code: string) => LANG[code] ?? code;

export function songMeta(key: string): SongMeta | null {
  if (key.startsWith('hb:')) {
    const h = houseBySlug.get(key.slice(3));
    if (!h) return null;
    const s = h.song;
    return {
      key, title: s.title, artist: s.artist, album: 'Croon house band', year: s.year, genre: s.genre, language: s.language, artwork: null,
      duration: Math.round(h.compiled.duration), difficulty: s.difficulty, range: vocalRange(h.compiled.lyrics), sources: [{ kind: 'house', slug: s.slug }],
      lyrics: 'word', scoring: 'full', addedAt: '2026-11-08T00:00:00.000Z',
    };
  }
  if (key.startsWith('dz:')) {
    const s = byId.get(key.slice(3));
    if (!s) return null;
    const src = sources.get(key) ?? [];
    const lyr = lyricState.get(key) ?? 'unknown';
    return {
      key, title: s.title, artist: s.featured?.length ? `${s.artist}, ${s.featured.join(', ')}` : s.artist, album: s.album, year: s.year, genre: s.genre, language: s.language,
      artwork: s.artwork, duration: s.duration, difficulty: s.difficulty, range: null, sources: src, lyrics: lyr,
      scoring: src.length && (lyr === 'line' || lyr === 'word') ? 'lite' : 'none', addedAt: sourceAddedAt.get(key),
    };
  }
  return null;
}

export const houseCompiled = (slug: string) => houseBySlug.get(slug)?.compiled;
export const catalogRaw = (key: string) => (key.startsWith('dz:') ? byId.get(key.slice(3)) : undefined);
export const isPlayable = (m: SongMeta) => m.sources.length > 0;
const allKeys = () => [...house.map((h) => `hb:${h.song.slug}`), ...raw.map((s) => `dz:${s.id}`)];
export const playableKeys = () => [...house.map((h) => `hb:${h.song.slug}`), ...sources.keys()];

export type SearchQuery = {
  q?: string;
  field?: 'all' | 'title' | 'artist' | 'album' | 'lyrics';
  genre?: string;
  language?: string;
  playable?: boolean;
  synced?: boolean;
  scored?: boolean;
  limit?: number;
  offset?: number;
};

export function search(o: SearchQuery): { total: number; songs: SongMeta[] } {
  const q = o.q ? fold(o.q) : '';
  const field = o.field ?? 'all';
  const scored: { m: SongMeta; s: number }[] = [];
  for (const key of allKeys()) {
    const m = songMeta(key)!;
    if (o.genre && m.genre !== o.genre) continue;
    if (o.language && m.language !== o.language) continue;
    if (o.playable && !isPlayable(m)) continue;
    if (o.synced && !(m.lyrics === 'word' || m.lyrics === 'line')) continue;
    if (o.scored && m.scoring === 'none') continue;
    let s = 0;
    if (q) {
      const title = fold(m.title), artist = fold(m.artist), album = fold(m.album ?? '');
      if ((field === 'all' || field === 'title') && title.includes(q)) s = Math.max(s, title.startsWith(q) ? 100 : 80);
      if ((field === 'all' || field === 'artist') && artist.includes(q)) s = Math.max(s, 70);
      if ((field === 'all' || field === 'album') && album.includes(q)) s = Math.max(s, 50);
      if (field === 'all' || field === 'lyrics') {
        const text = key.startsWith('hb:') ? fold(houseBySlug.get(key.slice(3))!.text) : lyricText.get(key);
        if (text?.includes(q)) s = Math.max(s, 40);
      }
      if (!s) continue;
    }
    // Playable songs first, then popularity.
    s += (isPlayable(m) ? 1000 : 0) + Math.min(99, (catalogRaw(key)?.rank ?? 400_000) / 10_000);
    scored.push({ m, s });
  }
  scored.sort((a, b) => b.s - a.s);
  const offset = o.offset ?? 0, limit = Math.min(100, o.limit ?? 40);
  return { total: scored.length, songs: scored.slice(offset, offset + limit).map((x) => x.m) };
}

export function facets() {
  const genres = new Map<string, { total: number; playable: number }>();
  const languages = new Map<string, { total: number; playable: number }>();
  for (const key of allKeys()) {
    const m = songMeta(key)!;
    for (const [map, k] of [[genres, m.genre], [languages, m.language]] as const) {
      const c = map.get(k) ?? { total: 0, playable: 0 };
      c.total++;
      if (isPlayable(m)) c.playable++;
      map.set(k, c);
    }
  }
  return {
    genres: [...genres].map(([name, c]) => ({ name, ...c })).sort((a, b) => b.playable - a.playable || b.total - a.total),
    languages: [...languages].map(([code, c]) => ({ code, name: languageName(code), ...c })).sort((a, b) => b.playable - a.playable || b.total - a.total),
  };
}

/** Curated crates: hand-picked filters over the catalogue, playable songs first. */
export const CRATES = [
  { id: 'campfire', name: 'Campfire classics', blurb: 'The house band plays, everyone knows the words.', test: (k: string) => k.startsWith('hb:') },
  { id: 'sangeet', name: 'Sangeet night', blurb: 'Modern Bollywood and Punjabi floor-fillers.', test: (k: string) => ['bollywood-modern', 'punjabi'].includes(catalogRaw(k)?.scene ?? '') },
  { id: 'nineties-bollywood', name: 'Nineties Bollywood', blurb: 'Kumar Sanu, Alka Yagnik, Udit Narayan.', test: (k: string) => catalogRaw(k)?.scene === 'bollywood-90s' },
  { id: 'kpop-stage', name: 'K-pop stage', blurb: 'Choreography optional.', test: (k: string) => catalogRaw(k)?.scene === 'kpop' },
  { id: 'jpop', name: 'J-pop night', blurb: 'Anime openings and city pop.', test: (k: string) => catalogRaw(k)?.scene === 'jpop' },
  { id: 'rock-anthems', name: 'Rock anthems', blurb: 'Air guitar encouraged.', test: (k: string) => catalogRaw(k)?.scene === 'rock' },
  { id: 'rnb', name: 'Slow jams', blurb: 'R&B and soul for the smooth voices.', test: (k: string) => catalogRaw(k)?.scene === 'rnb-soul' },
  { id: 'latin', name: 'Latin heat', blurb: 'Reggaeton, bachata and pop latino.', test: (k: string) => catalogRaw(k)?.scene === 'latin' },
  { id: 'nostalgia', name: 'Nostalgia trip', blurb: 'The songs your parents sang.', test: (k: string) => ['nostalgia', 'bollywood-classics'].includes(catalogRaw(k)?.scene ?? '') },
  { id: 'soundtracks', name: 'Movie soundtracks', blurb: 'From the big screen to the living room.', test: (k: string) => catalogRaw(k)?.scene === 'soundtracks' },
  { id: 'south', name: 'South Indian hits', blurb: 'Tamil film favourites.', test: (k: string) => catalogRaw(k)?.scene === 'south-indian' },
  { id: 'imported', name: 'Freshly imported', blurb: 'Songs and whole discographies people brought in from Deezer.', test: (k: string) => catalogRaw(k)?.scene === 'imported' },
  { id: 'hiphop', name: 'Bars only', blurb: 'Hip-hop and desi rap for fast tongues.', test: (k: string) => ['hip-hop', 'desi-hiphop'].includes(catalogRaw(k)?.scene ?? '') },
];

export function crate(id: string, limit = 40) {
  const c = CRATES.find((x) => x.id === id);
  if (!c) return null;
  const songs = allKeys().filter(c.test).map((k) => songMeta(k)!);
  songs.sort((a, b) => Number(isPlayable(b)) - Number(isPlayable(a)) || (catalogRaw(b.key)?.rank ?? 0) - (catalogRaw(a.key)?.rank ?? 0));
  return { id: c.id, name: c.name, blurb: c.blurb, total: songs.length, playable: songs.filter(isPlayable).length, songs: songs.slice(0, limit) };
}

export const metas = (keys: string[]) => keys.map(songMeta).filter((m): m is SongMeta => !!m);
