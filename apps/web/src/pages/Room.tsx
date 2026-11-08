// A guest's (and the host's) phone in a room: join, follow the song, queue, vote, cheer, sing.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { Play, Pause, SkipForward, Square, Rewind, FastForward, ThumbsUp, Trash2, ChevronUp, ChevronDown, Heart, Mic, MicOff, Tv, Share2, Shuffle, Dices, Upload, Crown, UserX, Search, QrCode, Type } from 'lucide-react';
import { AVATAR_COLORS, AVATAR_GLYPHS } from '../../../../packages/core/src/labels.ts';
import type { Avatar as AvatarT, Participant, RoomView, SongMeta } from '../../../../packages/core/src/protocol.ts';
import { MODES, withParts, type ModeId } from '../../../../packages/core/src/modes.ts';
import { positionAt } from '../../../../packages/core/src/timeline.ts';
import { mapLyrics, addAnchor, nudgeAnchors } from '../../../../packages/core/src/lyrics.ts';
import type { Frame } from '../../../../packages/core/src/scoring.ts';
import { useRoom, roomToken, type Reply } from '../lib/room.ts';
import { useSongLyrics, usePrefs, DEFAULT_PREFS, useTranslation, canTranslate, type LyricPrefs } from '../lib/lyrics.ts';
import { useGetter } from '../lib/playback.ts';
import { useSession } from '../lib/session.tsx';
import { api } from '../lib/api.ts';
import type { Mic as MicT } from '../audio/mic.ts';
import { Lyrics } from '../components/Lyrics.tsx';
import { LyricSettings } from '../components/LyricSettings.tsx';
import { Spotlight } from '../components/Spotlight.tsx';
import { ScoreReveal } from '../components/ScoreReveal.tsx';
import { Calibrate } from '../components/Calibrate.tsx';
import { RoomAudio } from '../components/RoomAudio.tsx';
import { Avatar, AVATAR_ICONS, Key, Loading, Toast, Field, genreInk, SourceTag } from '../components/ui.tsx';
import { TapeScrub } from '../components/TapeScrub.tsx';
import { roundOf } from '../../../../packages/core/src/queue.ts';
import { rememberRoom } from './Rooms.tsx';

const ME_KEY = 'croon:me';
const pickRandom = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

function JoinGate({ code, onJoin }: { code: string; onJoin(me: { name: string; avatar: AvatarT }): void }) {
  const { user } = useSession();
  const saved = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(ME_KEY) ?? 'null') as { name: string; avatar: AvatarT } | null;
    } catch {
      return null;
    }
  }, []);
  const [name, setName] = useState(saved?.name ?? user?.displayName ?? '');
  const [avatar, setAvatar] = useState<AvatarT>(saved?.avatar ?? user?.avatar ?? { glyph: pickRandom(AVATAR_GLYPHS), color: pickRandom(AVATAR_COLORS) });
  const [info, setInfo] = useState<{ name: string; people: number; kind: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ name: string; people: number; kind: string }>(`/rooms/${code}`).then(setInfo).catch((e) => setErr(e.message));
  }, [code]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const me = { name: name.trim().slice(0, 24), avatar };
    try {
      localStorage.setItem(ME_KEY, JSON.stringify(me));
    } catch {
      /* ignore */
    }
    onJoin(me);
  };
  if (err) return <div className="join-gate"><h1>Room {code}</h1><Toast msg={err} tone="error" /><Link to="/rooms" className="key key-md"><span>Try another code</span></Link></div>;
  return (
    <form className="join-gate" onSubmit={submit}>
      <div>
        <p className="room-code">{code}</p>
        <h1 style={{ fontSize: 'clamp(2.4rem, 9vw, 3.6rem)' }}>{info?.name ?? 'Joining…'}</h1>
        {info && <p className="empty">{info.people} {info.people === 1 ? 'person' : 'people'} here{info.kind === 'event' ? ' · organised event' : ''}</p>}
      </div>
      <Field label="Your name">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} required autoFocus placeholder="What should the stage call you?" />
      </Field>
      <div className="field">
        <span className="field-label">Your badge</span>
        <div className="glyphs" role="group" aria-label="Badge icon">
          {AVATAR_GLYPHS.map((g) => {
            const I = AVATAR_ICONS[g];
            return <button type="button" key={g} aria-pressed={avatar.glyph === g} aria-label={g} onClick={() => setAvatar({ ...avatar, glyph: g })} style={avatar.glyph === g ? { background: avatar.color, color: 'var(--card-ink)' } : undefined}><I size={20} /></button>;
          })}
        </div>
        <div className="swatches" role="group" aria-label="Badge colour">
          {AVATAR_COLORS.map((c) => <button type="button" key={c} aria-pressed={avatar.color === c} aria-label={`Colour ${c}`} style={{ background: c }} onClick={() => setAvatar({ ...avatar, color: c })} />)}
        </div>
      </div>
      <Key tone="hot" size="lg" type="submit" disabled={!name.trim()}>Join the room</Key>
      {!user && <p className="field-hint">Joining needs no account. <Link to="/signin">Sign in</Link> first if you want tonight's scores saved to your profile.</p>}
    </form>
  );
}

/** The singer's microphone: live pitch to the stage, frames to the server when the song ends. */
function useSingerMic(view: RoomView | null, pid: string | null, serverNow: () => number, live: (t: number, m: number | null) => void, emit: (e: string, d?: unknown) => Promise<Reply>) {
  const mic = useRef<MicT | null>(null);
  const frames = useRef<Frame[]>([]);
  const [on, setOn] = useState(false);
  const [level, setLevel] = useState(0);
  const sentFor = useRef<string | null>(null);
  const c = view?.current;
  const singing = !!c && !!pid && c.singers.includes(pid);
  const entry = c?.entryId;

  useEffect(() => {
    frames.current = [];
  }, [entry]);
  useEffect(() => {
    if (!on || !mic.current || !singing || view?.phase !== 'playing' || !c) return;
    let n = 0;
    const m0 = mic.current;
    m0.start(() => positionAt(c.timeline, serverNow()), (t, m, l) => {
      if (t < 0 || !c.timeline.playing) return;
      frames.current.push([Math.round(t * 1000) / 1000, m]);
      setLevel(l);
      if (n++ % 2 === 0) live(t, m); // about 12 a second to the stage's pitch lane
    });
    return () => m0.stop();
  }, [on, singing, view?.phase, c?.timeline, serverNow, live]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (view?.phase === 'results' && singing && entry && sentFor.current !== entry && view.settings.scoring) {
      sentFor.current = entry;
      void emit('frames', { entryId: entry, frames: frames.current.slice(0, 19_000), calibrated: on });
    }
  }, [view?.phase, singing, entry, emit, on, view?.settings.scoring]);
  useEffect(() => {
    const m = mic;
    return () => m.current?.close();
  }, []);
  return { mic, on, setOn, level, singing };
}

function QueueTab({ view, pid, emit }: { view: RoomView; pid: string; emit: (e: string, d?: unknown) => Promise<Reply> }) {
  const host = view.hostPid === pid;
  const name = (p: string) => view.participants.find((x) => x.pid === p)?.name ?? 'Someone';
  const [err, setErr] = useState<string | null>(null);
  const act = async (ev: string, d: unknown) => {
    const r = await emit(ev, d);
    setErr(r.error ?? null);
  };
  if (!view.queue.length) return <p className="empty">The queue is empty. Add a song from the Add tab.</p>;
  // Side A is this round of the mixtape (one song each); Side B is everything after it.
  const rounds = view.queue.map((q, i) => roundOf(view.queue.map((x) => ({ ...x, songKey: x.song.key, at: 0 })), i));
  const firstB = rounds.findIndex((r) => r > 0);
  return (
    <>
      <Toast msg={err} tone="error" />
      <p className="side-label"><span className="side-mark">A</span> This round</p>
      <ul className="queue">
        <AnimatePresence initial={false}>
          {view.queue.map((q, i) => [i === firstB && <motion.li key="side-b" layout className="side-label"><span className="side-mark">B</span> Next round</motion.li>, (
            <motion.li key={q.id} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }} className="qitem">
              <i className="band" style={{ background: genreInk(q.song.genre) }} />
              <span className="qn">{i + 1}</span>
              <div className="qt">
                <b>{q.song.title}</b>
                <span>{q.singers.map(name).join(' & ')}{q.mode !== 'solo' ? ` · ${MODES[q.mode].name}` : ''}</span>
              </div>
              <span className="votes num" aria-label={`${q.votes.length} votes`}>{q.votes.length || ''}</span>
              <button className="icon-btn" aria-pressed={q.votes.includes(pid)} onClick={() => act('queueVote', { id: q.id })} aria-label={`Vote for ${q.song.title}`}><ThumbsUp size={16} /></button>
              {host && <button className="icon-btn" onClick={() => act('queueMove', { id: q.id, to: Math.max(0, i - 1) })} disabled={i === 0} aria-label="Move up"><ChevronUp size={16} /></button>}
              {host && <button className="icon-btn" onClick={() => act('queueMove', { id: q.id, to: i + 1 })} disabled={i === view.queue.length - 1} aria-label="Move down"><ChevronDown size={16} /></button>}
              {(host || q.addedBy === pid) && <button className="icon-btn" onClick={() => act('queueRemove', { id: q.id })} aria-label={`Remove ${q.song.title}`}><Trash2 size={16} /></button>}
            </motion.li>
          )])}
        </AnimatePresence>
      </ul>
      <p className="field-hint" style={{ marginTop: 10 }}>The queue rotates: one song per person per round. Votes lift a song within its round. Up to {view.settings.maxPerPerson} songs each.</p>
    </>
  );
}

function AddTab({ view, pid, emit, preset }: { view: RoomView; pid: string; emit: (e: string, d?: unknown) => Promise<Reply>; preset: string | null }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SongMeta[]>([]);
  const [song, setSong] = useState<SongMeta | null>(null);
  const [mode, setMode] = useState<ModeId>('solo');
  const [partner, setPartner] = useState('');
  const [msg, setMsg] = useState<{ t: string; tone: 'info' | 'error' } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [lyricsText, setLyricsText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const others = view.participants.filter((p) => p.pid !== pid && p.role !== 'stage');

  useEffect(() => {
    if (preset) api<{ song: SongMeta }>(`/songs/${encodeURIComponent(preset)}`).then((r) => setSong(r.song)).catch(() => {});
  }, [preset]);
  useEffect(() => {
    const t = setTimeout(() => {
      api<{ songs: SongMeta[] }>(`/songs/search?${new URLSearchParams({ q, playable: '1', limit: '20' })}`).then((r) => setResults(r.songs)).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const needsPartner = mode === 'duet' || mode === 'battle';
  const add = async (songKey: string, extra: object = {}) => {
    setBusy(true);
    const singers = needsPartner ? [pid, partner] : mode === 'team' && partner ? [pid, partner] : [pid];
    const r = await emit('queueAdd', { songKey, mode, singers, ...extra });
    setBusy(false);
    if (r.error) return setMsg({ t: r.error, tone: 'error' });
    setMsg({ t: mode === 'challenge' ? 'The dice picked your song. Check the queue.' : 'Queued.', tone: 'info' });
    setSong(null);
  };
  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/rooms/${view.code}/files`, { method: 'POST', headers: { 'content-type': file.type || 'audio/mpeg', 'x-room-token': roomToken(view.code, false) ?? '', 'x-file-name': encodeURIComponent(file.name), 'x-csrf-token': (await api<{ csrfToken: string }>('/csrf-token')).csrfToken }, body: file });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      await add(j.songKey, lyricsText ? { lyricsText } : {});
      setFile(null);
    } catch (e) {
      setMsg({ t: (e as Error).message, tone: 'error' });
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <p className="field-label" style={{ marginBottom: 8 }}>How do you want to sing it?</p>
        <div className="mode-pick" role="group" aria-label="Game mode">
          {(Object.keys(MODES) as ModeId[]).filter((m) => m !== 'roulette').map((m) => (
            <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}><b>{MODES[m].name}</b><span>{MODES[m].blurb}</span></button>
          ))}
        </div>
      </div>
      {(needsPartner || mode === 'team') && (
        <Field label={needsPartner ? 'Sing with' : 'Partner (optional)'}>
          <select value={partner} onChange={(e) => setPartner(e.target.value)}>
            <option value="">{needsPartner ? 'Pick someone…' : 'Just me'}</option>
            {others.map((p) => <option key={p.pid} value={p.pid}>{p.name}</option>)}
          </select>
        </Field>
      )}
      <Toast msg={msg?.t ?? null} tone={msg?.tone} />
      {mode === 'challenge' ? (
        <Key tone="hot" onClick={() => add('random')} disabled={busy} icon={<Shuffle size={16} />}>Roll a random song</Key>
      ) : song ? (
        <div className="now-card">
          <div className="now-head"><div className="t"><b>{mode === 'blind' ? 'Mystery tape' : song.title}</b><span>{song.artist}</span></div></div>
          <div className="host-deck">
            <Key tone="hot" onClick={() => add(song.key)} disabled={busy || (needsPartner && !partner)}>Add to queue</Key>
            <Key tone="ghost" onClick={() => setSong(null)}>Change song</Key>
          </div>
        </div>
      ) : (
        <>
          <label className="search-bar" style={{ padding: 6 }}>
            <span className="q"><Search size={18} aria-hidden /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a song to sing" aria-label="Find a song" /></span>
          </label>
          <ul className="shelf">
            {results.map((s) => (
              <li key={s.key}>
                <button className="spine" onClick={() => setSong(s)}>
                  <i className="spine-band" style={{ background: genreInk(s.genre) }} />
                  <b className="spine-title">{s.title}</b>
                  <span className="spine-artist">{s.artist}</span>
                  <span className="spine-meta"><SourceTag song={s} /></span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <details>
        <summary className="field-label" style={{ cursor: 'pointer' }}>Bring your own file</summary>
        <div className="form" style={{ marginTop: 12 }}>
          <p className="field-hint">Uploads to this room only, for the stage to play tonight. It is deleted when the room closes. Only use tracks you have the right to play.</p>
          <input type="file" accept="audio/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Audio file" />
          <input type="file" accept=".lrc,.txt,text/plain" onChange={async (e) => { const f = e.target.files?.[0]; setLyricsText(f ? await f.text() : null); }} aria-label="Lyrics file (LRC or UltraStar)" />
          <Key onClick={upload} disabled={!file || busy} icon={<Upload size={16} />}>Upload and queue</Key>
        </div>
      </details>
    </div>
  );
}

function PeopleTab({ view, pid, emit }: { view: RoomView; pid: string; emit: (e: string, d?: unknown) => Promise<Reply> }) {
  const host = view.hostPid === pid;
  const [err, setErr] = useState<string | null>(null);
  const act = async (d: object) => setErr((await emit('participant', d)).error ?? null);
  return (
    <>
      <Toast msg={err} tone="error" />
      <ul className="people">
        {view.participants.map((p) => (
          <li key={p.pid} className={p.connected ? '' : 'off'}>
            <Avatar a={p.avatar} size={34} />
            <div className="who">
              {p.name}{p.pid === pid ? ' (you)' : ''}
              <small>{p.role === 'host' ? 'Host' : p.role === 'stage' ? 'Stage screen' : p.username ? `@${p.username}` : 'Guest'}{p.team ? ` · Team ${p.team}` : ''}{p.connected ? '' : ' · away'}</small>
            </div>
            {host && p.role !== 'stage' && (
              <>
                <select value={p.team ?? ''} onChange={(e) => act({ pid: p.pid, action: 'team', team: e.target.value || null })} aria-label={`Team for ${p.name}`} style={{ height: 36 }}>
                  <option value="">No team</option><option value="A">Team A</option><option value="B">Team B</option>
                </select>
                {p.pid !== pid && <button className="icon-btn" onClick={() => act({ pid: p.pid, action: 'promote' })} aria-label={`Make ${p.name} host`} title="Make host"><Crown size={16} /></button>}
                {p.pid !== pid && <button className="icon-btn" onClick={() => confirm(`Remove ${p.name} from the room?`) && act({ pid: p.pid, action: 'kick' })} aria-label={`Remove ${p.name}`} title="Remove"><UserX size={16} /></button>}
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function BoardTab({ view }: { view: RoomView }) {
  const teams = view.teams.A || view.teams.B;
  return (
    <>
      {teams > 0 && <div className="teams" style={{ marginBottom: 14 }}><div><span>Team A</span><b>{view.teams.A}</b></div><div><span>Team B</span><b>{view.teams.B}</b></div></div>}
      {view.board.length ? (
        <ol className="board">{view.board.map((b) => <li key={b.pid}><Avatar a={b.avatar} size={28} /><span>{b.name}</span><small>{b.count} {b.count === 1 ? 'song' : 'songs'}</small><b>{b.best}</b></li>)}</ol>
      ) : <p className="empty">No scores yet tonight.</p>}
    </>
  );
}

function SettingsTab({ view, emit }: { view: RoomView; emit: (e: string, d?: unknown) => Promise<Reply> }) {
  const s = view.settings;
  const set = (p: object) => void emit('settings', p);
  return (
    <div className="form" style={{ maxWidth: 'none' }}>
      <label className="check"><input type="checkbox" checked={s.scoring} onChange={(e) => set({ scoring: e.target.checked })} /> Scoring on</label>
      <label className="check"><input type="checkbox" checked={s.guestsCanQueue} onChange={(e) => set({ guestsCanQueue: e.target.checked })} /> Guests can add songs</label>
      <label className="check"><input type="checkbox" checked={s.autoAdvance} onChange={(e) => set({ autoAdvance: e.target.checked })} /> Start the next song automatically after results</label>
      <label className="check"><input type="checkbox" checked={s.stageLyricsWithVideo} onChange={(e) => set({ stageLyricsWithVideo: e.target.checked })} /> Show Croon's lyrics beside karaoke videos on the stage</label>
      <label className="range-row"><span>Songs each</span><input type="range" min={1} max={10} value={s.maxPerPerson} onChange={(e) => set({ maxPerPerson: Number(e.target.value) })} /><b className="num">{s.maxPerPerson}</b></label>
      <label className="range-row"><span>Skip needs</span><input type="range" min={0.3} max={1} step={0.05} value={s.skipRatio} onChange={(e) => set({ skipRatio: Number(e.target.value) })} /><b className="num">{Math.round(s.skipRatio * 100)}%</b></label>
    </div>
  );
}

export default function Room() {
  const { code: raw = '' } = useParams();
  const code = raw.toUpperCase();
  const [sp] = useSearchParams();
  const [me, setMe] = useState<{ name: string; avatar: AvatarT } | null>(null);
  const { view, pid, error, status, emit, live, serverNow } = useRoom(code, me);
  const [tab, setTab] = useState<'queue' | 'add' | 'people' | 'board' | 'settings'>(sp.get('add') ? 'add' : 'queue');
  const [prefs, setPrefs] = usePrefs<LyricPrefs>('croon:phone-lyrics', DEFAULT_PREFS);
  const [calib, setCalib] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [toast, setToast] = useState<{ t: string; tone: 'info' | 'error' } | null>(null);
  const [showLyricOpts, setShowLyricOpts] = useState(false);
  const singer = useSingerMic(view, pid, serverNow, live, emit);

  useEffect(() => void rememberRoom(code), [code]);
  const c = view?.current ?? null;
  const lyr = useSongLyrics(c?.song ?? null, c?.lyricsText ?? null);
  const tr = useTranslation(c?.song ?? null, lyr.lyrics, prefs.translation && canTranslate(c?.song ?? null, lyr.lyrics));
  const lyrics = useMemo(() => {
    if (!tr.lyrics || !c) return null;
    const l = MODES[c.mode].parts ? withParts(tr.lyrics) : tr.lyrics;
    return mapLyrics(l, c.lyricAnchors);
  }, [tr.lyrics, c?.lyricAnchors, c?.mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const getPos = useGetter(() => (c ? positionAt(c.timeline, serverNow()) : 0));
  const [pos, setPos] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPos(getPos()), 500);
    return () => clearInterval(t);
  }, [getPos]);
  const doEmit = useCallback(async (ev: string, d?: unknown) => {
    const r = await emit(ev, d);
    if (r.error) setToast({ t: r.error, tone: 'error' });
    return r;
  }, [emit]);

  if (!me) return <JoinGate code={code} onJoin={setMe} />;
  if (status === 'kicked') return <div className="join-gate"><h1>You were removed</h1><p className="empty">The host removed you from room {code}.</p><Link to="/" className="key key-md"><span>Back to the lounge</span></Link></div>;
  if (status === 'closed') return <div className="join-gate"><h1>The room has closed</h1><p className="empty">Thanks for singing.</p><Link to="/rooms" className="key key-md"><span>Start or join another</span></Link></div>;
  if (error && !view) return <div className="join-gate"><Toast msg={error} tone="error" /><Link to="/rooms" className="key key-md"><span>Back to rooms</span></Link></div>;
  if (!view || !pid) return <Loading label="Joining the room" />;

  const host = view.hostPid === pid;
  const stageOn = view.participants.some((p) => p.role === 'stage' && p.connected);
  const iPlayAudio = host && !stageOn;
  const singers = c ? (c.singers.map((s) => view.participants.find((p) => p.pid === s)).filter(Boolean) as Participant[]) : [];
  const myPart = c && MODES[c.mode].parts ? c.singers.indexOf(pid) + 1 || undefined : undefined;
  const joinUrl = `${location.origin}/r/${code}`;
  const share = async () => {
    if (navigator.share) await navigator.share({ title: `Join ${view.name} on Croon`, url: joinUrl }).catch(() => {});
    else {
      await navigator.clipboard.writeText(joinUrl);
      setToast({ t: 'Invite link copied.', tone: 'info' });
    }
  };

  return (
    <div className="room">
      <div className="room-bar">
        <span className={`status-dot${status === 'live' ? '' : ' off'}`} aria-label={status === 'live' ? 'Connected' : 'Reconnecting'} />
        <span className="room-code">{code}</span>
        <span className="room-name">{view.name}</span>
        <span className="fill" style={{ flex: 1 }} />
        <button className="icon-btn" onClick={share} aria-label="Share invite link"><Share2 size={18} /></button>
        <button className="icon-btn" onClick={() => setShowQr((v) => !v)} aria-pressed={showQr} aria-label="Show join QR code"><QrCode size={18} /></button>
        <Link to={`/stage/${code}`} className="icon-btn" aria-label="Open the stage screen" title="Open on the TV"><Tv size={18} /></Link>
      </div>
      {status !== 'live' && <p className="toast">Reconnecting… you keep your place in the queue.</p>}
      <Toast msg={toast?.t ?? null} tone={toast?.tone} />
      {showQr && <div style={{ background: 'var(--card)', padding: 16, borderRadius: 12, alignSelf: 'center', lineHeight: 0 }}><QRCodeSVG value={joinUrl} size={200} bgColor="#f2e8dc" fgColor="#1c1716" /></div>}
      {host && !stageOn && view.phase === 'lobby' && <p className="notice"><b>No stage screen yet.</b> Open <Link to={`/stage/${code}`}>/stage/{code}</Link> on the TV or a laptop. Until then this device plays the music.</p>}

      <section className="now-card" aria-label="Now playing">
        {!c && (
          <div className="results-card">
            <p className="headline">{view.queue.length ? 'Ready when the host is' : 'Queue a song to get going'}</p>
            {host && <Key tone="hot" size="lg" onClick={() => doEmit('control', { action: 'start' })} disabled={!view.queue.length} icon={<Play size={18} />}>Start the first song</Key>}
            {host && <Key onClick={() => doEmit('roulette')} icon={<Dices size={16} />}>Party roulette</Key>}
          </div>
        )}
        {c && (
          <>
            <div className="now-head">
              <div className="t"><b>{c.song.title}</b><span>{c.song.artist}</span></div>
              <div className="right"><SourceTag song={c.song} /></div>
            </div>
            {singer.singing && view.phase !== 'results' && (
              <div className="you-sing">
                <Mic size={16} aria-hidden /> You're on{myPart ? `: your lines are ${myPart === 1 ? 'teal' : 'red'}` : ''}
                <span style={{ flex: 1 }} />
                {view.settings.scoring && c.song.scoring !== 'none' && (
                  <Key size="sm" tone="card" onClick={() => (singer.on ? (singer.setOn(false), singer.mic.current?.close()) : setCalib(true))} icon={singer.on ? <Mic size={14} /> : <MicOff size={14} />}>{singer.on ? 'Scoring' : 'Score me'}</Key>
                )}
              </div>
            )}
            {!singer.singing && singers.length > 0 && view.phase !== 'announce' && (
              <div className="singing-now">{singers.map((p) => <Avatar key={p.pid} a={p.avatar} size={24} />)} <b>{singers.map((p) => p.name).join(' & ')}</b> {view.phase === 'results' ? 'just sang' : 'on the mic'}</div>
            )}
            {calib && <div style={{ padding: 12 }}><Calibrate onClose={() => setCalib(false)} onReady={(m) => { singer.mic.current = m; singer.setOn(true); setCalib(false); }} /></div>}
            {singer.on && singer.singing && view.phase === 'playing' && <div className="mic-meter"><Mic size={14} aria-hidden /><div className="meter"><i style={{ width: `${Math.min(100, singer.level * 600)}%` }} /></div></div>}
            {iPlayAudio && <RoomAudio view={view} serverNow={serverNow} emit={emit} stage={false} />}
            {view.phase === 'announce' && <Spotlight singers={singers} song={c.song} mode={c.mode} />}
            {view.phase === 'playing' && (lyrics ? (
              <Lyrics lyrics={lyrics} pos={getPos} prefs={prefs} variant="phone" parts={!!MODES[c.mode].parts} myPart={myPart} onPickLine={host && c.song.sources[0]?.kind !== 'house' && lyr.lyrics ? (i) => void doEmit('lyricAnchors', { anchors: addAnchor(c.lyricAnchors, lyr.lyrics!.lines[i].t, getPos()) }) : undefined} />
            ) : <p className="empty" style={{ padding: 16 }}>{lyr.status === 'loading' ? 'Fetching lyrics…' : 'No synced lyrics for this song; follow the words on the stage screen.'}</p>)}
            {view.phase === 'playing' && <div style={{ padding: '0 16px 14px' }}><TapeScrub pos={pos} total={c.song.duration} onSeek={host ? (s) => void doEmit('control', { action: 'seek', pos: s }) : undefined} /></div>}
            {view.phase === 'results' && (
              <div className="results-card">
                {c.result ? <p className="headline">{c.result.headline}</p> : <Loading label="Counting the score" />}
                {c.scores[pid] && <ScoreReveal score={c.scores[pid]} compact />}
                {!c.scores[pid] && Object.entries(c.scores).map(([p, s]) => <p key={p} className="empty">{view.participants.find((x) => x.pid === p)?.name}: <b className="num">{s.total}</b></p>)}
              </div>
            )}
            {view.phase === 'playing' && !singer.singing && (
              <div className="host-deck">
                <Key size="sm" onClick={() => doEmit('cheer')} icon={<Heart size={14} />}>Cheer{c.cheers ? ` · ${c.cheers}` : ''}</Key>
                <Key size="sm" tone="ghost" onClick={() => doEmit('skipVote')} down={c.skipVotes.includes(pid)} disabled={c.skipVotes.includes(pid)}>Vote to skip · {c.skipVotes.length}</Key>
                <button className="icon-btn" onClick={() => setShowLyricOpts((v) => !v)} aria-pressed={showLyricOpts} aria-label="Lyric display options" style={{ marginLeft: 'auto' }}><Type size={16} /></button>
              </div>
            )}
            {showLyricOpts && <div className="panel" style={{ margin: 12 }}><LyricSettings prefs={prefs} set={setPrefs} hasRoman={!!lyrics?.lines.some((l) => l.words.some((w) => w.roman))} hasTranslation={canTranslate(c?.song ?? null, lyr.lyrics)} wordTimed={!!lyrics?.wordTimed} note={tr.note} /></div>}
          </>
        )}
        {host && c && (
          <div className="host-deck" aria-label="Host controls">
            {view.phase === 'playing' && (
              <>
                <button className="icon-btn" onClick={() => doEmit('control', { action: 'seek', pos: Math.max(0, pos - 10) })} aria-label="Back 10 seconds"><Rewind size={16} /></button>
                {c.timeline.playing ? <Key size="sm" onClick={() => doEmit('control', { action: 'pause' })} icon={<Pause size={14} />}>Pause</Key> : <Key size="sm" tone="hot" onClick={() => doEmit('control', { action: 'play' })} icon={<Play size={14} />}>Play</Key>}
                <button className="icon-btn" onClick={() => doEmit('control', { action: 'seek', pos: pos + 10 })} aria-label="Forward 10 seconds"><FastForward size={16} /></button>
                <Key size="sm" onClick={() => doEmit('control', { action: 'skip' })} icon={<SkipForward size={14} />}>Skip</Key>
              </>
            )}
            {view.phase === 'results' && <Key size="sm" tone="hot" onClick={() => doEmit('control', { action: 'next' })} disabled={!view.queue.length} icon={<SkipForward size={14} />}>Next song</Key>}
            <Key size="sm" tone="ghost" onClick={() => doEmit('control', { action: 'end' })} icon={<Square size={14} />}>End song</Key>
            {view.phase === 'playing' && lyrics && !c.song.key.startsWith('hb:') && (
              <span className="offset">
                Lyrics
                <Key size="sm" onClick={() => doEmit('lyricAnchors', { anchors: nudgeAnchors(c.lyricAnchors, -0.25) })} aria-label="Lyrics earlier">−0.25s</Key>
                <span className="num">{c.lyricAnchors.length ? `${c.lyricAnchors.length} sync pts` : 'As timed'}</span>
                <Key size="sm" onClick={() => doEmit('lyricAnchors', { anchors: nudgeAnchors(c.lyricAnchors, 0.25) })} aria-label="Lyrics later">+0.25s</Key>
                <Key size="sm" onClick={() => lyr.lyrics?.lines[0] && doEmit('lyricAnchors', { anchors: addAnchor(c.lyricAnchors, lyr.lyrics.lines[0].t, getPos()) })}>First line now</Key>
              </span>
            )}
          </div>
        )}
      </section>

      <div className="tabs" role="tablist">
        {(['queue', 'add', 'people', 'board', ...(host ? ['settings'] : [])] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t as typeof tab)}>{t === 'queue' ? `Queue${view.queue.length ? ` ${view.queue.length}` : ''}` : t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'queue' && <QueueTab view={view} pid={pid} emit={emit} />}
        {tab === 'add' && <AddTab view={view} pid={pid} emit={emit} preset={sp.get('add')} />}
        {tab === 'people' && <PeopleTab view={view} pid={pid} emit={emit} />}
        {tab === 'board' && <BoardTab view={view} />}
        {tab === 'settings' && host && <SettingsTab view={view} emit={emit} />}
      </div>
    </div>
  );
}
