// Shapes shared by server and browser: songs, sources, rooms, and every realtime message.
// Client-to-server payloads are Zod schemas so the server can reject anything malformed before
// a room sees it; the browser only imports the types.
import { z } from 'zod';
import type { Timeline } from './timeline.ts';
import type { Score } from './scoring.ts';
import type { ModeId } from './modes.ts';
import type { Anchor } from './lyrics.ts';
import { AVATAR_GLYPHS, type RoomSettings } from './labels.ts';
export * from './labels.ts';

/** Where a song's audio comes from. Every variant says plainly what the listener will hear. */
export type Source =
  | { kind: 'house'; slug: string }
  | { kind: 'youtube'; videoId: string; channel: string; videoTitle: string; label: 'karaoke' | 'instrumental' | 'original'; lyricAnchors?: Anchor[] | null }
  | { kind: 'file'; fileId: string; name: string };


export type SongMeta = {
  key: string;
  title: string;
  artist: string;
  album?: string | null;
  year?: number | null;
  genre: string;
  language: string;
  artwork?: string | null;
  duration: number;
  difficulty?: number | null;
  /** [low, high] MIDI notes when known. */
  range?: [number, number] | null;
  /** Playable sources, best first. Empty means the catalogue knows the song but nothing can play it yet. */
  sources: Source[];
  /** What kind of lyrics exist: word-timed, line-timed, none, or not looked up yet. */
  lyrics: 'word' | 'line' | 'none' | 'unknown';
  scoring: 'full' | 'lite' | 'none';
  plays?: number;
  addedAt?: string;
};

export type Avatar = { glyph: string; color: string };

export type Participant = {
  pid: string;
  name: string;
  avatar: Avatar;
  role: 'host' | 'guest' | 'stage';
  connected: boolean;
  team: 'A' | 'B' | null;
  username?: string | null;
};

export type QueueView = {
  id: string;
  song: SongMeta;
  addedBy: string;
  singers: string[];
  mode: ModeId;
  votes: string[];
};



export type Phase = 'lobby' | 'announce' | 'playing' | 'results';

export type Performance = {
  entryId: string;
  song: SongMeta;
  mode: ModeId;
  singers: string[];
  timeline: Timeline;
  /** Sync points between the lyrics' timing and this video's, set by the host (or saved earlier). */
  lyricAnchors: Anchor[];
  /** Inline lyrics (LRC or UltraStar) for a file the guest brought. */
  lyricsText?: string | null;
  skipVotes: string[];
  cheers: number;
  scores: Record<string, Score>;
  result?: { headline: string; winners: string[] } | null;
};

export type RoomView = {
  code: string;
  name: string;
  description: string;
  kind: 'party' | 'event';
  hostPid: string;
  settings: RoomSettings;
  participants: Participant[];
  queue: QueueView[];
  phase: Phase;
  current: Performance | null;
  /** Room leaderboard: best and summed scores per participant tonight. */
  board: { pid: string; name: string; avatar: Avatar; best: number; total: number; count: number }[];
  teams: { A: number; B: number };
  serverNow: number;
};

// ---- client to server ----------------------------------------------------------------------

const name = z.string().trim().min(1).max(24);
const avatar = z.object({ glyph: z.enum(AVATAR_GLYPHS), color: z.string().regex(/^#[0-9a-f]{6}$/i) });
const id = z.string().min(1).max(64);

export const C2S = {
  join: z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z]{4}$/), name, avatar, token: z.string().max(80).optional(), stage: z.boolean().optional() }),
  queueAdd: z.object({ songKey: z.string().min(1).max(120), mode: z.enum(['solo', 'duet', 'battle', 'group', 'challenge', 'blind', 'roulette', 'team']), singers: z.array(id).max(12).optional(), lyricsText: z.string().max(65_536).optional() }),
  queueVote: z.object({ id }),
  queueRemove: z.object({ id }),
  queueMove: z.object({ id, to: z.number().int().min(0).max(500) }),
  control: z.object({ action: z.enum(['start', 'play', 'pause', 'seek', 'skip', 'end', 'next']), pos: z.number().min(0).max(36_000).optional() }),
  lyricAnchors: z.object({ anchors: z.array(z.tuple([z.number().min(-60).max(36_000), z.number().min(-60).max(36_000)])).max(60) }),
  skipVote: z.object({}),
  cheer: z.object({}),
  settings: z.object({ scoring: z.boolean(), maxPerPerson: z.number().int().min(1).max(10), guestsCanQueue: z.boolean(), skipRatio: z.number().min(0.3).max(1), autoAdvance: z.boolean(), stageLyricsWithVideo: z.boolean() }).partial(),
  participant: z.object({ pid: id, action: z.enum(['kick', 'promote', 'team']), team: z.enum(['A', 'B']).nullable().optional() }),
  /** Live pitch for the stage's lane: song time and MIDI (or null), at most ~12 a second. */
  live: z.object({ t: z.number().min(0).max(36_000), m: z.number().min(0).max(127).nullable() }),
  frames: z.object({ entryId: id, frames: z.array(z.tuple([z.number().min(0).max(36_000), z.number().min(0).max(127).nullable()])).max(20_000), calibrated: z.boolean() }),
  /** The audio device has buffered; it reports the real length because a video rarely matches the catalogue's. */
  stageReady: z.object({ entryId: id, duration: z.number().min(5).max(7200).optional() }),
  stageEnded: z.object({ entryId: id }),
  roulette: z.object({}),
  profile: z.object({ name, avatar }),
};

export type C2SEvent = keyof typeof C2S;

export type LiveMsg = { pid: string; t: number; m: number | null };

