import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BaseScene } from '../core/SceneManager.js';
import { Dust } from '../core/props.js';
import { clamp, ease, glowTexture, lerp } from '../core/util.js';
import { softMaterial, paintedTexture, lightShaftMaterial, bindShaft } from '../core/look.js';
import { loadArt, cutout, groundShadow } from '../core/collage.js';
import { crownMaterial, plantGrove } from '../core/grove.js';
import { leavesWind } from '../core/ambience.js';
import { lyre, thump } from '../core/synth.js';
import { GiantHand } from './nursery.js';

// Scene 5 — Orpheus and Eurydice (Ovid, Metamorphoses X). A past life, through sound and sight.
//
// You walk in the misty grove of the dead: Corot's painting (1861) all around, his leaves in the crowns of
// the trees, his mourners standing in the mist. Rubens's Orpheus (1636–38) leads Eurydice up the path toward
// the light, and you follow. A lyre rests on a stone: its strings part the mist and the dead turn to listen.
// But he may not look back, and he can feel your eyes on them: hold him with your gaze and he turns.
// Their embrace (Leighton, 1864) is that instant. You become Eurydice, drawn back into the dark, reaching
// for him. In the light where he stands the Muses appear (Hausleithner, 1882), and Orpheus is Beethoven.

const EYE = 1.6;
const MIST = new THREE.Color('#9aa39a');
const DARK = new THREE.Color('#151913');
const PATH_START = new THREE.Vector3(-0.5, 0, -4.2);
const PATH_END = new THREE.Vector3(1.1, 0, -18);
const WALK_SPEED = 0.62; // m/s, a little slower than you
const WAIT_DISTANCE = 8; // they wait if you fall further behind than this
const WAIT_LIMIT = 16; // but not for ever (seconds)
const STARE_LIMIT = 5.5; // seconds of your eyes on him before he has to look
const STARE_CONE = Math.cos(0.3);
// the lullaby, as notes of a five-stringed lyre
const STRINGS = [196.0, 220.0, 261.63, 293.66, 329.63];
const TREES = 26;
const TUFTS = 90;

const _head = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _a = new THREE.Vector3();

/** One note of a plucked string. */
function pluck(freq) {
  const secs = 2.4;
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Ctx(1, Math.ceil(44100 * secs), 44100);
  const out = ctx.createGain();
  out.connect(ctx.destination);
  for (const [mult, amp, decay] of [[1, 0.5, 2.0], [2, 0.22, 1.2], [3, 0.1, 0.7], [4.02, 0.05, 0.4]]) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq * mult;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(amp, 0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, decay);
    o.connect(g).connect(out);
    o.start(0);
    o.stop(secs);
  }
  return ctx.startRendering();
}

function barkTexture() {
  return paintedTexture(64, 256, (c, w, h) => {
    c.fillStyle = '#2b2a20';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      c.strokeStyle = `rgba(${Math.random() < 0.5 ? '150,150,120' : '10,10,8'},${0.08 + Math.random() * 0.2})`;
      c.lineWidth = 1 + Math.random() * 2;
      const x = Math.random() * w;
      c.beginPath();
      c.moveTo(x, Math.random() * h);
      c.lineTo(x + (Math.random() - 0.5) * 6, Math.random() * h);
      c.stroke();
    }
  });
}

/** A lyre on its stone: gold arms, a shell, and strings that can be touched. Returns { group, strings }. */
function buildLyre() {
  const group = new THREE.Group();
  const gold = softMaterial({ color: '#a97f35', rim: '#ffe6a8', rimStrength: 0.6, hatch: 0, umber: '#3a2a10' });
  const arm = (side) =>
    new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.09, 0.0, 0),
          new THREE.Vector3(side * 0.2, 0.17, 0),
          new THREE.Vector3(side * 0.16, 0.38, 0),
          new THREE.Vector3(side * 0.23, 0.5, 0),
        ]),
        16,
        0.018,
        7,
      ),
      gold,
    );
  group.add(arm(-1), arm(1));
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.46, 7).rotateZ(Math.PI / 2), gold);
  bar.position.y = 0.46;
  group.add(bar);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 10).scale(1, 0.7, 0.45), softMaterial({ color: '#5a4426', rim: '#e8c890', rimStrength: 0.45, hatch: 40, umber: '#20150a' }));
  shell.position.y = -0.03;
  group.add(shell);
  group.traverse((o) => (o.raycast = () => {}));

  const strings = STRINGS.map((_, i) => {
    const x = (i - 2) * 0.042;
    const mat = new THREE.MeshBasicMaterial({ color: '#efe2bd', fog: false });
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.45, 5), mat);
    string.position.set(x, 0.235, 0);
    string.raycast = () => {};
    // what a finger or a pointer actually hits
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.45, 0.06), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.copy(string.position);
    group.add(string, hit);
    return { string, hit, shake: 0 };
  });
  return { group, strings };
}

export class OrpheusScene extends BaseScene {
  skipTo = 'beethoven';

  async enter() {
    const { ctx } = this;
    ctx.rig.position.set(0, EYE, 0);
    ctx.look.reset(0, 0);
    ctx.scene.background = MIST.clone();
    ctx.scene.fog = new THREE.Fog(MIST.clone(), 8, 40);
    ctx.grain.set({ grain: 0.06, vignette: 0.5, color: '#0d0f0c' });
    const { audio } = ctx;
    audio.define('lyre', () => lyre());
    audio.define('thump', () => thump());
    audio.define('leaves', leavesWind);
    STRINGS.forEach((f, i) => audio.define('string' + i, () => pluck(f)));

    const [T] = await Promise.all([
      loadArt('orpheus', ['grove', 'couple', 'orpheus', 'leighton', 'muses', 'beethoven', 'grove-crown', 'grove-tufts', 'grove-ground', 'shades-a', 'shades-b']),
      audio.preload(['lyre', 'moonlight', 'thump', 'leaves', ...STRINGS.map((_, i) => 'string' + i)]),
    ]);

    this.charm = 0; // how much the music has moved the grove, 0..1
    this.stare = 0;
    this.walking = false;
    this.walkT = 0;
    this.waited = 0;
    this.pathK = 0;
    this.gone = false;

    this.walkArea = { center: [0.4, -9], radius: 11.5 };

    // ---------- Corot's grove of the dead, all around and far away ----------
    if (T.grove) {
      T.grove.wrapS = THREE.RepeatWrapping;
      T.grove.repeat.set(3, 1);
      const fade = paintedTexture(4, 64, (c, w, h) => {
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#000');
        g.addColorStop(0.3, '#fff');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
      });
      fade.colorSpace = THREE.NoColorSpace;
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(25, 25, 16, 96, 1, true),
        new THREE.MeshBasicMaterial({ map: T.grove, alphaMap: fade, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false, color: '#c9ccc2' }),
      );
      band.position.set(0.4, 6.2, -9);
      band.renderOrder = -1;
      band.raycast = () => {};
      this.add(band);
      this.bandMat = band.material;
    }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#a4aaa2', side: THREE.BackSide, fog: false }));
    dome.renderOrder = -2;
    dome.raycast = () => {};
    this.add(dome);

    // ground: dark, damp meadow; a pale path toward the light
    const turf = T['grove-ground'];
    if (turf) {
      turf.wrapS = turf.wrapT = THREE.MirroredRepeatWrapping;
      turf.repeat.set(16, 34);
      turf.anisotropy = 8;
    }
    this.groundMat = new THREE.MeshLambertMaterial({ map: turf || null, color: turf ? '#b6b8a8' : '#2f3627' });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.rotation.z = 0.4;
    ground.raycast = () => {};
    this.add(ground);
    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 26),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#c9c6ad', transparent: true, opacity: 0.42, depthWrite: false }),
    );
    path.rotation.x = -Math.PI / 2;
    path.rotation.z = Math.atan2(PATH_END.x - PATH_START.x, PATH_START.z - PATH_END.z) * -1;
    path.position.set(0.3, 0.01, -9);
    path.raycast = () => {};
    this.add(path);

    this._buildTrees(T);
    this._buildUndergrowth(T);
    this._buildShades(T);
    this._buildMist();

    // the threshold of the upper world: a light at the end of the path
    this.exitPos = PATH_END.clone().setY(2.4).add(new THREE.Vector3(0.3, 0, -1.8));
    this.exitLight = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: '#fff6dc', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    );
    this.exitLight.position.copy(this.exitPos);
    this.exitLight.scale.setScalar(9);
    this.exitLight.raycast = () => {};
    this.add(this.exitLight);
    this.shafts = [];
    for (const [x, rot] of [[-1.8, 0.32], [0.7, 0.2], [3.2, -0.05]]) {
      const geo = new THREE.PlaneGeometry(2.4, 11);
      geo.translate(0, -5.5, 0);
      const m = bindShaft(new THREE.Mesh(geo, lightShaftMaterial('#fff4d8', 0.12)));
      m.position.set(x + this.exitPos.x, 9.5, this.exitPos.z + 3);
      m.rotation.z = rot;
      this.add(m);
      this.shafts.push(m);
    }
    this.dust = this.add(new Dust({ count: 200, radius: 9, inner: 1, color: '#f3f1dc', size: 0.03, opacity: 0.4, speed: 0.008 }));
    this.dust.position.set(0.4, 1.7, -7);

    // ---------- the two of them ----------
    this.couple = new THREE.Group();
    if (T.couple) {
      this.coupleFig = cutout(T.couple, 1.95);
      this.couple.add(this.coupleFig);
    }
    this.couple.add(groundShadow(1.5));
    this.couple.position.copy(PATH_START);
    this.add(this.couple);

    // Orpheus alone, for when she is you
    this.orpheusAlone = new THREE.Group();
    if (T.orpheus) {
      this.orpheusFig = cutout(T.orpheus, 1.95);
      this.orpheusAlone.add(this.orpheusFig);
    }
    this.orpheusAlone.add(groundShadow(1));
    this.orpheusAlone.visible = false;
    this.add(this.orpheusAlone);

    // Leighton's embrace: the instant he turns, close to you
    if (T.leighton) {
      this.embrace = cutout(T.leighton, 2.15, { self: 0.65 });
      this.embrace.material.opacity = 0;
      this.embrace.visible = false;
      this.add(this.embrace);
    }

    // the vision at the end: the Muses in their light, and Beethoven on his rock
    if (T.muses) {
      this.muses = cutout(T.muses, 4.2, { anchor: 'center', self: 0.9, bow: 0.02 });
      this.muses.material.opacity = 0;
      this.muses.visible = false;
      this.add(this.muses);
    }
    if (T.beethoven) {
      this.beethoven = cutout(T.beethoven, 1.6);
      this.beethoven.material.opacity = 0;
      this.beethoven.visible = false;
      // the mossy rock he leans on in the painting
      const rock = new THREE.Mesh(
        new THREE.SphereGeometry(1, 32, 16),
        softMaterial({ color: '#43483a', rim: '#c9c6a4', rimStrength: 0.2, hatch: 0, transparent: true, opacity: 0 }),
      );
      rock.scale.set(0.75, 0.42, 0.45);
      rock.position.set(0.18, 0.12, -0.32);
      rock.raycast = () => {};
      this.beethoven.add(rock);
      this.beethovenRock = rock;
      this.add(this.beethoven);
    }

    this._buildLyre();

    // ---------- you, once you are Eurydice ----------
    this.me = new THREE.Group();
    this.me.visible = false;
    this.root.add(this.me);
    this.myHands = [-1, 1].map((side) => {
      const h = new GiantHand({ side, skin: '#ecd6c6', sleeve: '#efe9de', scale: 1.1, plain: true });
      h.visible = true;
      h.position.set(0.22 * side, -0.3, -0.5);
      h.rotation.set(Math.PI * 0.45, -0.2 * side, 0);
      h.targetCurl = 0.1;
      h.traverse((o) => {
        if (o.material) {
          o.material.transparent = true;
          o.material.depthWrite = true;
        }
      });
      this.me.add(h);
      return h;
    });
    this.reach = 0;
    this.reachLeft = 0.35; // it only holds off the dark so long

    this.hemi = new THREE.HemisphereLight('#d9ddd2', '#262b21', 1.25);
    this.sun = new THREE.DirectionalLight('#fff1d8', 1.2);
    this.sun.position.set(0.5, 3, 8); // behind you: the paint faces it
    this.root.add(this.hemi, this.sun);
  }

  _buildTrees(T) {
    const bark = barkTexture();
    bark.wrapS = bark.wrapT = THREE.RepeatWrapping;
    this.barkMat = new THREE.MeshLambertMaterial({ map: bark });
    this.leafMat = crownMaterial(T['grove-crown'], { fogColor: MIST, fogNear: 8, fogFar: 38 });
    let seed = 17;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const near = (x, z) => {
      // keep clear of the path and of where you start
      const k = clamp((z - PATH_START.z) / (PATH_END.z - PATH_START.z), 0, 1);
      return Math.abs(x - lerp(PATH_START.x, PATH_END.x, k)) < 2.1 || Math.hypot(x, z) < 2.4;
    };
    const spots = [];
    while (spots.length < TREES) {
      const x = (rnd() - 0.5) * 34 + 0.4;
      const z = -rnd() * 30 + 5;
      if (near(x, z) || Math.hypot(x - 0.4, z + 9) > 22) continue;
      spots.push({ x, z, scale: 1.25 + rnd() * 0.9, yaw: rnd() * 6.28 });
    }
    this.add(plantGrove(spots, this.barkMat, this.leafMat, { count: 70, spread: 1.7, height: 1.3, size: 0.3, cy: 3.25 }));
    // the wind's sound lives in two of them
    this.windAt = [spots[2], spots[9]].map((t) => {
      const o = new THREE.Object3D();
      o.position.set(t.x, 3, t.z);
      this.add(o);
      return o;
    });
  }

  _buildUndergrowth(T) {
    const atlas = T['grove-tufts'];
    if (!atlas) return;
    atlas.anisotropy = 4;
    this.tuftMat = new THREE.MeshBasicMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide, color: '#8e937e' });
    const dummy = new THREE.Object3D();
    for (let cell = 0; cell < 4; cell++) {
      const quad = () => {
        const g = new THREE.PlaneGeometry(0.75, 0.62).translate(0, 0.28, 0);
        const uv = g.attributes.uv;
        const u0 = (cell % 2) / 2;
        const v0 = 1 - (Math.floor(cell / 2) + 1) / 2;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) / 2, v0 + uv.getY(i) / 2);
        return g;
      };
      const inst = new THREE.InstancedMesh(mergeGeometries([quad(), quad().rotateY(Math.PI / 2)]), this.tuftMat, TUFTS);
      for (let i = 0; i < TUFTS; i++) {
        let x, z, k;
        do {
          x = (Math.random() - 0.5) * 30 + 0.4;
          z = -Math.random() * 28 + 4;
          k = clamp((z - PATH_START.z) / (PATH_END.z - PATH_START.z), 0, 1);
        } while (Math.abs(x - lerp(PATH_START.x, PATH_END.x, k)) < 1.15 || Math.hypot(x, z) < 2);
        dummy.position.set(x, 0, z);
        dummy.rotation.y = Math.random() * Math.PI;
        dummy.scale.setScalar(0.7 + Math.random() * 0.8);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      inst.raycast = () => {};
      this.add(inst);
    }
  }

  /** Corot's mourners, standing in the mist on either side of the way up. */
  _buildShades(T) {
    this.shades = [];
    const spots = [[-5.2, -7.5, 'shades-a', 2.0], [5.4, -9, 'shades-b', 2.0], [-3.8, -13, 'shades-b', 2.1], [5.3, -14.5, 'shades-a', 2.2], [-6.4, -2.6, 'shades-b', 1.9], [-1.8, -18, 'shades-a', 2.3]];
    for (const [x, z, name, h] of spots) {
      if (!T[name]) continue;
      const fig = cutout(T[name], h, { self: 0.8, bow: 0.04 });
      fig.position.set(x, 0, z);
      this.add(fig);
      this.shades.push({ fig, home: new THREE.Vector3(x, 0, z), phase: x });
    }
  }

  _buildMist() {
    // mist drifting low: soft wisps, never a hard edge
    this.mists = [];
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#e8ebe2', transparent: true, depthWrite: false, opacity: 0.4, fog: false }));
      const a = (i / 26) * Math.PI * 2 + Math.sin(i * 3.1) * 0.2;
      const r = 3 + (i % 6) * 2.1;
      m.position.set(0.4 + Math.sin(a) * r, 0.25 + (i % 3) * 0.3, -9 - Math.cos(a) * r);
      m.scale.set(6 + (i % 4) * 1.5, 1.3 + (i % 3) * 0.5, 1);
      m.userData.phase = a;
      m.raycast = () => {};
      this.add(m);
      this.mists.push(m);
    }
  }

  _buildLyre() {
    const { interact } = this.ctx;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 1), new THREE.MeshLambertMaterial({ color: '#3f4436', flatShading: true }));
    stone.scale.set(0.95, 0.8, 0.8);
    stone.position.set(0, 0.3, 0);
    stone.raycast = () => {};
    const { group, strings } = buildLyre();
    group.position.set(0, 0.76, 0.02);
    group.rotation.x = -0.28;
    this.lyreStone = new THREE.Group();
    this.lyreStone.add(stone, group, groundShadow(1.3));
    this.lyreStone.position.set(1.25, 0, -2.3);
    this.lyreStone.rotation.y = -0.45;
    this.add(this.lyreStone);
    this.lyreStrings = strings;
    strings.forEach((s, i) => {
      interact.addTouch(s.hit, { radius: 0.07, cooldown: 0.16, haptic: 0.3, tip: 'touch', onTouch: () => this._pluck(i) });
    });
  }

  _pluck(i) {
    const s = this.lyreStrings[i];
    s.shake = 1;
    this.plucked = true;
    this.sound('string' + i, { parent: this.lyreStone, volume: 0.9, refDistance: 3 });
    // the mist thins and the dead turn to listen; it fades again unless you go on playing
    this.charm = Math.min(1, this.charm + 0.17);
    if (this.stare > 0) this.stare = Math.max(0, this.stare - 0.3); // and he holds on a little longer
  }

  async start() {
    const { ctx } = this;
    const { audio, input, fader, haze } = ctx;
    const M = ctx.content.MYTHS.orpheus;
    const O = ctx.content.ORPHEUS;

    // Wind in the crowns, either side of the way up
    this.sound('leaves', { parent: this.windAt[0], loop: true, volume: 0.6, refDistance: 6 });
    this.sound('leaves', { parent: this.windAt[1], loop: true, volume: 0.6, rate: 0.85, refDistance: 6 });

    // The lyre: the same lullaby the mother hummed.
    this.lyre = await this.sound('lyre', { parent: this.couple, loop: true, volume: 0, refDistance: 3 });
    audio.fade(this.lyre, 1, 3);
    await this.wait(1.5);
    await this.say(M.condition, { hold: 1.5 });

    // Up the path: and you behind them.
    this.walking = true;
    this.say(O.hintWalk, { narrate: false, hold: 3 });
    await this.say(M.path, { hold: 1 });
    this.say(O.hintLyre, { narrate: false, hold: 3 });
    await this.wait(5);
    this.watching = true;
    this.say(O.hintEyes, { narrate: false, hold: 3 });
    await this.until(() => this.stare >= STARE_LIMIT || this.pathK >= 1, 70);

    // He turns.
    this.watching = false;
    this.walking = false;
    audio.fade(this.lyre, 0, 0.6);
    const head = ctx.camera.getWorldPosition(new THREE.Vector3());
    const dir = this.couple.position.clone().sub(head).setY(0).normalize();
    this.turnDir = dir;
    this.couple.visible = false;
    if (this.embrace) {
      this.embrace.visible = true;
      this.embrace.position.set(head.x + dir.x * 3, 0, head.z + dir.z * 3);
      this.embrace.lookAt(head.x, 0, head.z);
      this.tween(1.2, (k) => (this.embrace.material.opacity = k));
    }
    await this.say(M.turn, { hold: 1 });

    // Look at her — and become her.
    let chosen = false;
    const hit = this.embrace || this.couple;
    if (this.embrace) this.embrace.raycast = THREE.Mesh.prototype.raycast;
    input.add(hit, { onSelect: () => (chosen = true), dwell: 1.2 });
    await this.until(() => chosen, 7);
    input.remove(hit);

    // ---- you are Eurydice ----
    await fader.fade(1, 0.7, '#0b0d0b');
    if (this.embrace) this.embrace.visible = false;
    ctx.locomotion.setArea(null); // you do not walk any more: you are being taken
    ctx.interact.setHandsVisible(false); // these hands are hers
    ctx.camera.getWorldPosition(head);
    const fwd = dir.clone();
    const at = (d, side, y) => new THREE.Vector3(head.x + fwd.x * d - fwd.z * side, y, head.z + fwd.z * d + fwd.x * side);
    this.me.position.set(head.x, head.y, head.z);
    this.me.rotation.y = Math.atan2(-fwd.x, -fwd.z);
    this.orpheusAlone.visible = true;
    this.orpheusAlone.position.copy(at(3, 0.3, 0));
    this.me.visible = true;
    for (const h of this.myHands) h.targetCurl = 0.05;
    this.reaching = true;
    await fader.fade(0, 1.2);
    this.say(O.hintReach, { narrate: false, hold: 3 });

    // You are drawn back into the dark; your hands close on air. Reach, and it only takes a little longer.
    const far = at(14, 1.2, 0);
    const o0 = this.orpheusAlone.position.clone();
    let drawn = 0;
    this.drawnRate = 1 / 10;
    this.drawnFn = (k) => {
      drawn = k;
      this.orpheusAlone.position.lerpVectors(o0, far, ease.in(k));
      ctx.scene.fog.far = lerp(40, 9, k);
      ctx.scene.fog.color.lerpColors(MIST, DARK, k);
      ctx.scene.background.copy(ctx.scene.fog.color);
      this.leafMat.uniforms.fogColor.value.copy(ctx.scene.fog.color);
      this.leafMat.uniforms.fogFar.value = lerp(38, 9, k);
      if (this.bandMat) this.bandMat.color.setScalar(lerp(0.79, 0.25, k));
      ctx.grain.set({ vignette: lerp(0.5, 0.85, k) });
      for (const h of this.myHands) h.traverse((o) => o.material && (o.material.opacity = 1 - 0.85 * k));
    };
    await this.say(M.farewell, { hold: 1 });
    await this.until(() => drawn >= 1, 18);
    this.drawnFn = null;
    this.reaching = false;

    // In the light where he stands, the Muses — and Orpheus is Beethoven.
    this.me.visible = false;
    audio.playMusic('moonlight', { volume: 0.5, fade: 4 });
    // the light comes toward you, carrying the vision
    if (this.muses) {
      this.muses.visible = true;
      this.muses.position.copy(at(6.2, -0.3, 2.4));
      this.muses.lookAt(head.x, 2.4, head.z);
    }
    if (this.beethoven) {
      this.beethoven.visible = true;
      this.beethoven.position.copy(at(4.6, 1.7, 0));
      this.beethoven.lookAt(head.x, 0.8, head.z);
    }
    const e0 = this.exitLight.position.clone();
    const e1 = at(7, -0.3, 2.6);
    this.tween(4, (k) => this.exitLight.position.lerpVectors(e0, e1, k), ease.out);
    await this.tween(4, (k) => {
      if (this.muses) this.muses.material.opacity = k;
      if (this.beethoven) this.beethoven.material.opacity = k;
      if (this.beethovenRock) this.beethovenRock.material.opacity = k;
      if (this.orpheusFig) this.orpheusFig.material.opacity = 1 - k;
      this.exitLight.material.opacity = 0.85 + 0.15 * k;
    });
    haze.set({ color: '#fff6e0', amount: 0 });
    await this.wait(3);
    this.next('beethoven', {}, { color: '#000000', out: 2.5, in: 2 });
  }

  /** As Eurydice: stretching out your hands holds off the dark, for a moment. */
  _reachOut() {
    if (!this.reaching) return;
    this.reach = 1;
    for (const h of this.myHands) h.targetCurl = 0;
    if (this.reachLeft > 0) {
      this.reachLeft -= 0.05;
      this.drawnProgress = Math.max(0, (this.drawnProgress || 0) - 0.05);
    }
    this.ctx.interact.hands?.forEach((h) => h.state?.source?.gamepad?.hapticActuators?.[0]?.pulse?.(0.4, 60));
  }

  onSelectNothing() {
    this._reachOut();
  }

  update(dt, t) {
    super.update(dt, t);
    const { ctx } = this;
    const head = ctx.camera.getWorldPosition(_head);
    ctx.camera.getWorldDirection(_fwd);

    this.charm = Math.max(0, this.charm - dt * 0.035);
    const c = this.charm;

    for (const m of this.mists) {
      m.position.y += Math.sin(t * 0.3 + m.userData.phase) * 0.0015;
      m.material.opacity = (0.32 + Math.sin(t * 0.2 + m.userData.phase) * 0.1) * (1 - c * 0.6);
    }

    // the grove leans to the music
    this.leafMat.uniforms.time.value = t;
    this.leafMat.uniforms.sway.value = 0.006 + c * 0.018;

    // the dead keep still, until there is music: then they turn toward it, and draw near
    for (const s of this.shades) {
      _a.copy(this.lyreStone.position).sub(s.home).setY(0);
      const d = _a.length();
      if (d > 0.01) _a.multiplyScalar((c * Math.min(d - 1.5, 1.6)) / d);
      s.fig.position.x += (s.home.x + _a.x - s.fig.position.x) * dt * 0.6;
      s.fig.position.z += (s.home.z + _a.z - s.fig.position.z) * dt * 0.6;
      s.fig.position.y = 0;
      s.fig.rotation.y = Math.atan2(head.x - s.fig.position.x, head.z - s.fig.position.z);
      s.fig.material.opacity = 0.8 + c * 0.2;
    }

    // the strings
    for (const s of this.lyreStrings) {
      s.shake = Math.max(0, s.shake - dt * 2.4);
      s.string.position.z = Math.sin(t * 90) * 0.004 * s.shake;
    }

    // the couple walks while you follow, and waits a while if you do not
    if (this.walking) {
      this.walkT += dt;
      const lag = this.couple.position.distanceTo(_a.set(head.x, 0, head.z));
      if (lag < WAIT_DISTANCE) this.waited = 0;
      else this.waited += dt;
      const go = this.waited === 0 || this.waited > WAIT_LIMIT;
      const slow = 1 - clamp(this.stare / STARE_LIMIT, 0, 1) * 0.75;
      if (go) this.pathK = Math.min(1, this.pathK + (dt * WALK_SPEED * slow) / PATH_START.distanceTo(PATH_END));
      this.couple.position.lerpVectors(PATH_START, PATH_END, this.pathK);
      this.couple.position.y = go ? Math.abs(Math.sin(this.walkT * 3.2)) * 0.03 : 0;
    }
    if (this.couple.visible) this.couple.rotation.y = Math.atan2(head.x - this.couple.position.x, head.z - this.couple.position.z);
    if (this.coupleFig) this.coupleFig.rotation.z = Math.sin(t * 2) * 0.012;

    // your eyes on them
    if (this.watching) {
      _a.copy(this.couple.position).setY(1.2).sub(head).normalize();
      const looking = _a.dot(_fwd) > STARE_CONE;
      const before = this.stare;
      this.stare = clamp(this.stare + (looking ? dt : -dt * 0.4), 0, STARE_LIMIT);
      // the lyre falters: a beat of the heart at every second of it
      if (looking && Math.floor(before) !== Math.floor(this.stare)) this.sound('thump', { parent: this.couple, volume: 0.25 + this.stare * 0.1, refDistance: 3 });
      if (this.lyre) this.lyre.setVolume(1 - (this.stare / STARE_LIMIT) * 0.75);
      // the sheet begins to turn on its feet, as a head would
      if (this.coupleFig) this.coupleFig.rotation.y = (this.stare / STARE_LIMIT) * 0.5;
    }

    // Eurydice: taken, little by little
    if (this.drawnFn) {
      this.drawnProgress = Math.min(1, (this.drawnProgress || 0) + dt * this.drawnRate);
      this.drawnFn(this.drawnProgress);
      this.reach = Math.max(0, this.reach - dt * 0.8);
      for (let i = 0; i < 2; i++) {
        const h = this.myHands[i];
        h.position.z = -0.5 - this.reach * 0.22;
        h.targetCurl = lerp(0.85 * this.drawnProgress + 0.05, 0, this.reach);
      }
      // in a headset, your own arms: stretched out, they count
      const hands = ctx.interact.hands;
      if (ctx.renderer.xr.isPresenting && hands) {
        for (let i = 0; i < 2; i++) {
          const H = hands[i];
          if (!H?.tracked) continue;
          const hand = this.myHands[H.state?.source?.handedness === 'left' ? 0 : 1];
          hand.position.copy(this.me.worldToLocal(_a.copy(H.pos)));
          if (H.pos.distanceTo(head) > 0.5 && Math.random() < dt * 2) this._reachOut();
        }
      }
    }

    if (this.orpheusAlone.visible) this.orpheusAlone.rotation.y = Math.atan2(head.x - this.orpheusAlone.position.x, head.z - this.orpheusAlone.position.z);
    this.exitLight.scale.setScalar(9 + Math.sin(t * 0.7) * 0.4 + c * 1.5);
    for (const h of this.myHands) h.update(t, dt);
  }
}
