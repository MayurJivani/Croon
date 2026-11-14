// The lounge door: a cassette that actually plays (the house band, no account needed), the room
// code slot that actually joins, and the shelf of what is playable tonight.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Play, Pause, Users, Mic } from 'lucide-react';
import { mapLyrics } from '../../../../packages/core/src/lyrics.ts';
import type { SongMeta } from '../../../../packages/core/src/protocol.ts';
import { Lyrics } from '../components/Lyrics.tsx';
import { Key, Reel, Shelf, genreInk, langName, Toast } from '../components/ui.tsx';
import { DEFAULT_PREFS, useSongLyrics } from '../lib/lyrics.ts';
import { useEngine } from '../lib/playback.ts';
import { api } from '../lib/api.ts';
import { saveHostToken } from '../lib/room.ts';
import { useSession } from '../lib/session.tsx';

// Talk to me in French, Run it's the Kid (karaoke video).
const PREVIEW = 'dz:3813565582';
type Home = {
  trending: SongMeta[]; popular: SongMeta[]; recentlyAdded: SongMeta[]; recommended: SongMeta[]; recentlyPlayed: SongMeta[];
  crates: { id: string; name: string; blurb: string; total: number; playable: number; songs: SongMeta[] }[];
  weekly: { song: SongMeta | null; ends: string; rows: { username: string; display_name: string; total: number }[] };
};
type Facets = { genres: { name: string; total: number; playable: number }[]; languages: { code: string; name: string; total: number; playable: number }[] };

function HeroTape() {
  const [song, setSong] = useState<SongMeta | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    api<{ song: SongMeta }>(`/songs/${encodeURIComponent(PREVIEW)}`).then((r) => setSong(r.song)).catch((e) => setErr(e.message));
  }, []);
  const { engine, duration, error } = useEngine(song, { videoEl, enabled: !!song });
  const src = song?.sources[0];
  const lyr = useSongLyrics(song);
  const lyrics = useMemo(() => (lyr.lyrics ? mapLyrics(lyr.lyrics, src?.kind === 'youtube' ? src.lyricAnchors ?? [] : []) : null), [lyr.lyrics, src]);
  const engineRef = useRef(engine);
  engineRef.current = engine;

  useEffect(() => {
    if (!engine) return;
    engine.onEnded = () => {
      setPlaying(false);
      setPos(0);
    };
    engine.onPlayingChange = setPlaying;
  }, [engine]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setPos(engineRef.current?.position() ?? 0), 250);
    return () => clearInterval(t);
  }, [playing]);

  const toggle = () => {
    if (!engine) return;
    if (playing) {
      engine.pause();
      setPlaying(false);
    } else {
      engine.play(pos >= duration - 1 ? 0 : pos);
      setPlaying(true);
    }
  };
  const getPos = useMemo(() => () => engineRef.current?.position() ?? 0, []);
  const join = async (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(c)) return setErr('Room codes are four letters.');
    try {
      await api(`/rooms/${c}`);
      nav(`/r/${c}`);
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  const counter = String(Math.floor(pos)).padStart(3, '0').slice(-3);

  return (
    <div className="tape">
      <span className="screw" style={{ left: 20, top: 20 }} /><span className="screw" style={{ right: 20, top: 20 }} />
      <span className="screw" style={{ left: 20, bottom: 20 }} /><span className="screw" style={{ right: 20, bottom: 20 }} />
      <div className="label">
        <div className="bands" aria-hidden><span /><span /><span /></div>
        <div className="label-head">
          <span className="side" aria-hidden>A</span>
          <div className="label-title">
            {song ? `${song.title} · ${song.artist}` : 'Loading the tape…'}
            {src?.kind === 'youtube' && <small>Karaoke video · {src.channel.trim()} · full song, {Math.floor(duration / 60)}:{String(Math.round(duration % 60)).padStart(2, '0')}</small>}
          </div>
        </div>
        <div className="label-lyric">
          {lyrics && <Lyrics lyrics={lyrics} pos={getPos} prefs={{ ...DEFAULT_PREFS, style: 'classic', roman: false }} variant="phone" />}
        </div>
        <div className="window">
          <Reel spinning={playing} />
          <div className="video-wrap" ref={setVideoEl} aria-hidden />
          <Reel spinning={playing} />
        </div>
      </div>
      <div className="deck">
        <form className="joinslot" onSubmit={join}>
          <label className="slot">
            <em>ROOM</em>
            <input value={code} onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)); setErr(null); }} placeholder="K___" aria-label="Room code" autoCapitalize="characters" autoComplete="off" inputMode="text" />
          </label>
          <Key type="submit">Join</Key>
        </form>
        <div className="counter num" aria-label={`Tape counter ${counter}`}>{counter.split('').map((d, i) => (
          // shortcut: 9 to 0 rolls back up the drum instead of on past it; add a wrap digit if it bothers.
          <b key={i}><span aria-hidden style={{ transform: `translateY(${-Number(d) * 10}%)` }}>{[...'0123456789'].map((n) => <i key={n}>{n}</i>)}</span></b>
        ))}</div>
        <Key onClick={toggle} disabled={!engine} down={playing} icon={playing ? <Pause size={18} /> : <Play size={18} />} aria-label={playing ? 'Pause the preview' : 'Play the preview'}>{playing ? 'Pause' : 'Play'}</Key>
      </div>
      <Toast msg={error ?? err} tone="error" />
    </div>
  );
}

/** On phones the J-card leads, so the room-code slot rides on it rather than below the fold. */
function PhoneJoin() {
  const [code, setCode] = useState('');
  const nav = useNavigate();
  return (
    <form className="jcard-join" onSubmit={(e) => { e.preventDefault(); if (/^[A-Z]{4}$/.test(code)) nav(`/r/${code}`); }}>
      <label className="slot">
        <em>ROOM</em>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))} placeholder="K___" aria-label="Room code" autoCapitalize="characters" autoComplete="off" />
      </label>
      <Key type="submit" disabled={code.length !== 4}>Join</Key>
    </form>
  );
}

export default function Landing() {
  const [home, setHome] = useState<Home | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { user } = useSession();
  const nav = useNavigate();
  useEffect(() => {
    api<Home>('/songs/home').then(setHome).catch((e) => setErr(e.message));
    api<Facets>('/songs/facets').then(setFacets).catch(() => {});
  }, [user?.id]);

  const startRoom = async () => {
    try {
      const r = await api<{ code: string; hostToken: string }>('/rooms', { method: 'POST', body: { name: user ? `${user.displayName}'s room` : 'Karaoke night' } });
      saveHostToken(r.code, r.hostToken);
      nav(`/r/${r.code}`);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <>
      <section className="hero">
        <HeroTape />
        <motion.div className="jcard" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
          <h1>SING{' '}<span>IT LOUD</span></h1>
          <p>Full songs, never fake instrumentals. Put the room on the TV and everyone joins from their phone.</p>
          <PhoneJoin />
          <div className="row">
            <Key tone="hot" size="lg" onClick={startRoom} icon={<Users size={18} />}>Start a room</Key>
            <Link to="/library" className="key key-ghost key-lg"><Mic size={18} aria-hidden /><span>Sing solo</span></Link>
          </div>
          <div className="bands" aria-hidden><span /><span /><span /></div>
        </motion.div>
      </section>
      <Toast msg={err} tone="error" />

      <section className="section">
        <div className="section-head">
          <h2>On the shelf tonight</h2>
          <Link to="/library">Whole library</Link>
        </div>
        {home ? <Shelf songs={home.trending.slice(0, 8)} /> : <p className="empty">Loading the shelf…</p>}
      </section>

      {home && home.recentlyPlayed.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>You sang these</h2></div>
          <Shelf songs={home.recentlyPlayed.slice(0, 6)} />
        </section>
      )}

      {facets && (
        <section className="section">
          <div className="section-head"><h2>Dig by genre</h2></div>
          <div className="genre-strip">
            {facets.genres.filter((g) => g.playable > 0).map((g) => (
              <Link key={g.name} className="genre-chip" to={`/library?genre=${encodeURIComponent(g.name)}&playable=1`}>
                <i style={{ background: genreInk(g.name) }} />{g.name} <small>{g.playable}</small>
              </Link>
            ))}
          </div>
          <div className="section-head" style={{ marginTop: 28 }}><h3>Or by language</h3></div>
          <div className="genre-strip">
            {facets.languages.filter((l) => l.playable > 0).map((l) => (
              <Link key={l.code} className="genre-chip" to={`/library?language=${l.code}&playable=1`}>
                <i style={{ background: 'var(--teal)' }} />{langName(l.code)} <small>{l.playable}</small>
              </Link>
            ))}
          </div>
        </section>
      )}

      {home && (
        <section className="section">
          <div className="section-head"><h2>Crates</h2></div>
          <div className="crates">
            {home.crates.map((c) => (
              <Link key={c.id} to={`/library?crate=${c.id}`} className="crate">
                <h3>{c.name}</h3>
                <p>{c.blurb}</p>
                <div className="crate-tapes" aria-hidden>{c.songs.slice(0, 4).map((s) => <span key={s.key} style={{ borderLeftColor: genreInk(s.genre) }}>{s.title}</span>)}</div>
                <small>{c.playable} ready to sing · {c.total} in the crate</small>
              </Link>
            ))}
          </div>
        </section>
      )}

      {home?.weekly.song && (
        <section className="section">
          <div className="section-head">
            <h2>This week's challenge</h2>
            <Link to="/leaderboards">Standings</Link>
          </div>
          <Shelf songs={[home.weekly.song]} link={(s) => `/sing/${s.key}?challenge=1`} />
          <p className="empty">{home.weekly.rows.length ? `${home.weekly.rows[0].display_name} leads with ${home.weekly.rows[0].total}.` : 'Nobody has a score yet. Be first.'} Closes {new Date(home.weekly.ends).toLocaleDateString(undefined, { weekday: 'long' })}.</p>
        </section>
      )}

      <section className="section">
        <div className="section-head"><h2>A party in three moves</h2></div>
        <div className="howto">
          <div><b>Open a room on the TV</b><p>Start a room, then open the stage screen on the television or projector. It shows a QR code.</p></div>
          <div><b>Phones scan and join</b><p>No app, no account. Pick a name and a badge, queue songs, vote, and cheer.</p></div>
          <div><b>Sing, get scored, pass the mic</b><p>Your phone listens and scores your pitch and timing. The queue rotates so everybody gets a turn.</p></div>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>Honest about the audio</h2></div>
        <div className="honest">
          <div><b>House band</b><p>Public-domain songs played live in your browser from written-out notes. Exact word timing and true pitch scoring.</p></div>
          <div><b>Karaoke videos</b><p>Full karaoke and instrumental versions from YouTube channels, through YouTube's own player. Each says which channel it came from.</p></div>
          <div><b>Your own files</b><p>Bring an audio file and an LRC or UltraStar lyrics file. It stays on your device, or in your room for the night.</p></div>
        </div>
      </section>
    </>
  );
}
