import * as THREE from 'three';
import { ease } from './util.js';

/**
 * Full-view fade to a colour. A small inside-out sphere glued to the camera,
 * so it works identically on flat screens and inside a headset.
 */
export class Fader {
  constructor(camera, scheduler) {
    this.scheduler = scheduler;
    this.token = 0;
    this.material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 1,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), this.material);
    this.mesh.renderOrder = 10000;
    this.mesh.frustumCulled = false;
    camera.add(this.mesh);
  }

  get value() {
    return this.material.opacity;
  }

  set(opacity, color) {
    if (color !== undefined) this.material.color.set(color);
    this.material.opacity = opacity;
    this.mesh.visible = opacity > 0.001;
  }

  /** Tween to `opacity` over `seconds`. A newer fade overrides an older one. */
  fade(opacity, seconds, color) {
    if (color !== undefined) this.material.color.set(color);
    const from = this.material.opacity;
    const token = ++this.token;
    return this.scheduler.tween(
      seconds,
      (k) => {
        if (token === this.token) this.set(from + (opacity - from) * k);
      },
      ease.inOut,
    );
  }
}
