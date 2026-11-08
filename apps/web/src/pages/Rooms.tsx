import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Users, Tv } from 'lucide-react';
import { Key, Field, Toast } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { saveHostToken } from '../lib/room.ts';
import { useSession } from '../lib/session.tsx';

const KEY = 'croon:recent-rooms';
export function rememberRoom(code: string) {
  try {
    const list = [code, ...JSON.parse(localStorage.getItem(KEY) ?? '[]').filter((c: string) => c !== code)].slice(0, 5);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
export function recentRooms(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}
export const lastRoom = () => recentRooms()[0] ?? null;

export default function Rooms() {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();
  const { user } = useSession();

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await api<{ code: string; hostToken: string }>('/rooms', { method: 'POST', body: { name: name.trim() || (user ? `${user.displayName}'s room` : 'Karaoke night') } });
      saveHostToken(r.code, r.hostToken);
      nav(`/r/${r.code}`);
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  const join = async (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    try {
      await api(`/rooms/${c}`);
      nav(`/r/${c}`);
    } catch (x) {
      setErr((x as Error).message);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Rooms</h1>
          <p>A room is one night of karaoke. The host runs the queue, the TV shows the stage, and everyone else joins from their phone. Rooms close a little while after the last person leaves.</p>
        </div>
      </div>
      <Toast msg={err} tone="error" />
      <div className="two-col">
        <form className="form-card form" onSubmit={create}>
          <h2>Start a room</h2>
          <Field label="Room name" hint="Shown on the stage screen and on guests' phones.">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Friday at Priya's" />
          </Field>
          <Key tone="hot" type="submit" icon={<Users size={16} />}>Start a room</Key>
          <p className="field-hint">Running a bigger night with a projector and a public leaderboard? <Link to="/host">Host an event</Link> instead.</p>
        </form>
        <form className="form-card form" onSubmit={join}>
          <h2>Join a room</h2>
          <Field label="Room code">
            <input type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))} placeholder="KQZM" autoCapitalize="characters" style={{ fontSize: 24, letterSpacing: '0.3em', fontWeight: 800 }} />
          </Field>
          <Key type="submit" disabled={code.length !== 4}>Join</Key>
          {recentRooms().length > 0 && (
            <div>
              <p className="field-label" style={{ marginTop: 10 }}>Your recent rooms</p>
              <div className="row" style={{ marginTop: 8 }}>
                {recentRooms().map((c) => (
                  <span key={c} className="row" style={{ gap: 6 }}>
                    <Link to={`/r/${c}`} className="key key-sm"><span>{c}</span></Link>
                    <Link to={`/stage/${c}`} className="icon-btn" aria-label={`Open stage screen for ${c}`} title="Stage screen"><Tv size={16} /></Link>
                  </span>
                ))}
              </div>
            </div>
          )}
        </form>
      </div>
    </>
  );
}
