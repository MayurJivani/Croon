import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Award, Trash2, Plus, LogOut } from 'lucide-react';
import type { SongMeta } from '../../../../packages/core/src/protocol.ts';
import { AVATAR_COLORS, AVATAR_GLYPHS } from '../../../../packages/core/src/labels.ts';
import { Avatar, AVATAR_ICONS, Key, Loading, Toast, Field, Shelf } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useSession } from '../lib/session.tsx';

type Stats = {
  performances: number; seconds: number; streak: number; longestStreak: number;
  highest: { total: number; song: SongMeta | null } | null;
  mostPerformed: { song: SongMeta | null; times: number } | null;
  favoriteArtists: { name: string; n: number }[]; favoriteGenres: { name: string; n: number }[];
  bests: { song: SongMeta | null; total: number; kind: string }[];
  history: { song: SongMeta | null; total: number; kind: string; mode: string; partner: string | null; at: string }[];
  duets: { song: SongMeta | null; total: number; partner: string | null; at: string }[];
  achievements: { id: string; name: string; blurb: string; earned: boolean }[];
};
type Data = { user: { username: string; displayName: string; avatar: { glyph: string; color: string }; joined: string }; stats: Stats; following: boolean; followers: number; isMe: boolean; favorites?: SongMeta[] };
type Playlist = { id: string; name: string; songs: SongMeta[] };

const hours = (s: number) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 60)} min`);

function Editor({ d, onSaved }: { d: Data; onSaved(): void }) {
  const { setUser, logout } = useSession();
  const nav = useNavigate();
  const [displayName, setDisplayName] = useState(d.user.displayName);
  const [username, setUsername] = useState(d.user.username);
  const [avatar, setAvatar] = useState(d.user.avatar);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState<{ t: string; tone: 'info' | 'error' } | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await api<{ user: never }>('/auth/me', { method: 'PATCH', body: { displayName, username, avatar } });
      setUser(r.user);
      setMsg({ t: 'Saved.', tone: 'info' });
      if (username !== d.user.username) nav(`/u/${username}`, { replace: true });
      else onSaved();
    } catch (x) {
      setMsg({ t: (x as Error).message, tone: 'error' });
    }
  };
  const changePw = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/auth/password', { method: 'POST', body: pw });
      setPw({ current: '', next: '' });
      setMsg({ t: 'Password changed. Other devices were signed out.', tone: 'info' });
    } catch (x) {
      setMsg({ t: (x as Error).message, tone: 'error' });
    }
  };
  return (
    <div className="two-col">
      <form className="form-card form" onSubmit={save}>
        <h3>Profile</h3>
        <Field label="Display name"><input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={32} /></Field>
        <Field label="Username"><input type="text" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} /></Field>
        <div className="field">
          <span className="field-label">Badge</span>
          <div className="glyphs">{AVATAR_GLYPHS.map((g) => { const I = AVATAR_ICONS[g]; return <button type="button" key={g} aria-pressed={avatar.glyph === g} aria-label={g} onClick={() => setAvatar({ ...avatar, glyph: g })} style={avatar.glyph === g ? { background: avatar.color, color: 'var(--card-ink)' } : undefined}><I size={20} /></button>; })}</div>
          <div className="swatches">{AVATAR_COLORS.map((c) => <button type="button" key={c} aria-pressed={avatar.color === c} aria-label={`Colour ${c}`} style={{ background: c }} onClick={() => setAvatar({ ...avatar, color: c })} />)}</div>
        </div>
        <Key tone="hot" type="submit">Save profile</Key>
      </form>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <form className="form-card form" onSubmit={changePw}>
          <h3>Password</h3>
          <Field label="Current password"><input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" required /></Field>
          <Field label="New password"><input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" required minLength={8} /></Field>
          <Key type="submit">Change password</Key>
        </form>
        <Key tone="ghost" onClick={async () => { await logout(); nav('/'); }} icon={<LogOut size={16} />}>Sign out</Key>
      </div>
      <Toast msg={msg?.t ?? null} tone={msg?.tone} />
    </div>
  );
}

function Playlists() {
  const [lists, setLists] = useState<Playlist[]>([]);
  const [name, setName] = useState('');
  const load = () => api<{ playlists: Playlist[] }>('/me/playlists').then((r) => setLists(r.playlists)).catch(() => {});
  useEffect(() => void load(), []);
  const create = async (e: FormEvent) => {
    e.preventDefault();
    await api('/me/playlists', { method: 'POST', body: { name } });
    setName('');
    void load();
  };
  return (
    <section className="section">
      <div className="section-head"><h2>Playlists</h2></div>
      <form className="row" onSubmit={create} style={{ marginBottom: 16 }}>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="New playlist name" maxLength={60} required aria-label="New playlist name" />
        <Key type="submit" icon={<Plus size={16} />}>Create</Key>
      </form>
      {lists.map((l) => (
        <div key={l.id} style={{ marginBottom: 22 }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <h3>{l.name}</h3>
            <span className="empty" style={{ padding: 0 }}>{l.songs.length} songs</span>
            <button className="icon-btn" onClick={async () => { if (confirm(`Delete the playlist "${l.name}"?`)) { await api(`/me/playlists/${l.id}`, { method: 'DELETE' }); void load(); } }} aria-label={`Delete ${l.name}`}><Trash2 size={16} /></button>
          </div>
          {l.songs.length ? (
            <ul className="shelf">
              {l.songs.map((s) => (
                <li key={s.key} className="row" style={{ flexWrap: 'nowrap' }}>
                  <Link to={`/song/${encodeURIComponent(s.key)}`} className="spine" style={{ flex: 1 }}><i className="spine-band" /><b className="spine-title">{s.title}</b><span className="spine-artist">{s.artist}</span></Link>
                  <button className="icon-btn" onClick={async () => { await api(`/me/playlists/${l.id}/songs/${encodeURIComponent(s.key)}`, { method: 'DELETE' }); void load(); }} aria-label={`Remove ${s.title}`}><Trash2 size={16} /></button>
                </li>
              ))}
            </ul>
          ) : <p className="empty">Add songs from any song page.</p>}
        </div>
      ))}
      {!lists.length && <p className="empty">No playlists yet.</p>}
    </section>
  );
}

export default function Profile() {
  const { username = '' } = useParams();
  const { user } = useSession();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const load = () => api<Data>(`/users/${encodeURIComponent(username)}`).then(setD).catch((e) => setErr(e.message));
  useEffect(() => void load(), [username, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <Toast msg={err} tone="error" />;
  if (!d) return <Loading />;
  const s = d.stats;
  const follow = async () => {
    await api(`/users/${d.user.username}/follow`, { method: d.following ? 'DELETE' : 'PUT' });
    void load();
  };
  return (
    <>
      <div className="profile-head">
        <Avatar a={d.user.avatar} size={96} ring />
        <div>
          <h1 style={{ fontSize: 'clamp(2.4rem, 5vw, 4rem)' }}>{d.user.displayName}</h1>
          <p className="handle">@{d.user.username} · singing since {new Date(d.user.joined).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} · {d.followers} {d.followers === 1 ? 'follower' : 'followers'}</p>
        </div>
        <span style={{ flex: 1 }} />
        {d.isMe ? <Key onClick={() => setEdit((v) => !v)} down={edit}>Edit profile</Key> : user && <Key onClick={follow} down={d.following}>{d.following ? 'Following' : 'Follow'}</Key>}
      </div>
      {edit && d.isMe && <div className="section" style={{ marginTop: 24 }}><Editor d={d} onSaved={() => { setEdit(false); void load(); }} /></div>}

      <div className="stats">
        <div><b className="num">{s.performances}</b><span>songs performed</span></div>
        <div><b className="num">{hours(s.seconds)}</b><span>total singing time</span></div>
        <div><b className="num">{s.streak}</b><span>day streak (best {s.longestStreak})</span></div>
        <div><b className="num">{s.highest?.total ?? '–'}</b><span>highest score{s.highest?.song ? `, ${s.highest.song.title}` : ''}</span></div>
        <div><b className="num">{s.mostPerformed?.times ?? 0}×</b><span>{s.mostPerformed?.song ? `most sung: ${s.mostPerformed.song.title}` : 'most performed song'}</span></div>
        <div><b>{s.favoriteGenres[0]?.name ?? '–'}</b><span>favourite genre{s.favoriteArtists[0] ? ` · favourite artist ${s.favoriteArtists[0].name}` : ''}</span></div>
      </div>

      <section className="section" style={{ marginTop: 32 }}>
        <div className="section-head"><h2>Achievements</h2><span className="empty" style={{ padding: 0 }}>{s.achievements.filter((a) => a.earned).length} of {s.achievements.length}</span></div>
        <div className="badges">
          {s.achievements.map((a) => (
            <div key={a.id} className={`badge${a.earned ? ' earned' : ''}`}>
              <span className="seal"><Award size={20} aria-hidden /></span>
              <div><b>{a.name}</b><span>{a.blurb}</span></div>
              <span className="sr-only">{a.earned ? 'earned' : 'not yet earned'}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="two-col section">
        <section>
          <h2>Personal bests</h2>
          <ol className="board" style={{ marginTop: 14 }}>
            {s.bests.map((b, i) => b.song && <li key={i}><Link to={`/song/${encodeURIComponent(b.song.key)}`}>{b.song.title}</Link>{b.kind === 'lite' && <small>timing only</small>}<b>{b.total}</b></li>)}
          </ol>
          {!s.bests.length && <p className="empty">No scored songs yet.</p>}
        </section>
        <section>
          <h2>History</h2>
          <ul className="history" style={{ marginTop: 14 }}>
            {s.history.map((h, i) => h.song && (
              <li key={i}>
                <Link to={`/song/${encodeURIComponent(h.song.key)}`}>{h.song.title}</Link>
                <small>{h.mode !== 'solo' ? `${h.mode}${h.partner ? ` with ${h.partner}` : ''} · ` : ''}{new Date(h.at).toLocaleDateString()}</small>
                <b className="num">{h.total}</b>
              </li>
            ))}
          </ul>
          {!s.history.length && <p className="empty">Nothing sung yet.</p>}
          {s.duets.length > 0 && (
            <>
              <h3 style={{ marginTop: 24 }}>Duets</h3>
              <ul className="history" style={{ marginTop: 10 }}>
                {s.duets.map((h, i) => h.song && <li key={i}><Link to={`/song/${encodeURIComponent(h.song.key)}`}>{h.song.title}</Link><small>{h.partner ? `with ${h.partner}` : 'with a guest'}</small><b className="num">{h.total}</b></li>)}
              </ul>
            </>
          )}
        </section>
      </div>

      {d.isMe && d.favorites && (
        <section className="section">
          <div className="section-head"><h2>Saved songs</h2></div>
          <Shelf songs={d.favorites} empty="Save songs from their pages to find them here." />
        </section>
      )}
      {d.isMe && <Playlists />}
    </>
  );
}
