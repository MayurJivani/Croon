// The solo player: one singer, the full transport, every lyric option, optional scoring.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Play, Pause, SkipBack, SkipForward, Maximize, Minimize, Volume2, Mic, MicOff, RotateCcw, Rewind, FastForward, X } from 'lucide-react';
import type { SongMeta } from '../../../../packages/core/src/protocol.ts';
import { shiftLyrics, targets, lineAt } from '../../../../packages/core/src/lyrics.ts';
import { scoreFull, scoreLite, type Frame, type Score } from '../../../../packages/core/src/scoring.ts';
import { useEngine, useMediaSession, useGetter } from '../lib/playback.ts';
import { useSongLyrics, usePrefs, DEFAULT_PREFS, useTranslation, canTranslate, type LyricPrefs } from '../lib/lyrics.ts';
import { HouseEngine } from '../audio/engines.ts';
import type { Mic as MicT } from '../audio/mic.ts';
import { Lyrics } from '../components/Lyrics.tsx';
import { LyricSettings } from '../components/LyricSettings.tsx';
import { PitchLane, type Trail } from '../components/PitchLane.tsx';
import { Visualizer } from '../components/Visualizer.tsx';
import { Calibrate } from '../components/Calibrate.tsx';
import { ScoreReveal } from '../components/ScoreReveal.tsx';
import { Key, Loading, Toast, Reel, SourceTag, Field } from '../components/ui.tsx';
import { TapeScrub } from '../components/TapeScrub.tsx';
import { api } from '../lib/api.ts';
import { useSession } from '../lib/session.tsx';

type Bg = 'artwork' | 'reels' | 'spectrum' | 'wave' | 'plain';
const UPNEXT = 'croon:upnext';
type Up = { key: string; title: string };
const readUpNext = (): Up[] => {
  try {
    return (JSON.parse(localStorage.getItem(UPNEXT) ?? '[]') as Up[]).filter((x) => x && typeof x.key === 'string');
  } catch {
    return [];
  }
};
const writeUpNext = (l: Up[]) => {
  try {
    localStorage.setItem(UPNEXT, JSON.stringify(l));
  } catch {
    /* private mode: the list lives for this page only */
  }
};
export const queueSolo = (key: string, title: string) => writeUpNext([...readUpNext().filter((k) => k.key !== key), { key, title }].slice(-30));

/** Bring your own: an audio file plus LRC/UltraStar, or synced lyrics looked up on LRCLIB. */
function FilePicker({ onReady }: { onReady(song: SongMeta, url: string, lyrics: string | null): void }) {
  const [audio, setAudio] = useState<File | null>(null);
  const [lyr, setLyr] = useState<string | null>(null);
  const [artist, setArtist] = useState('');
  const [title, setTitle] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const lookup = async () => {
    try {
      const r = await api<{ lrc: string; title: string; artist: string }>(`/songs/lookup/lyrics?${new URLSearchParams({ artist, title })}`);
      setLyr(r.lrc);
      setMsg(`Found synced lyrics for ${r.title} by ${r.artist} on LRCLIB.`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const go = () => {
    if (!audio) return;
    const url = URL.createObjectURL(audio);
    const name = title || audio.name.replace(/\.[a-z0-9]+$/i, '');
    onReady({ key: 'file:local', title: name, artist: artist || 'Your file', genre: 'Your files', language: 'other', duration: 0, sources: [{ kind: 'file', fileId: 'local', name: audio.name }], lyrics: lyr ? 'line' : 'none', scoring: lyr ? (/^#BPM:/im.test(lyr) ? 'full' : 'lite') : 'none' }, url, lyr);
  };
  return (
    <div className="form-card form" style={{ maxWidth: 560 }}>
      <h2>Sing your own file</h2>
      <p className="field-hint">Your file stays on this device. Croon plays it here and never uploads it.</p>
      <Field label="Audio file" hint="An instrumental or karaoke track you have the right to use: MP3, M4A, OGG, WAV or FLAC.">
        <input type="file" accept="audio/*" onChange={(e) => setAudio(e.target.files?.[0] ?? null)} />
      </Field>
      <Field label="Lyrics file (optional)" hint="LRC for line or word timing, UltraStar .txt for pitch scoring too.">
        <input type="file" accept=".lrc,.txt,text/plain" onChange={async (e) => { const f = e.target.files?.[0]; setLyr(f ? await f.text() : null); }} />
      </Field>
      <div className="row">
        <input type="text" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist" aria-label="Artist" style={{ flex: 1 }} />
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title" style={{ flex: 1 }} />
        <Key type="button" size="sm" onClick={lookup} disabled={!artist || !title}>Find lyrics on LRCLIB</Key>
      </div>
      <Toast msg={msg} />
      <Key tone="hot" disabled={!audio} onClick={go}>Load and sing</Key>
    </div>
  );
}

export default function Sing() {
  const { key = '' } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { user } = useSession();
  const mode = sp.get('blind') ? 'blind' : sp.get('challenge') ? 'challenge' : 'solo';
  const [song, setSong] = useState<SongMeta | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [inline, setInline] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [prefs, setPrefs] = usePrefs<LyricPrefs>('croon:lyric-prefs', DEFAULT_PREFS);
  const [ui, setUi] = usePrefs('croon:player', { bg: 'artwork' as Bg, volume: 0.9, guide: true });
  const [offset, setOffset] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [full, setFull] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [calib, setCalib] = useState(false);
  const [result, setResult] = useState<{ score: Score; best: number | null; isBest: boolean; saved: boolean } | null>(null);
  const [upNext, setUpNext] = useState<Up[]>(readUpNext);
  const posRef = useRef(0);
  const playingRef = useRef(false);
  const mic = useRef<MicT | null>(null);
  const frames = useRef<Frame[]>([]);
  const trail = useRef<Trail[]>([[]]);
  const [level, setLevel] = useState(0);

  useEffect(() => {
    setResult(null);
    setPos(0);
    posRef.current = 0;
    playingRef.current = false;
    setPlaying(false);
    if (key === 'file') return setSong(null);
    api<{ song: SongMeta }>(`/songs/${encodeURIComponent(key)}`).then((r) => setSong(r.song)).catch((e) => setErr(e.message));
  }, [key]);

  const lyr = useSongLyrics(song, inline);
  const { engine, duration, error } = useEngine(song, { videoEl, fileUrl, enabled: !!song });
  const tr = useTranslation(song, lyr.lyrics, prefs.translation && canTranslate(song, lyr.lyrics));
  const lyrics = useMemo(() => (tr.lyrics ? shiftLyrics(tr.lyrics, offset) : null), [tr.lyrics, offset]);
  const ts = useMemo(() => (lyrics?.pitched ? targets(lyrics) : []), [lyrics]);
  const getPos = useGetter(() => (playingRef.current && engine ? engine.position() : posRef.current));
  const total = duration || song?.duration || 0;
  const hidden = mode === 'blind' && !result;

  useEffect(() => engine?.setVolume(ui.volume), [engine, ui.volume]);
  useEffect(() => {
    if (engine instanceof HouseEngine) engine.setGuide(ui.guide);
  }, [engine, ui.guide]);
  useEffect(() => {
    const t = setInterval(() => {
      if (engine && playingRef.current) {
        posRef.current = engine.position();
        setPos(posRef.current);
      }
    }, 200);
    return () => clearInterval(t);
  }, [engine]);

  const finish = useCallback(async () => {
    setPlaying(false);
    playingRef.current = false;
    mic.current?.stop();
    if (!scoring || !song || !lyr.lyrics) return;
    const fr = frames.current;
    if (!fr.some((f) => f[1] !== null)) return setResult({ score: { kind: 'lite', total: 0, pitch: null, timing: 0, stability: 0, completion: 0, consistency: 0, offsetMs: 0, grade: 'D' }, best: null, isBest: false, saved: false });
    if (song.key.startsWith('hb:') || song.key.startsWith('dz:')) {
      try {
        const r = await api<{ score: Score; personalBest: number | null; isBest: boolean; saved: boolean }>('/performances', { method: 'POST', body: { songKey: song.key, mode, frames: fr, lyricOffset: offset } });
        setResult({ score: r.score, best: r.personalBest, isBest: r.isBest, saved: r.saved });
      } catch (e) {
        setErr((e as Error).message);
      }
    } else {
      // A guest's own file is scored here and not saved: there is no catalogue song to rank it against.
      const shifted = fr.map(([t, m]) => [t - offset, m] as Frame);
      const tt = targets(lyr.lyrics);
      setResult({ score: lyr.lyrics.pitched && tt.length ? scoreFull(shifted, tt) : scoreLite(shifted, lyr.lyrics.lines), best: null, isBest: false, saved: false });
    }
  }, [scoring, song, lyr.lyrics, mode, offset]);

  useEffect(() => {
    if (!engine) return;
    engine.onEnded = () => void finish();
    // The video can be paused from YouTube's own player; the transport follows the truth.
    engine.onPlayingChange = (p) => {
      playingRef.current = p;
      setPlaying(p);
      if (!p) {
        posRef.current = engine.position();
        mic.current?.stop();
      }
    };
  }, [engine, finish]);
  const savedOffset = song?.sources[0]?.kind === 'youtube' ? song.sources[0].lyricOffset ?? 0 : 0;
  useEffect(() => setOffset(savedOffset), [song?.key, savedOffset]);
  const pickLine = (i: number) => {
    const line = lyr.lyrics?.lines[i];
    if (line) setOffset(Math.round((getPos() - line.t) * 100) / 100);
  };
  const saveTiming = async () => {
    const src = song?.sources[0];
    if (!song || src?.kind !== 'youtube') return;
    try {
      const r = await api<{ song: SongMeta }>(`/songs/${encodeURIComponent(song.key)}/sync`, { method: 'POST', body: { videoId: src.videoId, offset } });
      setSong(r.song);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const play = () => {
    if (!engine) return;
    const from = pos >= total - 0.5 ? 0 : pos;
    if (from < 1) {
      frames.current = [];
      trail.current = [[]];
      setResult(null);
    }
    engine.play(from);
    playingRef.current = true;
    setPlaying(true);
    if (scoring && mic.current) {
      mic.current.start(() => engine.position(), (t, m, l) => {
        frames.current.push([Math.round(t * 1000) / 1000, m]);
        trail.current[0].push({ t, m });
        if (trail.current[0].length > 600) trail.current[0].splice(0, 200);
        setLevel(l);
      });
    }
  };
  const pause = () => {
    posRef.current = engine?.position() ?? posRef.current;
    engine?.pause();
    mic.current?.stop();
    playingRef.current = false;
    setPlaying(false);
  };
  const seek = (s: number) => {
    const t = Math.max(0, Math.min(total - 0.2, s));
    posRef.current = t;
    setPos(t);
    if (playingRef.current) engine?.play(t);
  };
  const restart = () => {
    frames.current = [];
    trail.current = [[]];
    setResult(null);
    seek(0);
  };
  const next = upNext.find((k) => k.key !== key);
  const goNext = () => {
    if (!next) return;
    const rest = upNext.filter((k) => k.key !== key && k.key !== next.key);
    writeUpNext(rest);
    setUpNext(rest);
    nav(`/sing/${encodeURIComponent(next.key)}`);
  };
  const prev = () => {
    // Previous: back to the start of the current line, or of the song from the first line.
    const i = lyrics ? lineAt(lyrics, pos - 1.2) : -1;
    seek(i > 0 && lyrics ? lyrics.lines[i].t - 0.5 : 0);
  };
  const toggleFull = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await stageRef.current?.requestFullscreen?.();
  };
  useEffect(() => {
    const f = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea, button')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (playing) pause();
        else play();
      } else if (e.key === 'ArrowRight') seek(pos + 5);
      else if (e.key === 'ArrowLeft') seek(pos - 5);
      else if (e.key === 'f') void toggleFull();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  useMediaSession(hidden ? null : song, { play, pause, seek, next: next ? goNext : undefined, prev });
  useEffect(() => () => mic.current?.close(), []);

  if (key === 'file' && !song) return <FilePicker onReady={(s, url, l) => { setFileUrl(url); setInline(l); setSong(s); }} />;
  if (err && !song) return <Toast msg={err} tone="error" />;
  if (!song) return <Loading />;
  if (!song.sources.length) return <div className="notice"><b>No karaoke track yet.</b> <Link to={`/song/${encodeURIComponent(song.key)}`}>Attach one from the song page.</Link></div>;

  const src = song.sources[0];
  const isVideo = src.kind === 'youtube';
  const analyser = engine?.analyser ?? null;

  return (
    <>
      <div className="page-head">
        <div>
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.6vw, 3rem)' }}>{hidden ? 'Mystery tape' : song.title}</h2>
          <p style={{ font: '400 22px/1.2 var(--hand)', color: 'var(--muted)' }}>{hidden ? 'Blind karaoke: the title appears when you finish.' : song.artist}</p>
        </div>
        <div className="row">
          {!hidden && <SourceTag song={song} />}
          {mode === 'challenge' && <span className="pill live">Random challenge</span>}
        </div>
      </div>
      <Toast msg={error ?? err} tone="error" />
      <div className="player">
        <div>
          <div ref={stageRef} className="stage-box">
            {!isVideo && (
              <div className={`bg ${ui.bg}`} aria-hidden>
                {ui.bg === 'artwork' && song.artwork && <img src={song.artwork.replace('250x250', '500x500')} alt="" />}
                {ui.bg === 'reels' && <><Reel spinning={playing} size={260} /><Reel spinning={playing} size={260} /></>}
                {(ui.bg === 'spectrum' || ui.bg === 'wave') && <Visualizer analyser={analyser} kind={ui.bg === 'wave' ? 'wave' : 'bars'} />}
              </div>
            )}
            <div className="beam-bg" aria-hidden />
            {isVideo && <div className="video-wrap" ref={setVideoEl} />}
            {scoring && ts.length > 0 && <PitchLane targets={ts} pos={getPos} trails={trail.current} height={full ? 110 : 72} />}
            {lyrics && isVideo && <p className="sync-hint">Lyrics out of step with the video? Tap a line the moment you hear it.</p>}
            {lyrics ? <Lyrics lyrics={lyrics} pos={getPos} prefs={prefs} variant={full ? 'stage' : 'player'} onPickLine={isVideo || src.kind === 'file' ? pickLine : undefined} /> : (
              <div className="lyrics">{lyr.status === 'loading' ? <Loading label="Fetching lyrics" /> : <p className="empty">{isVideo ? 'No synced lyrics for this song. Karaoke videos show their own lyrics on screen.' : 'No lyrics available for this track.'}</p>}</div>
            )}
            <div className="transport">
              <TapeScrub pos={pos} total={total} onSeek={seek} />
              <div className="controls">
                <button className="icon-btn" onClick={prev} aria-label="Back one line"><SkipBack size={18} /></button>
                <button className="icon-btn" onClick={() => seek(pos - 10)} aria-label="Back 10 seconds"><Rewind size={18} /></button>
                <Key tone="hot" onClick={playing ? pause : play} disabled={!engine} down={playing} icon={playing ? <Pause size={18} /> : <Play size={18} />} aria-label={playing ? 'Pause' : 'Play'}>{engine ? (playing ? 'Pause' : 'Play') : 'Loading'}</Key>
                <button className="icon-btn" onClick={() => seek(pos + 10)} aria-label="Forward 10 seconds"><FastForward size={18} /></button>
                <button className="icon-btn" onClick={goNext} disabled={!next} aria-label="Next song"><SkipForward size={18} /></button>
                <button className="icon-btn" onClick={restart} aria-label="Restart"><RotateCcw size={18} /></button>
                <div className="vol">
                  <Volume2 size={18} aria-hidden />
                  <input type="range" min={0} max={1} step={0.05} value={ui.volume} onChange={(e) => setUi({ volume: Number(e.target.value) })} aria-label="Volume" />
                </div>
                <button className="icon-btn" onClick={() => (scoring ? (setScoring(false), mic.current?.close()) : setCalib(true))} aria-pressed={scoring} aria-label={scoring ? 'Turn scoring off' : 'Turn scoring on'} disabled={song.scoring === 'none' && !inline}>{scoring ? <Mic size={18} /> : <MicOff size={18} />}</button>
                <button className="icon-btn" onClick={toggleFull} aria-label={full ? 'Leave fullscreen' : 'Fullscreen'}>{full ? <Minimize size={18} /> : <Maximize size={18} />}</button>
              </div>
              {scoring && <div className="meter" aria-hidden><i style={{ width: `${Math.min(100, level * 600)}%` }} /></div>}
            </div>
          </div>
          <AnimatePresence>
            {calib && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ marginTop: 16 }}>
                <Calibrate onClose={() => setCalib(false)} onReady={(m) => { mic.current = m; setScoring(true); setCalib(false); }} />
              </motion.div>
            )}
            {result && (
              <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="results-card" style={{ marginTop: 20 }}>
                {mode === 'blind' && <p className="headline">It was {song.title}</p>}
                <ScoreReveal score={result.score} name={user?.displayName} best={result.best} isBest={result.isBest} />
                {!result.saved && (song.key.startsWith('hb:') || song.key.startsWith('dz:')) && <p className="empty">{user ? 'Not saved: no voice was detected.' : <><Link to="/signin">Sign in</Link> to keep scores and climb the rankings.</>}</p>}
                <div className="row">
                  <Key onClick={restart} icon={<RotateCcw size={16} />}>Sing again</Key>
                  {next && <Key tone="hot" onClick={goNext} icon={<SkipForward size={16} />}>Next song</Key>}
                  <Link to="/library" className="key key-ghost key-md"><span>Pick another</span></Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <aside className="panel" aria-label="Player settings">
          <LyricSettings prefs={prefs} set={setPrefs} hasRoman={!!lyrics?.lines.some((l) => l.words.some((w) => w.roman))} hasTranslation={canTranslate(song, lyr.lyrics)} wordTimed={!!lyrics?.wordTimed} note={tr.note} />
          {!isVideo && (
            <div>
              <h3>Background</h3>
              <div className="seg" role="group" aria-label="Background">
                {(['artwork', 'reels', 'spectrum', 'wave', 'plain'] as Bg[]).filter((b) => b !== 'artwork' || song.artwork).map((b) => <button key={b} aria-pressed={ui.bg === b} onClick={() => setUi({ bg: b })}>{b[0].toUpperCase() + b.slice(1)}</button>)}
              </div>
            </div>
          )}
          {src.kind === 'house' && <label className="check"><input type="checkbox" checked={ui.guide} onChange={(e) => setUi({ guide: e.target.checked })} /> Guide melody (turn off for a pure instrumental)</label>}
          {lyrics && !song.key.startsWith('hb:') && (
            <div>
              <h3>Lyric timing</h3>
              <div className="offset">
                <Key size="sm" onClick={() => setOffset((o) => Math.round((o - 0.25) * 100) / 100)} aria-label="Lyrics earlier">−0.25s</Key>
                <span className="num" style={{ minWidth: 60, textAlign: 'center' }}>{offset > 0 ? '+' : ''}{offset.toFixed(2)}s</span>
                <Key size="sm" onClick={() => setOffset((o) => Math.round((o + 0.25) * 100) / 100)} aria-label="Lyrics later">+0.25s</Key>
                <Key size="sm" onClick={() => lyr.lyrics?.lines[0] && setOffset(Math.round((pos - lyr.lyrics.lines[0].t) * 100) / 100)} title="Press when the first line starts">First line now</Key>
              </div>
              <p className="field-hint" style={{ marginTop: 6 }}>Karaoke videos are often a different edit from the recording the lyrics were timed to. Tap a lyric line as it is sung, or nudge here.</p>
              {isVideo && user && offset !== savedOffset && <Key size="sm" tone="hot" onClick={saveTiming} style={{ marginTop: 8 }}>Save this timing for everyone</Key>}
              {isVideo && savedOffset !== 0 && offset === savedOffset && <p className="field-hint">Using timing saved by an earlier singer.</p>}
            </div>
          )}
          {lyr.credit && <p className="field-hint">{lyr.credit}</p>}
          <div>
            <h3>Up next</h3>
            {upNext.filter((k) => k.key !== key).length ? (
              <ul className="upnext">{upNext.filter((k) => k.key !== key).map((k) => <li key={k.key}><span>{k.title}</span><button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => { const n = upNext.filter((x) => x.key !== k.key); writeUpNext(n); setUpNext(n); }} aria-label={`Remove ${k.title} from up next`}><X size={14} /></button></li>)}</ul>
            ) : <p className="field-hint">Add songs from their pages with "Up next" to sing them back to back.</p>}
          </div>
        </aside>
      </div>
    </>
  );
}
