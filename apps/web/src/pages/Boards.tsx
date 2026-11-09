import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SongMeta } from '../../../../packages/core/src/protocol.ts';
import { Avatar, Loading, Shelf, Toast } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useSession } from '../lib/session.tsx';

type Row = { username: string; display_name: string; avatar: { glyph: string; color: string }; score: number; songs: number };
type Weekly = { song: SongMeta | null; ends: string; rows: { username: string; display_name: string; avatar: { glyph: string; color: string }; total: number }[] };
const TABS = [['global', 'All time'], ['week', 'This week'], ['friends', 'Friends'], ['challenge', 'Weekly challenge']] as const;

export default function Boards() {
  const { user } = useSession();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('global');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [weekly, setWeekly] = useState<Weekly | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setErr(null);
    setRows(null);
    if (tab === 'challenge') api<Weekly>('/leaderboards/challenge').then(setWeekly).catch((e) => setErr(e.message));
    else if (tab === 'friends' && !user) setRows([]);
    else api<{ rows: Row[] }>(`/leaderboards/${tab}`).then((r) => setRows(r.rows)).catch((e) => setErr(e.message));
  }, [tab, user]);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Leaderboards</h1>
          <p>Ranked by the average of each singer's best score per song, over at least three songs, so singing well beats singing a lot. Scoring forgives octave and device delay, and every saved score is computed on the server from pitch, never sent as a number.</p>
        </div>
      </div>
      <div className="tabs" role="tablist" style={{ maxWidth: 640 }}>
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      <Toast msg={err} tone="error" />
      <div style={{ marginTop: 24, maxWidth: 760 }}>
        {tab === 'challenge' ? (weekly ? (
          <>
            {weekly.song && <Shelf songs={[weekly.song]} link={(s) => `/sing/${s.key}?challenge=1`} />}
            <p className="empty">One house band song a week, so everyone sings the same legal backing track. Closes {new Date(weekly.ends).toLocaleString(undefined, { weekday: 'long', hour: 'numeric' })}.</p>
            <ol className="board">{weekly.rows.map((r) => <li key={r.username}><Avatar a={r.avatar} size={28} /><Link to={`/u/${r.username}`}>{r.display_name}</Link><b>{r.total}</b></li>)}</ol>
            {!weekly.rows.length && <p className="empty">No entries yet this week.</p>}
          </>
        ) : <Loading />) : rows === null ? <Loading /> : (
          <>
            {tab === 'friends' && !user && <p className="empty"><Link to="/signin">Sign in</Link> and follow singers to see a friends ranking.</p>}
            <ol className="board">{rows.map((r) => <li key={r.username}><Avatar a={r.avatar} size={28} /><Link to={`/u/${r.username}`}>{r.display_name}</Link><small>{r.songs} songs</small><b>{r.score}</b></li>)}</ol>
            {!rows.length && (user || tab !== 'friends') && <p className="empty">{tab === 'friends' ? 'Follow singers from their profiles to build this board.' : tab === 'week' ? 'Nobody has scored three songs this week yet. Be first.' : 'Nobody has scored three songs yet. Be first.'}</p>}
          </>
        )}
      </div>
    </>
  );
}
