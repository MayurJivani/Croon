// The microphone, for scoring only. Audio is analysed here, on this device, into pitch frames
// (time + note). Nothing is recorded, uploaded or stored.
import { yin, rms, freqToMidi } from '../../../../packages/core/src/pitch.ts';
import { audioContext } from './engines.ts';

export type Calibration = { floor: number; deviceId: string | null; at: number; echo: boolean };
const KEY = 'croon:mic';

export function savedCalibration(): Calibration | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Calibration | null;
    return c && Date.now() - c.at < 30 * 86400_000 ? c : null;
  } catch {
    return null;
  }
}
const saveCalibration = (c: Calibration) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* private mode: calibrate again next time */
  }
};

export async function listMics() {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === 'audioinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
}

export class Mic {
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private buf = new Float32Array(2048);
  private timer: number | null = null;
  floor = 0.01;

  get active() {
    return !!this.stream;
  }

  async open(deviceId: string | null, echo = true) {
    this.close();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot use a microphone. Open Croon over https in a current browser.');
    try {
      // Echo cancellation strips this device's own speakers out of the mic; noise suppression and
      // auto gain stay off because both bend a sung pitch.
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: echo, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      const name = (e as DOMException).name;
      throw new Error(name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it in your browser settings to score.' : name === 'NotFoundError' ? 'No microphone found on this device.' : 'The microphone could not start.');
    }
    const ctx = audioContext();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    ctx.createMediaStreamSource(this.stream).connect(this.analyser);
  }

  /** One reading: loudness and, if voiced and clear, the MIDI pitch. */
  read(): { level: number; midi: number | null } {
    if (!this.analyser) return { level: 0, midi: null };
    this.analyser.getFloatTimeDomainData(this.buf);
    const level = rms(this.buf);
    if (level < Math.max(0.006, this.floor * 2.2)) return { level, midi: null };
    const p = yin(this.buf, this.analyser.context.sampleRate);
    return { level, midi: p && p.clarity > 0.82 ? freqToMidi(p.freq) : null };
  }

  /**
   * Calibration step one: two seconds of the room's own noise, so the gate sits above it.
   * Step two (the caller's) checks a sung note is detected.
   */
  async measureFloor(ms = 2000): Promise<number> {
    const levels: number[] = [];
    const end = performance.now() + ms;
    while (performance.now() < end) {
      levels.push(this.read().level);
      await new Promise((r) => setTimeout(r, 40));
    }
    levels.sort((a, b) => a - b);
    this.floor = levels[Math.floor(levels.length * 0.9)] ?? 0.01;
    return this.floor;
  }

  async checkVoice(ms = 3000, onLevel?: (l: number, midi: number | null) => void): Promise<number> {
    let voiced = 0, n = 0;
    const end = performance.now() + ms;
    while (performance.now() < end) {
      const r = this.read();
      onLevel?.(r.level, r.midi);
      n++;
      if (r.midi !== null) voiced++;
      await new Promise((res) => setTimeout(res, 40));
    }
    return n ? voiced / n : 0;
  }

  remember(deviceId: string | null, echo: boolean) {
    saveCalibration({ floor: this.floor, deviceId, at: Date.now(), echo });
  }

  /** Samples 25 times a second, handing each frame to `onFrame` with the song time it belongs to. */
  start(songTime: () => number, onFrame: (t: number, midi: number | null, level: number) => void) {
    this.stop();
    this.timer = window.setInterval(() => {
      const r = this.read();
      onFrame(songTime(), r.midi === null ? null : Math.round(r.midi * 100) / 100, r.level);
    }, 40);
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  close() {
    this.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.analyser = null;
  }
}
