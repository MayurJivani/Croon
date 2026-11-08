// The score reveal: categories tick up one after another, then the grade stamps onto the J-card.
import { animate, motion, useMotionValue, useTransform, useReducedMotion } from 'motion/react';
import { useEffect } from 'react';
import { GRADE_NAME, type Score } from '../../../../packages/core/src/scoring.ts';

function Count({ to, delay }: { to: number; delay: number }) {
  const v = useMotionValue(0);
  const shown = useTransform(v, (x) => Math.round(x));
  const reduce = useReducedMotion();
  useEffect(() => {
    const c = animate(v, to, { duration: reduce ? 0 : 1.1, delay: reduce ? 0 : delay, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [to, delay, v, reduce]);
  return <motion.span>{shown}</motion.span>;
}

export function ScoreReveal({ score, name, best, isBest, compact }: { score: Score; name?: string; best?: number | null; isBest?: boolean; compact?: boolean }) {
  const rows: [string, number | null][] = [
    ['Pitch', score.pitch],
    ['Timing', score.timing],
    ['Steadiness', score.stability],
    ['Completion', score.completion],
  ];
  return (
    <div className={`reveal${compact ? ' compact' : ''}`}>
      {name && <p className="reveal-name">{name}</p>}
      <div className="reveal-card">
        <div className="reveal-total">
          <Count to={score.total} delay={rows.length * 0.25} />
          <small>/100</small>
        </div>
        <motion.div className={`reveal-grade g-${score.grade}`} initial={{ scale: 2.4, opacity: 0, rotate: -14 }} animate={{ scale: 1, opacity: 1, rotate: -6 }} transition={{ delay: rows.length * 0.25 + 1.0, type: 'spring', stiffness: 380, damping: 18 }}>
          <b>{score.grade}</b>
          <span>{GRADE_NAME[score.grade]}</span>
        </motion.div>
        <ul className="reveal-rows">
          {rows.map(([k, v], i) => (
            <li key={k} className={v === null ? 'na' : ''}>
              <span>{k}</span>
              <i style={{ '--w': `${v ?? 0}%`, '--d': `${i * 0.25}s` } as React.CSSProperties} />
              <b>{v === null ? 'n/a' : <Count to={v} delay={i * 0.25} />}</b>
            </li>
          ))}
        </ul>
      </div>
      <p className="reveal-foot">
        {score.kind === 'lite' ? 'Lite scoring: this song has no melody data, so pitch is not judged. Timing, steadiness and completion only.' : 'Scored against the melody, any octave.'}
        {score.offsetMs !== 0 && ` Your device's ${Math.abs(score.offsetMs)} ms delay was corrected for.`}
        {isBest ? ' New personal best.' : best != null ? ` Personal best: ${best}.` : ''}
      </p>
    </div>
  );
}
