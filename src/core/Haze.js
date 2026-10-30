import * as THREE from 'three';

/**
 * Newborn eyesight: a milky veil and a soft vignette glued to the camera
 * (works in the headset), plus a real CSS blur on flat screens, where it is cheap.
 * `amount` 0 = clear, 1 = barely-open newborn eyes.
 */
export class Haze {
  constructor(camera, renderer) {
    this.renderer = renderer;
    this.amount = 0;
    this.blur = 0; // CSS px, flat screens only
    this.saturate = 1;
    this.uniforms = {
      amount: { value: 0 },
      color: { value: new THREE.Color('#f4ece2') },
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
        uniform float amount;
        uniform vec3 color;
        uniform float time;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float c = -d.z;                                   // 1 straight ahead
          float edge = 1.0 - smoothstep(0.3, 0.97, c);       // vignette
          float blot = sin(d.x * 6.0 + time * 0.25) * sin(d.y * 8.0 - time * 0.18) * 0.5 + 0.5;
          float a = amount * (0.16 + 0.12 * blot + edge * 0.8);
          gl_FragColor = vec4(color, clamp(a, 0.0, 0.97));
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), mat);
    this.mesh.renderOrder = 8500;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    camera.add(this.mesh);
    this._css = '';
  }

  get color() {
    return this.uniforms.color.value;
  }

  set({ amount, blur, saturate, color } = {}) {
    if (amount !== undefined) this.amount = amount;
    if (blur !== undefined) this.blur = blur;
    if (saturate !== undefined) this.saturate = saturate;
    if (color !== undefined) this.uniforms.color.value.set(color);
  }

  reset() {
    this.set({ amount: 0, blur: 0, saturate: 1, color: '#f4ece2' });
  }

  update(dt, t) {
    this.uniforms.time.value = t;
    this.uniforms.amount.value = this.amount;
    this.mesh.visible = this.amount > 0.001;
    const flat = !this.renderer.xr.isPresenting;
    let css = '';
    if (flat && this.blur > 0.05) css += `blur(${this.blur.toFixed(2)}px) `;
    if (flat && Math.abs(this.saturate - 1) > 0.01) css += `saturate(${this.saturate.toFixed(2)})`;
    if (css !== this._css) {
      this._css = css;
      this.renderer.domElement.style.filter = css;
    }
  }
}
