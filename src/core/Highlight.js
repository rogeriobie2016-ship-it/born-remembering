import * as THREE from 'three';
import { glowTexture } from './util.js';

const POOL = 6;
const MAX_RADIUS = 1.1; // hit boxes can be huge: the glow stays a glow
const GLOW = 0.32;

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _c = new THREE.Vector3();

/** A soft glow around whatever you are pointing at, so you can tell what is interactive. */
export class Highlight {
  constructor(scene) {
    this.items = [];
    for (let i = 0; i < POOL; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffe6b8', transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }),
      );
      s.visible = false;
      s.renderOrder = 8100;
      s.raycast = () => {};
      scene.add(s);
      this.items.push({ sprite: s, obj: null, on: false });
    }
  }

  _measure(obj) {
    _box.setFromObject(obj);
    _box.getSize(_size);
    _box.getCenter(_c);
    return { radius: Math.min(MAX_RADIUS, Math.max(_size.x, _size.y, _size.z) * 0.5), center: obj.worldToLocal(_c.clone()) };
  }

  set(obj, on) {
    let item = this.items.find((i) => i.obj === obj);
    if (on && !item) {
      item = this.items.find((i) => !i.obj);
      if (!item) return;
      item.obj = obj;
      Object.assign(item, this._measure(obj));
      item.sprite.visible = true;
    }
    if (item) item.on = on;
  }

  clear() {
    for (const i of this.items) {
      i.obj = null;
      i.on = false;
      i.sprite.visible = false;
      i.sprite.material.opacity = 0;
    }
  }

  update(dt, t) {
    for (const i of this.items) {
      if (!i.obj) continue;
      const m = i.sprite.material;
      const want = i.on ? GLOW * (0.85 + Math.sin(t * 3.2) * 0.15) : 0;
      m.opacity += (want - m.opacity) * Math.min(1, dt * 9);
      i.sprite.position.copy(i.center);
      i.obj.localToWorld(i.sprite.position);
      i.sprite.scale.setScalar(i.radius * 3.2);
      if (!i.on && m.opacity < 0.01) {
        i.obj = null;
        i.sprite.visible = false;
      }
    }
  }
}
