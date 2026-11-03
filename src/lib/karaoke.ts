// Karaoke engine: synthesizes the melody (soft piano-ish voice + bass + light click) with Web Audio
// and, if the singer allows the mic, measures how much of each note they actually sang.
// Mic audio is analysed locally and never recorded or sent anywhere.
import { karaokeScore, midiToHz, schedule, songLength, type Song, type TimedNote } from "../../shared/songs";

export interface KaraokeFrame { t: number; line: number; index: number; voiced: boolean; done: boolean }

export class KaraokePlayer {
  private ctx: AudioContext;
  private master: GainNode;
  private notes: TimedNote[];
  private t0 = 0;
  private raf = 0;
  private mic: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private buf = new Float32Array(1024);
  private voiced = 0;
  private last = 0;
  readonly length: number;

  constructor(private song: Song, private onFrame: (f: KaraokeFrame) => void) {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.notes = schedule(song);
    this.length = songLength(song);
  }

  /** Must be called from a user gesture (tap/keypress) so audio is allowed to start. */
  async start(withMic: boolean) {
    await this.ctx.resume();
    if (withMic) {
      try {
        this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        const src = this.ctx.createMediaStreamSource(this.mic);
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        src.connect(this.analyser); // analysis only: not routed to the speakers
      } catch { this.mic = null; }
    }
    this.t0 = this.ctx.currentTime + 0.15;
    const spb = 60 / this.song.bpm;
    for (const n of this.notes) {
      this.voice(midiToHz(n.midi), this.t0 + n.start, n.dur);
      if (n.dur >= spb * 0.99) this.voice(midiToHz(n.midi - 12), this.t0 + n.start, n.dur, 0.12, "sine"); // bass
    }
    for (let b = 0; b * spb < this.length - 1; b++) this.click(this.t0 + 2 + b * spb, b % 4 === 0);
    this.last = performance.now();
    this.loop();
    return !!this.mic;
  }

  get micOn() { return !!this.mic; }

  private voice(hz: number, at: number, dur: number, vol = 0.22, type: OscillatorType = "triangle") {
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o2.type = "sine";
    o.frequency.value = hz;
    o2.frequency.value = hz * 2;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.25;
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(this.master);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.015);
    g.gain.exponentialRampToValueAtTime(vol * 0.45, at + Math.min(0.3, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur * 0.98);
    o.start(at); o2.start(at);
    o.stop(at + dur); o2.stop(at + dur);
  }

  private click(at: number, accent: boolean) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.value = accent ? 1600 : 1100;
    g.gain.setValueAtTime(accent ? 0.05 : 0.025, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
    o.connect(g).connect(this.master);
    o.start(at);
    o.stop(at + 0.05);
  }

  private loop = () => {
    const t = this.ctx.currentTime - this.t0;
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    let idx = this.notes.findIndex((n) => t >= n.start && t < n.start + n.dur);
    if (idx < 0) idx = t < (this.notes[0]?.start ?? 0) ? -1 : this.notes.findIndex((n) => n.start > t) - 1;
    const cur = idx >= 0 ? this.notes[idx] : null;
    let voiced = false;
    if (this.analyser) {
      this.analyser.getFloatTimeDomainData(this.buf);
      let sum = 0;
      for (const v of this.buf) sum += v * v;
      voiced = Math.sqrt(sum / this.buf.length) > 0.02;
      if (voiced && cur && t < cur.start + cur.dur) this.voiced += Math.min(dt, 0.1);
    }
    const done = t >= this.length;
    this.onFrame({ t, line: cur ? cur.line : 0, index: cur && t >= cur.start ? cur.index : -1, voiced, done });
    if (!done) this.raf = requestAnimationFrame(this.loop);
    else this.cleanup();
  };

  /** 0..100 when the mic was on, otherwise null. */
  score(): number | null { return this.analyser ? karaokeScore(this.voiced, this.notes) : null; }

  stop() { cancelAnimationFrame(this.raf); this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); this.cleanup(); }
  private cleanup() {
    this.mic?.getTracks().forEach((tr) => tr.stop());
    this.mic = null;
    setTimeout(() => this.ctx.close().catch(() => {}), 300);
  }
}
