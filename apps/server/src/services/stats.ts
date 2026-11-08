// Performances, leaderboards, streaks and achievements. Achievements and streaks are derived from
// the performances table on read rather than stored, so they can never drift from what happened.
import { HOUSE_BAND } from '../../../../packages/core/src/houseband.ts';
import type { Score } from '../../../../packages/core/src/scoring.ts';
import { sql } from '../db/client.ts';
import { songMeta, metas, playableKeys, search } from './catalog.ts';

export type SavePerformance = {
  userId: string | null;
  guestName?: string | null;
  songKey: string;
  mode: string;
  roomCode?: string | null;
  eventId?: string | null;
  score: Score;
  seconds: number;
  partnerId?: string | null;
};

export async function savePerformance(p: SavePerformance): Promise<{ id: string; personalBest: number | null; isBest: boolean }> {
  const prev = p.userId ? (await sql<{ best: number | null }[]>`select max(total) as best from performances where user_id = ${p.userId} and song_key = ${p.songKey}`)[0]?.best ?? null : null;
  const [row] = await sql<{ id: string }[]>`
    insert into performances (user_id, guest_name, song_key, mode, room_code, event_id, kind, total, pitch, timing, stability, completion, consistency, seconds, partner_id)
    values (${p.userId}, ${p.guestName ?? null}, ${p.songKey}, ${p.mode}, ${p.roomCode ?? null}, ${p.eventId ?? null}, ${p.score.kind}, ${p.score.total}, ${p.score.pitch},
            ${p.score.timing}, ${p.score.stability}, ${p.score.completion}, ${p.score.consistency}, ${Math.round(p.seconds)}, ${p.partnerId ?? null})
    returning id`;
  return { id: row.id, personalBest: prev, isBest: prev === null || p.score.total > prev };
}

export const recordPlay = (songKey: string) => sql`insert into plays (song_key) values (${songKey})`;

let shelfCache: { at: number; trending: string[]; popular: string[] } | null = null;
async function shelves() {
  if (shelfCache && Date.now() - shelfCache.at < 60_000) return shelfCache;
  const trending = (await sql<{ song_key: string }[]>`select song_key from plays where played_at > now() - interval '7 days' group by song_key order by count(*) desc limit 24`).map((r) => r.song_key);
  const popular = (await sql<{ song_key: string }[]>`select song_key from performances group by song_key order by count(*) desc limit 24`).map((r) => r.song_key);
  shelfCache = { at: Date.now(), trending, popular };
  return shelfCache;
}

/** Fills a shelf that has no history yet with the most popular playable songs, so a new install is not empty. */
function topUp(keys: string[], n: number, seed: number) {
  const out = metas(keys).filter((m) => m.sources.length);
  if (out.length >= n) return out.slice(0, n);
  const fill = search({ playable: true, limit: 80 }).songs.filter((m) => !out.some((o) => o.key === m.key));
  // Rotate the fill so trending and popular do not show the same filler.
  return [...out, ...fill.slice(seed).concat(fill.slice(0, seed))].slice(0, n);
}

export async function homeShelves(userId: string | null) {
  const s = await shelves();
  const recent = playableKeys().map(songMeta).filter((m) => m && m.addedAt).sort((a, b) => (b!.addedAt! > a!.addedAt! ? 1 : -1)).slice(0, 16);
  return {
    trending: topUp(s.trending, 16, 0),
    popular: topUp(s.popular, 16, 16),
    recentlyAdded: recent,
    recommended: await recommended(userId),
    recentlyPlayed: userId ? metas((await sql<{ song_key: string }[]>`select song_key from performances where user_id = ${userId} group by song_key order by max(created_at) desc limit 12`).map((r) => r.song_key)) : [],
  };
}

/** Songs in the genres and languages you sing and favourite most, that you have not sung yet. */
async function recommended(userId: string | null) {
  if (!userId) return search({ playable: true, limit: 12, offset: 30 }).songs;
  const mine = await sql<{ song_key: string }[]>`select song_key from performances where user_id = ${userId} union select song_key from favorites where user_id = ${userId}`;
  const seen = new Set(mine.map((r) => r.song_key));
  const taste = new Map<string, number>();
  for (const m of metas([...seen])) {
    taste.set(`g:${m.genre}`, (taste.get(`g:${m.genre}`) ?? 0) + 2);
    taste.set(`l:${m.language}`, (taste.get(`l:${m.language}`) ?? 0) + 1);
  }
  if (!taste.size) return search({ playable: true, limit: 12, offset: 30 }).songs;
  return metas(playableKeys())
    .filter((m) => !seen.has(m.key))
    .map((m) => ({ m, s: (taste.get(`g:${m.genre}`) ?? 0) + (taste.get(`l:${m.language}`) ?? 0) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 12)
    .map((x) => x.m);
}

export type BoardRow = { username: string; displayName: string; avatar: unknown; score: number; songs: number };

/** Song ranking: each singer's best on this song. */
export async function songBoard(songKey: string) {
  return sql<{ username: string; display_name: string; avatar: unknown; total: number; kind: string; created_at: Date }[]>`
    select distinct on (u.id) u.username, u.display_name, u.avatar, p.total, p.kind, p.created_at
    from performances p join users u on u.id = p.user_id
    where p.song_key = ${songKey} order by u.id, p.total desc, p.created_at`.then((rows) => rows.sort((a, b) => b.total - a.total).slice(0, 25));
}

/**
 * Global and friends rankings use the average of each singer's best per song, over at least three
 * songs. Averaging rather than summing means singing more songs does not beat singing them well,
 * and the scorer's octave and latency allowances keep it from rewarding equipment.
 */
export async function globalBoard(opts: { followerOf?: string; since?: Date } = {}) {
  const since = opts.since ?? new Date(0);
  const rows = await sql<{ username: string; display_name: string; avatar: unknown; score: number; songs: number }[]>`
    with bests as (
      select user_id, song_key, max(total) as best from performances
      where user_id is not null and created_at >= ${since}
      ${opts.followerOf ? sql`and (user_id = ${opts.followerOf} or user_id in (select followee from follows where follower = ${opts.followerOf}))` : sql``}
      group by user_id, song_key
    )
    select u.username, u.display_name, u.avatar, round(avg(b.best))::int as score, count(*)::int as songs
    from bests b join users u on u.id = b.user_id
    group by u.id having count(*) >= ${opts.followerOf ? 1 : 3}
    order by score desc, songs desc limit 50`;
  return rows;
}

/** The week's challenge song: one house band song per ISO week, so everyone can play it legally. */
export function weeklyChallenge(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() || 7;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - day + 1);
  const week = Math.floor(monday.getTime() / (7 * 86400_000));
  const song = HOUSE_BAND[week % HOUSE_BAND.length];
  return { songKey: `hb:${song.slug}`, since: monday, ends: new Date(monday.getTime() + 7 * 86400_000) };
}

export async function weeklyBoard() {
  const w = weeklyChallenge();
  const rows = await sql<{ username: string; display_name: string; avatar: unknown; total: number }[]>`
    select u.username, u.display_name, u.avatar, max(p.total)::int as total from performances p join users u on u.id = p.user_id
    where p.song_key = ${w.songKey} and p.created_at >= ${w.since} group by u.id order by total desc limit 25`;
  return { ...w, song: songMeta(w.songKey), rows };
}

const day = (d: Date) => d.toISOString().slice(0, 10);
export function streakOf(dates: Date[], now = new Date()): number {
  const days = new Set(dates.map(day));
  const cur = new Date(now);
  if (!days.has(day(cur))) cur.setUTCDate(cur.getUTCDate() - 1); // a streak survives until tomorrow
  let n = 0;
  while (days.has(day(cur))) {
    n++;
    cur.setUTCDate(cur.getUTCDate() - 1);
  }
  return n;
}

type PRow = { song_key: string; mode: string; kind: string; total: number; pitch: number | null; timing: number; seconds: number; partner_id: string | null; created_at: Date; partner: string | null };

export const ACHIEVEMENTS = [
  { id: 'first-song', name: 'First note', blurb: 'Sang your first song.' },
  { id: 'ten-songs', name: 'Regular', blurb: 'Ten performances.' },
  { id: 'fifty-songs', name: 'Resident', blurb: 'Fifty performances.' },
  { id: 'headliner', name: 'Headliner', blurb: 'Scored 90 or more.' },
  { id: 'perfect-pitch', name: 'Dead centre', blurb: 'Pitch accuracy of 95 or more on a scored song.' },
  { id: 'duet', name: 'Better together', blurb: 'Sang a duet.' },
  { id: 'polyglot', name: 'Polyglot', blurb: 'Sang in three languages.' },
  { id: 'streak-3', name: 'On a roll', blurb: 'Sang three days in a row.' },
  { id: 'streak-7', name: 'Week-long tour', blurb: 'Sang seven days in a row.' },
  { id: 'house-band', name: 'Full set', blurb: 'Sang every house band song.' },
  { id: 'challenger', name: 'Challenger', blurb: 'Entered a weekly challenge.' },
  { id: 'hour', name: 'Marathon', blurb: 'An hour of singing in total.' },
] as const;

export async function profileStats(userId: string) {
  const perf = await sql<PRow[]>`
    select p.song_key, p.mode, p.kind, p.total, p.pitch, p.timing, p.seconds, p.partner_id, p.created_at, u.username as partner
    from performances p left join users u on u.id = p.partner_id where p.user_id = ${userId} order by p.created_at desc`;
  const count = (f: (p: PRow) => string) => {
    const m = new Map<string, number>();
    for (const p of perf) m.set(f(p), (m.get(f(p)) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const meta = new Map(metas([...new Set(perf.map((p) => p.song_key))]).map((m) => [m.key, m]));
  const best = new Map<string, PRow>();
  for (const p of perf) if (!best.has(p.song_key) || best.get(p.song_key)!.total < p.total) best.set(p.song_key, p);
  const seconds = perf.reduce((s, p) => s + p.seconds, 0);
  const streak = streakOf(perf.map((p) => p.created_at));
  const longest = (() => {
    const days = [...new Set(perf.map((p) => day(p.created_at)))].sort();
    let run = 0, top = 0, prev = '';
    for (const d of days) {
      run = prev && (new Date(d).getTime() - new Date(prev).getTime()) === 86400_000 ? run + 1 : 1;
      top = Math.max(top, run);
      prev = d;
    }
    return top;
  })();
  const langs = new Set(perf.map((p) => meta.get(p.song_key)?.language).filter(Boolean));
  const houseSung = new Set(perf.filter((p) => p.song_key.startsWith('hb:')).map((p) => p.song_key));
  const w = weeklyChallenge();
  const earned = new Set<string>();
  if (perf.length >= 1) earned.add('first-song');
  if (perf.length >= 10) earned.add('ten-songs');
  if (perf.length >= 50) earned.add('fifty-songs');
  if (perf.some((p) => p.total >= 90)) earned.add('headliner');
  if (perf.some((p) => (p.pitch ?? 0) >= 95)) earned.add('perfect-pitch');
  if (perf.some((p) => p.mode === 'duet')) earned.add('duet');
  if (langs.size >= 3) earned.add('polyglot');
  if (longest >= 3) earned.add('streak-3');
  if (longest >= 7) earned.add('streak-7');
  if (houseSung.size >= HOUSE_BAND.length) earned.add('house-band');
  if (perf.some((p) => p.song_key === w.songKey && p.created_at >= w.since)) earned.add('challenger');
  if (seconds >= 3600) earned.add('hour');
  const top = perf.reduce<PRow | null>((a, p) => (!a || p.total > a.total ? p : a), null);
  return {
    performances: perf.length,
    seconds,
    streak,
    longestStreak: longest,
    highest: top ? { total: top.total, song: meta.get(top.song_key) ?? null } : null,
    mostPerformed: count((p) => p.song_key).slice(0, 1).map(([k, n]) => ({ song: meta.get(k) ?? null, times: n }))[0] ?? null,
    favoriteArtists: count((p) => meta.get(p.song_key)?.artist ?? '?').slice(0, 3).map(([name, n]) => ({ name, n })),
    favoriteGenres: count((p) => meta.get(p.song_key)?.genre ?? '?').slice(0, 3).map(([name, n]) => ({ name, n })),
    bests: [...best.values()].sort((a, b) => b.total - a.total).slice(0, 12).map((p) => ({ song: meta.get(p.song_key) ?? null, total: p.total, kind: p.kind, at: p.created_at })),
    history: perf.slice(0, 30).map((p) => ({ song: meta.get(p.song_key) ?? null, total: p.total, kind: p.kind, mode: p.mode, partner: p.partner, at: p.created_at })),
    duets: perf.filter((p) => p.mode === 'duet').slice(0, 10).map((p) => ({ song: meta.get(p.song_key) ?? null, total: p.total, partner: p.partner, at: p.created_at })),
    achievements: ACHIEVEMENTS.map((a) => ({ ...a, earned: earned.has(a.id) })),
  };
}

export async function personalBest(userId: string, songKey: string) {
  const [r] = await sql<{ best: number | null }[]>`select max(total) as best from performances where user_id = ${userId} and song_key = ${songKey}`;
  return r?.best ?? null;
}
