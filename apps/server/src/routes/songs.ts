import { Router } from 'express';
import { z } from 'zod';
import { asyncH, requireAuth, searchLimiter, validate, writeLimiter, HttpError } from '../middleware/http.ts';
import { search, facets, songMeta, crate, CRATES, addSourceToMemory, playableKeys, catalogRaw } from '../services/catalog.ts';
import { lyricsFor, lookupLyrics } from '../services/lyrics.ts';
import { verifyVideo, videoIdFrom, searchKaraoke, searchAvailable } from '../services/youtube.ts';
import { homeShelves, songBoard, personalBest, weeklyBoard } from '../services/stats.ts';
import { houseSong } from '../../../../packages/core/src/houseband.ts';
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

const searched = new Map<string, Awaited<ReturnType<typeof searchKaraoke>>>();
songsRouter.get('/:key/videos', requireAuth, searchLimiter, asyncH(async (req, res) => {
  const k = String(req.params.key);
  const s = songMeta(k);
  if (!s || !k.startsWith('dz:')) throw new HttpError(404, 'Song not found.');
  if (!searchAvailable()) return res.json({ available: false, videos: [] });
  if (!searched.has(k)) searched.set(k, await searchKaraoke(s.title, s.artist)); // quota: cache every answer
  res.json({ available: true, videos: searched.get(k) });
}));
