import * as THREE from 'three';
import { BaseScene } from '../core/SceneManager.js';
import { Dust } from '../core/props.js';
import { glowTexture } from '../core/util.js';

/** Scene 0 — ambience behind the HTML title screen. */
export class TitleScene extends BaseScene {
  showReticle = false;

  enter() {
    this.ctx.scene.background = new THREE.Color('#05040a');
    this.add(new Dust({ count: 700, opacity: 0.5, speed: 0.012 }));
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: '#ffe2b8',
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.glow.position.set(0, 0.2, -6);
    this.glow.scale.setScalar(3);
    this.root.add(this.glow);
  }

  update(dt, t) {
    super.update(dt, t);
    const b = 1 + Math.sin(t * 0.8) * 0.12;
    this.glow.scale.setScalar(3 * b);
    this.glow.material.opacity = 0.25 + Math.sin(t * 0.8) * 0.08;
  }
}
