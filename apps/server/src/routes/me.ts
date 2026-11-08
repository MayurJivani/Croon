// Personal library, solo scores, profiles and leaderboards.
import { Router, json } from 'express';
import { z } from 'zod';
import { asyncH, requireAuth, validate, writeLimiter, HttpError } from '../middleware/http.ts';
import { metas, songMeta } from '../services/catalog.ts';
import { savePerformance, profileStats, globalBoard, weeklyBoard, songBoard } from '../services/stats.ts';
import { userByName } from '../services/users.ts';
import { lyricsForSong } from '../realtime.ts';
import { scoreFull, scoreLite, maxFrames, type Frame } from '../../../../packages/core/src/scoring.ts';
import { targets, mapLyrics, type Anchor } from '../../../../packages/core/src/lyrics.ts';
import { sql } from '../db/client.ts';

export const meRouter = Router();
const key = z.string().regex(/^(hb|dz):[\w-]{1,60}$/, 'Unknown song');

// ---- favourites and playlists ------------------------------------------------------------
meRouter.get('/me/favorites', requireAuth, asyncH(async (req, res) => {
  const rows = await sql<{ song_key: string }[]>`select song_key from favorites where user_id = ${req.session.userId} order by created_at desc`;
  res.json({ songs: metas(rows.map((r) => r.song_key)) });
}));
meRouter.put('/me/favorites/:key', requireAuth, writeLimiter, validate(z.object({ key }), 'params'), asyncH(async (req, res) => {
  await sql`insert into favorites (user_id, song_key) values (${req.session.userId}, ${String(req.params.key)}) on conflict do nothing`;
  res.json({ ok: true });
}));
meRouter.delete('/me/favorites/:key', requireAuth, validate(z.object({ key }), 'params'), asyncH(async (req, res) => {
  await sql`delete from favorites where user_id = ${req.session.userId} and song_key = ${String(req.params.key)}`;
  res.json({ ok: true });
}));

meRouter.get('/me/playlists', requireAuth, asyncH(async (req, res) => {
  const lists = await sql<{ id: string; name: string; keys: string[] | null }[]>`
    select p.id, p.name, array_agg(s.song_key order by s.position) filter (where s.song_key is not null) as keys
    from playlists p left join playlist_songs s on s.playlist_id = p.id where p.user_id = ${req.session.userId} group by p.id order by p.created_at`;
  res.json({ playlists: lists.map((l) => ({ id: l.id, name: l.name, songs: metas(l.keys ?? []) })) });
}));
meRouter.post('/me/playlists', requireAuth, writeLimiter, validate(z.object({ name: z.string().trim().min(1).max(60) })), asyncH(async (req, res) => {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from playlists where user_id = ${req.session.userId}`;
  if (n >= 50) throw new HttpError(400, 'You have fifty playlists already.');
  const [row] = await sql<{ id: string }[]>`insert into playlists (user_id, name) values (${req.session.userId}, ${req.body.name}) returning id`;
  res.status(201).json({ id: row.id, name: req.body.name, songs: [] });
}));
const ownList = async (userId: string, id: string) => {
  if (!z.string().uuid().safeParse(id).success || !(await sql`select 1 from playlists where id = ${id} and user_id = ${userId}`).length) throw new HttpError(404, 'Playlist not found.');
};
meRouter.delete('/me/playlists/:id', requireAuth, asyncH(async (req, res) => {
  await ownList(req.session.userId!, String(req.params.id));
  await sql`delete from playlists where id = ${String(req.params.id)}`;
  res.json({ ok: true });
}));
meRouter.post('/me/playlists/:id/songs', requireAuth, writeLimiter, validate(z.object({ key })), asyncH(async (req, res) => {
  await ownList(req.session.userId!, String(req.params.id));
  if (!songMeta(req.body.key)) throw new HttpError(404, 'Song not found.');
  await sql`insert into playlist_songs (playlist_id, song_key, position) values (${String(req.params.id)}, ${req.body.key},
    (select coalesce(max(position), 0) + 1 from playlist_songs where playlist_id = ${String(req.params.id)})) on conflict do nothing`;
  res.json({ ok: true });
}));
meRouter.delete('/me/playlists/:id/songs/:key', requireAuth, asyncH(async (req, res) => {
  await ownList(req.session.userId!, String(req.params.id));
  await sql`delete from playlist_songs where playlist_id = ${String(req.params.id)} and song_key = ${String(req.params.key)}`;
  res.json({ ok: true });
}));

// ---- solo performances: scored on the server from pitch frames, never from a claimed number ----
const frame = z.tuple([z.number().min(0).max(36_000), z.number().min(0).max(127).nullable()]);
meRouter.post('/performances', json({ limit: '512kb' }), writeLimiter, validate(z.object({
  songKey: key, mode: z.enum(['solo', 'challenge', 'blind']), frames: z.array(frame).max(20_000), lyricAnchors: z.array(z.tuple([z.number().min(-60).max(36_000), z.number().min(-60).max(36_000)])).max(60).default([]),
})), asyncH(async (req, res) => {
  const song = songMeta(req.body.songKey);
  if (!song) throw new HttpError(404, 'Song not found.');
  if (req.body.frames.length > maxFrames(Math.max(song.duration, 600))) throw new HttpError(400, 'Too many frames for this song.');
  const raw = await lyricsForSong(song, null);
  const lyrics = raw && req.body.lyricAnchors.length ? mapLyrics(raw, req.body.lyricAnchors as Anchor[]) : raw;
  if (!lyrics) throw new HttpError(400, 'This song has no timed lyrics to score against.');
  const frames = req.body.frames as Frame[];
  const ts = targets(lyrics);
  const score = lyrics.pitched && ts.length ? scoreFull(frames, ts) : scoreLite(frames, lyrics.lines);
  const seconds = Math.min(song.duration, frames.length ? frames[frames.length - 1][0] : 0);
  if (!req.session.userId || !frames.some((f) => f[1] !== null)) return res.json({ score, saved: false, personalBest: null, isBest: false });
  const saved = await savePerformance({ userId: req.session.userId, songKey: song.key, mode: req.body.mode, score, seconds });
  res.json({ score, saved: true, personalBest: saved.personalBest, isBest: saved.isBest });
}));

// ---- profiles and follows ----------------------------------------------------------------
meRouter.get('/users/:username', asyncH(async (req, res) => {
  const u = await userByName(String(req.params.username));
  if (!u) throw new HttpError(404, 'No singer by that name.');
  const following = req.session.userId ? (await sql`select 1 from follows where follower = ${req.session.userId} and followee = ${u.id}`).length > 0 : false;
  const [{ followers }] = await sql<{ followers: number }[]>`select count(*)::int as followers from follows where followee = ${u.id}`;
  const isMe = req.session.userId === u.id;
  const extra = isMe ? {
    favorites: metas((await sql<{ song_key: string }[]>`select song_key from favorites where user_id = ${u.id} order by created_at desc limit 24`).map((r) => r.song_key)),
  } : {};
  res.json({ user: { username: u.username, displayName: u.displayName, avatar: u.avatar, joined: u.joined }, stats: await profileStats(u.id), following, followers, isMe, ...extra });
}));
meRouter.put('/users/:username/follow', requireAuth, writeLimiter, asyncH(async (req, res) => {
  const u = await userByName(String(req.params.username));
  if (!u) throw new HttpError(404, 'No singer by that name.');
  if (u.id === req.session.userId) throw new HttpError(400, 'You cannot follow yourself.');
  await sql`insert into follows (follower, followee) values (${req.session.userId}, ${u.id}) on conflict do nothing`;
  res.json({ ok: true });
}));
meRouter.delete('/users/:username/follow', requireAuth, asyncH(async (req, res) => {
  const u = await userByName(String(req.params.username));
  if (u) await sql`delete from follows where follower = ${req.session.userId} and followee = ${u.id}`;
  res.json({ ok: true });
}));

// ---- leaderboards ------------------------------------------------------------------------
meRouter.get('/leaderboards/global', asyncH(async (_req, res) => res.json({ rows: await globalBoard() })));
meRouter.get('/leaderboards/week', asyncH(async (_req, res) => res.json({ rows: await globalBoard({ since: new Date(Date.now() - 7 * 86400_000) }) })));
meRouter.get('/leaderboards/friends', requireAuth, asyncH(async (req, res) => res.json({ rows: await globalBoard({ followerOf: req.session.userId! }) })));
meRouter.get('/leaderboards/challenge', asyncH(async (_req, res) => res.json(await weeklyBoard())));
meRouter.get('/leaderboards/songs/:key', validate(z.object({ key }), 'params'), asyncH(async (req, res) => res.json({ song: songMeta(String(req.params.key)), rows: await songBoard(String(req.params.key)) })));
