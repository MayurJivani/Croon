import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Key, Loading, Toast } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { saveHostToken } from '../lib/room.ts';

type Ev = { id: string; name: string; description: string; code: string | null; live: boolean; createdAt: string; board: { name: string; best: number; songs: number }[]; isOwner: boolean };

export default function EventPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [e, setE] = useState<Ev | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const load = () => api<Ev>(`/events/${id}`).then(setE).catch((x) => setErr(x.message));
    void load();
    const t = setInterval(load, 20_000); // a public board left open on a screen stays current
    return () => clearInterval(t);
  }, [id]);
  if (err) return <Toast msg={err} tone="error" />;
  if (!e) return <Loading />;
  const openConsole = async () => {
    const r = await api<{ code: string; hostToken: string }>(`/events/${id}/open`, { method: 'POST' });
    saveHostToken(r.code, r.hostToken);
    nav(`/r/${r.code}`);
  };
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{e.name}</h1>
          {e.description && <p>{e.description}</p>}
        </div>
        {e.live && e.code && (
          <div className="row">
            <div style={{ background: 'var(--card)', padding: 10, borderRadius: 10, lineHeight: 0 }}><QRCodeSVG value={`${location.origin}/r/${e.code}`} size={120} bgColor="#f2e8dc" fgColor="#1c1716" /></div>
            <div>
              <p className="room-code">{e.code}</p>
              <Link to={`/r/${e.code}`} className="key key-hot key-md"><span>Join the room</span></Link>
            </div>
          </div>
        )}
      </div>
      {e.isOwner && <div className="row" style={{ marginBottom: 20 }}><Key onClick={openConsole}>Open host console</Key></div>}
      <h2>Leaderboard</h2>
      <ol className="board" style={{ marginTop: 14, maxWidth: 640 }}>{e.board.map((b) => <li key={b.name}><span>{b.name}</span><small>{b.songs} {b.songs === 1 ? 'song' : 'songs'}</small><b>{b.best}</b></li>)}</ol>
      {!e.board.length && <p className="empty">No scores yet.</p>}
    </>
  );
}
