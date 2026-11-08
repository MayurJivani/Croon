import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Shuffle } from 'lucide-react';
import type { SongMeta } from '../../../../packages/core/src/protocol.ts';
import { Shelf, langName, Key, Loading, Toast } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useNavigate } from 'react-router-dom';

type Facets = { genres: { name: string; total: number; playable: number }[]; languages: { code: string; total: number; playable: number }[] };
type Home = { trending: SongMeta[]; popular: SongMeta[]; recentlyAdded: SongMeta[]; recommended: SongMeta[]; crates: { id: string; name: string; blurb: string; playable: number; total: number }[] };
const FIELDS = [['all', 'Everything'], ['title', 'Title'], ['artist', 'Artist'], ['album', 'Album'], ['lyrics', 'Lyrics']] as const;

export default function Library() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const [facets, setFacets] = useState<Facets | null>(null);
  const [home, setHome] = useState<Home | null>(null);
  const [res, setRes] = useState<{ total: number; songs: SongMeta[] } | null>(null);
  const [crate, setCrate] = useState<{ name: string; blurb: string; songs: SongMeta[]; playable: number; total: number } | null>(null);
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const flag = (k: string) => sp.get(k) === '1';
  const set = (k: string, v: string | null) => {
    const n = new URLSearchParams(sp);
    if (v === null || v === '') n.delete(k);
    else n.set(k, v);
    n.delete('crate');
    setSp(n, { replace: true });
  };
  const searching = ['q', 'genre', 'language', 'playable', 'synced', 'scored'].some((k) => sp.get(k));
  const crateId = sp.get('crate');

  useEffect(() => {
    api<Facets>('/songs/facets').then(setFacets).catch(() => {});
    api<Home>('/songs/home').then(setHome).catch(() => {});
  }, []);

  useEffect(() => {
    if (crateId) {
      setLoading(true);
      api<typeof crate>(`/songs/crates/${crateId}`).then(setCrate).catch((e) => setErr(e.message)).finally(() => setLoading(false));
      return;
    }
    setCrate(null);
    if (!searching) return setRes(null);
    const p = new URLSearchParams(sp);
    p.set('limit', '40');
    setLoading(true);
    const t = setTimeout(() => api<{ total: number; songs: SongMeta[] }>(`/songs/search?${p}`).then(setRes).catch((e) => setErr(e.message)).finally(() => setLoading(false)), 180);
    return () => clearTimeout(t);
  }, [sp]); // eslint-disable-line react-hooks/exhaustive-deps

  // Typing updates the URL after a short pause, so the back button keeps searches.
  useEffect(() => {
    const t = setTimeout(() => q !== (sp.get('q') ?? '') && set('q', q.trim() || null), 250);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const more = async () => {
    if (!res) return;
    const p = new URLSearchParams(sp);
    p.set('limit', '40');
    p.set('offset', String(res.songs.length));
    const r = await api<{ total: number; songs: SongMeta[] }>(`/songs/search?${p}`);
    setRes({ total: r.total, songs: [...res.songs, ...r.songs] });
  };
  const random = async () => {
    const r = await api<{ song: SongMeta }>('/songs/random');
    nav(`/sing/${r.song.key}?challenge=1`);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>The library</h1>
          <p>Every song says what you will hear. Grey tapes are in the catalogue but still need a karaoke track before they can play.</p>
        </div>
        <div className="row">
          <Key onClick={random} icon={<Shuffle size={16} />}>Random challenge</Key>
          <Link to="/sing/file" className="key key-ghost key-md"><span>Sing your own file</span></Link>
        </div>
      </div>

      <div className="search-bar" role="search">
        <label className="q">
          <Search size={18} aria-hidden />
          <span className="sr-only">Search songs</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Song, artist, album or a line you remember" />
        </label>
        <select value={sp.get('field') ?? 'all'} onChange={(e) => set('field', e.target.value === 'all' ? null : e.target.value)} aria-label="Search in">
          {FIELDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="filters" role="group" aria-label="Filters">
        <button className="toggle" aria-pressed={flag('playable')} onClick={() => set('playable', flag('playable') ? null : '1')}>Has a karaoke track</button>
        <button className="toggle" aria-pressed={flag('synced')} onClick={() => set('synced', flag('synced') ? null : '1')}>Synced lyrics</button>
        <button className="toggle" aria-pressed={flag('scored')} onClick={() => set('scored', flag('scored') ? null : '1')}>Scoring</button>
        {searching && <button className="toggle" onClick={() => { setQ(''); setSp(new URLSearchParams(), { replace: true }); }}>Clear all</button>}
      </div>
      <div className="lib-mobile-filters">
        <select value={sp.get('genre') ?? ''} onChange={(e) => set('genre', e.target.value || null)} aria-label="Genre">
          <option value="">Any genre</option>
          {facets?.genres.map((g) => <option key={g.name} value={g.name}>{g.name} ({g.playable})</option>)}
        </select>
        <select value={sp.get('language') ?? ''} onChange={(e) => set('language', e.target.value || null)} aria-label="Language">
          <option value="">Any language</option>
          {facets?.languages.map((l) => <option key={l.code} value={l.code}>{langName(l.code)} ({l.playable})</option>)}
        </select>
        <select value={crateId ?? ''} onChange={(e) => setSp(new URLSearchParams(e.target.value ? { crate: e.target.value } : {}))} aria-label="Crate">
          <option value="">Crates…</option>
          {home?.crates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <Toast msg={err} tone="error" />

      <div className="lib-grid">
        <aside className="lib-side">
          <div>
            <h3>Genre</h3>
            <ul className="side-list">
              {facets?.genres.map((g) => (
                <li key={g.name}><button aria-pressed={sp.get('genre') === g.name} onClick={() => set('genre', sp.get('genre') === g.name ? null : g.name)}>{g.name} <small>{g.playable}/{g.total}</small></button></li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Language</h3>
            <ul className="side-list">
              {facets?.languages.map((l) => (
                <li key={l.code}><button aria-pressed={sp.get('language') === l.code} onClick={() => set('language', sp.get('language') === l.code ? null : l.code)}>{langName(l.code)} <small>{l.playable}/{l.total}</small></button></li>
              ))}
            </ul>
          </div>
          {home && (
            <div>
              <h3>Crates</h3>
              <ul className="side-list">
                {home.crates.map((c) => (
                  <li key={c.id}><button aria-pressed={crateId === c.id} onClick={() => setSp(new URLSearchParams({ crate: c.id }))}>{c.name} <small>{c.playable}</small></button></li>
                ))}
              </ul>
            </div>
          )}
        </aside>
        <div>
          {loading && !res && !crate && <Loading label="Flipping through the tapes" />}
          {crate && (
            <>
              <h2>{crate.name}</h2>
              <p className="result-count">{crate.blurb} {crate.playable} of {crate.total} ready to sing.</p>
              <Shelf songs={crate.songs} />
            </>
          )}
          {!crate && res && (
            <>
              <p className="result-count" aria-live="polite">{res.total.toLocaleString()} {res.total === 1 ? 'song' : 'songs'}</p>
              <Shelf songs={res.songs} empty={sp.get('field') === 'lyrics' ? 'No lyrics match. Lyric search covers house band songs and every song whose synced lyrics Croon has fetched.' : 'No songs match. Try fewer words or another filter.'} />
              {res.songs.length < res.total && <div className="more"><Key onClick={more}>Load more</Key></div>}
            </>
          )}
          {!crate && !searching && home && (
            <>
              {home.recommended.length > 0 && <section><div className="section-head"><h2>Picked for you</h2></div><Shelf songs={home.recommended.slice(0, 8)} /></section>}
              <section className="section"><div className="section-head"><h2>Trending this week</h2></div><Shelf songs={home.trending.slice(0, 10)} /></section>
              <section className="section"><div className="section-head"><h2>Popular karaoke</h2></div><Shelf songs={home.popular.slice(0, 10)} /></section>
              <section className="section"><div className="section-head"><h2>Recently added</h2></div><Shelf songs={home.recentlyAdded.slice(0, 10)} /></section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
