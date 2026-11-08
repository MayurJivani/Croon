// The timeline as tape: lit counter digits and a band of brown tape that fills marigold as it plays.
// Interactive for whoever controls playback, read-only for everyone else.
import { fmtTime } from './ui.tsx';

function Digits({ s, label }: { s: number; label: string }) {
  const text = fmtTime(Math.max(0, s));
  return (
    <span className="tape-digits num" aria-label={`${label} ${text}`}>
      {text.split('').map((ch, i) => (ch === ':' ? <i key={i}>:</i> : <b key={i}>{ch}</b>))}
    </span>
  );
}

export function TapeScrub({ pos, total, onSeek }: { pos: number; total: number; onSeek?: (s: number) => void }) {
  const pct = total ? Math.min(100, (Math.max(0, pos) / total) * 100) : 0;
  return (
    <div className="tape-scrub" style={{ '--played': `${pct}%` } as React.CSSProperties}>
      <Digits s={pos} label="Elapsed" />
      {onSeek ? (
        <input type="range" className="tape-band" min={0} max={Math.max(1, total)} step={0.1} value={Math.min(pos, total)} onChange={(e) => onSeek(Number(e.target.value))} aria-label="Seek" />
      ) : (
        <div className="tape-band" role="progressbar" aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={Math.round(pos)} aria-label="Song progress" />
      )}
      <Digits s={total} label="Length" />
    </div>
  );
}
