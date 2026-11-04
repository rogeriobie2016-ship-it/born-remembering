import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { stepBody, throwVelocity } from './walk.js';

const REACH = 0.07; // how far past an object's radius a hand can grab it
const PULL_TIME = 0.22; // a far object flies to your hand this fast
const SAMPLES = 6;
const FLAT_HOLD = new THREE.Vector3(0.12, -0.16, -0.55);
const FLAT_THROW = 4.2;
const LOST_RANGE = 70;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _axis = new THREE.Vector3();

/**
 * Touching and holding things.
 *  - addGrabbable(obj, opts): grip or pinch it near your hand, or point at it from afar and it
 *    flies to you; let go and it falls, bounces and rolls. Flat screens: click to hold, click to throw.
 *  - addTouch(obj, opts): reacts when a hand enters it (or when clicked on a flat screen).
 * Haptics on touch and on grab. Hover glow comes from `input`.
 */
export class Interact {
  constructor({ renderer, camera, input, parent }) {
    Object.assign(this, { renderer, camera, input });
    this.bodies = new Map();
    this.touches = new Map();
    this.flatHeld = null;
    this.env = { floorY: 0, blockers: [] };
    this.hands = [];
    this.handsVisible = false;

    const controllerModels = new XRControllerModelFactory();
    const handModels = new XRHandModelFactory();
    for (let i = 0; i < 2; i++) {
      const grip = renderer.xr.getControllerGrip(i);
      const hand = renderer.xr.getHand(i);
      const state = input.controllers[i];
      const controllerModel = controllerModels.createControllerModel(grip);
      const handModel = handModels.createHandModel(hand, 'mesh');
      controllerModel.visible = handModel.visible = false;
      grip.add(controllerModel);
      hand.add(handModel);
      parent.add(grip, hand);
      const h = { i, state, grip, hand, controllerModel, handModel, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), tracked: false, held: null, samples: [], near: null };
      state.c.addEventListener('selectstart', () => this._press(h, 'select'));
      state.c.addEventListener('selectend', () => this._releaseButton(h, 'select'));
      state.c.addEventListener('squeezestart', () => this._press(h, 'squeeze'));
      state.c.addEventListener('squeezeend', () => this._releaseButton(h, 'squeeze'));
      this.hands.push(h);
    }
  }

  get xr() {
    return this.renderer.xr.isPresenting;
  }

  /** Controllers and hands are only drawn in scenes where they can do something. */
  setHandsVisible(on) {
    this.handsVisible = on;
    for (const h of this.hands) h.controllerModel.visible = h.handModel.visible = on;
  }

  /**
   * opts: radius (m, for physics), reach (m, how near a hand must come; default = radius),
   *       bounce, friction, floorY, onGrab(obj), onRelease(obj), onHit(speed, obj),
   *       resting (default true: stays put until touched)
   */
  addGrabbable(obj, { radius = 0.08, reach = radius, bounce = 0.35, friction = 2.2, floorY, onGrab, onRelease, onHit, resting = true } = {}) {
    obj.updateWorldMatrix(true, false);
    const b = {
      obj,
      x: obj.position.x,
      y: obj.position.y,
      z: obj.position.z,
      vx: 0,
      vy: 0,
      vz: 0,
      wx: 0,
      wz: 0,
      radius,
      reach,
      bounce,
      friction,
      floorY,
      asleep: resting,
      held: null,
      pull: 0,
      onGrab,
      onRelease,
      onHit,
      home: obj.position.clone(),
    };
    this.bodies.set(obj, b);
    // small or hollow things (a crown) are hard to point at: give the ray a bigger target
    const proxy = new THREE.Mesh(new THREE.SphereGeometry(reach * 1.4, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    obj.add(proxy);
    this.input.add(obj, {
      dwell: false,
      onSelect: () => {
        if (!this.xr) this._flatToggle(b);
      },
    });
    return obj;
  }

  /** opts: radius (m), onTouch(obj), cooldown (s), haptic (0..1) */
  addTouch(obj, { radius = 0.25, onTouch, cooldown = 1, haptic = 0.4 } = {}) {
    const t = { obj, radius, onTouch, cooldown, haptic, wait: 0, inside: false };
    this.touches.set(obj, t);
    this.input.add(obj, {
      dwell: false,
      onSelect: () => this._touch(t, null), // a click, a tap, or a ray and trigger from afar
    });
    return obj;
  }

  remove(obj) {
    const b = this.bodies.get(obj);
    if (b?.held) b.held.held = null;
    if (this.flatHeld === b) this._flatLetGo();
    this.bodies.delete(obj);
    this.touches.delete(obj);
    this.input.remove(obj);
  }

  /** Drop everything (scene change). */
  clear() {
    this._flatLetGo();
    for (const h of this.hands) {
      h.held = null;
      h.near = null;
    }
    this.bodies.clear();
    this.touches.clear();
    this.env = { floorY: 0, blockers: [] };
    this.setHandsVisible(false);
  }

  _pulse(h, strength, ms) {
    h?.state?.source?.gamepad?.hapticActuators?.[0]?.pulse?.(strength, ms);
  }

  _touch(t, h) {
    if (t.wait > 0) return;
    t.wait = t.cooldown;
    this._pulse(h, t.haptic, 40);
    t.onTouch?.(t.obj);
  }

  // ---------- headset ----------

  _nearest(h) {
    let best = null;
    let bestD = Infinity;
    for (const b of this.bodies.values()) {
      if (b.held) continue;
      b.obj.getWorldPosition(_a);
      const d = _a.distanceTo(h.pos) - b.reach;
      if (d < REACH && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  _press(h, button) {
    if (h.held || !h.tracked) return;
    let b = this._nearest(h);
    let pull = 0;
    if (!b) {
      const hit = this.input.rayTarget(h.state);
      if (hit && this.bodies.has(hit) && !this.bodies.get(hit).held) {
        b = this.bodies.get(hit);
        pull = 1;
      }
    }
    if (!b) return;
    this._grab(h, b, button, pull);
  }

  _grab(h, b, button, pull) {
    h.held = b;
    h.button = button;
    h.samples.length = 0;
    b.held = h;
    b.pull = pull;
    b.asleep = false;
    if (button === 'select') h.state.grabbing = true;
    b.obj.getWorldPosition(_a);
    b.from = _a.clone();
    b.grabQuat = _q.copy(h.quat).invert().multiply(b.obj.getWorldQuaternion(_q2)).clone();
    // Near grabs keep the object where the hand met it; far grabs bring it into the palm.
    b.offset = pull ? new THREE.Vector3() : _a.clone().sub(h.pos).applyQuaternion(_q.copy(h.quat).invert());
    this._pulse(h, 0.7, 50);
    b.onGrab?.(b.obj);
  }

  _releaseButton(h, button) {
    if (button === 'select') {
      // the 'select' that follows a grab must not also count as a click
      queueMicrotask(() => (h.state.grabbing = false));
    }
    if (h.held && h.button === button) this._release(h);
  }

  _release(h) {
    const b = h.held;
    h.held = null;
    b.held = null;
    const v = throwVelocity(h.samples);
    b.vx = v[0];
    b.vy = v[1];
    b.vz = v[2];
    b.asleep = false;
    this._syncFromObject(b);
    this._pulse(h, 0.25, 25);
    b.onRelease?.(b.obj);
  }

  _syncFromObject(b) {
    b.x = b.obj.position.x;
    b.y = b.obj.position.y;
    b.z = b.obj.position.z;
  }

  _updateHand(h, dt) {
    const src = h.state.source;
    const usingHand = !!src?.hand && h.hand.joints?.['index-finger-tip']?.visible;
    if (usingHand) {
      const index = h.hand.joints['index-finger-tip'];
      const thumb = h.hand.joints['thumb-tip'];
      index.getWorldPosition(_a);
      thumb.getWorldPosition(_b);
      h.pos.copy(_a).add(_b).multiplyScalar(0.5);
      h.hand.joints.wrist?.getWorldQuaternion(h.quat);
      h.tracked = true;
    } else if (h.grip.visible) {
      h.grip.getWorldPosition(h.pos);
      h.grip.getWorldQuaternion(h.quat);
      h.tracked = true;
    } else h.tracked = false;
    if (!h.tracked) {
      if (h.held) this._release(h);
      return;
    }

    h.samples.push({ x: h.pos.x, y: h.pos.y, z: h.pos.z, t: performance.now() / 1000 });
    if (h.samples.length > SAMPLES) h.samples.shift();

    // Reaching for something: a light tick in the hand, the glow from `input`.
    const near = h.held ? null : this._nearest(h);
    if (near !== h.near) {
      if (h.near) this.input.setExtraHover(h.near.obj, h.i, false);
      if (near) {
        this.input.setExtraHover(near.obj, h.i, true);
        this._pulse(h, 0.2, 18);
      }
      h.near = near;
    }

    for (const t of this.touches.values()) {
      t.obj.getWorldPosition(_a);
      const inside = _a.distanceTo(h.pos) < t.radius;
      if (inside && !t.inside) this._touch(t, h);
      t.inside = inside;
    }

    const b = h.held;
    if (b) {
      b.pull = Math.max(0, b.pull - dt / PULL_TIME);
      _a.copy(b.offset).applyQuaternion(h.quat).add(h.pos);
      if (b.pull > 0) _a.lerp(b.from, b.pull * b.pull);
      this._place(b, _a, _q.copy(h.quat).multiply(b.grabQuat));
    }
  }

  /** Put an object at a world position and orientation, whatever its parent. */
  _place(b, pos, quat) {
    const parent = b.obj.parent;
    parent.updateWorldMatrix(true, false);
    b.obj.position.copy(parent.worldToLocal(_b.copy(pos)));
    b.obj.quaternion.copy(parent.getWorldQuaternion(_q2).invert().multiply(quat));
  }

  // ---------- flat screens ----------

  _flatToggle(b) {
    if (this.flatHeld) return;
    this.flatHeld = b;
    b.held = 'flat';
    b.asleep = false;
    b.onGrab?.(b.obj);
    this.input.capture = () => this._flatThrow();
  }

  _flatLetGo() {
    if (this.flatHeld) this.flatHeld.held = null;
    this.flatHeld = null;
    this.input.capture = null;
  }

  _flatThrow() {
    const b = this.flatHeld;
    this._flatLetGo();
    this.camera.getWorldDirection(_a);
    b.vx = _a.x * FLAT_THROW;
    b.vy = _a.y * FLAT_THROW + 1.4;
    b.vz = _a.z * FLAT_THROW;
    this._syncFromObject(b);
    b.onRelease?.(b.obj);
  }

  // ---------- every frame ----------

  update(dt) {
    for (const t of this.touches.values()) t.wait = Math.max(0, t.wait - dt);
    if (this.xr) for (const h of this.hands) this._updateHand(h, dt);

    const f = this.flatHeld;
    if (f) {
      _a.copy(FLAT_HOLD).applyQuaternion(this.camera.getWorldQuaternion(_q)).add(this.camera.getWorldPosition(_b));
      f.obj.position.lerp(f.obj.parent.worldToLocal(_a), Math.min(1, dt * 12));
      f.obj.rotateY(dt * 0.5);
    }

    for (const b of this.bodies.values()) {
      if (b.held || b.asleep) continue;
      const hit = stepBody(b, dt, { floorY: b.floorY ?? this.env.floorY, blockers: this.env.blockers });
      if (hit > 0.5) b.onHit?.(hit, b.obj);
      b.obj.position.set(b.x, b.y, b.z);
      // rolling: spin matches the speed over the ground
      const speed = Math.hypot(b.vx, b.vz);
      if (speed > 0.01) {
        _axis.set(b.vz, 0, -b.vx).normalize();
        b.obj.rotateOnWorldAxis(_axis, (speed / b.radius) * dt);
      }
      if (Math.hypot(b.x - b.home.x, b.z - b.home.z) > LOST_RANGE || b.y < -30) {
        b.x = b.home.x;
        b.y = b.home.y;
        b.z = b.home.z;
        b.vx = b.vy = b.vz = 0;
        b.asleep = true;
        b.obj.position.copy(b.home);
      }
    }
  }
}
