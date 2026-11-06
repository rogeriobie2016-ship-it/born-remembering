import * as THREE from 'three';
import { clamp } from './util.js';

// Your hands. In a headset the painted hands sit exactly where your controllers or your real hands are, and
// close when you squeeze or make a fist. On a flat screen they come from your shoulders and reach for the mouse.
//
// A scene that wants hands of its own (a Siren's, an old man's) hands them over with adopt(): it keeps their
// colour, its transformations and its timelines; this class decides where they are.

const FINGER_TIPS = ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'];
const OPEN = 0.17; // metres, wrist to fingertip, on an open hand
const FIST = 0.085;
const REACH = 0.62; // how far in front of your eyes the hand reaches on a flat screen
const WRIST_TO_PALM = 0.07;
const IDLE = 5; // seconds without the mouse moving before the hand on a flat screen withdraws

/** How closed a hand is from a controller's buttons (0..1 each). */
export function curlFromButtons(trigger, squeeze) {
  return clamp(0.12 + 0.78 * Math.max(squeeze, trigger * 0.7), 0, 1);
}

/** How closed a tracked hand is from the mean distance between the wrist and the fingertips, in metres. */
export function curlFromFingers(meanDistance) {
  return clamp((OPEN - meanDistance) / (OPEN - FIST), 0, 1);
}

const _pos = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _wrist = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _parent = new THREE.Quaternion();
const FINGERS_FORWARD = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2); // the card's +Y to the pose's -Z

export class PlayerHands {
  constructor({ renderer, camera, input, interact, parent, makeHand }) {
    Object.assign(this, { renderer, camera, input, interact, parent, makeHand });
    this.adopted = [null, null]; // left, right
    this.free = false; // adopted hands reach from the shoulders on a flat screen, instead of keeping the scene's pose
    this.reach = 0.2;
    this.lift = 0.1;
    this.defaults = null;
    this.flatHand = true; // scenes with nothing to touch turn the mouse's hand off
    this.defaultLook = { skin: '#d9b293', scale: 0.95 };
    this.pointer = { x: 0, y: 0 };
    this.mouseAt = -Infinity;
    this.lastMouse = null;
    this.time = 0;
  }

  /** The scene's hands are now yours. `hands`: [left, right], either may be null. */
  adopt(hands, { free = false, reach = 0.2, lift = 0.1 } = {}) {
    this.release();
    this.adopted = [hands[0] ?? null, hands[1] ?? null];
    this.free = free;
    this.reach = reach;
    this.lift = lift;
    for (const h of this.adopted) {
      if (!h) continue;
      h.curlRate = 16;
      h.userData.base = { pos: h.position.clone(), quat: h.quaternion.clone() };
      h.userData.shown = null;
    }
  }

  release() {
    for (const h of this.adopted) {
      if (!h) continue;
      if (h.userData.base) {
        h.position.copy(h.userData.base.pos);
        h.quaternion.copy(h.userData.base.quat);
      }
      h.userData.base = null;
      h.curlRate = 4;
      h.curlOverride = null;
      h.curlBoost = 0;
    }
    this.adopted = [null, null];
    this.free = false;
  }

  /** The hands you have when no scene has given you others. A baby's, in the crib. */
  look({ skin = '#d9b293', scale = 0.95 } = {}) {
    this.defaultLook = { skin, scale };
    if (this.defaults) for (const h of this.defaults) this._dress(h);
  }

  _dress(h) {
    h.setSkin(this.defaultLook.skin);
    h.scale.setScalar(this.defaultLook.scale);
  }

  _ensureDefaults() {
    if (this.defaults) return;
    this.defaults = [-1, 1].map((side) => {
      const h = this.makeHand(side);
      h.curlRate = 16;
      h.visible = false;
      h.skinMat.opacity = 0;
      this._dress(h);
      this.parent.add(h);
      return h;
    });
  }

  /** Before the scene moves things: put adopted hands back where the scene last left them. */
  pre() {
    for (const h of this.adopted) {
      if (!h?.userData.base) continue;
      h.position.copy(h.userData.base.pos);
      h.quaternion.copy(h.userData.base.quat);
    }
  }

  /** After the scene has moved things. */
  post(dt, t) {
    this.time += dt;
    this._ensureDefaults();
    const xr = this.renderer.xr.isPresenting;
    if (!xr) this._readMouse(dt);
    for (let i = 0; i < 2; i++) {
      const own = this.adopted[i];
      const def = this.defaults[i];
      if (own) own.userData.base.pos.copy(own.position), own.userData.base.quat.copy(own.quaternion);
      if (xr) this._postXR(i, own, def);
      else this._postFlat(i, own, def, dt);
      if (!own || def.visible) def.update(t, dt);
    }
  }

  _readMouse(dt) {
    const m = this.input.mouse;
    if (!m) return;
    if (!this.lastMouse || this.lastMouse.x !== m.x || this.lastMouse.y !== m.y) {
      this.mouseAt = this.time;
      this.lastMouse = { x: m.x, y: m.y };
    }
    const r = this.renderer.domElement.getBoundingClientRect();
    const k = 1 - Math.exp(-dt * 18);
    this.pointer.x += (((m.x - r.left) / r.width) * 2 - 1 - this.pointer.x) * k;
    this.pointer.y += (-(((m.y - r.top) / r.height) * 2 - 1) - this.pointer.y) * k;
  }

  // ---------- in a headset ----------

  /** The tracked hand on this side: palm position, a quaternion whose -Z runs along the fingers, and how closed it is. */
  _pose(i) {
    const handedness = i === 0 ? 'left' : 'right';
    const H = this.interact.hands.find((h) => h.state?.source?.handedness === handedness);
    if (!H) return null;
    const wrist = H.state.source.hand ? H.hand.joints?.wrist : null;
    if (wrist?.visible) {
      wrist.getWorldPosition(_wrist);
      wrist.getWorldQuaternion(_quat);
      let sum = 0;
      let n = 0;
      for (const name of FINGER_TIPS) {
        const j = H.hand.joints[name];
        if (!j?.visible) continue;
        sum += j.getWorldPosition(_tip).distanceTo(_wrist);
        n++;
      }
      _pos.set(0, 0, -WRIST_TO_PALM).applyQuaternion(_quat).add(_wrist);
      return { curl: n ? curlFromFingers(sum / n) : 0.2 };
    }
    if (!H.grip.visible) return null;
    H.grip.getWorldPosition(_pos);
    H.state.c.getWorldQuaternion(_quat); // the pointing direction, not the handle's tilt
    const pad = H.state.source.gamepad?.buttons;
    return { curl: curlFromButtons(pad?.[0]?.value ?? 0, pad?.[1]?.value ?? 0) };
  }

  _postXR(i, own, def) {
    const pose = this._pose(i);
    const hand = own || def;
    if (own) this._show(def, false);
    else this._show(def, !!pose && this.interact.handsVisible, 1);
    if (!pose) {
      if (own) own.curlOverride = null;
      return;
    }
    if (own) own.visible = true;
    hand.curlOverride = pose.curl;
    _quat.multiply(FINGERS_FORWARD);
    this._placeWorld(hand, _pos, _quat);
  }

  // ---------- on a flat screen ----------

  _postFlat(i, own, def, dt) {
    const pressed = !!this.input.down;
    const hasMouse = !!this.input.mouse;
    if (own) {
      this._show(def, false);
      own.curlOverride = null;
      own.curlBoost = pressed ? 0.35 : 0;
      if (this.free) this._reachFromShoulder(own, i, hasMouse, dt);
      else {
        // the scene's pose, leaning toward the mouse: the right hand goes further
        const k = i === 1 ? 1 : 0.4;
        this._cameraAxes();
        own.position.addScaledVector(_right, this.pointer.x * this.reach * k).addScaledVector(_up, this.pointer.y * this.lift * k);
      }
      return;
    }
    const wanted = i === 1 && this.flatHand && hasMouse && this.time - this.mouseAt < IDLE;
    this._show(def, wanted, dt);
    if (!def.visible) return;
    def.curlOverride = pressed ? 0.9 : 0.2;
    this._reachFromShoulder(def, i, true, dt);
  }

  _cameraAxes() {
    this.camera.getWorldPosition(_eye);
    _right.setFromMatrixColumn(this.camera.matrixWorld, 0);
    _up.setFromMatrixColumn(this.camera.matrixWorld, 1);
  }

  _reachFromShoulder(hand, i, hasMouse, dt) {
    const side = i === 0 ? -1 : 1;
    const x = hasMouse ? (i === 1 ? this.pointer.x : -0.42 + this.pointer.x * 0.2) : 0.42 * side;
    const y = hasMouse ? (i === 1 ? this.pointer.y : -0.42 + this.pointer.y * 0.2) : -0.42;
    this._cameraAxes();
    _pos.set(x, y, 0.5).unproject(this.camera).sub(_eye).normalize().multiplyScalar(REACH).add(_eye);
    _axis.copy(_pos).sub(_eye).addScaledVector(_right, -0.26 * side).addScaledVector(_up, 0.42).normalize();
    const size = hand.scale.x;
    _pos.addScaledVector(_axis, -0.1 * size); // the fingertips, not the palm, are at the mouse
    _quat.setFromUnitVectors(_Y, _axis);
    let shown = hand.userData.shown;
    if (!shown) shown = hand.userData.shown = { pos: _pos.clone(), quat: _quat.clone() };
    const k = 1 - Math.exp(-dt * 16);
    shown.pos.lerp(_pos, k);
    shown.quat.slerp(_quat, k);
    this._placeWorld(hand, shown.pos, shown.quat);
  }

  // ---------- both ----------

  _show(h, on, dt = 1) {
    const mat = h.skinMat;
    mat.opacity = on ? Math.min(1, mat.opacity + dt * 5) : Math.max(0, mat.opacity - dt * 3);
    h.visible = mat.opacity > 0.001;
    if (!h.visible) h.userData.shown = null;
  }

  _placeWorld(hand, pos, quat) {
    const p = hand.parent;
    p.updateWorldMatrix(true, false);
    hand.position.copy(pos);
    p.worldToLocal(hand.position);
    p.getWorldQuaternion(_parent).invert();
    hand.quaternion.copy(_parent).multiply(quat);
  }
}
