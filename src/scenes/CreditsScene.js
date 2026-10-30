import * as THREE from 'three';
import { BaseScene } from '../core/SceneManager.js';
import { TextBlock, wrap } from '../core/TextBlock.js';
import { Dust, Orb } from '../core/props.js';
import { clamp } from '../core/util.js';

const DIST = 3.2;
const SPEED = 0.22; // metres per second
const COMPACT_OVER = 3; // sections with more names than this use the small type
const BOTTOM = -1.7; // where text enters (relative to eye)
const STOP_AT = 0.55; // the last line comes to rest here
const FADE = 0.45; // fade band at the top and bottom edges
const TOP = 1.55;

/** Rolling credits (after the finale, or from the menu). Click / tap / trigger speeds it up. */
export class CreditsScene extends BaseScene {
  skipTo = 'prologue';

  enter() {
    const { ctx } = this;
    const { TITLE, CREDITS, FINALE } = ctx.content;
    ctx.scene.background = new THREE.Color('#05040a');
    this.add(new Dust({ count: 500, opacity: 0.4, speed: 0.01 }));

    this.roll = new THREE.Group();
    this.roll.position.z = -DIST;
    this.root.add(this.roll);
    this.blocks = [];
    let y = 0;
    const put = (block, gapBefore = 0) => {
      y -= gapBefore + block.height / 2;
      block.position.y = y;
      y -= block.height / 2;
      block.setOpacity(0);
      this.roll.add(block);
      this.blocks.push(block);
    };

    put(new TextBlock(wrap(TITLE, 26), { size: 0.14, lineHeight: 1.4, float: 0.3 }));
    for (const { role, names } of CREDITS) {
      put(new TextBlock([role], { size: 0.08, italic: false, weight: 600, color: '#a39b8f', glow: null, spacing: 0.35, float: 0.3 }), 0.55);
      // Long lists (myths, recordings, paintings) set smaller and tighter so the roll stays short
      const compact = names.length > COMPACT_OVER;
      const style = compact ? { size: 0.075, lineHeight: 1.3, float: 0.3 } : { size: 0.11, lineHeight: 1.4, float: 0.3 };
      for (const name of names) put(new TextBlock(wrap(name, compact ? 60 : 34), style), compact ? 0.03 : 0.06);
    }
    this.lastY = y; // bottom of the last block, in roll space

    this.rollY = BOTTOM; // roll offset: top block starts at the bottom edge
    this.endY = STOP_AT - this.lastY; // offset where the last line rests at STOP_AT
    this.boost = 0;
    this.done = false;

    this.orb = this.add(new Orb({ label: FINALE.again, color: '#ffe9c2' }));
    this.orb.position.set(0, -0.75, -2.4);
    this.orb.visible = false;
    ctx.input.add(this.orb, { onSelect: () => this.next('prologue'), onHover: (on) => this.orb.setHover(on) });

    return ctx.audio.preload(['moonlight']);
  }

  start() {
    this.ctx.audio.playMusic('moonlight', { volume: 0.35, fade: 3 });
  }

  onSelectNothing() {
    this.boost = 2.5; // seconds of fast-forward
  }

  update(dt, t) {
    super.update(dt, t);
    if (!this.done) {
      const speed = SPEED * (this.boost > 0 ? 4 : 1);
      this.boost = Math.max(0, this.boost - dt);
      this.rollY = Math.min(this.endY, this.rollY + speed * dt);
      if (this.rollY >= this.endY) {
        this.done = true;
        this.orb.visible = true;
      }
    }
    this.roll.position.y = this.rollY;
    for (const b of this.blocks) {
      b.update(t);
      const wy = this.rollY + b.position.y;
      const a = clamp((wy - BOTTOM) / FADE, 0, 1) * clamp((TOP - wy) / FADE, 0, 1);
      b.visible = a > 0.001;
      if (b.visible) b.setOpacity(a);
    }
  }
}
