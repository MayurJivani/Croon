// End to end: the real app on a random port, real Postgres, several Socket.IO clients in one room.
// Needs DATABASE_URL (docker compose up -d db). A fake clock drives the room's timers.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync, existsSync } from 'node:fs';

const envFile = new URL('../../../.env', import.meta.url);
for (const line of existsSync(envFile) ? readFileSync(envFile, 'utf8').split('\n') : []) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
process.env.NODE_ENV = 'test';
process.env.WARM_LYRICS = '0';
process.env.LOG_LEVEL = 'silent';

const { io: client } = await import('socket.io-client');
const { createApp } = await import('../src/app.ts');
const { attachRealtime, createRoom } = await import('../src/realtime.ts');
const { loadCatalogState } = await import('../src/services/catalog.ts');
const { sql } = await import('../src/db/client.ts');
const { compile, houseSong } = await import('../../../packages/core/src/houseband.ts');
const { targets } = await import('../../../packages/core/src/lyrics.ts');
const { positionAt } = await import('../../../packages/core/src/timeline.ts');

await loadCatalogState();
await sql`delete from users where username like 'test_%'`;
const http = createServer(createApp());
const ioServer = attachRealtime(http);
await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
const sockets: ReturnType<typeof client>[] = [];
after(async () => {
  for (const s of sockets) s.close();
  await ioServer.close();
  await sql`delete from users where username like 'test_%'`;
  await sql.end();
});

/** A tiny cookie-keeping HTTP client with CSRF. */
function agent() {
  const jar = new Map<string, string>();
  let csrf = '';
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), 'x-csrf-token': csrf },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of r.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      jar.set(kv.slice(0, i), kv.slice(i + 1));
    }
    const j = await r.json().catch(() => ({}));
    if (j.csrfToken) csrf = j.csrfToken;
    return { status: r.status, body: j };
  };
  return { call, cookie: () => [...jar].map(([k, v]) => `${k}=${v}`).join('; '), init: () => call('GET', '/api/csrf-token') };
}

// Manual clock: timers fire only when the test advances time.
let now = Date.now();
const timers: { at: number; fn: () => void; id: number }[] = [];
let tid = 0;
const clock = {
  now: () => now,
  set: (fn: () => void, ms: number) => (timers.push({ at: now + ms, fn, id: ++tid }), tid),
  clear: (h: unknown) => {
    const i = timers.findIndex((t) => t.id === h);
    if (i >= 0) timers.splice(i, 1);
  },
};
async function advance(ms: number) {
  now += ms;
  for (;;) {
    timers.sort((a, b) => a.at - b.at);
    if (!timers.length || timers[0].at > now) break;
    timers.shift()!.fn();
  }
  await new Promise((r) => setTimeout(r, 60));
}

type View = { phase: string; queue: { id: string; song: { key: string } }[]; current: { entryId: string; timeline: { playing: boolean; anchorAt: number; anchorPos: number }; scores: Record<string, { total: number; kind: string }>; result: unknown; skipVotes: string[] } | null; participants: { pid: string; role: string; connected: boolean }[]; board: { pid: string; best: number }[] };

function connect(cookie = '') {
  const s = client(base, { transports: ['websocket'], extraHeaders: { cookie }, forceNew: true });
  sockets.push(s);
  const state: { view: View | null; kicked: boolean } = { view: null, kicked: false };
  s.on('room', (v: View) => (state.view = v));
  s.on('kicked', () => (state.kicked = true));
  const emit = (ev: string, data: unknown = {}) => new Promise<{ error?: string; [k: string]: unknown }>((r) => s.emit(ev, data, r));
  return { s, state, emit };
}
const avatar = { glyph: 'mic', color: '#ff4f2e' };
const settle = () => new Promise((r) => setTimeout(r, 80));

test('accounts: register, me, login, wrong password, recovery code reset', async () => {
  const a = agent();
  await a.init();
  const reg = await a.call('POST', '/api/auth/register', { username: 'test_ann', password: 'velvet-lounge-42' });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  assert.match(reg.body.recoveryCode, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/);
  assert.equal((await a.call('GET', '/api/auth/me')).body.user.username, 'test_ann');
  assert.equal((await a.call('POST', '/api/auth/register', { username: 'test_bob', password: '12345678' })).status, 400, 'guessable password refused');
  const b = agent();
  await b.init();
  assert.equal((await b.call('POST', '/api/auth/login', { username: 'test_ann', password: 'nope-nope-nope' })).status, 401);
  assert.equal((await b.call('POST', '/api/auth/login', { username: 'TEST_ANN', password: 'velvet-lounge-42' })).status, 200);
  const rec = await b.call('POST', '/api/auth/recover', { username: 'test_ann', recoveryCode: reg.body.recoveryCode.toLowerCase(), newPassword: 'neon-cassette-77' });
  assert.equal(rec.status, 200, JSON.stringify(rec.body));
  assert.notEqual(rec.body.recoveryCode, reg.body.recoveryCode, 'a used recovery code is replaced');
  assert.equal((await b.call('POST', '/api/auth/recover', { username: 'test_ann', recoveryCode: reg.body.recoveryCode, newPassword: 'another-pass-99' })).status, 401, 'old code is spent');
  const noCsrf = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { cookie: b.cookie() } });
  assert.equal(noCsrf.status, 403, 'state change without CSRF token refused');
});

test('library: search by title, artist, lyrics; filters; song page', async () => {
  const a = agent();
  await a.init();
  const s1 = await a.call('GET', '/api/songs/search?q=amazing&field=title');
  assert.equal(s1.body.songs[0].key, 'hb:amazing-grace');
  const s2 = await a.call('GET', '/api/songs/search?q=wretch%20like%20me&field=lyrics');
  assert.equal(s2.body.songs[0].key, 'hb:amazing-grace', 'lyric search finds house band text');
  const s3 = await a.call('GET', '/api/songs/search?q=arijit&field=artist&playable=1');
  assert.ok(s3.body.songs.length > 0 && s3.body.songs.every((x: { sources: unknown[] }) => x.sources.length > 0));
  const s4 = await a.call('GET', '/api/songs/search?scored=1&language=ja');
  assert.ok(s4.body.songs.some((x: { key: string }) => x.key === 'hb:sakura-sakura'));
  const home = await a.call('GET', '/api/songs/home');
  assert.ok(home.body.trending.length > 0 && home.body.crates.length > 5 && home.body.weekly.song);
  const page = await a.call('GET', '/api/songs/hb:silent-night');
  assert.equal(page.body.song.scoring, 'full');
  assert.ok(page.body.rights);
  assert.equal((await a.call('GET', '/api/songs/dz:nope')).status, 404);
});

test('room: four clients, fair queue, shared timeline, server scoring, late join, reconnect, vote skip, kick', async () => {
  const ann = agent();
  await ann.init();
  await ann.call('POST', '/api/auth/login', { username: 'test_ann', password: 'neon-cassette-77' });

  const { room, hostToken } = createRoom({ name: 'Test night', kind: 'party' }, clock);
  const host = connect();
  const a = connect(ann.cookie());
  const b = connect();
  const stage = connect();
  const jh = await host.emit('join', { code: room.code, name: 'Host', avatar, token: hostToken });
  assert.ok(jh.ok, JSON.stringify(jh));
  const ja = await a.emit('join', { code: room.code, name: 'Ann', avatar });
  const jb = await b.emit('join', { code: room.code, name: 'Bob', avatar });
  await stage.emit('join', { code: room.code, name: 'Stage', avatar, stage: true });
  const [hostPid, annPid, bobPid] = [jh.pid, ja.pid, jb.pid] as string[];
  assert.equal(room.hostPid, hostPid);
  assert.equal((await b.emit('join', { code: 'ZZZZ', name: 'Bob', avatar })).error?.startsWith('No room'), true);

  // Clock sync answers with server time.
  const t = await new Promise<number>((r) => a.s.emit('time', null, r));
  assert.ok(Math.abs(t - Date.now()) < 1000);

  // Fair queue: Ann queues two, Bob one; Bob's lands between Ann's.
  assert.ok((await a.emit('queueAdd', { songKey: 'hb:twinkle-twinkle', mode: 'solo' })).ok);
  assert.ok((await a.emit('queueAdd', { songKey: 'hb:clementine', mode: 'solo' })).ok);
  assert.ok((await b.emit('queueAdd', { songKey: 'hb:jingle-bells', mode: 'solo' })).ok);
  assert.equal((await b.emit('queueAdd', { songKey: 'hb:jingle-bells', mode: 'solo' })).error, 'That song is already in the queue.');
  assert.equal((await b.emit('control', { action: 'start' })).error, 'Only the host can do that.');
  assert.equal((await a.emit('queueAdd', { songKey: 'dz:999', mode: 'solo' })).error, 'Song not found.');
  await settle();
  assert.deepEqual(stage.state.view!.queue.map((q) => q.song.key), ['hb:twinkle-twinkle', 'hb:jingle-bells', 'hb:clementine']);

  // Start: announce, then the house band begins on a shared timeline.
  assert.ok((await host.emit('control', { action: 'start' })).ok);
  await settle();
  assert.equal(stage.state.view!.phase, 'announce');
  await advance(5300);
  for (const c of [host, a, b, stage]) assert.equal(c.state.view!.phase, 'playing');
  const tl = stage.state.view!.current!.timeline;
  assert.deepEqual(a.state.view!.current!.timeline, tl, 'every client holds the same timeline');
  assert.ok(tl.playing && tl.anchorAt > now, 'lead-in so all devices start together');

  // A late joiner gets the live song and can work out the position.
  const c = connect();
  await c.emit('join', { code: room.code, name: 'Cat', avatar });
  await settle();
  assert.equal(c.state.view!.current!.entryId, stage.state.view!.current!.entryId);
  assert.ok(positionAt(c.state.view!.current!.timeline, now + 10_000) > 8);

  // Pause and seek are host-only and move everyone's clock.
  await host.emit('control', { action: 'pause' });
  await settle();
  assert.equal(b.state.view!.current!.timeline.playing, false);
  await host.emit('control', { action: 'seek', pos: 0 });
  await host.emit('control', { action: 'play' });
  await settle();
  assert.equal(b.state.view!.current!.timeline.playing, true);

  // Reconnect with the token keeps the same seat.
  const a2 = connect(ann.cookie());
  const rj = await a2.emit('join', { code: room.code, name: 'Ann', avatar, token: ja.token });
  assert.equal(rj.pid, annPid);

  // Ann sings it perfectly: the phone sends pitch frames, the server scores and saves them.
  const song = compile(houseSong('twinkle-twinkle')!);
  const frames: [number, number][] = [];
  for (const n of targets(song.lyrics)) for (let x = n.t; x < n.t + n.d; x += 0.05) frames.push([x, n.note]);
  const entryId = stage.state.view!.current!.entryId;
  assert.ok((await a2.emit('frames', { entryId, frames, calibrated: true })).ok);
  assert.ok((await stage.emit('stageEnded', { entryId })).ok);
  await settle();
  await settle();
  const res = stage.state.view!;
  assert.equal(res.phase, 'results');
  assert.ok(res.current!.scores[annPid].total >= 95, JSON.stringify(res.current!.scores));
  assert.equal(res.board[0].pid, annPid);
  const saved = await sql`select total from performances p join users u on u.id = p.user_id where u.username = 'test_ann' and p.song_key = 'hb:twinkle-twinkle'`;
  assert.equal(saved.length, 1, 'a signed-in singer\'s room score is kept');

  // Next song is Bob's; the room votes it off. Bob cannot vote on his own song.
  await host.emit('control', { action: 'next' });
  await advance(5300);
  assert.equal(stage.state.view!.current!.entryId !== entryId, true);
  assert.equal((await b.emit('skipVote')).error, 'Singers can stop by asking the host.');
  await a2.emit('skipVote');
  await c.emit('skipVote');
  await settle();
  assert.equal(stage.state.view!.phase, 'results', 'two of three listeners voted to skip');

  // The host removes Cat, who is told and cannot rejoin with the same token.
  const cPid = c.state.view!.participants.find((p) => p.role === 'guest' && p.pid !== annPid && p.pid !== bobPid)!.pid;
  await host.emit('participant', { pid: cPid, action: 'kick' });
  await settle();
  assert.equal(c.state.kicked, true);
  assert.ok(!stage.state.view!.participants.some((p) => p.pid === cPid));
});

test('events: organiser creates, reopens as host, public page shows the board', async () => {
  const o = agent();
  await o.init();
  await o.call('POST', '/api/auth/register', { username: 'test_org', password: 'stage-lights-on-9' });
  const ev = await o.call('POST', '/api/events', { name: 'Friday Lounge', description: 'Office party', rules: { scoring: true, maxPerPerson: 2, guestsCanQueue: true, skipRatio: 0.6, autoAdvance: false } });
  assert.equal(ev.status, 201, JSON.stringify(ev.body));
  const pub = await agent().call('GET', `/api/events/${ev.body.id}`);
  assert.equal(pub.body.live, true);
  assert.equal(pub.body.code, ev.body.code);
  const reopen = await o.call('POST', `/api/events/${ev.body.id}/open`);
  assert.equal(reopen.body.code, ev.body.code);
  const h = connect(o.cookie());
  const j = await h.emit('join', { code: ev.body.code, name: 'Organiser', avatar, token: reopen.body.hostToken });
  assert.ok(j.ok);
  await settle();
  assert.equal(h.state.view!.participants.find((p) => p.pid === j.pid)!.role, 'host');
  const stranger = agent();
  await stranger.init();
  await stranger.call('POST', '/api/auth/register', { username: 'test_eve', password: 'not-the-owner-5' });
  assert.equal((await stranger.call('POST', `/api/events/${ev.body.id}/open`)).status, 403);
  assert.equal((await o.call('POST', `/api/events/${ev.body.id}/end`)).status, 200);
});
