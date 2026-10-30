import * as THREE from 'three';
import { TextBlock, wrap } from './TextBlock.js';
import { disposeObject } from './util.js';

const _pos = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _target = new THREE.Vector3();

/**
 * Narration text that lazily follows where you look (yaw only), slightly
 * below eye level. Never head-locked, so it stays comfortable in VR.
 */
export class Subtitle extends THREE.Group {
  constructor(camera, { distance = 1.6, drop = 0.28 } = {}) {
    super();
    this.camera = camera;
    this.distance = distance;
    this.drop = drop;
    this.block = null;
    this.placed = false;
  }

  update(t, dt) {
    this.camera.getWorldPosition(_pos);
    this.camera.getWorldDirection(_dir);
    _dir.y = 0;
    if (_dir.lengthSq() < 1e-4) _dir.set(0, 0, -1);
    _dir.normalize();
    _target.copy(_pos).addScaledVector(_dir, this.distance);
    _target.y = _pos.y - this.drop;
    if (!this.placed) {
      this.position.copy(_target);
      this.placed = true;
    } else this.position.lerp(_target, Math.min(1, dt * 1.6));
    this.lookAt(_pos.x, this.position.y, _pos.z);
    if (this.block) this.block.update(t);
  }

  /** Show a line, hold it, fade it. Owned by `scene` (cancelled if the scene ends). */
  async show(scene, text, { hold = 2.5, size = 0.078, perWord = 0.12, ...style } = {}) {
    if (this.block) this._drop(this.block);
    const block = new TextBlock(wrap(text, 38), { size, lineHeight: 1.45, ...style });
    this.block = block;
    this.add(block);
    await block.reveal(scene, { perWord, fade: 0.8, linePause: 0.1 });
    await scene.wait(hold);
    if (this.block !== block) return;
    await block.fadeOut(scene, 1.2);
    if (this.block === block) {
      this._drop(block);
      this.block = null;
    }
  }

  _drop(block) {
    this.remove(block);
    disposeObject(block);
  }
}
