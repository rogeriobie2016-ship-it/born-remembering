import * as THREE from 'three';
import { clampToArea, teleportArc, tapTarget, glideSpeed } from './walk.js';

const WALK_SPEED = 1.7; // metres per second (WASD, smooth walking)
const TAP_REACH = 4.5; // one click takes you at most this far: a click near the horizon is not a journey
const STUCK_AFTER = 0.3; // seconds without getting closer (a tree in the way): give up and stand still
const STICK_DEAD = 0.22;
const SNAP_ANGLE = Math.PI / 6;
const STICK_ON = 0.7;
const STICK_OFF = 0.3;
const HOLD_TO_AIM = 0.35; // seconds of trigger or pinch on empty space before the arc appears
const BLINK_DOWN = 0.07;
const BLINK_UP = 0.14;
const ARC_DOTS = 26;

const _head = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _p = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _dummy = new THREE.Object3D();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Darkens the edges of the view while you move (comfort), or all of it for a teleport blink. */
class ComfortVignette extends THREE.Mesh {
  constructor() {
    super(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: { k: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vP;
          void main() { vP = position.xy * 2.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float k;
          varying vec2 vP;
          void main() {
            float r = length(vP);
            float inner = mix(1.1, 0.0, k);
            gl_FragColor = vec4(0.0, 0.0, 0.0, smoothstep(inner, inner + 0.28, r));
          }`,
      }),
    );
    this.position.z = -0.12;
    this.scale.setScalar(0.6);
    this.renderOrder = 8600;
    this.frustumCulled = false;
    this.raycast = () => {};
    this.visible = false;
  }

  set amount(k) {
    this.material.uniforms.k.value = k;
    this.visible = k > 0.01;
  }
}

/**
 * Getting around. Scenes opt in with `this.walkArea = { center, radius, blockers, floorY }`.
 *  - headset: real walking, teleport (push a stick forward, or hold trigger / pinch on
 *    empty space, then let go), snap turn, optional smooth walking with a comfort vignette
 *  - desktop: WASD (the arrow keys still look around), or click the ground; a ring shows where
 *  - phone: tap the ground to go there
 *
 * `offset` sits between the rig and the camera: it brings the head back to the rig's
 * position, facing forward, when a scene starts. Scenes keep writing `rig.position` as
 * "where the eye is" and need to know nothing about where the viewer physically stands.
 */
export class Locomotion {
  constructor({ renderer, scene, camera, rig, offset, input, look, prefs }) {
    Object.assign(this, { renderer, camera, rig, offset, input, look, prefs });
    this.area = null;
    this.keys = new Set();
    this.vel = new THREE.Vector2();
    this.dest = null;
    this.aiming = null;
    this.blink = 0;
    this.blinkDir = 0;
    this.pendingLanding = null;
    this.snapReady = [true, true];
    this.needsRecenter = false;
    this.comfort = 0;
    this.buttonsDown = [false, false];
    this.onToggle = null; // (prefKey) => the viewer flipped a setting from the left controller

    this.vignette = new ComfortVignette();
    camera.add(this.vignette);

    // the arc: a line of beads, thick enough to read in a headset
    const beadMat = new THREE.MeshBasicMaterial({ color: '#ffe9c2', transparent: true, opacity: 0.85, depthWrite: false, fog: false, toneMapped: false });
    this.beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 8, 6), beadMat, ARC_DOTS);
    this.beads.frustumCulled = false;
    this.beads.visible = false;
    this.beads.raycast = () => {};
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.28, 40),
      new THREE.MeshBasicMaterial({ color: '#ffe9c2', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, fog: false, toneMapped: false }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.marker.raycast = () => {};
    scene.add(this.beads, this.marker);

    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        this.stop(); // the system may swallow the key's release
        return;
      }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft'].includes(e.code)) this.keys.add(e.code);
      if (e.code === 'Escape') this.stop();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.stop());
    document.addEventListener('visibilitychange', () => this.stop());
    // A click always means "stop" first. It also frees keys whose release got lost.
    renderer.domElement.addEventListener('pointerdown', () => {
      this.swallowTap = !!this.dest;
      this.stop();
    });
    window.addEventListener('pointerup', () => setTimeout(() => (this.swallowTap = false), 0));

    input.onGroundTap = (ray) => this._tapGround(ray);
    for (const s of input.controllers) {
      s.c.addEventListener('selectstart', () => {
        if (!this.area || s.grabbing || input.rayTarget(s)) return;
        s.aimHold = 0.0001;
      });
      s.c.addEventListener('selectend', () => {
        if (this.aiming === s) this._teleportNow();
        s.aimHold = 0;
      });
    }
    renderer.xr.addEventListener('sessionstart', () => (this.needsRecenter = true));
    renderer.xr.addEventListener('sessionend', () => {
      this.offset.position.set(0, 0, 0);
      this.offset.rotation.set(0, 0, 0);
      this.vignette.amount = 0;
    });
  }

  get xr() {
    return this.renderer.xr.isPresenting;
  }

  /** Stand still, now. */
  stop() {
    this.keys.clear();
    this.vel.set(0, 0);
    this.dest = null;
    this.stuck = 0;
    this.input.walking = false;
    if (!this.aiming) this.marker.visible = false;
  }

  /** Called by the scene manager: the new scene's walkable area, or null. */
  setArea(area) {
    this.area = area;
    this.look.wasdLook = !area;
    this.stop();
    this._stopAiming();
    this.input.groundTapEnabled = !!area;
  }

  /** Bring the viewer's head to the rig, facing the scene's front. */
  recenter() {
    if (!this.xr) return;
    const cam = this.camera;
    _dir.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const yaw = Math.atan2(-_dir.x, -_dir.z);
    this.offset.rotation.set(0, -yaw, 0);
    this.offset.position.copy(cam.position).applyAxisAngle(Y_AXIS, -yaw).negate();
    this.needsRecenter = false;
  }

  _headWorld() {
    return this.camera.getWorldPosition(_head);
  }

  /** Move so the head ends up at (x, z), respecting the area. */
  _moveHeadTo(x, z) {
    const [cx, cz] = this.area ? clampToArea(this.area, x, z) : [x, z];
    const h = this._headWorld();
    this.rig.position.x += cx - h.x;
    this.rig.position.z += cz - h.z;
  }

  _tapGround(ray) {
    if (!this.area || this.xr || this.swallowTap) return;
    const floor = this.area.floorY ?? 0;
    if (ray.direction.y >= -0.02) return;
    ray.at((floor - ray.origin.y) / ray.direction.y, _p);
    const h = this._headWorld();
    const [tx, tz] = tapTarget(h.x, h.z, _p.x, _p.z, TAP_REACH);
    const [x, z] = clampToArea(this.area, tx, tz);
    this.dest = new THREE.Vector2(x, z);
    this.stuck = 0;
    this.closest = Infinity;
    this.input.walking = true;
    this._showMarker(x, floor, z);
  }

  _showMarker(x, y, z, scale = 1, opacity = 0.9) {
    this.marker.position.set(x, y + 0.02, z);
    this.marker.scale.setScalar(scale);
    this.marker.material.opacity = opacity;
    this.marker.visible = true;
  }

  /** A faint ring on the ground under the mouse: you can go there. */
  _updateGroundHover() {
    if (this.dest) return;
    const ray = this.input.mouseTarget || this.input.capture || this.input.down ? null : this.input.mouseRay();
    const floor = this.area.floorY ?? 0;
    if (!ray || ray.direction.y >= -0.02) {
      this.marker.visible = false;
      return;
    }
    ray.at((floor - ray.origin.y) / ray.direction.y, _p);
    const [x, z] = clampToArea(this.area, _p.x, _p.z);
    this._showMarker(x, floor, z, 0.7, 0.4);
  }

  _snap(dir) {
    const h = this._headWorld().clone();
    this.rig.rotation.y += dir * SNAP_ANGLE;
    this.rig.updateMatrixWorld(true);
    const n = this._headWorld();
    this.rig.position.x += h.x - n.x;
    this.rig.position.z += h.z - n.z;
  }

  _startAiming(s) {
    if (this.aiming === s) return;
    this.aiming = s;
    s.line.visible = false; // the arc takes over from the ray
    this.beads.visible = true;
  }

  _stopAiming() {
    if (this.aiming) this.aiming.line.visible = true;
    this.aiming = null;
    this.beads.visible = false;
    this.marker.visible = false;
    this.landing = null;
  }

  _updateArc() {
    const s = this.aiming;
    s.c.getWorldPosition(_p);
    _m.identity().extractRotation(s.c.matrixWorld);
    _dir.set(0, 0, -1).applyMatrix4(_m);
    const floorY = this.area.floorY ?? 0;
    const { points, landing } = teleportArc([_p.x, _p.y, _p.z], [_dir.x, _dir.y, _dir.z], { floorY });
    for (let i = 0; i < ARC_DOTS; i++) {
      const pt = points[Math.min(points.length - 1, Math.round((i / (ARC_DOTS - 1)) * (points.length - 1)))];
      _dummy.position.set(pt[0], pt[1], pt[2]);
      _dummy.updateMatrix();
      this.beads.setMatrixAt(i, _dummy.matrix);
    }
    this.beads.instanceMatrix.needsUpdate = true;
    if (landing) {
      const [x, z] = clampToArea(this.area, landing[0], landing[1]);
      this.landing = [x, z];
      this._showMarker(x, floorY, z);
    } else {
      this.landing = null;
      this.marker.visible = false;
    }
  }

  _teleportNow() {
    if (this.landing) {
      this.pendingLanding = this.landing;
      this.blinkDir = 1;
      this._pulse(this.aiming, 0.3, 30);
    }
    this._stopAiming();
  }

  _pulse(s, strength, ms) {
    s?.source?.gamepad?.hapticActuators?.[0]?.pulse?.(strength, ms);
  }

  _updateBlink(dt) {
    if (this.blinkDir > 0) {
      this.blink = Math.min(1, this.blink + dt / BLINK_DOWN);
      if (this.blink >= 1) {
        if (this.pendingLanding) this._moveHeadTo(this.pendingLanding[0], this.pendingLanding[1]);
        this.pendingLanding = null;
        this.blinkDir = -1;
      }
    } else if (this.blinkDir < 0) {
      this.blink = Math.max(0, this.blink - dt / BLINK_UP);
      if (this.blink <= 0) this.blinkDir = 0;
    }
  }

  /** Inside the headset the menu is out of reach: left controller X = smooth walking, Y = subtitles. */
  _updateButtons() {
    const left = this.input.controllers.find((s) => s.source?.handedness === 'left');
    const buttons = left?.source?.gamepad?.buttons;
    if (!buttons) return;
    ['smooth', 'subtitles'].forEach((key, i) => {
      const down = !!buttons[4 + i]?.pressed;
      if (down && !this.buttonsDown[i]) {
        this.prefs.set(key, !this.prefs[key]);
        this._pulse(left, 0.3, 30);
        this.onToggle?.(key);
      }
      this.buttonsDown[i] = down;
    });
  }

  _updateXR(dt) {
    let moveX = 0;
    let moveY = 0;
    for (const s of this.input.controllers) {
      if (s.aimHold > 0) {
        s.aimHold += dt;
        if (s.aimHold > HOLD_TO_AIM) this._startAiming(s);
      }
      const pad = s.source?.gamepad;
      if (!pad || pad.axes.length < 2) continue;
      const x = pad.axes.length >= 4 ? pad.axes[2] : pad.axes[0];
      const y = pad.axes.length >= 4 ? pad.axes[3] : pad.axes[1];
      const right = s.source.handedness !== 'left';
      const i = right ? 1 : 0;

      if (right) {
        if (Math.abs(x) > STICK_ON && this.snapReady[i]) {
          this._snap(x > 0 ? -1 : 1);
          this.snapReady[i] = false;
          this._pulse(s, 0.15, 15);
        } else if (Math.abs(x) < STICK_OFF) this.snapReady[i] = true;
      }
      if (!right && this.prefs.smooth) {
        moveX = Math.abs(x) > STICK_DEAD ? x : 0;
        moveY = Math.abs(y) > STICK_DEAD ? y : 0;
      } else {
        // push forward to aim, let go to land
        if (y < -STICK_ON && !this.aiming) {
          this._startAiming(s);
          s.stickAim = true;
        } else if (s.stickAim && y > -STICK_OFF) {
          s.stickAim = false;
          if (this.aiming === s) this._teleportNow();
        }
      }
    }
    if (this.aiming) this._updateArc();

    let comfort = 0;
    if (moveX || moveY) {
      this.camera.getWorldDirection(_dir);
      _dir.y = 0;
      _dir.normalize();
      const h = this._headWorld();
      const speed = WALK_SPEED * Math.min(1, Math.hypot(moveX, moveY));
      const len = Math.max(1e-3, Math.hypot(moveX, moveY));
      const fx = -moveY / len;
      const sx = moveX / len;
      this._moveHeadTo(h.x + (_dir.x * fx - _dir.z * sx) * speed * dt, h.z + (_dir.z * fx + _dir.x * sx) * speed * dt);
      comfort = 0.55;
    }
    this.comfort += (comfort - this.comfort) * Math.min(1, dt * 8);
  }

  _updateFlat(dt) {
    const k = this.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const want = Math.hypot(f, s) > 0 ? (WALK_SPEED * (k.has('ShiftLeft') ? 1.7 : 1)) / Math.hypot(f, s) : 0;
    this.camera.getWorldDirection(_dir);
    _dir.y = 0;
    _dir.normalize();
    const vx = (_dir.x * f - _dir.z * s) * want;
    const vz = (_dir.z * f + _dir.x * s) * want;
    const e = Math.min(1, dt * 9);
    this.vel.x += (vx - this.vel.x) * e;
    this.vel.y += (vz - this.vel.y) * e;
    if (want && this.dest) {
      this.dest = null;
      this.input.walking = false;
    }

    const h = this._headWorld();
    if (this.dest) {
      const dx = this.dest.x - h.x;
      const dz = this.dest.y - h.z;
      const d = Math.hypot(dx, dz);
      this.stuck = d < this.closest - 0.002 ? 0 : (this.stuck || 0) + dt;
      this.closest = Math.min(this.closest, d);
      if (d < 0.05 || this.stuck > STUCK_AFTER) {
        this.stop();
      } else {
        const stepLen = Math.min(d, glideSpeed(d) * dt);
        this._moveHeadTo(h.x + (dx / d) * stepLen, h.z + (dz / d) * stepLen);
      }
    } else if (Math.hypot(this.vel.x, this.vel.y) > 0.01) {
      this._moveHeadTo(h.x + this.vel.x * dt, h.z + this.vel.y * dt);
    }
    this._updateGroundHover();
  }

  update(dt) {
    if (this.needsRecenter && this.xr && this.camera.position.lengthSq() > 1e-6) this.recenter();
    this._updateBlink(dt);
    if (this.xr) this._updateButtons();
    if (this.area) {
      if (this.xr) this._updateXR(dt);
      else this._updateFlat(dt);
    }
    if (this.xr) this.vignette.amount = Math.max(this.blink, this.comfort);
    else this.vignette.amount = 0;
  }
}
