// One karaoke room. The server owns everything here: who is in, the queue, the phase, and the
// playback timeline. Clients send intents; the room decides and broadcasts one snapshot.
// State is in memory on purpose: a room is one night. Scores worth keeping go to Postgres.
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { addEntry, moveEntry, removeEntry, toggleVote, skipThreshold, type QueueEntry } from '../../../../packages/core/src/queue.ts';
import { MODES, withParts, type ModeId } from '../../../../packages/core/src/modes.ts';
import { stopped, play, pause, seek, positionAt } from '../../../../packages/core/src/timeline.ts';
import { parseLrc, parseUltrastar, targets, type Lyrics } from '../../../../packages/core/src/lyrics.ts';
import { scoreFull, scoreLite, maxFrames, type Frame, type Score } from '../../../../packages/core/src/scoring.ts';
import { DEFAULT_SETTINGS, type Avatar, type Participant, type Performance, type Phase, type RoomSettings, type RoomView, type SongMeta } from '../../../../packages/core/src/protocol.ts';

export type Clock = { now(): number; set(fn: () => void, ms: number): unknown; clear(h: unknown): void };
export const realClock: Clock = { now: () => Date.now(), set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as NodeJS.Timeout) };

/** What a room needs from the rest of the app, injected so the room can be tested without a database. */
export type RoomDeps = {
  clock: Clock;
  song(key: string): SongMeta | null;
  randomSong(): string | null;
  lyrics(song: SongMeta, inline: string | null): Promise<Lyrics | null>;
  onPlay(songKey: string): void;
  /** The host nudged a video's lyric timing: remember it for the next time anyone plays it. */
  onLyricOffset(songKey: string, videoId: string, offset: number): void;
  onScored(r: { room: Room; pid: string; userId: string | null; name: string; song: SongMeta; mode: ModeId; score: Score; partnerUserId: string | null }): Promise<void>;
  broadcast(room: Room): void;
};

type Member = Participant & { tokenHash: Buffer; userId: string | null; sockets: number };
type UploadedFile = { buf: Buffer; type: string; name: string; by: string; at: number };
type Current = Performance & { frames: Map<string, Frame[]>; timers: unknown[]; lyrics: Lyrics | null; awaitingFrames: Set<string> };

const ANNOUNCE_MS = 5200;
const READY_WAIT_MS = 9000;
const LEAD_MS = 1200;
const FRAMES_WAIT_MS = 7000;

const digest = (t: string) => createHash('sha256').update(t).digest();
const same = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

export class RoomError extends Error {}

export class Room {
  readonly participants = new Map<string, Member>();
  readonly queue: QueueEntry[] = [];
  readonly songs = new Map<string, { song: SongMeta; lyricsText: string | null }>();
  readonly files = new Map<string, UploadedFile>();
  readonly board = new Map<string, { best: number; total: number; count: number }>();
  readonly teams = { A: 0, B: 0 };
  private readonly banned: Buffer[] = [];
  settings: RoomSettings = { ...DEFAULT_SETTINGS };
  phase: Phase = 'lobby';
  current: Current | null = null;
  hostPid = '';
  lastActive: number;
  private hostTokenHash: Buffer;

  readonly code: string;
  name: string;
  description: string;
  readonly kind: 'party' | 'event';
  eventId: string | null;
  private readonly deps: RoomDeps;

  constructor(code: string, name: string, description: string, kind: 'party' | 'event', hostToken: string, deps: RoomDeps, eventId: string | null = null) {
    this.code = code;
    this.name = name;
    this.description = description;
    this.kind = kind;
    this.deps = deps;
    this.eventId = eventId;
    this.hostTokenHash = digest(hostToken);
    this.lastActive = deps.clock.now();
  }

  // ---- membership --------------------------------------------------------------------------

  /** Joins or rejoins. A matching token reclaims the same seat, which is how reconnects keep identity. */
  join(o: { name: string; avatar: Avatar; token?: string; stage?: boolean; userId: string | null; username: string | null }): { pid: string; token: string } {
    this.touch();
    if (o.token) {
      const h = digest(o.token);
      if (this.banned.some((b) => same(b, h))) throw new RoomError('The host removed you from this room.');
      for (const m of this.participants.values()) {
        if (same(m.tokenHash, h)) {
          m.sockets++;
          m.connected = true;
          if (!o.stage) {
            m.name = o.name;
            m.avatar = o.avatar;
          }
          if (o.userId) m.userId = o.userId;
          return { pid: m.pid, token: o.token };
        }
      }
    }
    if ([...this.participants.values()].filter((m) => m.role !== 'stage').length >= 60 && !o.stage) throw new RoomError('This room is full.');
    const isHost = !!o.token && same(digest(o.token), this.hostTokenHash);
    const token = isHost ? o.token! : randomBytes(24).toString('base64url');
    const pid = randomUUID().slice(0, 8);
    this.participants.set(pid, {
      pid, name: o.stage ? 'Stage' : o.name, avatar: o.avatar, role: o.stage ? 'stage' : isHost ? 'host' : 'guest', connected: true, team: null,
      username: o.username, tokenHash: digest(token), userId: o.userId, sockets: 1,
    });
    if (isHost) {
      // A reissued host token (event owner reopening the console) takes over from the old seat.
      if (this.hostPid && this.participants.has(this.hostPid)) this.participants.get(this.hostPid)!.role = 'guest';
      this.hostPid = pid;
    }
    // A party with no host yet (the creator never arrived) hands the mic to the first guest.
    if (!this.hostPid && !o.stage && this.kind === 'party') {
      this.hostPid = pid;
      this.participants.get(pid)!.role = 'host';
    }
    return { pid, token };
  }

  leave(pid: string) {
    const m = this.participants.get(pid);
    if (!m) return;
    m.sockets = Math.max(0, m.sockets - 1);
    m.connected = m.sockets > 0;
  }

  get connectedCount() {
    return [...this.participants.values()].filter((m) => m.connected).length;
  }

  member(pid: string) {
    const m = this.participants.get(pid);
    if (!m) throw new RoomError('You are not in this room.');
    return m;
  }

  isHost = (pid: string) => pid === this.hostPid;
  private requireHost(pid: string) {
    if (!this.isHost(pid)) throw new RoomError('Only the host can do that.');
  }
  private touch() {
    this.lastActive = this.deps.clock.now();
  }

  /** A fresh host token for the event owner; whoever joins with it becomes host. */
  reissueHost(): string {
    const t = randomBytes(24).toString('base64url');
    this.hostTokenHash = digest(t);
    return t;
  }

  /** Verifies a participant token for HTTP requests (file uploads), returning the pid. */
  pidForToken(token: string): string | null {
    const h = digest(token);
    for (const m of this.participants.values()) if (same(m.tokenHash, h)) return m.pid;
    return null;
  }

  /** Who plays the audio: the stage screen when one is connected, otherwise the host's device. */
  get audioOwner(): string {
    for (const m of this.participants.values()) if (m.role === 'stage' && m.connected) return m.pid;
    return this.hostPid;
  }

  profile(pid: string, name: string, avatar: Avatar) {
    const m = this.member(pid);
    m.name = name;
    m.avatar = avatar;
    this.changed();
  }

  participantAction(by: string, pid: string, action: 'kick' | 'promote' | 'team', team?: 'A' | 'B' | null) {
    this.requireHost(by);
    const m = this.member(pid);
    if (action === 'kick') {
      if (pid === by) throw new RoomError('You cannot remove yourself.');
      this.banned.push(m.tokenHash);
      this.participants.delete(pid);
      for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i].addedBy === pid) this.queue.splice(i, 1);
    } else if (action === 'promote') {
      if (m.role === 'stage') throw new RoomError('The stage screen cannot host.');
      this.member(this.hostPid).role = 'guest';
      m.role = 'host';
      this.hostPid = pid;
    } else m.team = team ?? null;
    this.changed();
    return action === 'kick' ? pid : null;
  }

  updateSettings(by: string, s: Partial<RoomSettings>) {
    this.requireHost(by);
    this.settings = { ...this.settings, ...s };
    this.changed();
  }

  // ---- queue -------------------------------------------------------------------------------

  queueAdd(by: string, o: { songKey: string; mode: ModeId; singers?: string[]; lyricsText?: string }) {
    const m = this.member(by);
    if (m.role === 'stage') throw new RoomError('The stage screen cannot queue songs.');
    if (!this.settings.guestsCanQueue && !this.isHost(by)) throw new RoomError('The host is choosing the songs tonight.');
    const mode = MODES[o.mode];
    let key = o.songKey;
    if (mode.picks) {
      const r = this.deps.randomSong();
      if (!r) throw new RoomError('No playable songs to pick from.');
      key = r;
    }
    let song: SongMeta | null;
    if (key.startsWith('file:')) {
      const f = this.files.get(key.slice(5));
      if (!f) throw new RoomError('That file is no longer in the room. Upload it again.');
      song = fileSong(key, f, o.lyricsText ?? null);
    } else song = this.deps.song(key);
    if (!song) throw new RoomError('Song not found.');
    if (!song.sources.length) throw new RoomError('That song has no karaoke track yet. Attach one from its page first.');

    let singers = o.singers?.length ? o.singers : [by];
    if (mode.id === 'roulette') {
      const pool = [...this.participants.values()].filter((p) => p.role !== 'stage' && p.connected && !(this.kind === 'event' && p.role === 'host'));
      if (!pool.length) throw new RoomError('Nobody here to spin for.');
      singers = [pool[Math.floor(Math.random() * pool.length)].pid];
    }
    singers = [...new Set(singers)].filter((p) => this.participants.has(p) && this.participants.get(p)!.role !== 'stage');
    if (mode.id !== 'group' && (singers.length < mode.singers[0] || singers.length > mode.singers[1])) {
      throw new RoomError(mode.singers[0] === mode.singers[1] ? `${mode.name} needs ${mode.singers[0]} singer${mode.singers[0] > 1 ? 's' : ''}.` : `${mode.name} needs ${mode.singers[0]} to ${mode.singers[1]} singers.`);
    }
    const entry: QueueEntry = { id: randomUUID().slice(0, 10), songKey: key, addedBy: by, singers, mode: mode.id, votes: [], at: this.deps.clock.now() };
    // The host is not capped: organising the night is their job.
    const res = addEntry(this.queue, entry, { maxPerPerson: this.isHost(by) ? 50 : this.settings.maxPerPerson });
    if (!res.ok) throw new RoomError(res.error);
    this.songs.set(entry.id, { song, lyricsText: o.lyricsText ?? null });
    this.changed();
    return entry;
  }

  queueVote(by: string, id: string) {
    this.member(by);
    if (!toggleVote(this.queue, id, by)) throw new RoomError('That song left the queue.');
    this.changed();
  }

  queueRemove(by: string, id: string) {
    const e = this.queue.find((x) => x.id === id);
    if (!e) throw new RoomError('That song left the queue.');
    if (e.addedBy !== by && !this.isHost(by)) throw new RoomError('Only the host or the person who queued it can remove it.');
    removeEntry(this.queue, id);
    this.songs.delete(id);
    this.changed();
  }

  queueMove(by: string, id: string, to: number) {
    this.requireHost(by);
    moveEntry(this.queue, id, to);
    this.changed();
  }

  // ---- playback ----------------------------------------------------------------------------

  control(by: string, action: 'start' | 'next' | 'play' | 'pause' | 'seek' | 'skip' | 'end', pos?: number) {
    this.requireHost(by);
    const now = this.deps.clock.now();
    const c = this.current;
    switch (action) {
      case 'start':
      case 'next':
        if (this.phase === 'announce' || this.phase === 'playing') throw new RoomError('A song is already on.');
        return this.startNext();
      case 'play':
        if (!c || this.phase !== 'playing') throw new RoomError('Nothing is playing.');
        if (!c.timeline.playing) c.timeline = play(c.timeline, now, 600);
        this.armEndTimer();
        break;
      case 'pause':
        if (!c || this.phase !== 'playing') throw new RoomError('Nothing is playing.');
        c.timeline = pause(c.timeline, now);
        this.armEndTimer();
        break;
      case 'seek':
        if (!c || this.phase !== 'playing' || pos === undefined) throw new RoomError('Nothing is playing.');
        c.timeline = seek(c.timeline, now, Math.min(pos, c.song.duration));
        this.armEndTimer();
        break;
      case 'skip':
        if (!c) throw new RoomError('Nothing to skip.');
        this.finish('skipped');
        return;
      case 'end':
        this.clearTimers();
        this.current = null;
        this.phase = 'lobby';
        break;
    }
    this.changed();
  }

  private startNext() {
    const e = this.queue.shift();
    if (!e) throw new RoomError('The queue is empty. Add a song first.');
    const { song, lyricsText } = this.songs.get(e.id)!;
    this.songs.delete(e.id);
    this.clearTimers();
    let singers = e.singers;
    if (e.mode === 'group') {
      singers = [...this.participants.values()].filter((p) => p.role !== 'stage' && p.connected && !(this.kind === 'event' && p.role === 'host')).map((p) => p.pid);
    }
    this.current = {
      entryId: e.id, song, mode: e.mode as ModeId, singers, timeline: stopped(0), lyricOffset: song.sources[0]?.kind === 'youtube' ? song.sources[0].lyricOffset ?? 0 : 0, lyricsText,
      skipVotes: [], cheers: 0, scores: {}, result: null, frames: new Map(), timers: [], lyrics: null, awaitingFrames: new Set(),
    };
    this.phase = 'announce';
    void this.deps.lyrics(song, lyricsText).then((l) => {
      if (this.current?.entryId === e.id) this.current.lyrics = l;
    }).catch(() => {});
    this.timer(() => this.awaitReady(), ANNOUNCE_MS);
    this.changed();
  }

  private readyFor: string | null = null;
  private awaitReady() {
    const c = this.current;
    if (!c || this.phase !== 'announce') return;
    // The house band synthesises instantly; videos and files need the audio device to buffer.
    if (c.song.sources[0]?.kind === 'house') return this.begin();
    this.readyFor = c.entryId;
    this.timer(() => this.readyFor === c.entryId && this.begin(), READY_WAIT_MS);
  }

  /** The audio device reports it has buffered. Only the device that will play counts. */
  stageReady(by: string, entryId: string, duration?: number) {
    if (by !== this.audioOwner || this.current?.entryId !== entryId) return;
    if (duration && this.current.song.sources[0]?.kind !== 'house') this.current.song = { ...this.current.song, duration: Math.round(duration) };
    if (this.readyFor === entryId) this.begin();
  }

  private begin() {
    const c = this.current;
    if (!c) return;
    this.readyFor = null;
    this.phase = 'playing';
    c.timeline = play(stopped(0), this.deps.clock.now(), LEAD_MS);
    this.deps.onPlay(c.song.key);
    this.armEndTimer();
    this.changed();
  }

  private endTimer: unknown = null;
  /** Backstop for the end of a song in case the audio device never reports it. */
  private armEndTimer() {
    if (this.endTimer) this.deps.clock.clear(this.endTimer);
    this.endTimer = null;
    const c = this.current;
    if (!c || !c.timeline.playing) return;
    const left = c.song.duration - positionAt(c.timeline, this.deps.clock.now());
    const id = c.entryId;
    this.endTimer = this.deps.clock.set(() => this.current?.entryId === id && this.phase === 'playing' && this.finish('ended'), Math.max(0, left * 1000) + 4000);
  }

  stageEnded(by: string, entryId: string) {
    if (by !== this.audioOwner || this.current?.entryId !== entryId || this.phase !== 'playing') return;
    this.finish('ended');
  }

  private finish(how: 'ended' | 'skipped') {
    const c = this.current;
    if (!c) return;
    this.clearTimers();
    c.timeline = pause(c.timeline, this.deps.clock.now());
    this.phase = 'results';
    if (how === 'skipped' || !this.settings.scoring) {
      c.result = { headline: how === 'skipped' ? 'Skipped' : 'Scoring is off tonight', winners: [] };
      this.changed();
      return this.maybeAutoAdvance();
    }
    // Singers' phones send their frames when they see the results phase. Wait for them, briefly.
    c.awaitingFrames = new Set(c.singers.filter((p) => !c.frames.has(p) && this.participants.get(p)?.connected));
    this.changed();
    if (!c.awaitingFrames.size) void this.resolve();
    else this.timer(() => void this.resolve(), FRAMES_WAIT_MS);
  }

  /** A singer's pitch frames for the performance. Scored here, never trusted from the client. */
  async frames(by: string, entryId: string, frames: Frame[]) {
    const c = this.current;
    if (!c || c.entryId !== entryId || !c.singers.includes(by)) return;
    if (frames.length > maxFrames(c.song.duration)) throw new RoomError('Too many frames for this song.');
    c.frames.set(by, frames);
    c.awaitingFrames.delete(by);
    if (this.phase === 'results' && !c.awaitingFrames.size && !c.result) await this.resolve();
  }

  private resolving = false;
  private async resolve() {
    const c = this.current;
    if (!c || c.result || this.resolving) return;
    this.resolving = true;
    try {
      const lyrics = c.lyrics ?? (await this.deps.lyrics(c.song, c.lyricsText ?? null));
      const parted = lyrics && MODES[c.mode].parts ? withParts(lyrics) : lyrics;
      const partners = c.singers.map((p) => this.participants.get(p)?.userId ?? null);
      for (const [i, pid] of c.singers.entries()) {
        const fr = c.frames.get(pid);
        if (!fr || !parted || !fr.some((f) => f[1] !== null)) continue;
        const part = MODES[c.mode].parts ? i + 1 : 0;
        const shifted = c.lyricOffset ? fr.map(([t, m]) => [t - c.lyricOffset, m] as Frame) : fr;
        const ts = targets(parted, part);
        const score = parted.pitched && ts.length ? scoreFull(shifted, ts) : scoreLite(shifted, parted.lines.filter((l) => !part || !l.part || l.part === part));
        c.scores[pid] = score;
        const m = this.participants.get(pid);
        if (!m) continue;
        const b = this.board.get(pid) ?? { best: 0, total: 0, count: 0 };
        this.board.set(pid, { best: Math.max(b.best, score.total), total: b.total + score.total, count: b.count + 1 });
        if (MODES[c.mode].teams && m.team) this.teams[m.team] += score.total;
        await this.deps.onScored({ room: this, pid, userId: m.userId, name: m.name, song: c.song, mode: c.mode, score, partnerUserId: partners.find((u, j) => j !== i && u) ?? null }).catch(() => {});
      }
      c.result = MODES[c.mode].resolve(Object.entries(c.scores).map(([pid, s]) => ({ pid, name: this.participants.get(pid)?.name ?? 'Someone', total: s.total })));
      this.changed();
      this.maybeAutoAdvance();
    } finally {
      this.resolving = false;
    }
  }

  private maybeAutoAdvance() {
    if (!this.settings.autoAdvance) return;
    const id = this.current?.entryId;
    this.timer(() => {
      if (this.current?.entryId === id && this.phase === 'results') {
        if (this.queue.length) this.startNext();
        else {
          this.phase = 'lobby';
          this.current = null;
          this.changed();
        }
      }
    }, 15_000);
  }

  setLyricOffset(by: string, offset: number) {
    this.requireHost(by);
    if (!this.current) throw new RoomError('Nothing is playing.');
    this.current.lyricOffset = Math.round(offset * 100) / 100;
    const src = this.current.song.sources[0];
    if (src?.kind === 'youtube') this.deps.onLyricOffset(this.current.song.key, src.videoId, this.current.lyricOffset);
    this.changed();
  }

  skipVote(by: string) {
    const c = this.current;
    if (!c || this.phase !== 'playing') throw new RoomError('Nothing to skip.');
    if (c.singers.includes(by)) throw new RoomError('Singers can stop by asking the host.');
    if (!c.skipVotes.includes(by)) c.skipVotes.push(by);
    const voters = [...this.participants.values()].filter((p) => p.connected && p.role !== 'stage' && !c.singers.includes(p.pid)).length;
    if (c.skipVotes.length >= skipThreshold(voters, this.settings.skipRatio)) this.finish('skipped');
    else this.changed();
  }

  cheer(by: string) {
    this.member(by);
    if (this.current && this.phase === 'playing') {
      this.current.cheers++;
      this.changed();
    }
  }

  // ---- files -------------------------------------------------------------------------------

  addFile(by: string, buf: Buffer, type: string, name: string): string {
    this.member(by);
    const mine = [...this.files.values()].filter((f) => f.by === by).length;
    if (mine >= 3) throw new RoomError('You already have three files in this room.');
    const total = [...this.files.values()].reduce((s, f) => s + f.buf.length, 0);
    if (total + buf.length > 200 * 1024 * 1024) throw new RoomError('This room is out of space for files.');
    const id = randomUUID().slice(0, 12);
    this.files.set(id, { buf, type, name: name.slice(0, 120), by, at: this.deps.clock.now() });
    return id;
  }

  // ---- views -------------------------------------------------------------------------------

  view(): RoomView {
    const c = this.current;
    const hide = c && MODES[c.mode].hidesSong && this.phase !== 'results';
    return {
      code: this.code, name: this.name, description: this.description, kind: this.kind, hostPid: this.hostPid, settings: this.settings,
      participants: [...this.participants.values()].map(({ pid, name, avatar, role, connected, team, username }) => ({ pid, name, avatar, role, connected, team, username })),
      queue: this.queue.map((e) => {
        const s = this.songs.get(e.id)!.song;
        return { id: e.id, song: MODES[e.mode as ModeId].hidesSong ? blind(s) : s, addedBy: e.addedBy, singers: e.singers, mode: e.mode as ModeId, votes: e.votes };
      }),
      phase: this.phase,
      current: c ? {
        entryId: c.entryId, song: hide ? blind(c.song) : c.song, mode: c.mode, singers: c.singers, timeline: c.timeline, lyricOffset: c.lyricOffset,
        lyricsText: c.lyricsText ?? null, skipVotes: c.skipVotes, cheers: c.cheers, scores: c.scores, result: c.result ?? null,
      } : null,
      board: [...this.board].map(([pid, b]) => ({ pid, name: this.participants.get(pid)?.name ?? 'Gone', avatar: this.participants.get(pid)?.avatar ?? { glyph: 'mic', color: '#f2e8dc' }, ...b })).sort((a, b) => b.best - a.best),
      teams: { ...this.teams },
      serverNow: this.deps.clock.now(),
    };
  }

  private timer(fn: () => void, ms: number) {
    this.current?.timers.push(this.deps.clock.set(fn, ms));
  }
  private clearTimers() {
    for (const t of this.current?.timers ?? []) this.deps.clock.clear(t);
    if (this.current) this.current.timers = [];
    if (this.endTimer) this.deps.clock.clear(this.endTimer);
    this.endTimer = null;
    this.readyFor = null;
  }
  changed() {
    this.touch();
    this.deps.broadcast(this);
  }
  close() {
    this.clearTimers();
    this.files.clear();
  }
}

/** Blind karaoke: everything that would give the song away is withheld, audio source included. */
function blind(s: SongMeta): SongMeta {
  return { ...s, title: 'Mystery tape', artist: '???', album: null, artwork: null, year: null };
}

/** A guest's own file as a song. Lyrics come from the LRC or UltraStar text they attached. */
export function fileSong(key: string, f: { name: string }, lyricsText: string | null): SongMeta {
  let lyrics: SongMeta['lyrics'] = 'none', scoring: SongMeta['scoring'] = 'none', title = f.name.replace(/\.[a-z0-9]+$/i, ''), artist = 'Your file';
  if (lyricsText) {
    if (/^#BPM:/im.test(lyricsText)) {
      const u = parseUltrastar(lyricsText);
      lyrics = 'word';
      scoring = u.lyrics.pitched ? 'full' : 'lite';
      title = u.meta.title || title;
      artist = u.meta.artist || artist;
    } else {
      const l = parseLrc(lyricsText);
      lyrics = l.lines.length ? (l.wordTimed ? 'word' : 'line') : 'none';
      scoring = l.lines.length ? 'lite' : 'none';
      title = lyricsText.match(/^\[ti:(.+)\]/im)?.[1]?.trim() || title;
      artist = lyricsText.match(/^\[ar:(.+)\]/im)?.[1]?.trim() || artist;
    }
  }
  return { key, title, artist, genre: 'Your files', language: 'other', duration: 600, sources: [{ kind: 'file', fileId: key.slice(5), name: f.name }], lyrics, scoring };
}

const LETTERS = 'BCDFGHJKLMNPQRSTVWXZ'; // consonants only: no accidental words, no O/0 or I/1 confusion
export const newRoomCode = () => Array.from(randomBytes(4), (b) => LETTERS[b % LETTERS.length]).join('');
