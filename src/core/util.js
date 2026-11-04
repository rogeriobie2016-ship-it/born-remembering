import * as THREE from 'three';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export const ease = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

/**
 * Game-clock timers and tweens. Every timer can belong to an owner (a scene);
 * cancelling the owner drops its timers, so pending `await`s simply never
 * resume — that is how a scene's async sequence stops when the scene exits.
 */
export class Scheduler {
  constructor() {
    this.time = 0;
    this.items = new Set();
  }

  update(dt) {
    this.time += dt;
    for (const it of [...this.items]) {
      if (it.step(this.time)) this.items.delete(it);
    }
  }

  wait(seconds, owner = null) {
    return new Promise((resolve) => {
      const end = this.time + seconds;
      this.items.add({ owner, step: (t) => (t >= end ? (resolve(), true) : false) });
    });
  }

  tween(seconds, fn, easing = ease.inOut, owner = null) {
    return new Promise((resolve) => {
      const start = this.time;
      fn(0);
      this.items.add({
        owner,
        step: (t) => {
          const k = seconds <= 0 ? 1 : clamp((t - start) / seconds, 0, 1);
          fn(easing(k));
          if (k >= 1) {
            resolve();
            return true;
          }
          return false;
        },
      });
    });
  }

  cancel(owner) {
    for (const it of [...this.items]) if (it.owner === owner) this.items.delete(it);
  }
}

/** Free GPU memory for everything under `root` (skips shared textures). */
export function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const key of ['map', 'alphaMap', 'emissiveMap']) {
        const tex = m[key];
        if (tex && !tex.userData.shared) tex.dispose();
      }
      m.dispose();
    }
  });
}

let glowTex = null;
/** Soft radial glow, shared by sprites and particles. */
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  glowTex.userData.shared = true;
  return glowTex;
}

/** Instructions can differ by device: a plain string, or { desktop, phone, xr }. */
export const forPlatform = (text, platform) => (typeof text === 'string' ? text : text[platform]);

export const isQuest = /OculusBrowser|Quest|Pico/i.test(navigator.userAgent);
export const isMobile =
  !isQuest &&
  (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
