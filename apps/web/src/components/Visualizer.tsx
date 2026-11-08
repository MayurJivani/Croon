// Spectrum bars drawn from real audio. Only engines we can hear from (house band, files) have one;
// a YouTube video's audio is not readable, so nothing is invented for it.
import { useEffect, useRef } from 'react';

export function Visualizer({ analyser, kind = 'bars' }: { analyser: AnalyserNode | null; kind?: 'bars' | 'wave' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!analyser) return;
    const cv = ref.current!;
    const g = cv.getContext('2d')!;
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== w * dpr) {
        cv.width = w * dpr;
        cv.height = h * dpr;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      if (kind === 'bars') {
        analyser.getByteFrequencyData(data);
        const n = 48, bw = w / n;
        for (let i = 0; i < n; i++) {
          const v = data[Math.floor((i / n) ** 1.6 * data.length * 0.7)] / 255;
          const bh = Math.max(2, v * h);
          g.fillStyle = i % 3 === 0 ? '#ff4f2e' : i % 3 === 1 ? '#ffc23d' : '#2ec4b6';
          g.globalAlpha = 0.25 + v * 0.6;
          g.fillRect(i * bw + 1, h - bh, bw - 2, bh);
        }
      } else {
        analyser.getByteTimeDomainData(data);
        g.strokeStyle = '#ffc23d';
        g.globalAlpha = 0.7;
        g.lineWidth = 2;
        g.beginPath();
        for (let i = 0; i < data.length; i++) {
          const x = (i / data.length) * w, y = (data[i] / 255) * h;
          if (i) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser, kind]);
  return <canvas ref={ref} className={`viz viz-${kind}`} aria-hidden />;
}
