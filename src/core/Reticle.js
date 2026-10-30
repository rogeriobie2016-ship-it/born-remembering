import * as THREE from 'three';
import { lerp } from './util.js';

const ORDER = 9000;

function overlayMaterial(params) {
  return new THREE.MeshBasicMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
    ...params,
  });
}

/** Gaze cursor: a dot that swells over targets, plus a ring that fills while you dwell. */
export class Reticle extends THREE.Group {
  constructor() {
    super();
    this.position.z = -1;
    this.active = 0;

    this.dot = new THREE.Mesh(new THREE.CircleGeometry(0.005, 20), overlayMaterial({ color: 0xffffff, opacity: 0.55 }));
    this.track = new THREE.Mesh(new THREE.RingGeometry(0.016, 0.022, 48), overlayMaterial({ color: 0xffffff, opacity: 0 }));

    this.ringMat = new THREE.ShaderMaterial({
      uniforms: { progress: { value: 0 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float progress;
        varying vec2 vUv;
        void main() {
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          float aa = fwidth(r) * 1.5;
          float band = smoothstep(0.727 - aa, 0.727 + aa, r) * (1.0 - smoothstep(1.0 - aa, 1.0, r));
          float a = atan(p.x, p.y) / 6.2831853;
          a = a < 0.0 ? a + 1.0 : a;
          float alpha = band * step(a, progress);
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(1.0, 0.96, 0.88, alpha);
        }`,
    });
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(0.044, 0.044), this.ringMat);

    for (const m of [this.track, this.ring, this.dot]) {
      m.renderOrder = ORDER;
      m.frustumCulled = false;
      this.add(m);
    }
  }

  update(dt, hovering, progress) {
    this.active = lerp(this.active, hovering ? 1 : 0, Math.min(1, dt * 10));
    this.dot.scale.setScalar(1 + this.active * 0.8);
    this.dot.material.opacity = 0.45 + this.active * 0.5;
    this.track.material.opacity = this.active * 0.22;
    this.ringMat.uniforms.progress.value = progress;
    this.ring.visible = progress > 0.001;
  }
}
