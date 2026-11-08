// Playback engines. One interface over three honest sources: the house band (synthesised here
// from note data), a YouTube karaoke video (official IFrame player), and a guest's own file.
// The player above them only ever asks for a song position; it never knows which engine runs.
import { compile, houseSong, type BandEvent, type Compiled } from '../../../../packages/core/src/houseband.ts';
import type { Source } from '../../../../packages/core/src/protocol.ts';

export interface Engine {
  readonly kind: Source['kind'];
  load(): Promise<{ duration: number }>;
  play(pos: number): void;
  pause(): void;
  /** Song position in seconds as the listener hears it. */
  position(): number;
  playing(): boolean;
  setVolume(v: number): void;
  /** Gentle speed nudge to absorb small drift without an audible jump (house band and files). */
  setRate(r: number): void;
  analyser: AnalyserNode | null;
  onEnded: (() => void) | null;
  destroy(): void;
}

let sharedCtx: AudioContext | null = null;
/** One AudioContext per page; browsers allow it to start only after a tap. */
export function audioContext() {
  sharedCtx ??= new AudioContext({ latencyHint: 'interactive' });
  if (sharedCtx.state === 'suspended') void sharedCtx.resume();
  return sharedCtx;
}

// ---- house band --------------------------------------------------------------------------

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

export class HouseEngine implements Engine {
  readonly kind = 'house' as const;
  private ctx = audioContext();
  private out = this.ctx.createGain();
  private guideBus = this.ctx.createGain();
  private bandBus = this.ctx.createGain();
  private reverb = this.ctx.createConvolver();
  private noise: AudioBuffer;
  private song: Compiled;
  private startAt = 0; // ctx time at which song position 0 would have played
  private next = 0; // index of the next event to schedule
  private live: AudioScheduledSourceNode[] = [];
  private timer: number | null = null;
  private endedFired = false;
  analyser: AnalyserNode;
  onEnded: (() => void) | null = null;

  constructor(slug: string) {
    const s = houseSong(slug);
    if (!s) throw new Error(`Unknown house band song ${slug}`);
    this.song = compile(s);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.guideBus.gain.value = 0.55;
    this.guideBus.connect(this.bandBus);
    this.bandBus.connect(comp);
    // A short synthetic room so the band does not sound like test tones.
    const len = this.ctx.sampleRate * 1.6;
    const ir = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    this.reverb.buffer = ir;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.18;
    this.bandBus.connect(this.reverb).connect(wet).connect(comp);
    comp.connect(this.out).connect(this.analyser).connect(this.ctx.destination);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  get compiled() {
    return this.song;
  }

  async load() {
    return { duration: this.song.duration };
  }

  /** The guide melody can be switched off for a pure instrumental. */
  setGuide(on: boolean) {
    this.guideBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.05);
  }

  play(pos: number) {
    this.stopVoices();
    this.ctx.resume();
    const lead = 0.06;
    this.startAt = this.ctx.currentTime + lead - pos;
    this.next = this.song.events.findIndex((e) => e.t + e.d > pos);
    if (this.next < 0) this.next = this.song.events.length;
    this.endedFired = false;
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  pause() {
    const p = this.position();
    this.stopVoices();
    this.startAt = -p; // frozen; position() reads it while paused
  }

  playing() {
    return this.timer !== null;
  }

  position() {
    if (this.timer === null) return Math.max(0, -this.startAt);
    const lat = this.ctx.outputLatency || this.ctx.baseLatency || 0;
    return Math.max(0, this.ctx.currentTime - this.startAt - lat);
  }

  setVolume(v: number) {
    this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }

  setRate() {
    // The synth schedules from the clock itself, so it is corrected by re-playing from the right position.
  }

  private schedule() {
    const horizon = this.ctx.currentTime + 0.2;
    const ev = this.song.events;
    while (this.next < ev.length && this.startAt + ev[this.next].t < horizon) {
      const e = ev[this.next++];
      const at = this.startAt + e.t;
      if (at >= this.ctx.currentTime - 0.02) this.voice(e, Math.max(at, this.ctx.currentTime));
    }
    if (this.next >= ev.length && this.ctx.currentTime - this.startAt > this.song.duration && !this.endedFired) {
      this.endedFired = true;
      this.stopVoices();
      this.startAt = -this.song.duration;
      this.onEnded?.();
    }
  }

  private env(g: GainNode, at: number, peak: number, attack: number, hold: number, release: number) {
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.setTargetAtTime(peak * 0.6, at + attack, hold / 3);
    g.gain.setTargetAtTime(0, at + hold, release);
  }

  private osc(type: OscillatorType, hz: number, at: number, end: number, dest: AudioNode, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = hz;
    o.detune.value = detune;
    o.connect(dest);
    o.start(at);
    o.stop(end);
    this.track(o);
    return o;
  }

  private track(n: AudioScheduledSourceNode) {
    this.live.push(n);
    n.onended = () => {
      const i = this.live.indexOf(n);
      if (i >= 0) this.live.splice(i, 1);
    };
  }

  private voice(e: BandEvent, at: number) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    switch (e.voice) {
      case 'lead': {
        g.connect(this.guideBus);
        this.env(g, at, 0.16 * e.vel, 0.02, Math.max(0.05, e.d), 0.06);
        const o = this.osc('triangle', midiHz(e.midi), at, at + e.d + 0.4, g);
        const vib = ctx.createOscillator();
        const vg = ctx.createGain();
        vib.frequency.value = 5.2;
        vg.gain.setValueAtTime(0, at);
        vg.gain.linearRampToValueAtTime(6, at + Math.min(0.6, e.d));
        vib.connect(vg).connect(o.detune);
        vib.start(at);
        vib.stop(at + e.d + 0.4);
        this.track(vib);
        break;
      }
      case 'keys': {
        g.connect(this.bandBus);
        this.env(g, at, 0.07 * e.vel, 0.008, Math.max(0.1, e.d), 0.25);
        this.osc('sine', midiHz(e.midi), at, at + e.d + 1, g);
        this.osc('triangle', midiHz(e.midi), at, at + e.d + 1, g, 7);
        break;
      }
      case 'bass': {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 420;
        g.connect(lp).connect(this.bandBus);
        this.env(g, at, 0.35 * e.vel, 0.01, Math.max(0.1, e.d * 0.8), 0.08);
        this.osc('sawtooth', midiHz(e.midi), at, at + e.d + 0.5, g);
        this.osc('sine', midiHz(e.midi), at, at + e.d + 0.5, g);
        break;
      }
      case 'kick': {
        g.connect(this.bandBus);
        g.gain.setValueAtTime(0.9 * e.vel, at);
        g.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
        const o = this.osc('sine', 120, at, at + 0.32, g);
        o.frequency.setValueAtTime(130, at);
        o.frequency.exponentialRampToValueAtTime(42, at + 0.25);
        break;
      }
      case 'snare':
      case 'hat':
      case 'click': {
        if (e.voice === 'click') {
          g.connect(this.out);
          g.gain.setValueAtTime(0.25 * e.vel, at);
          g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
          this.osc('square', e.vel > 0.9 ? 1760 : 1320, at, at + 0.06, g);
          break;
        }
        const f = ctx.createBiquadFilter();
        f.type = e.voice === 'hat' ? 'highpass' : 'bandpass';
        f.frequency.value = e.voice === 'hat' ? 7000 : 1800;
        g.connect(this.bandBus);
        f.connect(g);
        const len = e.voice === 'hat' ? 0.05 : 0.18;
        g.gain.setValueAtTime((e.voice === 'hat' ? 0.12 : 0.4) * e.vel, at);
        g.gain.exponentialRampToValueAtTime(0.001, at + len);
        const n = ctx.createBufferSource();
        n.buffer = this.noise;
        n.connect(f);
        n.start(at, Math.random() * 0.5);
        n.stop(at + len + 0.02);
        this.track(n);
        break;
      }
    }
  }

  private stopVoices() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    for (const n of this.live.splice(0)) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
  }

  destroy() {
    this.stopVoices();
    this.out.disconnect();
    this.analyser.disconnect();
  }
}

// ---- YouTube -------------------------------------------------------------------------------

type YTPlayer = {
  playVideo(): void; pauseVideo(): void; seekTo(s: number, allow: boolean): void; getCurrentTime(): number; getDuration(): number;
  getPlayerState(): number; setVolume(v: number): void; destroy(): void;
};
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, o: object) => YTPlayer; PlayerState: Record<string, number> };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApi: Promise<void> | null = null;
function loadYouTubeApi() {
  ytApi ??= new Promise<void>((resolve, reject) => {
    if (window.YT?.Player) return resolve();
    window.onYouTubeIframeAPIReady = () => resolve();
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => reject(new Error('Could not reach YouTube. Check your connection.'));
    document.head.appendChild(s);
  });
  return ytApi;
}

export class YouTubeEngine implements Engine {
  readonly kind = 'youtube' as const;
  private player: YTPlayer | null = null;
  private last = { t: 0, at: 0, playing: false };
  analyser = null; // a cross-origin player gives no access to its audio, so no visualiser is faked
  onEnded: (() => void) | null = null;
  private el: HTMLElement;
  private videoId: string;

  constructor(videoId: string, el: HTMLElement) {
    this.videoId = videoId;
    this.el = el;
  }

  async load() {
    await loadYouTubeApi();
    const host = document.createElement('div');
    this.el.replaceChildren(host);
    await new Promise<void>((resolve, reject) => {
      this.player = new window.YT!.Player(host, {
        videoId: this.videoId,
        host: 'https://www.youtube-nocookie.com',
        playerVars: { controls: 0, disablekb: 1, rel: 0, playsinline: 1, iv_load_policy: 3, modestbranding: 1, fs: 0 },
        events: {
          onReady: () => resolve(),
          onError: (e: { data: number }) => reject(new Error(e.data === 101 || e.data === 150 ? 'The owner of this video does not allow it to play here.' : 'This video could not be played.')),
          onStateChange: (e: { data: number }) => {
            if (e.data === 0) this.onEnded?.();
            this.last = { t: this.player!.getCurrentTime(), at: performance.now(), playing: e.data === 1 };
          },
        },
      });
    });
    // The duration arrives with the video's metadata, a moment after the player is ready.
    let d = this.player!.getDuration();
    for (let i = 0; i < 20 && !d; i++) {
      await new Promise((r) => setTimeout(r, 150));
      d = this.player!.getDuration();
    }
    return { duration: d || 0 };
  }

  play(pos: number) {
    this.player?.seekTo(pos, true);
    this.player?.playVideo();
    this.last = { t: pos, at: performance.now(), playing: true };
  }
  pause() {
    this.player?.pauseVideo();
    this.last = { t: this.position(), at: performance.now(), playing: false };
  }
  playing() {
    return this.last.playing;
  }
  position() {
    if (!this.player) return 0;
    // getCurrentTime updates coarsely; extrapolate from the last reading between updates.
    const now = performance.now();
    const raw = this.player.getCurrentTime();
    if (raw !== this.last.t) this.last = { ...this.last, t: raw, at: now };
    return this.last.playing ? this.last.t + (now - this.last.at) / 1000 : this.last.t;
  }
  setVolume(v: number) {
    this.player?.setVolume(Math.round(v * 100));
  }
  setRate() {
    // YouTube only offers coarse speed steps; drift is corrected by seeking instead.
  }
  destroy() {
    this.player?.destroy();
    this.player = null;
  }
}

// ---- a guest's own file ------------------------------------------------------------------

export class FileEngine implements Engine {
  readonly kind = 'file' as const;
  private audio = new Audio();
  analyser: AnalyserNode;
  onEnded: (() => void) | null = null;
  private url: string;

  constructor(url: string) {
    this.url = url;
    const ctx = audioContext();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.audio.preload = 'auto';
    this.audio.crossOrigin = 'anonymous';
    ctx.createMediaElementSource(this.audio).connect(this.analyser).connect(ctx.destination);
    this.audio.onended = () => this.onEnded?.();
  }

  async load() {
    this.audio.src = this.url;
    await new Promise<void>((resolve, reject) => {
      this.audio.onloadedmetadata = () => resolve();
      this.audio.onerror = () => reject(new Error('This browser cannot play that file. Try MP3 or M4A.'));
    });
    return { duration: this.audio.duration };
  }
  play(pos: number) {
    audioContext();
    this.audio.currentTime = pos;
    void this.audio.play();
  }
  pause() {
    this.audio.pause();
  }
  playing() {
    return !this.audio.paused;
  }
  position() {
    return this.audio.currentTime;
  }
  setVolume(v: number) {
    this.audio.volume = v;
  }
  setRate(r: number) {
    this.audio.playbackRate = r;
  }
  destroy() {
    this.audio.pause();
    this.audio.removeAttribute('src');
    URL.revokeObjectURL(this.url);
  }
}

export function makeEngine(src: Source, opts: { videoEl?: HTMLElement | null; fileUrl?: string }): Engine {
  if (src.kind === 'house') return new HouseEngine(src.slug);
  if (src.kind === 'youtube') {
    if (!opts.videoEl) throw new Error('A video needs somewhere to play.');
    return new YouTubeEngine(src.videoId, opts.videoEl);
  }
  if (!opts.fileUrl) throw new Error('That file is not loaded on this device.');
  return new FileEngine(opts.fileUrl);
}
