import type { LyricPrefs } from '../lib/lyrics.ts';

const STYLES: [LyricPrefs['style'], string][] = [['classic', 'Classic wipe'], ['word', 'Word by word'], ['line', 'Line'], ['cinematic', 'Cinematic'], ['dual', 'Two-line']];

export function LyricSettings({ prefs, set, hasRoman, hasTranslation, wordTimed }: { prefs: LyricPrefs; set(p: Partial<LyricPrefs>): void; hasRoman: boolean; hasTranslation: boolean; wordTimed: boolean }) {
  return (
    <>
      <div>
        <h3>Lyric style</h3>
        <div className="seg" role="group" aria-label="Lyric style">
          {STYLES.map(([v, l]) => <button key={v} aria-pressed={prefs.style === v} onClick={() => set({ style: v })} disabled={!wordTimed && (v === 'classic' || v === 'word')} title={!wordTimed && (v === 'classic' || v === 'word') ? 'Needs word-timed lyrics' : undefined}>{l}</button>)}
        </div>
      </div>
      <label className="range-row">
        <span>Size</span>
        <input type="range" min={0.6} max={1.8} step={0.1} value={prefs.size} onChange={(e) => set({ size: Number(e.target.value) })} aria-label="Lyric size" />
        <span className="num">{Math.round(prefs.size * 100)}%</span>
      </label>
      <div>
        <h3>Position</h3>
        <div className="seg" role="group" aria-label="Lyric position">
          {(['top', 'middle', 'bottom'] as const).map((p) => <button key={p} aria-pressed={prefs.position === p} onClick={() => set({ position: p })}>{p[0].toUpperCase() + p.slice(1)}</button>)}
        </div>
      </div>
      {hasRoman && <label className="check"><input type="checkbox" checked={prefs.roman} onChange={(e) => set({ roman: e.target.checked })} /> Show romanisation</label>}
      {hasTranslation && <label className="check"><input type="checkbox" checked={prefs.translation} onChange={(e) => set({ translation: e.target.checked })} /> Show English translation</label>}
    </>
  );
}
