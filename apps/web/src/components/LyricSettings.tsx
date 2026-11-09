import type { LyricPrefs } from '../lib/lyrics.ts';

const STYLES: [LyricPrefs['style'], string][] = [['classic', 'Classic wipe'], ['word', 'Word by word'], ['line', 'Line'], ['cinematic', 'Cinematic'], ['dual', 'Two-line']];

export function LyricSettings({ prefs, set, hasRoman, hasTranslation, wordTimed, note }: { prefs: LyricPrefs; set(p: Partial<LyricPrefs>): void; hasRoman: boolean; hasTranslation: boolean; wordTimed: boolean; note?: string | null }) {
  return (
    <>
      <div>
        <h3>Lyric style</h3>
        <div className="seg" role="group" aria-label="Lyric style">
          {STYLES.map(([v, l]) => <button key={v} aria-pressed={prefs.style === v} onClick={() => set({ style: v })}>{l}</button>)}
        </div>
        {!wordTimed && <p className="field-hint" style={{ marginTop: 6 }}>This song is timed by line, so the fill follows an estimated singing pace.</p>}
      </div>
      {hasRoman && (
        <div>
          <h3>Lyrics in</h3>
          <div className="seg" role="group" aria-label="Lyrics in">
            <button aria-pressed={prefs.script === 'latin'} onClick={() => set({ script: 'latin' })}>English letters</button>
            <button aria-pressed={prefs.script === 'original'} onClick={() => set({ script: 'original' })}>Original script</button>
          </div>
          <label className="check" style={{ marginTop: 8 }}><input type="checkbox" checked={prefs.roman} onChange={(e) => set({ roman: e.target.checked })} /> Show the other script below</label>
        </div>
      )}
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
      {hasTranslation && <label className="check"><input type="checkbox" checked={prefs.translation} onChange={(e) => set({ translation: e.target.checked })} /> Show English translation</label>}
      {hasTranslation && prefs.translation && note && <p className="field-hint">{note}</p>}
    </>
  );
}
