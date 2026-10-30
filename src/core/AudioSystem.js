import * as THREE from 'three';

const BASE = import.meta.env.BASE_URL + 'audio/';

/**
 * Loops seamlessly: every frequency is snapped to a whole number of cycles
 * over the buffer length, so the end meets the start exactly.
 */
function makePad(ctx, freqs, seconds = 16) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, n, sr);
  const snap = (f) => Math.max(1, Math.round(f * seconds)) / seconds;
  const voices = freqs.map((f, k) => ({ f: snap(f), lfo: snap(0.06 + k * 0.035), ph: k * 1.7 }));
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const detune = ch === 0 ? 0 : 1 / seconds; // one cycle apart → gentle stereo beating, still loops
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let s = 0;
      for (const v of voices) {
        const amp = 0.55 + 0.45 * Math.sin(2 * Math.PI * v.lfo * t + v.ph);
        s += amp * (Math.sin(2 * Math.PI * (v.f + detune) * t) + 0.25 * Math.sin(4 * Math.PI * v.f * t));
      }
      d[i] = (s / voices.length) * 0.22;
    }
  }
  return buf;
}

/**
 * Music + sound effects over three.js' Web Audio wrapper.
 * Missing files fall back to a synthetic pad so nothing ever goes silent.
 */
export class AudioSystem {
  constructor(camera, manifest) {
    this.manifest = manifest;
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.ctx = this.listener.context;
    this.buffers = new Map();
    this.generators = new Map();
    this.music = null;
    this.muted = false;
  }

  unlock() {
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    this.listener.setMasterVolume(muted ? 0 : 1);
  }

  /** Register a procedurally generated sound: `factory()` returns Promise<AudioBuffer>. */
  define(name, factory) {
    if (!this.generators.has(name)) this.generators.set(name, factory);
  }

  /** Register a sound recorded in /audio; `fallback()` synthesizes it if the file is missing. */
  defineFile(name, file, fallback) {
    this.define(name, () => this._fetch(file).catch(() => {
      console.warn(`[audio] ${file} missing — using synthetic fallback`);
      return fallback();
    }));
  }

  async _fetch(file) {
    const res = await fetch(BASE + file);
    if (!res.ok) throw new Error(res.status);
    const type = res.headers.get('content-type') || '';
    if (type.includes('text/html')) throw new Error('not audio'); // dev server SPA fallback
    return this.ctx.decodeAudioData(await res.arrayBuffer());
  }

  load(name) {
    if (!this.buffers.has(name) && this.generators.has(name)) {
      this.buffers.set(
        name,
        this.generators.get(name)().catch((err) => {
          console.warn(`[audio] could not synthesize "${name}"`, err);
          return this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
        }),
      );
    }
    if (!this.buffers.has(name)) {
      const entry = this.manifest[name];
      const p = (async () => {
        if (!entry) throw new Error(`Unknown audio "${name}"`);
        try {
          return await this._fetch(entry.file);
        } catch {
          console.warn(`[audio] ${entry.file} missing — using synthetic placeholder`);
          return makePad(this.ctx, entry.placeholder || [220, 277, 330]);
        }
      })();
      this.buffers.set(name, p);
    }
    return this.buffers.get(name);
  }

  preload(names) {
    return Promise.all(names.map((n) => this.load(n)));
  }

  _ramp(audio, volume, seconds) {
    const g = audio.gain.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(volume, now + Math.max(0.01, seconds));
  }

  _lowpass(audio, cutoff) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    f.Q.value = 0.7;
    audio.setFilter(f);
    return f;
  }

  /** Crossfade to a music track. Re-requesting the playing track only changes its volume. */
  async playMusic(name, { volume = 0.7, fade = 3, loop = true, rate = 1, cutoff = 20000 } = {}) {
    if (this.music && this.music.name === name) {
      this._ramp(this.music.audio, volume, fade);
      return this.music.audio;
    }
    this.stopMusic(fade);
    const token = (this._musicToken = (this._musicToken || 0) + 1);
    const buffer = await this.load(name);
    if (token !== this._musicToken) return null; // superseded while loading
    const audio = new THREE.Audio(this.listener);
    audio.setBuffer(buffer);
    audio.setLoop(loop);
    audio.setPlaybackRate(rate);
    const filter = this._lowpass(audio, cutoff);
    audio.gain.gain.value = 0;
    audio.play();
    this._ramp(audio, volume, fade);
    this.music = { name, audio, filter };
    return audio;
  }

  /** Low-pass the current music (underwater / through-the-wall feel). 20000 = open. */
  muffleMusic(cutoff, seconds = 2) {
    if (!this.music) return;
    const f = this.music.filter.frequency;
    const now = this.ctx.currentTime;
    f.cancelScheduledValues(now);
    f.setValueAtTime(f.value, now);
    f.exponentialRampToValueAtTime(Math.max(40, cutoff), now + Math.max(0.01, seconds));
  }

  fadeMusic(volume, seconds = 2) {
    if (this.music) this._ramp(this.music.audio, volume, seconds);
  }

  stopMusic(fade = 2) {
    this._musicToken = (this._musicToken || 0) + 1;
    if (!this.music) return;
    const { audio } = this.music;
    this.music = null;
    this._ramp(audio, 0, fade);
    setTimeout(() => audio.isPlaying && audio.stop(), fade * 1000 + 100);
  }

  /** Fade a sound (from playSfx) to `volume`; stops it when fading to 0. */
  fade(audio, volume, seconds = 1) {
    if (!audio) return;
    this._ramp(audio, volume, seconds);
    if (volume <= 0) setTimeout(() => audio.isPlaying && audio.stop(), seconds * 1000 + 50);
  }

  /** One-shot sound. Pass `parent` (an Object3D) to make it spatial. */
  async playSfx(name, { volume = 1, parent = null, loop = false, rate = 1, refDistance = 1, cutoff = 0 } = {}) {
    const buffer = await this.load(name);
    const audio = parent ? new THREE.PositionalAudio(this.listener) : new THREE.Audio(this.listener);
    if (parent) {
      audio.setRefDistance(refDistance);
      parent.add(audio);
    }
    audio.setBuffer(buffer);
    audio.setLoop(loop);
    audio.setPlaybackRate(rate);
    if (cutoff) this._lowpass(audio, cutoff);
    audio.setVolume(volume);
    audio.play();
    return audio;
  }
}
