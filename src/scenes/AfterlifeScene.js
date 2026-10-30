import * as THREE from 'three';
import { BaseScene } from '../core/SceneManager.js';
import { ease, lerp, glowTexture } from '../core/util.js';
import { softMaterial, paintedTexture } from '../core/look.js';
import { engravedSea } from '../core/engraved.js';
import { loadArt, cutout, cartouche, ScrollWriter } from '../core/collage.js';
import { lyre } from '../core/synth.js';
import { GiantHand } from './nursery.js';

// Scene 10 — the afterlife. After the end of a life, you cross the Styx in Charon's boat
// (Virgil, Aeneid VI) through Patinir's river world (c. 1520): pay the obol; pass Böcklin's
// Isle of the Dead in the mist; Blake's Cerberus bays from the far bank; the meadow of
// asphodel where the shades drift (Odyssey XXIV); then Elysium, Schwabe's fields, where the
// Thracian priest — Orpheus — still plays. At the river Lethe you cup the water in your
// hands and drink, and forget all things (Plato, Myth of Er), and are born again.
//
// Comfort: the rig never moves. The boat is still; the world glides past it.

const SEAT = 1.15; // eye height, seated in the boat
const STYX = new THREE.Color('#1c2a31');
const ELYSIUM = new THREE.Color('#e9dfbd');

/** A small open boat around you: a hollow hull pinched at bow and stern, a rim, two thwarts. */
function buildBoat() {
  const g = new THREE.Group();
  const wood = softMaterial({ color: '#5a4430', rim: '#e0cfa8', rimStrength: 0.3, hatch: 60, side: THREE.DoubleSide });
  const dark = softMaterial({ color: '#2f2419', rim: '#c9b896', rimStrength: 0.15, hatch: 0, side: THREE.DoubleSide });
  const L = 4.8;
  // the lower half of a tube, pinched at the ends: a hollow hull
  const geo = new THREE.CylinderGeometry(0.72, 0.72, L, 40, 24, true, -Math.PI / 2, Math.PI); // the lower half
  geo.rotateX(Math.PI / 2); // axis along Z
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const u = Math.abs(z) / (L / 2);
    const pinch = 1 - Math.pow(u, 2.2) * 0.92;
    p.setX(i, p.getX(i) * pinch);
    p.setY(i, p.getY(i) * (0.55 + 0.45 * pinch) + Math.pow(u, 3) * 0.35); // the ends lift
  }
  geo.computeVertexNormals();
  const hull = new THREE.Mesh(geo, wood);
  g.add(hull);
  // the rim (gunwale) along both sides
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const z = -L / 2 + (i / 24) * L;
      const u = Math.abs(z) / (L / 2);
      const pinch = 1 - Math.pow(u, 2.2) * 0.92;
      pts.push(new THREE.Vector3(side * 0.72 * pinch, Math.pow(u, 3) * 0.35, z));
    }
    const rim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.035, 8), dark);
    g.add(rim);
  }
  // floor boards and thwarts
  const boards = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 3.6), dark);
  boards.rotation.x = -Math.PI / 2;
  boards.position.y = -0.55;
  g.add(boards);
  for (const z of [-1.2, 0.9]) {
    const thwart = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.05, 0.22), wood);
    thwart.position.set(0, -0.12, z);
    g.add(thwart);
  }
  g.position.y = 0.78; // the rim sits below your eye; the keel rides just above the water
  g.traverse((o) => (o.raycast = () => {}));
  return g;
}

/** An asphodel: a pale star of six petals on a stem. */
function asphodelTexture() {
  return paintedTexture(64, 128, (c, w, h) => {
    c.strokeStyle = 'rgba(120,130,100,0.9)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(w / 2, h);
    c.lineTo(w / 2, h * 0.35);
    c.stroke();
    for (let k = 0; k < 3; k++) {
      const cy = h * (0.12 + k * 0.1);
      c.fillStyle = 'rgba(244,240,228,0.95)';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        c.beginPath();
        c.ellipse(w / 2 + Math.cos(a) * 7, cy + Math.sin(a) * 5, 6, 3, a, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = 'rgba(200,160,120,0.9)';
      c.beginPath();
      c.arc(w / 2, cy, 2, 0, Math.PI * 2);
      c.fill();
    }
  });
}

/** An Athenian silver obol: owl on one side (painted). */
function obolTexture() {
  return paintedTexture(128, 128, (c, w, h) => {
    const g = c.createRadialGradient(w * 0.4, h * 0.4, 5, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#f2e6c0');
    g.addColorStop(1, '#a8925a');
    c.fillStyle = g;
    c.beginPath();
    c.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(70,52,24,0.85)';
    c.lineWidth = 3;
    c.beginPath(); // the owl: body, eyes, ears
    c.ellipse(w / 2, h * 0.58, 20, 28, 0, 0, Math.PI * 2);
    c.stroke();
    for (const dx of [-9, 9]) {
      c.beginPath();
      c.arc(w / 2 + dx, h * 0.42, 7, 0, Math.PI * 2);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(w / 2 - 15, h * 0.32);
    c.lineTo(w / 2 - 9, h * 0.38);
    c.moveTo(w / 2 + 15, h * 0.32);
    c.lineTo(w / 2 + 9, h * 0.38);
    c.stroke();
  });
}

export class AfterlifeScene extends BaseScene {
  skipTo = 'finale';

  async enter(params = {}) {
    const { ctx } = this;
    this.ending = params.ending || 'hold';
    this.skipParams = { ending: this.ending };
    ctx.rig.position.set(0, SEAT, 0);
    ctx.look.reset(0, -0.05);
    ctx.scene.background = STYX.clone();
    ctx.scene.fog = new THREE.Fog(STYX.clone(), 12, 70);
    ctx.grain.set({ grain: 0.06, vignette: 0.45, color: '#06090a' });
    ctx.audio.define('lyre', () => lyre());
    this.travel = 0;
    this.speed = 0;
    this.light = 0; // 0 = Styx, 1 = Elysium

    const [T] = await Promise.all([
      loadArt('afterlife', ['styx-band', 'isle', 'cerberus', 'elysium-lyre', 'elysium-meadow']),
      ctx.audio.preload(['lyre', 'moonlight']),
    ]);

    // ---------- Patinir's river world, all around the horizon ----------
    if (T['styx-band']) {
      T['styx-band'].wrapS = THREE.MirroredRepeatWrapping;
      T['styx-band'].repeat.set(3, 1);
      this.bandMat = new THREE.MeshBasicMaterial({ map: T['styx-band'], side: THREE.BackSide, fog: false, color: '#5d6870' });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 46, 120, 1, true), this.bandMat);
      band.position.y = 12;
      band.renderOrder = -1;
      band.raycast = () => {};
      this.add(band);
    }
    this.skyMat = new THREE.MeshBasicMaterial({ color: '#3a4a56', side: THREE.BackSide, fog: false });
    this.skyDark = new THREE.Color('#3a4a56');
    this.skyLight = new THREE.Color('#dde4e6');
    const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), this.skyMat);
    sky.renderOrder = -2;
    sky.raycast = () => {};
    this.add(sky);

    // ---------- the river, gliding past ----------
    this.world = this.add(new THREE.Group());
    const sea = engravedSea({ deep: '#0f2229', crest: '#2d5a5e', swell: 0.35, lines: 3.2, ink: 0.3, fogColor: STYX.clone(), fogNear: 12, fogFar: 70 });
    this.seaU = sea.u;
    this.add(sea.mesh); // the water itself does not move; its lines scroll

    // Böcklin's Isle of the Dead, an apparition in the mist ahead
    if (T.isle) {
      const isle = cutout(T.isle, 13);
      isle.material.depthWrite = false;
      isle.material.fog = true;
      isle.position.set(6, -1.2, -55);
      isle.lookAt(0, 4, 0);
      this.world.add(isle);
    }

    // Blake's Cerberus, baying on the far bank, framed in dark stone
    const bankMat = softMaterial({ color: '#343a2c', rim: '#cfc6a8', rimStrength: 0.25, hatch: 0, umber: '#15170f' });
    const bank = (side, z0, z1, mat = bankMat) => {
      const len = z1 - z0;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, len, 24, 1), mat);
      b.rotation.x = Math.PI / 2;
      b.scale.set(2.2, 1, 0.7);
      b.position.set(side * 6.8, -0.1, (z0 + z1) / 2);
      b.raycast = () => {};
      this.world.add(b);
      return b;
    };
    bank(1, -48, -28);
    if (T.cerberus) {
      const cer = cutout(T.cerberus, 3.6);
      cer.position.set(5.6, 0.5, -38);
      cer.lookAt(0, 2, 0);
      const stone = softMaterial({ color: '#5c574b', rim: '#e0d6b8', rimStrength: 0.4, hatch: 30 });
      const [w, h] = cer.userData.size;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 10, 72), stone);
      ring.scale.set(w * 0.97, h * 0.97, 1);
      ring.position.y = h / 2;
      cer.add(ring);
      this.world.add(cer);
      this.cerberusZ = -38;
    }

    // the meadow of asphodel: pale flowers on both banks, the shades drifting among them
    const asphMat = bankMat.clone();
    bank(-1, -100, -55, asphMat);
    bank(1, -100, -55, asphMat);
    const flowerTex = asphodelTexture();
    const flowers = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.35, 0.7),
      new THREE.MeshBasicMaterial({ map: flowerTex, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide }),
      420,
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < 420; i++) {
      const side = i % 2 ? 1 : -1;
      const z = -55 - Math.random() * 45;
      const x = side * (5.0 + Math.random() * 3.4);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
      m.compose(new THREE.Vector3(x, 0.55 + Math.random() * 0.15, z), q, new THREE.Vector3(1, 0.8 + Math.random() * 0.6, 1));
      flowers.setMatrixAt(i, m);
    }
    flowers.raycast = () => {};
    this.world.add(flowers);
    this.shades = [];
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#dfe6ea', transparent: true, opacity: 0.35, depthWrite: false }));
      const side = i % 2 ? 1 : -1;
      s.position.set(side * (5.5 + Math.random() * 3), 1.2 + Math.random() * 0.5, -58 - Math.random() * 40);
      s.scale.set(0.6, 1.7, 1);
      s.userData = { base: s.position.clone(), phase: Math.random() * 6 };
      this.world.add(s);
      this.shades.push(s);
    }

    // Elysium: Schwabe's meadow on both banks, and the figure with the lyre
    let elyMat = bankMat;
    if (T['elysium-meadow']) {
      T['elysium-meadow'].wrapS = T['elysium-meadow'].wrapT = THREE.RepeatWrapping;
      T['elysium-meadow'].repeat.set(4, 12);
      elyMat = new THREE.MeshLambertMaterial({ map: T['elysium-meadow'] });
    }
    bank(-1, -150, -102, elyMat);
    bank(1, -150, -102, elyMat);
    if (T['elysium-lyre']) {
      this.lyreFig = cutout(T['elysium-lyre'], 3.2);
      this.lyreFig.position.set(-5.4, 0.45, -118);
      this.lyreFig.lookAt(0, 2, 0);
      this.world.add(this.lyreFig);
    }
    this.lethe = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#eaf4ff', transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.lethe.position.set(0, 0.3, -1.2);
    this.lethe.scale.set(3, 0.8, 1);
    this.add(this.lethe);

    // ---------- the boat, Charon, your hands ----------
    this.add(buildBoat());
    this.pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 4.2, 10), softMaterial({ color: '#3b2c1f', rim: '#d9c7a0', rimStrength: 0.3, hatch: 40 }));
    this.pole.position.set(0.65, 0.8, 1.6);
    this.add(this.pole);
    this.charonHand = new GiantHand({ side: 1, skin: '#a59a86', sleeve: '#2a2622', scale: 1.15 });
    this.charonHand.visible = true;
    this.charonHand.targetCurl = 0.85;
    this.add(this.charonHand);
    this.myHands = [-1, 1].map((side) => {
      const h = new GiantHand({ side, skin: '#d8b79c', sleeve: '#e6e0d4', scale: 1.0 });
      h.visible = false;
      this.add(h);
      return h;
    });
    this.obol = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.006, 32), [
      softMaterial({ color: '#b9a46a', rim: '#fff3c8', rimStrength: 0.7, hatch: 0 }),
      new THREE.MeshLambertMaterial({ map: obolTexture() }),
      new THREE.MeshLambertMaterial({ map: obolTexture() }),
    ]);
    this.obol.visible = false;
    this.add(this.obol);
    this.obolHit = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.obol.add(this.obolHit);

    // stars that shoot to their birth
    this.STARS = 140;
    this.starPos = new Float32Array(this.STARS * 3);
    this.stars = Array.from({ length: this.STARS }, () => ({ x: (Math.random() - 0.5) * 30, y: Math.random() * 6, z: -Math.random() * 30 - 4, v: 6 + Math.random() * 10 }));
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.starPos, 3));
    this.starPts = new THREE.Points(sg, new THREE.PointsMaterial({ map: glowTexture(), color: '#fff4dc', size: 0.25, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.starPts.frustumCulled = false;
    this.add(this.starPts);

    this.hemi = new THREE.HemisphereLight('#c6d0d4', '#141a1c', 1.0);
    this.sun = new THREE.DirectionalLight('#fff0d0', 0.6);
    this.sun.position.set(-4, 10, -6);
    this.root.add(this.hemi, this.sun);

    this.scroll = this.add(cartouche(3.2, 1.25));
    this.scroll.position.set(-1.7, SEAT + 0.65, -3.4);
    this.scroll.lookAt(0, SEAT + 0.65, 0);
    this.writer = new ScrollWriter(this, this.scroll);
  }

  async start() {
    const { ctx } = this;
    const { audio, input } = ctx;
    const A = ctx.content.MYTHS.afterlife;
    audio.playMusic('moonlight', { volume: 0.25, fade: 6, cutoff: 900 });

    // Charon. The obol is in your hand.
    await this.wait(1.2);
    await this.writer.say(A.charon, { source: A.sources.charon, hold: 2 });
    const left = this.myHands[0];
    left.visible = true;
    left.position.set(-0.05, SEAT - 0.35, -0.5);
    left.rotation.set(-Math.PI / 2 + 0.25, 0, 0.2); // palm up, fingers forward: offered
    left.targetCurl = 0.25;
    this.obol.visible = true;
    this.obol.position.set(-0.03, SEAT - 0.27, -0.42);
    this.paying = true;
    let paid = false;
    input.add(this.obolHit, { onSelect: () => (paid = true), dwell: 1.0 });
    await this.until(() => paid, 7);
    input.remove(this.obolHit);
    // his hand comes for it
    this.paying = false;
    this.handBusy = true;
    const h0 = this.charonHand.position.clone();
    const take = new THREE.Vector3(0.05, SEAT - 0.18, -0.4);
    await this.tween(1.4, (k) => this.charonHand.position.lerpVectors(h0, take, k), ease.inOut);
    this.charonHand.attach(this.obol);
    this.charonHand.targetCurl = 1;
    left.visible = false;
    await this.tween(1.4, (k) => this.charonHand.position.lerpVectors(take, h0, k), ease.inOut);
    this.obol.visible = false;
    this.handBusy = false;

    // The crossing.
    this.rowing = true;
    this.tween(3, (k) => (this.speed = 2.6 * k));
    await this.wait(4);
    await this.until(() => this.travel > 30, 14);
    this.writer.say(A.cerberus, { source: A.sources.charon, hold: 2 });
    this.growl();
    await this.until(() => this.travel > 56, 16);
    await this.writer.say(A.asphodel, { source: A.sources.asphodel, hold: 2.5 });
    await this.until(() => this.travel > 96, 18);

    // Elysium: the light comes up; the lyre again, far off.
    this.tween(8, (k) => (this.light = k), ease.inOut);
    this.lyreSound = await this.sound('lyre', { parent: this.lyreFig || this.root, loop: true, volume: 0, refDistance: 6 });
    audio.fade(this.lyreSound, 0.9, 4);
    await this.writer.say(A.elysium, { source: A.sources.charon, hold: 2 });
    await this.writer.say(A.orpheus, { hold: 2 });

    // Lethe. The boat comes to rest; you cup the water and drink.
    this.tween(4, (k) => (this.speed = 2.6 * (1 - k)), ease.out);
    await this.writer.say(A.lethe, { source: A.sources.charon, hold: 2 });
    this.rowing = false;
    for (const [h, side] of this.myHands.map((h, i) => [h, i ? 1 : -1])) {
      h.visible = true;
      h.position.set(0.07 * side, SEAT - 0.7, -0.6);
      h.rotation.set(-Math.PI / 2 + 0.3, 0, -0.35 * side); // palms up, tipped together: a cup
      h.targetCurl = 0.45;
    }
    this.tween(1.5, (k) => (this.lethe.material.opacity = 0.7 * k));
    await this.writer.say(A.er, { source: A.sources.er, hold: 1.5 });
    // the hands rise to your lips
    const y0 = this.myHands[0].position.y;
    await this.tween(2.5, (k) => {
      for (const h of this.myHands) {
        h.position.y = lerp(y0, SEAT - 0.25, k);
        h.position.z = lerp(-0.6, -0.3, k);
      }
      this.lethe.position.y = lerp(0.3, SEAT - 0.2, k);
      this.lethe.scale.set(lerp(3, 0.4, k), lerp(0.8, 0.25, k), 1);
    }, ease.inOut);

    // You forget; you are born.
    audio.fade(this.lyreSound, 0, 2);
    audio.fadeMusic(0, 3);
    this.tween(3, (k) => (this.starPts.material.opacity = k));
    this.shooting = true;
    await this.writer.say(A.birth, { source: A.sources.er, hold: 1.2 });
    this.next('finale', { ending: this.ending }, { color: '#ffffff', out: 2.5, in: 2 });
  }

  /** Three heads baying, under the music. */
  growl() {
    const { audio } = this.ctx;
    const ctx = audio.ctx;
    const t0 = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(70 + i * 18, t0 + i * 0.35);
      o.frequency.exponentialRampToValueAtTime(42 + i * 9, t0 + i * 0.35 + 1.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + i * 0.35);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + i * 0.35 + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.35 + 1.4);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      o.connect(lp).connect(g).connect(audio.listener.getInput());
      o.start(t0 + i * 0.35);
      o.stop(t0 + i * 0.35 + 1.5);
    }
  }

  onSelectNothing() {}

  update(dt, t) {
    super.update(dt, t);
    this.travel += this.speed * dt;
    this.world.position.z = this.travel;
    this.seaU.time.value = t;
    this.seaU.travel.value = this.travel;

    // the dark of the Styx gives way to the gold of Elysium
    const c = STYX.clone().lerp(ELYSIUM, this.light);
    this.ctx.scene.fog.color.copy(c);
    this.ctx.scene.background.copy(c);
    this.skyMat.color.copy(this.skyDark).lerp(this.skyLight, this.light);
    this.seaU.fogColor.value.copy(c);
    if (this.bandMat) this.bandMat.color.setScalar(lerp(0.55, 1.0, this.light));
    this.hemi.intensity = lerp(1.0, 1.8, this.light);
    this.sun.intensity = lerp(0.6, 1.6, this.light);

    // Charon poles the boat: the pole dips and pushes, his hand on it
    const stroke = this.rowing ? Math.sin(t * 1.4) : 0;
    this.pole.rotation.set(-0.35 + stroke * 0.15, 0, 0.12);
    if (!this.handBusy) {
      // his hand rides the pole (except while it reaches for the coin)
      this.charonHand.position.set(0.62, SEAT + 0.15 + stroke * 0.12, 1.2);
      this.charonHand.rotation.set(0.2, -0.4, 0.3);
    }
    this.charonHand.update(t, dt);
    for (const h of this.myHands) h.update(t, dt);
    if (this.obol.visible && this.obol.parent === this.root) this.obol.rotation.z = Math.sin(t * 2) * 0.05;

    for (const s of this.shades) {
      s.position.y = s.userData.base.y + Math.sin(t * 0.6 + s.userData.phase) * 0.15;
      s.material.opacity = 0.25 + Math.sin(t * 0.4 + s.userData.phase) * 0.12;
    }

    if (this.shooting) {
      this.stars.forEach((s, i) => {
        s.y += s.v * dt;
        if (s.y > 30) s.y = 0;
        this.starPos.set([s.x, s.y, s.z], i * 3);
      });
      this.starPts.geometry.attributes.position.needsUpdate = true;
    }
  }
}
