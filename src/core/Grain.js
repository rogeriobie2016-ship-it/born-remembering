import * as THREE from 'three';

/**
 * Film grain + vignette glued to the camera: makes every scene feel filmed,
 * in the headset too. One cheap full-view pass; drawn under the haze and the fader.
 */
export class Grain {
  constructor(camera) {
    this.uniforms = {
      grain: { value: 0.05 },
      vignette: { value: 0.25 },
      color: { value: new THREE.Color('#140d0a') },
      time: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.BackSide,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float grain;
        uniform float vignette;
        uniform vec3 color;
        uniform float time;
        varying vec3 vDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec3 d = normalize(vDir);
          float v = 1.0 - smoothstep(0.45, 1.0, -d.z);           // 0 ahead, 1 at the edges
          float n = hash(floor(gl_FragCoord.xy) + fract(time * 7.13) * 91.7);
          float va = vignette * v * v;
          float ga = grain * abs(n - 0.5) * 2.0;
          vec3 c = mix(vec3(step(0.5, n)), color, va / max(va + ga, 1e-4));
          gl_FragColor = vec4(c, clamp(va + ga, 0.0, 0.9));
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), mat);
    this.mesh.renderOrder = 8400;
    this.mesh.frustumCulled = false;
    camera.add(this.mesh);
  }

  set({ grain, vignette, color } = {}) {
    if (grain !== undefined) this.uniforms.grain.value = grain;
    if (vignette !== undefined) this.uniforms.vignette.value = vignette;
    if (color !== undefined) this.uniforms.color.value.set(color);
  }

  reset() {
    this.set({ grain: 0.05, vignette: 0.25, color: '#140d0a' });
  }

  update(t) {
    this.uniforms.time.value = t;
    this.mesh.visible = this.uniforms.grain.value + this.uniforms.vignette.value > 0.001;
  }
}
