import * as THREE from 'three';
import { BaseScene } from '../core/SceneManager.js';
import { TextBlock } from '../core/TextBlock.js';
import { ease } from '../core/util.js';
import { cry, babble, shush, thump } from '../core/synth.js';
import { buildNursery, nurseryArt, HAND_POSES, EYE, DOOR_POS, INK } from './nursery.js';
import { cartouche, ScrollWriter } from '../core/collage.js';

const _cam = new THREE.Vector3();
const _dir = new THREE.Vector3();

// Real recorded cries (public/audio); the synth only stands in if a file is missing.
const CRIES = ['cry-newborn-1.mp3', 'cry-baby-1.mp3', 'cry-newborn-2.mp3', 'cry-baby-2.mp3'];

/** Sounds every nursery scene can use. */
export function defineNurserySounds(audio) {
  CRIES.forEach((file, i) => audio.defineFile(`cry${i}`, file, () => cry(11 + i * 7)));
  audio.define('babbleMother', () => babble(3, { pitch: 215, seconds: 3.2, cutoff: 700 }));
  audio.define('babbleMother2', () => babble(9, { pitch: 225, seconds: 2.4, cutoff: 700 }));
  audio.define('babbleFather', () => babble(5, { pitch: 118, seconds: 2.8, cutoff: 520 }));
  audio.define('shush', () => shush(2));
  audio.define('thump', () => thump());
}

/**
 * Scene 2 — the crib. Two phases:
 *  birth   : blurred newborn eyes, giant hands, muffled voices. Every try to speak becomes a cry.
 *            You are Astyanax: you cry at your father's crested helmet, your parents laugh,
 *            and Hector lays it on the ground (Iliad VI).
 *            Then the window light finds your face, grows into the sun → Icarus.
 *  hearing : back from Icarus. A muffled song behind the door — the Sirens calling → the Sirens.
 */
export class CribScene extends BaseScene {

  async enter(params) {
    const { ctx } = this;
    this.phase = params.phase === 'hearing' ? 'hearing' : 'birth';
    this.skipTo = this.phase === 'birth' ? 'icarus' : 'sirens';
    this.attempts = 0;
    this.crying = false;

    ctx.rig.position.set(0, EYE, 0);
    ctx.look.reset(0, 0.15); // flat screens: start looking slightly up, at the adults
    const fogColor = new THREE.Color('#efe4d6');
    ctx.scene.background = fogColor;
    ctx.scene.fog = new THREE.Fog(fogColor, 1.4, this.phase === 'birth' ? 7.5 : 9);
    this.room = buildNursery(await nurseryArt());
    this.add(this.room.group);
    this.animated.push(this.room);

    const blur = this.phase === 'birth' ? 1.6 : 1.1; // CSS blur also softens the text: keep it light
    ctx.haze.set({ amount: this.phase === 'birth' ? 1 : 0.75, blur, saturate: 0.7, color: '#f4ece2' });
    ctx.grain.set({ grain: 0.06, vignette: 0.35, color: '#6b4a34' }); // warm, filmed

    // Hands start out of view.
    for (const [hand, side] of [
      [this.room.motherHand, -1],
      [this.room.fatherHand, 1],
    ]) {
      const [p, r] = HAND_POSES.hidden(side);
      hand.place(p, r);
    }

    // Homer's words travel on a scroll, beside the crib.
    this.scroll = this.add(cartouche(2.3, 1.05));
    this.scroll.position.set(-0.8, EYE + 0.32, -1.55);
    this.scroll.lookAt(0, EYE + 0.32, 0);
    this.writer = new ScrollWriter(this, this.scroll, { size: 0.058, wrapAt: 36 });

    defineNurserySounds(ctx.audio);
    return ctx.audio.preload(['moonlight', 'cry0', 'cry1', 'cry2', 'cry3', 'babbleMother', 'babbleMother2', 'babbleFather', 'shush', 'thump', 'ninth']);
  }

  start() {
    this.ctx.audio.playMusic('moonlight', { volume: 0.4, fade: 3 });
    this.ctx.audio.muffleMusic(650, 3);
    this.ambientVoices();
    return this.phase === 'birth' ? this.birth() : this.hearing();
  }

  // ---------------------------------------------------------------- birth

  async birth() {
    const { CRIB } = this.ctx.content;
    await this.wait(1.5);
    this.caress();
    await this.wait(2.5);
    for (const line of CRIB.intro) await this.say(line, { hold: 1.2 });

    this.say(CRIB.hint, { narrate: false, hold: 4 });
    this.listening = true;

    // Wait for three tries (or nudge with an automatic cry if nobody tries).
    const tried = await this.until(() => this.attempts >= 1, 12);
    if (!tried) this.tryToSpeak();
    await this.until(() => this.attempts >= 3 && !this.crying, 28);
    this.listening = false;
    await this.until(() => !this.crying, 4);
    await this.iliad();
    await this.say(CRIB.afterCries, { hold: 1.5 });
    await this.vision();
  }

  onSelectNothing() {
    if (this.listening) this.tryToSpeak();
  }

  /** Iliad VI: the child cries at the crested helmet; his parents laugh; Hector lays it down. */
  async iliad() {
    const M = this.ctx.content.MYTHS.crib;
    const r = this.room;
    if (r.helmet) {
      r.helmet.visible = true;
      r.helmet.fade(0);
      this.tween(1.6, (k) => r.helmet.fade(k));
    }
    this.sound('babbleFather', { parent: r.father.upper, volume: 0.7 });
    this.wait(0.4).then(() => this.sound('babbleMother2', { parent: r.mother.upper, volume: 0.6 }));
    await this.writer.say(M.text, { source: M.source, hold: 2.5 });
    await this.writer.hide();
  }

  /** What you want to say appears… and breaks apart into a cry. */
  async tryToSpeak() {
    if (this.crying) return;
    this.crying = true;
    const { CRIB } = this.ctx.content;
    const n = this.attempts++;

    this.ctx.camera.getWorldPosition(_cam);
    this.ctx.camera.getWorldDirection(_dir);
    const words = new TextBlock([CRIB.attempts[n % CRIB.attempts.length]], { size: 0.042, float: 0, ...INK });
    words.position.copy(_cam).addScaledVector(_dir, 1.3);
    words.lookAt(_cam);
    this.add(words);
    await words.reveal(this, { perWord: 0.14, fade: 0.35 });
    await this.wait(0.3);

    // The cry: sound, a reddish pulse in the haze, the words scatter.
    this.sound(`cry${n % 4}`, { volume: 0.9 });
    const haze = this.ctx.haze;
    const base = haze.amount;
    haze.set({ color: '#f6c9b8' });
    this.tween(0.25, (k) => haze.set({ amount: base + 0.25 * k }), ease.out).then(() =>
      this.tween(1.6, (k) => haze.set({ amount: base + 0.25 * (1 - k) })),
    );
    const vel = words.words.map(() => new THREE.Vector3((Math.random() - 0.5) * 0.9, Math.random() * 0.6 - 0.1, (Math.random() - 0.5) * 0.6));
    const spin = words.words.map(() => (Math.random() - 0.5) * 3);
    const start = words.words.map((w) => w.mesh.position.clone());
    await this.tween(
      1.6,
      (k) =>
        words.words.forEach((w, i) => {
          w.mesh.position.copy(start[i]).addScaledVector(vel[i], k);
          w.mesh.rotation.z = spin[i] * k;
          w.mesh.material.opacity = 1 - k;
        }),
      ease.out,
    );
    this.drop(words);
    haze.set({ color: '#f4ece2' });

    // The adults hear only crying: shush, pat.
    if (n % 2 === 0) this.pat(this.room.motherHand, -1, 'shush');
    else this.pat(this.room.fatherHand, 1, 'babbleFather');
    await this.wait(1.6); // let the recorded cry (3–4 s) finish before the next try
    this.crying = false;
  }

  // ---------------------------------------------------------------- adults

  async ambientVoices() {
    const { mother, father } = this.room;
    const lines = [
      ['babbleMother', mother],
      ['babbleFather', father],
      ['babbleMother2', mother],
    ];
    for (let i = 0; this.alive; i++) {
      await this.wait(this.phase === 'birth' ? 3.5 + Math.random() * 3 : 6 + Math.random() * 4);
      if (this.quiet) continue;
      const [name, who] = lines[i % lines.length];
      this.sound(name, { parent: who.upper, volume: 0.9, refDistance: 1.2 });
    }
  }

  async caress() {
    const hand = this.room.motherHand;
    hand.targetCurl = 0.25;
    await hand.moveTo(this, ...HAND_POSES.reach(-1), 2.5);
    hand.targetCurl = 0.45;
    await this.wait(1.2);
    hand.targetCurl = 0.2;
    await hand.moveTo(this, ...HAND_POSES.hidden(-1), 2.5);
  }

  async pat(hand, side, voice) {
    if (hand.busy) return;
    hand.busy = true;
    await hand.moveTo(this, ...HAND_POSES.pat(side), 1.4);
    this.sound(voice, { parent: hand, volume: 0.8 });
    const [p] = HAND_POSES.pat(side);
    await this.tween(1.6, (k) => (hand.position.y = p.y + Math.abs(Math.sin(k * Math.PI * 3)) * 0.05), ease.linear);
    await hand.moveTo(this, ...HAND_POSES.hidden(side), 1.8);
    hand.busy = false;
  }

  // ---------------------------------------------------------------- vision trigger (→ Icarus)

  async vision() {
    const { ctx } = this;
    const { CRIB } = ctx.content;
    const r = this.room;
    const glint = r.glint;

    // The window brightens and a beam finds your face.
    ctx.haze.set({ color: '#fff3dc' });
    this.tween(5, (k) => {
      r.beamMat.opacity = 0.22 * k;
      r.sun.intensity = 0.8 + 2.5 * k;
      glint.material.opacity = k;
      glint.scale.setScalar(0.8 + k * 0.8);
    });
    this.say(CRIB.light, { hold: 2 });
    await this.wait(2.5);

    // Look at it (gaze ring) / click it — or it comes for you anyway.
    let chosen = false;
    ctx.input.add(glint, { onSelect: () => (chosen = true) });
    this.say(CRIB.lightHint, { narrate: false, hold: 4 });
    await this.until(() => chosen, 15);
    ctx.input.remove(glint);

    // It grows, rushes in, becomes the sun.
    this.quiet = true;
    ctx.audio.muffleMusic(20000, 4);
    ctx.audio.fadeMusic(0.9, 4);
    ctx.camera.getWorldPosition(_cam);
    const from = glint.position.clone();
    const to = from.clone().lerp(_cam, 0.8);
    await this.tween(
      4.5,
      (k) => {
        glint.position.lerpVectors(from, to, k);
        glint.scale.setScalar(1.6 + k * k * 9);
        ctx.haze.set({ amount: 0.75 + 0.25 * k, blur: 1.6 + k * 6 });
        r.beamMat.opacity = 0.22 + 0.4 * k;
      },
      ease.in,
    );
    this.next('icarus', {}, { color: '#ffffff', out: 1.2, in: 2 });
  }

  // ---------------------------------------------------------------- hearing trigger (→ Beethoven)

  async hearing() {
    const { ctx } = this;
    const { CRIB } = ctx.content;
    await this.wait(1);
    this.sound('cry2', { volume: 0.7 }); // waking from the fall
    this.pat(this.room.motherHand, -1, 'shush');
    await this.wait(1.5);
    await this.say(CRIB.back, { hold: 1.5 });
    this.quiet = true;
    ctx.audio.fadeMusic(0.12, 4);

    // A sound behind the door: thumps you can almost see.
    const source = new THREE.Object3D();
    source.position.copy(DOOR_POS).add(new THREE.Vector3(-0.15, 0, 0));
    this.add(source);
    const distant = await this.sound('ninth', { parent: source, loop: true, volume: 0, cutoff: 320, refDistance: 1.5 });
    ctx.audio.fade(distant, 0.6, 6);

    const ringMat = new THREE.MeshBasicMaterial({ color: '#fff4e0', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const rings = [0, 1, 2].map(() => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), ringMat.clone());
      ring.position.copy(source.position);
      ring.rotation.y = -Math.PI / 2;
      ring.scale.setScalar(0.01);
      this.add(ring);
      return ring;
    });
    // The door itself is the target (big, easy to gaze at).
    const target = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.3), new THREE.MeshBasicMaterial({ visible: false }));
    target.position.set(DOOR_POS.x - 0.1, 1.1, DOOR_POS.z);
    target.rotation.y = -Math.PI / 2;
    this.add(target);
    let chosen = false;
    ctx.input.add(target, { onSelect: () => (chosen = true) });

    let ringIndex = 0;
    const pulse = async () => {
      while (this.alive && !this.silence) {
        this.sound('thump', { parent: source, volume: 1, refDistance: 1.5 });
        const ring = rings[ringIndex++ % rings.length];
        this.tween(2.4, (k) => {
          ring.scale.setScalar(0.2 + k * 2.2);
          ring.material.opacity = 0.55 * (1 - k);
        }, ease.out);
        await this.wait(2.2);
      }
    };
    pulse();
    await this.wait(1);
    await this.say(CRIB.sound, { hold: 1 });
    this.say(CRIB.soundHint, { narrate: false, hold: 4 });
    await this.until(() => chosen, 18);
    ctx.input.remove(target);

    // Everything goes silent — then black.
    this.silence = true;
    ctx.audio.fade(distant, 0, 1.5);
    ctx.audio.stopMusic(1.5);
    await this.tween(2, (k) => ctx.haze.set({ amount: 0.75 - 0.4 * k }));
    this.next('sirens', {}, { color: '#000000', out: 2.5, in: 2 });
  }
}
