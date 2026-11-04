import * as THREE from 'three';
import { clamp } from './util.js';

const DRAG_SPEED = 0.0045; // radians per pixel
const KEY_SPEED = 1.6; // radians per second
const PITCH_LIMIT = THREE.MathUtils.degToRad(85);

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const SCREEN_FIX = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90° around X
const _euler = new THREE.Euler();
const _q = new THREE.Quaternion();

/**
 * First-person look-around for flat screens (disabled while in VR).
 * The camera rotates in place — it never orbits — so the viewer always
 * stays inside the scene:
 *  - mouse / finger drag (grab-the-world)
 *  - arrow keys, and WASD unless the scene is walkable (then WASD walks; see Locomotion)
 *  - phone gyroscope (DeviceOrientation; asks permission on iOS), with drag adding extra yaw
 */
export class LookControls {
  constructor(camera, dom) {
    this.camera = camera;
    this.enabled = true;
    this.yaw = 0;
    this.pitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.keys = new Set();
    this.wasdLook = true;

    this.gyro = false;
    this.deviceQ = new THREE.Quaternion();
    this.hasOrientation = false;
    this.headingOffset = 0;
    this.needsCalibration = true;

    let drag = null;
    dom.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary) return;
      drag = { x: e.clientX, y: e.clientY };
      dom.setPointerCapture?.(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!drag || !e.isPrimary || !this.enabled) return;
      this.targetYaw += (e.clientX - drag.x) * DRAG_SPEED;
      if (!this.hasOrientation) this.targetPitch = clamp(this.targetPitch + (e.clientY - drag.y) * DRAG_SPEED, -PITCH_LIMIT, PITCH_LIMIT);
      drag = { x: e.clientX, y: e.clientY };
    });
    const end = () => (drag = null);
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);

    const keyCodes = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];
    window.addEventListener('keydown', (e) => keyCodes.includes(e.code) && this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    this._onOrientation = (e) => {
      if (e.alpha === null || e.beta === null) return;
      const d = THREE.MathUtils.DEG2RAD;
      const orient = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * d;
      _euler.set(e.beta * d, e.alpha * d, -e.gamma * d, 'YXZ');
      this.deviceQ.setFromEuler(_euler).multiply(SCREEN_FIX).multiply(_q.setFromAxisAngle(Z_AXIS, -orient));
      this.hasOrientation = true;
    };
  }

  /**
   * Must be called from inside a user gesture (iOS permission prompt).
   * Resolves true if orientation events are allowed.
   */
  async enableGyro() {
    if (typeof DeviceOrientationEvent === 'undefined') return false;
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') return false;
      }
    } catch {
      return false;
    }
    window.addEventListener('deviceorientation', this._onOrientation);
    this.gyro = true;
    this.needsCalibration = true;
    this.targetPitch = this.pitch = 0;
    return true;
  }

  disableGyro() {
    window.removeEventListener('deviceorientation', this._onOrientation);
    this.gyro = false;
    this.hasOrientation = false;
  }

  /** Face straight ahead (scenes call this on enter). With the gyro, the current heading becomes "ahead". */
  reset(yaw = 0, pitch = 0) {
    this.yaw = this.targetYaw = yaw;
    this.pitch = this.targetPitch = pitch;
    this.needsCalibration = true;
  }

  update(dt) {
    if (!this.enabled) return;
    const k = this.keys;
    const w = this.wasdLook;
    if (k.has('ArrowLeft') || (w && k.has('KeyA'))) this.targetYaw += KEY_SPEED * dt;
    if (k.has('ArrowRight') || (w && k.has('KeyD'))) this.targetYaw -= KEY_SPEED * dt;
    if (!this.hasOrientation) {
      if (k.has('ArrowUp') || (w && k.has('KeyW'))) this.targetPitch += KEY_SPEED * dt;
      if (k.has('ArrowDown') || (w && k.has('KeyS'))) this.targetPitch -= KEY_SPEED * dt;
      this.targetPitch = clamp(this.targetPitch, -PITCH_LIMIT, PITCH_LIMIT);
    }

    const s = Math.min(1, dt * 14);
    this.yaw += (this.targetYaw - this.yaw) * s;
    this.pitch += (this.targetPitch - this.pitch) * s;

    if (this.gyro && this.hasOrientation) {
      if (this.needsCalibration) {
        _euler.setFromQuaternion(this.deviceQ, 'YXZ');
        this.headingOffset = -_euler.y;
        this.needsCalibration = false;
      }
      _q.setFromAxisAngle(Y_AXIS, this.headingOffset + this.yaw);
      this.camera.quaternion.copy(_q).multiply(this.deviceQ);
    } else {
      _euler.set(this.pitch, this.yaw, 0, 'YXZ');
      this.camera.quaternion.setFromEuler(_euler);
    }
  }
}
