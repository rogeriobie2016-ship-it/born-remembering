import * as THREE from 'three';
import { paginate } from './captions.js';

const FAMILY = '"Cormorant Garamond", Georgia, "Times New Roman", serif';
const FONT_PX = 46;
const LINE_PX = 58;
const PAD_X = 34;
const PAD_Y = 16;
const PX_PER_METRE = 1150; // 46 px type = 4 cm tall at 1.5 m: small, still sharp in a headset
const DISTANCE = 1.5;
const DROP = Math.tan(THREE.MathUtils.degToRad(17)); // low in the field of view
const DEAD_ZONE = Math.cos(THREE.MathUtils.degToRad(14)); // it only starts to follow past this angle
const FADE_IN = 0.25;
const FADE_OUT = 0.4;

const _pos = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _to = new THREE.Vector3();
const _cur = new THREE.Vector3();

function pageTexture(lines) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = `italic 500 ${FONT_PX}px ${FAMILY}`;
  g.font = font;
  const w = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width))) + PAD_X * 2;
  const h = lines.length * LINE_PX + PAD_Y * 2;
  c.width = w;
  c.height = h;
  g.font = font;
  g.fillStyle = 'rgba(12,9,7,0.58)';
  g.beginPath();
  g.roundRect(0, 0, w, h, 18);
  g.fill();
  g.fillStyle = '#f6efe3';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, w / 2, PAD_Y + LINE_PX * (i + 0.5)));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, width: w / PX_PER_METRE, height: h / PX_PER_METRE };
}

/**
 * The subtitle: small, low in the view, with a translucent ground. It follows your gaze
 * lazily (never head-locked, so it stays comfortable in VR), and only once you look away.
 * Timed by the narration; `prefs.subtitles` hides it without changing any timing.
 */
export class Subtitle extends THREE.Group {
  constructor(camera, { prefs, isXR } = {}) {
    super();
    this.camera = camera;
    this.prefs = prefs;
    this.isXR = isXR || (() => false);
    this.seq = 0;
    this.placed = false;
    this.following = false;
    this.opacity = 0;
    this.targetOpacity = 0;
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.plane.renderOrder = 8700; // over haze and grain, under the fader and the reticle
    this.plane.raycast = () => {};
    this.plane.visible = false;
    this.add(this.plane);
  }

  update(t, dt) {
    this.camera.getWorldPosition(_pos);
    this.camera.getWorldDirection(_dir);
    _to.copy(_pos).add(_dir).setY(_pos.y + _dir.y - DROP);
    _to.sub(_pos).normalize().multiplyScalar(DISTANCE).add(_pos);

    if (!this.placed) {
      this.position.copy(_to);
      this.placed = true;
    } else if (this.isXR()) {
      // lazy: rest until the gaze has moved away, then glide back under it
      _cur.copy(this.position).sub(_pos).normalize();
      const dot = _cur.dot(_dir.set(_to.x - _pos.x, _to.y - _pos.y, _to.z - _pos.z).normalize());
      if (dot < DEAD_ZONE) this.following = true;
      else if (dot > 0.998) this.following = false;
      if (this.following) this.position.lerp(_to, Math.min(1, dt * 2.4));
    } else this.position.lerp(_to, Math.min(1, dt * 7));
    this.lookAt(_pos);

    const speed = dt / (this.targetOpacity > this.opacity ? FADE_IN : FADE_OUT);
    this.opacity += Math.sign(this.targetOpacity - this.opacity) * Math.min(Math.abs(this.targetOpacity - this.opacity), speed);
    this.mat.opacity = this.opacity;
    this.plane.visible = this.opacity > 0.003;
  }

  _showPage(lines, force) {
    if (this.mat.map) this.mat.map.dispose();
    const { tex, width, height } = pageTexture(lines);
    this.mat.map = tex;
    this.mat.needsUpdate = true;
    this.plane.scale.set(width, height, 1);
    this.targetOpacity = force || !this.prefs || this.prefs.subtitles ? 1 : 0;
  }

  /**
   * Show a line and resolve when it has been said. Pages of a long line pace themselves;
   * the last one waits for `speech` (a promise from the narrator), then `hold` more seconds.
   * Owned by `scene`: its timers die with it.
   */
  async show(scene, text, { speech = null, hold = 1.2, force = false } = {}) {
    const id = ++this.seq;
    const pages = paginate(text);
    for (const page of pages) {
      if (id !== this.seq) return;
      this._showPage(page.lines, force);
      await scene.wait(page.seconds);
    }
    if (speech) await speech;
    if (id !== this.seq || !scene.alive) return;
    await scene.wait(hold);
    if (id === this.seq) this.targetOpacity = 0;
  }
}
