import * as THREE from 'three';
import { BaseScene } from '../core/SceneManager.js';
import { Orb } from '../core/props.js';
import { ease, lerp, glowTexture } from '../core/util.js';
import { loadMarble, marbleMaterial } from '../core/marble.js';
import { buildNursery, nurseryArt, HAND_POSES, EYE, INK } from './nursery.js';
import { defineNurserySounds } from './CribScene.js';

// Colours of the lives being forgotten (sun, sea, a hand, the music, a name).
const MEMORY_COLORS = ['#ffcf6b', '#5fa8e8', '#f0b8a0', '#d9485f', '#c8b3e0'];
// The head of Hypnos: how large, and from where to where it drifts as the memories go.
const HYPNOS = { scale: 2.6, turn: -0.12, far: new THREE.Vector3(0.12, EYE + 0.02, -3.2), near: new THREE.Vector3(0.04, EYE - 0.3, -1.3), opacity: 0.94 };

/**
 * Scene 5 — forgetting. Back in the crib; the room comes into focus while
 * memories drift past, each one fainter. Reach for one and it dissolves.
 * "Für Elise" plays, warping and slowing as it fades.
 */
export class ForgettingScene extends BaseScene {
  skipTo = 'choice';

  async enter() {
    const { ctx } = this;
    ctx.rig.position.set(0, EYE, 0);
    ctx.hands.look({ skin: '#f2cdb4', scale: 0.5 }); // a baby's
    const bg = new THREE.Color('#efe4d6');
    ctx.scene.background = bg;
    ctx.scene.fog = new THREE.Fog(bg, 2, 10);
    const [nArt, hypnos] = await Promise.all([nurseryArt(), loadMarble('art/scans/hypnos.bin')]);
    this.room = buildNursery(nArt);
    // Hypnos, god of sleep (a real scan, one wing lost), a dream in the room: he comes closer with every memory that goes.
    if (hypnos) {
      this.sleepMat = marbleMaterial({ color: '#cdbba4', through: '#ffb98a', shadow: '#5a4436' });
      this.sleepMat.transparent = true;
      this.sleepMat.opacity = 0;
      this.sleepMat.fog = false;
      this.hypnos = new THREE.Mesh(hypnos, this.sleepMat);
      this.hypnos.scale.setScalar(HYPNOS.scale);
      this.hypnos.rotation.y = HYPNOS.turn;
      this.hypnos.raycast = () => {};
      this.hypnos.position.copy(HYPNOS.far);
      this.add(this.hypnos);
    }
    ctx.grain.set({ grain: 0.05, vignette: 0.3, color: '#6b4a34' });
    this.add(this.room.group);
    this.animated.push(this.room);
    for (const [hand, side] of [
      [this.room.motherHand, -1],
      [this.room.fatherHand, 1],
    ]) hand.place(...HAND_POSES.hidden(side));
    ctx.haze.set({ amount: 0.6, blur: 1.1, saturate: 0.75 });
    defineNurserySounds(ctx.audio);
    return ctx.audio.preload(['elise', 'babbleMother', 'shush']);
  }

  async start() {
    const { ctx } = this;
    const { FORGETTING } = ctx.content;
    this.music = await this.sound('elise', { volume: 0, loop: true, cutoff: 6000 });
    ctx.audio.stopMusic(2);
    ctx.audio.fade(this.music, 0.55, 3);
    this.warp();

    // The room comes into focus over the whole scene.
    this.tween(38, (k) => {
      ctx.haze.set({ amount: 0.6 * (1 - k), blur: 1.1 * (1 - k), saturate: 0.75 + 0.25 * k });
      this.ctx.scene.fog.far = 10 + k * 20;
    }, ease.inOut);

    await this.wait(1.5);
    await this.say(FORGETTING.lines[0], { hold: 1.2 });

    this.say(FORGETTING.memoryHint, { narrate: false, hold: 3 });

    // Memories float in, weaker each time.
    const count = FORGETTING.memories.length;
    for (let i = 0; i < count; i++) {
      const strength = 1 - i / count;
      if (this.hypnos) {
        const from = this.hypnos.position.clone();
        const to = new THREE.Vector3().lerpVectors(HYPNOS.far, HYPNOS.near, (i + 1) / count);
        const a0 = this.sleepMat.opacity;
        const a1 = HYPNOS.opacity * Math.min(1, (i + 1.5) / count);
        this.tween(4, (k) => {
          this.hypnos.position.lerpVectors(from, to, k);
          this.sleepMat.opacity = lerp(a0, a1, k);
        }, ease.inOut);
      }
      await this.memory(FORGETTING.memories[i], MEMORY_COLORS[i % MEMORY_COLORS.length], strength, i);
      if (i === 1) this.say(FORGETTING.lines[1], { hold: 1 });
      if (i === 3) this.say(FORGETTING.lines[2], { hold: 1.5 });
    }

    this.sound('babbleMother', { parent: this.room.mother.upper, volume: 0.6 });
    await this.wait(2);
    ctx.audio.fade(this.music, 0, 3);
    this.next('choice', {}, { color: '#000000', out: 2.5, in: 2 });
  }

  /** One memory: drifts in, glows; looking at / touching it, or waiting, dissolves it. */
  async memory(label, color, strength, i) {
    const { ctx } = this;
    const side = i % 2 ? 1 : -1;
    const orb = this.add(new Orb({ label, color, radius: 0.05, labelStyle: INK, labelSize: 0.05 }));
    const start = new THREE.Vector3(side * 1.6, EYE + 0.5, -2.4);
    const end = new THREE.Vector3(side * 0.18, EYE + 0.02 + (i % 3) * 0.05, -0.6); // close, in front of you
    orb.position.copy(start);
    orb.scale.setScalar(0.01);
    let touched = false;
    ctx.input.add(orb, { onSelect: () => (touched = true), onHover: (on) => orb.setHover(on) });

    await this.tween(2.5, (k) => {
      orb.position.lerpVectors(start, end, k);
      orb.scale.setScalar(Math.max(0.01, k * (0.5 + strength * 0.7)));
      orb.halo.material.opacity = 0.2 + 0.6 * strength * k;
    }, ease.out);
    await this.until(() => touched, 2.5 + strength * 3);
    ctx.input.remove(orb);

    // Dissolve into sparks of colour that fade.
    const sparks = this.sparks(orb.position, color);
    await this.tween(1.6, (k) => {
      orb.scale.setScalar((0.5 + strength * 0.7) * (1 - k));
      sparks.material.opacity = (1 - k) * strength;
      sparks.scale.setScalar(1 + k * 4);
    }, ease.out);
    this.drop(orb);
    this.drop(sparks);
    await this.wait(0.4);
  }

  sparks(pos, color) {
    const n = 40;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) p[i] = (Math.random() - 0.5) * 0.12;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color, size: 0.03, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    );
    pts.position.copy(pos);
    pts.raycast = () => {};
    return this.add(pts);
  }

  /** Für Elise slowly detuning and slowing — the tune itself is being forgotten. */
  async warp() {
    let t = 0;
    while (this.alive && this.music) {
      await this.wait(0.1);
      t += 0.1;
      const k = Math.min(1, t / 40);
      const rate = 1 - 0.18 * k + Math.sin(t * 1.7) * 0.02 * (0.3 + k);
      if (this.music.source) this.music.source.playbackRate.value = rate;
      const filter = this.music.getFilter();
      if (filter) filter.frequency.value = 6000 - 5200 * k;
    }
  }
}
