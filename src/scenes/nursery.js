import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { glowTexture, lerp, ease } from '../core/util.js';
import { softMaterial, lightShaftMaterial, bindShaft, paintedTexture, bakeGradient } from '../core/look.js';
import { loadArt, cutout, groundShadow } from '../core/collage.js';

// The baby's room, shared by the crib, forgetting and choice scenes.
// A Trojan chamber: frescoed walls over a terracotta dado, Greek-key friezes,
// Doric columns at a loggia opening onto Hayez's view of Troy, a real Attic amphora,
// and the parents painted — Hector by Tischbein, Andromache's veiled face.
// Viewer sits in the crib: eye at EYE metres, looking down -Z, through the bars.
// Look: "window light" — the window is the only real source; everything is soft and backlit.

export const EYE = 0.75;

/** Dark ink for text in the bright nursery (light text vanishes in the haze). */
export const INK = { color: '#2e231c', glow: 'rgba(255,248,236,0.95)' };
export const WINDOW_POS = new THREE.Vector3(-1.1, 1.8, -3.48);
export const DOOR_POS = new THREE.Vector3(2.97, 1.1, -1.7);

// Direction the sunlight travels through the window (down and into the room).
const SUN_DIR = new THREE.Vector3(0.25, -0.75, 1).normalize();
const WIN_W = 1.2;
const WIN_H = 1.4;

const PAL = {
  wallLow: '#c4935f',
  wallHigh: '#eed9b5',
  floorEdge: '#a8825f',
  floorMid: '#d6b28c',
  warm: '#ffe2b8',
  cream: '#f7efe4',
  shadow: '#9c7b67',
};

/** A giant adult hand + forearm. Fingers point +Y, palm faces +Z (local). */
/**
 * Hector's helmet, modelled: a Corinthian bronze with eye-holes and cheek-pieces, and the horsehair
 * crest that frightened the child. Height about 0.55 m. `fade(k)` brings it in.
 */
export function buildHelmet() {
  const group = new THREE.Group();
  // The bronze is painted: hammered, darkened by age, its eyes and mouth cut out of the sheet with a clean edge.
  const X = (u) => ((u / Math.PI + 1) / 2) * 1024;
  const Y = (v) => v * 512;
  const metal = paintedTexture(1024, 512, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#a17a35');
    g.addColorStop(0.42, '#7d5a24');
    g.addColorStop(0.75, '#5e421a');
    g.addColorStop(1, '#3f2c12');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const light = i % 3 === 0;
      c.fillStyle = light ? `rgba(226,186,110,${0.04 + Math.random() * 0.09})` : `rgba(26,16,6,${0.04 + Math.random() * 0.1})`;
      c.beginPath();
      c.ellipse(Math.random() * w, Math.random() * h, 3 + Math.random() * 9, 2 + Math.random() * 5, Math.random() * 3, 0, Math.PI * 2);
      c.fill();
    }
    for (let i = 0; i < 90; i++) {
      c.fillStyle = `rgba(74,128,104,${0.03 + Math.random() * 0.08})`; // verdigris
      c.beginPath();
      c.ellipse(Math.random() * w, h * (0.35 + Math.random() * 0.65), 8 + Math.random() * 26, 4 + Math.random() * 12, Math.random() * 3, 0, Math.PI * 2);
      c.fill();
    }
    // the openings
    const path = () => {
      c.beginPath();
      // left eye, nose-guard, right eye, down to the mouth
      c.moveTo(X(-0.1), Y(0.56));
      c.bezierCurveTo(X(-0.2), Y(0.6), X(-0.62), Y(0.58), X(-0.74), Y(0.47));
      c.bezierCurveTo(X(-0.56), Y(0.42), X(-0.2), Y(0.42), X(-0.1), Y(0.47));
      c.closePath();
      c.moveTo(X(0.1), Y(0.56));
      c.bezierCurveTo(X(0.2), Y(0.6), X(0.62), Y(0.58), X(0.74), Y(0.47));
      c.bezierCurveTo(X(0.56), Y(0.42), X(0.2), Y(0.42), X(0.1), Y(0.47));
      c.closePath();
      c.moveTo(X(-0.1), Y(0.58));
      c.lineTo(X(-0.28), Y(1.02));
      c.lineTo(X(0.28), Y(1.02));
      c.lineTo(X(0.1), Y(0.58));
      c.bezierCurveTo(X(0.05), Y(0.62), X(-0.05), Y(0.62), X(-0.1), Y(0.58));
      c.closePath();
    };
    // an incised line following them, as the smith would leave it
    path();
    c.lineWidth = 12;
    c.strokeStyle = 'rgba(214,170,90,0.55)';
    c.stroke();
    path();
    c.lineWidth = 7;
    c.strokeStyle = 'rgba(32,20,8,0.75)';
    c.stroke();
    c.globalCompositeOperation = 'destination-out';
    path();
    c.fillStyle = '#000';
    c.fill();
    c.globalCompositeOperation = 'source-over';
  });
  metal.anisotropy = 8;
  const bronze = new THREE.MeshLambertMaterial({ map: metal, side: THREE.FrontSide, alphaTest: 0.5, transparent: true });
  const fittings = softMaterial({ color: '#94702f', rim: '#ffe6b0', rimPower: 1.5, rimStrength: 0.7, hatch: 0, umber: '#2e1e0c', side: THREE.DoubleSide, transparent: true });
  const inner = new THREE.MeshBasicMaterial({ map: metal, color: '#000000', alphaTest: 0.5, side: THREE.BackSide, transparent: true });
  const H = 0.36;
  const R = 0.13;
  const COLS = 64;
  const ROWS = 30;
  const DOME = 0.45;
  const yDome = H * (1 - DOME);
  const pos = [];
  const uvs = [];
  const index = [];
  for (let j = 0; j <= ROWS; j++) {
    const v = j / ROWS;
    const inDome = v < DOME;
    const th = (Math.PI / 2) * (v / DOME);
    const k0 = (v - DOME) / (1 - DOME);
    const r = inDome ? R * Math.sin(th) : R * (1 - 0.1 * Math.sin(Math.PI * Math.min(1, k0 * 1.25)) + 0.1 * k0 * k0);
    const y = inDome ? yDome + (H - yDome) * Math.cos(th) : H * (1 - v);
    for (let i = 0; i <= COLS; i++) {
      const u = (i / COLS) * Math.PI * 2 - Math.PI;
      // the cheek-pieces come forward and in, toward the chin
      const k = Math.max(0, (v - 0.55) / 0.45);
      const front = Math.max(0, Math.cos(u));
      pos.push(Math.sin(u) * r * (1 - 0.14 * k * front), y - 0.03 * k * k * front, Math.cos(u) * r * (1.12 + 0.2 * k * front));
      uvs.push(i / COLS, 1 - v);
    }
  }
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const a = j * (COLS + 1) + i;
      const b = a + COLS + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const shell = new THREE.Mesh(geo, bronze);
  const lining = new THREE.Mesh(geo, inner);
  lining.scale.setScalar(0.99);
  group.add(shell, lining);

  // a brow ridge, and the crest's bronze holder
  const brow = new THREE.Mesh(new THREE.TorusGeometry(R * 1.02, 0.0045, 6, 64), fittings);
  brow.rotation.x = Math.PI / 2;
  brow.scale.set(1, 1.12, 1);
  brow.position.y = H * 0.585;
  group.add(brow);

  // the crest: horsehair, on an arc from brow to nape
  const hair = paintedTexture(512, 128, (c, w, h) => {
    c.fillStyle = '#7c1f18';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      c.strokeStyle = ['#a8342a', '#57130e', '#c4563c', '#3f0d0a'][i % 4];
      c.lineWidth = 0.6 + Math.random() * 1.4;
      const x = Math.random() * w;
      c.beginPath();
      c.moveTo(x, h);
      c.quadraticCurveTo(x + (Math.random() - 0.5) * 18, h * 0.5, x + (Math.random() - 0.5) * 26, 0);
      c.stroke();
    }
  });
  const hairMat = new THREE.MeshLambertMaterial({ map: hair, side: THREE.DoubleSide, transparent: true, emissive: '#3a0d0a' });
  const cy = H - 0.16;
  const arc = (t, r) => [cy + Math.cos(t) * r, Math.sin(t) * r];
  const STEPS = 40;
  const P = [];
  const UV = [];
  const I = [];
  const t0 = 1.5;
  const t1 = -2.15;
  for (let n = 0; n <= STEPS; n++) {
    const k = n / STEPS;
    const t = t0 + (t1 - t0) * k;
    const swell = Math.sin(Math.PI * Math.min(1, k * 1.04));
    const r0 = 0.142;
    const r1 = r0 + 0.035 + 0.135 * swell;
    const halfW = 0.004 + 0.021 * swell;
    const [y0, z0] = arc(t, r0);
    const [y1, z1] = arc(t, r1);
    // a wedge: thin at the root, full at the top, and a rounded back
    for (const [x, y, z, v] of [[0, y0, z0, 0], [-halfW, y1, z1, 0.92], [0, y1 + (y1 - cy) * 0.03, z1 + (z1 - 0) * 0.03, 1], [halfW, y1, z1, 0.92]]) {
      P.push(x, y, z);
      UV.push(k * 2, v);
    }
  }
  for (let n = 0; n < STEPS; n++) {
    const a = n * 4;
    for (const [p, q] of [[0, 1], [1, 2], [2, 3], [3, 0]]) I.push(a + p, a + 4 + p, a + q, a + q, a + 4 + p, a + 4 + q);
  }
  const crestGeo = new THREE.BufferGeometry();
  crestGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  crestGeo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  crestGeo.setIndex(I);
  crestGeo.computeVertexNormals();
  hair.wrapS = THREE.RepeatWrapping;
  group.add(new THREE.Mesh(crestGeo, hairMat));

  const holderPts = [];
  for (let n = 0; n <= 16; n++) {
    const t = t0 + ((t1 - t0) * n) / 16;
    const [y, z] = arc(t, 0.143);
    holderPts.push(new THREE.Vector3(0, y, z));
  }
  group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(holderPts), 40, 0.007, 6), fittings));

  const shadow = groundShadow(0.8);
  group.add(shadow);
  const baseOpacity = shadow.material.opacity;
  group.traverse((o) => (o.raycast = () => {}));
  const mats = [bronze, fittings, inner, hairMat];
  group.fade = (k) => {
    for (const m of mats) {
      m.opacity = k;
      m.depthWrite = k > 0.98;
    }
    shadow.material.opacity = baseOpacity * k;
  };
  return group;
}

export class GiantHand extends THREE.Group {
  constructor({ side = 1, skin = '#e8c2a4', sleeve = '#b98b8b', scale = 2.2, plain = false } = {}) {
    super();
    this.curl = 0.15;
    this.targetCurl = 0.15;
    // Skin glows red-orange at the edges, like a hand held up to the light.
    // fine lines on skin: at hand scale, coarse hatching would read as a net, not as shading
    const skinMat = softMaterial({ color: skin, rim: '#ffc4a0', rimPower: 2.6, rimStrength: 0.3, hatch: plain ? 0 : 190, umber: '#8a5a40' });
    this.skinMat = skinMat;
    const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), skinMat); // children[0]: the skin
    palm.scale.set(0.047, 0.056, 0.019);
    this.add(palm);
    const heel = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), skinMat);
    heel.scale.set(0.04, 0.03, 0.02);
    heel.position.set(0.006 * side, -0.035, -0.002);
    this.add(heel);

    // Fingers in two segments, so they curl like fingers.
    this.fingers = [];
    const specs = [
      [-0.031, 0.048, 0.03, 0.025, 0.0085],
      [-0.0105, 0.055, 0.036, 0.029, 0.009],
      [0.0105, 0.053, 0.034, 0.028, 0.0088],
      [0.03, 0.046, 0.026, 0.022, 0.0078],
    ];
    for (const [x, y, l1, l2, r] of specs) {
      const a = new THREE.Group();
      a.position.set(x * -side, y, 0);
      const s1 = new THREE.Mesh(new THREE.CapsuleGeometry(r, l1, 6, 12), skinMat);
      s1.position.y = l1 / 2 + r * 0.5;
      const b = new THREE.Group();
      b.position.y = l1 + r * 0.6;
      const s2 = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.92, l2, 6, 12), skinMat);
      s2.position.y = l2 / 2 + r * 0.4;
      b.add(s2);
      a.add(s1, b);
      this.add(a);
      this.fingers.push({ a, b });
    }
    const thumb = new THREE.Group();
    thumb.position.set(0.042 * side, -0.01, 0.008);
    thumb.rotation.z = -0.85 * side;
    const tm = new THREE.Mesh(new THREE.CapsuleGeometry(0.0105, 0.046, 6, 12), skinMat);
    tm.position.y = 0.03;
    thumb.add(tm);
    this.add(thumb);
    this.thumb = thumb;

    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.034, 0.09, 20), skinMat);
    wrist.position.y = -0.075;
    this.add(wrist);
    const sleeveMat = softMaterial({ color: sleeve, rim: '#fff0dc', rimPower: 1.8, rimStrength: 0.35, hatch: plain ? 0 : 220 });
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.5, 6, 20), sleeveMat);
    arm.position.y = -0.36;
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.037, 0.008, 8, 24), sleeveMat);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.115;
    this.add(arm, cuff);
    this.scale.setScalar(scale);
    this.visible = false;
  }

  /** Tween to a pose. `rot` is an Euler (radians). Owned by `scene`. */
  moveTo(scene, pos, rot, seconds = 2, easing = ease.inOut) {
    this.visible = true;
    const p0 = this.position.clone();
    const q0 = this.quaternion.clone();
    const q1 = new THREE.Quaternion().setFromEuler(rot instanceof THREE.Euler ? rot : new THREE.Euler(...rot));
    return scene.tween(
      seconds,
      (k) => {
        this.position.lerpVectors(p0, pos, k);
        this.quaternion.slerpQuaternions(q0, q1, k);
      },
      easing,
    );
  }

  place(pos, rot) {
    this.position.copy(pos);
    this.rotation.set(...rot);
  }

  update(t, dt) {
    this.curl = lerp(this.curl, this.targetCurl, Math.min(1, dt * 4));
    this.fingers.forEach(({ a, b }, i) => {
      const c = this.curl * (1.0 + i * 0.08) + Math.sin(t * 1.3 + i) * 0.025;
      a.rotation.x = c * 0.7;
      b.rotation.x = c * 0.9;
    });
    this.thumb.rotation.x = this.curl * 0.6;
  }
}

// Body profile (radius, height) for a standing adult, feet to neck.
const BODY_PROFILE = [
  [0.0, 0.0], [0.19, 0.0], [0.21, 0.08], [0.2, 0.45], [0.18, 0.8], [0.2, 1.05],
  [0.235, 1.3], [0.255, 1.42], [0.23, 1.5], [0.14, 1.55], [0.065, 1.58], [0.06, 1.64], [0.0, 1.64],
].map(([r, y]) => new THREE.Vector2(r, y));

/** A tall faceless adult: a soft silhouette against the window, leaning toward the crib. */
export class Adult extends THREE.Group {
  constructor({ color = '#b98b8b', skin = '#e3bfa3', hair = '#4a3a30', height = 2.05 } = {}) {
    super();
    const s = height / 1.9;
    // Backlit: darker body, bright warm rim — reads as a person standing in front of the light.
    const bodyColor = new THREE.Color(color).multiplyScalar(0.8);
    this.body = new THREE.Mesh(
      new THREE.LatheGeometry(BODY_PROFILE, 40),
      softMaterial({ color: bodyColor, rim: '#ffe0b8', rimPower: 1.6, rimStrength: 0.85 }),
    );
    this.body.scale.setScalar(s);
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 32, 24), softMaterial({ color: skin, rim: '#ffcf9e', rimPower: 1.8, rimStrength: 0.7 }));
    this.head.scale.set(1, 1.12, 1);
    this.head.position.y = 1.8 * s;
    this.hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.166, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.58),
      softMaterial({ color: hair, rim: '#ffd9a8', rimPower: 1.5, rimStrength: 0.9 }),
    );
    this.hair.scale.set(1, 1.12, 1);
    this.hair.position.copy(this.head.position).add(new THREE.Vector3(0, 0.025, -0.012));
    this.hair.rotation.x = -0.25;
    // Arms hang from the shoulders, softly bent toward the crib.
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.62, 6, 16), this.body.material);
      arm.position.set(0.27 * side * s, 1.12 * s, 0.04 * s);
      arm.rotation.set(-0.25, 0, 0.1 * side);
      arm.scale.setScalar(s);
      this.add(arm);
    }
    this.upper = new THREE.Group(); // leans
    this.upper.add(this.head, this.hair);
    this.add(this.body, this.upper);
    this.lean = 0.22;
    this.phase = Math.random() * 6;
    this.age = 0; // 0..1 greys and stoops (endings)
    this._hairColor = new THREE.Color(hair);
    this._grey = new THREE.Color('#d8d4cf');
  }

  update(t) {
    const sway = Math.sin(t * 0.6 + this.phase) * 0.03;
    const lean = this.lean + this.age * 0.25;
    this.rotation.x = 0;
    this.upper.rotation.x = lean + sway;
    this.body.rotation.x = lean * 0.4 + sway * 0.5;
    this.hair.material.color.copy(this._hairColor).lerp(this._grey, this.age);
  }
}

/** Paintings used in the room (loaded once, shared by every nursery scene). */
let _art = null;
export function nurseryArt() {
  return (_art ||= loadArt('crib', ['hector', 'andromache-face', 'amphora', 'hayez', 'fright', 'troy-view']));
}

/**
 * A parent painted, not modelled: Hector cut from Tischbein's canvas, or Andromache as a
 * soft oval portrait leaning over the crib. Same interface as Adult (lean, age, upper, update).
 */
export class PaintedParent extends THREE.Group {
  constructor(tex, { height = 2.3, portrait = false } = {}) {
    super();
    this.upper = new THREE.Group(); // leans; sounds attach here
    this.add(this.upper);
    this.portrait = portrait;
    this.fig = cutout(tex, height, { anchor: portrait ? 'center' : 'feet' });
    if (portrait) {
      this.fig.position.y = 1.85;
      this.fig.material.depthWrite = false;
    } else this.add(groundShadow(height * 0.42));
    this.upper.add(this.fig);
    this.lean = 0.22;
    this.age = 0; // 0..1 the paint fades and greys (endings)
    this.phase = Math.random() * 6;
  }

  update(t) {
    const sway = Math.sin(t * 0.6 + this.phase) * 0.03;
    this.lookAt(0, this.position.y, 0);
    if (this.portrait) {
      // she bends toward the crib: forward and down
      this.fig.position.z = this.lean * 1.6 + sway;
      this.fig.position.y = 1.85 - this.lean * 0.5;
      this.fig.rotation.x = -this.lean * 0.6;
    } else this.upper.rotation.x = this.lean * 0.18 + sway * 0.5;
    const fade = 1 - this.age * 0.35;
    this.fig.material.color.setRGB(fade, fade * 0.98, fade * 0.95);
  }
}

/** The Greek key (meander) as a running band, terracotta on cream. */
export function meanderTexture(fg = '#7a2e1f', bg = '#ecd9b4') {
  const tex = paintedTexture(256, 64, (c, w, h) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = fg;
    c.lineWidth = 6;
    c.lineCap = 'square';
    const u = 64; // one key per 64 px
    for (let x = 0; x < w; x += u) {
      c.beginPath();
      c.moveTo(x + 6, h - 10);
      c.lineTo(x + 6, 10);
      c.lineTo(x + 50, 10);
      c.lineTo(x + 50, 42);
      c.lineTo(x + 22, 42);
      c.lineTo(x + 22, 26);
      c.lineTo(x + 36, 26);
      c.moveTo(x + 6, h - 10);
      c.lineTo(x + 64 + 6, h - 10);
      c.stroke();
    }
    c.fillStyle = fg;
    c.fillRect(0, 0, w, 3);
    c.fillRect(0, h - 3, w, 3);
  });
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** A woven floor mat with a key border. */
function matTexture() {
  return paintedTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#d9bf8f';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(120,80,40,0.25)';
    for (let i = 0; i < w; i += 6) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i, h);
      c.stroke();
    }
    c.strokeStyle = '#8a3422';
    c.lineWidth = 10;
    c.strokeRect(14, 14, w - 28, h - 28);
    c.lineWidth = 3;
    c.strokeRect(30, 30, w - 60, h - 60);
  });
}

/** A fluted Doric column with a cushion capital, standing on the floor. */
export function doricColumn(mat, height = 2.9) {
  const g = new THREE.Group();
  const shaftGeo = new THREE.CylinderGeometry(0.13, 0.16, height - 0.3, 40, 1);
  const p = shaftGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const k = 1 - 0.06 * Math.max(0, Math.cos(a * 20)); // 20 flutes
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  shaftGeo.computeVertexNormals();
  const shaft = new THREE.Mesh(shaftGeo, mat);
  shaft.position.y = (height - 0.3) / 2;
  const echinus = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.14, 0.14, 32), mat);
  echinus.position.y = height - 0.23;
  const abacus = new THREE.Mesh(new RoundedBoxGeometry(0.48, 0.12, 0.48, 2, 0.01), mat);
  abacus.position.y = height - 0.08;
  g.add(shaft, echinus, abacus);
  return g;
}

/** A painting hung on a wall in a gilded frame. */
export function framedPainting(tex, width, frameMat) {
  const g = new THREE.Group();
  const h = width * (tex.image.height / tex.image.width);
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(width, h), new THREE.MeshLambertMaterial({ map: tex }));
  g.add(pic);
  const t = 0.07;
  for (const [w, hh, x, y] of [[width + 2 * t, t, 0, h / 2 + t / 2], [width + 2 * t, t, 0, -h / 2 - t / 2], [t, h, width / 2 + t / 2, 0], [t, h, -width / 2 - t / 2, 0]]) {
    const bar = new THREE.Mesh(new RoundedBoxGeometry(w, hh, 0.05, 2, 0.015), frameMat);
    bar.position.set(x, y, 0.02);
    g.add(bar);
  }
  g.traverse((o) => (o.raycast = () => {}));
  return g;
}

/** The view through the window: overexposed sky, a hint of leaves. */
function windowTexture() {
  return paintedTexture(256, 300, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#fffdf6');
    g.addColorStop(0.6, '#fff6e2');
    g.addColorStop(1, '#ffe9c4');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.filter = 'blur(14px)';
    c.fillStyle = 'rgba(196, 204, 150, 0.35)';
    for (const [x, y, r] of [[20, 30, 60], [70, 10, 50], [230, 60, 55], [210, 230, 70], [30, 270, 60]]) {
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
    c.filter = 'blur(30px)';
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath();
    c.arc(w * 0.45, h * 0.4, 70, 0, Math.PI * 2);
    c.fill();
  });
}

/** Sunlight pooled on a surface: the window's shape, blurred, cross-barred. */
function lightPoolTexture() {
  return paintedTexture(256, 256, (c, w, h) => {
    c.filter = 'blur(10px)';
    c.fillStyle = 'rgba(255,236,200,1)';
    const p = 34;
    const gap = 8;
    const qw = (w - p * 2 - gap) / 2;
    const qh = (h - p * 2 - gap) / 2;
    for (const [x, y] of [[p, p], [p + qw + gap, p], [p, p + qh + gap], [p + qw + gap, p + qh + gap]]) c.fillRect(x, y, qw, qh);
  });
}

/** Open box between two rectangles (window → floor patch), UVs: u across, v along. */
function shaftGeometry(a, b) {
  // a, b: arrays of 4 corners (same winding). Builds the 4 side faces.
  const pos = [];
  const uv = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    pos.push(...a[i].toArray(), ...a[j].toArray(), ...b[j].toArray(), ...a[i].toArray(), ...b[j].toArray(), ...b[i].toArray());
    uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Five-point star outline for the mobile. */
function starShape(r1, r2) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? r2 : r1;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

/**
 * Builds the room. Returns handles to everything a scene animates.
 */
export function buildNursery(art = {}) {
  const group = new THREE.Group();

  // Room shell (inside-out) with baked light: darker low, glowing around the window.
  const shellGeo = bakeGradient(new THREE.BoxGeometry(6, 3.2, 6, 24, 14, 24), {
    low: PAL.wallLow,
    high: PAL.wallHigh,
    from: -1.6,
    to: 0.6,
    lift: { at: new THREE.Vector3(WINDOW_POS.x, WINDOW_POS.y - 1.6, WINDOW_POS.z + 0.3), radius: 3.0, color: '#fffbf4', strength: 1 },
  });
  // Baked, not lit: the vertex colours *are* the light, so the room stays luminous and costs nothing.
  const room = new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
  room.position.set(0, 1.6, -0.5);
  const floorGeo = new THREE.PlaneGeometry(6, 6, 24, 24);
  floorGeo.rotateX(-Math.PI / 2);
  {
    // Warm wood, darker toward the walls.
    const pos = floorGeo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const mid = new THREE.Color(PAL.floorMid);
    const edge = new THREE.Color(PAL.floorEdge);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const e = Math.max(Math.abs(pos.getX(i)), Math.abs(pos.getZ(i))) / 3;
      c.copy(mid).lerp(edge, THREE.MathUtils.smoothstep(e, 0.5, 1));
      cols.set([c.r, c.g, c.b], i * 3);
    }
    floorGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshBasicMaterial({ vertexColors: true }));
  floor.position.set(0, 0.002, -0.5);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.8), new THREE.MeshLambertMaterial({ map: matTexture() }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0.2, 0.006, -1.6);
  group.add(room, floor, rug);

  // Terracotta dado and Greek-key friezes around the walls.
  const dadoMat = new THREE.MeshBasicMaterial({ color: '#8e3a28' });
  const keyTex = meanderTexture();
  const walls = [
    // [centre x, centre z, rotY, length]
    [0, -3.49, 0, 6],
    [0, 2.49, Math.PI, 6],
    [-2.99, -0.5, Math.PI / 2, 6],
    [2.99, -0.5, -Math.PI / 2, 6],
  ];
  for (const [x, z, ry, len] of walls) {
    const dado = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.95), dadoMat);
    dado.position.set(x, 0.475, z);
    dado.rotation.y = ry;
    for (const y of [1.0, 2.95]) {
      const t = keyTex.clone();
      t.repeat.set(len / 0.5, 1);
      t.needsUpdate = true;
      const band = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.13), new THREE.MeshBasicMaterial({ map: t }));
      band.position.set(x, y, z);
      band.rotation.y = ry;
      band.translateZ(0.004);
      band.raycast = () => {};
      group.add(band);
    }
    dado.raycast = () => {};
    group.add(dado);
  }

  // Window: overexposed view, soft frame, a halo that blooms over the wall.
  const windowMat = new THREE.MeshBasicMaterial({ map: art['troy-view'] || windowTexture(), color: art['troy-view'] ? '#fff8ec' : '#ffffff', toneMapped: false, fog: false });
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W, WIN_H), windowMat);
  pane.position.copy(WINDOW_POS);
  group.add(pane);
  const frameMat = softMaterial({ color: '#f6f0e6', rim: '#fff6e8', rimStrength: 0.4 });
  for (const [w, h, x, y] of [
    [1.34, 0.07, 0, 0.73],
    [1.42, 0.09, 0, -0.75],
    [0.07, 1.52, 0.635, 0],
    [0.07, 1.52, -0.635, 0],
  ]) {
    const bar = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.06, 2, 0.012), frameMat);
    bar.position.set(WINDOW_POS.x + x, WINDOW_POS.y + y, WINDOW_POS.z + 0.03);
    group.add(bar);
  }
  const stone = softMaterial({ color: '#e9dcc4', rim: '#fff4e0', rimStrength: 0.35, hatch: 50 });
  for (const dx of [-0.92, 0.92]) {
    const col = doricColumn(stone, 3.0);
    col.position.set(WINDOW_POS.x + dx, 0, WINDOW_POS.z + 0.2);
    group.add(col);
  }
  const lintel = new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.22, 0.5, 2, 0.02), stone);
  lintel.position.set(WINDOW_POS.x, 3.08, WINDOW_POS.z + 0.2);
  group.add(lintel);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color: '#fff2d8', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  );
  halo.position.copy(WINDOW_POS).add(new THREE.Vector3(0, 0, 0.15));
  halo.scale.setScalar(3.4);
  halo.raycast = () => {};
  group.add(halo);

  // Sheer curtains: they glow where the light passes through, and breathe.
  const curtainMat = new THREE.MeshLambertMaterial({
    color: '#fbf3ea',
    emissive: '#ffe6c4',
    emissiveIntensity: 0.55,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const curtains = [];
  for (const dx of [-0.88, 0.88]) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 2.0, 24, 8), curtainMat);
    const pos = c.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 22) * 0.035);
    c.geometry.computeVertexNormals();
    c.position.set(WINDOW_POS.x + dx, WINDOW_POS.y - 0.12, WINDOW_POS.z + 0.1);
    c.userData.phase = dx;
    group.add(c);
    curtains.push(c);
  }

  // Where the light lands: the window's shape on the floor, through the air as shafts.
  const toFloor = (p) => p.clone().addScaledVector(SUN_DIR, -p.y / SUN_DIR.y);
  const hw = WIN_W / 2 - 0.04;
  const hh = WIN_H / 2 - 0.04;
  const winCorners = [
    new THREE.Vector3(-hw, -hh, 0),
    new THREE.Vector3(hw, -hh, 0),
    new THREE.Vector3(hw, hh, 0),
    new THREE.Vector3(-hw, hh, 0),
  ].map((v) => v.add(WINDOW_POS).add(new THREE.Vector3(0, 0, 0.06)));
  const floorCorners = winCorners.map(toFloor);
  const poolGeo = new THREE.BufferGeometry().setFromPoints([floorCorners[0], floorCorners[1], floorCorners[2], floorCorners[0], floorCorners[2], floorCorners[3]]);
  poolGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0], 2));
  const poolMat = new THREE.MeshBasicMaterial({
    map: lightPoolTexture(),
    color: '#ffdcae',
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: THREE.DoubleSide,
  });
  const pool = new THREE.Mesh(poolGeo, poolMat);
  pool.position.y = 0.01;
  pool.raycast = () => {};
  group.add(pool);

  const shaftMat = lightShaftMaterial('#ffe7c2', 0.3);
  const shaft = bindShaft(new THREE.Mesh(shaftGeometry(winCorners, floorCorners), shaftMat));
  group.add(shaft);

  // Motes drifting inside the light.
  const MOTES = 260;
  const motePos = new Float32Array(MOTES * 3);
  const moteSeed = [];
  for (let i = 0; i < MOTES; i++) {
    const s = { u: Math.random(), w: Math.random(), along: Math.random(), sp: 0.004 + Math.random() * 0.01, ph: Math.random() * 10 };
    moteSeed.push(s);
  }
  const motesGeo = new THREE.BufferGeometry();
  motesGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(
    motesGeo,
    new THREE.PointsMaterial({ color: '#fff4dc', size: 0.018, map: glowTexture(), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  );
  motes.raycast = () => {};
  motes.frustumCulled = false;
  group.add(motes);
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const placeMotes = (t) => {
    for (let i = 0; i < MOTES; i++) {
      const s = moteSeed[i];
      const along = (s.along + t * s.sp) % 1;
      const u = s.u + Math.sin(t * 0.3 + s.ph) * 0.04;
      const w = s.w + Math.cos(t * 0.23 + s.ph) * 0.04;
      // bilinear point on the window rect, then pushed along the light
      _a.lerpVectors(winCorners[0], winCorners[1], u);
      _b.lerpVectors(winCorners[3], winCorners[2], u);
      _a.lerp(_b, w);
      _b.copy(_a).addScaledVector(SUN_DIR, (-_a.y / SUN_DIR.y) * along);
      motePos.set([_b.x, _b.y, _b.z], i * 3);
    }
    motesGeo.attributes.position.needsUpdate = true;
  };

  // Light beam from the window to the crib (invisible until the vision trigger).
  const beamMat = lightShaftMaterial('#fff1cf', 0);
  const face = new THREE.Vector3(0, EYE, 0);
  const beamLen = WINDOW_POS.distanceTo(face);
  const beamGeo = new THREE.CylinderGeometry(0.25, 0.7, beamLen, 32, 1, true);
  {
    // A round beam: the facing term already softens its silhouette, so u stays mid-shaft; v runs window → face.
    const uv = beamGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 0.5);
  }
  beamGeo.rotateX(Math.PI / 2); // axis along Z
  const beam = bindShaft(new THREE.Mesh(beamGeo, beamMat));
  beam.position.lerpVectors(WINDOW_POS, face, 0.5);
  beam.lookAt(face);
  group.add(beam);

  // Door on the right wall (the Beethoven sound comes from behind it).
  const doorMat = softMaterial({ color: '#dcc6ad', rim: '#fff1de', rimStrength: 0.3 });
  const door = new THREE.Mesh(new RoundedBoxGeometry(0.06, 2.1, 0.95, 2, 0.02), doorMat);
  door.position.set(DOOR_POS.x, 1.05, DOOR_POS.z);
  for (const [y, h] of [[1.55, 0.7], [0.55, 0.7]]) {
    const panel = new THREE.Mesh(new RoundedBoxGeometry(0.02, h, 0.7, 2, 0.008), doorMat);
    panel.position.set(DOOR_POS.x - 0.035, y, DOOR_POS.z);
    group.add(panel);
  }
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), softMaterial({ color: '#c9a66a', rim: '#fff0c8', rimStrength: 0.6 }));
  knob.position.set(DOOR_POS.x - 0.06, 1.0, DOOR_POS.z + 0.35);
  // thin line of light under the door
  const underDoor = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.012),
    new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.7, toneMapped: false }),
  );
  underDoor.rotation.y = -Math.PI / 2;
  underDoor.position.set(DOOR_POS.x - 0.04, 0.008, DOOR_POS.z);
  group.add(door, knob, underDoor);

  // A wooden chest, a bronze lampstand with an oil flame, an Attic amphora on a plinth.
  const woodMat = softMaterial({ color: '#7a4f30', rim: '#ffd9a8', rimStrength: 0.3, hatch: 40 });
  const bronze = softMaterial({ color: '#a8823f', rim: '#fff0c0', rimStrength: 0.6, hatch: 50 });
  const dresser = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.62, 0.55, 3, 0.04), woodMat);
  dresser.position.set(1.9, 0.31, -3.1);
  for (const x of [1.4, 2.4]) {
    const band = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.64, 0.57, 2, 0.01), bronze);
    band.position.set(x, 0.31, -3.1);
    group.add(band);
  }
  const lampBase = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.4, 12), bronze);
  pole.position.y = 0.7;
  const foot = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.12, 3), bronze);
  foot.position.y = 0.06;
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), bronze);
  bowl.position.y = 1.42;
  lampBase.add(pole, foot, bowl);
  lampBase.position.set(2.55, 0, -2.75);
  const shadeMat = new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false, side: THREE.DoubleSide });
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.11, 12), shadeMat); // the flame
  shade.position.set(2.55, 1.5, -2.75);
  if (art.amphora) {
    const plinth = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.3, 0.5, 2, 0.02), stone);
    plinth.position.set(-2.35, 0.15, -2.9);
    const vase = cutout(art.amphora, 1.05);
    vase.position.set(-2.35, 0.3, -2.62);
    vase.lookAt(0, 0.8, 0);
    group.add(plinth, vase);
  }
  const gilt = softMaterial({ color: '#c49a45', rim: '#fff2c4', rimPower: 1.4, rimStrength: 0.7, hatch: 0 });
  if (art.hayez) {
    const hz = framedPainting(art.hayez, 1.45, gilt);
    hz.position.set(-2.97, 1.95, -1.3);
    hz.rotation.y = Math.PI / 2;
    group.add(hz);
  }
  if (art.fright) {
    const fr = framedPainting(art.fright, 1.0, gilt);
    fr.position.set(2.97, 1.95, 0.0);
    fr.rotation.y = -Math.PI / 2;
    group.add(fr);
  }
  const lampGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffc98a', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  );
  lampGlow.position.copy(shade.position);
  lampGlow.scale.setScalar(0.7);
  lampGlow.raycast = () => {};
  group.add(dresser, lampBase, shade, lampGlow);

  // Crib: everything rounded, painted white, catching the window light.
  const crib = new THREE.Group();
  const white = softMaterial({ color: '#d2b48a', rim: '#fff0d8', rimPower: 2.0, rimStrength: 0.45 }); // olive wood
  const mattress = new THREE.Mesh(new RoundedBoxGeometry(0.74, 0.12, 1.34, 3, 0.04), softMaterial({ color: '#fbf5ec', emissive: '#3a2c20', rimStrength: 0.2 }));
  mattress.position.set(0, 0.42, 0.05);
  const blanket = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.05, 0.62, 3, 0.022), softMaterial({ color: '#cddbe7', rim: '#fff4e6', rimStrength: 0.35 }));
  blanket.position.set(0, 0.5, -0.25);
  crib.add(mattress, blanket);
  const slatPositions = [];
  for (let x = -0.32; x <= 0.321; x += 0.08) slatPositions.push([x, -0.62], [x, 0.72]);
  for (let z = -0.54; z <= 0.65; z += 0.08) slatPositions.push([-0.37, z], [0.37, z]);
  const slats = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.014, 0.014, 0.62, 14), white, slatPositions.length);
  const m = new THREE.Matrix4();
  slatPositions.forEach(([x, z], i) => slats.setMatrixAt(i, m.makeTranslation(x, 0.79, z)));
  crib.add(slats);
  for (const [len, x, z, alongZ] of [
    [0.8, 0, -0.62, false],
    [0.8, 0, 0.72, false],
    [1.38, -0.37, 0.05, true],
    [1.38, 0.37, 0.05, true],
  ]) {
    const rail = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, len - 0.05, 6, 16), white);
    rail.rotation.set(alongZ ? Math.PI / 2 : 0, 0, alongZ ? 0 : Math.PI / 2);
    rail.position.set(x, 1.1, z);
    crib.add(rail);
  }
  for (const [x, z] of [
    [-0.37, -0.62],
    [0.37, -0.62],
    [-0.37, 0.72],
    [0.37, 0.72],
  ]) {
    const post = new THREE.Mesh(new RoundedBoxGeometry(0.06, 1.1, 0.06, 2, 0.02), white);
    post.position.set(x, 0.55, z);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.038, 16, 12), white);
    finial.position.set(x, 1.13, z);
    crib.add(post, finial);
  }
  group.add(crib);

  // Mobile: soft moon, stars and clouds in pastels.
  const mobile = new THREE.Group();
  mobile.position.set(0, 1.75, -0.2);
  const mobileColors = ['#c8643c', '#3d5fa8', '#d9b25a', '#e9dcc4', '#6f7d48'];
  const starGeo = new THREE.ExtrudeGeometry(starShape(0.06, 0.028), { depth: 0.014, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3 });
  starGeo.center();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const mat = softMaterial({ color: mobileColors[i], rim: '#fff6e6', rimStrength: 0.55 });
    let toy;
    if (i % 2) toy = new THREE.Mesh(starGeo, mat);
    else {
      toy = new THREE.Group(); // a little cloud
      for (const [x, y, r] of [[-0.035, 0, 0.032], [0, 0.015, 0.042], [0.038, 0, 0.03]]) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat);
        puff.position.set(x, y, 0);
        toy.add(puff);
      }
    }
    toy.position.set(Math.cos(a) * 0.28, -0.25 - (i % 2) * 0.08, Math.sin(a) * 0.28);
    toy.userData.phase = a;
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.25, 4), new THREE.MeshBasicMaterial({ color: '#fffaf2' }));
    string.position.set(toy.position.x, -0.12, toy.position.z);
    mobile.add(toy, string);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.009, 8, 48), softMaterial({ color: '#e8dccb', rimStrength: 0.4 }));
  ring.rotation.x = Math.PI / 2;
  mobile.add(ring);
  group.add(mobile);

  // Lights: the window is the key light; everything else is bounce.
  const hemi = new THREE.HemisphereLight('#fff4e6', '#c9a98a', 1.8);
  const sun = new THREE.DirectionalLight(PAL.warm, 1.1);
  sun.position.copy(WINDOW_POS).addScaledVector(SUN_DIR, -2);
  sun.target.position.copy(WINDOW_POS).addScaledVector(SUN_DIR, 3);
  const fill = new THREE.DirectionalLight('#e3ebf3', 0.25); // cool bounce from the room behind you
  fill.position.set(1, 1.5, 3);
  const lamp = new THREE.PointLight('#ffc98a', 3, 7, 1.5);
  lamp.position.set(2.5, 1.55, -2.6);
  group.add(hemi, sun, sun.target, fill, lamp);

  // People.
  const mother = art['andromache-face'] ? new PaintedParent(art['andromache-face'], { height: 1.25, portrait: true }) : new Adult({ color: '#b98b8b', hair: '#5a3d2e' });
  mother.position.set(0.7, 0, -2.2);
  mother.rotation.y = -0.3;
  const father = art.hector ? new PaintedParent(art.hector, { height: 2.45 }) : new Adult({ color: '#7d8a99', hair: '#2f2a26', height: 2.15 });
  father.position.set(art.hector ? -1.15 : -1.5, 0, art.hector ? -2.0 : -2.4);
  father.rotation.y = 0.55;
  // Hector's helmet, laid on the ground once the child has cried at it (Iliad VI)
  const helmet = buildHelmet();
  helmet.position.set(-0.85, 0.01, -1.55);
  helmet.lookAt(0, 0.01, 0);
  helmet.rotateZ(0.13); // set down, not displayed
  helmet.scale.setScalar(1.3);
  helmet.visible = false;
  group.add(helmet);
  group.add(mother, father);
  const motherHand = new GiantHand({ side: -1, sleeve: '#b98b8b' });
  const fatherHand = new GiantHand({ side: 1, sleeve: '#7d8a99', skin: '#dcb394' });
  group.add(motherHand, fatherHand);

  // Window glint (becomes the sun).
  const glint = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color: '#fff3d0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  );
  glint.position.copy(WINDOW_POS).add(new THREE.Vector3(0, 0, 0.3));
  glint.scale.setScalar(0.8);
  group.add(glint);

  return {
    group,
    windowMat,
    beamMat,
    shaftMat,
    poolMat,
    halo,
    sun,
    hemi,
    lamp,
    shadeMat,
    mobile,
    mother,
    father,
    helmet,
    motherHand,
    fatherHand,
    glint,
    update(t, dt) {
      mobile.rotation.y = t * 0.25;
      for (const toy of mobile.children) if (toy.userData.phase !== undefined) toy.rotation.y = Math.sin(t * 0.8 + toy.userData.phase) * 0.6;
      for (const c of curtains) c.rotation.y = Math.sin(t * 0.4 + c.userData.phase) * 0.05;
      halo.material.opacity = 0.5 + Math.sin(t * 0.5) * 0.05;
      placeMotes(t);
      mother.update(t);
      father.update(t);
      motherHand.update(t, dt);
      fatherHand.update(t, dt);
    },
  };
}

// Palm up, fingers pointing at the viewer (+Z), tilted up a little: local Y→+Z, local Z→+Y.
const PALM_UP = new THREE.Euler().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)),
);
PALM_UP.x -= 0.25;

// Hand poses (world space; viewer's eye at (0, EYE, 0)).
export const HAND_POSES = {
  hidden: (side) => [new THREE.Vector3(0.5 * side, 2.7, -1.0), [Math.PI * 0.55, 0, 0]],
  reach: (side) => [new THREE.Vector3(0.14 * side, 1.12, -0.62), [Math.PI * 0.62, 0.15 * side, 0]],
  pat: (side) => [new THREE.Vector3(0.06 * side, 1.12, -0.38), [Math.PI * 0.72, 0, 0]],
  offer: (side) => [new THREE.Vector3(0.24 * side, 0.8, -0.6), PALM_UP], // palm up, fingers toward you
};
