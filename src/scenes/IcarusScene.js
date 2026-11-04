import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BaseScene } from '../core/SceneManager.js';
import { ease, lerp } from '../core/util.js';
import { softMaterial } from '../core/look.js';
import { engravedSky, engravedSea } from '../core/engraved.js';
import { loadArt, cutout } from '../core/collage.js';
import { GiantHand } from './nursery.js';

// Scene 3 — Icarus (Ovid, Metamorphoses VIII). A past life.
//
// First you watch from the sky, like a god: Daedalus and his son fly over a
// hand-coloured engraved Aegean — islands, a lighthouse, fishermen who take them
// for gods. Icarus climbs toward the sun. Look at him, and you become him:
// the wax gives, the feathers leave your arms, his father calls, and you fall.
//
// Look: mixed media. Daedalus and Icarus are cut out of Jacob Peter Gowy's
// "Fall of Icarus" (after Rubens, 1636); the boat and rock from Bernard Picart's
// engraving (1731); sky, sea and land are engraved 3D in the same hand.
//
// Comfort: the rig never moves. Flight and the fall are the world moving.

const SKY_TOP = '#5c84b3';
const SKY_HORIZON = new THREE.Color('#d6dccf');
const WHITE = new THREE.Color('#fffaf0');
const UNDERWATER = '#0b3d4b';
const SPEED = 4; // apparent drift of the sea, m/s

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _zero = new THREE.Vector3(0, 0, 0);

/** Fingers forward (turned by `yaw`), palm rolled by `roll` around the finger axis. */
function handRotation(yaw, roll) {
  return new THREE.Quaternion()
    .setFromAxisAngle(Y, yaw)
    .multiply(_q2.setFromAxisAngle(X, -Math.PI / 2))
    .multiply(_q3.setFromAxisAngle(Y, roll));
}

/** One feather: a long leaf shape lying along -X, quill at the origin. */
function featherShape(len, w) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(-len * 0.25, w * 0.6, -len * 0.8, w * 0.55, -len, 0);
  s.bezierCurveTo(-len * 0.8, -w * 0.45, -len * 0.25, -w * 0.5, 0, 0);
  return s;
}

/** A wing: a fan of feathers spreading from the shoulder along -X. */
function wingGeometry(scale = 1) {
  const parts = [];
  for (let i = 0; i < 8; i++) {
    const len = (1.05 - i * 0.08) * scale;
    const g = new THREE.ShapeGeometry(featherShape(len, 0.2 * scale), 8);
    g.rotateZ(0.5 - i * 0.12);
    g.translate(0, 0, i * 0.004);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

function offline(seconds) {
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  return new Ctx(1, Math.ceil(44100 * seconds), 44100);
}

function noiseSource(ctx, seconds) {
  const buf = ctx.createBuffer(1, Math.ceil(44100 * seconds), 44100);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

/** Loopable rushing air. */
function windSound() {
  const secs = 4;
  const ctx = offline(secs);
  const src = noiseSource(ctx, secs);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.7;
  bp.frequency.setValueCurveAtTime(new Float32Array([450, 900, 600, 1300, 700, 450]), 0, secs);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  const g = ctx.createGain();
  g.gain.value = 0.9;
  src.connect(bp).connect(lp).connect(g).connect(ctx.destination);
  src.start(0);
  return ctx.startRendering();
}

/** Hitting the water: a low thud and a burst of spray that closes over you. */
function splashSound() {
  const secs = 2;
  const ctx = offline(secs);
  const src = noiseSource(ctx, secs);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(4000, 0);
  lp.frequency.exponentialRampToValueAtTime(250, 1.2);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.9, 0);
  ng.gain.exponentialRampToValueAtTime(0.001, 1.8);
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(70, 0);
  osc.frequency.exponentialRampToValueAtTime(35, 0.8);
  const og = ctx.createGain();
  og.gain.setValueAtTime(1, 0);
  og.gain.exponentialRampToValueAtTime(0.001, 1.0);
  src.connect(lp).connect(ng).connect(ctx.destination);
  osc.connect(og).connect(ctx.destination);
  src.start(0);
  osc.start(0);
  return ctx.startRendering();
}

export class IcarusScene extends BaseScene {
  skipTo = 'crib';
  skipParams = { phase: 'hearing' };

  async enter() {
    const { ctx } = this;
    const { scene, audio } = ctx;

    this.alt = 9; // your height above the sea
    this.travel = 0;
    this.whiteout = 0;
    this.sunDir = new THREE.Vector3(0.15, Math.sin(0.55), -Math.cos(0.55)).normalize();
    this.sunR = 0.035; // angular radius (rad)
    this.fogColor = SKY_HORIZON.clone();
    scene.background = SKY_HORIZON.clone();
    scene.fog = new THREE.Fog(SKY_HORIZON.clone(), 30, 190);
    ctx.grain.set({ grain: 0.05, vignette: 0.32, color: '#2a1c14' });

    audio.define('icarus-wind', windSound);
    audio.define('icarus-splash', splashSound);
    const [T] = await Promise.all([loadArt('icarus', ['daedalus', 'icarus', 'boat', 'rock']), audio.preload(['icarus', 'icarus-wind', 'icarus-splash'])]);

    // ---------- sky: hand-coloured engraving (lines, outlined clouds, a sun in glory) ----------
    const sky = engravedSky({ top: SKY_TOP, horizon: SKY_HORIZON, sunDir: this.sunDir, sunR: this.sunR, cover: 0.45 });
    this.skyU = sky.u;
    this.add(sky.mesh);

    // ---------- world: sea, islands, boat (moves vertically for altitude) ----------
    this.world = this.add(new THREE.Group());
    const sea = engravedSea({ sunDir: this.sunDir, fogColor: this.fogColor });
    this.seaU = sea.u;
    this.world.add(sea.mesh);

    // Islands of the Aegean: Samos, Delos, Paros — green headlands, white towns, a lighthouse.
    const landMat = softMaterial({ color: '#8d9a5c', rim: '#f6ecc8', rimStrength: 0.35, hatch: 5 });
    const rockMat = softMaterial({ color: '#9b8a72', rim: '#f6ecc8', rimStrength: 0.3, hatch: 6 });
    const wallMat = softMaterial({ color: '#efe6d2', rim: '#fff6e0', rimStrength: 0.3, hatch: 10 });
    const roofMat = softMaterial({ color: '#c46d4a', rim: '#ffe0c0', rimStrength: 0.3, hatch: 10 });
    const cypressMat = softMaterial({ color: '#2f3b24', rim: '#f2e3b0', rimStrength: 0.4, hatch: 10 });
    const cypressGeo = new THREE.LatheGeometry(
      [[0, 0], [0.32, 0.15], [0.55, 0.8], [0.58, 1.6], [0.45, 2.5], [0.24, 3.3], [0.06, 3.85], [0, 4]].map(([r, y]) => new THREE.Vector2(r, y)),
      14,
    );
    const island = (x, z, sx, sz, h, { town = 0, cypresses = 0, lighthouse = false, cliff = false } = {}) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const land = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2), cliff ? rockMat : landMat);
      land.scale.set(sx, h, sz);
      g.add(land);
      let seed = Math.abs(Math.round(x * 13 + z * 7)) + 1;
      const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
      const groundAt = (px) => h * Math.sqrt(Math.max(0, 1 - (px / sx) ** 2));
      for (let i = 0; i < town; i++) {
        const w = 1.2 + rnd() * 1.6;
        const hh = 1.2 + rnd() * 2.2;
        const house = new THREE.Mesh(new THREE.BoxGeometry(w, hh, 1.4 + rnd()), wallMat);
        const px = (rnd() - 0.5) * sx * 1.1;
        house.position.set(px, groundAt(px) * 0.9 + hh / 2 - 0.3, (rnd() - 0.3) * sz * 0.5);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.75, 0.9, 4), roofMat);
        roof.rotation.y = Math.PI / 4;
        roof.position.set(px, house.position.y + hh / 2 + 0.4, house.position.z);
        g.add(house, roof);
      }
      for (let i = 0; i < cypresses; i++) {
        const t = new THREE.Mesh(cypressGeo, cypressMat);
        const px = (rnd() - 0.5) * sx * 1.2;
        t.position.set(px, groundAt(px) * 0.85 - 0.2, (rnd() - 0.5) * sz * 0.4);
        t.scale.set(1.2, 1.1 + rnd() * 0.6, 1.2);
        g.add(t);
      }
      if (lighthouse) {
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 9, 20), wallMat);
        tower.position.set(sx * 0.6, groundAt(sx * 0.6) + 3.5, 0);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.6, 20), roofMat);
        cap.position.set(sx * 0.6, tower.position.y + 5.3, 0);
        g.add(tower, cap);
      }
      g.traverse((o) => (o.raycast = () => {}));
      this.world.add(g);
      return g;
    };
    island(-60, -120, 38, 14, 9, { town: 14, cypresses: 6, lighthouse: true }); // Samos
    island(55, -140, 30, 12, 13, { town: 6, cypresses: 4 }); // Paros
    island(-115, -40, 22, 22, 6, { cypresses: 5 });
    island(95, -60, 18, 14, 10, { cliff: true });
    island(10, -175, 44, 10, 7, { town: 9 }); // Delos, far
    // Picart's rock, close by on the right
    if (T.rock) {
      this.rock = cutout(T.rock, 9);
      this.rock.position.set(26, -0.5, -38);
      this.rock.lookAt(0, 3, 0);
      this.world.add(this.rock);
    }
    // The fishermen, who take the two of them for gods
    if (T.boat) {
      this.boat = cutout(T.boat, 5);
      this.boat.position.set(-7, -0.4, -15);
      this.boat.lookAt(0, 1.4, 0);
      this.world.add(this.boat);
    }

    // ---------- the two flyers ----------
    const featherMat = softMaterial({ color: '#f4ecdc', rim: '#ffe2a8', rimPower: 1.6, rimStrength: 0.55, hatch: 26, umber: '#a88e70', side: THREE.DoubleSide });
    const wingGeo = wingGeometry(1);
    const addWings = (parent, at, scale) =>
      [-1, 1].map((side) => {
        const pivot = new THREE.Group();
        pivot.position.copy(at);
        const w = new THREE.Mesh(wingGeo, featherMat);
        w.scale.set(side * scale, scale, scale);
        w.position.z = -0.03;
        w.raycast = () => {};
        pivot.add(w);
        parent.add(pivot);
        return pivot;
      });

    // Daedalus: Gowy's figure; his painted wings were lost in the cut, so he wears engraved ones.
    this.daedalus = new THREE.Group();
    if (T.daedalus) {
      this.daedalus.add(cutout(T.daedalus, 2.1, { anchor: 'center' }));
      this.daedalusWings = addWings(this.daedalus, new THREE.Vector3(0.2, 0.35, 0), 1.25);
    }
    this.daedalus.position.set(-4.2, 0.2, -6);
    this.root.add(this.daedalus);

    // Icarus: Gowy's falling boy; turned upright he is reaching for the sun.
    this.icarus = new THREE.Group();
    if (T.icarus) {
      this.icarusFig = cutout(T.icarus, 2.3, { anchor: 'center' });
      this.icarusFig.rotation.z = Math.PI;
      this.icarus.add(this.icarusFig);
      this.icarusWings = addWings(this.icarus, new THREE.Vector3(-0.15, 0.2, 0), 1.1);
    }
    this.icarus.position.set(-1.6, 0.9, -5.5);
    this.root.add(this.icarus);
    // Looking at him is how you become him.
    this.icarusHit = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.icarus.add(this.icarusHit);

    // Loose feathers: real feathers that tumble through the air.
    this.FEATHERS = 70;
    this.feathers = Array.from({ length: this.FEATHERS }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), s: new THREE.Vector3() }));
    const fGeo = new THREE.ShapeGeometry(featherShape(0.26, 0.07), 6);
    fGeo.translate(0.13, 0, 0);
    this.featherMesh = new THREE.InstancedMesh(fGeo, softMaterial({ color: '#f8f1e4', rim: '#ffe6b0', rimStrength: 0.6, hatch: 22, umber: '#b49a7a', side: THREE.DoubleSide }), this.FEATHERS);
    this.featherMesh.frustumCulled = false;
    this.featherMesh.raycast = () => {};
    this.root.add(this.featherMesh);
    this.shedFrom = null; // Object3D the feathers come off
    this.shed = 0; // per second
    this._shedAcc = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this.feathers.forEach((f, i) => this.featherMesh.setMatrixAt(i, this._m.makeScale(0, 0, 0)));

    // ---------- you, once you are Icarus: your arms, feathered ----------
    this.me = new THREE.Group();
    this.me.visible = false;
    this.root.add(this.me);
    this.myHands = [-1, 1].map((side) => {
      const h = new GiantHand({ side, skin: '#e9bb96', sleeve: '#e9bb96', scale: 1.15 });
      h.visible = true;
      h.position.set(0.32 * side, -0.25, -0.5);
      h.quaternion.copy(handRotation(0.45 * side, (Math.PI / 2) * side));
      h.targetCurl = 0.2;
      this.me.add(h);
      return h;
    });
    this.armFeathers = [];
    for (const h of this.myHands) {
      for (let i = 0; i < 9; i++) {
        const f = new THREE.Mesh(fGeo, this.featherMesh.material);
        f.scale.setScalar(1.6);
        f.position.set(0.02, -0.12 - i * 0.045, -0.02);
        f.rotation.set(0, 0, -1.2 + i * 0.05);
        f.raycast = () => {};
        h.add(f);
        this.armFeathers.push(f);
      }
    }

    // ---------- light, words ----------
    this.hemi = new THREE.HemisphereLight('#dbe6f0', '#4f7f7a', 1.3);
    this.sun = new THREE.DirectionalLight('#fff0d6', 1.8);
    this.root.add(this.hemi, this.sun);

  }

  async start() {
    const { audio, input, haze, fader } = this.ctx;
    const M = this.ctx.content.MYTHS.icarus;
    const C = this.ctx.content.ICARUS;

    audio.playMusic('icarus', { volume: 0.55, fade: 3 });
    this.wind = await this.sound('icarus-wind', { loop: true, volume: 0.1 });

    // They fly in together. The father's warning; the fishermen look up.
    this.flying = true;
    await this.wait(1.5);
    await this.say(M.warning, { hold: 1.5 });
    await this.say(M.onlookers, { hold: 1.5 });

    // The boy climbs toward the sun; the father falls behind.
    this.climbing = true;
    audio.fadeMusic(0.85, 10);
    const ic0 = this.icarus.position.clone();
    this.shedFrom = this.icarus;
    this.tween(
      12,
      (k) => {
        this.icarus.position.set(lerp(ic0.x, 2.5, k), lerp(ic0.y, 9, k * k), lerp(ic0.z, -16, k));
        this.sunR = lerp(0.035, 0.09, k * k);
        this.whiteout = 0.22 * k * k;
        this.shed = 2 + 10 * k;
      },
      ease.inOut,
    );

    // Look at him (or wait) — and become him.
    let chosen = false;
    await this.wait(4);
    input.add(this.icarusHit, { onSelect: () => (chosen = true), dwell: 1.2 });
    await this.until(() => chosen, 9);
    input.remove(this.icarusHit);
    this.climbing = false;
    this.shed = 0;

    // ---- you are Icarus ----
    await fader.fade(1, 0.6, '#ffffff');
    this.icarus.visible = false;
    this.me.visible = true;
    this.alt = 60;
    this.sunR = 0.16;
    this.whiteout = 0.35;
    this.daedalus.position.set(-4, 3.5, -7);
    if (this.boat) this.boat.visible = false;
    haze.set({ color: '#fffaf0', amount: 0.25 });
    await fader.fade(0, 1.2);

    // The wax softens; the feathers leave your arms one by one.
    audio.fade(this.wind, 0.35, 4);
    this.armFeathers.forEach((f, i) => this.wait(0.25 + i * 0.22).then(() => this.release(f)));
    this.tween(4, (k) => (this.whiteout = lerp(0.35, 0.85, k)), ease.in);
    await this.wait(4.5);

    // His father calls. You fall.
    for (const h of this.myHands) h.targetCurl = 0.9;
    this.say(M.lament, { hold: 0.6 }).then(() => this.say(C.fragment, { narrate: false, hold: 1.5 }));
    audio.muffleMusic(600, 2.5);
    audio.fadeMusic(0.35, 2.5);
    audio.fade(this.wind, 0.95, 2);
    const a0 = this.alt;
    this.tween(2, (k) => (this.whiteout = lerp(0.85, 0.08, k)), ease.out);
    this.tween(5, (k) => {
      for (const h of this.myHands) h.position.y = -0.25 + 0.5 * k; // arms thrown up by the fall
    });
    this.shedFrom = this.me;
    this.shed = 20;
    await this.tween(5, (k) => (this.alt = lerp(a0, 0.5, k)), ease.in);
    this.shed = 0;

    // Into the sea.
    this.sound('icarus-splash', { volume: 1 });
    audio.fade(this.wind, 0, 0.3);
    audio.stopMusic(1.5);
    haze.set({ color: UNDERWATER, amount: 0.65 });
    this.ctx.scene.background = new THREE.Color(UNDERWATER);
    this.whiteout = 0;
    this.me.visible = false;
    await this.wait(3);
    this.next('crib', { phase: 'hearing' }, { color: '#ffffff', out: 1.5, in: 2 });
  }

  /** A feather comes off your arm and drifts up and away (you are falling; it is not). */
  release(f) {
    f.getWorldPosition(_v);
    f.visible = false;
    const slot = this.feathers.find((x) => x.life <= 0);
    if (!slot) return;
    slot.life = 1.4;
    slot.p.copy(_v);
    slot.v.set((Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 0.8, -0.2 + Math.random() * 0.4);
    slot.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    slot.s.set(1.6, 1.6, 1.6);
  }

  onSelectNothing() {}

  update(dt, t) {
    super.update(dt, t);
    this.travel += SPEED * dt;

    // sun, sky, sea
    this.skyU.sunR.value = this.sunR;
    this.skyU.whiteout.value = this.whiteout;
    this.skyU.time.value = t;
    this.sun.position.copy(this.sunDir).multiplyScalar(100);
    this.fogColor.copy(SKY_HORIZON).lerp(WHITE, this.whiteout);
    this.ctx.scene.fog.color.copy(this.fogColor);
    this.seaU.glare.value = this.whiteout;
    this.seaU.time.value = t;
    this.seaU.travel.value = this.travel;
    this.world.position.y = -this.alt;
    this.seaU.seaLevel.value = this.world.position.y;

    // flyers: slow wingbeats, gentle drift around you
    const beat = (pivots, phase) => {
      if (!pivots) return;
      const f = Math.sin(t * 2.0 + phase) * 0.35;
      pivots[0].rotation.y = 0.25 + f;
      pivots[1].rotation.y = -0.25 - f;
    };
    beat(this.daedalusWings, 0);
    beat(this.icarusWings, 0.8);
    if (this.flying) {
      this.daedalus.position.x += Math.sin(t * 0.2) * 0.004;
      this.daedalus.position.y += Math.sin(t * 0.9) * 0.002;
      if (!this.climbing) this.icarus.position.y += Math.sin(t * 0.9 + 1) * 0.002;
    }
    this.daedalus.lookAt(0, this.daedalus.position.y, 0);
    this.icarus.lookAt(0, this.icarus.position.y, 0);
    if (this.icarusFig) this.icarusFig.rotation.z = Math.PI + Math.sin(t * 0.7) * 0.06;
    if (this.boat) this.boat.position.y = -0.25 + Math.sin(t * 1.1) * 0.08;

    for (const h of this.myHands) h.update(t, dt);

    // feathers: spawn from the shedding figure, flutter, fade
    if (this.shedFrom && this.shed > 0) {
      this._shedAcc = Math.min(this._shedAcc + this.shed * dt, 6);
      this.shedFrom.getWorldPosition(_v);
      const falling = this.shedFrom === this.me;
      for (const f of this.feathers) {
        if (this._shedAcc < 1) break;
        if (f.life > 0) continue;
        this._shedAcc -= 1;
        f.life = 1;
        f.p.set(_v.x + (Math.random() - 0.5) * 1.2, _v.y + (Math.random() - 0.5) * 0.6, _v.z + (Math.random() - 0.5) * 0.6);
        f.v.set((Math.random() - 0.5) * 0.6, falling ? 2 + Math.random() * 2 : -0.4 - Math.random() * 0.6, falling ? -0.5 : 0.5 + Math.random());
        f.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        const s = falling ? 1.6 : 1.1;
        f.s.set(s, s, s);
      }
    }
    this.feathers.forEach((f, i) => {
      if (f.life > 0) {
        f.life -= dt * 0.22;
        f.p.addScaledVector(f.v, dt);
        f.p.x += Math.sin(t * 2.3 + i) * dt * 0.4; // flutter
        f.r.x += dt * 1.3;
        f.r.z += dt * (0.8 + (i % 3) * 0.4);
        this._q.setFromEuler(f.r);
        this._m.compose(f.p, this._q, f.life > 0 ? f.s : _zero);
      } else this._m.makeScale(0, 0, 0);
      this.featherMesh.setMatrixAt(i, this._m);
    });
    this.featherMesh.instanceMatrix.needsUpdate = true;
  }
}
