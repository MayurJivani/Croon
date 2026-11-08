// The lyric display. React renders only when the current line changes; the word wipe itself is
// written straight to CSS variables every animation frame, so highlighting tracks the audio clock
// rather than React's render timing.
import { useEffect, useRef, useState } from 'react';
import { lineAt, joinWords, wordProgress, type Line, type Lyrics as L } from '../../../../packages/core/src/lyrics.ts';
import type { LyricPrefs } from '../lib/lyrics.ts';

type Props = {
  lyrics: L;
  pos: () => number;
  prefs: LyricPrefs;
  /** Duet: which part this viewer sings (lines for the other part are shown dimmer). */
  myPart?: number;
  /** Duet colours on: each part has its own ink. */
  parts?: boolean;
  variant?: 'stage' | 'phone' | 'player';
  /** Sync mode: tapping a line means "this line is being sung right now". */
  onPickLine?: (lineIndex: number) => void;
};

const partClass = (l: Line, parts?: boolean) => (parts ? (l.part === 1 ? 'p1' : l.part === 2 ? 'p2' : 'pboth') : '');

/** Timed pieces grouped into words: "Hap-" and "py" are two timed pieces of one unbreakable word. */
function words(l: Line) {
  const out: { text: string; idx: number }[][] = [];
  let cur: { text: string; idx: number }[] = [];
  l.words.forEach((w, i) => {
    cur.push({ text: w.text.replace(/-$/, ''), idx: i });
    if (!w.text.endsWith('-')) {
      out.push(cur);
      cur = [];
    }
  });
  if (cur.length) out.push(cur);
  return out;
}

function LineView({ line, li, active, state, prefs, parts, myPart, onPick }: { line: Line; li: number; active: boolean; state: 'past' | 'now' | 'next'; prefs: LyricPrefs; parts?: boolean; myPart?: number; onPick?: (i: number) => void }) {
  const mine = !myPart || !line.part || line.part === myPart;
  const roman = prefs.roman && line.words.some((w) => w.roman);
  return (
    <div className={`lyr-line ${state} ${partClass(line, parts)} ${mine ? '' : 'theirs'}${onPick ? ' pickable' : ''}`} data-active={active || undefined} data-line={li}
      {...(onPick ? { role: 'button', tabIndex: 0, title: 'Tap the moment this line is sung', onClick: () => onPick(li), onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(li)) } : {})}>
      <div className="lyr-text">
        {words(line).map((word) => (
          <span key={word[0].idx} className="word">
            {word.map((w) => (
              <span key={w.idx} className="w" data-w={w.idx} data-text={w.text}>
                {w.text}
              </span>
            ))}
          </span>
        ))}
      </div>
      {roman && <div className="lyr-roman">{joinWords(line.words.map((w) => w.roman ?? ''))}</div>}
      {prefs.translation && line.translation && <div className="lyr-trans">{line.translation}</div>}
    </div>
  );
}

export function Lyrics({ lyrics, pos, prefs, myPart, parts, variant = 'player', onPickLine }: Props) {
  const [idx, setIdx] = useState(-1);
  const [count, setCount] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const idxRef = useRef(-1);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = pos();
      const i = lineAt(lyrics, t);
      // Count-in dots before a line that follows a gap of four seconds or more.
      const next = lyrics.lines[i + 1];
      const prevEnd = i >= 0 ? lyrics.lines[i].end : 0;
      const gapAhead = next && next.t - Math.max(prevEnd, t) <= 3 && next.t - prevEnd >= 4 && t >= prevEnd ? Math.ceil(next.t - t) : 0;
      setCount(gapAhead);
      if (i !== idxRef.current) {
        idxRef.current = i;
        setIdx(i);
      }
      // The DOM can still hold the previous line for a frame after the index moves on.
      const el = root.current?.querySelector<HTMLElement>(`.lyr-line[data-active][data-line="${i}"]`);
      const line = lyrics.lines[i];
      if (el && line) {
        const ws = el.querySelectorAll<HTMLElement>('.w');
        ws.forEach((node) => {
          const w = line.words[Number(node.dataset.w)];
          if (!w) return;
          const p = lyrics.wordTimed ? wordProgress(w, t) : t >= line.t ? 1 : 0;
          node.style.setProperty('--p', `${(p * 100).toFixed(1)}%`);
          node.classList.toggle('sung', p >= 1);
          node.classList.toggle('on', p > 0);
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lyrics, pos]);

  const style = !lyrics.wordTimed && (prefs.style === 'classic' || prefs.style === 'word') ? 'line' : prefs.style;
  const ls = lyrics.lines;
  const cur = Math.max(0, idx);
  const nowLine = idx >= 0 && ls[idx] ? ls[idx] : null;
  const upcoming = idx < 0 ? ls[0] : ls[idx + 1];

  let body;
  if (style === 'dual') {
    // Karaoke-machine style: two fixed slots that alternate, so the eye never chases a moving line.
    const top = cur % 2 === 0 ? ls[cur] : ls[cur + 1];
    const bottom = cur % 2 === 0 ? ls[cur + 1] : ls[cur];
    body = (
      <div className="lyr-dual">
        {[top, bottom].map((l) => l && <LineView key={`${ls.indexOf(l)}`} line={l} li={ls.indexOf(l)} active={l === nowLine} state={l === nowLine ? 'now' : 'next'} prefs={prefs} parts={parts} myPart={myPart} onPick={onPickLine} />)}
        {!top && !bottom && <div className="lyr-line next" />}
      </div>
    );
  } else if (style === 'cinematic') {
    body = nowLine ? <LineView key={idx} line={nowLine} li={ls.indexOf(nowLine)} active state="now" prefs={prefs} parts={parts} myPart={myPart} onPick={onPickLine} /> : upcoming && <LineView key={`n${idx}`} line={upcoming} li={ls.indexOf(upcoming)} active={false} state="next" prefs={prefs} parts={parts} myPart={myPart} onPick={onPickLine} />;
  } else {
    body = (
      <>
        {idx > 0 && <LineView key={idx - 1} line={ls[idx - 1]} li={ls.indexOf(ls[idx - 1])} active={false} state="past" prefs={prefs} parts={parts} myPart={myPart} onPick={onPickLine} />}
        {nowLine && <LineView key={idx} line={nowLine} li={ls.indexOf(nowLine)} active state="now" prefs={prefs} parts={parts} myPart={myPart} onPick={onPickLine} />}
        {upcoming && <LineView key={idx + 1} line={upcoming} li={ls.indexOf(upcoming)} active={false} state="next" prefs={prefs} parts={parts} myPart={myPart} onPick={onPickLine} />}
        {variant !== 'phone' && ls[idx + 2] && <LineView key={idx + 2} line={ls[idx + 2]} li={ls.indexOf(ls[idx + 2])} active={false} state="next" prefs={prefs} parts={parts} myPart={myPart} onPick={onPickLine} />}
      </>
    );
  }

  return (
    <div ref={root} className={`lyrics v-${variant} s-${style} at-${prefs.position}`} style={{ '--lyr-scale': prefs.size } as React.CSSProperties} aria-live="off">
      <div className="lyr-count" aria-hidden>{[3, 2, 1].map((n) => <i key={n} className={count >= n ? 'lit' : ''} />)}</div>
      {body}
      {!lyrics.wordTimed && <p className="lyr-note">Line-timed lyrics: whole lines light up, because word timing is not available for this song.</p>}
    </div>
  );
}
