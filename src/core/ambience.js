// Place sounds, rendered once with OfflineAudioContext (no files). Loops are made to wrap softly.

const SR = 44100;

function offline(seconds) {
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  return new Ctx(1, Math.ceil(SR * seconds), SR);
}

function noise(ctx, seconds) {
  const buf = ctx.createBuffer(1, Math.ceil(SR * seconds), SR);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

function filter(ctx, type, frequency, Q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = Q;
  return f;
}

/** Soft ends, so a loop has no click where it wraps. */
function loopGain(ctx, seconds, level) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, 0);
  g.gain.linearRampToValueAtTime(level, 0.4);
  g.gain.setValueAtTime(level, seconds - 0.4);
  g.gain.linearRampToValueAtTime(0, seconds);
  return g;
}

/** Wind in leaves: a breathing band of noise. */
export function leavesWind() {
  const s = 8;
  const ctx = offline(s);
  const f = filter(ctx, 'bandpass', 2200, 0.5);
  f.frequency.setValueCurveAtTime(new Float32Array([1500, 2800, 1800, 3200, 2000, 1500]), 0, s);
  const hp = filter(ctx, 'highpass', 500);
  const src = noise(ctx, s);
  src.connect(f).connect(hp).connect(loopGain(ctx, s, 0.5)).connect(ctx.destination);
  src.start(0);
  return ctx.startRendering();
}

/** A few birds, far off: short rising and falling whistles. */
export function birds() {
  const s = 9;
  const ctx = offline(s);
  const out = ctx.createGain();
  out.gain.value = 0.16;
  out.connect(ctx.destination);
  for (let i = 0; i < 16; i++) {
    const t = 0.3 + Math.random() * (s - 1);
    const o = ctx.createOscillator();
    const base = 2300 + Math.random() * 1800;
    const len = 0.07 + Math.random() * 0.14;
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * (0.75 + Math.random() * 0.6), t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5 + Math.random() * 0.5, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + len + 0.02);
  }
  return ctx.startRendering();
}

/** Leaves shaken by a hand. */
export function rustle() {
  const s = 1.1;
  const ctx = offline(s);
  const src = noise(ctx, s);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, 0);
  g.gain.linearRampToValueAtTime(0.9, 0.05);
  g.gain.exponentialRampToValueAtTime(0.01, s);
  src.connect(filter(ctx, 'highpass', 1800)).connect(g).connect(ctx.destination);
  src.start(0);
  return ctx.startRendering();
}

/** A ripe fruit bitten or burst: a wet crack. */
export function crunch() {
  const s = 0.45;
  const ctx = offline(s);
  const src = noise(ctx, s);
  const g = ctx.createGain();
  g.gain.setValueAtTime(1, 0);
  g.gain.exponentialRampToValueAtTime(0.01, s);
  src.connect(filter(ctx, 'bandpass', 1300, 1.2)).connect(g).connect(ctx.destination);
  src.start(0);
  return ctx.startRendering();
}

/** The earth opening: a long sub rumble with grit in it. */
export function quake() {
  const s = 5;
  const ctx = offline(s);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, 0);
  g.gain.linearRampToValueAtTime(1, 1.2);
  g.gain.linearRampToValueAtTime(0, s);
  const src = noise(ctx, s);
  src.connect(filter(ctx, 'lowpass', 120)).connect(g).connect(ctx.destination);
  const grit = noise(ctx, s);
  const gg = ctx.createGain();
  gg.gain.value = 0.12;
  grit.connect(filter(ctx, 'bandpass', 500, 0.6)).connect(gg).connect(g);
  src.start(0);
  grit.start(0);
  return ctx.startRendering();
}

/** The underworld: a low beating drone, a long way down. */
export function underworld() {
  const s = 12;
  const ctx = offline(s);
  const g = loopGain(ctx, s, 0.5);
  g.connect(ctx.destination);
  for (const [f, level] of [[41, 0.5], [41.6, 0.4], [62, 0.2], [82.4, 0.1]]) {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    const a = ctx.createGain();
    a.gain.value = level;
    o.connect(a).connect(g);
    o.start(0);
  }
  const air = noise(ctx, s);
  const am = ctx.createGain();
  am.gain.value = 0.1;
  air.connect(filter(ctx, 'lowpass', 300)).connect(am).connect(g);
  air.start(0);
  return ctx.startRendering();
}

/** Slow black water against a bank. */
export function darkWater() {
  const s = 7;
  const ctx = offline(s);
  const f = filter(ctx, 'lowpass', 500);
  f.frequency.setValueCurveAtTime(new Float32Array([300, 800, 350, 700, 300]), 0, s);
  const src = noise(ctx, s);
  src.connect(f).connect(loopGain(ctx, s, 0.8)).connect(ctx.destination);
  src.start(0);
  return ctx.startRendering();
}

/** A big page turning, or paper unfolding. */
export function paper() {
  const s = 1.4;
  const ctx = offline(s);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, 0);
  g.gain.linearRampToValueAtTime(0.7, 0.25);
  g.gain.linearRampToValueAtTime(0.25, 0.8);
  g.gain.exponentialRampToValueAtTime(0.01, s);
  const f = filter(ctx, 'bandpass', 3200, 0.5);
  f.frequency.setValueCurveAtTime(new Float32Array([2000, 4200, 2600, 1500]), 0, s);
  const src = noise(ctx, s);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(0);
  return ctx.startRendering();
}
