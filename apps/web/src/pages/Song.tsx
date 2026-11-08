import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Heart, Mic, ListPlus, Users, Search } from 'lucide-react';
import type { SongMeta, Source } from '../../../../packages/core/src/protocol.ts';
import { Key, Loading, Toast, Avatar, fmtTime, langName, rangeText, sourceLabel, genreInk, Field } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useSession } from '../lib/session.tsx';
import { lastRoom } from './Rooms.tsx';
import { queueSolo } from './Sing.tsx';

type Detail = { song: SongMeta; rights: string | null; board: { username: string; display_name: string; avatar: { glyph: string; color: string }; total: number; kind: string }[]; personalBest: number | null; favorite: boolean; canSearchVideos: boolean };
type Yt = Extract<Source, { kind: 'youtube' }>;

export function Sleeve({ song }: { song: SongMeta }) {
  return (
    <div className="sleeve">
      {song.artwork ? <img src={song.artwork.replace('250x250', '500x500')} alt="" loading="lazy" /> : (
        <div className="sleeve-house" style={{ background: song.key.startsWith('hb:') ? 'var(--card)' : 'var(--shell-3)' }}>
          <div className="bands" aria-hidden><span /><span /><span /></div>
          <b>{song.title}</b>
        </div>
      )}
    </div>
  );
}

export default function Song() {
  const { key = '' } = useParams();
  const { user } = useSession();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [videos, setVideos] = useState<Yt[] | null>(null);
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [lyr, setLyr] = useState<string | null>(null);
  const room = lastRoom();

  const load = () => api<Detail>(`/songs/${encodeURIComponent(key)}`).then(setD).catch((e) => setErr(e.message));
  useEffect(() => void load(), [key, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (user) api<{ playlists: { id: string; name: string }[] }>('/me/playlists').then((r) => setLists(r.playlists)).catch(() => {});
  }, [user]);
  useEffect(() => {
    if (!key.startsWith('dz:')) return;
    api<{ format: string; source?: string }>(`/songs/${encodeURIComponent(key)}/lyrics`).then((r) => setLyr(r.format === 'lrc' ? 'Synced lyrics from LRCLIB' : 'No synced lyrics found yet')).catch(() => setLyr(null));
  }, [key]);

  if (err) return <Toast msg={err} tone="error" />;
  if (!d) return <Loading />;
  const s = d.song;

  const fav = async () => {
    await api(`/me/favorites/${encodeURIComponent(s.key)}`, { method: d.favorite ? 'DELETE' : 'PUT' });
    setD({ ...d, favorite: !d.favorite });
  };
  const attach = async (e: FormEvent, link = url) => {
    e.preventDefault();
    setMsg(null);
    try {
      const r = await api<{ source: Yt }>(`/songs/${encodeURIComponent(s.key)}/sources`, { method: 'POST', body: { url: link } });
      setUrl('');
      setMsg(`Attached "${r.source.videoTitle}" from ${r.source.channel}.${r.source.label === 'original' ? ' It looks like the original recording with vocals, and will be labelled that way.' : ''}`);
      await load();
    } catch (x) {
      setMsg((x as Error).message);
    }
  };
  const findVideos = async () => {
    const r = await api<{ available: boolean; videos: Yt[] }>(`/songs/${encodeURIComponent(s.key)}/videos`);
    setVideos(r.videos);
  };
  const addToList = async (id: string) => {
    await api(`/me/playlists/${id}/songs`, { method: 'POST', body: { key: s.key } });
    setMsg(`Added to ${lists.find((l) => l.id === id)?.name}.`);
  };

  return (
    <>
      <div className="song-top">
        <Sleeve song={s} />
        <div>
          <h1 style={{ fontSize: 'clamp(2.4rem, 5vw, 4.4rem)' }}>{s.title}</h1>
          <p style={{ font: '400 26px/1.2 var(--hand)', marginTop: 8 }}>{s.artist}</p>
          <div className="facts">
            {s.album && <span>Album <b>{s.album}</b></span>}
            {s.year && <span>Year <b>{s.year}</b></span>}
            <span>Genre <b style={{ color: genreInk(s.genre) }}>{s.genre}</b></span>
            <span>Language <b>{langName(s.language)}</b></span>
            {s.key.startsWith('hb:') || s.sources[0]?.kind !== 'youtube' ? <span>Length <b className="num">{fmtTime(s.duration)}</b></span> : <span>Recording length <b className="num">{fmtTime(s.duration)}</b></span>}
            {s.difficulty && <span>Difficulty <b>{s.difficulty} of 5</b></span>}
            <span>Vocal range <b>{rangeText(s.range) ?? 'not known'}</b></span>
            <span>Lyrics <b>{s.key.startsWith('hb:') ? 'Timed to the syllable' : lyr ?? 'checking…'}</b></span>
            <span>Scoring <b>{s.scoring === 'full' ? 'Pitch and timing' : s.scoring === 'lite' ? 'Timing only (no melody data)' : 'Not available'}</b></span>
          </div>
          <div className="row">
            {s.sources.length ? <Link to={`/sing/${encodeURIComponent(s.key)}`} className="key key-hot key-lg"><Mic size={18} aria-hidden /><span>Sing it</span></Link> : <Key size="lg" disabled>No karaoke track yet</Key>}
            {room && s.sources.length > 0 && <Link to={`/r/${room}?add=${encodeURIComponent(s.key)}`} className="key key-md"><Users size={16} aria-hidden /><span>Queue in room {room}</span></Link>}
            {s.sources.length > 0 && <Key onClick={() => { queueSolo(s.key, s.title); setMsg('Added to your up next list in the player.'); }} icon={<ListPlus size={16} />}>Up next</Key>}
            {user && <Key onClick={fav} down={d.favorite} icon={<Heart size={16} fill={d.favorite ? 'currentColor' : 'none'} />}>{d.favorite ? 'Saved' : 'Save'}</Key>}
            {user && lists.length > 0 && (
              <label className="row" style={{ gap: 6 }}>
                <ListPlus size={18} aria-hidden />
                <select defaultValue="" onChange={(e) => { if (e.target.value) void addToList(e.target.value); e.target.value = ''; }} aria-label="Add to playlist">
                  <option value="">Add to playlist…</option>
                  {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
            )}
          </div>
          {d.personalBest !== null && <p className="empty">Your best on this song: <b className="num">{d.personalBest}</b></p>}
          <Toast msg={msg} />
        </div>
      </div>

      <div className="two-col section">
        <section>
          <h2>What you will hear</h2>
          <div className="sources">
            {s.sources.map((src, i) => (
              <div key={i} className="source">
                {src.kind === 'youtube' && <img src={`https://i.ytimg.com/vi/${src.videoId}/mqdefault.jpg`} alt="" loading="lazy" />}
                <div>
                  <b>{sourceLabel(src)}</b>
                  {src.kind === 'youtube' && <p>"{src.videoTitle}" from {src.channel}, played through YouTube's player.</p>}
                  {src.kind === 'house' && <p>Piano, bass and drums synthesised in your browser from the written melody and chords. {d.rights}</p>}
                  {src.kind === 'youtube' && src.label === 'original' && <p><b>This video includes the original vocals.</b> No karaoke version has been attached yet.</p>}
                </div>
              </div>
            ))}
            {!s.sources.length && <p className="notice"><b>No karaoke track yet.</b> Croon will not play the original recording and pretend it is an instrumental. Attach a karaoke or instrumental video below and it becomes playable for everyone.</p>}
          </div>
          {s.key.startsWith('dz:') && (user ? (
            <form className="form" onSubmit={attach}>
              <Field label="Attach a karaoke video" hint="Paste a YouTube link to a karaoke or instrumental version. Croon checks that it exists and may be embedded, and labels it by what its title says.">
                <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" required />
              </Field>
              <div className="row">
                <Key type="submit">Attach</Key>
                {d.canSearchVideos && <Key type="button" onClick={findVideos} icon={<Search size={16} />}>Search YouTube</Key>}
              </div>
              {videos && (
                <div className="sources">
                  {videos.length === 0 && <p className="empty">Nothing found.</p>}
                  {videos.map((v) => (
                    <div key={v.videoId} className="source">
                      <img src={`https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`} alt="" loading="lazy" />
                      <div style={{ flex: 1, minWidth: 200 }}><b>{v.videoTitle}</b><p>{v.channel} · {sourceLabel(v)}</p></div>
                      <Key size="sm" type="button" onClick={(e) => attach(e as unknown as FormEvent, v.videoId)}>Use this</Key>
                    </div>
                  ))}
                </div>
              )}
            </form>
          ) : <p className="empty"><Link to="/signin">Sign in</Link> to attach a karaoke video.</p>)}
        </section>
        <section>
          <h2>Song ranking</h2>
          <ol className="board" style={{ marginTop: 16 }}>
            {d.board.map((r) => (
              <li key={r.username}>
                <Avatar a={r.avatar} size={28} />
                <Link to={`/u/${r.username}`}>{r.display_name}</Link>
                {r.kind === 'lite' && <small>timing only</small>}
                <b>{r.total}</b>
              </li>
            ))}
          </ol>
          {!d.board.length && <p className="empty">No scores yet. Sing it with scoring on to take first place.</p>}
        </section>
      </div>
    </>
  );
}
