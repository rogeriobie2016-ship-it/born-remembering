import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BaseScene } from '../core/SceneManager.js';
import { Dust } from '../core/props.js';
import { clamp, ease, glowTexture, lerp } from '../core/util.js';
import { softMaterial, paintedTexture } from '../core/look.js';
import { cutout, groundShadow, loadArt } from '../core/collage.js';
import { flameTexture } from '../core/popup.js';
import { loadMarble, marbleMaterial } from '../core/marble.js';
import { leavesWind, rustle, underworld } from '../core/ambience.js';
import { lyre, shush, thump } from '../core/synth.js';
import { featherTexture } from './IcarusScene.js';

// Eros and Psyche (Apuleius, The Golden Ass). The sense of feeling, and the last life before you forget.
//
// Night. You were told never to look at him. You take the lamp, you find his face in the dark (Burne-Jones's
// sleeper), and a drop of oil wakes him: he is gone in feathers. The moon comes up on Canova's marble, at a size
// that makes you a child again, the kiss that has been about to happen since 1793. Round it stand the
// paintings of what you did next, and they open as your flame comes near: figures step out, the world goes back.
// At Psyche's feet is Persephone's box. Opening it is the end: not beauty but sleep. You wake, or do not, in
// her place, with his face above you, and it never comes any closer.

const EYE = 1.6;
const NIGHT = new THREE.Color('#04050b');
const CENTRE = new THREE.Vector3(0, 0, -8);
const SCALE = 2.6; // the group is 1.55 m high in the Louvre: here you are small
const PLINTH = 0.32;
const STATUE_TURN = 0; // radians; which way the group faces
const BED_Z = -3.1;
const AREA = 8.7;
const RING = 9.7; // the paintings stand just beyond where you can walk
const OPEN_AT = 3.4; // how near your flame must be for a painting to open
const LOOK_FOR = 1.5; // seconds the flame must stay over his face
const HEIGHT = 3.5; // of each painting
const DEEP = 2.2; // how far back a painting goes

// In the statue's own metres. Where the two faces nearly meet, her heart, her head
const KISS = new THREE.Vector3(-0.096, 0.84, 0.144);
const HEART = new THREE.Vector3(-0.05, 0.6, 0.2);
const HER_EYES = new THREE.Vector3(0.135, 0.665, 0.519); // just outside her, under his face

// x0, y0, x1, y1 of the figure inside its painting, from art/tools/psyche.py
const WINDOWS = [
  { key: 'garden', angle: -1.05, plain: false, box: [0.1147, 0.1388, 0.9984, 1.0] },
  { key: 'rapture', angle: 1.05, plain: false, box: [0.0613, 0.0017, 0.8814, 0.901] },
  { key: 'fountain', angle: -2.2, plain: true },
  { key: 'box', angle: 2.2, plain: false, box: [0.1798, 0.16, 0.8372, 0.8833] },
  { key: 'olympus', angle: Math.PI, plain: true },
];

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

function floorTexture() {
  return paintedTexture(1024, 1024, (c, w, h) => {
    c.fillStyle = '#17120f';
    c.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const ring = (r0, r1, col) => {
      c.strokeStyle = col;
      c.lineWidth = r1 - r0;
      c.beginPath();
      c.arc(cx, cy, (r0 + r1) / 2, 0, Math.PI * 2);
      c.stroke();
    };
    ring(40, 150, '#2a1f1a');
    ring(150, 156, '#6a4a22');
    ring(156, 280, '#1d1613');
    ring(280, 284, '#6a4a22');
    ring(284, 500, '#231a16');
    // veins, as in old marble
    for (let i = 0; i < 90; i++) {
      c.strokeStyle = `rgba(${Math.random() < 0.6 ? '150,120,95' : '8,6,5'},${0.05 + Math.random() * 0.14})`;
      c.lineWidth = 0.6 + Math.random() * 2;
      let x = Math.random() * w, y = Math.random() * h;
      c.beginPath();
      c.moveTo(x, y);
      for (let j = 0; j < 7; j++) {
        x += (Math.random() - 0.4) * 90;
        y += (Math.random() - 0.5) * 90;
        c.lineTo(x, y);
      }
      c.stroke();
    }
  });
}

function petalTexture() {
  return paintedTexture(64, 64, (c, w, h) => {
    c.beginPath();
    c.moveTo(w / 2, h * 0.96);
    c.bezierCurveTo(w * 1.02, h * 0.6, w * 0.86, h * 0.04, w / 2, h * 0.08);
    c.bezierCurveTo(w * 0.14, h * 0.04, -w * 0.02, h * 0.6, w / 2, h * 0.96);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#d6424f');
    g.addColorStop(1, '#6d1120');
    c.fillStyle = g;
    c.fill();
  });
}

/** An oil lamp, the kind you could carry through a house at night. Its origin is under its foot. */
function buildLamp() {
  const group = new THREE.Group();
  const clay = softMaterial({ color: '#9c5d36', rim: '#ffcf96', rimStrength: 0.35, hatch: 0, umber: '#2e150a' });
  const profile = [[0.0, 0], [0.045, 0], [0.055, 0.012], [0.082, 0.04], [0.078, 0.062], [0.04, 0.078], [0.022, 0.082], [0.03, 0.094], [0.0, 0.09]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 16), clay);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.03, 0.1, 8).rotateZ(Math.PI / 2), clay);
  spout.position.set(0.09, 0.062, 0);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, 6, 12, Math.PI * 1.3).rotateZ(-0.3), clay);
  handle.position.set(-0.092, 0.07, 0);
  group.add(body, spout, handle);
  group.traverse((o) => (o.raycast = () => {}));
  return group;
}

/** Persephone's box: gold, small, heavier than it looks, a pomegranate on the lid. */
function buildCasket() {
  const group = new THREE.Group();
  const gold = softMaterial({ color: '#a97a2c', rim: '#ffe6a8', rimStrength: 0.7, hatch: 120, umber: '#2c1a06' });
  const W = 0.34, D = 0.24, H = 0.14;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), gold);
  body.position.y = H / 2;
  const band = new THREE.Mesh(new THREE.BoxGeometry(W + 0.012, 0.016, D + 0.012), gold);
  band.position.y = H - 0.012;
  const inside = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.02, D - 0.02).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000000' }));
  inside.position.y = H + 0.001;
  const hinge = new THREE.Group();
  hinge.position.set(0, H, -D / 2);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(W + 0.012, 0.03, D + 0.012), gold);
  lid.position.set(0, 0.015, D / 2);
  const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), softMaterial({ color: '#8f1f2a', rim: '#ffb08a', rimStrength: 0.5, hatch: 0, umber: '#2c0a0a' }));
  fruit.position.set(0, 0.052, D / 2);
  hinge.add(lid, fruit);
  group.add(body, band, inside, hinge);
  group.traverse((o) => (o.raycast = () => {}));
  return { group, hinge, lid, top: H };
}

/** What lies behind a frame is seen only through its opening: anything outside the sight line is dropped. */
function throughFrame(mat, group, w, h) {
  const prev = mat.onBeforeCompile;
  const uniforms = { portalInverse: { value: new THREE.Matrix4() }, portalHalf: { value: new THREE.Vector2(w / 2, h / 2) } };
  group.updateWorldMatrix(true, false);
  uniforms.portalInverse.value.copy(group.matrixWorld).invert();
  const prevKey = mat.customProgramCacheKey();
  mat.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPortalWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvPortalWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPortalWorld;\nuniform mat4 portalInverse;\nuniform vec2 portalHalf;')
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        {
          vec3 eye = (portalInverse * vec4(cameraPosition, 1.0)).xyz;
          vec3 here = (portalInverse * vec4(vPortalWorld, 1.0)).xyz;
          float k = eye.z / max(eye.z - here.z, 1e-3);
          vec2 at = mix(eye.xy, here.xy, k);
          if (abs(at.x) > portalHalf.x || abs(at.y) > portalHalf.y || eye.z < 0.0) discard;
        }`,
      );
  };
  mat.customProgramCacheKey = () => `${prevKey}-portal`;
}

/** A soft round spot with real transparency, for things that are dark. */
function softDot() {
  return paintedTexture(64, 64, (c, w) => {
    c.clearRect(0, 0, w, w);
    const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, w);
  });
}

/** A carved frame for a painting of w × h, standing on the floor with the picture's centre at y = 0. */
function frameGeometry(w, h) {
  const t = 0.2, d = 0.22;
  const bar = (bw, bh, bd, x, y, z = 0) => new THREE.BoxGeometry(bw, bh, bd).translate(x, y, z);
  const parts = [
    bar(w + t * 2, t, d, 0, h / 2 + t / 2), bar(w + t * 2, t, d, 0, -h / 2 - t / 2),
    bar(t, h + t * 2, d, -w / 2 - t / 2, 0), bar(t, h + t * 2, d, w / 2 + t / 2, 0),
    bar(w + t * 0.5, 0.05, d * 1.3, 0, h / 2 + 0.02, 0.02), bar(w + t * 0.5, 0.05, d * 1.3, 0, -h / 2 - 0.02, 0.02),
    bar(0.05, h + t * 0.5, d * 1.3, -w / 2 - 0.02, 0, 0.02), bar(0.05, h + t * 0.5, d * 1.3, w / 2 + 0.02, 0, 0.02),
    bar(w + t * 3, 0.1, d * 1.5, 0, h / 2 + t + 0.03), bar(w + t * 3, 0.12, d * 1.5, 0, -h / 2 - t - 0.05),
  ];
  return mergeGeometries(parts);
}

export class ErosScene extends BaseScene {
  skipTo = 'choice';

  async enter() {
    const { ctx } = this;
    const { audio } = ctx;
    ctx.rig.position.set(0, EYE, 0);
    ctx.look.reset(0, -0.1);
    ctx.scene.background = NIGHT.clone();
    ctx.scene.fog = new THREE.Fog(NIGHT.clone(), 2, 7.5);
    ctx.grain.set({ grain: 0.07, vignette: 0.55, color: '#05030a' });

    audio.define('lyre', () => lyre());
    audio.define('thump', () => thump());
    audio.define('night', leavesWind);
    audio.define('rustle', rustle);
    audio.define('underworld', underworld);
    audio.define('hiss', () => shush(4));

    const [T, geo] = await Promise.all([
      loadArt('psyche', ['box', 'box-back', 'garden', 'garden-back', 'rapture', 'rapture-back', 'fountain', 'olympus', 'eros', 'cloth', 'night-wood', 'lamp-mural']),
      loadMarble('art/psyche/canova.bin'),
      audio.preload(['lyre', 'thump', 'night', 'rustle', 'underworld', 'hiss']),
    ]);

    this.phase = 'dark'; // dark, then moon, then sleep
    this.lampOwner = null;
    this.looked = 0;
    this.woken = false;
    this.opened = 0;
    this.boxOpen = false;
    this.sway = 0.25;
    this.moonK = 0;
    this.beatT = 0;
    this.heartK = 0;
    this.heartPulse = 0;
    this.lineBusy = false;
    this.flameK = 1;

    this.walkArea = { center: [CENTRE.x, CENTRE.z], radius: AREA, blockers: [{ x: CENTRE.x, z: CENTRE.z, r: SCALE * 1.02 }, { x: 0, z: BED_Z, r: 1.15 }] };

    this._buildWorld(T);
    this._buildStatue(geo);
    this._buildBed(T);
    this._buildWindows(T);
    this._buildLamp();
    this._buildCasket();
    this._buildFeathers();
    this._buildPetals();

    this.hidden = [this.statue, this.plinth, this.statueShadow, this.casket.group, this.casketStool, ...this.windows.map((w) => w.group)];
    for (const o of this.hidden) o.visible = false;

    this.moon = new THREE.DirectionalLight('#a9b6dc', 0);
    this.moon.position.set(-3, 9, 3);
    this.add(this.moon);
    this.hemi = new THREE.HemisphereLight('#26304f', '#0a0605', 0.05);
    this.add(this.hemi);
    this.add(new Dust({ count: 240, radius: 10, inner: 1, color: '#ffd9a0', size: 0.022, opacity: 0.35, speed: 0.012 })).position.set(CENTRE.x, 2, CENTRE.z + 3);
  }

  _buildWorld(T) {
    // a plain night, and a moon that needs no explaining
    const skyTex = paintedTexture(64, 256, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#050817');
      g.addColorStop(0.5, '#0d1430');
      g.addColorStop(1, '#232c52');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 12), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
    dome.raycast = () => {};
    this.add(dome);
    const stars = 500;
    const sp = new Float32Array(stars * 3);
    for (let i = 0; i < stars; i++) {
      const a = Math.random() * Math.PI * 2, y = 0.25 + Math.random() * 0.75, r = Math.sqrt(1 - y * y);
      sp[i * 3] = Math.cos(a) * r * 62;
      sp[i * 3 + 1] = y * 62;
      sp[i * 3 + 2] = Math.sin(a) * r * 62;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const st = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#dfe6ff', size: 0.28, transparent: true, opacity: 0.75, fog: false, depthWrite: false }));
    st.raycast = () => {};
    this.add(st);
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#dfe6ff', transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    moon.position.set(-22, 40, 10);
    moon.scale.setScalar(16);
    moon.raycast = () => {};
    this.add(moon);

    if (T['night-wood']) {
      const tex = T['night-wood'];
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.set(3, 1);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 15, 64, 1, true), new THREE.MeshBasicMaterial({ map: tex, alphaMap: paintedTexture(4, 64, (c, w, h) => {
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#000');
        g.addColorStop(0.35, '#fff');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
      }), transparent: true, depthWrite: false, side: THREE.BackSide, fog: false, color: '#9aa6c8' }));
      band.position.set(CENTRE.x, 7.4, CENTRE.z);
      band.renderOrder = -2;
      band.raycast = () => {};
      this.add(band);
    }
    // before the moon there is nothing at all: a curtain of night, inside everything far away
    this.curtain = new THREE.Mesh(new THREE.SphereGeometry(19, 24, 16), new THREE.MeshBasicMaterial({ color: NIGHT, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false }));
    this.curtain.position.set(CENTRE.x, 0, CENTRE.z);
    this.curtain.renderOrder = -1;
    this.curtain.raycast = () => {};
    this.add(this.curtain);

    const ft = floorTexture();
    ft.anisotropy = 8;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(18, 72), new THREE.MeshLambertMaterial({ map: ft, color: '#c8bdb4' }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(CENTRE.x, 0, CENTRE.z);
    floor.raycast = () => {};
    this.add(floor);
  }

  _buildStatue(geo) {
    this.statue = new THREE.Group();
    this.statue.position.set(CENTRE.x, PLINTH, CENTRE.z);
    this.statue.rotation.y = STATUE_TURN;
    this.add(this.statue);
    this.marble = marbleMaterial({ color: '#efe3d2' });
    if (geo) {
      const m = new THREE.Mesh(geo, this.marble);
      m.scale.setScalar(SCALE);
      m.raycast = () => {};
      m.frustumCulled = false;
      this.statue.add(m);
    }
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.06, PLINTH, 48).scale(SCALE * 0.98, 1, SCALE * 0.6), softMaterial({ color: '#6b5a4b', rim: '#c9b08a', rimStrength: 0.2, hatch: 60, umber: '#120c09' }));
    plinth.position.set(CENTRE.x, PLINTH / 2, CENTRE.z);
    plinth.rotation.y = STATUE_TURN;
    plinth.raycast = () => {};
    this.add(plinth);
    this.plinth = plinth;
    const shadow = groundShadow(SCALE * 2.6);
    shadow.position.set(CENTRE.x, 0.012, CENTRE.z);
    this.add(shadow);
    this.statueShadow = shadow;

    this.statue.updateWorldMatrix(true, false);
    this.heartAt = this.statue.localToWorld(HEART.clone().multiplyScalar(SCALE));
    this.kissAt = this.statue.localToWorld(KISS.clone().multiplyScalar(SCALE));
    this.herEyes = this.statue.localToWorld(HER_EYES.clone().multiplyScalar(SCALE));
    this.heartObj = new THREE.Object3D();
    this.heartObj.position.copy(this.heartAt);
    this.add(this.heartObj);

    // the gap between the two mouths: put your hand in it
    const kiss = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    kiss.position.copy(this.kissAt);
    this.add(kiss);
    this.kissProxy = kiss;
  }

  _buildBed(T) {
    const bed = new THREE.Group();
    bed.position.set(0, 0, BED_Z);
    this.add(bed);
    const wood = softMaterial({ color: '#3a2318', rim: '#e6b47a', rimStrength: 0.25, hatch: 80, umber: '#120805' });
    const linen = softMaterial({ color: '#b9a489', rim: '#ffe2b8', rimStrength: 0.2, hatch: 0, umber: '#2a1a10' });
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.34, 1.05), wood);
    base.position.y = 0.2;
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 0.98), linen);
    mattress.position.y = 0.44;
    const pillow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8).scale(1.1, 0.42, 1.2), linen);
    pillow.position.set(0.62, 0.68, -0.28);
    pillow.scale.set(1.5, 1.4, 1.0);
    pillow.rotation.x = 0.5;
    bed.add(base, mattress, pillow);
    for (const [x, z] of [[-1.12, -0.5], [1.12, -0.5], [-1.12, 0.5], [1.12, 0.5]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 2.7, 8), wood);
      post.position.set(x, 1.35, z);
      bed.add(post);
    }

    // Burne-Jones's room, and this same night, painted on the wall behind the bed
    if (T['lamp-mural']) {
      const wall = cutout(T['lamp-mural'], 1.72, { anchor: 'center', self: 0, bow: 0.02 });
      wall.position.set(0, 1.2, -0.72);
      wall.raycast = () => {};
      bed.add(wall);
    }

    // the cloth, in a wind you cannot feel
    if (T.cloth) {
      T.cloth.wrapS = T.cloth.wrapT = THREE.MirroredRepeatWrapping;
      T.cloth.repeat.set(2, 1);
    }
    const sway = { value: 0 };
    const k = { value: this.sway };
    this.clothU = { sway, k };
    const cloth = new THREE.MeshLambertMaterial({ map: T.cloth || null, color: T.cloth ? '#f0c0a8' : '#80302c', side: THREE.DoubleSide });
    cloth.onBeforeCompile = (s) => {
      s.uniforms.clothT = sway;
      s.uniforms.clothK = k;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float clothT;\nuniform float clothK;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float drop = 1.0 - uv.y;
          transformed.z += sin(uv.x * 9.0 + clothT * 1.3 + uv.y * 3.0) * 0.08 * drop * clothK * 3.0;
          transformed.x += sin(uv.y * 5.0 + clothT * 0.9) * 0.05 * drop * clothK * 3.0;`,
        );
    };
    for (const x of [-1.34, 1.34]) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 2.7, 8, 20), cloth);
      c.position.set(x, 1.35, -0.5);
      c.raycast = () => {};
      bed.add(c);
    }

    // the coverlet, thrown over him: red, heavy, in folds
    const cover = new THREE.PlaneGeometry(1.5, 1.28, 28, 22);
    const cp = cover.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const x = cp.getX(i), y = cp.getY(i);
      const rise = 0.03 + Math.exp(-((y - 0.05) ** 2) * 9) * 0.2;
      const fold = Math.sin(x * 9 + y * 3) * 0.018 + Math.sin(x * 21 - y * 5) * 0.007;
      const hang = y < -0.5 ? (y + 0.5) * 2.2 : 0;
      cp.setZ(i, rise + fold + hang);
    }
    cover.computeVertexNormals();
    const coverlet = new THREE.Mesh(cover, softMaterial({ color: '#7d1f22', rim: '#ff9a7a', rimStrength: 0.25, hatch: 0, umber: '#1c0505', side: THREE.DoubleSide }));
    coverlet.rotation.x = -Math.PI / 2;
    coverlet.position.set(-0.36, 0.53, 0.14);
    coverlet.raycast = () => {};
    bed.add(coverlet);

    // Him, in the dark, where only the flame finds him
    if (T.eros) {
      this.eros = cutout(T.eros, 1.15, { anchor: 'center', self: 0, bow: 0.05 });
      this.eros.position.set(0.3, 1.02, -0.2);
      this.eros.rotation.x = -0.42;
      this.eros.material.opacity = 1;
      bed.add(this.eros);
    } else {
      this.eros = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.8), new THREE.MeshLambertMaterial({ color: '#b98a6c', transparent: true }));
      this.eros.position.set(0, 0.8, 0);
      this.eros.rotation.x = -0.7;
      bed.add(this.eros);
    }
    // cut-outs take no clicks of their own: what the pointer actually finds
    const hit = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.3), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
    this.eros.add(hit);
    bed.updateWorldMatrix(true, true);
    this.erosFace = new THREE.Vector3(0.5, 1.2, BED_Z - 0.26);
  }

  _buildWindows(T) {
    const gold = softMaterial({ color: '#94702f', rim: '#ffe6a8', rimStrength: 0.4, hatch: 100, umber: '#1c1104' });
    this.windows = [];
    for (const def of WINDOWS) {
      const backTex = def.plain ? T[def.key] : T[def.key + '-back'];
      if (!backTex) continue;
      const aspect = backTex.image.width / backTex.image.height;
      const h = HEIGHT, w = HEIGHT * aspect;
      const group = new THREE.Group();
      const cx = CENTRE.x + Math.sin(def.angle) * RING, cz = CENTRE.z + Math.cos(def.angle) * RING;
      group.position.set(cx, h / 2 + 0.34, cz);
      group.rotation.y = def.angle + Math.PI;
      this.add(group);

      const frame = new THREE.Mesh(frameGeometry(w, h), gold);
      frame.raycast = () => {};
      group.add(frame);

      const back = cutout(backTex, h, { anchor: 'center', self: 0, bow: 0 });
      back.material.emissive.set('#ffffff');
      back.material.emissiveMap = backTex;
      back.material.emissiveIntensity = 0.04;
      back.raycast = () => {};
      group.add(back);

      throughFrame(back.material, group, w, h);

      let fig = null, figX = 0, figY = 0;
      if (!def.plain && T[def.key]) {
        const [x0, y0, x1, y1] = def.box;
        fig = cutout(T[def.key], (y1 - y0) * h, { anchor: 'center', self: 0, bow: 0.03 });
        figX = ((x0 + x1) / 2 - 0.5) * w;
        figY = (0.5 - (y0 + y1) / 2) * h;
        fig.position.set(figX, figY, 0.012);
        fig.material.emissive.set('#ffffff');
        fig.material.emissiveMap = T[def.key];
        fig.material.emissiveIntensity = 0.04;
        fig.raycast = () => {};
        group.add(fig);
      }
      // the paintings shine a little of their own light on the floor when open
      const pool = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffcf9a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      pool.scale.set(w * 1.4, h * 1.4, 1);
      pool.position.z = -0.1;
      pool.raycast = () => {};
      group.add(pool);

      this.windows.push({ key: def.key, group, back, fig, figY, pool, k: 0, seen: false, at: new THREE.Vector3(cx, 0, cz) });
    }
  }

  _buildLamp() {
    const { ctx } = this;
    this.lamp = buildLamp();
    this.lampHome = new THREE.Vector3(0.46, 1.0, -0.82);
    this.lamp.position.copy(this.lampHome);
    this.add(this.lamp);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 1.0, 12), softMaterial({ color: '#4d4238', rim: '#c9b08a', rimStrength: 0.3, hatch: 70, umber: '#120c09' }));
    stand.position.set(0.46, 0.5, -0.82);
    stand.raycast = () => {};
    this.add(stand);

    this.flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    this.flame.scale.set(0.05, 0.1, 1);
    this.flame.raycast = () => {};
    this.add(this.flame);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffb066', transparent: true, opacity: 0.55, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    this.halo.scale.setScalar(0.5);
    this.halo.raycast = () => {};
    this.add(this.halo);
    this.light = new THREE.PointLight('#ffc792', 3.2, 6, 1.9);
    this.lightPower = 3.2;
    this.add(this.light);

    this.lampHit = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    this.lampHit.position.copy(this.lampHome).setY(this.lampHome.y + 0.05);
    this.add(this.lampHit);
    const take = () => this._takeLamp();
    ctx.input.add(this.lampHit, { onSelect: take, dwell: false, tip: 'pick' });
    ctx.interact.addTouch(this.lampHit, { radius: 0.24, onTouch: take, tip: 'pick' });

    this.drop = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6).scale(1, 1.5, 1), new THREE.MeshBasicMaterial({ color: '#ffd27a', fog: false }));
    this.drop.visible = false;
    this.drop.raycast = () => {};
    this.add(this.drop);
  }

  _takeLamp() {
    if (this.lampOwner !== null) return;
    const { ctx } = this;
    let owner = 'camera';
    if (ctx.renderer.xr.isPresenting) {
      const hands = ctx.interact.hands.filter((h) => h.tracked);
      hands.sort((a, b) => a.pos.distanceTo(this.lampHome) - b.pos.distanceTo(this.lampHome));
      if (hands[0]) owner = hands[0].i;
    }
    this.lampOwner = owner;
    ctx.input.remove(this.lampHit);
    ctx.interact.remove(this.lampHit);
    this.drop.visible = false;
  }

  _buildCasket() {
    const c = buildCasket();
    this.casket = c;
    // on a stool at the foot of the plinth, on your side of it
    const x = CENTRE.x + 1.05, z = CENTRE.z + SCALE * 1.02 + 0.2;
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.86, 16), softMaterial({ color: '#40362e', rim: '#b79c7c', rimStrength: 0.25, hatch: 70, umber: '#0f0a07' }));
    stool.position.set(x, 0.43, z);
    stool.raycast = () => {};
    this.add(stool);
    this.casketStool = stool;
    c.group.position.set(x, 0.86, z);
    c.group.rotation.y = -0.25;
    this.add(c.group);
    this.casketAt = new THREE.Vector3(x, 1.0, z);
    this.casketGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffcf7a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.casketGlow.position.copy(this.casketAt);
    this.casketGlow.scale.setScalar(0.9);
    this.casketGlow.raycast = () => {};
    this.add(this.casketGlow);

    this.lidHit = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.32), new THREE.MeshBasicMaterial({ visible: false }));
    this.lidHit.position.copy(this.casketAt);
    this.add(this.lidHit);
    this.boxReady = false;

    // Sleep, coming out of it
    const count = 70;
    const pos = new Float32Array(count * 3);
    this.vapor = { count, seeds: Array.from({ length: count }, () => ({ a: Math.random() * 6.28, r: Math.random(), s: 0.3 + Math.random() * 0.7, t: Math.random() })) };
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.vaporPts = new THREE.Points(g, new THREE.PointsMaterial({ map: softDot(), color: '#07040d', size: 0.95, transparent: true, opacity: 0, depthWrite: false, fog: false, sizeAttenuation: true }));
    this.vaporPts.frustumCulled = false;
    this.vaporPts.raycast = () => {};
    this.add(this.vaporPts);
  }

  _enableBox() {
    if (this.boxReady) return;
    this.boxReady = true;
    const { ctx } = this;
    ctx.interact.addHandle(this.lidHit, {
      reach: 0.28,
      tip: 'pull',
      onDrag: (hand) => {
        const k = clamp((hand.y - (this.casketAt.y + 0.02)) / 0.28, 0, 1);
        this.casket.hinge.rotation.x = -k * 1.9;
        if (k > 0.72) this._openBox();
      },
      onRelease: () => {
        if (!this.boxOpen) this.tween(0.3, (k) => (this.casket.hinge.rotation.x *= 1 - k));
      },
      onClick: () => this._openBox(),
    });
  }

  _openBox() {
    if (this.boxOpen) return;
    this.boxOpen = true;
    const from = this.casket.hinge.rotation.x;
    this.tween(1.6, (k) => (this.casket.hinge.rotation.x = lerp(from, -1.95, ease.inOut(k))));
    this.ctx.interact.remove(this.lidHit);
    this.ctx.input.remove(this.lidHit);
  }

  _buildFeathers() {
    this.FEATHERS = 110;
    const tex = featherTexture();
    const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.18 });
    const geo = new THREE.PlaneGeometry(0.05, 0.2);
    this.featherMesh = new THREE.InstancedMesh(geo, mat, this.FEATHERS);
    this.featherMesh.frustumCulled = false;
    this.featherMesh.raycast = () => {};
    this.add(this.featherMesh);
    this.feathers = Array.from({ length: this.FEATHERS }, () => ({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), spin: Math.random() * 6, s: 0.7 + Math.random() * 0.9 }));
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < this.FEATHERS; i++) this.featherMesh.setMatrixAt(i, _m);
  }

  _buildPetals() {
    const tex = petalTexture();
    const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.35, side: THREE.DoubleSide, emissive: '#5a1020', emissiveIntensity: 0.25 });
    const geo = new THREE.PlaneGeometry(0.075, 0.075);
    // on the floor, thick round the plinth
    const lying = new THREE.InstancedMesh(geo, mat, 620);
    lying.raycast = () => {};
    lying.frustumCulled = false;
    for (let i = 0; i < 620; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = SCALE * 0.8 + Math.pow(Math.random(), 1.6) * 6;
      _a.set(CENTRE.x + Math.sin(a) * r * 1.1, 0.008 + Math.random() * 0.01, CENTRE.z + Math.cos(a) * r * 0.85);
      _e.set(-Math.PI / 2 + (Math.random() - 0.5) * 0.3, 0, Math.random() * 6.28);
      _s.setScalar(0.7 + Math.random() * 0.8);
      lying.setMatrixAt(i, _m.compose(_a, _q.setFromEuler(_e), _s));
    }
    this.add(lying);

    // falling, always, over the marble
    this.PETALS = 90;
    this.falling = new THREE.InstancedMesh(geo, mat, this.PETALS);
    this.falling.raycast = () => {};
    this.falling.frustumCulled = false;
    this.petals = Array.from({ length: this.PETALS }, () => ({ a: Math.random() * 6.28, r: Math.random() * 5, y: Math.random() * 7, s: 0.15 + Math.random() * 0.25, w: Math.random() * 6 }));
    this.add(this.falling);
  }

  // ---------- the night ----------

  async start() {
    const { ctx } = this;
    const { audio, input, interact } = ctx;
    const E = ctx.content.EROS;
    this.sound('night', { parent: this.curtain, loop: true, volume: 0.28, rate: 0.7 });

    await this.wait(1.2);
    await this.say(E.rule, { hold: 1 });
    this.say(E.hintLamp, { narrate: false, hold: 3 });
    await this.until(() => this.lampOwner !== null, 28);
    if (this.lampOwner === null) this._takeLamp();
    this._lampEase = 0;

    // Then there is someone asleep
    const look = () => {
      if (!this.lampOwner && this.lampOwner !== 0) return;
      this._flatLook();
    };
    input.add(this.eros, { onSelect: look, dwell: false, highlight: false, tip: 'touch' });
    await this.say(E.dark, { hold: 0.6 });
    this.say(E.hintLook, { narrate: false, hold: 4 });
    this.lookingFor = true;
    await this.until(() => this.looked >= 1, 75);
    this.lookingFor = false;
    input.remove(this.eros);
    await this.say(E.face, { hold: 0.4 });

    // A drop
    await this._oil();
    this.woken = true;
    this.sound('hiss', { parent: this.eros, volume: 0.55, refDistance: 2 });
    interact.hands.forEach((h) => interact._pulse(h, 0.9, 120));
    this.sound('rustle', { parent: this.eros, volume: 1, refDistance: 3 });
    this.sound('rustle', { parent: this.eros, volume: 0.7, refDistance: 3, rate: 1.4 });
    this._burst();
    const m = this.eros.material;
    this.tween(1.0, (k) => {
      m.opacity = 1 - k;
      this.eros.position.y = 1.02 + k * 0.7;
    });
    this.tween(6, (k) => (this.sway = lerp(1, 0.4, k)));
    await this.say(E.drop, { hold: 0.8 });
    this.eros.visible = false;
    await this.say(E.gone, { hold: 1 });

    // The moon comes up, on what has been there all the time
    this.lyre = await this.sound('lyre', { parent: this.heartObj, loop: true, volume: 0, refDistance: 4 });
    audio.fade(this.lyre, 0.75, 7);
    this.phase = 'moon';
    for (const o of this.hidden) o.visible = true;
    const fog = ctx.scene.fog;
    this.tween(9, (raw) => {
      const k = ease.inOut(raw);
      this.moonK = k;
      this.moon.intensity = 0.62 * k;
      this.hemi.intensity = lerp(0.05, 0.3, k);
      this.curtain.material.opacity = 1 - k;
      fog.near = lerp(2, 9, k);
      fog.far = lerp(7.5, 34, k);
      this.lightPower = lerp(3.2, 4.2, k);
      this.light.distance = lerp(6, 10, k);
    });
    await this.wait(2.5);
    await this.say(E.years, { hold: 0.8 });
    this.say(E.hintWalk, { narrate: false, hold: 4 });
    await this.wait(5);

    interact.addTouch(this.kissProxy, {
      radius: 0.42,
      cooldown: 6,
      haptic: 0.8,
      onTouch: () => this._kissTouched(),
    });

    await this.until(() => this.opened >= 2, 55);
    this._enableBox();
    this.casketShown = true;
    this.lineBusy = false;
    this.say(E.hintBox, { narrate: false, hold: 4 });
    await this.say(E.box, { hold: 0.6 });
    await this.until(() => this.boxOpen, 90);
    if (!this.boxOpen) this._openBox();
    await this._sleep();
  }

  /** On a flat screen, you cannot move your hand: click him and the lamp goes to him. */
  _flatLook() {
    if (this.looked >= 1 || this.flying) return;
    const { ctx } = this;
    const head = ctx.camera.getWorldPosition(_a);
    if (head.distanceTo(this.erosFace) > 5.5) {
      this.say(ctx.content.EROS.closer, { narrate: false, hold: 2 });
      return;
    }
    this.flying = true;
    this.lampAt = this.lamp.position.clone();
    const target = this.erosFace.clone().add(new THREE.Vector3(0.02, 0.2, 0.1));
    const from = this.lamp.position.clone();
    this.lampOverride = from.clone();
    this.tween(1.6, (k) => this.lampOverride.lerpVectors(from, target, ease.inOut(k))).then?.(() => {});
    this.wait(1.6).then(() => {
      this.looked = 1;
    });
  }

  async _oil() {
    const start = this._flame(new THREE.Vector3());
    const end = this.erosFace.clone().add(new THREE.Vector3(0.28, -0.07, 0.04));
    this.drop.visible = true;
    this.drop.position.copy(start);
    await this.tween(0.65, (k) => this.drop.position.lerpVectors(start, end, k * k));
    this.drop.visible = false;
    // the lamp comes back to you
    if (this.lampOverride) {
      const from = this.lampOverride.clone();
      await this.tween(0.8, (k) => {
        this._lampGoal(_c);
        this.lampOverride.lerpVectors(from, _c, ease.inOut(k));
      });
      this.lampOverride = null;
    }
  }

  _burst() {
    this.feathers.forEach((f, i) => {
      f.on = true;
      f.p.set(this.erosFace.x + 0.5 + (Math.random() - 0.5) * 1.5, 0.85 + Math.random() * 0.2, this.erosFace.z + (Math.random() - 0.5) * 0.5);
      const a = Math.random() * 6.28;
      const sp = 0.4 + Math.random() * 1.4;
      f.v.set(Math.cos(a) * sp, 1.6 + Math.random() * 3.2, Math.sin(a) * sp);
      f.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      f.wait = i * 0.002;
    });
    this.feathersOn = true;
  }

  _kissTouched() {
    const { ctx } = this;
    this.heartK = 1;
    if (this.kissSaid) return;
    this.kissSaid = true;
    this.say(ctx.content.EROS.kiss, { hold: 0.8 });
  }

  async _sleep() {
    const { ctx } = this;
    const { audio, interact, input, fader } = ctx;
    const E = ctx.content.EROS;
    this.phase = 'sleep';
    this.casketGlow.material.opacity = 0;
    input.clear();
    interact.clear();
    if (this.lyre) audio.fade(this.lyre, 0, 4);
    this.sound('underworld', { parent: this.casket.group, volume: 0.9, refDistance: 3, loop: true });
    this.vaporOn = true;
    this.tween(5, (k) => {
      this.vaporPts.material.opacity = 0.75 * k;
      ctx.scene.fog.near = lerp(9, 1.2, ease.inOut(k));
      ctx.scene.fog.far = lerp(34, 7, ease.inOut(k));
    });
    await this.say(E.sleep, { hold: 0.6 });
    this.tween(5, (k) => (this.flameK = 1 - k));
    await this.say(E.notBeauty, { hold: 0.8 });
    interact.hands.forEach((h) => interact._pulse(h, 0.5, 200));

    await fader.fade(1, 2.5);

    // You, where she lies. His face is above you, and it stays there.
    this.flameK = 0;
    this.vaporOn = false;
    this.vaporPts.visible = false;
    this.lamp.visible = false;
    this.flame.visible = this.halo.visible = false;
    ctx.locomotion.setArea(null);
    interact.setHandsVisible(false);
    const e = this.herEyes;
    ctx.rig.position.set(e.x, e.y, e.z);
    const yaw = Math.atan2(-(this.kissAt.x - e.x), -(this.kissAt.z - e.z));
    ctx.rig.rotation.y = yaw;
    ctx.look.reset(0, Math.atan2(this.kissAt.y - e.y, Math.hypot(this.kissAt.x - e.x, this.kissAt.z - e.z)));
    ctx.locomotion.recenter();
    ctx.scene.fog.near = 1;
    ctx.scene.fog.far = 18;
    this.moon.intensity = 0.8;
    this.hemi.intensity = 0.14;
    // what is left of the lamp, and it is not a lamp: the marble itself, a little warm where you lie
    this.lastLight = new THREE.PointLight('#ffb98a', 1.5, 4, 1.8);
    this.lastLight.position.set(e.x, e.y - 0.3, e.z + 0.1);
    this.add(this.lastLight);
    this.heartFading = true;
    this.heartRate = 0.55;

    await this.wait(0.6);
    await fader.fade(0, 3.5);
    await this.wait(1.2);
    await this.say(E.above, { hold: 1.2 });
    await this.wait(2.5);
    await this.say(E.still, { hold: 1.5 });
    this.heartRate = 0.25;
    await this.wait(5);
    this.heartStopped = true;
    await this.wait(2.5);
    this.next('choice', {}, { color: '#000000', out: 3, in: 2 });
  }

  // ---------- every frame ----------

  /** Where the lamp should be if nothing else is moving it. */
  _lampGoal(out) {
    const { ctx } = this;
    if (typeof this.lampOwner === 'number') {
      const h = ctx.interact.hands[this.lampOwner];
      if (h?.tracked) return out.copy(h.pos).add(_b.set(0, 0.02, 0));
    }
    if (this.lampOwner === null) return out.copy(this.lampHome);
    const cam = ctx.camera;
    cam.getWorldPosition(out);
    cam.getWorldDirection(_b);
    _c.copy(_b).cross(cam.up).normalize();
    const portrait = window.innerWidth < window.innerHeight;
    return out.addScaledVector(_b, 0.62).addScaledVector(_c, portrait ? 0.1 : 0.26).add(_b.set(0, -0.3, 0));
  }

  _flame(out) {
    return out.copy(this.lamp.position).add(_b.set(0.14, 0.12, 0));
  }

  update(dt, t) {
    super.update(dt, t);
    if (!this.ready) return;
    this.clothU.sway.value = t;
    this.clothU.k.value = this.sway;

    // the lamp
    if (this.lampOwner !== null && !this.lampOverride) {
      this._lampEase = Math.min(1, (this._lampEase ?? 0) + dt * 3);
      const goal = this._lampGoal(new THREE.Vector3());
      this.lamp.position.lerp(goal, this._lampEase >= 1 ? 1 : this._lampEase * 0.5);
    } else if (this.lampOverride) {
      this.lamp.position.copy(this.lampOverride);
    }
    const fl = this._flame(_a);
    const flicker = 0.88 + Math.sin(t * 11.3) * 0.05 + Math.sin(t * 17.9 + 1) * 0.04 + Math.sin(t * 5.1) * 0.03;
    const live = this.flameK * flicker;
    this.light.position.copy(fl);
    this.light.intensity = this.lightPower * live;
    this.flame.position.copy(fl);
    this.flame.scale.set(0.05 * Math.max(0.02, live), 0.1 * Math.max(0.02, live), 1);
    this.halo.position.copy(fl);
    this.halo.material.opacity = 0.55 * live;

    // he is only there where the flame is
    if (this.eros.visible && !this.woken) {
      const near = clamp((2.4 - fl.distanceTo(this.erosFace)) / 1.5, 0, 1);
      this.eros.material.color.setScalar(lerp(0.05, 1, near * near));
    } else if (this.woken) {
      this.eros.material.color.setScalar(1);
    }

    // his face, under the flame
    if (this.lookingFor && typeof this.lampOwner === 'number') {
      this.looked = fl.distanceTo(this.erosFace) < 0.62 ? this.looked + dt / LOOK_FOR : Math.max(0, this.looked - dt * 0.3);
    }

    this._updateFeathers(dt, t);
    this._updatePetals(dt, t);
    this._updateWindows(dt);
    this._updateHeart(dt);
    this._updateVapor(dt, t);

    // the box catches the light once you have earned it
    if (this.casketShown && !this.boxOpen) this.casketGlow.material.opacity = 0.22 + Math.sin(t * 1.7) * 0.1;
    else this.casketGlow.material.opacity = 0;
    this.curtain.visible = this.moonK < 1;
  }

  _updateWindows(dt) {
    if (this.phase === 'dark') return;
    const fl = this.lamp.position;
    for (const w of this.windows) {
      const d = Math.hypot(fl.x - w.at.x, fl.z - w.at.z);
      const want = this.phase === 'moon' && d < OPEN_AT + 1.2 ? clamp((OPEN_AT + 1.2 - d) / 1.2, 0, 1) : 0;
      const before = w.k;
      w.k += (want - w.k) * Math.min(1, dt * 1.6);
      if (Math.abs(before - w.k) < 1e-4 && w.k < 1e-3) continue;
      const k = ease.inOut(clamp(w.k, 0, 1));
      w.back.position.z = -DEEP * k * 0.96;
      w.back.scale.setScalar(1 + k * 1.15);
      const lit = lerp(0.04 + this.moonK * 0.1, 0.92, k);
      w.back.material.emissiveIntensity = lit;
      if (w.fig) {
        w.fig.position.z = 0.012 + k * 0.85;
        w.fig.material.emissiveIntensity = lit;
      }
      w.pool.material.opacity = k * 0.16;
      if (!w.seen && w.k > 0.6) {
        w.seen = true;
        this.opened++;
        this._line(this.ctx.content.EROS.windows[w.key]);
      }
    }
  }

  async _line(text) {
    if (!text || this.lineBusy || this.phase !== 'moon') return;
    this.lineBusy = true;
    await this.say(text, { hold: 0.5 });
    this.lineBusy = false;
  }

  _updateHeart(dt) {
    const { ctx } = this;
    if (!this.marble || this.heartStopped) {
      if (this.marble) this.marble.userData.marble.heart.value.w *= Math.max(0, 1 - dt * 2);
      return;
    }
    const head = ctx.camera.getWorldPosition(_b);
    const near = clamp(1 - (head.distanceTo(this.heartAt) - 2.2) / 5.5, 0, 1);
    this.heartK = Math.max(near * near, this.heartK - dt * 0.12);
    const active = this.phase !== 'dark';
    const rate = this.heartFading ? this.heartRate : lerp(0.75, 1.75, this.heartK); // beats per second
    this.beatT += dt * rate;
    if (active && this.beatT >= 1) {
      this.beatT -= 1;
      this.heartPulse = 1;
      const v = this.heartFading ? 0.85 : 0.2 + this.heartK * 0.7;
      this.sound('thump', { parent: this.heartObj, volume: v, refDistance: 3, rate: 1.3 });
      const { interact } = ctx;
      const pulse = this.heartFading ? 0.6 : this.heartK * 0.55;
      if (pulse > 0.05) interact.hands.forEach((h) => interact._pulse(h, pulse, 70));
    }
    this.heartPulse = Math.max(0, this.heartPulse - dt * 3.2);
    const u = this.marble.userData.marble.heart.value;
    u.set(this.heartAt.x, this.heartAt.y, this.heartAt.z, active ? (0.1 + this.heartK * 0.4) * this.heartPulse : 0);
  }

  _updateFeathers(dt, t) {
    if (!this.feathersOn) return;
    for (let i = 0; i < this.FEATHERS; i++) {
      const f = this.feathers[i];
      if (f.p.y > 0.02) {
        f.v.y -= 2.6 * dt;
        f.v.y = Math.max(f.v.y, -0.32);
        f.v.x *= 1 - dt * 0.9;
        f.v.z *= 1 - dt * 0.9;
        f.p.addScaledVector(f.v, dt);
        f.p.x += Math.sin(t * 1.3 + f.spin) * 0.004;
        f.r.x += dt * Math.sin(t + f.spin) * 1.4;
        f.r.y += dt * 0.7;
      } else {
        f.r.x = -Math.PI / 2;
        f.r.y = 0;
      }
      _s.setScalar(f.s);
      this.featherMesh.setMatrixAt(i, _m.compose(f.p, _q.setFromEuler(f.r), _s));
    }
    this.featherMesh.instanceMatrix.needsUpdate = true;
  }

  _updatePetals(dt, t) {
    for (let i = 0; i < this.PETALS; i++) {
      const p = this.petals[i];
      p.y -= p.s * dt;
      if (p.y < 0.02) {
        p.y = 7;
        p.a = Math.random() * 6.28;
        p.r = Math.random() * 5;
      }
      _a.set(CENTRE.x + Math.sin(p.a) * p.r + Math.sin(t * 0.8 + p.w) * 0.3, p.y, CENTRE.z + Math.cos(p.a) * p.r + Math.cos(t * 0.7 + p.w) * 0.3);
      _e.set(t * 0.9 + p.w, t * 0.7 + p.w * 2, 0);
      _s.setScalar(1);
      this.falling.setMatrixAt(i, _m.compose(_a, _q.setFromEuler(_e), _s));
    }
    this.falling.instanceMatrix.needsUpdate = true;
  }

  _updateVapor(dt, t) {
    if (!this.vaporOn) return;
    const pos = this.vaporPts.geometry.attributes.position;
    for (let i = 0; i < this.vapor.count; i++) {
      const s = this.vapor.seeds[i];
      s.t = (s.t + dt * 0.14 * s.s) % 1;
      const r = s.r * (0.08 + s.t * 3.4);
      const a = s.a + s.t * 2.4 + t * 0.04;
      pos.setXYZ(i, this.casketAt.x + Math.cos(a) * r, this.casketAt.y + s.t * 4.2, this.casketAt.z + Math.sin(a) * r);
    }
    pos.needsUpdate = true;
  }
}
