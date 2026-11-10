import { Router } from 'express';
import { z } from 'zod';
import { asyncH, requireAuth, searchLimiter, validate, writeLimiter, roomLimiter, HttpError } from '../middleware/http.ts';
import { discover, importTrack, autoFind, startArtistImport, startImport, albumSongs, trackSongs, getJob } from '../services/imports.ts';
import { isSeeder } from '../services/users.ts';
import { search, facets, songMeta, crate, CRATES, addSourceToMemory, playableKeys, catalogRaw, saveLyricAnchors, rejectSource } from '../services/catalog.ts';
import { lyricsFor, lookupLyrics } from '../services/lyrics.ts';
import { verifyVideo, videoIdFrom, searchKaraoke, searchAvailable } from '../services/youtube.ts';
import { homeShelves, songBoard, personalBest, weeklyBoard } from '../services/stats.ts';
import { houseSong } from '../../../../packages/core/src/houseband.ts';
import { cachedTranslation, translateSong, translationProvider } from '../services/translate.ts';
import { sql } from '../db/client.ts';

export const songsRouter = Router();
const flag = z.enum(['1', 'true', '0', 'false']).transform((v) => v === '1' || v === 'true').optional();
const key = z.string().regex(/^(hb|dz):[\w-]{1,60}$/, 'Unknown song');

songsRouter.get('/search', searchLimiter, validate(z.object({
  q: z.string().max(100).optional(), field: z.enum(['all', 'title', 'artist', 'album', 'lyrics']).optional(), genre: z.string().max(40).optional(), language: z.string().max(20).optional(),
  playable: flag, synced: flag, scored: flag, limit: z.coerce.number().int().min(1).max(100).optional(), offset: z.coerce.number().int().min(0).max(5000).optional(),
}), 'query'), (req, res) => {
  res.json(search(req.query as never));
});

songsRouter.get('/facets', (_req, res) => res.json(facets()));

songsRouter.get('/home', asyncH(async (req, res) => {
  res.json({ ...(await homeShelves(req.session.userId)), crates: CRATES.map((c) => { const x = crate(c.id, 6)!; return { id: x.id, name: x.name, blurb: x.blurb, total: x.total, playable: x.playable, songs: x.songs }; }), weekly: await weeklyBoard() });
}));

songsRouter.get('/crates/:id', (req, res) => {
  const c = crate(String(req.params.id), 100);
  if (!c) throw new HttpError(404, 'No such crate.');
  res.json(c);
});

songsRouter.get('/lookup/lyrics', searchLimiter, validate(z.object({ artist: z.string().trim().min(1).max(120), title: z.string().trim().min(1).max(160), duration: z.coerce.number().min(1).max(7200).optional() }), 'query'), asyncH(async (req, res) => {
  const q = req.query as unknown as { artist: string; title: string; duration?: number };
  const r = await lookupLyrics(q.artist, q.title, q.duration);
  if (!r) throw new HttpError(404, 'LRCLIB has no synced lyrics for that song.');
  res.json(r);
}));

// ---- growing the library -------------------------------------------------------------------
songsRouter.get('/discover', searchLimiter, validate(z.object({ q: z.string().trim().min(2).max(100) }), 'query'), asyncH(async (req, res) => {
  res.json(await discover((req.query as unknown as { q: string }).q, await isSeeder(req.session.userId)));
}));

// Seeding whole albums and bulk track lists is for the deployment's seeders only (env SEEDERS).
const requireSeeder: typeof requireAuth = (req, _res, next) => {
  isSeeder(req.session.userId).then((ok) => next(ok ? undefined : new HttpError(403, 'Only seeders can do that.')), next);
};

songsRouter.post('/import-album', requireAuth, requireSeeder, roomLimiter, validate(z.object({ albumId: z.string().regex(/^\d{1,15}$/), name: z.string().trim().min(1).max(160) })), (req, res) => {
  res.status(202).json({ job: startImport(req.body.name, 'Reading the album', () => albumSongs(req.body.albumId), req.session.userId) });
});

// Bulk: Deezer track ids or track links, one import job for the lot.
songsRouter.post('/import-bulk', requireAuth, requireSeeder, roomLimiter, validate(z.object({ ids: z.array(z.string().regex(/^\d{1,15}$/)).min(1).max(500) })), (req, res) => {
  const ids = [...new Set(req.body.ids as string[])];
  res.status(202).json({ job: startImport(`${ids.length} songs`, 'Reading the tracks', () => trackSongs(ids), req.session.userId) });
});

songsRouter.post('/import', requireAuth, writeLimiter, validate(z.object({ deezerId: z.string().regex(/^\d{1,15}$/) })), asyncH(async (req, res) => {
  const song = await importTrack(req.body.deezerId, req.session.userId);
  const found = await autoFind(song.key, req.session.userId);
  res.status(201).json({ song: songMeta(song.key), found, canSearchVideos: searchAvailable() });
}));

songsRouter.post('/import-artist', requireAuth, roomLimiter, validate(z.object({ artistId: z.string().regex(/^\d{1,15}$/), name: z.string().trim().min(1).max(120) })), (req, res) => {
  res.status(202).json({ job: startArtistImport(req.body.artistId, req.body.name, req.session.userId) });
});

songsRouter.get('/imports/:id', (req, res) => {
  const job = getJob(String(req.params.id));
  if (!job) throw new HttpError(404, 'No such import.');
  res.json({ job, songs: job.keys.map(songMeta).filter(Boolean) });
});

songsRouter.get('/random', (_req, res) => {
  const keys = playableKeys();
  res.json({ song: songMeta(keys[Math.floor(Math.random() * keys.length)]) });
});

songsRouter.get('/:key', validate(z.object({ key }), 'params'), asyncH(async (req, res) => {
  const k = String(req.params.key);
  const song = songMeta(k);
  if (!song) throw new HttpError(404, 'Song not found.');
  const uid = req.session.userId;
  const fav = uid ? (await sql`select 1 from favorites where user_id = ${uid} and song_key = ${k}`).length > 0 : false;
  res.json({
    song,
    rights: k.startsWith('hb:') ? houseSong(k.slice(3))?.rights ?? null : null,
    board: await songBoard(k),
    personalBest: uid ? await personalBest(uid, k) : null,
    favorite: fav,
    canSearchVideos: searchAvailable(),
    scene: catalogRaw(k)?.scene ?? null,
  });
}));

songsRouter.get('/:key/lyrics', validate(z.object({ key }), 'params'), asyncH(async (req, res) => {
  const k = String(req.params.key);
  if (k.startsWith('hb:')) return res.json({ format: 'house' });
  if (!songMeta(k)) throw new HttpError(404, 'Song not found.');
  const l = await lyricsFor(k);
  res.json(l.synced ? { format: 'lrc', lrc: l.synced, wordTimed: l.wordTimed, source: 'LRCLIB' } : { format: 'none', plain: l.plain });
}));

// Attaching a karaoke video: the client sends a link, the server extracts the id and checks it with YouTube.
// English lyrics: a cached translation is free for anyone; making a new one spends the provider's
// allowance, so that takes a signed-in user and the write rate limit.
songsRouter.get('/:key/translation', validate(z.object({ key }), 'params'), asyncH(async (req, res) => {
  const k = String(req.params.key);
  const cached = await cachedTranslation(k);
  if (cached) return res.json({ lines: cached, cached: true });
  res.json({ lines: null, available: !!translationProvider(), canCreate: !!req.session.userId });
}));
songsRouter.post('/:key/translation', requireAuth, writeLimiter, validate(z.object({ key }), 'params'), asyncH(async (req, res) => {
  const k = String(req.params.key);
  res.json({ lines: (await cachedTranslation(k)) ?? (await translateSong(k)), cached: false });
}));

songsRouter.post('/:key/sources', requireAuth, writeLimiter, validate(z.object({ url: z.string().min(11).max(300) })), asyncH(async (req, res) => {
  const k = String(req.params.key);
  if (!k.startsWith('dz:') || !songMeta(k)) throw new HttpError(404, 'Song not found.');
  const id = videoIdFrom(req.body.url);
  if (!id) throw new HttpError(400, 'That does not look like a YouTube link.');
  const v = await verifyVideo(id);
  if (!v) throw new HttpError(400, 'That video is missing or its owner does not allow embedding.');
  await sql`insert into song_sources (song_key, video_id, video_title, channel, label, added_by) values (${k}, ${v.videoId}, ${v.videoTitle}, ${v.channel}, ${v.label}, ${req.session.userId}) on conflict do nothing`;
  addSourceToMemory(k, v);
  res.status(201).json({ source: v, song: songMeta(k) });
}));

songsRouter.post('/:key/sources/:videoId/reject', requireAuth, writeLimiter, asyncH(async (req, res) => {
  const k = String(req.params.key);
  if (!(await rejectSource(k, String(req.params.videoId), req.session.userId))) throw new HttpError(404, 'That video is not attached to this song.');
  res.json({ ok: true, song: songMeta(k) });
}));

songsRouter.post('/:key/sync', requireAuth, writeLimiter, validate(z.object({ videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/), anchors: z.array(z.tuple([z.number().min(-60).max(36_000), z.number().min(-60).max(36_000)])).max(60) })), asyncH(async (req, res) => {
  const k = String(req.params.key);
  if (!(await saveLyricAnchors(k, req.body.videoId, req.body.anchors, req.session.userId))) throw new HttpError(404, 'That video is not attached to this song.');
  res.json({ ok: true, song: songMeta(k) });
}));

songsRouter.post('/:key/autofind', requireAuth, writeLimiter, validate(z.object({ key }), 'params'), asyncH(async (req, res) => {
  const k = String(req.params.key);
  if (!k.startsWith('dz:') || !songMeta(k)) throw new HttpError(404, 'Song not found.');
  res.json({ found: await autoFind(k, req.session.userId), song: songMeta(k), canSearchVideos: searchAvailable() });
}));

const searched = new Map<string, Awaited<ReturnType<typeof searchKaraoke>>>();
songsRouter.get('/:key/videos', requireAuth, searchLimiter, asyncH(async (req, res) => {
  const k = String(req.params.key);
  const s = songMeta(k);
  if (!s || !k.startsWith('dz:')) throw new HttpError(404, 'Song not found.');
  if (!searchAvailable()) return res.json({ available: false, videos: [] });
  if (!searched.has(k)) searched.set(k, await searchKaraoke(s.title, s.artist)); // quota: cache every answer
  res.json({ available: true, videos: searched.get(k) });
}));
