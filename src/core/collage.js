import * as THREE from 'three';
import { glowTexture } from './util.js';
import { paintedTexture } from './look.js';
import { TextBlock, wrap } from './TextBlock.js';

// Mixed media: figures cut out of public-domain paintings stand in the 3D world
// like a paper theatre; words travel on engraved parchment scrolls.

const loader = new THREE.TextureLoader();

/** Load cut-outs from /art/<dir>/<name>.webp. Missing files resolve to null (never block a scene). */
export async function loadArt(dir, names) {
  const base = import.meta.env.BASE_URL + 'art/' + dir + '/';
  const texs = await Promise.all(
    names.map(
      (n) =>
        new Promise((resolve) =>
          loader.load(
            base + n + '.webp',
            (t) => {
              t.colorSpace = THREE.SRGBColorSpace;
              t.anisotropy = 4;
              resolve(t);
            },
            undefined,
            () => resolve(null),
          ),
        ),
    ),
  );
  return Object.fromEntries(names.map((n, i) => [n, texs[i]]));
}

/**
 * A figure cut out of a painting: a plane `height` tall.
 * `anchor` 'feet' stands it on its base; 'center' centres it (flying figures).
 */
export function cutout(tex, height, { anchor = 'feet' } = {}) {
  const img = tex.image;
  const w = height * (img.width / img.height);
  const geo = new THREE.PlaneGeometry(w, height);
  if (anchor === 'feet') geo.translate(0, height / 2, 0);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, depthWrite: true });
  const m = new THREE.Mesh(geo, mat);
  m.userData.size = [w, height];
  m.raycast = () => {};
  return m;
}

/** A soft dark pool under a standing figure (paper theatre shadow). */
export function groundShadow(width) {
  const s = new THREE.Mesh(
    new THREE.CircleGeometry(width * 0.5, 24),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#000000', transparent: true, opacity: 0.55, depthWrite: false }),
  );
  s.rotation.x = -Math.PI / 2;
  s.position.y = 0.01;
  s.scale.set(1, 0.45, 1);
  s.raycast = () => {};
  return s;
}

/** A parchment cartouche (engraved border, curled ends) that carries words over busy painting. Fades via material.opacity. */
export function cartouche(w, h) {
  const px = 140;
  const tex = paintedTexture(Math.round(w * px), Math.round(h * px), (c, W, H) => {
    const g = c.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.7);
    g.addColorStop(0, 'rgba(246,236,212,0.97)');
    g.addColorStop(1, 'rgba(222,203,164,0.97)');
    c.fillStyle = g;
    const r = H * 0.18;
    c.beginPath();
    c.moveTo(r, 4);
    c.lineTo(W - r, 4);
    c.quadraticCurveTo(W - 4, H / 2, W - r, H - 4);
    c.lineTo(r, H - 4);
    c.quadraticCurveTo(4, H / 2, r, 4);
    c.fill();
    c.strokeStyle = 'rgba(58,38,22,0.85)';
    c.lineWidth = 3;
    c.stroke();
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(58,38,22,0.5)';
    c.beginPath();
    c.moveTo(r + 10, 14);
    c.lineTo(W - r - 10, 14);
    c.moveTo(r + 10, H - 14);
    c.lineTo(W - r - 10, H - 14);
    c.stroke();
    // engraved shading at the curled ends
    for (let i = 0; i < 18; i++) {
      c.beginPath();
      c.moveTo(r * 0.4 + i * 2.2, 10);
      c.quadraticCurveTo(i * 2.2 - 6, H / 2, r * 0.4 + i * 2.2, H - 10);
      c.moveTo(W - r * 0.4 - i * 2.2, 10);
      c.quadraticCurveTo(W - i * 2.2 + 6, H / 2, W - r * 0.4 - i * 2.2, H - 10);
      c.stroke();
    }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  m.raycast = () => {};
  return m;
}

/** Ink for words written on a scroll. */
export const SCROLL_INK = { color: '#3a2616', glow: 'rgba(255,246,226,0.55)' };

/**
 * Writes lines onto a cartouche, one at a time: unroll, reveal word by word (and narrate),
 * hold, fade. Owned by `scene` (cancelled with it).
 */
export class ScrollWriter {
  constructor(scene, scroll, { size = 0.085, wrapAt = 34 } = {}) {
    this.scene = scene;
    this.scroll = scroll;
    this.size = size;
    this.wrapAt = wrapAt;
    this.block = null;
  }

  async say(text, { source = null, hold = 3, narrate = true } = {}) {
    const { scene, scroll } = this;
    if (this.block) scene.drop(this.block);
    const block = new TextBlock(wrap(text, this.wrapAt), { size: this.size, lineHeight: 1.42, ...SCROLL_INK });
    block.position.copy(scroll.position);
    block.quaternion.copy(scroll.quaternion);
    block.translateY(source ? 0.07 : 0);
    block.translateZ(0.01);
    scene.add(block);
    this.block = block;
    let src = null;
    if (source) {
      src = new TextBlock([source], { size: this.size * 0.55, italic: false, color: '#6b4a2c', glow: null, float: 0.3 });
      src.position.copy(scroll.position);
      src.quaternion.copy(scroll.quaternion);
      src.translateY(-block.height / 2 - 0.02);
      src.translateZ(0.012);
      scene.add(src);
    }
    await scene.tween(0.8, (k) => (scroll.material.opacity = Math.max(scroll.material.opacity, k)));
    if (narrate) scene.ctx.narrator.speak(text);
    await block.reveal(scene, { perWord: 0.13, fade: 0.8, linePause: 0.15 });
    if (src) src.reveal(scene, { perWord: 0.1, fade: 0.8 });
    await scene.wait(hold);
    await Promise.all([block.fadeOut(scene, 1.2), src ? src.fadeOut(scene, 1.2) : null]);
    scene.drop(block);
    if (src) scene.drop(src);
    if (this.block === block) this.block = null;
  }

  hide(seconds = 1.2) {
    return this.scene.tween(seconds, (k) => (this.scroll.material.opacity = Math.min(this.scroll.material.opacity, 1 - k)));
  }
}
