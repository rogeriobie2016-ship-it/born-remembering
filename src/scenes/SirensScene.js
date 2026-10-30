import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { BaseScene } from '../core/SceneManager.js';
import { ease, lerp, glowTexture } from '../core/util.js';
import { softMaterial, paintedTexture } from '../core/look.js';
import { engravedSky, engravedSea } from '../core/engraved.js';
import { loadArt, cutout, cartouche, ScrollWriter } from '../core/collage.js';
import { sirenSong } from '../core/synth.js';
import { GiantHand } from './nursery.js';

// Scene 4 — Ulysses and the Sirens (Odyssey XII). A past life, reached through sound.
//
// You float among the Sirens' rocks at dusk. Two Sirens climb from the sea (Herbert
// Draper, 1909); the bird-Sirens of John William Waterhouse (1891) circle overhead as
// painted medallions. A Greek ship rows past, Ulysses bound to the mast, the crew's ears
// stopped with wax. The song does not hold him. You become a Siren: your voice fails,
// and you fall into the sea and turn to stone.
//
// Look: mixed media again — painted cut-outs and vignettes in an engraved world.
// Comfort: the rig never moves; the fall is the world rising.

const EYE = 1.3;
const HORIZON = new THREE.Color('#efdcbc');
const UNDERWATER = '#0b2f38';

/** Jagged sea-stack: an icosphere pushed out by noise, tall and weathered. */
function rockGeometry(seed, detail = 4) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, detail)); // shared vertices: smooth, weathered stone
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 3.1 + seed) * Math.sin(v.y * 2.7 - seed * 0.7) * Math.sin(v.z * 3.7 + seed * 1.3);
    const ridge = Math.abs(Math.sin(v.y * 7 + v.x * 2 + seed));
    v.multiplyScalar(1 + n * 0.28 + ridge * 0.08);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** The apotropaic eye painted on a Greek prow. */
function prowEyeTexture() {
  return paintedTexture(256, 128, (c, w, h) => {
    c.fillStyle = '#f2ead8';
    c.beginPath();
    c.ellipse(w / 2, h / 2, w * 0.42, h * 0.32, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#1e2b3a';
    c.beginPath();
    c.arc(w / 2, h / 2, h * 0.26, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#0b0b0b';
    c.beginPath();
    c.arc(w / 2, h / 2, h * 0.12, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#2a1c14';
    c.lineWidth = 6;
    c.beginPath();
    c.ellipse(w / 2, h / 2, w * 0.42, h * 0.32, 0, 0, Math.PI * 2);
    c.stroke();
  });
}

/** A Greek galley, engraved: upswept stern, bronze ram, painted eye, red sail, oars. Faces +X. */
function buildShip(ulyssesTex) {
  const ship = new THREE.Group();
  const wood = softMaterial({ color: '#5e3c27', rim: '#ffd9a8', rimStrength: 0.3, hatch: 20 });
  const band = softMaterial({ color: '#b5502f', rim: '#ffd9a8', rimStrength: 0.3, hatch: 20 });
  const bronze = softMaterial({ color: '#a7853f', rim: '#fff0c0', rimStrength: 0.6, hatch: 26 });
  const sailMat = softMaterial({ color: '#b04a35', rim: '#ffe0b8', rimStrength: 0.35, hatch: 14, side: THREE.DoubleSide });
  const skin = softMaterial({ color: '#c58c66', rim: '#ffd0a0', rimStrength: 0.4, hatch: 30 });
  const cap = softMaterial({ color: '#8a8f9a', rim: '#ffffff', rimStrength: 0.3, hatch: 30 });

  // hull: side profile extruded, then narrowed toward bow and stern
  const s = new THREE.Shape();
  s.moveTo(-6, 0.6);
  s.bezierCurveTo(-6.7, 1.6, -6.5, 3.3, -5.4, 3.5); // the stern sweeps up and curls
  s.bezierCurveTo(-4.9, 3.55, -5.1, 2.7, -5.5, 2.4);
  s.lineTo(-4.6, 1.5);
  s.lineTo(5.0, 1.5);
  s.bezierCurveTo(5.6, 1.6, 6.0, 2.2, 6.1, 2.7);
  s.lineTo(6.45, 2.7);
  s.lineTo(6.05, 1.2);
  s.lineTo(6.9, 0.35);
  s.lineTo(6.2, 0.05);
  s.bezierCurveTo(3, -0.6, -3, -0.6, -6, 0.6);
  const hullGeo = new THREE.ExtrudeGeometry(s, { depth: 2.6, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.2, bevelSegments: 4, curveSegments: 20 });
  hullGeo.translate(0, 0, -1.3);
  const hp = hullGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i);
    const taper = 1 - Math.pow(Math.min(1, Math.abs(x) / 6.6), 2.2) * 0.8;
    hp.setZ(i, hp.getZ(i) * taper);
  }
  hullGeo.computeVertexNormals();
  const hull = new THREE.Mesh(hullGeo, wood);
  ship.add(hull);
  const ram = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.2, 12), bronze);
  ram.rotation.z = -Math.PI / 2;
  ram.position.set(7.2, 0.3, 0);
  ship.add(ram);
  for (const side of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.22, 0.05), band);
    stripe.position.set(0.3, 1.25, side * 1.42);
    ship.add(stripe);
    const eye = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), new THREE.MeshLambertMaterial({ map: prowEyeTexture(), transparent: true }));
    eye.position.set(5.3, 1.05, side * 0.95);
    eye.rotation.y = side > 0 ? 0.35 : Math.PI - 0.35;
    ship.add(eye);
  }

  // mast, yard and a billowing red sail
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 8.5, 12), wood);
  mast.position.set(0.6, 5.2, 0);
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6.4, 10), wood);
  yard.rotation.x = Math.PI / 2;
  yard.position.set(0.7, 8.4, 0);
  const sailGeo = new THREE.PlaneGeometry(6, 4.2, 24, 12);
  const sp = sailGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i) / 3;
    const y = (sp.getY(i) + 2.1) / 4.2;
    sp.setZ(i, (1 - x * x) * (0.4 + 0.5 * Math.sin(y * Math.PI)) * 0.9);
  }
  sailGeo.computeVertexNormals();
  const sail = new THREE.Mesh(sailGeo, sailMat);
  sail.rotation.y = -Math.PI / 2; // spread across the ship, bellied forward (+X)
  sail.position.set(0.85, 6.2, 0);
  ship.add(mast, yard, sail);
  // stays
  for (const [x, z] of [[-4.5, 0], [5.5, 0], [0.6, 1.3], [0.6, -1.3]]) {
    const from = new THREE.Vector3(0.6, 9.2, 0);
    const to = new THREE.Vector3(x, 1.5, z);
    const len = from.distanceTo(to);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, len, 4), wood);
    rope.position.lerpVectors(from, to, 0.5);
    rope.lookAt(to);
    rope.rotateX(Math.PI / 2);
    ship.add(rope);
  }

  // the crew, rowing with wax in their ears
  const oars = [];
  for (let i = 0; i < 8; i++) {
    const x = -3.8 + i * 1.05;
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 1.45, side * 1.25);
      const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 4.6, 6), wood);
      oar.position.y = -2.0;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.22), wood);
      blade.position.y = -4.2;
      pivot.add(oar, blade);
      pivot.rotation.x = side * 1.0;
      pivot.userData = { side, phase: i * 0.15 };
      ship.add(pivot);
      oars.push(pivot);
    }
    if (i % 2 === 0) {
      const rower = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.45, 6, 12), skin);
      body.position.y = 1.85;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), skin);
      head.position.y = 2.35;
      const hat = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap);
      hat.position.y = 2.4;
      rower.add(body, head, hat);
      rower.position.set(x, 0, 0);
      ship.add(rower);
    }
  }

  // Ulysses, bound to the mast, straining toward the song
  let ulysses = null;
  if (ulyssesTex) {
    ulysses = cutout(ulyssesTex, 1.25);
    ulysses.position.set(0.95, 1.55, 0.35);
    ship.add(ulysses);
  }
  ship.traverse((o) => (o.raycast = () => {}));
  return { ship, oars, sail, ulysses };
}

export class SirensScene extends BaseScene {
  skipTo = 'orpheus';

  async enter() {
    const { ctx } = this;
    ctx.rig.position.set(0, EYE, 0);
    ctx.look.reset(0, -0.02);
    ctx.scene.background = HORIZON.clone();
    ctx.scene.fog = new THREE.Fog(HORIZON.clone(), 25, 170);
    ctx.grain.set({ grain: 0.05, vignette: 0.34, color: '#1d1410' });
    this.sunDir = new THREE.Vector3(0.55, 0.08, -0.83).normalize(); // low dusk sun, ahead-right
    ctx.audio.define('siren-song', () => sirenSong());

    const [T] = await Promise.all([
      loadArt('sirens', ['sirens-climbing', 'siren-rope', 'ulysses', 'harpy-left', 'harpy-a', 'harpy-b', 'harpy-right', 'harpy-mast']),
      ctx.audio.preload(['siren-song']),
    ]);

    // ---------- dusk, engraved ----------
    const sky = engravedSky({
      top: '#6e82a6',
      horizon: HORIZON,
      sunDir: this.sunDir,
      sunR: 0.045,
      cover: 0.6,
      cloudLow: '#b3a4b8',
      cloudLit: '#fff0d8',
      glory: '#ffd49a',
    });
    this.skyU = sky.u;
    this.add(sky.mesh);

    this.world = this.add(new THREE.Group());
    const sea = engravedSea({ deep: '#173f48', crest: '#4f8c88', sunDir: this.sunDir, fogColor: HORIZON.clone(), fogNear: 25, fogFar: 170, swell: 0.85, lines: 3.4 });
    this.seaU = sea.u;
    this.world.add(sea.mesh);

    // ---------- the Sirens' rocks ----------
    const rockMat = softMaterial({ color: '#6c6258', rim: '#ffd9b0', rimStrength: 0.35, hatch: 16 });
    const stack = (x, z, sx, sy, sz, seed) => {
      const r = new THREE.Mesh(rockGeometry(seed), rockMat);
      r.scale.set(sx, sy, sz);
      r.position.set(x, sy * 0.35, z);
      r.raycast = () => {};
      this.world.add(r);
      return r;
    };
    stack(-3.4, -5.3, 1.3, 1.0, 1.0, 1); // where the two Sirens climb
    stack(4.2, -6.6, 1.0, 1.9, 0.9, 2); // where the third holds her rope
    stack(-14, -26, 6, 9, 5, 3);
    stack(18, -34, 7, 12, 6, 4);
    stack(-30, -12, 5, 7, 5, 5);
    stack(2, 14, 8, 10, 6, 6); // behind you
    this.myRock = stack(0, 0.3, 1.2, 2.2, 1.2, 7); // under you, once you are a Siren
    this.myRock.visible = false;

    // ---------- the Sirens ----------
    this.sirens = [];
    const stand = (tex, h, x, y, z) => {
      if (!tex) return null;
      const m = cutout(tex, h);
      m.position.set(x, y, z);
      m.lookAt(0, y + h / 2, 0);
      m.userData = { base: m.position.clone(), phase: Math.random() * 6 };
      this.world.add(m);
      this.sirens.push(m);
      return m;
    };
    this.climbing = stand(T['sirens-climbing'], 2.9, -2.6, -0.55, -3.4);
    this.roped = stand(T['siren-rope'], 2.6, 3.5, 0.45, -4.9);

    this.gold = softMaterial({ color: '#c9a24e', rim: '#fff2c4', rimPower: 1.4, rimStrength: 0.8, hatch: 0 });
    // Waterhouse's bird-Sirens: painted medallions circling overhead
    this.harpies = ['harpy-left', 'harpy-a', 'harpy-b', 'harpy-right', 'harpy-mast']
      .map((n, i) => {
        if (!T[n]) return null;
        const m = cutout(T[n], 2.3, { anchor: 'center' });
        m.material.depthWrite = false;
        // a gilded oval frame: these are painted medallions, on purpose
        const [w, hh] = m.userData.size;
        const frame = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 8, 64), this.gold);
        frame.scale.set(w * 0.97, hh * 0.97, 1);
        frame.raycast = () => {};
        m.add(frame);
        m.userData = { angle: (i / 5) * Math.PI * 2, radius: 5.5 + (i % 2) * 2, height: 3.4 + (i % 3) * 1.0, speed: 0.07 + i * 0.008 };
        this.world.add(m);
        return m;
      })
      .filter(Boolean);

    // ---------- the ship ----------
    const { ship, oars, sail, ulysses } = buildShip(T.ulysses);
    this.ship = ship;
    this.oars = oars;
    this.sail = sail;
    this.ulysses = ulysses;
    ship.position.set(-46, 0, -14);
    ship.scale.setScalar(1.45);
    this.world.add(ship);
    this.shipHit = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.shipHit.position.y = 3;
    ship.add(this.shipHit);

    // ---------- you, once you are a Siren ----------
    this.me = new THREE.Group();
    this.me.visible = false;
    this.root.add(this.me);
    this.myHands = [-1, 1].map((side) => {
      const h = new GiantHand({ side, skin: '#f0d1bb', sleeve: '#f0d1bb', scale: 1.1 });
      h.visible = true;
      h.position.set(0.28 * side, 1.05, -0.55); // world y: rig sits at EYE
      h.rotation.set(Math.PI * 0.42, -0.25 * side, 0);
      h.targetCurl = 0.25;
      this.me.add(h);
      return h;
    });

    this.hemi = new THREE.HemisphereLight('#f3e1c6', '#2c4a4f', 1.3);
    this.sun = new THREE.DirectionalLight('#ffd7a0', 1.7);
    this.sun.position.copy(this.sunDir).multiplyScalar(80);
    this.root.add(this.hemi, this.sun);

    // a soft glow where the song comes from
    this.songGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffe6c0', transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    );
    this.songGlow.position.set(-1.0, 1.9, -4.4);
    this.songGlow.scale.setScalar(4);
    this.world.add(this.songGlow);

    this.scroll = this.add(cartouche(3.4, 1.3));
    this.scroll.position.set(1.5, EYE + 0.55, -3.6);
    this.scroll.lookAt(0, EYE + 0.55, 0);
    this.writer = new ScrollWriter(this, this.scroll);
  }

  async start() {
    const { ctx } = this;
    const { audio, input, fader, haze } = ctx;
    const M = ctx.content.MYTHS.sirens;

    // Their song, from the rocks (two singers, slightly apart).
    this.songs = [];
    for (const [src, delay, rate] of [[this.climbing, 0, 1], [this.roped, 0.35, 1.003]]) {
      if (!src) continue;
      this.wait(delay).then(async () => {
        const a = await this.sound('siren-song', { parent: src, loop: true, volume: 0, refDistance: 3 });
        if (a.source) a.source.playbackRate.value = rate;
        audio.fade(a, 0.9, 3);
        this.songs.push(a);
      });
    }
    this.tween(4, (k) => (this.songGlow.material.opacity = 0.35 * k));
    await this.wait(2.5);
    await this.writer.say(M.song, { source: M.source, hold: 3 });

    // The ship rows past. Ulysses strains at the mast; it does not stop.
    this.rowing = true;
    const x0 = this.ship.position.x;
    this.tween(34, (k) => (this.ship.position.x = lerp(x0, 44, k)));
    await this.wait(10);
    this.straining = true;
    await this.writer.say(M.fate, { source: M.fateSource, hold: 3 });
    await this.writer.hide();

    // Look at the ship as it leaves — and become the one it leaves behind.
    let chosen = false;
    input.add(this.shipHit, { onSelect: () => (chosen = true), dwell: 1.2 });
    await this.until(() => chosen, 8);
    input.remove(this.shipHit);

    // ---- you are a Siren ----
    await fader.fade(1, 0.7, '#0c1a20');
    this.climbing && (this.climbing.visible = false);
    this.myRock.visible = true;
    this.world.position.y = -2.2; // you stand on your rock now
    this.me.visible = true;
    for (const s of this.songs) audio.fade(s, 0, 0.5);
    this.mine = await this.sound('siren-song', { loop: true, volume: 0 });
    audio.fade(this.mine, 1, 1.5);
    await fader.fade(0, 1.4);

    // You sing to him; he sails on; your voice breaks.
    for (const h of this.myHands) h.targetCurl = 0.1;
    await this.wait(3);
    await this.tween(
      5,
      (k) => {
        if (this.mine.source) this.mine.source.playbackRate.value = 1 - 0.25 * k + Math.sin(k * 40) * 0.02 * k;
        const f = this.mine.getFilter && this.mine.getFilter();
        if (f) f.frequency.value = 6000 - 5400 * k;
        this.mine.gain.gain.value = 1 - 0.7 * k;
        for (const h of this.myHands) h.targetCurl = 0.1 + 0.8 * k;
      },
      ease.in,
    );

    // You fall into the sea, and become stone.
    audio.fade(this.mine, 0, 1.2);
    const y0 = this.world.position.y;
    await this.tween(2.2, (k) => (this.world.position.y = lerp(y0, 1.6, k * k)), ease.in);
    haze.set({ color: UNDERWATER, amount: 0.7 });
    ctx.scene.background = new THREE.Color(UNDERWATER);
    ctx.scene.fog.color.set(UNDERWATER);
    ctx.scene.fog.near = 1;
    ctx.scene.fog.far = 14;
    const stone = new THREE.Color('#8b857c');
    await this.tween(4, (k) => {
      for (const h of this.myHands) {
        h.skinMat.color.lerp(stone, k * 0.2);
        h.skinMat.userData.rim.rimStrength.value = 0.3 * (1 - k);
        h.skinMat.userData.rim.hatchScale.value = 190 - 120 * k; // stone: coarser, chiselled lines
        h.position.y -= 0.004;
      }
    });
    await this.wait(1.5);
    this.next('orpheus', {}, { color: '#000000', out: 2.5, in: 2 });
  }

  onSelectNothing() {}

  update(dt, t) {
    super.update(dt, t);
    this.skyU.time.value = t;
    this.seaU.time.value = t;
    this.seaU.travel.value = t * 0.6;
    this.seaU.seaLevel.value = this.world.position.y;

    // the Sirens sway; the climbing pair rise and fall with the swell
    for (const s of this.sirens) {
      const u = s.userData;
      s.position.y = u.base.y + Math.sin(t * 0.8 + u.phase) * 0.06;
      s.rotation.z = Math.sin(t * 0.5 + u.phase) * 0.02;
    }
    // the bird-Sirens circle, always turned toward you
    for (const h of this.harpies) {
      const u = h.userData;
      const a = u.angle + t * u.speed;
      h.position.set(Math.sin(a) * u.radius, u.height + Math.sin(t * 0.9 + a) * 0.25, -Math.cos(a) * u.radius - 4);
      h.lookAt(0, h.position.y, 0);
    }
    this.songGlow.material.opacity *= 1;

    // the ship: oars sweep, the sail breathes, Ulysses strains
    if (this.rowing) {
      for (const o of this.oars) {
        const s = o.userData.side;
        const c = t * 1.6 + o.userData.phase;
        o.rotation.set(s * (1.0 + Math.sin(c) * 0.12), 0, Math.cos(c) * 0.35);
      }
      this.ship.position.y = Math.sin(t * 0.7) * 0.12;
      this.ship.rotation.z = Math.sin(t * 0.6) * 0.02;
    }
    if (this.ulysses) {
      const pull = this.straining ? 0.06 : 0.015;
      this.ulysses.rotation.z = Math.sin(t * 5.5) * pull;
    }
    for (const h of this.myHands) h.update(t, dt);
  }
}
