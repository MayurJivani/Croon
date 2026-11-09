// Microphone setup before scoring: what scoring can and cannot do, device choice, a quiet sample
// to set the noise gate, and a sung note to prove detection works.
import { useEffect, useState } from 'react';
import { Mic as MicIcon, X } from 'lucide-react';
import { Mic, listMics, savedCalibration } from '../audio/mic.ts';
import { Key } from './ui.tsx';
import { noteName } from '../../../../packages/core/src/lyrics.ts';

type Step = 'intro' | 'quiet' | 'sing' | 'done' | 'weak' | 'error';

export function Calibrate({ onReady, onClose }: { onReady(mic: Mic): void; onClose(): void }) {
  const saved = savedCalibration();
  const [step, setStep] = useState<Step>('intro');
  const [mics, setMics] = useState<{ id: string; label: string }[]>([]);
  const [device, setDevice] = useState<string | null>(saved?.deviceId ?? null);
  const [echo, setEcho] = useState(saved?.echo ?? true);
  const [level, setLevel] = useState(0);
  const [note, setNote] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mic] = useState(() => new Mic());

  useEffect(() => void listMics().then(setMics).catch(() => {}), [step]);

  // A saved setup is re-checked, shorter, never taken on trust: the room and the phone's position change.
  const run = async (dev = device, ec = echo, short = false) => {
    try {
      await mic.open(dev, ec);
      setStep('quiet');
      await mic.measureFloor(short ? 1000 : 2000);
      setStep('sing');
      const ratio = await mic.checkVoice(short ? 2000 : 3000, (l, m) => {
        setLevel(l);
        setNote(m);
      });
      if (ratio > 0.3) mic.remember(dev, ec);
      setStep(ratio > 0.3 ? 'done' : 'weak');
    } catch (e) {
      setErr((e as Error).message);
      setStep('error');
    }
  };

  return (
    <section className="calib" aria-labelledby="calib-h">
      <header>
        <h2 id="calib-h"><MicIcon size={18} aria-hidden /> Set up scoring</h2>
        <button className="icon-btn" onClick={() => { mic.close(); onClose(); }} aria-label="Close microphone setup"><X size={18} /></button>
      </header>
      {step === 'intro' && (
        <>
          <ul className="calib-facts">
            <li>Scoring listens for the pitch and timing of your voice through this device's microphone. It is an estimate for fun, not a vocal coach.</li>
            <li>Nothing is recorded or uploaded. Your phone turns sound into notes on the spot and only the notes are scored.</li>
            <li>Any octave counts, and the delay of your speakers or headphones is corrected for automatically.</li>
            <li>A loud room or the backing track coming through the mic can lower scores. Headphones or a phone held close help most.</li>
          </ul>
          {mics.length > 1 && (
            <label className="field">
              <span className="field-label">Microphone</span>
              <select value={device ?? ''} onChange={(e) => setDevice(e.target.value || null)}>
                <option value="">Default microphone</option>
                {mics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
          )}
          <label className="check"><input type="checkbox" checked={echo} onChange={(e) => setEcho(e.target.checked)} /> Cancel this device's own speakers (turn off if you sing through headphones and scores look low)</label>
          <div className="row">
            <Key tone="hot" onClick={() => run()} icon={<MicIcon size={16} />}>Calibrate (5 seconds)</Key>
            {saved && <Key onClick={() => run(saved.deviceId, saved.echo, true)}>Re-check my last setup (3 seconds)</Key>}
          </div>
        </>
      )}
      {step === 'quiet' && <p className="calib-step big">Stay quiet for a moment while Croon hears the room…</p>}
      {step === 'sing' && (
        <>
          <p className="calib-step big">Now sing one steady "laaa" until this changes.</p>
          <div className="meter" aria-hidden><i style={{ width: `${Math.min(100, level * 600)}%` }} /></div>
          <p className="calib-note">{note ? `Hearing ${noteName(Math.round(note))}` : 'Listening…'}</p>
        </>
      )}
      {step === 'done' && (
        <>
          <p className="calib-step big">Your voice comes through clearly.</p>
          <p className="calib-note">Mic delay {Math.round(mic.latency * 1000)} ms, corrected. Speaker delay is found while you sing.</p>
          <Key tone="hot" onClick={() => onReady(mic)}>I'm ready</Key>
        </>
      )}
      {step === 'weak' && (
        <>
          <p className="calib-step">Croon barely heard a steady note. Move closer to the mic, sing a little louder, or pick another microphone, then try again. If it will not pass, the host can turn scoring off for the night.</p>
          <div className="row">
            <Key tone="hot" onClick={() => setStep('intro')}>Try again</Key>
          </div>
        </>
      )}
      {step === 'error' && (
        <>
          <p className="calib-step" role="alert">{err}</p>
          <Key onClick={() => setStep('intro')}>Back</Key>
        </>
      )}
    </section>
  );
}
