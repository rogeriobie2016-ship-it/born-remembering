import * as THREE from 'three';
import { BaseScene } from '../core/SceneManager.js';
import { Orb } from '../core/props.js';
import { ease } from '../core/util.js';
import { buildNursery, nurseryArt, HAND_POSES, EYE, INK } from './nursery.js';
import { defineNurserySounds } from './CribScene.js';

/**
 * Scene 6 — the choice. The room is clear now. Your mother offers her hand.
 * Two lights, always in view and reachable on every platform:
 *   warm, on her open palm  → hold   (7A)
 *   cold, drifting away     → let go (7B)
 */
export class ChoiceScene extends BaseScene {
  skipTo = 'endHold';

  async enter() {
    const { ctx } = this;
    ctx.hands.look({ skin: '#f2cdb4', scale: 0.5 }); // a baby's
    ctx.rig.position.set(0, EYE, 0);
    const bg = new THREE.Color('#efe4d6');
    ctx.scene.background = bg;
    ctx.scene.fog = new THREE.Fog(bg, 3, 30);
    this.room = buildNursery(await nurseryArt());
    ctx.grain.set({ grain: 0.05, vignette: 0.3, color: '#6b4a34' });
    this.add(this.room.group);
    this.animated.push(this.room);
    this.room.fatherHand.place(...HAND_POSES.hidden(1));
    this.room.motherHand.place(...HAND_POSES.hidden(-1));
    this.room.mother.lean = 0.3;
    defineNurserySounds(ctx.audio);
    return ctx.audio.preload(['moonlight', 'babbleMother2']);
  }

  async start() {
    const { ctx } = this;
    const { CHOICE } = ctx.content;
    ctx.audio.playMusic('moonlight', { volume: 0.45, fade: 4 });

    // Her hand comes down, open, palm up.
    const hand = this.room.motherHand;
    hand.targetCurl = 0;
    await this.wait(1);
    this.sound('babbleMother2', { parent: this.room.mother.upper, volume: 0.6 });
    await hand.moveTo(this, ...HAND_POSES.offer(-1), 3);
    for (const line of CHOICE.lines) await this.say(line, { hold: 1.2 });

    let choice = null;
    const hold = new Orb({ label: CHOICE.hold, color: '#ffb46b', radius: 0.04, labelStyle: INK, labelSize: 0.05 });
    const [offerPos] = HAND_POSES.offer(-1);
    hold.position.copy(offerPos).add(new THREE.Vector3(0.06, 0.16, 0.1)); // just above her palm
    const letGo = new Orb({ label: CHOICE.letGo, color: '#6f9fe8', radius: 0.04, labelStyle: INK, labelSize: 0.05 });
    letGo.position.set(0.3, EYE + 0.06, -0.6);
    for (const [orb, id] of [
      [hold, 'hold'],
      [letGo, 'letgo'],
    ]) {
      orb.scale.setScalar(0.01);
      this.add(orb);
      ctx.input.add(orb, { onSelect: () => (choice ??= id), onHover: (on) => orb.setHover(on), dwell: 2.4 }); // a choice deserves a longer look
      this.tween(1.5, (k) => orb.scale.setScalar(Math.max(0.01, k)), ease.out);
    }

    // No default: the experience waits for a real choice.
    await this.until(() => choice !== null);
    ctx.input.clear();

    if (choice === 'hold') {
      hand.targetCurl = 0.8; // her fingers close around yours
      letGo.visible = false;
      await this.tween(1.5, (k) => hold.scale.setScalar(1 + k * 1.5));
      this.next('endHold', {}, { color: '#ffffff', out: 2, in: 2 });
    } else {
      hold.visible = false;
      await Promise.all([
        hand.moveTo(this, ...HAND_POSES.hidden(-1), 3),
        this.tween(3, (k) => (letGo.position.z = -0.62 - k * 3)),
      ]);
      this.next('endLetGo', {}, { color: '#000000', out: 2.5, in: 2 });
    }
  }
}
