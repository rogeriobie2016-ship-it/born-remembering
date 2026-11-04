import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BaseScene } from '../core/SceneManager.js';
import { ease, glowTexture, lerp } from '../core/util.js';
import { softMaterial, paintedTexture } from '../core/look.js';
import { engravedSky, engravedSea } from '../core/engraved.js';
import { loadArt, cutout } from '../core/collage.js';
import { rustle, birds, darkWater } from '../core/ambience.js';
import { GiantHand } from './nursery.js';

// Scene 3 — Icarus (Ovid, Metamorphoses VIII). A past life.
//
// First you watch from the sky, like a god: Daedalus and his son fly over a hand-coloured engraved
// Aegean, clouds in layers below and around you, fishermen who take them for gods. The sun is a presence:
// look at it and it swells, and the boy climbs to it. Feathers fall past you; catch them. Clouds near you
// part at a touch. Look at him, and you become him: every beat of your arms takes you closer,
// the wax runs, the feathers leave your arms, his father calls, and you fall.
//
// Look: mixed media. Daedalus and Icarus are cut out of Jacob Peter Gowy's "Fall of Icarus" (after Rubens,
// 1636); the boat and rock are scissored from Bernard Picart's engraving (1731); sky, sea and land are
// engraved 3D in the same hand.
//
// Comfort: the rig never moves. Flight and the fall are the world moving.

const SKY_TOP = '#5c84b3';
const SKY_HORIZON = new THREE.Color('#d6dccf');
const WHITE = new THREE.Color('#fffaf0');
const UNDERWATER = '#0b3d4b';
const SPEED = 4; // apparent drift of the sea, m/s
const CATCHABLE = 9; // feathers within reach
const PUFFS = 8; // clouds within reach
const WAX = 40;
const CLIMB_ALONE = 1 / 34; // the boy climbs by himself, slowly...
const CLIMB_WATCHED = 1 / 11; // ...and quickly with the sun's eye on him
const SUN_CONE = Math.cos(0.3);
const HEAT_PER_BEAT = 0.13;

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _fwd = new THREE.Vector3();
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

/** The sun's voice: low, and beating. It is only heard when you look. */
function sunSound() {
  const secs = 6;
  const ctx = offline(secs);
  const g = ctx.createGain();
  g.gain.value = 0.34;
  g.connect(ctx.destination);
  // whole periods in six seconds, so the loop has no seam
  for (const [f, a] of [[55, 0.5], [55 + 1 / 3, 0.5], [110, 0.22], [165 + 1 / 2, 0.12]]) {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    const og = ctx.createGain();
    og.gain.value = a;
    o.connect(og).connect(g);
    o.start(0);
  }
  return ctx.startRendering();
}

/** A sun in glory, as an engraver draws it: straight rays and flaming rays by turns. */
function sunTexture() {
  return paintedTexture(1024, 1024, (c, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const R = w * 0.2;
    const halo = c.createRadialGradient(cx, cy, R * 0.5, cx, cy, w * 0.5);
    halo.addColorStop(0, 'rgba(255,240,190,0.95)');
    halo.addColorStop(0.4, 'rgba(255,226,150,0.35)');
    halo.addColorStop(1, 'rgba(255,220,140,0)');
    c.fillStyle = halo;
    c.fillRect(0, 0, w, h);
    const rays = 32;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const wavy = i % 2 === 1;
      const len = R * (wavy ? 1.15 : 1.42);
      c.save();
      c.translate(cx, cy);
      c.rotate(a);
      c.beginPath();
      const half = R * 0.095;
      c.moveTo(R * 0.92, -half);
      if (wavy) {
        c.bezierCurveTo(R + len * 0.3, -half * 2.4, R + len * 0.5, half * 1.2, R + len, 0);
        c.bezierCurveTo(R + len * 0.5, half * 2.6, R + len * 0.3, -half * 0.4, R * 0.92, half);
      } else {
        c.lineTo(R + len, 0);
        c.lineTo(R * 0.92, half);
      }
      c.closePath();
      c.fillStyle = wavy ? '#f6b84c' : '#ffdf8c';
      c.fill();
      c.strokeStyle = 'rgba(120,70,20,0.75)';
      c.lineWidth = 2;
      c.stroke();
      c.restore();
    }
    const disc = c.createRadialGradient(cx - R * 0.2, cy - R * 0.2, R * 0.1, cx, cy, R);
    disc.addColorStop(0, '#fff8d8');
    disc.addColorStop(0.7, '#ffe08a');
    disc.addColorStop(1, '#f2ac44');
    c.fillStyle = disc;
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(120,70,20,0.8)';
    c.lineWidth = 3;
    c.stroke();
    // the engraver's lines, following the round of it
    c.lineWidth = 1;
    for (let i = 1; i < 9; i++) {
      c.strokeStyle = `rgba(130,80,20,${0.05 + i * 0.022})`;
      c.beginPath();
      c.arc(cx, cy, R * (0.2 + i * 0.09), 0.2, 2.9);
      c.stroke();
    }
  });
}

/** One feather, close enough to look at: a quill, and barbs drawn by hand. */
export function featherTexture() {
  return paintedTexture(128, 512, (c, w, h) => {
    const cx = w / 2;
    c.beginPath();
    c.moveTo(cx, 18);
    c.bezierCurveTo(cx + 60, 90, cx + 54, 330, cx + 6, 410);
    c.lineTo(cx - 6, 410);
    c.bezierCurveTo(cx - 54, 330, cx - 60, 90, cx, 18);
    c.fillStyle = '#f6efe0';
    c.fill();
    c.save();
    c.clip();
    for (let y = 26; y < 420; y += 4) {
      c.strokeStyle = `rgba(120,96,70,${0.2 + Math.random() * 0.22})`;
      c.lineWidth = 1;
      for (const side of [-1, 1]) {
        c.beginPath();
        c.moveTo(cx, y + 22);
        c.quadraticCurveTo(cx + side * 24, y + 14, cx + side * 60, y);
        c.stroke();
      }
    }
    // it has been near the sun: scorched at the tip
    const g = c.createLinearGradient(0, 0, 0, 170);
    g.addColorStop(0, 'rgba(150,90,30,0.75)');
    g.addColorStop(1, 'rgba(150,90,30,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, 170);
    c.restore();
    c.strokeStyle = '#8a7350';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(cx, 26);
    c.lineTo(cx, 500);
    c.stroke();
    // a bead of wax still on the quill
    c.fillStyle = '#e9c066';
    c.beginPath();
    c.ellipse(cx, 470, 9, 22, 0, 0, Math.PI * 2);
    c.fill();
  });
}

/** Cards of cloud that always face you, drifting past. World-space `position` is the centre. */
function cloudBank(map, count, { seed, xMin, xMax, y0, y1, zMin = -190, zMax = 26, size0, size1, keepOut = 0 }) {
  let a = seed * 9301 + 49297;
  const rnd = () => (a = (a * 9301 + 49297) % 233280) / 233280;
  const pos = [];
  const corner = [];
  const uv = [];
  const shade = [];
  const index = [];
  for (let i = 0; i < count; i++) {
    let x;
    do x = lerp(xMin, xMax, rnd());
    while (Math.abs(x) < keepOut);
    const y = lerp(y0, y1, rnd());
    const z = lerp(zMin, zMax, rnd());
    const half = lerp(size0, size1, rnd());
    const cell = Math.floor(rnd() * 4);
    const flip = rnd() < 0.5;
    const u0 = (cell % 2) / 2;
    const v0 = 1 - (Math.floor(cell / 2) + 1) / 2;
    const base = pos.length / 3;
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(x, y, z);
      corner.push(cx * half, cy * half);
      uv.push(u0 + ((flip ? -cx : cx) + 1) / 4, v0 + (cy + 1) / 4);
      shade.push(0.86 + rnd() * 0.14);
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('corner', new THREE.Float32BufferAttribute(corner, 2));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('shade', new THREE.Float32BufferAttribute(shade, 1));
  g.setIndex(index);
  const m = new THREE.Mesh(g, cloudMaterial(map, zMin, zMax));
  m.frustumCulled = false;
  m.raycast = () => {};
  return m;
}

function cloudMaterial(map, zMin, zMax) {
  return new THREE.ShaderMaterial({
    alphaToCoverage: true,
    uniforms: {
      map: { value: map },
      travel: { value: 0 },
      zMin: { value: zMin },
      zLen: { value: zMax - zMin },
      white: { value: 0 },
      fogColor: { value: new THREE.Color('#ffffff') },
    },
    vertexShader: /* glsl */ `
      attribute vec2 corner;
      attribute float shade;
      uniform float travel, zMin, zLen;
      varying vec2 vUv;
      varying float vShade, vDepth;
      void main() {
        vUv = uv;
        vShade = shade;
        vec3 p = position;
        p.z = zMin + mod(p.z - zMin + travel, zLen);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        mv.xy += corner;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float white;
      uniform vec3 fogColor;
      varying vec2 vUv;
      varying float vShade, vDepth;
      void main() {
        vec4 c = texture2D(map, vUv);
        float a = smoothstep(0.35, 0.65, c.a);
        if (a < 0.02) discard;
        vec3 col = mix(c.rgb * vShade, vec3(1.0, 0.98, 0.92), white);
        col = mix(col, fogColor, smoothstep(40.0, 190.0, vDepth));
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
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
    audio.define('icarus-sun', sunSound);
    audio.define('rustle', rustle);
    audio.define('birds', birds);
    audio.define('darkWater', darkWater);
    const [T] = await Promise.all([loadArt('icarus', ['daedalus', 'icarus', 'boat', 'rock', 'clouds']), audio.preload(['icarus', 'icarus-wind', 'icarus-splash', 'icarus-sun', 'rustle', 'birds', 'darkWater'])]);
    this.climb = 0;
    this.gaze = 0;
    this.caught = 0;
    this.heat = 0;

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
      this.rock = cutout(T.rock, 9, { self: 0.7 });
      this.rock.position.set(26, -0.5, -38);
      this.rock.lookAt(0, 3, 0);
      this.world.add(this.rock);
    }
    // The fishermen, who take the two of them for gods
    if (T.boat) {
      this.boat = cutout(T.boat, 3.6, { self: 0.7 });
      this.boat.position.set(-7, -0.5, -15);
      this.boat.lookAt(0, 1.4, 0);
      this.world.add(this.boat);
    }

    // ---------- the two flyers ----------
    const featherMat = softMaterial({ color: '#f4ecdc', rim: '#ffe2a8', rimPower: 1.6, rimStrength: 0.55, hatch: 0, umber: '#a88e70', side: THREE.DoubleSide });
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

    // Daedalus: Gowy's figure, with the wings Gowy painted.
    this.daedalus = new THREE.Group();
    if (T.daedalus) {
      this.daedalusFig = cutout(T.daedalus, 2.9, { anchor: 'center' });
      this.daedalus.add(this.daedalusFig);
    }
    this.daedalus.position.set(-5.8, -0.4, -8.5);
    this.root.add(this.daedalus);

    // Icarus: Gowy's falling boy; turned upright he is reaching for the sun.
    this.icarus = new THREE.Group();
    if (T.icarus) {
      this.icarusFig = cutout(T.icarus, 2.3, { anchor: 'center' });
      this.icarusFig.rotation.z = Math.PI;
      this.icarus.add(this.icarusFig);
      this.icarusWings = addWings(this.icarus, new THREE.Vector3(-0.15, 0.2, 0), 1.1);
    }
    this.icarus.position.set(-0.5, 1.2, -5.5);
    this.root.add(this.icarus);
    // Looking at him is how you become him.
    this.icarusHit = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.icarus.add(this.icarusHit);

    // Loose feathers: real feathers that tumble through the air.
    this.FEATHERS = 70;
    this.feathers = Array.from({ length: this.FEATHERS }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), s: new THREE.Vector3() }));
    const fTex = featherTexture();
    fTex.anisotropy = 4;
    this.featherPaint = new THREE.MeshLambertMaterial({ map: fTex, alphaTest: 0.4, side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: fTex, emissiveIntensity: 0.55 });
    const fGeo = new THREE.PlaneGeometry(0.085, 0.3).rotateZ(-Math.PI / 2).translate(0.13, 0, 0);
    this.featherMesh = new THREE.InstancedMesh(fGeo, this.featherPaint, this.FEATHERS);
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
      const h = new GiantHand({ side, skin: '#e9bb96', sleeve: '#e9bb96', scale: 1.15, plain: true });
      h.visible = true;
      h.position.set(0.32 * side, -0.25, -0.5);
      h.quaternion.copy(handRotation(0.45 * side, (Math.PI / 2) * side));
      h.targetCurl = 0.2;
      this.me.add(h);
      return h;
    });
    this.armFeathers = [];
    // the wing on each arm: feathers set along the forearm, fanning out, the long ones near the hand
    this.myHands.forEach((h, n) => {
      const side = n === 0 ? -1 : 1;
      for (let i = 0; i < 16; i++) {
        const f = new THREE.Mesh(fGeo, this.featherMesh.material);
        const len = 0.95 - i * 0.022;
        f.scale.set(len, 0.62, 1);
        f.position.set(side * 0.012, -0.05 - i * 0.03, 0.012 - i * 0.0012);
        const out = 0.05 - i * 0.055; // from swept toward the fingers to swept back
        f.rotation.z = side > 0 ? Math.PI - out : out;
        f.raycast = () => {};
        h.add(f);
        this.armFeathers.push(f);
      }
    });

    this._buildClouds(T);
    this._buildSun();
    this._buildCatchables();
    this._buildWax();
    this._buildGulls();

    // ---------- light, words ----------
    this.hemi = new THREE.HemisphereLight('#dbe6f0', '#4f7f7a', 1.3);
    this.sun = new THREE.DirectionalLight('#fff0d6', 1.8);
    this.root.add(this.hemi, this.sun);

  }

  _buildClouds(T) {
    this.cloudBanks = [];
    if (!T.clouds) return;
    T.clouds.anisotropy = 4;
    // below you, then around you, then far above: you pass through them all when you fall
    const banks = [
      [26, { seed: 3, xMin: -150, xMax: 150, y0: 3, y1: 7, size0: 7, size1: 15, keepOut: 22 }],
      [14, { seed: 7, xMin: -90, xMax: 90, y0: 10.5, y1: 16, size0: 4, size1: 9, keepOut: 14 }],
      [20, { seed: 11, xMin: -60, xMax: 60, y0: 30, y1: 52, size0: 8, size1: 16, keepOut: 6 }],
      [18, { seed: 13, xMin: -130, xMax: 130, y0: 64, y1: 90, size0: 18, size1: 34, keepOut: 20 }],
    ];
    for (const [n, o] of banks) {
      const m = cloudBank(T.clouds, n, o);
      m.material.uniforms.fogColor.value = this.fogColor;
      this.world.add(m);
      this.cloudBanks.push(m);
    }

    // and clouds right beside you, that come apart in your hand
    const { interact } = this.ctx;
    this.puffs = [];
    for (let i = 0; i < PUFFS; i++) {
      const tex = T.clouds.clone();
      tex.repeat.set(0.5, 0.5);
      tex.offset.set((i % 2) * 0.5, ((i >> 1) % 2) * 0.5);
      tex.needsUpdate = true;
      const size = 0.95 + (i % 3) * 0.3;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size * 1.5, size * 1.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, opacity: 0.95 }));
      const a = (i / PUFFS) * Math.PI * 2 + 0.4;
      const r = 1.7 + (i % 3) * 0.55;
      m.position.set(Math.sin(a) * r, -1.3 + (i % 3) * 0.3, -Math.cos(a) * r);
      m.userData.home = m.position.clone();
      this.root.add(m);
      const puff = { m, gone: false, phase: i * 1.3 };
      this.puffs.push(puff);
      interact.addTouch(m, { radius: size * 0.5, cooldown: 1, haptic: 0.25, tip: 'touch', onTouch: () => this._partCloud(puff) });
    }
  }

  _partCloud(puff) {
    if (puff.gone) return;
    puff.gone = true;
    this.sound('rustle', { parent: puff.m, volume: 0.35, refDistance: 2, rate: 0.6 });
    const s0 = puff.m.scale.x;
    this.tween(1.3, (k) => {
      puff.m.scale.setScalar(s0 + k * 0.9);
      puff.m.material.opacity = 0.95 * (1 - k);
    }, ease.out).then(() => {
      puff.m.visible = false;
      this.wait(9).then(() => {
        puff.m.visible = true;
        puff.m.scale.setScalar(s0);
        this.tween(3, (k) => (puff.m.material.opacity = 0.95 * k)).then(() => (puff.gone = false));
      });
    });
  }

  _buildSun() {
    this.sunCard = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTexture(), transparent: true, depthWrite: false, fog: false, toneMapped: false }));
    this.sunCard.position.copy(this.sunDir).multiplyScalar(170);
    this.sunCard.renderOrder = -1;
    this.sunCard.raycast = () => {};
    this.root.add(this.sunCard);
    this.sunGlare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffe9b0', transparent: true, opacity: 0.2, depthWrite: false, depthTest: false, fog: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.sunGlare.position.copy(this.sunCard.position);
    this.sunGlare.raycast = () => {};
    this.root.add(this.sunGlare);
  }

  /** Feathers that fall past you, within reach, drifting; caught, they are yours for a while. */
  _buildCatchables() {
    const { interact } = this.ctx;
    const geo = new THREE.PlaneGeometry(0.1, 0.36);
    const mat = this.featherPaint;
    this.catchables = [];
    for (let i = 0; i < CATCHABLE; i++) {
      const m = new THREE.Mesh(geo, mat);
      const f = { m, phase: i * 2.3, held: false, wait: i * 2.1, active: false, spin: 0.5 + (i % 3) * 0.4 };
      m.visible = false;
      this.root.add(m);
      interact.addGrabbable(m, {
        radius: 0.04,
        reach: 0.18,
        resting: true,
        onGrab: () => {
          if (!f.wasCaught) {
            f.wasCaught = true;
            this.caught++;
          }
        },
      });
      this.catchables.push(f);
    }
  }

  _respawnFeather(f) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.55 + Math.random() * 0.6;
    f.m.position.set(Math.sin(a) * r, 1.3 + Math.random() * 0.7, -Math.abs(Math.cos(a)) * r - 0.25);
    f.x0 = f.m.position.x;
    f.z0 = f.m.position.z;
    f.m.visible = true;
    f.active = true;
  }

  _buildWax() {
    const geo = new THREE.SphereGeometry(0.011, 6, 5);
    geo.scale(1, 1.6, 1);
    this.waxMesh = new THREE.InstancedMesh(geo, softMaterial({ color: '#e7bf62', rim: '#fff0c0', rimStrength: 0.6, hatch: 0 }), WAX);
    this.waxMesh.frustumCulled = false;
    this.waxMesh.raycast = () => {};
    this.wax = Array.from({ length: WAX }, () => ({ life: 0, p: new THREE.Vector3(), vy: 0 }));
    this.root.add(this.waxMesh);
    const dummy = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < WAX; i++) this.waxMesh.setMatrixAt(i, dummy);
  }

  _drip(n, from) {
    for (const d of this.wax) {
      if (n <= 0) break;
      if (d.life > 0) continue;
      n--;
      d.life = 1.6;
      d.vy = -0.2 - Math.random() * 0.6;
      d.p.copy(from).add(_v.set((Math.random() - 0.5) * 0.14, -0.05 - Math.random() * 0.1, (Math.random() - 0.5) * 0.14));
    }
  }

  /** Gulls, in the middle distance, and a sound of water where the fishermen are. */
  _buildGulls() {
    const wing = new THREE.PlaneGeometry(0.5, 0.14);
    wing.translate(0.25, 0, 0);
    const mat = new THREE.MeshBasicMaterial({ color: '#3d3a38', side: THREE.DoubleSide });
    this.gulls = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const l = new THREE.Mesh(wing, mat);
      const r = new THREE.Mesh(wing, mat);
      r.scale.x = -1;
      l.raycast = r.raycast = () => {};
      g.add(l, r);
      g.userData = { l, r, phase: i * 1.7, x: -28 + (i % 5) * 11 + (i * 3.7) % 6, y: 6 + (i % 4) * 1.6, z: -22 - (i * 7) % 24 };
      this.world.add(g);
      this.gulls.push(g);
    }
  }

  async start() {
    const { audio, input, haze, fader } = this.ctx;
    const M = this.ctx.content.MYTHS.icarus;
    const C = this.ctx.content.ICARUS;
    this.ctx.interact.setHandsVisible(true); // there are feathers to catch

    audio.playMusic('icarus', { volume: 0.55, fade: 3 });
    this.wind = await this.sound('icarus-wind', { loop: true, volume: 0.1 });
    this.hum = await this.sound('icarus-sun', { loop: true, volume: 0 });
    if (this.boat) {
      this.sound('darkWater', { parent: this.boat, loop: true, volume: 0.7, refDistance: 6 });
      this.sound('birds', { parent: this.boat, loop: true, volume: 0.5, refDistance: 10 });
    }

    // They fly in together. The father's warning; the fishermen look up.
    this.flying = true;
    this.featherFall = true;
    await this.wait(1.5);
    await this.say(M.warning, { hold: 0.8 });
    this.say(C.hintFeather, { narrate: false, hold: 3 });
    await this.say(M.onlookers, { hold: 0.8 });

    // The boy climbs toward the sun; the father falls behind. Your eyes hurry him.
    this.climbing = true;
    audio.fadeMusic(0.85, 10);
    this.icarus0 = this.icarus.position.clone();
    this.shedFrom = this.icarus;
    this.say(C.hintSun, { narrate: false, hold: 3.5 });
    await this.until(() => this.climb >= 0.5, 30);

    // Look at him (or wait) — and become him.
    this.say(C.hintBecome, { narrate: false, hold: 3 });
    let chosen = false;
    input.add(this.icarusHit, { onSelect: () => (chosen = true), dwell: 1.2 });
    await this.until(() => chosen, 14);
    input.remove(this.icarusHit);
    this.climbing = false;
    this.shed = 0;
    this.featherFall = false;
    for (const f of this.catchables) {
      if (this.ctx.interact.bodies.get(f.m)?.held) continue;
      f.m.visible = false;
      f.active = false;
    }

    // ---- you are Icarus ----
    await fader.fade(1, 0.6, '#ffffff');
    this.ctx.interact.setHandsVisible(false); // now they are his
    this.icarus.visible = false;
    this.me.visible = true;
    for (const p of this.puffs || []) p.m.visible = false;
    for (const f of this.catchables) f.m.visible = false;
    // the feathers you caught are on your arms, with the others
    this.armFeathers.forEach((f, i) => (f.visible = i < 12 + this.caught * 2));
    this.alt = 42;
    this.sunR = 0.08;
    this.whiteout = 0.2;
    this.daedalus.position.set(-4, 3.5, -7);
    if (this.boat) this.boat.visible = false;
    haze.set({ color: '#fffaf0', amount: 0.12 });
    await fader.fade(0, 1.2);

    // Every beat of your wings takes you higher. Every metre higher, the wax runs.
    audio.fade(this.wind, 0.35, 4);
    this.flapping = true;
    this.say(C.hintFlap, { narrate: false, hold: 3.5 });
    this.autoBeat = 0;
    await this.until(() => this.heat >= 1, 26);
    this.flapping = false;
    this.heat = 1;

    // His father calls. You fall.
    for (const h of this.myHands) h.targetCurl = 0.9;
    for (const f of this.armFeathers) if (f.visible) this.wait(Math.random() * 1.5).then(() => this.release(f));
    this.say(M.lament, { hold: 0.6 }).then(() => this.say(C.fragment, { narrate: false, hold: 1.5 }));
    audio.muffleMusic(600, 2.5);
    audio.fadeMusic(0.35, 2.5);
    audio.fade(this.wind, 0.95, 2);
    const a0 = this.alt;
    const w0 = this.whiteout;
    this.tween(2, (k) => (this.whiteout = lerp(w0, 0.08, k)), ease.out);
    this.tween(5, (k) => {
      for (const h of this.myHands) h.position.y = -0.25 + 0.5 * k; // arms thrown up by the fall
    });
    this.falling = true;
    this.shedFrom = this.me;
    this.shed = 20;
    await this.tween(5.5, (k) => (this.alt = lerp(a0, 0.5, k)), ease.in);
    this.shed = 0;

    // Into the sea.
    this.sound('icarus-splash', { volume: 1 });
    audio.fade(this.wind, 0, 0.3);
    audio.fade(this.hum, 0, 0.3);
    audio.stopMusic(1.5);
    haze.set({ color: UNDERWATER, amount: 0.65 });
    this.ctx.scene.background = new THREE.Color(UNDERWATER);
    this.whiteout = 0;
    this.me.visible = false;
    await this.wait(3);
    this.next('crib', { phase: 'hearing' }, { color: '#ffffff', out: 1.5, in: 2 });
  }

  /** A beat of the wings: you rise, the sun comes closer, and wax runs down your arms. */
  _beat() {
    if (!this.flapping || this.beatWait > 0) return;
    this.beatWait = 0.45;
    this.autoBeat = 0;
    this.beatAnim = 1;
    const a0 = this.alt;
    this.tween(0.5, (k) => (this.alt = lerp(a0, a0 + 2.6, k)), ease.out);
    this.heat = Math.min(1, this.heat + HEAT_PER_BEAT);
    this.sound('rustle', { volume: 0.5, rate: 0.7 });
    for (const h of this.myHands) this._drip(3, h.getWorldPosition(_v2));
    // feathers let go, in proportion
    const on = this.armFeathers.filter((f) => f.visible);
    const leave = Math.ceil(on.length * (this.heat * 0.5 + 0.1) * 0.35);
    for (let i = 0; i < leave && on.length; i++) this.release(on.splice(Math.floor(Math.random() * on.length), 1)[0]);
    this.ctx.interact.hands?.forEach((h) => h.state?.source?.gamepad?.hapticActuators?.[0]?.pulse?.(0.25 + this.heat * 0.5, 50));
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

  onSelectNothing() {
    this._beat();
  }

  update(dt, t) {
    super.update(dt, t);
    this.travel += SPEED * dt;
    const cam = this.ctx.camera;
    cam.getWorldDirection(_fwd);

    // The sun knows when you look at it.
    const looking = _fwd.dot(this.sunDir) > SUN_CONE;
    this.gaze += ((looking ? 1 : 0) - this.gaze) * Math.min(1, dt * (looking ? 1.4 : 2.5));
    if (this.hum) this.hum.setVolume(this.falling ? 0 : this.gaze * 0.9 + this.heat * 0.3);

    if (this.climbing) {
      this.climb = Math.min(1, this.climb + dt * lerp(CLIMB_ALONE, CLIMB_WATCHED, this.gaze));
      const k = ease.inOut(this.climb);
      this.icarus.position.set(lerp(this.icarus0.x, 2.5, k), lerp(this.icarus0.y, 9, k * k), lerp(this.icarus0.z, -16, k));
      this.sunR = lerp(0.035, 0.09, k * k);
      this.whiteout = 0.22 * k * k + this.gaze * 0.1;
      this.shed = 2 + 10 * k;
    }

    if (this.flapping) {
      // in a headset: your own arms, coming down hard
      const hands = this.ctx.interact.hands;
      if (this.ctx.renderer.xr.isPresenting && hands) {
        hands.forEach((H, i) => {
          if (!H?.tracked) return;
          const vy = (H.pos.y - (this._lastY?.[i] ?? H.pos.y)) / Math.max(dt, 1e-3);
          (this._lastY ||= [])[i] = H.pos.y;
          if (vy < -1.1) this._beat();
          const hand = this.myHands[H.state?.source?.handedness === 'left' ? 0 : 1];
          hand.position.copy(this.me.worldToLocal(_v.copy(H.pos)));
          hand.quaternion.copy(H.quat).multiply(_q2.setFromAxisAngle(X, -Math.PI / 2));
        });
      }
      this.beatWait = Math.max(0, (this.beatWait || 0) - dt);
      this.autoBeat += dt;
      if (this.autoBeat > 3.2) this._beat(); // the wings go on beating without you
      this.beatAnim = Math.max(0, (this.beatAnim || 0) - dt * 2.4);
      if (!this.ctx.renderer.xr.isPresenting) {
        this.myHands.forEach((h, i) => {
          h.position.y = -0.25 + Math.sin((1 - this.beatAnim) * Math.PI) * -0.22 * (this.beatAnim > 0 ? 1 : 0) + 0.03 * Math.sin(t * 2 + i);
        });
      }
      // looking the sun in the eye melts it too
      this.heat = Math.min(1, this.heat + dt * (0.012 + this.gaze * 0.035));
      this.sunR = lerp(0.08, 0.2, this.heat);
      this.whiteout = lerp(0.2, 0.85, this.heat * this.heat);
      if (Math.random() < dt * (1 + this.heat * 6)) this._drip(1, this.myHands[Math.random() < 0.5 ? 0 : 1].getWorldPosition(_v2));
    }

    // the sun, in glory; it swells under your eye, and it turns slowly
    const size = 170 * Math.tan(this.sunR) * 5.4 * (1 + this.gaze * 0.14 + Math.sin(t * 1.3) * 0.015);
    this.sunCard.scale.setScalar(size);
    this.sunCard.material.rotation = t * 0.02 + this.gaze * 0.1;
    this.sunGlare.scale.setScalar(size * (2.2 + this.gaze * 1.4));
    this.sunGlare.material.opacity = 0.16 + this.gaze * 0.35 + this.whiteout * 0.3;
    this.ctx.haze.set({ amount: this.falling || this.alt < 1 ? undefined : this.gaze * 0.1 + this.heat * 0.12 });

    // clouds drift past; the near ones breathe
    for (const m of this.cloudBanks) {
      m.material.uniforms.travel.value = this.travel * 1.1;
      m.material.uniforms.white.value = this.whiteout * 0.7;
    }
    for (const p of this.puffs || []) {
      const h = p.m.userData.home;
      p.m.position.y = h.y + Math.sin(t * 0.5 + p.phase) * 0.08;
      p.m.position.x = h.x + Math.sin(t * 0.21 + p.phase) * 0.12;
      p.m.quaternion.copy(cam.quaternion);
    }

    // feathers within reach fall slowly, turning in the air
    if (this.catchables) {
      for (const f of this.catchables) {
        const body = this.ctx.interact.bodies.get(f.m);
        if (!body) continue;
        if (body.held) {
          f.active = true;
          continue;
        }
        if (!body.asleep) {
          // let go of: it does not fall like a stone
          body.asleep = true;
          body.vx = body.vy = body.vz = 0;
          f.x0 = f.m.position.x;
          f.z0 = f.m.position.z;
        }
        if (!f.active) {
          if (!this.featherFall) continue;
          f.wait -= dt;
          if (f.wait <= 0) this._respawnFeather(f);
          continue;
        }
        f.m.position.y -= dt * 0.17;
        f.m.position.x = f.x0 + Math.sin(t * 0.9 + f.phase) * 0.14;
        f.m.position.z = f.z0 + Math.cos(t * 0.7 + f.phase) * 0.08;
        f.m.rotation.set(Math.sin(t * f.spin + f.phase) * 0.7, t * f.spin, Math.PI * 0.5 + Math.cos(t * 0.8 + f.phase) * 0.9);
        if (f.m.position.y < -1.2) {
          f.active = false;
          f.m.visible = false;
          f.wait = 1 + Math.random() * 4;
        }
      }
    }

    // wax falls
    for (let i = 0; i < WAX; i++) {
      const d = this.wax[i];
      if (d.life > 0) {
        d.life -= dt;
        d.vy -= dt * 2.5;
        d.p.y += d.vy * dt;
        this._m.makeTranslation(d.p.x, d.p.y, d.p.z);
      } else this._m.makeScale(0, 0, 0);
      this.waxMesh.setMatrixAt(i, this._m);
    }
    this.waxMesh.instanceMatrix.needsUpdate = true;

    // gulls
    for (const g of this.gulls) {
      const u = g.userData;
      const fl = Math.sin(t * 4.5 + u.phase) * 0.55;
      u.l.rotation.y = fl;
      u.r.rotation.y = -fl;
      g.position.set(u.x + Math.sin(t * 0.1 + u.phase) * 9, u.y + Math.sin(t * 0.7 + u.phase), u.z);
      g.rotation.y = Math.cos(t * 0.1 + u.phase) > 0 ? 0.4 : Math.PI - 0.4;
    }
    if (this.falling) this.gulls.forEach((g) => (g.visible = this.alt > g.userData.y));

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
    if (this.daedalusFig) this.daedalusFig.rotation.z = Math.sin(t * 1.1) * 0.05;
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
