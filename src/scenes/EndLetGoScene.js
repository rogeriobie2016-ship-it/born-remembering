import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BaseScene } from '../core/SceneManager.js';
import { ease, lerp, glowTexture } from '../core/util.js';
import { softMaterial } from '../core/look.js';
import { engravedSky, engravedSea } from '../core/engraved.js';
import { loadArt, cutout, groundShadow, cartouche, ScrollWriter } from '../core/collage.js';
import { loadMarble, marbleMaterial } from '../core/marble.js';
import { buildNursery, nurseryArt, GiantHand, handTint, EYE, meanderTexture, doricColumn, framedPainting } from './nursery.js';

// 7B · Letting go (Odyssey XVII). No one to lose, no one to hold: a long life alone.
// Old, you sit in a loggia on Ithaca at dusk, over an engraved sea. Landseer's old dog
// lies at your feet — Argos, who waited twenty years and was the only one to know
// Ulysses when he came home. On the wall, the engraving of that recognition.
// He knows you; he dies; the sun goes down; you close your eyes.

const SR = 44100;
const SEATED = 1.15; // old age, in a chair
const SUN = new THREE.Vector3(0.15, 0.07, -1).normalize();
const SKY = {
  top: ['#45528a', '#2a2a52', '#0b0c18'].map((c) => new THREE.Color(c)),
  horizon: ['#f4b47c', '#b8607a', '#2a2238'].map((c) => new THREE.Color(c)),
};

/** Sample a palette of colour stops at k (0..1). */
function stops(cols, k, out) {
  const s = k * (cols.length - 1);
  const i = Math.min(cols.length - 2, Math.floor(s));
  return out.lerpColors(cols[i], cols[i + 1], s - i);
}

/** One slow breath (in, out, pause) — loops. */
function breath() {
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const len = 4.4;
  const ctx = new Ctx(1, Math.ceil(SR * len), SR);
  const buf = ctx.createBuffer(1, Math.ceil(SR * len), SR);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(1100, 0);
  bp.frequency.setValueAtTime(700, 2.0);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2000;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, 0);
  env.gain.linearRampToValueAtTime(0.22, 1.4); // in
  env.gain.linearRampToValueAtTime(0, 1.8);
  env.gain.setValueAtTime(0, 2.1);
  env.gain.linearRampToValueAtTime(0.3, 2.4); // out
  env.gain.linearRampToValueAtTime(0, 3.9);
  src.connect(bp).connect(lp).connect(env).connect(ctx.destination);
  src.start(0);
  return ctx.startRendering();
}

function setOpacity(obj, o) {
  obj.traverse((m) => {
    if (!m.material) return;
    m.material.transparent = true;
    m.material.opacity = o;
    m.visible = o > 0.01;
  });
}

/** Eyelids glued to the camera: close = 0 open … 1 shut (top and bottom meet, slightly curved). */
class Eyelids extends THREE.Mesh {
  constructor() {
    const uniforms = { close: { value: 0 } };
    super(
      new THREE.SphereGeometry(0.18, 24, 16),
      new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.BackSide,
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float close;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            float elev = abs(atan(d.y, max(-d.z, 0.0001)));
            float edge = (1.0 - close) * 1.35 - 0.12 - d.x * d.x * 0.35;
            float a = smoothstep(edge - 0.1, edge + 0.02, elev);
            gl_FragColor = vec4(0.02, 0.01, 0.01, a);
          }`,
      }),
    );
    this.uniforms = uniforms;
    this.renderOrder = 9500; // over the haze and reticle, under the fader
    this.frustumCulled = false;
    this.visible = false;
  }

  set close(v) {
    this.uniforms.close.value = v;
    this.visible = v > 0.001;
  }
  get close() {
    return this.uniforms.close.value;
  }
}

/** A loggia on Ithaca at dusk: columns, a parapet, the sea beyond; your old hands on your lap. */
export function buildLoggia(art) {
  const group = new THREE.Group();
  const stone = softMaterial({ color: '#c8b092', rim: '#ffd2a0', rimStrength: 0.35, hatch: 0 });
  const wall = softMaterial({ color: '#b88e68', rim: '#ffd2a0', rimStrength: 0.25, hatch: 45 });
  const terracotta = new THREE.MeshLambertMaterial({ color: '#7e3222' });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 5), softMaterial({ color: '#9c7e60', rim: '#ffd2a0', rimStrength: 0.2, hatch: 0 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -1.0);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(6, 5), new THREE.MeshLambertMaterial({ color: '#4a3226' }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 3.1, -1.0);
  group.add(floor, ceiling);

  // Side walls with a terracotta dado and a Greek key.
  const key = meanderTexture();
  key.repeat.set(10, 1);
  for (const side of [-1, 1]) {
    const ry = (-side * Math.PI) / 2;
    const w = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.1), wall);
    w.position.set(3 * side, 1.55, -1.0);
    w.rotation.y = ry;
    const dado = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.9), terracotta);
    dado.position.set(2.995 * side, 0.45, -1.0);
    dado.rotation.y = ry;
    const band = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.12), new THREE.MeshLambertMaterial({ map: key }));
    band.position.set(2.99 * side, 0.96, -1.0);
    band.rotation.y = ry;
    group.add(w, dado, band);
  }

  // The open side: a low parapet (low enough to see the sea over), four columns, an architrave.
  const parapet = new THREE.Mesh(new RoundedBoxGeometry(6, 0.62, 0.3, 2, 0.03), stone);
  parapet.position.set(0, 0.31, -3.35);
  const coping = new THREE.Mesh(new RoundedBoxGeometry(6.1, 0.08, 0.42, 2, 0.02), stone);
  coping.position.set(0, 0.64, -3.35);
  const frieze = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.14), new THREE.MeshLambertMaterial({ map: key }));
  frieze.position.set(0, 0.42, -3.19);
  const beam = new THREE.Mesh(new RoundedBoxGeometry(6.2, 0.36, 0.5, 2, 0.03), stone);
  beam.position.set(0, 2.95, -3.35);
  group.add(parapet, coping, frieze, beam);
  for (const x of [-2.35, -0.8, 0.8, 2.35]) {
    const c = doricColumn(stone, 2.8);
    c.position.set(x, 0, -3.35);
    group.add(c);
  }

  // Beyond: the engraved evening sky and the wine-dark sea far below.
  const sky = engravedSky({ top: SKY.top[0], horizon: SKY.horizon[0], sunDir: SUN, sunR: 0.05, cover: 0.45, cloudLow: '#8a6a86', cloudLit: '#ffd6a6', glory: '#ffc48a' });
  const sea = engravedSea({ deep: '#22324a', crest: '#d29a72', sunDir: SUN, fogColor: SKY.horizon[0].clone(), fogNear: 150, fogFar: 700, swell: 0.6, lines: 3.0, ink: 0.4 });
  sea.mesh.scale.set(3, 1, 3); // reach far enough toward the horizon from up on the cliff
  sea.mesh.position.y = -9;
  group.add(sky.mesh, sea.mesh);

  // The engraving of Argos knowing Ulysses, framed on the left wall.
  const gilt = softMaterial({ color: '#b08a4a', rim: '#ffe2a8', rimStrength: 0.5, hatch: 0 });
  let print = null;
  if (art.argus) {
    print = framedPainting(art.argus, 0.95, gilt);
    print.children[0].material = new THREE.MeshBasicMaterial({ map: art.argus, transparent: true, color: '#e8dccb' });
    print.position.set(-2.96, 1.75, -1.7);
    print.rotation.y = Math.PI / 2;
    group.add(print);
  }

  // Penelope (a real scan), who also waited, on the right, where the print of Argos faces her from the left.
  if (art.penelope) {
    const seat = new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.2, 0.72, 2, 0.03), stone);
    seat.position.set(1.72, 0.1, -2.55);
    seat.rotation.y = -0.45;
    const fig = new THREE.Mesh(art.penelope, marbleMaterial({ color: '#e8dcc8', through: '#ff9a5c' }));
    fig.position.set(1.72, 0.2, -2.55);
    fig.rotation.y = -0.45;
    fig.raycast = () => {};
    group.add(seat, fig);
  }

  // Argos, old, at your feet: Landseer's dog, a soft-edged apparition of paint.
  let argos = null;
  if (art.argos) {
    argos = new THREE.Group();
    const fig = cutout(art.argos, 0.85);
    fig.material.depthWrite = false;
    fig.material.alphaTest = 0;
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffcf8f', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    halo.position.set(0, 0.5, -0.05);
    halo.scale.setScalar(1.6);
    halo.raycast = () => {};
    argos.add(groundShadow(0.7), halo, fig);
    argos.position.set(0.45, 0, -1.05);
    argos.lookAt(0, 0, 0);
    argos.userData = { fig, halo };
    group.add(argos);
  }

  // Armrests and a himation over your knees.
  const wood = softMaterial({ color: '#5a3a28', rim: '#ffcf9a', rimStrength: 0.3, hatch: 90 });
  for (const x of [-0.34, 0.34]) {
    const arm = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.07, 0.6, 2, 0.02), wood);
    arm.position.set(x, 0.66, -0.15);
    group.add(arm);
  }
  const lap = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.12, 0.52, 3, 0.05), softMaterial({ color: '#5e4a6a', rim: '#ffd2a0', rimStrength: 0.35, hatch: 0 }));
  lap.position.set(0, 0.58, -0.32);
  group.add(lap);

  // Your hands, palms down on the cloth.
  const hands = [-1, 1].map((side) => {
    const h = new GiantHand({ side: -side, skin: '#d9b293', sleeve: '#5e4a6a', scale: 1 });
    h.place(new THREE.Vector3(0.13 * side, 0.68, -0.4), [Math.PI / 2 - 0.35, 0, Math.PI]);
    h.rotation.y = -0.25 * side;
    h.visible = true;
    h.targetCurl = 0.35;
    h.base = h.position.clone();
    return h;
  });

  // Low sun from the sea, through the columns.
  const hemi = new THREE.HemisphereLight('#ffd9b0', '#3a2a2a', 1.0);
  const sun = new THREE.DirectionalLight('#ffb070', 1.4);
  sun.position.copy(SUN).multiplyScalar(10);
  group.add(hemi, sun);

  return { group, sky, sea, hemi, sun, hands, argos, print };
}

/** 7B · Letting go: no one to lose, no one to hold. A long life alone; you close your eyes. */
export class EndLetGoScene extends BaseScene {
  skipTo = 'afterlife';
  skipParams = { ending: 'letgo' };

  async enter() {
    const { ctx } = this;
    ctx.audio.define('breath', breath);
    ctx.rig.position.set(0, EYE, 0);
    ctx.haze.set({ amount: 0.2, color: '#f4ece2', blur: 0.8, saturate: 0.85 });
    ctx.grain.set({ grain: 0.06, vignette: 0.35, color: '#6b4a34' });

    const [nArt, art, penelope] = await Promise.all([nurseryArt(), loadArt('endings', ['argos', 'argus']), loadMarble('art/scans/penelope.bin')]);
    this.art = { ...art, penelope };
    this.nursery = buildNursery(nArt);
    this.add(this.nursery.group);
    const n = this.nursery;
    n.mother.lean = 0.3;
    n.motherHand.place(new THREE.Vector3(-0.02, 0.88, -0.72), [Math.PI * 0.78, 0, 0]);
    n.motherHand.visible = true;
    n.motherHand.targetCurl = 0.05;
    this.babyHand = this.add(new GiantHand({ side: 1, skin: '#f2cdb4', sleeve: '#f3ebe0', scale: 0.5 }));
    this.babyHand.place(new THREE.Vector3(-0.03, 0.655, -0.5), [-0.5, 0, 0.1]);
    this.babyHand.visible = true;

    this.lids = new Eyelids();
    ctx.camera.add(this.lids);
    this.tremble = 0;
    this.dusk = 0;
    return ctx.audio.preload(['moonlight', 'breath']);
  }

  exit() {
    this.ctx.camera.remove(this.lids);
    this.lids.geometry.dispose();
    this.lids.material.dispose();
  }

  async guard(promise) {
    await promise;
    if (!this.alive) await new Promise(() => {});
  }

  async start() {
    const { audio, haze, fader, rig, scene, input } = this.ctx;
    const T = this.ctx.content.END_LETGO;
    const M = this.ctx.content.MYTHS.endLetGo;
    const n = this.nursery;
    audio.playMusic('moonlight', { volume: 0.45, fade: 3 });
    audio.muffleMusic(20000, 3);

    // You pull your hand back; hers withdraws, open and empty.
    await this.wait(1);
    this.babyHand.moveTo(this, new THREE.Vector3(-0.05, 0.45, -0.25), [Math.PI / 2 + 0.6, 0, Math.PI], 2.5);
    n.motherHand.moveTo(this, new THREE.Vector3(-0.4, 2.7, -1.0), [Math.PI * 0.55, 0, 0], 4);
    await this.say(T.lines[0], { hold: 1.5 });
    this.babyHand.visible = false;

    // They leave. The seasons turn. The room empties.
    const m0 = n.mother.position.clone();
    const f0 = n.father.position.clone();
    this.tween(5, (k) => {
      n.mother.position.set(m0.x + k * 0.6, 0, m0.z - k * 1.4);
      n.father.position.set(f0.x - k * 0.4, 0, f0.z - k * 1.2);
      setOpacity(n.mother, 1 - k);
      setOpacity(n.father, 1 - k);
    });
    await Promise.all([this.say(T.lines[1], { hold: 2.5 }), this.seasons(11)]);

    // Many years later: a loggia over the sea, at the end of the day.
    await this.guard(fader.fade(1, 1.5, '#000000'));
    this.drop(this.nursery.group);
    this.drop(this.babyHand);
    this.nursery = null;
    this.old = buildLoggia(this.art);
    this.add(this.old.group, ...this.old.hands);
    scene.background = SKY.horizon[0].clone();
    scene.fog = null;
    rig.position.set(0, SEATED, 0);
    haze.set({ amount: 0.15, color: '#ffd9b0', blur: 0.5, saturate: 0.8 });
    this.scroll = this.add(cartouche(2.4, 0.95));
    this.scroll.position.set(0, 2.25, -3.0);
    this.scroll.lookAt(0, SEATED + 0.3, 0);
    this.writer = new ScrollWriter(this, this.scroll);
    audio.fadeMusic(0.3, 3);
    await this.guard(fader.fade(0, 2.5));

    const breathing = await this.sound('breath', { loop: true, volume: 0 });
    audio.fade(breathing, 0.35, 3);

    // You grow old; the sun sinks toward the sea (it sets only once Argos is gone).
    const o = this.old;
    const young = handTint('#d9b293');
    const aged = handTint('#cbbcb0');
    this.tween(20, (k) => {
      for (const h of o.hands) h.skinMat.color.lerpColors(young, aged, k);
      this.tremble = k * 0.004;
    });
    this.tween(30, (k) => (this.dusk = Math.max(this.dusk, 0.45 * k)), ease.linear);

    // Argos at your feet; look at him, and he knows you.
    await this.wait(3);
    const dog = o.argos;
    if (dog) {
      await this.writer.say(M.text, { source: M.source, hold: 1 });
      let known = false;
      input.add(dog.userData.fig, { onSelect: () => (known = true), dwell: 1.0 });
      dog.userData.fig.raycast = THREE.Mesh.prototype.raycast;
      await this.until(() => known, 6);
      input.remove(dog.userData.fig);
      dog.userData.fig.raycast = () => {};
      this.tween(2, (k) => (dog.userData.halo.material.opacity = 0.35 * Math.sin(k * Math.PI * 0.5)));
      for (const h of o.hands) h.targetCurl = 0.7; // your fingers move toward him
      await this.wait(1.5);
      // He dies as soon as he has known you: his paint goes to light, then to nothing.
      this.writer.say(M.death, { source: M.source, hold: 2 });
      await this.tween(7, (k) => {
        dog.userData.fig.material.opacity = 1 - k;
        dog.userData.fig.material.color.setScalar(1 + k * 0.4);
        dog.userData.halo.material.opacity = 0.35 * (1 - k);
        dog.children[0].material.opacity = 0.55 * (1 - k);
      }, ease.inOut);
      for (const h of o.hands) h.targetCurl = 0.35;
      await this.wait(1);
      await this.writer.hide(1);
    }

    // Now the sun goes down into the sea, and night comes.
    const d0 = this.dusk;
    this.tween(24, (k) => (this.dusk = lerp(d0, 1, k)), ease.inOut);
    await this.say(T.lines[2], { hold: 3 });
    await this.until(() => this.dusk > 0.6, 20);
    await this.say(T.fragment, { narrate: false, hold: 3 });

    // You close your eyes: heavy, a blink, then shut.
    this.say(T.lines[3], { hold: 2 });
    await this.tween(2.5, (k) => (this.lids.close = 0.55 * k));
    await this.tween(1.2, (k) => (this.lids.close = 0.55 - 0.2 * k));
    audio.fade(breathing, 0, 5);
    audio.fadeMusic(0, 6);
    await this.tween(4.5, (k) => (this.lids.close = 0.35 + 0.65 * k), ease.inOut);
    await this.wait(2.5);
    this.next('afterlife', { ending: 'letgo' }, { color: '#000000', out: 2, in: 2 });
  }

  /** `seconds` of seasons turning in the window; the room empties. */
  seasons(seconds) {
    const n = this.nursery;
    const colors = ['#dff0c8', '#fff3d6', '#f2c58c', '#dde6f0', '#dff0c8', '#fff3d6', '#f2c58c', '#dde6f0'].map((c) => new THREE.Color(c));
    let mobileGone = false;
    return this.tween(
      seconds,
      (k) => {
        const s = k * (colors.length - 1);
        const i = Math.min(colors.length - 2, Math.floor(s));
        n.windowMat.color.lerpColors(colors[i], colors[i + 1], s - i);
        n.hemi.intensity = lerp(1.6, 0.9, k);
        n.lamp.intensity = 3 * (1 - k);
        n.shadeMat.color.setRGB(1 - k * 0.6, 0.85 - k * 0.5, 0.63 - k * 0.4);
        n.mobile.scale.setScalar(Math.max(0.001, 1 - k * 2));
        if (k > 0.5 && !mobileGone) {
          mobileGone = true;
          n.mobile.visible = false;
        }
        this.ctx.haze.set({ amount: 0.2 + k * 0.4 });
      },
      ease.linear,
    );
  }

  /** Dusk at k (0 golden … 1 night): sky, sea, sun and the light in the loggia. */
  applyDusk(k, t) {
    const o = this.old;
    const { u: sky } = o.sky;
    const { u: sea } = o.sea;
    stops(SKY.top, k, sky.top.value);
    stops(SKY.horizon, k, sky.horizon.value);
    sky.sunDir.value.set(SUN.x, lerp(0.07, -0.08, k), SUN.z).normalize();
    sky.time.value = t;
    sea.fogColor.value.copy(sky.horizon.value);
    sea.sunDir.value.copy(sky.sunDir.value);
    sea.crest.value.setRGB(lerp(0.82, 0.25, k), lerp(0.6, 0.22, k), lerp(0.45, 0.3, k));
    sea.time.value = t * 0.4;
    this.ctx.scene.background.copy(sky.horizon.value);
    o.hemi.intensity = lerp(1.0, 0.25, k);
    o.sun.intensity = lerp(1.4, 0, Math.min(1, k * 1.5));
    if (o.print) o.print.children[0].material.color.setScalar(lerp(0.92, 0.35, k));
  }

  onSelectNothing() {
    // Your hands, empty, close a little — nothing to hold.
    for (const h of this.old ? this.old.hands : []) {
      h.targetCurl = 0.8;
      this.wait(0.6).then(() => (h.targetCurl = 0.35));
    }
  }

  update(dt, t) {
    super.update(dt, t);
    if (this.nursery) this.nursery.update(t, dt);
    if (this.old) {
      this.applyDusk(this.dusk, t);
      for (const [i, h] of this.old.hands.entries()) {
        h.position.copy(h.base);
        h.position.x += Math.sin(t * 9 + i * 2) * this.tremble;
        h.position.y += Math.sin(t * 11.3 + i) * this.tremble * 0.6;
      }
    }
  }
}
