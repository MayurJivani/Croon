// Socket.IO wiring and the room registry. Every client event is schema-checked and rate limited
// here before a Room sees it; Rooms never handle raw payloads (Pressure's pattern).
import type { Server as HttpServer, IncomingHttpHeaders } from 'node:http';
import { randomBytes } from 'node:crypto';
import { Server, type Socket } from 'socket.io';
import { C2S, type C2SEvent } from '../../../packages/core/src/protocol.ts';
import { parseLrc, parseUltrastar, type Lyrics } from '../../../packages/core/src/lyrics.ts';
import { Room, RoomError, newRoomCode, realClock, type Clock, type RoomDeps } from './rooms/room.ts';
import { songMeta, houseCompiled, playableKeys, saveLyricOffset } from './services/catalog.ts';
import { lyricsFor } from './services/lyrics.ts';
import { savePerformance, recordPlay } from './services/stats.ts';
import { sessionFromToken, COOKIE } from './auth/session.ts';
import { sql } from './db/client.ts';
import { logger } from './logger.ts';

export const rooms = new Map<string, Room>();

export async function lyricsForSong(song: { key: string; duration: number; sources: { kind: string }[] }, inline: string | null): Promise<Lyrics | null> {
  if (song.key.startsWith('hb:')) return houseCompiled(song.key.slice(3))?.lyrics ?? null;
  if (inline) return /^#BPM:/im.test(inline) ? parseUltrastar(inline).lyrics : parseLrc(inline, song.duration);
  if (song.key.startsWith('dz:')) {
    const l = await lyricsFor(song.key);
    return l.synced ? parseLrc(l.synced, song.duration) : null;
  }
  return null;
}

let io: Server | null = null;
const pending = new Set<Room>();
function broadcast(room: Room) {
  // Coalesce: several changes in one tick become one snapshot.
  if (pending.has(room)) return;
  pending.add(room);
  queueMicrotask(() => {
    pending.delete(room);
    io?.to(room.code).emit('room', room.view());
  });
}

export function createRoom(o: { name: string; description?: string; kind: 'party' | 'event'; eventId?: string | null; code?: string }, clock: Clock = realClock) {
  let code = o.code ?? newRoomCode();
  while (!o.code && rooms.has(code)) code = newRoomCode();
  const hostToken = randomBytes(24).toString('base64url');
  const deps: RoomDeps = {
    clock,
    song: songMeta,
    randomSong: () => {
      const keys = playableKeys();
      return keys.length ? keys[Math.floor(Math.random() * keys.length)] : null;
    },
    lyrics: (song, inline) => lyricsForSong(song, inline),
    onPlay: (key) => void recordPlay(key).catch(() => {}),
    onLyricOffset: (key, videoId, offset) => void saveLyricOffset(key, videoId, offset, null).catch(() => {}),
    onScored: async (r) => {
      // Party guests' scores live and die with the room; signed-in singers and event entries are kept.
      if (!r.userId && r.room.kind !== 'event') return;
      if (r.song.key.startsWith('file:')) return;
      await savePerformance({ userId: r.userId, guestName: r.userId ? null : r.name, songKey: r.song.key, mode: r.mode, roomCode: r.room.code, eventId: r.room.eventId, score: r.score, seconds: r.song.duration, partnerId: r.partnerUserId });
    },
    broadcast,
  };
  const room = new Room(code, o.name, o.description ?? '', o.kind, hostToken, deps, o.eventId ?? null);
  rooms.set(code, room);
  return { room, hostToken };
}

/** Ends a room for everyone in it. */
export function closeRoom(code: string) {
  const room = rooms.get(code);
  if (!room) return;
  io?.to(code).emit('closed');
  room.close();
  rooms.delete(code);
}

/** Same-site pages only: another site must not open room sockets in a visitor's browser. */
export function originAllowed(h: IncomingHttpHeaders): boolean {
  if (!h.origin) return true;
  try {
    const host = new URL(h.origin).host;
    return host === h.host || (process.env.NODE_ENV === 'development' && /^localhost:\d+$|^127\.0\.0\.1:\d+$/.test(host));
  } catch {
    return false;
  }
}

/** Token bucket per socket: bursts of 40, 20 events a second sustained (live pitch is ~12/s). */
function bucket(capacity = 40, perSec = 20) {
  let tokens = capacity, at = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(capacity, tokens + ((now - at) / 1000) * perSec);
    at = now;
    if (tokens < 1) return false;
    tokens--;
    return true;
  };
}

const parseCookie = (header = '', name: string) => {
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
};

type Ack = (r: unknown) => void;
type Ctx = { socket: Socket; room: Room | null; pid: string | null; userId: string | null; username: string | null };

export function attachRealtime(http: HttpServer) {
  io = new Server(http, {
    maxHttpBufferSize: 512 * 1024, // a full performance's frames, never audio
    pingInterval: 10_000,
    pingTimeout: 8000,
    serveClient: false,
    allowRequest: (req, cb) => cb(null, originAllowed(req.headers)),
    connectionStateRecovery: { maxDisconnectionDuration: 60_000 },
  });
  const sockets = new Map<string, Set<Socket>>(); // `${code}:${pid}` -> sockets, for kicks

  io.on('connection', (socket) => {
    const ctx: Ctx = { socket, room: null, pid: null, userId: null, username: null };
    const take = bucket();
    // Handlers are attached synchronously so a client's first event cannot arrive before them;
    // each handler waits for this lookup instead.
    const ready = (async () => {
      try {
        const s = await sessionFromToken(parseCookie(socket.handshake.headers.cookie, COOKIE));
        if (s?.userId) {
          ctx.userId = s.userId;
          ctx.username = (await sql<{ username: string }[]>`select username from users where id = ${s.userId}`)[0]?.username ?? null;
        }
      } catch (err) {
        logger.warn({ err }, 'socket session lookup failed');
      }
    })();

    socket.on('time', (_: unknown, ack?: Ack) => typeof ack === 'function' && ack(Date.now()));

    const on = <E extends C2SEvent>(event: E, fn: (data: ReturnType<(typeof C2S)[E]['parse']>, ack: Ack) => unknown) => {
      socket.on(event as string, async (raw: unknown, maybeAck?: unknown) => {
        const ack: Ack = typeof maybeAck === 'function' ? (maybeAck as Ack) : () => {};
        if (!take()) return ack({ error: 'Slow down a little.' });
        await ready;
        const parsed = C2S[event].safeParse(raw ?? {});
        if (!parsed.success) return ack({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
        if (event !== 'join' && (!ctx.room || !ctx.pid)) return ack({ error: 'Join a room first.' });
        try {
          ack((await fn(parsed.data as never, ack)) ?? { ok: true });
        } catch (err) {
          if (err instanceof RoomError) return ack({ error: err.message });
          logger.error({ err, event }, 'room event failed');
          ack({ error: 'Something went wrong on our side.' });
        }
      });
    };

    on('join', (d) => {
      const room = rooms.get(d.code);
      if (!room) throw new RoomError('No room with that code. Check the letters with your host.');
      if (ctx.room) leave();
      const { pid, token } = room.join({ name: d.name, avatar: d.avatar, token: d.token, stage: d.stage, userId: ctx.userId, username: ctx.username });
      ctx.room = room;
      ctx.pid = pid;
      socket.join(room.code);
      const k = `${room.code}:${pid}`;
      if (!sockets.has(k)) sockets.set(k, new Set());
      sockets.get(k)!.add(socket);
      room.changed();
      return { ok: true, pid, token, view: room.view() };
    });

    const r = () => ctx.room!, p = () => ctx.pid!;
    on('profile', (d) => r().profile(p(), d.name, d.avatar));
    on('queueAdd', (d) => ({ ok: true, id: r().queueAdd(p(), d).id }));
    on('queueVote', (d) => r().queueVote(p(), d.id));
    on('queueRemove', (d) => r().queueRemove(p(), d.id));
    on('queueMove', (d) => r().queueMove(p(), d.id, d.to));
    on('control', (d) => r().control(p(), d.action, d.pos));
    on('lyricOffset', (d) => r().setLyricOffset(p(), d.offset));
    on('skipVote', () => r().skipVote(p()));
    on('cheer', () => r().cheer(p()));
    on('settings', (d) => r().updateSettings(p(), d));
    on('stageReady', (d) => r().stageReady(p(), d.entryId, d.duration));
    on('stageEnded', (d) => r().stageEnded(p(), d.entryId));
    on('frames', (d) => r().frames(p(), d.entryId, d.frames));
    on('roulette', () => ({ ok: true, id: r().queueAdd(p(), { songKey: 'random', mode: 'roulette' }).id }));
    on('participant', (d) => {
      const kicked = r().participantAction(p(), d.pid, d.action, d.team);
      if (kicked) {
        for (const s of sockets.get(`${r().code}:${kicked}`) ?? []) {
          s.emit('kicked');
          s.leave(r().code);
        }
        sockets.delete(`${r().code}:${kicked}`);
      }
    });
    socket.on('live', (raw: unknown) => {
      if (!take() || !ctx.room || !ctx.pid) return;
      const d = C2S.live.safeParse(raw);
      if (!d.success || !ctx.room.current?.singers.includes(ctx.pid)) return;
      socket.to(ctx.room.code).volatile.emit('live', { pid: ctx.pid, t: d.data.t, m: d.data.m });
    });

    const leave = () => {
      if (!ctx.room || !ctx.pid) return;
      sockets.get(`${ctx.room.code}:${ctx.pid}`)?.delete(socket);
      ctx.room.leave(ctx.pid);
      socket.leave(ctx.room.code);
      ctx.room.changed();
      ctx.room = null;
      ctx.pid = null;
    };
    socket.on('disconnect', leave);
  });

  // Close rooms nobody has touched for two hours, or that have sat empty for twenty minutes.
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      const idle = now - room.lastActive;
      if (idle > 2 * 3600_000 || (room.connectedCount === 0 && idle > 20 * 60_000)) closeRoom(code);
    }
  }, 60_000).unref();
  return io;
}
