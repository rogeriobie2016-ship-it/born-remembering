import * as THREE from 'three';
import { BaseScene } from '../core/SceneManager.js';
import { ease, lerp, glowTexture } from '../core/util.js';
import { softMaterial } from '../core/look.js';
import { loadArt, cutout, groundShadow, cartouche, ScrollWriter } from '../core/collage.js';
import { lyre } from '../core/synth.js';
import { GiantHand } from './nursery.js';

// Scene 5 — Orpheus and Eurydice (Ovid, Metamorphoses X). A past life, through sound and sight.
//
// You stand in the misty grove of the dead (Corot, 1861, wrapped all around you).
// Orpheus leads Eurydice up toward the light, playing the lullaby on his lyre.
// Near the threshold he turns; their embrace (Leighton, 1864) is the instant he looks.
// You become Eurydice: you are drawn back into the dark, your hands close on air,
// he grows small in the light. And in that light the Muses appear (Hausleithner, 1882),
// and Orpheus is Beethoven.

const EYE = 1.6;
const MIST = new THREE.Color('#9aa39a');

export class OrpheusScene extends BaseScene {
  skipTo = 'beethoven';

  async enter() {
    const { ctx } = this;
    ctx.rig.position.set(0, EYE, 0);
    ctx.look.reset(0, 0);
    ctx.scene.background = MIST.clone();
    ctx.scene.fog = new THREE.Fog(MIST.clone(), 6, 34);
    ctx.grain.set({ grain: 0.06, vignette: 0.5, color: '#0d0f0c' });
    ctx.audio.define('lyre', () => lyre());

    const [T] = await Promise.all([
      loadArt('orpheus', ['grove', 'orpheus', 'eurydice', 'leighton', 'muses', 'beethoven']),
      ctx.audio.preload(['lyre', 'moonlight']),
    ]);

    // ---------- Corot's grove of the dead, all around ----------
    if (T.grove) {
      T.grove.wrapS = THREE.RepeatWrapping;
      T.grove.repeat.set(2, 1);
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(16, 16, 11, 96, 1, true),
        new THREE.MeshBasicMaterial({ map: T.grove, side: THREE.BackSide, fog: false, color: '#c9ccc2' }),
      );
      band.position.y = 4.3;
      band.renderOrder = -1;
      band.raycast = () => {};
      this.add(band);
      this.bandMat = band.material;
    }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#8d968e', side: THREE.BackSide, fog: false }));
    dome.renderOrder = -2;
    dome.raycast = () => {};
    this.add(dome);

    // ground: dark, damp meadow, engraved; a pale path toward the light
    const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 64), softMaterial({ color: '#283022', rim: '#a8b0a0', rimStrength: 0.05, hatch: 0, umber: '#1c2018' }));
    ground.rotation.x = -Math.PI / 2;
    ground.raycast = () => {};
    this.add(ground);
    const pathMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#c9c6ad', transparent: true, opacity: 0.35, depthWrite: false });
    const path = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 26), pathMat);
    path.rotation.x = -Math.PI / 2;
    path.rotation.z = 0.18;
    path.position.set(-0.6, 0.01, -12);
    path.raycast = () => {};
    this.add(path);

    // mist drifting low: soft wisps, never a hard edge
    this.mists = [];
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#e8ebe2', transparent: true, depthWrite: false, opacity: 0.4, fog: false }));
      const a = (i / 26) * Math.PI * 2 + Math.sin(i * 3.1) * 0.2;
      const r = 5 + (i % 5) * 2.2;
      m.position.set(Math.sin(a) * r, 0.4 + (i % 3) * 0.35, -Math.cos(a) * r);
      m.scale.set(6 + (i % 4) * 1.5, 1.6 + (i % 3) * 0.5, 1);
      m.userData.phase = a;
      this.add(m);
      this.mists.push(m);
    }

    // the threshold of the upper world: a light at the end of the path
    this.exitPos = new THREE.Vector3(1.6, 2.2, -19);
    this.exit = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: '#fff6dc', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    );
    this.exit.position.copy(this.exitPos);
    this.exit.scale.setScalar(9);
    this.add(this.exit);

    // ---------- Orpheus and Eurydice ----------
    const walker = (tex, h) => {
      const g = new THREE.Group();
      if (tex) {
        const fig = cutout(tex, h);
        g.add(fig);
        g.userData.fig = fig;
      }
      g.add(groundShadow(h * 0.4));
      this.add(g);
      return g;
    };
    this.orpheus = walker(T.orpheus, 1.95);
    this.eurydice = walker(T.eurydice, 1.75);
    this.orpheus.position.set(-3.2, 0, -3.8);
    this.eurydice.position.set(-4.4, 0, -2.6);
    this.eurydiceHit = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.eurydiceHit.position.y = 1;
    this.eurydice.add(this.eurydiceHit);

    // Leighton's embrace: the instant he turns, close to you
    if (T.leighton) {
      this.embrace = cutout(T.leighton, 2.3);
      this.embrace.material.opacity = 0;
      this.embrace.visible = false;
      this.add(this.embrace);
    }

    // the vision at the end: the Muses in their light, and Beethoven on his rock
    if (T.muses) {
      this.muses = cutout(T.muses, 4.2, { anchor: 'center' });
      this.muses.material.depthWrite = false;
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
        softMaterial({ color: '#5b6043', rim: '#e6e2c0', rimStrength: 0.3, hatch: 30, transparent: true, opacity: 0 }),
      );
      rock.scale.set(0.75, 0.42, 0.45);
      rock.position.set(0.18, 0.12, -0.32);
      rock.raycast = () => {};
      this.beethoven.add(rock);
      this.beethovenRock = rock;
      this.add(this.beethoven);
    }

    // ---------- you, once you are Eurydice ----------
    this.me = new THREE.Group();
    this.me.visible = false;
    this.root.add(this.me);
    this.myHands = [-1, 1].map((side) => {
      const h = new GiantHand({ side, skin: '#ecd6c6', sleeve: '#efe9de', scale: 1.1 });
      h.visible = true;
      h.position.set(0.22 * side, EYE - 0.3, -0.5);
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

    this.hemi = new THREE.HemisphereLight('#d9ddd2', '#1e231b', 1.2);
    this.sun = new THREE.DirectionalLight('#fff1d8', 1.2);
    this.sun.position.copy(this.exitPos).multiplyScalar(4);
    this.root.add(this.hemi, this.sun);

    this.scroll = this.add(cartouche(3.4, 1.3));
    this.scroll.position.set(1.7, EYE + 0.5, -3.6);
    this.scroll.lookAt(0, EYE + 0.5, 0);
    this.writer = new ScrollWriter(this, this.scroll);
  }

  /** Walk a figure toward `to` over `seconds`, with a gentle step bob. */
  walk(g, to, seconds) {
    const from = g.position.clone();
    return this.tween(seconds, (k) => {
      g.position.lerpVectors(from, to, k);
      g.position.y = Math.abs(Math.sin(k * seconds * 3.2)) * 0.04;
    });
  }

  async start() {
    const { ctx } = this;
    const { audio, input, fader, haze } = ctx;
    const M = ctx.content.MYTHS.orpheus;

    // The lyre: the same lullaby the mother hummed.
    this.lyre = await this.sound('lyre', { parent: this.orpheus, loop: true, volume: 0, refDistance: 3 });
    audio.fade(this.lyre, 1, 3);
    await this.wait(1.5);
    await this.writer.say(M.condition, { source: M.source, hold: 2.5 });

    // Up the path: he ahead, she behind.
    const end = this.exitPos.clone().setY(0);
    const near = end.clone().lerp(new THREE.Vector3(-0.6, 0, -4), 0.35);
    this.walk(this.orpheus, near, 16);
    this.wait(1.2).then(() => this.walk(this.eurydice, near.clone().add(new THREE.Vector3(-0.5, 0, 2.2)), 16));
    await this.writer.say(M.path, { hold: 2.5 });
    await this.wait(5.5);

    // He turns.
    if (this.orpheus.userData.fig) this.orpheus.userData.fig.scale.x = -1;
    audio.fade(this.lyre, 0, 0.6);
    if (this.embrace) {
      this.embrace.visible = true;
      this.embrace.position.set(-0.4, 0, -3.2);
      this.embrace.lookAt(0, 1.2, 0);
      this.tween(1.2, (k) => (this.embrace.material.opacity = k));
    }
    await this.writer.say(M.turn, { hold: 1.5 });

    // Look at her — and become her.
    let chosen = false;
    const hit = this.embrace ? this.embrace : this.eurydiceHit;
    if (this.embrace) this.embrace.raycast = THREE.Mesh.prototype.raycast;
    input.add(hit, { onSelect: () => (chosen = true), dwell: 1.2 });
    await this.until(() => chosen, 7);
    input.remove(hit);
    this.writer.hide(0.6);

    // ---- you are Eurydice ----
    await fader.fade(1, 0.7, '#0b0d0b');
    if (this.embrace) this.embrace.visible = false;
    this.eurydice.visible = false;
    this.orpheus.position.set(0.3, 0, -3.2); // he is right there, looking at you
    this.me.visible = true;
    for (const h of this.myHands) h.targetCurl = 0.05;
    await fader.fade(0, 1.2);

    // You are drawn back into the dark; your hands close on air.
    this.tween(3, (k) => {
      for (const h of this.myHands) h.targetCurl = 0.05 + 0.85 * k;
    });
    const o0 = this.orpheus.position.clone();
    this.tween(9, (k) => this.orpheus.position.set(o0.x + 1.0 * k, 0, lerp(o0.z, this.exitPos.z + 2, k)), ease.in);
    this.tween(9, (k) => {
      ctx.scene.fog.far = lerp(34, 9, k);
      ctx.scene.fog.color.lerpColors(MIST, new THREE.Color('#151913'), k);
      ctx.scene.background.copy(ctx.scene.fog.color);
      if (this.bandMat) this.bandMat.color.setScalar(lerp(0.79, 0.25, k));
      ctx.grain.set({ vignette: lerp(0.5, 0.85, k) });
      for (const h of this.myHands) h.traverse((o) => o.material && (o.material.opacity = 1 - 0.85 * k));
    });
    await this.writer.say(M.farewell, { hold: 2 });
    await this.writer.hide(0.8);

    // In the light where he stands, the Muses — and Orpheus is Beethoven.
    this.me.visible = false;
    audio.playMusic('moonlight', { volume: 0.5, fade: 4 });
    // the light comes toward you, carrying the vision
    if (this.muses) {
      this.muses.visible = true;
      this.muses.position.set(-0.3, 2.4, -6.2);
      this.muses.lookAt(0, 2.4, 0);
    }
    if (this.beethoven) {
      this.beethoven.visible = true;
      this.beethoven.position.set(1.7, 0, -4.6);
      this.beethoven.lookAt(0, 0.8, 0);
    }
    const e0 = this.exit.position.clone();
    this.tween(4, (k) => this.exit.position.lerpVectors(e0, new THREE.Vector3(-0.3, 2.6, -7), k), ease.out);
    await this.tween(4, (k) => {
      if (this.muses) this.muses.material.opacity = k;
      if (this.beethoven) this.beethoven.material.opacity = k;
      if (this.beethovenRock) this.beethovenRock.material.opacity = k;
      if (this.orpheus.userData.fig) this.orpheus.userData.fig.material.opacity = 1 - k;
      this.exit.material.opacity = 0.85 + 0.15 * k;
    });
    haze.set({ color: '#fff6e0', amount: 0 });
    await this.wait(3);
    this.next('beethoven', {}, { color: '#000000', out: 2.5, in: 2 });
  }

  onSelectNothing() {}

  update(dt, t) {
    super.update(dt, t);
    for (const m of this.mists) {
      m.position.y += Math.sin(t * 0.3 + m.userData.phase) * 0.0015;
      m.material.opacity = 0.32 + Math.sin(t * 0.2 + m.userData.phase) * 0.1;
    }
    // figures always face you (paper theatre), with a slight sway
    for (const g of [this.orpheus, this.eurydice]) {
      g.lookAt(0, g.position.y, 0);
      if (g.userData.fig) g.userData.fig.rotation.z = Math.sin(t * 2 + (g === this.orpheus ? 0 : 1)) * 0.02;
    }
    this.exit.scale.setScalar(9 + Math.sin(t * 0.7) * 0.4);
    for (const h of this.myHands) h.update(t, dt);
  }
}
