import * as THREE from 'three';
import { glowTexture, lerp } from './util.js';
import { TextBlock } from './TextBlock.js';

/** Slowly drifting motes of light around the viewer. */
export class Dust extends THREE.Points {
  constructor({ count = 500, radius = 8, inner = 0.8, color = '#fff4e0', size = 0.04, opacity = 0.5, speed = 0.02 } = {}) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = inner + Math.cbrt(Math.random()) * (radius - inner);
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph) * 0.6;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color,
      size,
      map: glowTexture(),
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      fog: false,
    });
    super(geo, mat);
    this.speed = speed;
    this.raycast = () => {};
  }

  update(t) {
    this.rotation.y = t * this.speed;
    this.position.y = Math.sin(t * 0.15) * 0.08;
  }
}

/** A glowing sphere of light — the universal "choose me" object. */
export class Orb extends THREE.Group {
  constructor({ label = '', color = '#ffe9c2', radius = 0.1, labelStyle = null, labelSize = 0.08 } = {}) {
    super();
    this.hover = false;
    this.k = 0;
    this.core = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 24, 16),
      new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false }),
    );
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.8,
        fog: false,
      }),
    );
    this.halo.scale.setScalar(radius * 7);
    this.halo.raycast = () => {};
    // Generous invisible hit area: easier to gaze at or tap.
    this.hit = new THREE.Mesh(new THREE.SphereGeometry(radius * 2.4, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.add(this.halo, this.core, this.hit);
    if (label) {
      this.label = new TextBlock([label], { size: labelSize, italic: false, weight: 600, spacing: 0.3, float: 0, ...labelStyle });
      this.label.position.y = -radius - labelSize * 1.75;
      this.label.setOpacity(0.85);
      this.add(this.label);
    }
    this.phase = Math.random() * 10;
  }

  setHover(on) {
    this.hover = on;
  }

  update(t, dt) {
    this.k = lerp(this.k, this.hover ? 1 : 0, Math.min(1, dt * 8));
    const breathe = 1 + Math.sin(t * 1.6 + this.phase) * 0.06;
    this.core.scale.setScalar(breathe * (1 + this.k * 0.25));
    this.halo.scale.setScalar(this.core.geometry.parameters.radius * 7 * breathe * (1 + this.k * 0.6));
    this.halo.material.opacity = 0.6 + this.k * 0.4;
    if (this.label) this.label.setOpacity(0.6 + this.k * 0.4);
  }
}
