// The cassette world's small parts: deck keys, tape spines, source labels, avatars.
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Mic, Music, Star, Heart, Moon, Sun, Zap, Flame, Crown, Guitar, Drum, Headphones, type LucideIcon } from 'lucide-react';
import { SOURCE_LABEL } from '../../../../packages/core/src/labels.ts';
import type { Avatar as AvatarT, SongMeta, Source } from '../../../../packages/core/src/protocol.ts';
import { noteName } from '../../../../packages/core/src/lyrics.ts';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

const GLYPHS: Record<string, LucideIcon> = { mic: Mic, music: Music, star: Star, heart: Heart, moon: Moon, sun: Sun, zap: Zap, flame: Flame, crown: Crown, guitar: Guitar, drum: Drum, headphones: Headphones };

export function Avatar({ a, size = 36, ring, label }: { a: AvatarT; size?: number; ring?: boolean; label?: string }) {
  const Icon = GLYPHS[a.glyph] ?? Mic;
  return (
    <span className={`avatar${ring ? ' ring' : ''}`} style={{ width: size, height: size, background: a.color, '--ring': a.color } as React.CSSProperties} role={label ? 'img' : undefined} aria-label={label}>
      <Icon size={size * 0.52} strokeWidth={2.4} aria-hidden />
    </span>
  );
}
export const AVATAR_ICONS = GLYPHS;

type KeyProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'hot' | 'plain' | 'ghost' | 'card'; size?: 'sm' | 'md' | 'lg'; down?: boolean; icon?: ReactNode };
/** A tape-deck key: sinks when pressed, stays down while its state is on. */
export function Key({ tone = 'plain', size = 'md', down, icon, children, className = '', ...rest }: KeyProps) {
  return (
    <button {...rest} className={`key key-${tone} key-${size}${down ? ' is-down' : ''} ${className}`} aria-pressed={down === undefined ? undefined : down}>
      {icon}
      {children && <span>{children}</span>}
    </button>
  );
}

export function KeyLink({ to, tone = 'plain', size = 'md', icon, children }: { to: string; tone?: KeyProps['tone']; size?: KeyProps['size']; icon?: ReactNode; children: ReactNode }) {
  return (
    <Link to={to} className={`key key-${tone} key-${size}`}>
      {icon}
      <span>{children}</span>
    </Link>
  );
}

const GENRE_INK: Record<string, string> = {
  Bollywood: 'var(--tomato)', Punjabi: 'var(--marigold)', 'K-Pop': 'var(--rose)', 'J-Pop': 'var(--rose)', Rock: 'var(--tomato)', Pop: 'var(--teal)', 'Hip-Hop': 'var(--marigold)',
  Latin: 'var(--marigold)', 'R&B and Soul': 'var(--plum)', Indie: 'var(--teal)', 'Indian Indie': 'var(--teal)', Ghazal: 'var(--plum)', Classics: 'var(--teal)', Gospel: 'var(--teal)',
  Folk: 'var(--teal)', Holiday: 'var(--tomato)', Classical: 'var(--plum)', Soundtrack: 'var(--plum)', 'Indian Film': 'var(--marigold)', Jazz: 'var(--plum)', Metal: 'var(--tomato)',
};
export const genreInk = (g: string) => GENRE_INK[g] ?? 'var(--teal)';

export function sourceLabel(s: Source | undefined) {
  if (!s) return 'Needs a karaoke track';
  if (s.kind === 'house') return SOURCE_LABEL.house;
  if (s.kind === 'file') return SOURCE_LABEL.file;
  return SOURCE_LABEL[s.label];
}

export function SourceTag({ song }: { song: SongMeta }) {
  const s = song.sources[0];
  return <span className={`src-tag${s ? '' : ' none'}${s?.kind === 'youtube' && s.label === 'original' ? ' warn' : ''}`}>{sourceLabel(s)}{song.scoring === 'full' && <span className="tag-extra"> · pitch scored</span>}</span>;
}

const LANG: Record<string, string> = { en: 'English', hi: 'Hindi', pa: 'Punjabi', ko: 'Korean', ja: 'Japanese', es: 'Spanish', ta: 'Tamil', other: 'Other' };
export const langName = (c: string) => LANG[c] ?? c;
export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const rangeText = (r?: [number, number] | null) => (r ? `${noteName(r[0])} to ${noteName(r[1])}` : null);

/** One song as a tape spine on the shelf. */
export function Spine({ song, to, right, i = 0, onClick }: { song: SongMeta; to?: string; right?: ReactNode; i?: number; onClick?: () => void }) {
  const playable = song.sources.length > 0;
  const inner = (
    <>
      <i className="spine-band" style={{ background: playable ? genreInk(song.genre) : undefined }} />
      <b className="spine-title">{song.title}</b>
      <span className="spine-artist">{song.artist}</span>
      <span className="spine-meta">
        <span className="spine-facts">{langName(song.language)}{song.year ? ` · ${song.year}` : ''}</span>
        <SourceTag song={song} />
        {right}
      </span>
    </>
  );
  const cls = `spine${playable ? '' : ' dim'}`;
  return (
    <motion.li initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.03, duration: 0.32, ease: [0.22, 1, 0.36, 1] }} className="spine-li">
      {to ? <Link to={to} className={cls}>{inner}</Link> : onClick ? <button type="button" onClick={onClick} className={cls}>{inner}</button> : <div className={cls}>{inner}</div>}
    </motion.li>
  );
}

export function Shelf({ songs, link = (s: SongMeta) => `/song/${encodeURIComponent(s.key)}`, empty }: { songs: SongMeta[]; link?: (s: SongMeta) => string; empty?: ReactNode }) {
  if (!songs.length) return <p className="empty">{empty ?? 'Nothing on this shelf yet.'}</p>;
  return <ul className="shelf">{songs.map((s, i) => <Spine key={s.key} song={s} to={link(s)} i={i} />)}</ul>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Toast({ msg, tone = 'info' }: { msg: string | null; tone?: 'info' | 'error' }) {
  return msg ? <p className={`toast toast-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{msg}</p> : null;
}

/** Reels that turn at tape speed while `spinning`. */
export function Reel({ spinning, size = 86 }: { spinning: boolean; size?: number }) {
  return (
    <svg className={`reel${spinning ? ' spin' : ''}`} width={size} height={size} viewBox="0 0 86 86" aria-hidden>
      <circle cx="43" cy="43" r="40" fill="var(--card-2)" />
      <circle cx="43" cy="43" r="14" fill="var(--shell-0)" />
      <g fill="var(--shell-0)">
        {[0, 60, 120, 180, 240, 300].map((r) => <rect key={r} x="40" y="6" width="6" height="18" rx="2" transform={`rotate(${r} 43 43)`} />)}
      </g>
    </svg>
  );
}

export function Loading({ label = 'Rewinding the tape' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <Reel spinning size={40} />
      <Reel spinning size={40} />
      <span>{label}…</span>
    </div>
  );
}
