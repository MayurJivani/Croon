// The pitch lane: the song's target notes as bars, the singer's measured pitch as a line whose
// weight follows how sure the detector was. Octave-folded to match how the scorer listens.
import { useEffect, useRef } from 'react';
import type { Target } from '../../../../packages/core/src/lyrics.ts';

export type Trail = { t: number; m: number | null }[];

export function PitchLane({ targets, pos, trails, height = 72, colors = ['#ffc23d', '#2ec4b6'] }: { targets: Target[]; pos: () => number; trails: Trail[]; height?: number; colors?: string[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const g = cv.getContext('2d')!;
    let raf = 0;
    const lo = targets.length ? Math.min(...targets.map((x) => x.note)) - 2 : 55;
    const hi = targets.length ? Math.max(...targets.map((x) => x.note)) + 2 : 79;
    const span = Math.max(12, hi - lo);
    // Fold a sung note into the song's range, picking the octave closest to the nearest target.
    const fold = (m: number, near: number) => m + 12 * Math.round((near - m) / 12);
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== w * dpr) {
        cv.width = w * dpr;
        cv.height = h * dpr;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const t = pos();
      const back = 2.5, ahead = 5;
      const x = (s: number) => ((s - (t - back)) / (back + ahead)) * w;
      const y = (m: number) => h - 6 - ((m - lo) / span) * (h - 12);
      g.fillStyle = 'rgba(242,232,220,0.14)';
      for (const n of targets) {
        if (n.t + n.d < t - back || n.t > t + ahead) continue;
        const on = t >= n.t && t <= n.t + n.d;
        g.fillStyle = on ? 'rgba(242,232,220,0.42)' : 'rgba(242,232,220,0.16)';
        g.beginPath();
        g.roundRect(x(n.t), y(n.note) - 4, Math.max(4, x(n.t + n.d) - x(n.t) - 2), 8, 4);
        g.fill();
      }
      trails.forEach((trail, k) => {
        g.strokeStyle = colors[k % colors.length];
        g.lineCap = 'round';
        let prev: { X: number; Y: number } | null = null;
        for (const p of trail) {
          if (p.t < t - back) continue;
          if (p.m === null) {
            prev = null;
            continue;
          }
          const near = targets.find((n) => p.t >= n.t - 0.3 && p.t <= n.t + n.d + 0.3)?.note ?? (lo + hi) / 2;
          const pt = { X: x(p.t), Y: y(fold(p.m, near)) };
          if (prev && pt.X - prev.X < 18) {
            g.lineWidth = 3.5;
            g.beginPath();
            g.moveTo(prev.X, prev.Y);
            g.lineTo(pt.X, pt.Y);
            g.stroke();
          }
          prev = pt;
        }
      });
      g.fillStyle = 'rgba(255,211,107,0.8)';
      g.fillRect(x(t) - 1, 0, 2, h);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [targets, pos, trails, colors]);
  return <canvas ref={ref} className="pitch-lane" style={{ height }} aria-label="Pitch lane: target notes and your sung pitch" role="img" />;
}
