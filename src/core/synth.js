// Procedural sound effects rendered once with OfflineAudioContext.
// No files needed; each returns a Promise<AudioBuffer>.

const SR = 44100;

function offline(seconds) {
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  return new Ctx(1, Math.ceil(SR * seconds), SR);
}

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noise(ctx, seconds) {
  const buf = ctx.createBuffer(1, Math.ceil(SR * seconds), SR);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

function softClip(amount = 2.5) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

function filter(ctx, type, frequency, Q = 1) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = Q;
  return f;
}

/** A newborn's wail: "waaa-ah", formant-filtered sawtooth with vibrato, then a catch of breath. */
export function cry(seed = 1) {
  const r = rng(seed);
  const dur = 1.4 + r() * 0.9;
  const ctx = offline(dur + 0.7);
  const out = ctx.createGain();
  out.gain.value = 0.55;
  const shaper = ctx.createWaveShaper();
  shaper.curve = softClip(2);
  shaper.connect(out).connect(ctx.destination);

  const f0 = 390 + r() * 110;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f0 * 0.8, 0);
  osc.frequency.linearRampToValueAtTime(f0 * 1.25, 0.16);
  osc.frequency.linearRampToValueAtTime(f0 * (1.05 + r() * 0.15), dur * 0.65);
  osc.frequency.linearRampToValueAtTime(f0 * 0.7, dur);
  const vib = ctx.createOscillator();
  vib.frequency.value = 5 + r() * 2.5;
  const vibDepth = ctx.createGain();
  vibDepth.gain.value = f0 * 0.04;
  vib.connect(vibDepth).connect(osc.frequency);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, 0);
  env.gain.linearRampToValueAtTime(1, 0.06);
  const brk = dur * (0.35 + r() * 0.25); // the voice cracks once
  env.gain.setValueAtTime(1, brk);
  env.gain.linearRampToValueAtTime(0.35, brk + 0.05);
  env.gain.linearRampToValueAtTime(1, brk + 0.12);
  env.gain.setValueAtTime(1, dur - 0.25);
  env.gain.linearRampToValueAtTime(0, dur);
  osc.connect(env);

  // Mouth opening ("w-aa") then closing ("ah") on the first formant.
  const f1 = filter(ctx, 'bandpass', 500, 5);
  f1.frequency.setValueAtTime(450, 0);
  f1.frequency.linearRampToValueAtTime(1050, 0.13);
  f1.frequency.setValueAtTime(1050, dur * 0.8);
  f1.frequency.linearRampToValueAtTime(650, dur);
  for (const [f, g] of [
    [f1, 3],
    [filter(ctx, 'bandpass', 2100 + r() * 300, 7), 1.6],
    [filter(ctx, 'bandpass', 3300, 9), 0.8],
  ]) {
    const gain = ctx.createGain();
    gain.gain.value = g;
    env.connect(f).connect(gain).connect(shaper);
  }

  // Short, sharp inhale afterwards.
  const breath = noise(ctx, 0.5);
  const bp = filter(ctx, 'bandpass', 1400, 2);
  bp.frequency.setValueAtTime(1000, dur + 0.1);
  bp.frequency.linearRampToValueAtTime(2400, dur + 0.45);
  const benv = ctx.createGain();
  benv.gain.setValueAtTime(0, 0);
  benv.gain.setValueAtTime(0, dur + 0.1);
  benv.gain.linearRampToValueAtTime(0.25, dur + 0.3);
  benv.gain.linearRampToValueAtTime(0, dur + 0.5);
  breath.connect(bp).connect(benv).connect(out);

  osc.start(0);
  vib.start(0);
  osc.stop(dur);
  breath.start(dur + 0.05);
  return ctx.startRendering();
}

/** Adult speech heard through a newborn's ears: syllables, intonation, no words — heavily low-passed. */
export function babble(seed = 1, { pitch = 180, seconds = 3, cutoff = 650 } = {}) {
  const r = rng(seed);
  const ctx = offline(seconds);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  for (let t = 0, p = pitch * 1.1; t < seconds; t += 0.22) {
    p = pitch * (0.85 + r() * 0.4) * (1 - (t / seconds) * 0.12); // gentle declination
    osc.frequency.linearRampToValueAtTime(p, t);
  }
  const env = ctx.createGain();
  env.gain.value = 0;
  const f1 = filter(ctx, 'bandpass', 600, 3);
  const f2 = filter(ctx, 'bandpass', 1400, 4);
  let t = 0.08;
  while (t < seconds - 0.3) {
    const syl = 0.09 + r() * 0.16;
    env.gain.setTargetAtTime(0.9, t, 0.02);
    env.gain.setTargetAtTime(0.1, t + syl, 0.03);
    f1.frequency.setValueAtTime(380 + r() * 520, t);
    f2.frequency.setValueAtTime(950 + r() * 1100, t);
    t += syl + 0.03 + r() * 0.07;
    if (r() < 0.12) {
      env.gain.setTargetAtTime(0, t, 0.04);
      t += 0.25 + r() * 0.2;
    }
  }
  env.gain.setTargetAtTime(0, t, 0.05);
  const lp1 = filter(ctx, 'lowpass', cutoff, 0.7);
  const lp2 = filter(ctx, 'lowpass', cutoff * 1.3, 0.7);
  const out = ctx.createGain();
  out.gain.value = 1.4;
  const g1 = ctx.createGain();
  g1.gain.value = 1.4;
  osc.connect(env);
  env.connect(f1).connect(g1).connect(lp1);
  env.connect(f2).connect(lp1);
  lp1.connect(lp2).connect(out).connect(ctx.destination);
  osc.start(0);
  return ctx.startRendering();
}

/** "Shhh, shhh" — soothing, slightly muffled. */
export function shush(seed = 1) {
  const r = rng(seed);
  const ctx = offline(2.2);
  const src = noise(ctx, 2.2);
  const bp = filter(ctx, 'bandpass', 3200 + r() * 600, 1.1);
  const lp = filter(ctx, 'lowpass', 2600, 0.7);
  const env = ctx.createGain();
  env.gain.value = 0;
  for (const [a, b] of [
    [0.05, 0.75],
    [1.0, 1.9],
  ]) {
    env.gain.setTargetAtTime(0.5, a, 0.06);
    env.gain.setTargetAtTime(0, b - 0.15, 0.08);
  }
  src.connect(bp).connect(lp).connect(env).connect(ctx.destination);
  src.start(0);
  return ctx.startRendering();
}

/** A deep, muffled thud through the wall. */
export function thump() {
  const ctx = offline(1.8);
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(75, 0);
  osc.frequency.exponentialRampToValueAtTime(38, 1.2);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, 0);
  env.gain.linearRampToValueAtTime(1, 0.01);
  env.gain.exponentialRampToValueAtTime(0.001, 1.6);
  const n = noise(ctx, 0.3);
  const nlp = filter(ctx, 'lowpass', 260, 0.8);
  const nenv = ctx.createGain();
  nenv.gain.setValueAtTime(0.6, 0);
  nenv.gain.exponentialRampToValueAtTime(0.001, 0.25);
  const out = ctx.createGain();
  out.gain.value = 0.9;
  osc.connect(env).connect(out);
  n.connect(nlp).connect(nenv).connect(out);
  out.connect(ctx.destination);
  osc.start(0);
  n.start(0);
  return ctx.startRendering();
}

// The lullaby the mother hums; the Sirens sing it too (and later Orpheus's lyre).
// [midi note, beats]
export const LULLABY = [
  [69, 1.5], [72, 0.5], [76, 1], [74, 1], [72, 1], [71, 1], [69, 2],
  [67, 1], [69, 1], [71, 1], [72, 1], [71, 1.5], [69, 0.5], [69, 2],
];

/** Two wordless voices on an open "ah", a third apart, with vibrato and a sea-cave echo. */
export function sirenSong({ bpm = 64, seed = 3 } = {}) {
  const beat = 60 / bpm;
  const melodyLen = LULLABY.reduce((s, [, b]) => s + b, 0) * beat;
  const seconds = melodyLen + 3;
  const ctx = offline(seconds);
  const r = rng(seed);
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // vocal tract: an open "ah" (three formants in parallel)
  const bus = ctx.createGain();
  const out = ctx.createGain();
  out.gain.value = 0.9;
  for (const [f, q, g] of [[760, 5, 1], [1180, 7, 0.55], [2650, 9, 0.22]]) {
    const bp = filter(ctx, 'bandpass', f, q);
    const gg = ctx.createGain();
    gg.gain.value = g;
    bus.connect(bp).connect(gg).connect(out);
  }

  // two singers: the melody, and a third below
  for (const [ratio, lag, level] of [[1, 0, 0.5], [0.794, 0.06, 0.38]]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.1 + r() * 0.5;
    const vibAmt = ctx.createGain();
    vib.connect(vibAmt).connect(osc.frequency);
    const env = ctx.createGain();
    env.gain.value = 0;
    let t = 0.2 + lag;
    osc.frequency.setValueAtTime(hz(LULLABY[0][0]) * ratio, 0);
    for (const [m, b] of LULLABY) {
      const f = hz(m) * ratio;
      osc.frequency.linearRampToValueAtTime(f, t + 0.07); // a little portamento
      vibAmt.gain.setTargetAtTime(f * 0.012, t + 0.15, 0.2); // vibrato blooms on long notes
      env.gain.setTargetAtTime(level, t, 0.06);
      env.gain.setTargetAtTime(level * 0.7, t + 0.25, 0.3);
      t += b * beat;
      vibAmt.gain.setTargetAtTime(0, t - 0.05, 0.05);
    }
    env.gain.setTargetAtTime(0, t, 0.35);
    osc.connect(env).connect(bus);
    osc.start(0);
    vib.start(0);
  }

  // breath
  const air = noise(ctx, seconds);
  const airBp = filter(ctx, 'bandpass', 1400, 1.2);
  const airG = ctx.createGain();
  airG.gain.value = 0.025;
  air.connect(airBp).connect(airG).connect(bus);
  air.start(0);

  // a sea-cave echo: three feedback delays, darkened
  const wet = ctx.createGain();
  wet.gain.value = 0.45;
  for (const [d, fb] of [[0.11, 0.42], [0.19, 0.38], [0.31, 0.35]]) {
    const delay = ctx.createDelay(1);
    delay.delayTime.value = d;
    const g = ctx.createGain();
    g.gain.value = fb;
    const lp = filter(ctx, 'lowpass', 2600, 0.7);
    out.connect(delay).connect(lp).connect(g).connect(delay);
    lp.connect(wet);
  }
  out.connect(ctx.destination);
  wet.connect(ctx.destination);
  return ctx.startRendering();
}

/** Orpheus's lyre: the lullaby plucked (Karplus–Strong strings), each note with a soft fifth below. */
export function lyre({ bpm = 64, seed = 5 } = {}) {
  const beat = 60 / bpm;
  const melodyLen = LULLABY.reduce((s, [, b]) => s + b, 0) * beat;
  const seconds = melodyLen + 2.5;
  const ctx = offline(seconds);
  const buf = ctx.createBuffer(1, Math.ceil(SR * seconds), SR);
  const out = buf.getChannelData(0);
  const r = rng(seed);
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const pluck = (f, start, gain) => {
    const period = Math.max(2, Math.round(SR / f));
    const ring = new Float32Array(period);
    for (let i = 0; i < period; i++) ring[i] = (r() * 2 - 1) * gain;
    const s0 = Math.floor(start * SR);
    const len = Math.min(out.length - s0, Math.floor(SR * 3.5));
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const j = i % period;
      const v = ring[j];
      ring[j] = 0.4985 * (v + prev); // gentle decay, warm
      prev = v;
      out[s0 + i] += v;
    }
  };
  let t = 0.1;
  for (const [m, b] of LULLABY) {
    pluck(hz(m), t, 0.5);
    pluck(hz(m - 7), t + 0.012, 0.22); // the fifth below, a breath late
    if (b >= 1.5) pluck(hz(m + 12), t + b * beat * 0.5, 0.12); // a high grace note on long notes
    t += b * beat;
  }
  // a little body and air
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const body = filter(ctx, 'peaking', 420, 1.2);
  body.gain.value = 4;
  const lp = filter(ctx, 'lowpass', 4200, 0.7);
  const g = ctx.createGain();
  g.gain.value = 0.8;
  src.connect(body).connect(lp).connect(g).connect(ctx.destination);
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.23;
  const fb = ctx.createGain();
  fb.gain.value = 0.3;
  g.connect(delay).connect(fb).connect(delay);
  fb.connect(ctx.destination);
  src.start(0);
  return ctx.startRendering();
}
