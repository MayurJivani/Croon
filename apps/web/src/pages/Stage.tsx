// The stage: the TV or projector the room watches. It owns the speakers, shows the lyrics big
// enough to read from the sofa, and announces each singer. Synchronized bands on one clock:
// lyric band, singer band, queue band.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { Maximize, Volume2 } from 'lucide-react';
import { MODES, withParts } from '../../../../packages/core/src/modes.ts';
import { positionAt } from '../../../../packages/core/src/timeline.ts';
import { mapLyrics, targets, stageShowsLyrics } from '../../../../packages/core/src/lyrics.ts';
import type { LiveMsg, Participant } from '../../../../packages/core/src/protocol.ts';
import { useRoom } from '../lib/room.ts';
import { useSongLyrics, DEFAULT_PREFS } from '../lib/lyrics.ts';
import { useGetter } from '../lib/playback.ts';
import { audioContext } from '../audio/engines.ts';
import { Lyrics } from '../components/Lyrics.tsx';
import { PitchLane, type Trail } from '../components/PitchLane.tsx';
import { Spotlight } from '../components/Spotlight.tsx';
import { ScoreReveal } from '../components/ScoreReveal.tsx';
import { RoomAudio } from '../components/RoomAudio.tsx';
import { Avatar, Key, Loading, SourceTag, genreInk } from '../components/ui.tsx';
import { rememberRoom } from './Rooms.tsx';

export default function Stage() {
  const { code: raw = '' } = useParams();
  const code = raw.toUpperCase();
  const [started, setStarted] = useState(false);
  const { view, error, status, emit, onLive, serverNow } = useRoom(started ? code : null, null, { stage: true });
  const trails = useRef(new Map<string, Trail>());
  const [, force] = useState(0);
  const c = view?.current ?? null;
  const lyr = useSongLyrics(c?.song ?? null, c?.lyricsText ?? null);
  const lyrics = useMemo(() => {
    if (!lyr.lyrics || !c) return null;
    return mapLyrics(MODES[c.mode].parts ? withParts(lyr.lyrics) : lyr.lyrics, c.lyricAnchors);
  }, [lyr.lyrics, c?.lyricAnchors, c?.mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const ts = useMemo(() => (lyrics?.pitched ? targets(lyrics) : []), [lyrics]);
  const getPos = useGetter(() => (c ? positionAt(c.timeline, serverNow()) : 0));
  const progress = useRef<HTMLElement>(null);

  useEffect(() => void rememberRoom(code), [code]);
  useEffect(() => {
    trails.current = new Map();
    force((n) => n + 1);
  }, [c?.entryId]);
  useEffect(() => onLive((m: LiveMsg) => {
    let t = trails.current.get(m.pid);
    if (!t) {
      t = [];
      trails.current.set(m.pid, t);
      force((n) => n + 1);
    }
    t.push({ t: m.t, m: m.m });
    if (t.length > 400) t.splice(0, 150);
  }), [onLive]);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (progress.current && c) progress.current.style.transform = `scaleX(${Math.min(1, Math.max(0, getPos() / c.song.duration))})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [c, getPos]);

  const start = useCallback(() => {
    audioContext(); // a tap is needed before a browser lets the stage make sound
    setStarted(true);
  }, []);
  const fullscreen = () => document.documentElement.requestFullscreen?.().catch(() => {});

  if (!started) {
    return (
      <div className="tap-to-start">
        <div>
          <h1>Stage {code}</h1>
          <p className="empty">This screen plays the music and shows the lyrics for the room. Put it on the TV, then press start so the browser allows sound.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Key tone="hot" size="lg" onClick={() => { start(); fullscreen(); }} icon={<Volume2 size={18} />}>Start the stage</Key>
            <Key size="lg" onClick={start}>Start without fullscreen</Key>
          </div>
        </div>
      </div>
    );
  }
  if (error && !view) return <div className="tap-to-start"><div><h1>Stage {code}</h1><p className="toast toast-error">{error}</p><Link to="/rooms" className="key key-md"><span>Back to rooms</span></Link></div></div>;
  if (!view) return <div className="stage"><Loading label="Wiring the stage" /></div>;

  const joinUrl = `${location.origin}/r/${code}`;
  const person = (pid: string) => view.participants.find((p) => p.pid === pid);
  const singers = c ? (c.singers.map(person).filter(Boolean) as Participant[]) : [];
  const isVideo = c?.song.sources[0]?.kind === 'youtube';
  // Karaoke and lyric videos carry their own words: Croon's would only double them.
  const showLyrics = !!c && stageShowsLyrics(c.song, view.settings.stageLyricsWithVideo);
  const sideLyrics = isVideo && showLyrics;
  const trailList = singers.map((s) => trails.current.get(s.pid) ?? []);
  const upNext = view.queue.slice(0, 3);
  const name = (pid: string) => person(pid)?.name ?? 'Someone';

  return (
    <div className="stage" data-phase={view.phase}>
      <div className="beam-bg" aria-hidden />
      <header className="stage-top">
        {c && view.phase !== 'lobby' ? (
          <>
            <span className="now">{view.phase === 'results' ? 'Just sung' : view.phase === 'announce' ? 'Up next' : MODES[c.mode].name === 'Solo' ? 'Now singing' : MODES[c.mode].name}</span>
            <span className="title">{c.song.title}</span>
            <SourceTag song={c.song} />
          </>
        ) : <span className="title">{view.name}</span>}
        <div className="stage-join">
          <div>Join on your phone<b>{code}</b></div>
          <div className="qr"><QRCodeSVG value={joinUrl} size={Math.round(Math.min(window.innerWidth, 1920) * 0.055)} bgColor="#f2e8dc" fgColor="#1c1716" /></div>
        </div>
      </header>

      <section className={`stage-mid${sideLyrics && view.phase === 'playing' ? ' with-video' : ''}`}>
        {/* The stage owns the speakers. A YouTube player must stay visible and uncovered. */}
        {c && (view.phase === 'announce' || view.phase === 'playing') && (
          <div style={view.phase === 'announce' || !isVideo ? { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0, pointerEvents: 'none' } : undefined}>
            <RoomAudio view={view} serverNow={serverNow} emit={emit} stage />
          </div>
        )}
        <AnimatePresence mode="wait">
          {view.phase === 'lobby' && (
            <motion.div key="idle" className="stage-idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div>
                <h1>SING<span>IT LOUD</span></h1>
                <p style={{ font: '400 clamp(20px, 2vw, 38px)/1.2 var(--hand)', color: 'var(--muted)', marginTop: '2vh' }}>{view.description || 'Scan the code, pick a song, wait for the spotlight.'}</p>
                {view.board.length > 0 && (
                  <ol className="stage-board" style={{ marginTop: '4vh' }}>
                    {view.board.slice(0, 5).map((b) => <li key={b.pid}><Avatar a={b.avatar} size={36} />{b.name}<b>{b.best}</b></li>)}
                  </ol>
                )}
              </div>
              <div className="big-qr"><QRCodeSVG value={joinUrl} size={Math.round(Math.min(window.innerWidth, 1920) * 0.22)} bgColor="#f2e8dc" fgColor="#1c1716" /></div>
            </motion.div>
          )}
          {view.phase === 'announce' && c && (
            <motion.div key={`a-${c.entryId}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04 }}>
              <Spotlight singers={singers} song={c.song} mode={c.mode} big />
            </motion.div>
          )}
          {view.phase === 'playing' && c && (
            <motion.div key={`p-${c.entryId}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={isVideo ? { display: 'contents' } : undefined}>
              {showLyrics && (
                <div>
                  {ts.length > 0 && trailList.length > 0 && <PitchLane targets={ts} pos={getPos} trails={trailList} colors={['#2ec4b6', '#ff4f2e', '#ffc23d', '#b388eb']} />}
                  {lyrics ? <Lyrics lyrics={lyrics} pos={getPos} prefs={{ ...DEFAULT_PREFS, style: view.settings.stageLyricStyle !== 'auto' ? view.settings.stageLyricStyle : isVideo ? 'line' : lyrics.wordTimed ? 'classic' : 'line', size: 1 }} parts={!!MODES[c.mode].parts} variant="stage" />
                    : <p className="empty">{lyr.status === 'loading' ? 'Fetching lyrics…' : isVideo ? 'Follow the lyrics in the video.' : 'No lyrics for this track.'}</p>}
                </div>
              )}
            </motion.div>
          )}
          {view.phase === 'results' && c && (
            <motion.div key={`r-${c.entryId}`} className="results-card" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <p className="headline" style={{ fontSize: 'clamp(40px, 4vw, 90px)' }}>{c.result?.headline ?? 'Counting the score…'}</p>
              <div className="row" style={{ justifyContent: 'center', alignItems: 'flex-start', gap: '3vw' }}>
                {/* Equal columns: a card sized to its own footnote squeezed the grade over the score. */}
                {Object.entries(c.scores).map(([pid, s]) => <div key={pid} style={{ flex: '1 1 0', maxWidth: 440 }}><ScoreReveal score={s} name={name(pid)} /></div>)}
              </div>
              {!Object.keys(c.scores).length && c.result && <p className="empty">{view.settings.scoring ? 'No microphones were scoring this one.' : 'Scoring is off tonight.'}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <footer className="stage-bottom">
        <div className="stage-singer">
          {singers.length > 0 && view.phase === 'playing' ? (
            <>
              <div style={{ display: 'flex' }}>{singers.map((p) => <Avatar key={p.pid} a={p.avatar} size={Math.round(Math.min(window.innerWidth, 1920) * 0.045)} ring />)}</div>
              <div><div className="n">{singers.map((p) => p.name).join(' & ')}</div><div className="sub">on the mic</div></div>
            </>
          ) : view.phase === 'lobby' ? <div><div className="n">{view.queue.length ? 'The host will start soon' : 'Queue a song'}</div><div className="sub">{view.participants.filter((p) => p.role !== 'stage' && p.connected).length} in the room</div></div> : <div />}
        </div>
        <div className="stage-scores">
          {c && view.phase === 'playing' && <div>Crowd<b>{c.cheers}</b></div>}
          {(view.teams.A > 0 || view.teams.B > 0) && <><div>Team A<b>{view.teams.A}</b></div><div>Team B<b>{view.teams.B}</b></div></>}
        </div>
        <div className="stage-up">
          <h3>In the queue</h3>
          {upNext.length ? (
            <ul className="queue">
              <AnimatePresence initial={false}>
                {upNext.map((q) => (
                  <motion.li key={q.id} layout initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} className="qitem">
                    <i className="band" style={{ background: genreInk(q.song.genre) }} />
                    <div className="qt"><b>{q.song.title}</b><span>{q.singers.map(name).join(' & ')}{q.mode !== 'solo' ? ` · ${MODES[q.mode].name}` : ''}</span></div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : <ul className="queue"><li className="qitem blank"><i className="band" /><div className="qt"><b>Blank tape</b><span>Scan the code to add a song</span></div></li></ul>}
        </div>
      </footer>
      {c && view.phase === 'playing' && <div className="stage-prog" aria-hidden><i ref={progress as React.RefObject<HTMLElement & HTMLElement>} /></div>}
      {status !== 'live' && <p className="toast" style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)' }}>Reconnecting…</p>}
      <button className="icon-btn" onClick={fullscreen} aria-label="Fullscreen" style={{ position: 'fixed', right: 12, bottom: 16, opacity: 0.4 }}><Maximize size={16} /></button>
    </div>
  );
}
