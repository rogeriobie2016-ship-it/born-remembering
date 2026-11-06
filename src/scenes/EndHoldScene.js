import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BaseScene } from '../core/SceneManager.js';
import { ease, glowTexture } from '../core/util.js';
import { softMaterial, paintedTexture, bakeGradient } from '../core/look.js';
import { loadArt, cutout, cartouche, ScrollWriter } from '../core/collage.js';
import { loadMarble, marbleMaterial } from '../core/marble.js';
import { buildNursery, nurseryArt, GiantHand, EYE, meanderTexture, doricColumn, framedPainting } from './nursery.js';

// 7A · Holding on (Odyssey XI). Years pass in her hand; then, at night, in a Greek
// bedchamber, she dies. David's study for "Andromache Mourning Hector" hangs on the wall:
// the same vigil, painted. Her shade rises in light; you reach for her three times,
// and three times she flits from your arms, as Odysseus's mother did in Hades.

const SR = 44100;
const SEATED = 1.05; // grown-up eye height at the bedside
const LAMP = new THREE.Vector3(1.05, 1.18, -1.2);
const FACE = new THREE.Vector3(-0.8, 0.9, -1.12);

/** Lub-dub, low and soft. */
function heartbeat() {
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Ctx(1, Math.ceil(SR * 0.9), SR);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 180;
  const out = ctx.createGain();
  out.gain.value = 0.9;
  lp.connect(out).connect(ctx.destination);
  for (const [at, amp, f] of [
    [0.0, 1, 62],
    [0.26, 0.7, 54],
  ]) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f, at);
    o.frequency.exponentialRampToValueAtTime(f * 0.6, at + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, 0);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(amp, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
    o.connect(g).connect(lp);
    o.start(at);
    o.stop(at + 0.3);
  }
  return ctx.startRendering();
}

/** Gold-leaf and lamplight motes rushing toward the viewer: every memory at once. */
class MemoryFlood extends THREE.Points {
  constructor(count = 700) {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const palette = ['#ffd27a', '#f6c37a', '#fff4e0', '#e8a86a', '#f2d9b0'].map((c) => new THREE.Color(c));
    for (let i = 0; i < count; i++) {
      MemoryFlood.spawn(pos, i, -2 - Math.random() * 30);
      const c = palette[Math.floor(Math.random() * palette.length)];
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    super(
      geo,
      new THREE.PointsMaterial({
        size: 0.09,
        map: glowTexture(),
        vertexColors: true,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    this.speed = 0;
    this.frustumCulled = false;
    this.raycast = () => {};
  }

  static spawn(pos, i, z) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.4 + Math.random() * 4; // never straight through the eye
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.sin(a) * r * 0.7;
    pos[i * 3 + 2] = z;
  }

  update(t, dt) {
    if (this.speed <= 0) return;
    const attr = this.geometry.attributes.position;
    const p = attr.array;
    for (let i = 0; i < attr.count; i++) {
      p[i * 3 + 2] += this.speed * dt;
      if (p[i * 3 + 2] > 1) MemoryFlood.spawn(p, i, -30 - Math.random() * 5);
    }
    attr.needsUpdate = true;
  }
}

/** A night sky through the window: deep blue wash, a crescent, stars, cypresses. */
export function nightTexture() {
  return paintedTexture(256, 340, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0d1430');
    g.addColorStop(0.7, '#27335c');
    g.addColorStop(1, '#4a4a6a');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      c.fillStyle = `rgba(255,246,220,${0.3 + rnd() * 0.6})`;
      c.beginPath();
      c.arc(rnd() * w, rnd() * h * 0.7, 0.6 + rnd() * 1.3, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#fff3d2';
    c.beginPath();
    c.arc(w * 0.7, h * 0.2, 20, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#121a38';
    c.beginPath();
    c.arc(w * 0.7 + 9, h * 0.2 - 5, 18, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#0a0c18';
    for (const [x, hh] of [[0.15, 0.42], [0.28, 0.3], [0.88, 0.36]]) {
      c.beginPath();
      c.ellipse(w * x, h - h * hh * 0.5, 13, h * hh * 0.5, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.fillRect(0, h - 26, w, 26);
  });
}

/** Night bedchamber: a kline with your mother on it, an oil lamp, David's vigil on the wall. */
export function buildBedchamber(art) {
  const group = new THREE.Group();

  // Shell with baked lamplight: warm pool around the lamp, cool dark above.
  const shellGeo = bakeGradient(new THREE.BoxGeometry(6, 3.2, 5.6, 24, 14, 24), {
    low: '#3a261b',
    high: '#1a1420',
    from: -1.6,
    to: 1.2,
    lift: { at: new THREE.Vector3(LAMP.x, LAMP.y - 1.6, LAMP.z + 1.2), radius: 3.4, color: '#c98a54', strength: 0.9 },
  });
  const room = new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
  room.position.set(0, 1.6, -1.2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 5.6), softMaterial({ color: '#7a5a42', rim: '#ffcf9a', rimStrength: 0.2, hatch: 40 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.003, -1.2);
  group.add(room, floor);

  // Terracotta dado and a Greek key on the back wall.
  const dado = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.95), new THREE.MeshBasicMaterial({ color: '#4e2016' }));
  dado.position.set(0, 0.475, -3.99);
  const key = meanderTexture('#5a2418', '#b89a72');
  key.repeat.set(12, 1);
  const band = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.13), new THREE.MeshBasicMaterial({ map: key, color: '#8a6a50' }));
  band.position.set(0, 1.0, -3.985);
  group.add(dado, band);

  // Window onto the night, between two Doric columns.
  const nightMat = new THREE.MeshBasicMaterial({ map: nightTexture(), toneMapped: false, fog: false });
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.32), nightMat);
  pane.position.set(1.75, 1.75, -3.98);
  const stone = softMaterial({ color: '#9a8470', rim: '#ffcf9a', rimStrength: 0.25, hatch: 0 });
  group.add(pane);
  for (const dx of [-0.72, 0.72]) {
    const col = doricColumn(stone, 2.9);
    col.scale.setScalar(0.85);
    col.position.set(1.75 + dx, 0, -3.8);
    group.add(col);
  }

  // David's "Andromache Mourning Hector" (study), hung in gilt.
  const gilt = softMaterial({ color: '#b08a4a', rim: '#ffe2a8', rimStrength: 0.5, hatch: 0 });
  if (art.david) {
    const david = framedPainting(art.david, 1.05, gilt);
    // unlit, so the drawing reads in the dark room (the lamp would barely reach it)
    david.children[0].material = new THREE.MeshBasicMaterial({ map: art.david, color: '#b9a690' });
    david.position.set(-1.75, 1.8, -3.95);
    group.add(david);
  }

  // The kline: carved wooden couch, linen, a terracotta coverlet with a key border.
  const wood = softMaterial({ color: '#5a3a28', rim: '#ffcf9a', rimStrength: 0.3, hatch: 90 });
  // smooth: in this low light fine hatching on pale linen turns to moiré
  const linen = softMaterial({ color: '#d8ccb6', rim: '#fff1dc', rimStrength: 0.35, hatch: 0 });
  const frame = new THREE.Mesh(new RoundedBoxGeometry(2.15, 0.16, 0.9, 3, 0.04), wood);
  frame.position.set(-0.1, 0.42, -1.1);
  group.add(frame);
  for (const [x, z] of [[-1.1, -0.7], [0.9, -0.7], [-1.1, -1.5], [0.9, -1.5]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.03, 0.42, 12), wood);
    leg.position.set(x, 0.21, z);
    group.add(leg);
  }
  const headboard = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.5, 0.9, 3, 0.04), wood);
  headboard.position.set(-1.15, 0.72, -1.1);
  headboard.rotation.z = -0.25;
  group.add(headboard);
  const mattress = new THREE.Mesh(new RoundedBoxGeometry(2.05, 0.14, 0.86, 3, 0.05), linen);
  mattress.position.set(-0.1, 0.55, -1.1);
  const pillow = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.24, 0.7, 4, 0.1), linen);
  pillow.position.set(-0.95, 0.72, -1.12);
  pillow.rotation.z = -0.45;
  group.add(mattress, pillow);

  // Her body under the coverlet: a long soft mound.
  const cover = softMaterial({ color: '#8e3a28', rim: '#ffb07a', rimStrength: 0.35, hatch: 0 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.1, 6, 20), cover);
  body.rotation.z = Math.PI / 2;
  body.scale.set(0.6, 1, 1.5); // low and wide: a coverlet over her, not a bolster
  body.position.set(0.05, 0.63, -1.12);
  const hem = meanderTexture('#e8d2a8', '#8e3a28');
  hem.repeat.set(6, 1);
  const border = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.07), new THREE.MeshBasicMaterial({ map: hem, color: '#c9a888' }));
  border.position.set(0.05, 0.61, -0.83);
  border.rotation.x = -0.25;
  group.add(body, border);

  // Her face: Andromache's veiled portrait, propped on the pillow.
  let face = null;
  if (art.face) {
    face = cutout(art.face, 0.6, { anchor: 'center' });
    face.material.depthWrite = false;
    face.position.copy(FACE);
    face.rotation.set(-0.5, 0.25, 0);
    group.add(face);
  }

  // Germain Pilon's Mater Dolorosa (a real scan), against the back wall: the same vigil again, in stone.
  if (art.mater) {
    const veiled = new THREE.Mesh(art.mater, marbleMaterial({ color: '#fff0dc', through: '#ff9a5c' }));
    veiled.position.set(0.1, 0, -3.55);
    veiled.raycast = () => {};
    group.add(veiled);
  }

  // Oil lamp on a tall bronze stand; its flame is the only warm light.
  const bronze = softMaterial({ color: '#6a4a2a', rim: '#ffd08a', rimStrength: 0.5, hatch: 0 });
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, LAMP.y - 0.05, 10), bronze);
  stand.position.set(LAMP.x, (LAMP.y - 0.05) / 2, LAMP.z);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.16, 0.06, 16), bronze);
  foot.position.set(LAMP.x, 0.03, LAMP.z);
  const lucerna = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 10), bronze);
  lucerna.scale.set(1.3, 0.5, 0.8);
  lucerna.position.copy(LAMP);
  group.add(stand, foot, lucerna);
  const flame = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffb766', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  );
  flame.position.copy(LAMP).add(new THREE.Vector3(0.09, 0.07, 0));
  flame.scale.setScalar(0.22);
  const aura = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color: '#ff9a4a', transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  );
  aura.position.copy(flame.position);
  aura.scale.setScalar(1.6);
  flame.raycast = aura.raycast = () => {};
  group.add(flame, aura);

  // Her light: a warm glow over her that fades as she goes.
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffcf8f', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  glow.position.set(-0.55, 0.95, -1.1);
  glow.scale.setScalar(1.1);
  glow.raycast = () => {};
  group.add(glow);

  // Hands: hers palm up at the bed's edge, fingers toward you; yours resting in it.
  const hers = new GiantHand({ side: -1, skin: '#e3c6ad', scale: 1.3 });
  hers.place(new THREE.Vector3(-0.04, 0.84, -0.82), [0, 0, -1.75]);
  hers.visible = true;
  hers.targetCurl = 0.55;
  const yours = new GiantHand({ side: 1, skin: '#d9b293', sleeve: '#4a3a46', scale: 1 });
  yours.place(new THREE.Vector3(0.03, 0.76, -0.6), [-0.55, 0, 0.1]);
  yours.visible = true;
  yours.targetCurl = 0.6;

  const hemi = new THREE.HemisphereLight('#8a90b8', '#2a1c14', 0.9);
  const lamp = new THREE.PointLight('#ffb36a', 2.6, 6, 1.4);
  lamp.position.copy(LAMP).add(new THREE.Vector3(0, 0.2, 0.1));
  group.add(hemi, lamp);

  return { group, glow, face, flame, aura, hers, yours, lamp, hemi };
}

/** Her shade: the same painted face, made of light. */
export function buildShade(tex) {
  const g = new THREE.Group();
  const h = 1.05;
  const w = h * (tex.image.width / tex.image.height);
  const fig = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, color: '#ffe6c0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
  );
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffe2b0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  );
  halo.scale.setScalar(2.4);
  halo.position.z = -0.05;
  halo.raycast = () => {};
  g.add(halo, fig);
  g.userData = { fig, halo };
  g.setOpacity = (o) => {
    fig.material.opacity = o * 0.95;
    halo.material.opacity = o * 0.45;
  };
  return g;
}

/** 7A · Holding on: years in her hand, then her death — and everything unlocks. */
export class EndHoldScene extends BaseScene {
  skipTo = 'afterlife';
  skipParams = { ending: 'hold' };

  async enter() {
    const { ctx } = this;
    ctx.audio.define('heartbeat', heartbeat);
    ctx.rig.position.set(0, EYE, 0);
    ctx.haze.set({ amount: 0.2, color: '#f4ece2', blur: 0.8, saturate: 0.85 });
    ctx.grain.set({ grain: 0.06, vignette: 0.35, color: '#6b4a34' });

    const [nArt, art, mater] = await Promise.all([nurseryArt(), loadArt('endings', ['david']), loadMarble('art/scans/mater-dolorosa.bin')]);
    this.art = { ...art, face: nArt['andromache-face'], mater };
    this.nursery = buildNursery(nArt);
    this.add(this.nursery.group);
    const n = this.nursery;
    n.mother.lean = 0.3;

    // The mother's giant hand, palm up, fingers toward you…
    n.motherHand.place(new THREE.Vector3(-0.02, 0.88, -0.72), [Math.PI * 0.78, 0, 0]);
    n.motherHand.visible = true;
    n.motherHand.targetCurl = 0.05;
    // …and your tiny one inside it.
    this.babyHand = this.add(new GiantHand({ side: 1, skin: '#f2cdb4', sleeve: '#f3ebe0', scale: 0.5 }));
    this.babyHand.place(new THREE.Vector3(-0.03, 0.655, -0.5), [-0.5, 0, 0.1]);
    this.babyHand.visible = true;
    this.babyHand.targetCurl = 0.2;
    this.holding = [n.motherHand, this.babyHand];
    ctx.hands.look({ skin: '#f2cdb4', scale: 0.5 });
    ctx.hands.adopt([null, this.babyHand], { reach: 0.04, lift: 0.03 });

    this.flood = this.add(new MemoryFlood());
    this.pulse = 0;
    return ctx.audio.preload(['moonlight', 'heartbeat']);
  }

  /** Await a global (non-scene) promise; never resume if the scene ended meanwhile. */
  async guard(promise) {
    await promise;
    if (!this.alive) await new Promise(() => {});
  }

  async start() {
    const { audio, haze, fader, rig, scene, input } = this.ctx;
    const T = this.ctx.content.END_HOLD;
    const M = this.ctx.content.MYTHS.endHold;
    audio.playMusic('moonlight', { volume: 0.5, fade: 3 });
    audio.muffleMusic(20000, 3);

    await this.wait(1.2);
    this.nursery.motherHand.targetCurl = 0.9;
    this.babyHand.targetCurl = 0.75;
    await this.say(T.lines[0], { hold: 1.5 });

    // Years pass: days and nights flicker through the window; she ages.
    await Promise.all([this.say(T.lines[1], { hold: 3 }), this.years(11)]);

    // Cut to her bedside, years later, at night.
    await this.guard(fader.fade(1, 1.5, '#000000'));
    this.drop(this.nursery.group);
    this.drop(this.babyHand);
    this.nursery = null;
    this.bed = buildBedchamber(this.art);
    this.add(this.bed.group, this.bed.hers, this.bed.yours);
    this.holding = [this.bed.hers, this.bed.yours];
    this.ctx.hands.look();
    this.ctx.hands.adopt([null, this.bed.yours], { reach: 0.12, lift: 0.08 });
    scene.background = new THREE.Color('#0c0a10');
    rig.position.set(0, SEATED, 0);
    haze.set({ amount: 0.12, color: '#ffe6c8', blur: 0.5, saturate: 0.85 });
    this.scroll = this.add(cartouche(1.9, 0.85));
    this.scroll.position.set(1.4, 2.5, -3.3); // up and to the right: the shade owns the centre
    this.scroll.lookAt(0, SEATED + 0.3, 0);
    this.writer = new ScrollWriter(this, this.scroll);
    audio.fadeMusic(0.35, 3);
    await this.guard(fader.fade(0, 2));

    this.heart();
    await this.wait(5);
    await this.say(T.lines[2], { hold: 2 });

    // Her light fades; the heart slows and stops.
    this.dying = true;
    audio.fadeMusic(0.15, 8);
    const b = this.bed;
    this.tween(9, (k) => {
      b.glow.material.opacity = 0.35 * (1 - k);
      b.lamp.intensity = 2.6 * (1 - k * 0.5);
      if (b.face) b.face.material.color.setScalar(1 - k * 0.45);
    });
    await this.until(() => this.heartStopped, 16);
    b.hers.targetCurl = 0.05; // her fingers open
    await this.wait(2);

    // Her shade rises out of her, made of light.
    if (b.face) {
      this.shade = this.add(buildShade(b.face.material.map));
      this.shade.position.copy(FACE);
      const to = new THREE.Vector3(-0.1, 1.5, -2.3);
      this.tween(5, (k) => {
        this.shade.position.lerpVectors(FACE, to, k);
        this.shade.lookAt(0, SEATED, 0);
        this.shade.setOpacity(Math.min(1, k * 1.6));
      }, ease.inOut);
    }
    await this.writer.say(M.longing, { source: M.source, hold: 2 });

    // Thrice you reach for her; thrice she flits from your arms.
    if (this.shade) await this.reachThrice(input);
    await this.writer.say(M.text, { source: M.source, hold: 2 });
    this.writer.hide(1);

    // Everything unlocks.
    if (this.shade) this.tween(3, (k) => this.shade.setOpacity(1 - k));
    this.flood.position.set(0, SEATED, 0);
    audio.playMusic('moonlight', { volume: 0.85, fade: 5 });
    this.say(T.lines[3], { hold: 2 });
    const c0 = haze.color.clone();
    const white = new THREE.Color('#fff8ec');
    this.tween(9, (k) => {
      this.flood.speed = 2 + k * 26;
      this.flood.material.opacity = Math.min(1, k * 2.5);
      haze.color.lerpColors(c0, white, k);
      haze.set({ amount: 0.12 + 0.88 * k * k, blur: 0.5 + k * 3 });
    }, ease.in);
    await this.wait(1.5);
    await this.say(T.fragment, { narrate: false, hold: 2.5 });
    this.next('afterlife', { ending: 'hold' }, { color: '#ffffff', out: 2.5, in: 2 });
  }

  /** Odyssey XI: three reaches toward the shade. Look at her (or wait) to reach. */
  async reachThrice(input) {
    const shade = this.shade;
    const hand = this.bed.yours;
    const rest = [hand.position.clone(), [-0.55, 0, 0.1]];
    const spots = [new THREE.Vector3(-0.5, 1.55, -2.8), new THREE.Vector3(0.15, 1.75, -3.2), new THREE.Vector3(-0.25, 2.0, -3.6)];
    let wanted = false;
    input.add(shade.userData.fig, { onSelect: () => (wanted = true), dwell: 0.9 });
    for (let i = 0; i < 3; i++) {
      wanted = false;
      await this.until(() => wanted, 4.5);
      // Your arm goes out toward her, fingers open…
      hand.targetCurl = 0.05;
      await hand.moveTo(this, new THREE.Vector3(0.1, 1.05, -0.6), [Math.PI / 2 + 0.6, 0, Math.PI], 1.1);
      // …and she flits away like a dream; your fingers close on nothing.
      hand.targetCurl = 0.95;
      const to = spots[i];
      await this.tween(0.45, (k) => shade.setOpacity(1 - k));
      shade.position.copy(to);
      shade.lookAt(0, SEATED, 0);
      hand.moveTo(this, rest[0], rest[1], 1.6);
      await this.tween(1.2, (k) => shade.setOpacity(k * (i < 2 ? 1 : 0.7)));
    }
    input.remove(shade.userData.fig);
    hand.targetCurl = 0.6;
  }

  /** `seconds` of fast days and nights in the nursery. */
  years(seconds) {
    const n = this.nursery;
    const day = new THREE.Color('#fff5df');
    const night = new THREE.Color('#1f2a52');
    const skyDay = new THREE.Color('#fff6ea');
    const skyNight = new THREE.Color('#5a6a9a');
    const haze = this.ctx.haze;
    return this.tween(
      seconds,
      (k) => {
        const d = 0.5 + 0.5 * Math.cos(k * Math.PI * 2 * 3.5);
        n.windowMat.color.lerpColors(night, day, d);
        n.hemi.color.lerpColors(skyNight, skyDay, d);
        n.hemi.intensity = 0.35 + 1.25 * d;
        n.sun.intensity = 0.8 * d;
        n.lamp.intensity = 0.6 + 2.6 * (1 - d);
        n.mother.age = k * 0.75;
        n.father.age = k * 0.75;
        haze.set({ amount: 0.2 + k * 0.45 }); // the room dissolves into time
      },
      ease.linear,
    );
  }

  async heart() {
    let interval = 0.95;
    let volume = 0.9;
    while (!this.dying || interval < 2.8) {
      this.sound('heartbeat', { volume });
      this.pulse = 1;
      await this.wait(interval);
      if (this.dying) {
        interval *= 1.2;
        volume *= 0.82;
      }
    }
    this.heartStopped = true;
  }

  onSelectNothing() {
    // Squeeze the hand you are holding.
    for (const h of this.holding || []) {
      const base = h.targetCurl;
      h.targetCurl = Math.min(1.2, base + 0.35);
      this.wait(0.45).then(() => (h.targetCurl = base));
    }
  }

  update(dt, t) {
    super.update(dt, t);
    if (this.nursery) this.nursery.update(t, dt);
    if (this.bed) {
      this.pulse = Math.max(0, this.pulse - dt * 3);
      this.bed.glow.scale.setScalar(1.1 * (1 + this.pulse * 0.15));
      const f = 1 + Math.sin(t * 13) * 0.05 + Math.sin(t * 7.3) * 0.04;
      this.bed.flame.scale.setScalar(0.22 * f);
      this.bed.lamp.distance = 6 * f;
    }
    if (this.shade) {
      const s = this.shade.userData;
      s.fig.position.y = Math.sin(t * 0.9) * 0.03;
      s.halo.scale.setScalar(2.4 + Math.sin(t * 1.3) * 0.1);
    }
  }
}
