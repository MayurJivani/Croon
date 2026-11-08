import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Tv, Play, Square } from 'lucide-react';
import { Key, Field, Toast, Loading } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { saveHostToken } from '../lib/room.ts';
import { useSession } from '../lib/session.tsx';

type Ev = { id: string; name: string; description: string; code: string; live: boolean; createdAt: string; endedAt: string | null };

export default function Host() {
  const { user, ready } = useSession();
  const nav = useNavigate();
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [form, setForm] = useState({ name: '', description: '', scoring: true, maxPerPerson: 2, guestsCanQueue: true, skipRatio: 0.6, autoAdvance: false });
  const [err, setErr] = useState<string | null>(null);
  const load = () => api<{ events: Ev[] }>('/events').then((r) => setEvents(r.events)).catch((e) => setErr(e.message));
  useEffect(() => {
    if (user) void load();
  }, [user]);

  if (!ready) return <Loading />;
  if (!user) return (
    <div className="form-card form" style={{ margin: '4vh auto 0' }}>
      <h1 style={{ fontSize: 'clamp(2.2rem, 6vw, 3.4rem)' }}>Host an event</h1>
      <p className="field-hint">Events are for organised nights: a named room with rules, a stage on the projector, and a leaderboard that lasts after the night. Organisers need an account; guests never do.</p>
      <Link to="/signin" state={{ from: '/host' }} className="key key-hot key-md"><span>Sign in to host</span></Link>
    </div>
  );

  const open = async (id: string) => {
    try {
      const r = await api<{ code: string; hostToken: string }>(`/events/${id}/open`, { method: 'POST' });
      saveHostToken(r.code, r.hostToken);
      nav(`/r/${r.code}`);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const { name, description, ...rules } = form;
      const r = await api<{ id: string; code: string; hostToken: string }>('/events', { method: 'POST', body: { name, description, rules } });
      saveHostToken(r.code, r.hostToken);
      nav(`/r/${r.code}`);
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  const end = async (id: string) => {
    if (!confirm('End this event? The room closes for everyone; the leaderboard stays.')) return;
    await api(`/events/${id}/end`, { method: 'POST' });
    void load();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Host an event</h1>
          <p>You run the console from your phone or laptop and never have to sing. Put the stage screen on the projector; guests join with the code or QR.</p>
        </div>
      </div>
      <Toast msg={err} tone="error" />
      <div className="two-col">
        <form className="form-card form" onSubmit={create} style={{ maxWidth: 'none' }}>
          <h2>New event</h2>
          <Field label="Event name"><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} maxLength={60} placeholder="Friday Lounge" /></Field>
          <Field label="Description" hint="Shown on the stage while nobody is singing."><textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={400} placeholder="Office party, upstairs bar. Duets welcome." /></Field>
          <label className="check"><input type="checkbox" checked={form.scoring} onChange={(e) => setForm({ ...form, scoring: e.target.checked })} /> Scoring and leaderboard</label>
          <label className="check"><input type="checkbox" checked={form.guestsCanQueue} onChange={(e) => setForm({ ...form, guestsCanQueue: e.target.checked })} /> Guests choose their own songs</label>
          <label className="check"><input type="checkbox" checked={form.autoAdvance} onChange={(e) => setForm({ ...form, autoAdvance: e.target.checked })} /> Start the next song automatically</label>
          <label className="range-row"><span>Songs each</span><input type="range" min={1} max={10} value={form.maxPerPerson} onChange={(e) => setForm({ ...form, maxPerPerson: Number(e.target.value) })} /><b className="num">{form.maxPerPerson}</b></label>
          <label className="range-row"><span>Skip vote needs</span><input type="range" min={0.3} max={1} step={0.05} value={form.skipRatio} onChange={(e) => setForm({ ...form, skipRatio: Number(e.target.value) })} /><b className="num">{Math.round(form.skipRatio * 100)}%</b></label>
          <Key tone="hot" type="submit">Create and open the console</Key>
        </form>
        <section>
          <h2>Your events</h2>
          {!events ? <Loading /> : events.length ? (
            <ul className="event-list" style={{ marginTop: 14 }}>
              {events.map((e) => (
                <li key={e.id}>
                  <div className="grow">
                    <b>{e.name}</b> <span className={`pill${e.live ? ' live' : ''}`}>{e.live ? `Live · ${e.code}` : e.endedAt ? 'Ended' : 'Closed'}</span>
                    <p className="field-hint">{new Date(e.createdAt).toLocaleDateString()} · <Link to={`/e/${e.id}`}>Public page and leaderboard</Link></p>
                  </div>
                  <Key size="sm" tone="hot" onClick={() => open(e.id)} icon={<Play size={14} />}>{e.live ? 'Console' : 'Reopen'}</Key>
                  {e.live && <Link className="icon-btn" to={`/stage/${e.code}`} aria-label="Open stage screen"><Tv size={16} /></Link>}
                  {e.live && <Key size="sm" tone="ghost" onClick={() => end(e.id)} icon={<Square size={14} />}>End</Key>}
                </li>
              ))}
            </ul>
          ) : <p className="empty">No events yet.</p>}
        </section>
      </div>
    </>
  );
}
