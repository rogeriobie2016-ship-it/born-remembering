import * as THREE from 'three';
import { Reticle } from './Reticle.js';

const TAP_MAX_MOVE = 10; // px
const TAP_MAX_TIME = 500; // ms
const FIRE_COOLDOWN = 350; // ms

const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _ndc = new THREE.Vector2();

function isShown(o) {
  for (let x = o; x; x = x.parent) if (!x.visible) return false;
  return true;
}

/**
 * One interaction model for every platform:
 *  - gaze (centre of view) with a dwell ring — desktop, phone and headset
 *  - mouse click / finger tap on an object
 *  - XR controller ray + trigger (or hand pinch)
 *  - Space / Enter on keyboard
 * Selecting an object calls its `onSelect`; selecting empty space calls
 * `onSelectNothing` (the active scene decides what that means).
 */
export class Input {
  constructor({ renderer, camera, rig, settings }) {
    this.renderer = renderer;
    this.camera = camera;
    this.settings = settings;
    this.targets = new Set();
    this.enabled = true;
    this.onSelectNothing = null;

    this.raycaster = new THREE.Raycaster();
    this.raycaster.camera = camera;

    this.reticle = new Reticle();
    camera.add(this.reticle);

    this.gazeTarget = null;
    this.gazeTime = 0;
    this.mouse = null;
    this.mouseTarget = null;
    this.hovered = new Set();
    this.lastFire = 0;
    this.down = null;
    this.controllers = [];

    const el = renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      if (e.isPrimary) this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    el.addEventListener('pointerup', (e) => {
      const d = this.down;
      this.down = null;
      if (!d || !e.isPrimary) return;
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      if (moved < TAP_MAX_MOVE && performance.now() - d.t < TAP_MAX_TIME) this._tap(e.clientX, e.clientY);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') this.mouse = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointerleave', () => (this.mouse = null));

    window.addEventListener('keydown', (e) => {
      if (e.repeat || (e.code !== 'Space' && e.code !== 'Enter')) return;
      if (e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      this._fire(this.mouseTarget || this.gazeTarget);
    });

    for (let i = 0; i < 2; i++) this._setupController(i, rig);
  }

  /** Make `obj` (and its children) selectable. `dwell`: true, false, or seconds of gaze needed. */
  add(obj, { onSelect, onHover, dwell = true } = {}) {
    obj.userData.interactive = { onSelect, onHover, dwell };
    this.targets.add(obj);
    return obj;
  }

  remove(obj) {
    this.targets.delete(obj);
    this.hovered.delete(obj);
  }

  clear() {
    this.targets.clear();
    this.hovered.clear();
    this.gazeTarget = null;
    this.mouseTarget = null;
    this.gazeTime = 0;
  }

  _setupController(index, rig) {
    const c = this.renderer.xr.getController(index);
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xfff4e0, transparent: true, opacity: 0.4 }));
    line.scale.z = 4;
    line.visible = false;
    c.add(line);
    const state = { c, line, source: null };
    c.addEventListener('connected', (e) => {
      state.source = e.data;
      line.visible = e.data.targetRayMode === 'tracked-pointer';
    });
    c.addEventListener('disconnected', () => {
      state.source = null;
      line.visible = false;
    });
    c.addEventListener('select', () => {
      this._rayFromObject(c);
      const hit = this._pick();
      this._fire(hit ? hit.obj : null, state.source);
    });
    rig.add(c);
    this.controllers.push(state);
  }

  _rayFromObject(obj) {
    _m.identity().extractRotation(obj.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(obj.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(_m);
  }

  _rayFromScreen(x, y) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    _ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(_ndc, this.camera);
  }

  _pick() {
    if (!this.enabled || this.targets.size === 0) return null;
    const list = [...this.targets].filter(isShown);
    if (!list.length) return null;
    const hits = this.raycaster.intersectObjects(list, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !this.targets.has(o)) o = o.parent;
      if (o && isShown(h.object)) return { obj: o, distance: h.distance };
    }
    return null;
  }

  _tap(x, y) {
    if (this.renderer.xr.isPresenting) return;
    this._rayFromScreen(x, y);
    const hit = this._pick();
    this._fire(hit ? hit.obj : null);
  }

  _fire(target, source) {
    if (!this.enabled) return;
    const now = performance.now();
    if (now - this.lastFire < FIRE_COOLDOWN) return;
    this.lastFire = now;
    if (target) {
      const pad = source && source.gamepad;
      if (pad && pad.hapticActuators && pad.hapticActuators[0]) pad.hapticActuators[0].pulse(0.6, 60);
      target.userData.interactive.onSelect?.(target);
    } else {
      this.onSelectNothing?.();
    }
  }

  update(dt) {
    const hovered = new Set();

    // Gaze from the centre of view.
    this.camera.getWorldPosition(_p);
    this.camera.getWorldDirection(_d);
    this.raycaster.set(_p, _d);
    const g = this._pick();
    const gt = g ? g.obj : null;
    if (gt !== this.gazeTarget) {
      this.gazeTarget = gt;
      this.gazeTime = 0;
    }
    let progress = 0;
    if (gt) {
      hovered.add(gt);
      if (gt.userData.interactive.dwell) {
        this.gazeTime += dt;
        const need = typeof gt.userData.interactive.dwell === 'number' ? gt.userData.interactive.dwell : this.settings.gazeDwell;
        progress = Math.max(0, this.gazeTime / need);
        if (progress >= 1) {
          this._fire(gt);
          this.gazeTime = -1; // short pause before it could fire again
          progress = 0;
        }
      }
    }
    this.reticle.update(dt, !!gt, Math.min(progress, 1));

    // Mouse hover (desktop).
    this.mouseTarget = null;
    if (this.mouse && !this.renderer.xr.isPresenting) {
      this._rayFromScreen(this.mouse.x, this.mouse.y);
      const m = this._pick();
      if (m) {
        this.mouseTarget = m.obj;
        hovered.add(m.obj);
      }
    }
    this.renderer.domElement.style.cursor = this.mouseTarget ? 'pointer' : '';

    // XR controller rays.
    for (const s of this.controllers) {
      if (!s.line.visible) continue;
      this._rayFromObject(s.c);
      const h = this._pick();
      s.line.scale.z = h ? h.distance : 4;
      if (h) hovered.add(h.obj);
    }

    for (const o of this.hovered) if (!hovered.has(o)) o.userData.interactive?.onHover?.(false, o);
    for (const o of hovered) if (!this.hovered.has(o)) o.userData.interactive?.onHover?.(true, o);
    this.hovered = hovered;
  }
}
