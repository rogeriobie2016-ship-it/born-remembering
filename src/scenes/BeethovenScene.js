import * as THREE from 'three';
import { BaseScene } from '../core/SceneManager.js';
import { Dust } from '../core/props.js';
import { glowTexture, ease, lerp, clamp } from '../core/util.js';
import { softMaterial, inkOutlineAll, bakeGradient, paintedTexture } from '../core/look.js';
import { loadArt, cutout, cartouche, ScrollWriter } from '../core/collage.js';
import { loadMarble, marbleMaterial } from '../core/marble.js';
import { thump } from '../core/synth.js';
import { GiantHand, meanderTexture, framedPainting } from './nursery.js';
import { nightTexture } from './EndHoldScene.js';

// Scene 6 — Beethoven, deaf: Orpheus, a modern re-reading. Vienna, a candlelit study;
// Hausleithner's "Beethoven's Vision" (1882) hangs dim on the wall. You play and hear
// nothing — but the sand on the lid sees the sound: it gathers into Chladni figures
// (Chladni, 1787, Beethoven's contemporary). Then, all at once, you hear it: the sand
// leaps up as gold, the lid opens, and the piano's strings rise into Orpheus' lyre.
// The Muses step out of the painting.

const EYE = 1.2;
const KEY_Z = -0.44; // centre of the keys (depth)
const KEY_TOP = 0.8;
const WHITE = 30;
const WHITE_W = 0.03;
const BLACK_AFTER = [0, 1, 3, 4, 5]; // a black key follows these white keys in each octave
const CASE_TOP = 0.9; // top of the case; the lid sits on it
const LID_T = 0.02;
const SAND_Y = CASE_TOP + LID_T + 0.003;
const SAND = 3500;
const SAND_X = [-0.5, 0.45];
const SAND_D = [0.63, 1.3]; // depth (-z) on the lid
// Chladni modes (n, m, sign) for f = cos(nπu)cos(mπv) + s·cos(mπu)cos(nπv)
const MODES = [[1, 3, -1], [2, 3, 1], [1, 4, -1], [3, 4, 1], [2, 5, -1], [3, 5, -1], [1, 5, 1], [4, 5, -1]];
const STRINGS = 24;
const SEG = 10;
const STRING_Y = CASE_TOP + 0.006; // just over the soundboard, under the lid
const LYRE_Z = -1.55;
const LYRE_Y = [1.24, 2.0];
const PAINT_POS = new THREE.Vector3(-0.6, 2.0, -3.93);
const PAINT_W = 1.9;
const MUSES_TO = new THREE.Vector3(-1.2, 2.15, -3.0);
const POLYHYMNIA = { x: 2.05, z: -3.05, base: 0.34, turn: -0.5 };
const LID_OPEN = 0.22; // a crack only: wide open, the lid would hide the lyre

const brass = () => softMaterial({ color: '#b08a3e', rim: '#ffe2a0', rimStrength: 0.55, hatch: 0, umber: '#5a3a14' });

function manuscriptTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 340;
  const g = c.getContext('2d');
  g.fillStyle = '#e8d9b8';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(60,40,25,0.75)';
  g.fillStyle = 'rgba(50,32,20,0.85)';
  g.lineWidth = 1;
  for (let s = 0; s < 7; s++) {
    const y0 = 24 + s * 44;
    for (let l = 0; l < 5; l++) {
      g.beginPath();
      g.moveTo(14, y0 + l * 5);
      g.lineTo(242, y0 + l * 5 + (Math.random() - 0.5) * 2);
      g.stroke();
    }
    for (let x = 22; x < 236; x += 9 + Math.random() * 14) {
      const y = y0 + Math.floor(Math.random() * 9) * 2.5 - 2;
      g.beginPath();
      g.ellipse(x, y, 3.2, 2.2, -0.4, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(x + 3, y);
      g.lineTo(x + 3, y - 14);
      g.stroke();
      if (Math.random() < 0.12) {
        // furious crossing-out
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(x - 6, y + 6);
        g.lineTo(x + 14, y - 10);
        g.stroke();
        g.lineWidth = 1;
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Polished mahogany for the lid: dark ground, long grain along the depth. UVs are metres (extrude caps). */
function woodTexture() {
  const tex = paintedTexture(256, 512, (c, w, h) => {
    c.fillStyle = '#3a1a0e';
    c.fillRect(0, 0, w, h);
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 90; i++) {
      const x = rnd() * w;
      const light = rnd() < 0.5;
      c.strokeStyle = light ? `rgba(120,58,28,${0.15 + rnd() * 0.25})` : `rgba(18,6,2,${0.2 + rnd() * 0.3})`;
      c.lineWidth = 0.6 + rnd() * 2.2;
      c.beginPath();
      c.moveTo(x, 0);
      for (let y = 0; y <= h; y += 32) c.lineTo(x + Math.sin(y * 0.02 + i) * (2 + rnd() * 3), y);
      c.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.2, 0.8);
  return tex;
}

/** Outline of a grand piano seen from above, in (x, depth) with depth = -z. */
function grandShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.7, 0.55);
  s.lineTo(0.7, 0.55);
  s.lineTo(0.7, 1.0);
  s.bezierCurveTo(0.7, 1.55, 0.05, 1.6, -0.05, 2.1);
  s.quadraticCurveTo(-0.15, 2.35, -0.45, 2.35);
  s.lineTo(-0.7, 2.35);
  s.lineTo(-0.7, 0.55);
  return s;
}

/** Turned profile (radius, height) → lathe. */
const lathe = (pts, mat, seg = 20) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);

export class BeethovenScene extends BaseScene {
  skipTo = 'medusa';

  async enter() {
    const { ctx } = this;
    ctx.rig.position.set(0, EYE, 0);
    ctx.look.reset(0, -0.3); // flat screens: start looking down at the keys and the sand
    this.bg = new THREE.Color('#0b0710');
    ctx.scene.background = this.bg;
    ctx.scene.fog = new THREE.Fog('#0b0710', 4, 12);
    ctx.grain.set({ grain: 0.06, vignette: 0.5, color: '#0b0710' });
    ctx.haze.set({ amount: 0.15, color: '#05030a', saturate: 0.8, blur: 0 });
    ctx.audio.stopMusic(1);
    ctx.audio.define('thump', thump);

    this.energy = 0;
    this.presses = 0;
    this.heard = false;
    this.flare = 0;
    this.dip = [0, 0];
    this.mode = MODES[0];
    this.lyreK = 0;

    const [art, musesArt, polyhymnia] = await Promise.all([loadArt('beethoven', ['vision']), loadArt('orpheus', ['muses']), loadMarble('art/scans/polyhymnia.bin'), ctx.audio.preload(['ninth', 'thump'])]);
    this.art = { ...art, ...musesArt };
    // Polyhymnia, Muse of the hymn (a real scan): in the dark of the corner until the music comes back and the light reaches her.
    if (polyhymnia) {
      const muse = new THREE.Mesh(polyhymnia, marbleMaterial({ color: '#efe3d2', through: '#ffb46a' }));
      muse.position.set(POLYHYMNIA.x, POLYHYMNIA.base, POLYHYMNIA.z);
      muse.rotation.y = POLYHYMNIA.turn;
      muse.raycast = () => {};
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, POLYHYMNIA.base, 24), softMaterial({ color: '#5a4436', rim: '#ffd9a0', rimStrength: 0.2, hatch: 40 }));
      plinth.position.set(POLYHYMNIA.x, POLYHYMNIA.base / 2, POLYHYMNIA.z);
      plinth.raycast = () => {};
      this.add(muse, plinth);
    }

    const sheetTex = manuscriptTexture();
    this._buildRoom(sheetTex);
    this._buildPiano(sheetTex);
    this._buildCandles();
    this._buildHands();
    this._buildSand();
    this._buildLyre();
    this._buildVision();


    this.scroll = this.add(cartouche(1.7, 0.75));
    this.scroll.position.set(1.15, 1.85, -2.4);
    this.scroll.lookAt(0, EYE, 0);
    this.writer = new ScrollWriter(this, this.scroll, { size: 0.07, wrapAt: 30 });
  }

  _buildRoom(sheetTex) {
    // Shell with baked candlelight: a warm pool round the piano, claret walls, violet dark above.
    const shellGeo = bakeGradient(new THREE.BoxGeometry(5, 3.5, 5.5, 20, 14, 22), {
      low: '#3a1e1a',
      high: '#150c18',
      from: -1.75,
      to: 1.4,
      lift: { at: new THREE.Vector3(0, -0.8, 0.5), radius: 3.2, color: '#b0703e', strength: 0.8 },
    });
    this.shellMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, color: '#bdbdbd' });
    const shell = new THREE.Mesh(shellGeo, this.shellMat);
    shell.position.set(0, 1.75, -1.2);
    shell.raycast = () => {};
    this.add(shell);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(5, 5.5), softMaterial({ color: '#5a3c2a', rim: '#ffcf9a', rimStrength: 0.15, hatch: 40 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.003, -1.2);
    floor.raycast = () => {};
    this.add(floor);

    // Dado and a Greek key on the back wall: the myths are in the room too.
    const dado = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.9), new THREE.MeshBasicMaterial({ color: '#2e1412' }));
    dado.position.set(0, 0.45, -3.94);
    const key = meanderTexture('#4a1c14', '#9a7a58');
    key.repeat.set(10, 1);
    const band = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.12), new THREE.MeshBasicMaterial({ map: key, color: '#7a5a44' }));
    band.position.set(0, 0.96, -3.935);
    this.add(dado, band);

    // Window onto the Viennese night, on the left wall.
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.25), new THREE.MeshBasicMaterial({ map: nightTexture(), toneMapped: false, fog: false }));
    pane.position.set(-2.47, 1.8, -1.6);
    pane.rotation.y = Math.PI / 2;
    const frameMat = softMaterial({ color: '#3a2418', rim: '#9fb4ff', rimStrength: 0.3, hatch: 0 });
    const win = new THREE.Group();
    for (const dz of [-0.47, 0, 0.47]) {
      const upright = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.35, 0.05), frameMat);
      upright.position.set(-2.45, 1.8, -1.6 + dz);
      win.add(upright);
    }
    for (const y of [1.15, 1.8, 2.45]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 1.0), frameMat);
      rail.position.set(-2.45, y, -1.6);
      win.add(rail);
    }
    this.add(pane, win);

    // Manuscripts scattered on the floor.
    const sheetMat = new THREE.MeshLambertMaterial({ map: sheetTex, side: THREE.DoubleSide });
    for (const [x, z, r] of [[-0.7, -0.2, 0.4], [-1.0, -0.7, -0.6], [0.9, -0.3, 1.1], [1.3, -1.1, 0.2], [-1.4, -1.9, 0.9]]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.29), sheetMat);
      s.rotation.set(-Math.PI / 2, 0, r);
      s.position.set(x, 0.006, z);
      this.add(s);
    }
    this.sheetMat = sheetMat;

    this.hemi = new THREE.HemisphereLight('#5a4a70', '#1a0e0a', 0.7);
    const moonLight = new THREE.DirectionalLight('#9fb4ff', 0.45);
    moonLight.position.set(-2.4, 2.4, -1.6);
    moonLight.target.position.set(0, 0.8, -1);
    // The vision's light exists from the start (intensity 0) so nothing recompiles at the climax.
    this.visionLight = new THREE.PointLight('#ffd9a0', 0, 7, 1.4);
    this.visionLight.position.set(-0.8, 2.2, -2.6);
    this.lyreLight = new THREE.PointLight('#ffcf80', 0, 4, 1.6);
    this.lyreLight.position.set(0, 1.6, -1.3);
    this.root.add(this.hemi, moonLight, moonLight.target, this.visionLight, this.lyreLight);
  }

  _buildPiano(sheetTex) {
    const p = new THREE.Group();
    this.caseMat = softMaterial({ color: '#3a1a0e', rim: '#ffcf9a', rimStrength: 0.25, hatch: 90, umber: '#1e0c06' });
    this.caseMat.emissive = new THREE.Color('#000000');

    // Case: the grand's outline, extruded (shape y = depth → -z after rotateX).
    const caseH = 0.26;
    const caseGeo = new THREE.ExtrudeGeometry(grandShape(), { depth: caseH, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 28 });
    caseGeo.rotateX(-Math.PI / 2);
    // caps (group 0) are the spruce soundboard under the lid; sides (group 1) the mahogany case
    const board = softMaterial({ color: '#6a4826', rim: '#ffcf9a', rimStrength: 0.04, hatch: 0, umber: '#3a2210' });
    const body = new THREE.Mesh(caseGeo, [board, this.caseMat]);
    body.position.y = CASE_TOP - caseH;
    p.add(body);

    const keybed = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.1, 0.22), this.caseMat);
    keybed.position.set(0, 0.74, -0.44);
    p.add(keybed);
    for (const x of [-0.71, 0.71]) {
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.13, 0.22), this.caseMat);
      cheek.position.set(x, 0.835, -0.44);
      p.add(cheek);
    }
    // Turned legs.
    const legProfile = [[0, 0], [0.04, 0], [0.045, 0.04], [0.03, 0.08], [0.028, 0.3], [0.045, 0.42], [0.05, 0.5], [0.06, 0.58], [0.06, 0.64], [0, 0.64]];
    for (const [x, z] of [[-0.6, -0.68], [0.6, -0.68], [-0.5, -2.15]]) {
      const leg = lathe(legProfile, this.caseMat, 14);
      leg.position.set(x, 0, z);
      p.add(leg);
    }

    // Lid: the same outline, thin, hinged on the straight (bass) side.
    const lidGeo = new THREE.ExtrudeGeometry(grandShape(), { depth: LID_T, bevelEnabled: false, curveSegments: 28 });
    lidGeo.rotateX(-Math.PI / 2);
    lidGeo.translate(0.7, 0, 0);
    // its own material: seen at a grazing angle the rim light would wash the top out, so no rim, and a grain to read as wood
    this.lidMat = softMaterial({ map: woodTexture(), color: '#ffffff', rimStrength: 0.04, hatch: 0, umber: '#1e0c06' });
    this.lidMat.emissive = new THREE.Color('#000000');
    this.lid = new THREE.Mesh(lidGeo, this.lidMat);
    this.lid.position.set(-0.7, CASE_TOP, 0);
    p.add(this.lid);

    // A page of the score on the lid, out of the sand's way.
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.29), new THREE.MeshLambertMaterial({ map: sheetTex }));
    sheet.rotation.set(-Math.PI / 2, 0, 0.25);
    sheet.position.set(-0.38 + 0.7, LID_T + 0.002, -1.75); // lid space: x from the hinge
    sheet.raycast = () => {};
    this.lid.add(sheet);

    inkOutlineAll(p, 0.006);

    // His ear trumpet, brass, lying on the lid.
    const trumpet = lathe([[0.006, 0], [0.009, 0.02], [0.012, 0.12], [0.02, 0.22], [0.035, 0.28], [0.065, 0.31], [0.07, 0.315], [0.0, 0.315]], brass(), 24);
    trumpet.rotation.set(0, 0, Math.PI / 2);
    const tg = new THREE.Group();
    tg.add(trumpet);
    tg.rotation.y = -0.6;
    tg.position.set(0.48 + 0.7, LID_T + 0.035, -1.2); // lid space: x is measured from the hinge
    trumpet.raycast = () => {};
    this.lid.add(tg);

    // Keys.
    this.whiteKeys = new THREE.InstancedMesh(new THREE.BoxGeometry(WHITE_W * 0.92, 0.02, 0.15), softMaterial({ color: '#efe6d2', hatch: 0, rimStrength: 0.2 }), WHITE);
    this.whiteX = [];
    for (let i = 0; i < WHITE; i++) this.whiteX.push((i - (WHITE - 1) / 2) * WHITE_W);
    this.blackX = [];
    for (let i = 0; i < WHITE - 1; i++) if (BLACK_AFTER.includes(i % 7)) this.blackX.push(this.whiteX[i] + WHITE_W / 2);
    this.blackKeys = new THREE.InstancedMesh(new THREE.BoxGeometry(0.017, 0.02, 0.09), softMaterial({ color: '#1a1210', hatch: 0, rimStrength: 0.3 }), this.blackX.length);
    this.whiteDown = new Float32Array(WHITE);
    this.blackDown = new Float32Array(this.blackX.length);
    this._updateKeys();
    p.add(this.whiteKeys, this.blackKeys);

    // Strings: one LineSegments inside the case, displaced on the CPU. At the climax they rise into a lyre.
    const count = STRINGS * SEG * 2;
    this.stringPos = new Float32Array(count * 3);
    this.stringU = new Float32Array(count);
    this.stringIdx = new Uint8Array(count);
    let v = 0;
    for (let s = 0; s < STRINGS; s++) {
      for (let j = 0; j < SEG; j++) {
        for (const u of [j / SEG, (j + 1) / SEG]) {
          this.stringU[v] = u;
          this.stringIdx[v] = s;
          v++;
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.stringPos, 3));
    this.stringMat = new THREE.LineBasicMaterial({ color: '#ffe2a0', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.strings = new THREE.LineSegments(geo, this.stringMat);
    this.strings.frustumCulled = false;
    this.strings.visible = false;
    this.strings.raycast = () => {};
    p.add(this.strings);

    this.root.add(p);

    // The keyboard is also a target: gaze or point at it to play.
    const keysHit = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.28), new THREE.MeshBasicMaterial({ visible: false }));
    keysHit.position.set(0, KEY_TOP + 0.03, KEY_Z);
    this.root.add(keysHit);
    this.ctx.input.add(keysHit, { onSelect: () => this.press(), highlight: false });
  }

  _buildCandles() {
    const wax = softMaterial({ color: '#efe2c4', hatch: 0, rimStrength: 0.5, rim: '#ffd9a0' });
    const flameMat = new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffb35a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const haloMat = new THREE.SpriteMaterial({ map: glowTexture(), color: '#ff8a3a', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const stick = [[0, 0], [0.05, 0], [0.05, 0.008], [0.02, 0.02], [0.011, 0.04], [0.009, 0.12], [0.014, 0.135], [0.025, 0.145], [0.025, 0.155], [0, 0.155]];
    this.flames = [];
    const base = CASE_TOP; // on the key cheeks, clear of the lid when it opens
    for (const x of [-0.71, 0.71]) {
      const s = lathe(stick, brass(), 18);
      s.position.set(x, base, -0.44);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.1, 10), wax);
      c.position.set(x, base + 0.155 + 0.05, -0.44);
      const flame = new THREE.Sprite(flameMat);
      flame.position.set(x, base + 0.29, -0.44);
      const halo = new THREE.Sprite(haloMat);
      halo.position.copy(flame.position);
      for (const o of [s, c, flame, halo]) o.raycast = () => {};
      this.root.add(s, c, flame, halo);
      this.flames.push({ flame, halo, phase: Math.random() * 10 });
    }
    this.candleLight = new THREE.PointLight('#ff9a4a', 1.1, 4.5, 1.5);
    this.candleLight.position.set(0, 1.45, -0.6);
    this.root.add(this.candleLight);
  }

  _buildHands() {
    // Your own hands, palms down, fingers toward the keys.
    const base = new THREE.Euler(-Math.PI / 2 - 0.2, Math.PI, 0);
    this.handBase = [new THREE.Vector3(-0.17, 0.835, -0.4), new THREE.Vector3(0.17, 0.835, -0.4)];
    this.hands = [
      new GiantHand({ side: -1, scale: 1, sleeve: '#26232f', skin: '#e2b896' }),
      new GiantHand({ side: 1, scale: 1, sleeve: '#26232f', skin: '#e2b896' }),
    ];
    this.hands.forEach((h, i) => {
      h.place(this.handBase[i], [base.x, base.y, base.z]);
      h.visible = true;
      h.targetCurl = 0.45;
      this.add(h);
    });

    // The loved one's hand: comes in from the right and rests on yours.
    this.lovedHand = this.add(new GiantHand({ side: 1, scale: 1, sleeve: '#5a3550', skin: '#f0c9ab' }));
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.9).multiply(new THREE.Quaternion().setFromEuler(base));
    const rot = new THREE.Euler().setFromQuaternion(q);
    this.lovedPose = { pos: new THREE.Vector3(0.2, 0.865, -0.41), rot };
    this.lovedHand.place(new THREE.Vector3(0.8, 1.0, 0.2), [rot.x, rot.y, rot.z]);
    this.lovedHand.targetCurl = 0.3;

    this.dust = this.add(new Dust({ count: 200, radius: 4, opacity: 0.25, color: '#ffd9a0', size: 0.03, speed: 0.01 }));
  }

  /** Sand on the lid: the sound he cannot hear, made visible. Later, the gold motes. */
  _buildSand() {
    const pos = new Float32Array(SAND * 3);
    for (let i = 0; i < SAND; i++) {
      pos[i * 3] = lerp(SAND_X[0], SAND_X[1], Math.random());
      pos[i * 3 + 1] = SAND_Y;
      pos[i * 3 + 2] = -lerp(SAND_D[0], SAND_D[1], Math.random());
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sandMat = new THREE.PointsMaterial({ map: glowTexture(), color: '#ffe3a6', size: 0.008, transparent: true, opacity: 0.95, depthWrite: false });
    this.sand = new THREE.Points(geo, this.sandMat);
    this.sand.frustumCulled = false;
    this.sand.raycast = () => {};
    this.add(this.sand);
    this.vel = new Float32Array(SAND * 3);
    this.flying = false;
  }

  /** Orpheus' lyre, drawn in light: soundbox, curling arms, crossbar. The strings come from the piano. */
  _buildLyre() {
    this.lyreMat = new THREE.MeshBasicMaterial({ color: '#ffd98a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const g = new THREE.Group();
    const tube = (pts, closed = false, r = 0.011) => {
      const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, LYRE_Z)), closed);
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, r, 8, closed), this.lyreMat);
      m.raycast = () => {};
      g.add(m);
    };
    const box = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      box.push([Math.cos(a) * 0.24, 1.17 + Math.sin(a) * 0.1]);
    }
    tube(box, true, 0.013);
    for (const s of [-1, 1]) tube([[s * 0.16, 1.25], [s * 0.3, 1.42], [s * 0.34, 1.7], [s * 0.27, 1.93], [s * 0.31, 2.08], [s * 0.42, 2.13], [s * 0.45, 2.07]]);
    tube([[-0.34, LYRE_Y[1]], [0, LYRE_Y[1] + 0.015], [0.34, LYRE_Y[1]]], false, 0.014);
    this.lyreHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffcf80', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.lyreHalo.position.set(0, 1.62, LYRE_Z - 0.05);
    this.lyreHalo.scale.setScalar(1.8);
    g.add(this.lyreHalo);
    this.add(g);
  }

  /** Hausleithner's "Beethoven's Vision" on the wall; its Muses, ready to step out. */
  _buildVision() {
    const { vision, muses } = this.art;
    if (vision) {
      const gilt = softMaterial({ color: '#b08a4a', rim: '#ffe2a8', rimStrength: 0.5, hatch: 0 });
      const frame = framedPainting(vision, PAINT_W, gilt);
      // unlit, so it reads in the dark; dim until the music comes
      this.paintMat = new THREE.MeshBasicMaterial({ map: vision, color: '#5b4a3a' });
      frame.children[0].material = this.paintMat;
      frame.position.copy(PAINT_POS);
      this.add(frame);
    }
    if (muses) {
      this.musesFrom = PAINT_POS.clone().add(new THREE.Vector3(-0.37, -0.06, 0.03));
      this.musesScale0 = 0.88 / 2.0; // the painted Muses are ~0.88 m tall in a 1.9 m painting
      this.muses = cutout(muses, 2.0, { anchor: 'center' });
      this.muses.material.depthWrite = false;
      this.muses.material.opacity = 0;
      this.muses.visible = false;
      this.muses.position.copy(this.musesFrom);
      this.muses.scale.setScalar(this.musesScale0);
      this.add(this.muses);
    }
  }

  _updateKeys() {
    const m = new THREE.Matrix4();
    for (let i = 0; i < WHITE; i++) this.whiteKeys.setMatrixAt(i, m.makeTranslation(this.whiteX[i], KEY_TOP - 0.01 - this.whiteDown[i] * 0.009, KEY_Z));
    for (let i = 0; i < this.blackX.length; i++) this.blackKeys.setMatrixAt(i, m.makeTranslation(this.blackX[i], KEY_TOP + 0.005 - this.blackDown[i] * 0.008, KEY_Z - 0.03));
    this.whiteKeys.instanceMatrix.needsUpdate = true;
    this.blackKeys.instanceMatrix.needsUpdate = true;
  }

  onSelectNothing() {
    this.press();
  }

  /** Play a chord: keys go down, the wood shakes, the sand dances — but silence (until he hears). */
  press() {
    if (!this.alive) return;
    this.presses++;
    this.energy += this.heard ? 0.6 : 1;
    const pick = (from, to, n) => {
      for (let k = 0; k < n; k++) this.whiteDown[from + Math.floor(Math.random() * (to - from))] = 1;
    };
    pick(6, 13, 2 + Math.floor(Math.random() * 2));
    pick(16, 24, 2 + Math.floor(Math.random() * 2));
    for (let k = 0; k < 2; k++) this.blackDown[Math.floor(Math.random() * this.blackX.length)] = 1;
    this.dip[0] = 0.8 + Math.random() * 0.4;
    this.dip[1] = 0.8 + Math.random() * 0.4;
    // every third chord is a new note: time for the sand to draw each figure
    this.mode = MODES[Math.floor((this.presses - 1) / 3) % MODES.length];
    if (this.heard) this.kick(0.25);
    else this.sound('thump', { volume: 0.06 }); // felt more than heard
  }

  /** Throw the sand up as gold (power ~1.5), or stir the drifting motes (small power). */
  kick(power) {
    const v = this.vel;
    for (let i = 0; i < SAND; i++) {
      const th = Math.random() * Math.PI * 2;
      const up = power > 1 ? 0.3 + Math.random() * 0.8 : (Math.random() - 0.4) * 0.6; // rise ~0.3–1.4 m: they hang round the lyre
      const sp = power * (0.08 + Math.random() * 0.3);
      v[i * 3] += Math.cos(th) * sp;
      v[i * 3 + 1] += up * power;
      v[i * 3 + 2] += Math.sin(th) * sp;
    }
    this.flying = true;
  }

  /** The flood: his own music, for the first time, far too loud. */
  async breakthrough() {
    const { audio, haze, grain, content } = this.ctx;
    this.heard = true;
    audio.playMusic('ninth', { volume: 1.0, fade: 0.3 });
    haze.set({ color: '#fff6e6', saturate: 1.3, amount: 1 });
    this.tween(2.8, (k) => haze.set({ amount: lerp(1, 0.12, k), color: '#fff1d6' }), ease.out);
    this.energy = 3;
    this.kick(1.5);
    this.sandMat.blending = THREE.AdditiveBlending;
    this.sandMat.needsUpdate = true;
    this.tween(3, (k) => (this.sandMat.size = lerp(0.008, 0.016, k)));

    // The lid opens; the strings rise and become a lyre.
    this.wait(0.3).then(() => this.tween(2.5, (k) => (this.lid.rotation.z = LID_OPEN * k), ease.inOut));
    this.wait(1.0).then(() => {
      this.strings.visible = true;
      this.tween(5, (k) => (this.lyreK = k));
    });
    this.wait(2.5).then(() =>
      this.tween(4, (k) => {
        this.lyreMat.opacity = 0.9 * k;
        this.lyreHalo.material.opacity = 0.35 * k;
        this.lyreLight.intensity = 1.6 * k;
      }),
    );

    // The painting fills with light; its Muses step out into the room.
    if (this.paintMat) {
      const p0 = this.paintMat.color.clone();
      const p1 = new THREE.Color('#ffffff');
      this.tween(4, (k) => this.paintMat.color.lerpColors(p0, p1, k), ease.out);
    }
    if (this.muses) {
      this.muses.visible = true;
      this.wait(1.5).then(() =>
        this.tween(
          6,
          (k) => {
            this.muses.material.opacity = Math.min(1, k * 2);
            this.muses.position.lerpVectors(this.musesFrom, MUSES_TO, k);
            this.muses.scale.setScalar(lerp(this.musesScale0, 1, k));
          },
          ease.inOut,
        ),
      );
    }

    const bg0 = this.bg.clone();
    const bg1 = new THREE.Color('#2a1812');
    const hemi0 = this.hemi.color.clone();
    const hemi1 = new THREE.Color('#ffcf9a');
    const shell0 = this.shellMat.color.clone();
    const shell1 = new THREE.Color('#ffe8cc');
    this.tween(
      7,
      (k) => {
        this.bg.lerpColors(bg0, bg1, k);
        this.ctx.scene.fog.color.copy(this.bg);
        this.hemi.color.lerpColors(hemi0, hemi1, k);
        this.hemi.intensity = lerp(0.7, 1.1, k);
        this.shellMat.color.lerpColors(shell0, shell1, k);
        this.visionLight.intensity = 2.2 * k;
        grain.set({ vignette: lerp(0.5, 0.32, k) });
      },
      ease.out,
    );
    this.tween(3, (k) => (this.flare = k), ease.out);
    await this.writer.say(content.BEETHOVEN.hear, { hold: 2 });
  }

  async start() {
    const B = this.ctx.content.BEETHOVEN;
    await this.wait(1.2);
    await this.writer.say(B.open, { hold: 2 });

    this.say(B.hint, { narrate: false, hold: 3 });
    if (!(await this.until(() => this.presses >= 1, 14))) {
      // Nobody played: the hands play by themselves so the beat still reads.
      for (let i = 0; i < 3; i++) {
        this.press();
        await this.wait(0.7);
      }
    }
    await this.until(() => this.presses >= 4, 10);
    await this.writer.say(B.feel, { hold: 1.5 });
    await this.until(() => this.presses >= 7, 6);

    // A breath of perfect stillness before the flood: the sand settles into its figure.
    await this.wait(0.8);
    this.energy = 0;
    await this.wait(1.0);
    await this.breakthrough();

    await this.wait(2.5);
    this.lovedHand.moveTo(this, this.lovedPose.pos, this.lovedPose.rot, 3.2, ease.out);
    await this.wait(1.5);
    this.hands[1].targetCurl = 0.6; // your fingers close a little under hers
    await this.writer.say(B.hand, { hold: 1.5 });
    await this.writer.say(B.fragment, { hold: 3.5 });
    this.ctx.audio.stopMusic(4.5);
    this.next('medusa', {}, { color: '#000000', out: 2.5, in: 2 });
  }

  update(dt, t) {
    super.update(dt, t);
    this.energy *= Math.exp(-dt * 1.2);
    const e = Math.min(this.energy, 2.5);

    this._updateSand(dt, t, e);
    if (this.strings.visible) this._updateStrings(t, e);
    const glow = Math.min(1, e * 0.25);
    this.caseMat.emissive.setRGB(0.25 * glow, 0.09 * glow, 0.02 * glow);
    this.lidMat.emissive.copy(this.caseMat.emissive);

    // Keys spring back, hands settle.
    const k = Math.exp(-dt * 10);
    for (let i = 0; i < WHITE; i++) this.whiteDown[i] *= k;
    for (let i = 0; i < this.blackDown.length; i++) this.blackDown[i] *= k;
    this._updateKeys();
    this.hands.forEach((h, i) => {
      this.dip[i] *= Math.exp(-dt * 8);
      h.position.y = this.handBase[i].y - this.dip[i] * 0.02;
      if (i === 0 || h.targetCurl < 0.55) h.targetCurl = 0.45 + this.dip[i] * 0.3;
    });

    // Candles.
    for (const f of this.flames) {
      const n = 1 + Math.sin(t * 11 + f.phase) * 0.08 + Math.sin(t * 23 + f.phase * 2) * 0.05;
      f.flame.scale.set(0.04, 0.075, 1).multiplyScalar(n * (1 + this.flare * 0.6));
      f.halo.scale.setScalar(0.4 * n * (1 + this.flare));
    }
    this.candleLight.intensity = 1.1 * (1 + Math.sin(t * 13) * 0.1) + this.flare * 1.5 + e * 0.3;
    if (this.lyreHalo.material.opacity > 0) this.lyreHalo.scale.setScalar(1.8 + Math.sin(t * 0.9) * 0.08 + e * 0.15);
  }

  _updateSand(dt, t, e) {
    const pos = this.sand.geometry.attributes.position.array;
    if (!this.flying) {
      if (e < 0.003) return;
      // Chladni: grains at the antinodes are thrown about, grains on the nodal lines stay put.
      const [n, m, s] = this.mode;
      const W = SAND_X[1] - SAND_X[0];
      const D = SAND_D[1] - SAND_D[0];
      const step = e * dt * 2.0;
      for (let i = 0; i < SAND; i++) {
        let x = pos[i * 3];
        let d = -pos[i * 3 + 2];
        const u = (x - SAND_X[0]) / W;
        const v = (d - SAND_D[0]) / D;
        const f = Math.abs(Math.cos(n * Math.PI * u) * Math.cos(m * Math.PI * v) + s * Math.cos(m * Math.PI * u) * Math.cos(n * Math.PI * v));
        const a = f * step;
        x = clamp(x + (Math.random() - 0.5) * a, SAND_X[0], SAND_X[1]);
        d = clamp(d + (Math.random() - 0.5) * a, SAND_D[0], SAND_D[1]);
        pos[i * 3] = x;
        pos[i * 3 + 1] = SAND_Y + Math.random() * f * Math.min(e, 1) * 0.006; // the grains hop
        pos[i * 3 + 2] = -d;
      }
    } else {
      // Gold motes: thrown up, slowed by the air, then drifting where the music holds them.
      const v = this.vel;
      const drag = Math.exp(-dt * 1.1);
      for (let i = 0; i < SAND; i++) {
        const j = i * 3;
        v[j] = v[j] * drag + Math.sin(t * 0.4 + i * 0.37) * 0.02 * dt;
        v[j + 1] = v[j + 1] * drag + (Math.sin(t * 0.3 + i) * 0.015 - (pos[j + 1] > 2.8 ? 0.05 : 0)) * dt;
        v[j + 2] = v[j + 2] * drag + Math.cos(t * 0.35 + i * 0.21) * 0.02 * dt;
        pos[j] += v[j] * dt;
        pos[j + 1] = Math.max(0.05, pos[j + 1] + v[j + 1] * dt);
        pos[j + 2] += v[j + 2] * dt;
      }
    }
    this.sand.geometry.attributes.position.needsUpdate = true;
  }

  /** Strings: piano strings inside the case (lyreK 0) → the lyre's strings (lyreK 1), trembling with the music. */
  _updateStrings(t, e) {
    const pos = this.stringPos;
    for (let vi = 0; vi < this.stringU.length; vi++) {
      const s = this.stringIdx[vi];
      const u = this.stringU[vi];
      const f = s / (STRINGS - 1);
      // in the piano: from the keys back toward the tail, shorter in the treble
      const px = -0.6 + 1.2 * f;
      const pz = lerp(-0.62, -2.0 + f * 0.6, u);
      // in the lyre: fanned between the soundbox and the crossbar
      const lx = lerp(lerp(-0.14, 0.14, f), lerp(-0.27, 0.27, f), u);
      const ly = lerp(LYRE_Y[0], LYRE_Y[1], u);
      const k = ease.inOut(clamp(this.lyreK * 1.5 - (1 - f) * 0.5, 0, 1)); // treble first, like a glissando
      const lift = Math.sin(Math.PI * k) * 0.25; // they arc up out of the case
      const tremble = Math.sin(Math.PI * u) * Math.sin(t * 55 + s * 1.7) * (0.002 + e * 0.006);
      pos[vi * 3] = lerp(px, lx, k);
      pos[vi * 3 + 1] = lerp(STRING_Y, ly, k) + lift + tremble * (1 - k);
      pos[vi * 3 + 2] = lerp(pz, LYRE_Z, k) + tremble * k;
    }
    this.strings.geometry.attributes.position.needsUpdate = true;
    this.stringMat.opacity = 0.55 + Math.min(0.4, e * 0.2);
  }
}
