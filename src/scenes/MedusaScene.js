import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { BaseScene } from '../core/SceneManager.js';
import { ease, lerp, glowTexture } from '../core/util.js';
import { softMaterial, lightShaftMaterial, bindShaft, paintedTexture } from '../core/look.js';
import { loadArt, cutout, cartouche, ScrollWriter, groundShadow } from '../core/collage.js';
import { loadMarble, marbleMaterial } from '../core/marble.js';
import { GiantHand } from './nursery.js';
import { thump } from '../core/synth.js';

// Scene 6 — Medusa (Ovid, Metamorphoses IV). A past life, through sight.
//
// The Gorgons' grotto at the edge of the world. Around you stand statues — the figures
// of your earlier lives, turned to marble (the Graces, Mercury, Icarus, a Siren, Orpheus).
// Burne-Jones's "Baleful Head" hangs on the rock like an altarpiece. Out of the dark comes
// a polished shield held by an armoured hand: Perseus, who looks only at reflections.
// In its bronze is Caravaggio's Medusa — and it is you. You turn to stone. The shield is lowered, the
// light finds what stood behind it all along: Canova's Perseus (a real scan, 1804–06), lifting your head.
// (Ovid has Perseus behead her; meeting her own gaze is our retelling.)

const EYE = 1.6;
const DARK = new THREE.Color('#0e0d0c');
// Canova's Perseus: one more statue in the grotto until the light finds him. He faces you, and holds the head
// out toward the middle of your view. `head` is the Gorgon's head on the mesh, in metres; `dim` and `lit` his stone.
const PERSEUS = { x: -0.5, z: -5.8, turn: THREE.MathUtils.degToRad(100), scale: 1.25, plinth: 0.3, head: new THREE.Vector3(0.02, 2.16, 0.87), dim: new THREE.Color('#928d84'), lit: new THREE.Color('#fff4e2').multiplyScalar(1.2) };

/** Branching cracks, white on transparent: what stone looks like from inside. */
function crackTexture() {
  return paintedTexture(1024, 512, (c, w, h) => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    c.strokeStyle = 'rgba(28,24,20,0.95)';
    c.lineCap = 'round';
    const branch = (x, y, a, len, width, depth) => {
      if (depth <= 0 || width < 0.4) return;
      let px = x;
      let py = y;
      c.lineWidth = width;
      c.beginPath();
      c.moveTo(px, py);
      const steps = 6 + Math.floor(rnd() * 6);
      for (let i = 0; i < steps; i++) {
        a += (rnd() - 0.5) * 0.7;
        px += Math.cos(a) * (len / steps);
        py += Math.sin(a) * (len / steps);
        c.lineTo(px, py);
      }
      c.stroke();
      branch(px, py, a + 0.5 + rnd() * 0.4, len * 0.7, width * 0.65, depth - 1);
      if (rnd() < 0.7) branch(px, py, a - 0.5 - rnd() * 0.4, len * 0.6, width * 0.6, depth - 1);
    };
    for (let i = 0; i < 9; i++) {
      const edge = i % 4;
      const x = edge === 0 ? 0 : edge === 1 ? w : rnd() * w;
      const y = edge === 2 ? 0 : edge === 3 ? h : rnd() * h;
      branch(x, y, Math.atan2(h / 2 - y, w / 2 - x) + (rnd() - 0.5) * 0.6, 220 + rnd() * 140, 6, 5);
    }
  });
}

/** Low grinding of stone settling, rendered once. */
function stoneSound() {
  const secs = 5;
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Ctx(1, 44100 * secs, 44100);
  const buf = ctx.createBuffer(1, 44100 * secs, 44100);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.02 ? 1 : 0.35); // grit
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, 0);
  lp.frequency.exponentialRampToValueAtTime(140, secs);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.9, 0.8);
  g.gain.setValueAtTime(0.9, secs - 1.5);
  g.gain.exponentialRampToValueAtTime(0.001, secs);
  src.connect(lp).connect(g).connect(ctx.destination);
  src.start(0);
  return ctx.startRendering();
}

/** The grotto: an inside-out boulder, weathered, engraved. */
function grottoGeometry() {
  const g = mergeVertices(new THREE.IcosahedronGeometry(14, 5));
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 0.45) * Math.sin(v.y * 0.6 + 1.3) * Math.sin(v.z * 0.5 + 2.1);
    v.multiplyScalar(1 + n * 0.12 + Math.sin(v.y * 1.7 + v.x) * 0.03);
    if (v.y < 0) v.y *= 0.2; // a floor, not a bowl
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export class MedusaScene extends BaseScene {
  skipTo = 'persephone';

  async enter() {
    const { ctx } = this;
    ctx.rig.position.set(0, EYE, 0);
    ctx.look.reset(0, 0.02);
    ctx.scene.background = DARK.clone();
    ctx.scene.fog = new THREE.Fog(DARK.clone(), 8, 28);
    ctx.grain.set({ grain: 0.06, vignette: 0.5, color: '#050404' });
    ctx.audio.define('stone', stoneSound);
    ctx.audio.define('thump', () => thump()); // footsteps of the unseen hero

    const [T, perseusGeo] = await Promise.all([
      loadArt('medusa', ['shield', 'baleful-head', 'stone-graces', 'stone-mercury', 'stone-icarus', 'stone-siren', 'stone-orpheus']),
      loadMarble('art/scans/perseus.bin'),
      ctx.audio.preload(['stone', 'thump', 'ninth']),
    ]);

    // ---------- the grotto ----------
    // stone: dark at the vault, paler where the light from the roof lands; no engraving rings
    const caveGeo = grottoGeometry();
    {
      const p = caveGeo.attributes.position;
      const cols = new Float32Array(p.count * 3);
      const low = new THREE.Color('#6b6153');
      const high = new THREE.Color('#2a251f');
      const lit = new THREE.Color('#a39985');
      const c = new THREE.Color();
      const v = new THREE.Vector3();
      const pools = [new THREE.Vector3(-2.5, -1, -5), new THREE.Vector3(3, -1, -3), new THREE.Vector3(0.5, -1, -8)];
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        c.copy(low).lerp(high, THREE.MathUtils.smoothstep(v.y, -1, 9));
        for (const q of pools) c.lerp(lit, Math.max(0, 1 - v.distanceTo(q) / 5.5) ** 2 * 0.8);
        cols.set([c.r, c.g, c.b], i * 3);
      }
      caveGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    }
    const rock = softMaterial({ color: '#ffffff', vertexColors: true, rim: '#c9c2b0', rimStrength: 0.15, hatch: 0, side: THREE.BackSide, umber: '#120f0c' });
    const cave = new THREE.Mesh(caveGeo, rock);
    cave.raycast = () => {};
    this.add(cave);

    // cold light falls through cracks in the roof
    this.shafts = [];
    for (const [x, z, r] of [[-2.5, -5, 0.8], [3, -3, 0.6], [0.5, -8, 1.0]]) {
      const geo = new THREE.CylinderGeometry(r * 0.4, r, 12, 24, 1, true);
      geo.translate(0, -6, 0);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, 0.5);
      const s = bindShaft(new THREE.Mesh(geo, lightShaftMaterial('#dce8ef', 0.38)));
      s.position.set(x, 11, z);
      this.add(s);
      this.shafts.push(s);
    }
    this.motes = [];
    const moteGeo = new THREE.BufferGeometry();
    this.motePos = new Float32Array(180 * 3);
    moteGeo.setAttribute('position', new THREE.BufferAttribute(this.motePos, 3));
    for (let i = 0; i < 180; i++) {
      const s = this.shafts[i % 3];
      this.motes.push({ x: s.position.x, z: s.position.z, r: Math.random() * 0.7, a: Math.random() * 6.3, y: Math.random() * 7, sp: 0.05 + Math.random() * 0.12 });
    }
    this.moteMesh = new THREE.Points(
      moteGeo,
      new THREE.PointsMaterial({ map: glowTexture(), color: '#e8f0f4', size: 0.05, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    );
    this.moteMesh.frustumCulled = false;
    this.moteMesh.raycast = () => {};
    this.add(this.moteMesh);

    // statues: the earlier lives, turned to marble, each on a plinth in its pool of light
    const plinthMat = softMaterial({ color: '#b3ab9d', rim: '#eeeae0', rimStrength: 0.35, hatch: 14, umber: '#4a443c' });
    const statue = (tex, h, angleDeg, dist, rotZ = 0) => {
      if (!tex) return;
      const g = new THREE.Group();
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.5, 24), plinthMat);
      plinth.position.y = 0.25;
      const fig = cutout(tex, h);
      fig.position.y = 0.5;
      fig.rotation.z = rotZ;
      const pool = new THREE.Mesh(
        new THREE.CircleGeometry(1.1, 32),
        new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#b9c6cc', transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = 0.02;
      g.add(plinth, fig, pool);
      const a = THREE.MathUtils.degToRad(angleDeg);
      g.position.set(Math.sin(a) * dist, 0, -Math.cos(a) * dist);
      g.lookAt(0, 0, 0);
      g.traverse((o) => (o.raycast = () => {}));
      this.add(g);
    };
    statue(T['stone-graces'], 1.9, -55, 5.2);
    statue(T['stone-mercury'], 1.9, -88, 5.6);
    statue(T['stone-icarus'], 1.4, 62, 5.0);
    statue(T['stone-siren'], 1.6, 95, 5.4);
    statue(T['stone-orpheus'], 1.9, 30, 6.4);

    // Burne-Jones's "Baleful Head", an altarpiece in the rock
    if (T['baleful-head']) {
      const img = T['baleful-head'].image;
      const w = 2.4;
      const h = w * (img.height / img.width);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: T['baleful-head'], color: '#cfc7b6' }));
      panel.position.set(-3.2, 1.9, -7.4);
      panel.lookAt(0, 1.9, 0);
      const gilt = softMaterial({ color: '#b28c3f', rim: '#ffecb8', rimStrength: 0.7, hatch: 0 });
      const t = 0.09;
      for (const [fw, fh, x, y] of [[w + 2 * t, t, 0, h / 2 + t / 2], [w + 2 * t, t, 0, -h / 2 - t / 2], [t, h, w / 2 + t / 2, 0], [t, h, -w / 2 - t / 2, 0]]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.06), gilt);
        bar.position.set(x, y, 0.025);
        panel.add(bar);
      }
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#d9c49a', transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.set(w * 2, h * 1.6, 1);
      glow.position.z = -0.05;
      panel.add(glow);
      panel.raycast = () => {};
      this.add(panel);
    }

    // ---------- Perseus: there all along, in the dark behind the shield ----------
    if (perseusGeo) {
      this.perseus = new THREE.Group();
      this.perseus.position.set(PERSEUS.x, 0, PERSEUS.z);
      this.perseus.rotation.y = PERSEUS.turn;
      this.perseus.scale.setScalar(PERSEUS.scale);
      this.perseusStone = marbleMaterial({ color: '#000000', through: '#d9c9a8', shadow: '#10141a' });
      this.perseusStone.color.copy(PERSEUS.dim);
      this.perseusStone.userData.marble.heartColor.value.set('#ffd9a0');
      const fig = new THREE.Mesh(perseusGeo, this.perseusStone);
      fig.position.y = PERSEUS.plinth - 0.03;
      fig.frustumCulled = false;
      this.perseusPlinth = softMaterial({ color: '#b3ab9d', rim: '#eeeae0', rimStrength: 0.2, hatch: 14, umber: '#4a443c' });
      this.perseusPlinth.color.multiplyScalar(0.4);
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.05, PERSEUS.plinth, 32), this.perseusPlinth);
      plinth.scale.set(0.72, 1, 0.72);
      plinth.position.y = PERSEUS.plinth / 2;
      this.perseus.add(fig, plinth);
      this.perseus.traverse((o) => (o.raycast = () => {}));
      this.add(this.perseus);
      this.perseus.updateWorldMatrix(true, false);
      const heart = this.perseus.localToWorld(PERSEUS.head.clone().setY(PERSEUS.head.y + PERSEUS.plinth));
      this.perseusStone.userData.marble.heart.value.set(heart.x, heart.y, heart.z, 0);
      const shadow = groundShadow(2.6);
      shadow.position.set(PERSEUS.x, 0.012, PERSEUS.z);
      this.add(shadow);
      const shaftGeo = new THREE.CylinderGeometry(0.55, 1.3, 12, 24, 1, true);
      shaftGeo.translate(0, -6, 0);
      const uv = shaftGeo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, 0.5);
      this.perseusShaft = bindShaft(new THREE.Mesh(shaftGeo, lightShaftMaterial('#dce8ef', 0.38)));
      this.perseusShaft.position.set(PERSEUS.x, 11, PERSEUS.z);
      this.perseusShaft.material.opacity = 0;
      this.perseusShaft.visible = false;
      this.add(this.perseusShaft);
    }

    // ---------- the shield, held out of the dark ----------
    this.shield = new THREE.Group();
    const rimMat = softMaterial({ color: '#9b7b3a', rim: '#fff0c0', rimStrength: 0.8, hatch: 50 });
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 64), rimMat);
    back.rotation.x = Math.PI / 2;
    back.position.z = -0.03;
    const rimRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 12, 64), rimMat);
    this.shield.add(back, rimRing);
    if (T.shield) {
      this.face = new THREE.Mesh(new THREE.CircleGeometry(0.6, 64), new THREE.MeshBasicMaterial({ map: T.shield, color: '#d9d2c2' }));
      this.face.position.z = 0.002;
      this.shield.add(this.face);
    }
    // a gleam that slides across the polished bronze
    this.gleam = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#fff3d6', transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.gleam.scale.setScalar(0.5);
    this.gleam.position.z = 0.02;
    this.shield.add(this.gleam);
    this.perseusHand = new GiantHand({ side: -1, skin: '#c9926a', sleeve: '#7c858f', scale: 1.4 });
    this.perseusHand.visible = true;
    this.perseusHand.targetCurl = 0.8;
    // his hand grips the rim from behind; the arm reaches back into the dark
    this.perseusHand.position.set(-0.64, -0.05, -0.12);
    this.perseusHand.rotation.set(Math.PI / 2, 0, 0.35);
    this.shield.add(this.perseusHand);
    this.shield.position.set(1.2, EYE + 0.1, -11);
    this.shield.traverse((o) => (o.raycast = () => {}));
    this.shieldHit = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.shield.add(this.shieldHit);
    this.add(this.shield);

    // ---------- you: your hands, and the stone creeping over your sight ----------
    this.myHands = [-1, 1].map((side) => {
      const h = new GiantHand({ side, skin: '#d9b79a', sleeve: '#4f5a43', scale: 1.05 });
      h.visible = false;
      // raised in front of you, palms out, as if to shield your eyes — too late
      h.position.set(0.3 * side, EYE - 0.22, -0.55);
      h.rotation.set(0.15, 0.35 * side, 0.25 * side);
      h.targetCurl = 0.3;
      this.add(h);
      return h;
    });
    this.cracks = new THREE.Mesh(
      new THREE.SphereGeometry(0.21, 32, 16),
      new THREE.MeshBasicMaterial({ map: crackTexture(), transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false }),
    );
    this.cracks.renderOrder = 8600;
    this.cracks.frustumCulled = false;
    ctx.camera.add(this.cracks);

    this.hemi = new THREE.HemisphereLight('#c9d4dc', '#1a1612', 0.9);
    this.key = new THREE.DirectionalLight('#dfe8ee', 1.0);
    this.key.position.set(0, 10, -3);
    // a little light on your own hands (and the shield), so they read as skin before they are stone
    this.near = new THREE.PointLight('#e2d6c4', 2.2, 3.5, 1.5);
    this.near.position.set(0, EYE + 0.4, -0.6);
    this.root.add(this.hemi, this.key, this.near);

    this.scroll = this.add(cartouche(3.4, 1.3));
    this.scroll.position.set(1.9, EYE + 0.55, -3.6);
    this.scroll.lookAt(0, EYE + 0.55, 0);
    this.writer = new ScrollWriter(this, this.scroll);
  }

  async start() {
    const { ctx } = this;
    const { audio, input, haze } = ctx;
    const M = ctx.content.MYTHS.medusa;

    audio.playMusic('ninth', { volume: 0.18, fade: 4, cutoff: 280 }); // far away, under the rock
    await this.wait(1.5);
    await this.writer.say(M.statues, { source: M.source, hold: 2.5 });

    // The shield comes out of the dark, turned toward you.
    const s0 = this.shield.position.clone();
    const s1 = new THREE.Vector3(0.15, EYE, -1.7);
    this.tween(10, (k) => this.shield.position.lerpVectors(s0, s1, k), ease.inOut);
    this.sound('thump', { volume: 0.5 });
    this.wait(3.2).then(() => this.sound('thump', { volume: 0.6 }));
    this.wait(6.4).then(() => this.sound('thump', { volume: 0.7 }));
    await this.writer.say(M.shield, { hold: 2 });
    await this.writer.hide(0.8);

    // Look into it — and see yourself.
    let chosen = false;
    input.add(this.shieldHit, { onSelect: () => (chosen = true), dwell: 1.4 });
    await this.until(() => chosen && this.shield.position.z > -2.2, 12);
    input.remove(this.shieldHit);

    // ---- you are Medusa, and you turn to stone ----
    audio.fadeMusic(0, 2);
    for (const h of this.myHands) h.visible = true;
    ctx.hands.adopt(this.myHands, { free: true });
    this.sound('stone', { volume: 0.9 });
    const stone = new THREE.Color('#8f897f');
    // the shield comes down, and the light finds who held it
    const held = this.shield.position.clone();
    const lowered = new THREE.Vector3(held.x + 0.75, EYE - 1.35, held.z + 0.15);
    if (this.perseus) {
      this.perseusShaft.visible = true;
      this.tween(
        6.5,
        (k) => {
          const lit = THREE.MathUtils.smoothstep(k, 0.25, 1);
          this.shield.position.lerpVectors(held, lowered, THREE.MathUtils.smoothstep(k, 0.1, 0.6));
          this.perseusStone.color.lerpColors(PERSEUS.dim, PERSEUS.lit, lit);
          this.perseusStone.userData.marble.heart.value.w = 0.55 * lit;
          this.perseusPlinth.color.setRGB(0.7, 0.67, 0.62).multiplyScalar(lerp(0.4, 0.8, lit));
          this.perseusShaft.material.opacity = 0.42 * lit;
        },
      );
    }
    await this.tween(
      5,
      (k) => {
        this.cracks.material.opacity = k * 0.9;
        haze.set({ color: '#9a958c', amount: 0.55 * k, saturate: 1 - k, blur: 0.6 * k });
        ctx.grain.set({ vignette: lerp(0.5, 0.9, k) });
        for (const h of this.myHands) {
          h.skinMat.color.lerp(stone, 0.05);
          h.skinMat.userData.rim.rimStrength.value = 0.3 * (1 - k);
          h.skinMat.userData.rim.hatchScale.value = 190 - 120 * k; // stone: coarser, chiselled lines
          h.targetCurl = 0.3 + 0.4 * k;
        }
        if (this.face) this.face.material.color.setRGB(0.85 - 0.3 * k, 0.82 - 0.3 * k, 0.76 - 0.3 * k);
      },
      ease.in,
    );
    await this.writer.say(M.self, { source: M.selfSource, hold: 2.5 });
    await this.wait(0.5);
    this.next('persephone', {}, { color: '#000000', out: 2.5, in: 2 });
  }

  onSelectNothing() {}

  exit() {
    this.ctx.camera.remove(this.cracks);
    this.cracks.geometry.dispose();
    this.cracks.material.map.dispose();
    this.cracks.material.dispose();
    super.exit?.();
  }

  update(dt, t) {
    super.update(dt, t);
    this.shield.lookAt(0, EYE, 0);
    this.shield.position.y += Math.sin(t * 1.3) * 0.0008;
    this.gleam.position.x = Math.sin(t * 0.6) * 0.35;
    this.gleam.position.y = Math.cos(t * 0.45) * 0.25;
    this.perseusHand.update(t, dt);
    for (const h of this.myHands) h.update(t, dt);
    for (const s of this.shafts) s.material.opacity = 0.32 + Math.sin(t * 0.4 + s.position.x) * 0.05;
    this.motes.forEach((m, i) => {
      const y = (m.y + t * m.sp) % 7;
      this.motePos.set([m.x + Math.cos(m.a + t * 0.2) * m.r * (0.4 + y / 9), 7 - y - 1, m.z + Math.sin(m.a + t * 0.2) * m.r * (0.4 + y / 9)], i * 3);
    });
    this.moteMesh.geometry.attributes.position.needsUpdate = true;
  }
}
