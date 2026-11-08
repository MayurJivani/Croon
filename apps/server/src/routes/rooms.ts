// Room creation, room lookups, guest audio files, and organised events.
import { Router, raw } from 'express';
import { z } from 'zod';
import { asyncH, requireAuth, roomLimiter, validate, writeLimiter, HttpError } from '../middleware/http.ts';
import { rooms, createRoom, closeRoom } from '../realtime.ts';
import { sql } from '../db/client.ts';
import type { RoomSettings } from '../../../../packages/core/src/protocol.ts';

export const roomsRouter = Router();
const code = z.string().trim().toUpperCase().regex(/^[A-Z]{4}$/, 'Room codes are four letters');

roomsRouter.post('/rooms', roomLimiter, validate(z.object({ name: z.string().trim().max(40).optional() })), (req, res) => {
  const { room, hostToken } = createRoom({ name: req.body.name || 'Karaoke night', kind: 'party' });
  res.status(201).json({ code: room.code, hostToken });
});

roomsRouter.get('/rooms/:code', validate(z.object({ code }), 'params'), (req, res) => {
  const room = rooms.get(String(req.params.code));
  if (!room) throw new HttpError(404, 'No room with that code. Check the letters with your host.');
  const v = room.view();
  res.json({ code: v.code, name: v.name, description: v.description, kind: v.kind, phase: v.phase, people: v.participants.filter((p) => p.role !== 'stage' && p.connected).length });
});

const roomAndPid = (codeRaw: string, token: unknown) => {
  const room = rooms.get(codeRaw.toUpperCase());
  if (!room) throw new HttpError(404, 'Room not found.');
  const pid = typeof token === 'string' && token.length < 100 ? room.pidForToken(token) : null;
  if (!pid) throw new HttpError(403, 'Join the room first.');
  return { room, pid };
};

const AUDIO = /^audio\/(mpeg|mp4|aac|ogg|wav|x-wav|webm|flac|x-m4a)$/;
// A guest's own song, kept in the room's memory for the night so the stage can play it.
roomsRouter.post('/rooms/:code/files', writeLimiter, raw({ type: () => true, limit: '40mb' }), (req, res) => {
  const { room, pid } = roomAndPid(String(req.params.code), req.headers['x-room-token']);
  const type = String(req.headers['content-type'] ?? '');
  if (!AUDIO.test(type)) throw new HttpError(415, 'Send an audio file (MP3, M4A, OGG, WAV or FLAC).');
  if (!Buffer.isBuffer(req.body) || req.body.length < 1000) throw new HttpError(400, 'That file is empty.');
  const name = decodeURIComponent(String(req.headers['x-file-name'] ?? 'Your song')).replace(/[\r\n]/g, '').slice(0, 120);
  const id = room.addFile(pid, req.body, type, name);
  res.status(201).json({ fileId: id, songKey: `file:${id}` });
});

roomsRouter.get('/rooms/:code/files/:id', (req, res) => {
  const { room } = roomAndPid(String(req.params.code), req.headers['x-room-token']);
  const f = room.files.get(String(req.params.id));
  if (!f) throw new HttpError(404, 'That file has left the room.');
  res.setHeader('Content-Type', f.type);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(f.buf);
});

// ---- events ------------------------------------------------------------------------------
const rules = z.object({ scoring: z.boolean(), maxPerPerson: z.number().int().min(1).max(10), guestsCanQueue: z.boolean(), skipRatio: z.number().min(0.3).max(1), autoAdvance: z.boolean() });
type EventRow = { id: string; code: string; owner_id: string; name: string; description: string; rules: z.infer<typeof rules>; created_at: Date; ended_at: Date | null };

function liveRoomFor(e: EventRow) {
  let room = rooms.get(e.code);
  let hostToken: string;
  if (room && room.eventId === e.id) hostToken = room.reissueHost();
  else {
    // The code was taken by another room while this event was closed: give the event a new one.
    const made = createRoom({ name: e.name, description: e.description, kind: 'event', eventId: e.id, code: room ? undefined : e.code });
    room = made.room;
    hostToken = made.hostToken;
  }
  room.settings = { ...room.settings, ...(e.rules as Partial<RoomSettings>) };
  return { room, hostToken };
}

roomsRouter.post('/events', requireAuth, roomLimiter, validate(z.object({ name: z.string().trim().min(2).max(60), description: z.string().trim().max(400).default(''), rules })), asyncH(async (req, res) => {
  const { room, hostToken } = createRoom({ name: req.body.name, description: req.body.description, kind: 'event' });
  const [row] = await sql<{ id: string }[]>`insert into events (code, owner_id, name, description, rules) values (${room.code}, ${req.session.userId}, ${req.body.name}, ${req.body.description}, ${sql.json(req.body.rules)}) returning id`;
  room.eventId = row.id;
  room.settings = { ...room.settings, ...req.body.rules };
  res.status(201).json({ id: row.id, code: room.code, hostToken });
}));

roomsRouter.get('/events', requireAuth, asyncH(async (req, res) => {
  const rows = await sql<EventRow[]>`select * from events where owner_id = ${req.session.userId} order by created_at desc limit 50`;
  res.json({ events: rows.map((e) => ({ id: e.id, name: e.name, description: e.description, code: e.code, live: rooms.get(e.code)?.eventId === e.id, createdAt: e.created_at, endedAt: e.ended_at })) });
}));

const eventById = async (id: string) => {
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, 'Event not found.');
  const [e] = await sql<EventRow[]>`select * from events where id = ${id}`;
  if (!e) throw new HttpError(404, 'Event not found.');
  return e;
};

roomsRouter.get('/events/:id', asyncH(async (req, res) => {
  const e = await eventById(String(req.params.id));
  const board = await sql<{ name: string; best: number; songs: number }[]>`
    select coalesce(u.display_name, p.guest_name, 'Guest') as name, max(p.total)::int as best, count(*)::int as songs
    from performances p left join users u on u.id = p.user_id where p.event_id = ${e.id}
    group by coalesce(u.display_name, p.guest_name, 'Guest') order by best desc limit 30`;
  const live = rooms.get(e.code)?.eventId === e.id;
  res.json({ id: e.id, name: e.name, description: e.description, code: live ? e.code : null, live, rules: e.rules, createdAt: e.created_at, endedAt: e.ended_at, board, isOwner: req.session.userId === e.owner_id });
}));

roomsRouter.post('/events/:id/open', requireAuth, writeLimiter, asyncH(async (req, res) => {
  const e = await eventById(String(req.params.id));
  if (e.owner_id !== req.session.userId) throw new HttpError(403, 'Only the organiser can run this event.');
  const { room, hostToken } = liveRoomFor(e);
  if (room.code !== e.code) await sql`update events set code = ${room.code} where id = ${e.id}`;
  await sql`update events set ended_at = null where id = ${e.id}`;
  res.json({ code: room.code, hostToken });
}));

roomsRouter.post('/events/:id/end', requireAuth, asyncH(async (req, res) => {
  const e = await eventById(String(req.params.id));
  if (e.owner_id !== req.session.userId) throw new HttpError(403, 'Only the organiser can end this event.');
  const room = rooms.get(e.code);
  if (room?.eventId === e.id) closeRoom(e.code);
  await sql`update events set ended_at = now() where id = ${e.id}`;
  res.json({ ok: true });
}));
