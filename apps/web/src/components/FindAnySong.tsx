// Growing the library from the library itself: look a song or artist up on Deezer, bring it in,
// and let Croon auto-find synced lyrics and a karaoke video for it.
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Download, Disc3, Check } from 'lucide-react';
import type { SongMeta } from '../../../../packages/core/src/protocol.ts';
import { api } from '../lib/api.ts';
import { useSession } from '../lib/session.tsx';
import { Key, Shelf, Toast, fmtTime, Loading } from './ui.tsx';

type Found = { songs: { deezerId: string; title: string; artist: string; album: string | null; artwork: string | null; duration: number; inCatalog: boolean; key: string }[]; artists: { id: string; name: string; picture: string; albums: number; fans: number }[] };
type Job = { id: string; artist: string; status: 'running' | 'done' | 'failed'; total: number; added: number; already: number; lyrics: number; videos: number; videoNote: string | null; current: string | null; error: string | null };
type AutoFind = { lyrics: 'word' | 'line' | 'none'; video: string };

export function describeFind(f: AutoFind) {
  const lyr = f.lyrics === 'none' ? 'No synced lyrics found yet.' : `Found ${f.lyrics === 'word' ? 'word' : 'line'}-timed lyrics.`;
  const vid = f.video === 'attached' ? 'Attached a karaoke video.' : f.video === 'had' ? 'It already had a karaoke track.' : f.video === 'no-key' ? 'Video search is off on this server (no YouTube API key): use "Search on YouTube" and paste the link.' : f.video === 'quota' ? "Today's YouTube search quota is used up; try again tomorrow or paste a link." : 'No karaoke video found automatically; paste one below.';
  return `${lyr} ${vid}`;
}

export function ImportProgress({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [songs, setSongs] = useState<SongMeta[]>([]);
  useEffect(() => {
    let live = true;
    const tick = async () => {
      const r = await api<{ job: Job; songs: SongMeta[] }>(`/songs/imports/${jobId}`).catch(() => null);
      if (!live || !r) return;
      setJob(r.job);
      setSongs(r.songs);
      if (r.job.status === 'running') setTimeout(tick, 2000);
    };
    void tick();
    return () => {
      live = false;
    };
  }, [jobId]);
  if (!job) return <Loading label="Starting the import" />;
  return (
    <div className="import-job" aria-live="polite">
      <h3>{job.artist}: {job.status === 'running' ? 'importing' : job.status === 'done' ? 'imported' : 'import stopped'}</h3>
      <div className="stats">
        <div><b className="num">{job.total}</b><span>original songs found</span></div>
        <div><b className="num">{job.added}</b><span>new to Croon</span></div>
        <div><b className="num">{job.lyrics}</b><span>with synced lyrics</span></div>
        <div><b className="num">{job.videos}</b><span>with a karaoke video</span></div>
      </div>
      {job.current && <p className="field-hint">Now: {job.current}</p>}
      {job.videoNote && <p className="notice">{job.videoNote}</p>}
      {job.error && <Toast msg={job.error} tone="error" />}
      <Shelf songs={songs} />
    </div>
  );
}

/** `onPick` (in a room): a song once it is in Croon goes to the caller instead of its song page, and whole discographies are left to the library. */
export function FindAnySong({ initial, auto = false, onPick }: { initial: string; auto?: boolean; onPick?: (s: SongMeta) => void }) {
  const { user } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  // Signed-out visitors get a working button that signs them in and brings them back to this search.
  const here = loc.pathname + loc.search;
  const signIn = () => nav('/signin', { state: { from: here } });
  const [q, setQ] = useState(initial);
  const [found, setFound] = useState<Found | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: string; tone: 'info' | 'error' } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  const look = async () => {
    setMsg(null);
    setBusy('search');
    try {
      setFound(await api<Found>(`/songs/discover?${new URLSearchParams({ q })}`));
    } catch (e) {
      setMsg({ t: (e as Error).message, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };
  // A library search that comes up short looks on Deezer by itself; adding stays a click.
  useEffect(() => {
    if (auto && !found && initial.trim().length >= 2) void look();
  }, [auto]); // eslint-disable-line react-hooks/exhaustive-deps
  const importSong = async (id: string) => {
    setBusy(id);
    try {
      const r = await api<{ song: SongMeta; found: AutoFind }>('/songs/import', { method: 'POST', body: { deezerId: id } });
      setDone((d) => ({ ...d, [id]: r.song.key }));
      if (onPick && r.song.sources.length) onPick(r.song);
      else if (onPick) setMsg({ t: `Added ${r.song.title} to Croon, but no karaoke track was found for it, so it cannot be queued yet. Attach one from its song page.`, tone: 'error' });
      else setMsg({ t: `Added ${r.song.title}. ${describeFind(r.found)}`, tone: 'info' });
    } catch (e) {
      setMsg({ t: (e as Error).message, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };
  const pickKnown = (key: string) => void api<{ song: SongMeta }>(`/songs/${encodeURIComponent(key)}`).then((r) => onPick!(r.song)).catch((e: Error) => setMsg({ t: e.message, tone: 'error' }));
  const importArtist = async (id: string, name: string) => {
    setBusy(id);
    try {
      const r = await api<{ job: { id: string } }>('/songs/import-artist', { method: 'POST', body: { artistId: id, name } });
      setJobId(r.job.id);
    } catch (e) {
      setMsg({ t: (e as Error).message, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="find-any">
      <h2>Find any song</h2>
      <p className="field-hint">Not in Croon yet? Look it up, bring it in, and Croon finds synced lyrics and a karaoke video for it.{!user && <> <Link to="/signin" state={{ from: here }}>Sign in</Link> to add songs.</>}</p>
      <form className="row" onSubmit={(e) => { e.preventDefault(); void look(); }}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Song or artist" aria-label="Song or artist to find" style={{ flex: 1 }} minLength={2} required />
        <Key type="submit" disabled={busy === 'search'}>{busy === 'search' ? 'Looking…' : 'Look it up'}</Key>
      </form>
      <Toast msg={msg?.t ?? null} tone={msg?.tone} />
      {jobId && <ImportProgress jobId={jobId} />}
      {found && !jobId && (
        <>
          {!onPick && found.artists.length > 0 && (
            <div className="find-artists">
              {found.artists.map((a) => (
                <div key={a.id} className="find-artist">
                  <img src={a.picture} alt="" width={56} height={56} loading="lazy" />
                  <div><b>{a.name}</b><span>{a.albums} releases · {a.fans.toLocaleString()} fans</span></div>
                  <Key size="sm" onClick={() => (user ? importArtist(a.id, a.name) : signIn())} disabled={!!busy} icon={<Disc3 size={14} />}>Import discography</Key>
                </div>
              ))}
            </div>
          )}
          <ul className="shelf">
            {found.songs.map((s) => (
              <li key={s.deezerId} className="find-song">
                <i className="spine-band" />
                <b className="spine-title">{s.title}</b>
                <span className="spine-artist">{s.artist}</span>
                <span className="spine-meta">
                  <span className="spine-facts num">{fmtTime(s.duration)}</span>
                  {onPick && (s.inCatalog || done[s.deezerId]) ? (
                    <Key size="sm" tone="card" onClick={() => pickKnown(done[s.deezerId] ?? s.key)} disabled={!!busy} icon={<Check size={14} />}>Queue it</Key>
                  ) : s.inCatalog || done[s.deezerId] ? (
                    <Link to={`/song/${encodeURIComponent(done[s.deezerId] ?? s.key)}`} className="key key-sm key-card"><Check size={14} aria-hidden /><span>In Croon</span></Link>
                  ) : (
                    <Key size="sm" tone="card" onClick={() => (user ? importSong(s.deezerId) : signIn())} disabled={!!busy} icon={<Download size={14} />}>{busy === s.deezerId ? 'Adding…' : 'Add'}</Key>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="field-hint">Song details come from Deezer's public catalogue. Only karaoke and instrumental videos are ever attached, never the original recording.</p>
        </>
      )}
    </section>
  );
}
