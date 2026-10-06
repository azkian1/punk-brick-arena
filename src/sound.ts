import { assetUrl } from './assets/url';

type SoundKind = 'shot' | 'hit' | 'pickup' | 'cascade' | 'win' | 'lose';
type SampleKind = 'shot' | 'hit' | 'cascade';
const SAMPLE_URLS: Record<SampleKind, string> = {
  shot: assetUrl('audio/gunshot.wav'),
  hit: assetUrl('audio/impact.ogg'),
  cascade: assetUrl('audio/debris.ogg'),
};

export class Sound {
  muted = false;
  private ctx: AudioContext | null = null;
  private output: DynamicsCompressorNode | null = null;
  private buffers = new Map<SampleKind, AudioBuffer>();
  private decoding: Promise<void> | null = null;
  // Fetch locally on the lobby; create/resume audio only after a user gesture.
  private encoded = Promise.all(Object.entries(SAMPLE_URLS).map(async ([kind, url]) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Audio asset unavailable: ${url}`);
    return [kind as SampleKind, await response.arrayBuffer()] as const;
  })).catch(error => {
    console.warn('Could not load combat sounds', error);
    return [];
  });

  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.output = this.ctx.createDynamicsCompressor();
      this.output.threshold.value = -12;
      this.output.knee.value = 16;
      this.output.ratio.value = 4;
      this.output.attack.value = 0.003;
      this.output.release.value = 0.15;
      this.output.connect(this.ctx.destination);
    }
    void this.ctx.resume();
    this.decoding ??= this.encoded.then(async entries => {
      await Promise.all(entries.map(async ([kind, bytes]) => {
        this.buffers.set(kind, await this.ctx!.decodeAudioData(bytes));
      }));
    }).catch(error => console.warn('Could not decode combat sounds', error));
  }

  play(kind: SoundKind, volume = 1) {
    if (this.muted || !this.ctx || !this.output || this.ctx.state !== 'running') return;
    const ctx = this.ctx, time = ctx.currentTime;
    if (kind === 'shot' || kind === 'hit' || kind === 'cascade') {
      const buffer = this.buffers.get(kind);
      if (!buffer) return;
      const source = ctx.createBufferSource(), gain = ctx.createGain();
      source.buffer = buffer;
      source.playbackRate.value = (kind === 'cascade' ? 0.78 : 1) * (0.96 + Math.random() * 0.08);
      gain.gain.value = volume * (kind === 'shot' ? 0.7 : kind === 'hit' ? 0.65 : 0.45);
      source.connect(gain); gain.connect(this.output);
      source.start(time);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      return;
    }
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    const table = { pickup: [660, 980, 0.075, 0.022], win: [480, 960, 0.6, 0.06], lose: [200, 55, 0.6, 0.045] };
    const [start, end, duration, level] = table[kind];
    osc.type = kind === 'lose' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(start, time); osc.frequency.exponentialRampToValueAtTime(end, time + duration);
    gain.gain.setValueAtTime(level * volume, time); gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(gain); gain.connect(this.output); osc.start(time); osc.stop(time + duration);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
}
