import * as THREE from 'three';
import { BaseScene } from '../core/SceneManager.js';
import { Dust } from '../core/props.js';
import { ease, glowTexture, lerp } from '../core/util.js';
import { softMaterial, paintedTexture } from '../core/look.js';
import { engravedSky } from '../core/engraved.js';
import { cutout, loadArt } from '../core/collage.js';
import { TAU, TICK_HZ, bandAngle, poseAt, rotFor, sectorAt } from '../core/zoetrope.js';
import { lyre } from '../core/synth.js';

// The hub: a great painted zoetrope. Each chapter has an arch in the wheel, with its painting on the back wall and its
// figure standing in front. Turn the wheel (drag, swipe, arrow keys, stick, or grip and sweep your arm) and it settles
// on a chapter. Turn the crank and the band above it comes alive; at the height of it you dive into the arch,
// and that is the way into the chapter.

const EYE = 1.6;
const R_FRAME = 3.42;
const R_FIGURE = 3.26;
const R_PANEL = 3.02;
const ARCH_Y = 0.62; // the floor of the arches
const PANEL_H = 2.0;
const PANEL_W = PANEL_H * 0.6; // the atlas cells' own proportion
const BAND_N = 16;
const BAND_R = 2.42;
const BAND_Y = 3.92;
const BAND_H = 1.55;
const COLS = 6;
const ROWS = 3;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

/** A short wooden tick of the mechanism. */
function tickSound() {
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Ctx(1, 4410, 44100);
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.setValueAtTime(1500, 0);
  o.frequency.exponentialRampToValueAtTime(420, 0.03);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, 0);
  g.gain.exponentialRampToValueAtTime(0.001, 0.07);
  o.connect(g).connect(ctx.destination);
  o.start(0);
  return ctx.startRendering();
}

/** Cards drawn from a 5x3 atlas; each instance has its own cell and its own light. */
function cardMaterial(map, { cut = false } = {}) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: cut,
    depthWrite: !cut,
    uniforms: { map: { value: map }, size: { value: new THREE.Vector2(1 / COLS, 1 / ROWS) }, boost: { value: 1 }, cellAll: { value: new THREE.Vector2(-1, -1) } },
    vertexShader: /* glsl */ `
      attribute vec2 cell;
      attribute float lit;
      uniform vec2 size;
      uniform vec2 cellAll;
      varying vec2 vUv;
      varying float vLit;
      void main() {
        vec2 c = cellAll.x >= 0.0 ? cellAll : cell;
        // a hair inside the cell, so the neighbours never bleed in with the mipmaps
        vUv = c + (0.006 + uv * 0.988) * size;
        vLit = lit;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float boost;
      varying vec2 vUv;
      varying float vLit;
      void main() {
        vec4 c = texture2D(map, vUv);
        if (c.a < 0.02) discard;
        gl_FragColor = vec4(c.rgb * vLit * boost * c.a, c.a);
        #include <colorspace_fragment>
      }`,
    premultipliedAlpha: true,
  });
}

function cellOf(i) {
  return [(i % COLS) / COLS, 1 - (Math.floor(i / COLS) + 1) / ROWS];
}

/** A painted drum: a colour, gold key pattern, bosses. */
function drumTexture(ground, gold = '#d9ad55') {
  const tex = paintedTexture(2048, 128, (c, w, h) => {
    c.fillStyle = ground;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = gold;
    c.lineWidth = 5;
    c.strokeRect(-10, 8, w + 20, h - 16);
    c.lineWidth = 6;
    const s = 64;
    for (let x = 0; x < w; x += s) {
      c.beginPath();
      c.moveTo(x + 4, h - 26);
      c.lineTo(x + 4, 26);
      c.lineTo(x + 50, 26);
      c.lineTo(x + 50, h - 44);
      c.lineTo(x + 22, h - 44);
      c.lineTo(x + 22, 44);
      c.stroke();
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.anisotropy = 8;
  return tex;
}

function starsTexture() {
  const tex = paintedTexture(1024, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#16205a');
    g.addColorStop(1, '#2b1b5e');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#e9c46a';
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 1.5 + Math.random() * 3.5;
      c.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU;
        const q = k % 2 ? r * 0.42 : r;
        c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
      }
      c.fill();
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  return tex;
}

function floorTexture() {
  const tex = paintedTexture(2048, 2048, (c, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    c.fillStyle = '#17132a';
    c.fillRect(0, 0, w, h);
    const rings = [['#3a1230', 250, 330], ['#d9ad55', 330, 336], ['#123e57', 336, 470], ['#d9ad55', 470, 478], ['#5a1626', 478, 640], ['#d9ad55', 640, 646], ['#16405a', 646, 820], ['#a37f3f', 820, 826], ['#231543', 826, 1020]];
    for (const [col, r0, r1] of rings) {
      c.strokeStyle = col;
      c.lineWidth = r1 - r0;
      c.beginPath();
      c.arc(cx, cy, (r0 + r1) / 2, 0, TAU);
      c.stroke();
    }
    // rays and petals, in gold on colour
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * TAU;
      c.save();
      c.translate(cx, cy);
      c.rotate(a);
      c.fillStyle = i % 2 ? '#e0b65e' : '#c0432f';
      c.globalAlpha = 0.85;
      c.beginPath();
      c.moveTo(346, -13);
      c.quadraticCurveTo(420, -22, 462, 0);
      c.quadraticCurveTo(420, 22, 346, 13);
      c.fill();
      c.fillStyle = i % 2 ? '#2a9d8f' : '#e9c46a';
      c.beginPath();
      c.moveTo(490, -30);
      c.quadraticCurveTo(570, -38, 630, 0);
      c.quadraticCurveTo(570, 38, 490, 30);
      c.fill();
      c.restore();
    }
    // tesserae
    const n = 300;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      for (const r of [290, 660, 730, 800, 920]) {
        c.save();
        c.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        c.rotate(a);
        c.fillStyle = ['#d9ad55', '#c0392b', '#2a9d8f', '#e9c46a', '#8e44ad'][(i + r) % 5];
        c.globalAlpha = 0.55 + Math.random() * 0.4;
        const s = r === 920 ? 10 : 6 + (i % 3);
        c.fillRect(-s, -s, s * 2, s * 2);
        c.restore();
      }
    }
    c.globalAlpha = 1;
  });
  tex.anisotropy = 8;
  return tex;
}

export class ZootropeScene extends BaseScene {
  showReticle = false;
  skipTo = 'sphinx';

  async enter(params = {}) {
    const { ctx } = this;
    const { CHAPTERS } = ctx.content;
    this.chapters = CHAPTERS;
    this.count = CHAPTERS.length;
    this.step = TAU / this.count;
    this.sel = params.sector || 0;
    this.rot = -this.sel * this.step + 1.3; // it swings into place as you arrive
    this.goal = -this.sel * this.step;
    this.vel = 0;
    this.lit = 1;
    this.tick = 0;
    this.tickRate = 0;
    this.tickAcc = 0;
    this.bandRot = 0;
    this.playing = false;
    this.crankAngle = 0;
    this.cranked = 0;

    ctx.look.enabled = false;
    ctx.scene.fog = new THREE.Fog('#0d0a1e', 13, 40);
    ctx.scene.background = new THREE.Color('#0d0a1e');
    ctx.grain.set({ grain: 0.045, vignette: 0.42, color: '#060410' });
    ctx.audio.define('tick', tickSound);
    ctx.audio.define('lyre', () => lyre());

    const [T, G] = await Promise.all([loadArt('zoetrope', ['panels', 'figures']), loadArt('garden', ['grove', 'cupid']), ctx.audio.preload(['tick'])]);
    this.T = T;

    this._buildWorld(G);
    this._buildWheel(T);
    this._buildBand(T);
    this._buildCrown();
    this._buildCrank();
    this._buildPlaque();

    this.hemi = new THREE.HemisphereLight('#b5b8ff', '#2a1020', 1.4);
    this.key = new THREE.DirectionalLight('#ffe2b4', 2.2);
    this.key.position.set(-2, 7, 9);
    this.lantern = new THREE.PointLight('#ffb765', 26, 10, 1.6);
    this.lantern.position.set(0, 5.4, 2.5);
    this.root.add(this.hemi, this.key, this.lantern);

    this._layout();
    this._select(this.sel, true);
    this._listen();
  }

  // ---------- building ----------

  _buildWorld(G) {
    const sky = engravedSky({ top: '#080a26', horizon: '#3a1a4c', sunDir: new THREE.Vector3(0, 0.25, -1).normalize(), sunR: 0.0, cloudLow: '#1c1a46', cloudLit: '#5e4372', glory: '#ffc98a', cover: 0.3 });
    sky.mesh.raycast = () => {};
    this.add(sky.mesh);
    this.skyU = sky.u;

    // Botticelli's orange grove, a dark hedge around the room
    if (G.grove) {
      G.grove.wrapS = THREE.MirroredRepeatWrapping;
      G.grove.repeat.set(10, 1);
      const fade = paintedTexture(4, 64, (c, w, h) => {
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#000');
        g.addColorStop(0.4, '#fff');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
      });
      fade.colorSpace = THREE.NoColorSpace;
      const hedge = new THREE.Mesh(
        new THREE.CylinderGeometry(24, 24, 7.5, 80, 1, true),
        new THREE.MeshBasicMaterial({ map: G.grove, alphaMap: fade, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false, color: '#cfc4b8' }),
      );
      hedge.position.y = 3.4;
      hedge.renderOrder = -1;
      hedge.raycast = () => {};
      this.add(hedge);
    }
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshLambertMaterial({ map: floorTexture() }));
    floor.rotation.x = -Math.PI / 2;
    floor.material.map.repeat.set(1, 1);
    floor.scale.setScalar(0.38);
    floor.raycast = () => {};
    this.add(floor);
    const dark = new THREE.Mesh(new THREE.RingGeometry(14, 60, 48), new THREE.MeshBasicMaterial({ color: '#0d0a1e' }));
    dark.rotation.x = -Math.PI / 2;
    dark.position.y = -0.01;
    dark.raycast = () => {};
    this.add(dark);

    this.add(new Dust({ count: 320, radius: 9, inner: 3.5, color: '#ffd98a', size: 0.035, opacity: 0.6, speed: 0.02 }));

    // Botticelli's Cupid, flying round and round it, for ever
    if (G.cupid) {
      this.cupid = cutout(G.cupid, 0.72, { anchor: 'center', self: 0.8, bow: 0.05 });
      this.add(this.cupid);
    }
  }

  _buildWheel(T) {
    this.wheel = new THREE.Group();
    this.add(this.wheel);
    const gold = softMaterial({ color: '#c29639', rim: '#fff0c0', rimPower: 1.5, rimStrength: 0.8, hatch: 0, umber: '#4a3210' });
    this.gold = gold;
    const n = this.count;

    // the drums
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.72, 3.85, 0.6, 96), [new THREE.MeshLambertMaterial({ map: drumTexture('#7c1f2e') }), new THREE.MeshLambertMaterial({ color: '#4a1420' }), new THREE.MeshLambertMaterial({ color: '#201018' })]);
    base.position.y = 0.3;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(2.96, 2.96, 2.9, 64), new THREE.MeshLambertMaterial({ color: '#150f22' }));
    core.position.y = ARCH_Y + 1.4;
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(3.56, 3.62, 0.46, 96), [new THREE.MeshLambertMaterial({ map: drumTexture('#123e57') }), new THREE.MeshLambertMaterial({ color: '#1b1236' }), new THREE.MeshLambertMaterial({ color: '#1b1236' })]);
    roof.position.y = ARCH_Y + 2.56;
    const brim = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.05, 8, 96).rotateX(Math.PI / 2), gold);
    brim.position.y = ARCH_Y + 2.32;
    const brim2 = new THREE.Mesh(new THREE.TorusGeometry(3.57, 0.045, 8, 96).rotateX(Math.PI / 2), gold);
    brim2.position.y = ARCH_Y + 2.8;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(3.78, 0.05, 8, 96).rotateX(Math.PI / 2), gold);
    lip.position.y = 0.6;
    this.wheel.add(base, core, roof, brim, brim2, lip);

    // paintings, then figures, each set one draw call
    const quad = new THREE.PlaneGeometry(PANEL_W, PANEL_H);
    const instances = (tex, opts, r) => {
      const g = quad.clone();
      const cells = new Float32Array(n * 2);
      const lit = new Float32Array(n).fill(1);
      g.setAttribute('cell', new THREE.InstancedBufferAttribute(cells, 2));
      g.setAttribute('lit', new THREE.InstancedBufferAttribute(lit, 1));
      const m = new THREE.InstancedMesh(g, cardMaterial(tex, opts), n);
      for (let i = 0; i < n; i++) {
        const a = i * this.step;
        cells.set(cellOf(i), i * 2);
        _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a);
        _p.set(Math.sin(a) * r, ARCH_Y + PANEL_H / 2 + 0.05, Math.cos(a) * r);
        m.setMatrixAt(i, _m.compose(_p, _q, _s.setScalar(1)));
      }
      m.frustumCulled = false;
      m.raycast = () => {};
      this.wheel.add(m);
      return m;
    };
    this.panels = instances(T.panels, {}, R_PANEL);
    this.figures = instances(T.figures, { cut: true }, R_FIGURE);

    // arches, each in its chapter's colour
    const shape = new THREE.Shape();
    const W = this.step * R_FRAME * 0.5 - 0.005;
    const H = 2.34;
    shape.moveTo(-W, 0);
    shape.lineTo(W, 0);
    shape.lineTo(W, H);
    shape.lineTo(-W, H);
    shape.closePath();
    const hw = PANEL_W / 2 + 0.01;
    const hole = new THREE.Path();
    hole.moveTo(-hw, 0.08);
    hole.lineTo(hw, 0.08);
    hole.lineTo(hw, 1.5);
    hole.absarc(0, 1.5, hw, 0, Math.PI, false);
    hole.lineTo(-hw, 0.08);
    shape.holes.push(hole);
    const frameGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1, curveSegments: 18 });
    frameGeo.translate(0, 0, -0.05);
    const frames = new THREE.InstancedMesh(frameGeo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), n);
    const pillar = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.052, 0.062, 2.3, 10), gold, n);
    const ringGeo = new THREE.TorusGeometry(hw + 0.01, 0.018, 6, 28, Math.PI);
    const rings = new THREE.InstancedMesh(ringGeo, gold, n);
    for (let i = 0; i < n; i++) {
      const a = i * this.step;
      _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a);
      _p.set(Math.sin(a) * R_FRAME, ARCH_Y, Math.cos(a) * R_FRAME);
      frames.setMatrixAt(i, _m.compose(_p, _q, _s.setScalar(1)));
      frames.setColorAt(i, _c.set(this.chapters[i].color));
      _p.set(Math.sin(a) * R_FRAME, ARCH_Y + 1.5, Math.cos(a) * R_FRAME).add(_s.set(Math.sin(a) * 0.06, 0, Math.cos(a) * 0.06));
      rings.setMatrixAt(i, _m.compose(_p, _q, _s.setScalar(1)));
      const b = (i + 0.5) * this.step;
      _p.set(Math.sin(b) * (R_FRAME + 0.09), ARCH_Y + 1.16, Math.cos(b) * (R_FRAME + 0.09));
      pillar.setMatrixAt(i, _m.compose(_p, _q.identity(), _s.setScalar(1)));
    }
    frames.raycast = pillar.raycast = rings.raycast = () => {};
    this.wheel.add(frames, pillar, rings);

    // what a click or a ray hits
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    for (let i = 0; i < n; i++) {
      const a = i * this.step;
      const hit = new THREE.Mesh(new THREE.BoxGeometry(W * 2, 2.3, 0.2), hitMat);
      hit.position.set(Math.sin(a) * (R_FRAME + 0.05), ARCH_Y + 1.15, Math.cos(a) * (R_FRAME + 0.05));
      hit.rotation.y = a;
      this.wheel.add(hit);
      this.ctx.input.add(hit, { dwell: false, highlight: false, tip: 'choose', onSelect: () => this._clickSector(i) });
    }

    // a light on the chosen arch; it does not turn with the wheel
    this.spot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffdca0', transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.spot.position.set(0, ARCH_Y + 1.1, R_FRAME + 0.3);
    this.spot.scale.set(2.3, 3.1, 1);
    this.spot.raycast = () => {};
    this.add(this.spot);
  }

  _buildBand(T) {
    // the drum behind the moving band, deep blue and gold
    this.bandGroup = new THREE.Group();
    this.add(this.bandGroup);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(2.02, 2.02, BAND_H + 0.5, 64, 1), new THREE.MeshLambertMaterial({ map: starsTexture() }));
    inner.position.y = BAND_Y + BAND_H / 2 - 0.1;
    inner.raycast = () => {};
    this.add(inner);
    const n = BAND_N;
    const g = new THREE.PlaneGeometry(BAND_H * 0.6, BAND_H);
    g.translate(0, BAND_H / 2, 0);
    g.setAttribute('cell', new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2));
    g.setAttribute('lit', new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1.15), 1));
    this.band = new THREE.InstancedMesh(g, cardMaterial(T.figures, { cut: true }), n);
    this.band.frustumCulled = false;
    this.band.raycast = () => {};
    this.bandGroup.add(this.band);
  }

  _setBandPoses(kind) {
    const n = BAND_N;
    for (let i = 0; i < n; i++) {
      const pose = poseAt(kind, i, n);
      const a = (i / n) * TAU;
      const r = BAND_R;
      const tx = Math.cos(a) * pose.x * BAND_H;
      const tz = -Math.sin(a) * pose.x * BAND_H;
      _p.set(Math.sin(a) * r + tx, BAND_Y + pose.y * BAND_H, Math.cos(a) * r + tz);
      _e.set(0, a, pose.rot, 'YXZ');
      _q.setFromEuler(_e);
      this.band.setMatrixAt(i, _m.compose(_p, _q, _s.setScalar(pose.scale)));
    }
    this.band.instanceMatrix.needsUpdate = true;
  }

  _buildCrown() {
    const gold = this.gold;
    const add = (geo, mat, y) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.y = y;
      m.raycast = () => {};
      this.add(m);
      return m;
    };
    add(new THREE.TorusGeometry(2.55, 0.045, 8, 80).rotateX(Math.PI / 2), gold, BAND_Y - 0.02);
    add(new THREE.TorusGeometry(2.55, 0.045, 8, 80).rotateX(Math.PI / 2), gold, BAND_Y + BAND_H + 0.1);
    add(new THREE.CylinderGeometry(2.58, 2.58, 0.05, 64), new THREE.MeshLambertMaterial({ color: '#7c1f2e' }), BAND_Y - 0.03);
    // a tented roof in stripes of colour
    const stripes = paintedTexture(1024, 64, (c, w, h) => {
      const cols = ['#b5302b', '#e9b94f', '#16587a', '#e9b94f', '#2a7d6e', '#e9b94f', '#6f2b86', '#e9b94f'];
      const sw = w / 24;
      for (let i = 0; i < 24; i++) {
        c.fillStyle = cols[i % cols.length];
        c.fillRect(i * sw, 0, sw + 1, h);
      }
    });
    this.tent = add(new THREE.ConeGeometry(2.72, 1.7, 48, 1), new THREE.MeshLambertMaterial({ map: stripes }), BAND_Y + BAND_H + 0.1 + 0.85);
    add(new THREE.TorusGeometry(2.72, 0.04, 8, 80).rotateX(Math.PI / 2), gold, BAND_Y + BAND_H + 0.1);

    // and at the very top, a small sun
    this.sunTop = add(new THREE.IcosahedronGeometry(0.2, 2), softMaterial({ color: '#f2c14e', rim: '#fff6d0', rimStrength: 1, hatch: 0 }), BAND_Y + BAND_H + 2.0);
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffcf7a', transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.sunGlow.position.copy(this.sunTop.position);
    this.sunGlow.scale.setScalar(1.8);
    this.sunGlow.raycast = () => {};
    this.add(this.sunGlow);
  }

  _buildCrank() {
    const brass = this.gold;
    const wood = softMaterial({ color: '#3d2415', rim: '#ffc98f', rimStrength: 0.35, hatch: 0, umber: '#150a05' });
    this.crank = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.92, 12), wood);
    post.position.y = 0.46;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.05, 16), wood);
    foot.position.y = 0.025;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 20).rotateX(Math.PI / 2), brass);
    hub.position.y = 0.98;
    this.crank.add(post, foot, hub);
    this.crankArm = new THREE.Group();
    this.crankArm.position.y = 0.98;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.024, 0.024), brass);
    arm.position.set(0.1, 0, 0.035);
    this.knob = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 10), wood);
    this.knob.position.set(0.2, 0, 0.07);
    const target = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    this.knob.add(target);
    this.crankArm.add(arm, this.knob);
    this.crank.add(this.crankArm);
    this.add(this.crank);
    for (const m of [post, foot, hub, arm]) m.raycast = () => {};

    this.ctx.interact.addHandle(this.knob, {
      reach: 0.3,
      tip: 'crank',
      onClick: () => this.play(),
      onDrag: (p) => this._dragCrank(p),
      onRelease: () => (this.lastCrank = null),
    });
  }

  _dragCrank(p) {
    if (this.playing) return;
    const c = this.crank.position;
    const a = Math.atan2(p.y - 0.98, p.x - c.x);
    if (this.lastCrank != null) {
      let d = a - this.lastCrank;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      this.cranked += Math.abs(d);
      this.crankAngle += d;
      this.tickRate = Math.min(TICK_HZ, this.tickRate + Math.abs(d) * 3);
    }
    this.lastCrank = a;
    if (this.cranked > TAU * 1.5) this.play();
  }

  /** In a headset the words have to be in the world. */
  _buildPlaque() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    this.plaqueCtx = canvas.getContext('2d');
    this.plaqueTex = new THREE.CanvasTexture(canvas);
    this.plaqueTex.colorSpace = THREE.SRGBColorSpace;
    this.plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshBasicMaterial({ map: this.plaqueTex, transparent: true, fog: false }));
    this.plaque.raycast = () => {};
    this.plaque.visible = false;
    this.add(this.plaque);
  }

  _drawPlaque(ch, i) {
    const c = this.plaqueCtx;
    const { width: w, height: h } = c.canvas;
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(14,10,24,0.9)';
    c.fillRect(6, 6, w - 12, h - 12);
    c.strokeStyle = '#d9ad55';
    c.lineWidth = 4;
    c.strokeRect(14, 14, w - 28, h - 28);
    c.textAlign = 'center';
    c.fillStyle = '#e9c46a';
    c.font = '600 40px "Cormorant Garamond", Georgia, serif';
    c.fillText(`${this.ctx.content.roman(i + 1)}  ·  ${ch.sense}`, w / 2, 76);
    c.fillStyle = '#f6efe3';
    c.font = 'italic 400 86px "Cormorant Garamond", Georgia, serif';
    c.fillText(ch.label, w / 2, 160);
    c.fillStyle = '#b9b2a6';
    c.font = '400 32px "Cormorant Garamond", Georgia, serif';
    c.fillText(this.ctx.content.UI.hubHint.xr, w / 2, 214);
    this.plaqueTex.needsUpdate = true;
  }

  /** The viewer stands within reach of the crank; further back on a flat screen, to see the whole thing. */
  _layout() {
    const xr = this.ctx.renderer.xr.isPresenting;
    const aspect = this.ctx.camera.aspect;
    const key = `${xr}-${aspect < 1}`;
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    const { ctx } = this;
    const z = xr ? 6.3 : aspect < 1 ? 11.5 : 9.1;
    this.eyeZ = z;
    ctx.rig.position.set(0, EYE, z);
    ctx.look.reset(0, xr ? 0 : aspect < 1 ? 0.16 : 0.27);
    if (xr) {
      ctx.camera.updateMatrixWorld(true);
      ctx.locomotion.recenter();
      this.crank.position.set(0.5, 0, z - 0.6);
      this.plaque.position.set(-0.1, 1.05, z - 1.35);
      this.plaque.rotation.x = -0.12;
      this.plaque.visible = true;
    } else {
      this.crank.position.set(aspect < 1 ? 1.3 : 2.75, 0, R_FRAME + 1.7);
      this.plaque.visible = false;
    }
  }

  // ---------- choosing ----------

  _select(i, instant) {
    this.sel = i;
    const ch = this.chapters[i];
    const [u, v] = cellOf(i);
    this.band.material.uniforms.cellAll.value.set(u, v);
    this._setBandPoses(ch.pose || 'sway');
    this.litDirty = true;
    if (instant) this._applyLit(1);
    this._drawPlaque(ch, i);
    this.ctx.ui?.setChapter(ch, i);
  }

  _applyLit(k) {
    for (const m of [this.panels, this.figures]) {
      const a = m.geometry.attributes.lit;
      for (let i = 0; i < this.count; i++) {
        const want = i === this.sel ? (m === this.panels ? 1.05 : 1.12) : m === this.panels ? 0.42 : 0.62;
        a.array[i] += (want - a.array[i]) * k;
      }
      a.needsUpdate = true;
    }
  }

  /** One sector along. */
  stepBy(d) {
    if (this.playing) return;
    this._wake();
    this.vel = 0;
    const from = this.goal ?? rotFor(this.sel, this.rot, this.count);
    this.goal = from - d * this.step;
  }

  _clickSector(i) {
    if (this.playing) return;
    this._wake();
    if (i === this.sel && this.goal === null) {
      this.play();
      return;
    }
    this.vel = 0;
    this.goal = rotFor(i, this.rot, this.count);
  }

  /** Audio needs a gesture; so the music box starts at the first touch. */
  _wake() {
    if (this.awake) return;
    this.awake = true;
    const { audio, narrator } = this.ctx;
    audio.unlock();
    narrator.unlock();
    audio.preload(['lyre']).then(async () => {
      if (!this.alive) return;
      this.music = await this.sound('lyre', { parent: this.wheel, loop: true, volume: 0.55, refDistance: 7 });
    });
  }

  _listen() {
    const el = this.ctx.renderer.domElement;
    let last = null;
    let prevX = 0;
    let speed = 0;
    let time = 0;
    this._down = (e) => {
      if (this.playing || !e.isPrimary) return;
      this._wake();
      last = e.clientX;
      prevX = e.clientX;
      time = performance.now();
      speed = 0;
      this.dragging = false;
    };
    this._move = (e) => {
      if (last === null || !e.isPrimary) return;
      const dx = e.clientX - last;
      if (!this.dragging && Math.abs(e.clientX - prevX) < 8) return;
      this.dragging = true;
      this.goal = null;
      last = e.clientX;
      const perPixel = (TAU * 0.55) / Math.max(320, el.clientWidth || window.innerWidth);
      this.rot += dx * perPixel;
      const now = performance.now();
      const dt = Math.max(1, now - time) / 1000;
      speed = speed * 0.7 + ((dx * perPixel) / dt) * 0.3;
      time = now;
    };
    this._up = () => {
      if (last === null) return;
      last = null;
      if (this.dragging) this.vel = THREE.MathUtils.clamp(speed, -5, 5);
      this.dragging = false;
    };
    this._wheel = (e) => {
      if (Math.abs(e.deltaY) + Math.abs(e.deltaX) < 4 || this._menuOpen()) return;
      const now = performance.now();
      if (now - (this._lastWheel || 0) < 160) return;
      this._lastWheel = now;
      this.stepBy(Math.sign(e.deltaY || e.deltaX));
    };
    this._key = (e) => {
      if (this._menuOpen()) return;
      if (e.code === 'ArrowRight') this.stepBy(1);
      else if (e.code === 'ArrowLeft') this.stepBy(-1);
      else if (e.code === 'Enter' && !(e.target instanceof HTMLButtonElement)) this.play();
    };
    el.addEventListener('pointerdown', this._down);
    window.addEventListener('pointermove', this._move);
    window.addEventListener('pointerup', this._up);
    window.addEventListener('pointercancel', this._up);
    el.addEventListener('wheel', this._wheel, { passive: true });
    window.addEventListener('keydown', this._key);
  }

  _menuOpen() {
    return !document.getElementById('menu')?.classList.contains('hidden');
  }

  exit() {
    const { ctx } = this;
    const el = ctx.renderer.domElement;
    el.removeEventListener('pointerdown', this._down);
    window.removeEventListener('pointermove', this._move);
    window.removeEventListener('pointerup', this._up);
    window.removeEventListener('pointercancel', this._up);
    el.removeEventListener('wheel', this._wheel);
    window.removeEventListener('keydown', this._key);
    ctx.look.enabled = !ctx.renderer.xr.isPresenting;
  }

  // ---------- the crank, the dive ----------

  /** Go to a chapter by way of the wheel. */
  playChapter(i) {
    this._wake();
    this.vel = 0;
    this.goal = rotFor(i, this.rot, this.count);
    this.pendingPlay = true;
  }

  async play() {
    if (this.playing) return;
    this.playing = true;
    this.pendingPlay = false;
    this._wake();
    const { ctx } = this;
    const i = this.sel;
    const ch = this.chapters[i];
    ctx.ui?.setPlaying(true);
    this.goal = rotFor(i, this.rot, this.count);
    this.vel = 0;
    if (this.music) this.tween(2.8, (k) => this.music.setPlaybackRate(1 + k * 0.5));

    // The band quickens, one slot at a time, until it takes for movement. The whole time, no flash.
    this.tween(2.8, (k) => (this.tickRate = lerp(Math.max(this.tickRate, 3), TICK_HZ, k)), ease.inOut);
    this.tween(2.8, (k) => {
      this.band.material.uniforms.boost.value = 1 + k * 0.18;
      this.lantern.intensity = 26 + k * 34;
      this.sunGlow.scale.setScalar(1.8 + k * 1.8);
    });
    await this.wait(3);

    // into the arch
    const z0 = ctx.rig.position.z;
    const y0 = ctx.rig.position.y;
    const xr = ctx.renderer.xr.isPresenting;
    const dur = xr ? 1 : 1.5;
    this.tween(dur, (k) => {
      ctx.rig.position.z = lerp(z0, R_FIGURE + 0.25, k);
      ctx.rig.position.y = lerp(y0, ARCH_Y + 1.35, k);
    }, ease.in);
    const run = i === 0 ? null : { scenes: ch.scenes || [ch.scene], next: (i + 1) % this.count };
    ctx.begin(i === 0 ? null : ch, { run, out: dur, color: ch.color });
  }

  // ---------- every frame ----------

  update(dt, t) {
    super.update(dt, t);
    const { ctx } = this;
    this._layout();
    this.skyU.time.value = t;

    // the wheel
    if (this.goal !== null && !this.dragging) {
      const d = this.goal - this.rot;
      this.rot += d * Math.min(1, dt * 4.5);
      if (Math.abs(d) < 0.0015) {
        this.rot = this.goal;
        this.goal = null;
        if (this.pendingPlay) this.play();
      }
    } else if (!this.dragging) {
      if (Math.abs(this.vel) > 0.28) {
        this.rot += this.vel * dt;
        this.vel *= Math.exp(-dt * 1.7);
      } else {
        this.vel = 0;
        this.goal = rotFor(sectorAt(this.rot, this.count), this.rot, this.count);
      }
    }
    this.wheel.rotation.y = this.rot;

    const now = sectorAt(this.rot, this.count);
    if (now !== this.sel) {
      this._select(now);
      if (this.awake) this.sound('tick', { parent: this.spot, volume: 0.5, refDistance: 6 });
    }
    if (this.litDirty) {
      this._applyLit(Math.min(1, dt * 7));
      this.litFade = (this.litFade || 0) + dt;
      if (this.litFade > 0.8) {
        this.litDirty = false;
        this.litFade = 0;
      }
    }

    // the band: at rest it drifts; when it runs it moves only by whole slots
    if (this.tickRate > 0.5) {
      this.tickRate = this.playing ? this.tickRate : Math.max(0, this.tickRate - dt * 2.5);
      this.tickAcc += dt * this.tickRate;
      while (this.tickAcc >= 1) {
        this.tickAcc -= 1;
        this.tick++;
        if (this.awake && this.tick % 3 === 0) this.sound('tick', { parent: this.crank, volume: 0.3, refDistance: 4, rate: 1.4 });
      }
      this.bandGroup.rotation.y = bandAngle(this.tick, BAND_N);
      this.crankAngle += dt * this.tickRate * 0.9;
    } else {
      this.bandRot += dt * 0.09;
      this.tick = Math.round((this.bandRot / TAU) * BAND_N);
      this.bandGroup.rotation.y = this.bandRot;
    }
    if (this.tickRate > 0.5) this.bandRot = this.bandGroup.rotation.y;
    this.crankArm.rotation.z = this.crankAngle;
    if (this.tent) this.tent.rotation.y = -t * 0.05;
    if (this.cupid) {
      const a = t * 0.22;
      this.cupid.position.set(Math.sin(a) * 5, 3.3 + Math.sin(t * 0.7) * 0.5, Math.cos(a) * 5);
      this.cupid.rotation.y = a + Math.PI / 2 + Math.PI; // he flies nose first
      this.cupid.rotation.z = Math.sin(t * 2.1) * 0.08;
    }
    this.sunGlow.material.opacity = 0.55 + Math.sin(t * 1.4) * 0.08;
    this.spot.material.opacity = 0.28 + Math.sin(t * 1.1) * 0.05;

    // in a headset: stick turns a step; grip and sweep the arm turns the wheel, with weight
    if (ctx.renderer.xr.isPresenting && !this.playing) this._updateXR(dt);
  }

  _updateXR(dt) {
    const { interact, input } = this.ctx;
    for (const s of input.controllers) {
      const pad = s.source?.gamepad;
      if (!pad) continue;
      const x = pad.axes.length >= 4 ? pad.axes[2] : pad.axes[0] ?? 0;
      if (Math.abs(x) > 0.7 && !s.hubStick) {
        s.hubStick = true;
        this.stepBy(x > 0 ? 1 : -1);
      } else if (Math.abs(x) < 0.3) s.hubStick = false;
    }
    let sweeping = false;
    for (const h of interact.hands) {
      const pad = h.state?.source?.gamepad;
      const grip = pad?.buttons?.[1]?.pressed;
      if (!h.tracked || !grip || h.handle) {
        h.hubX = null;
        continue;
      }
      this._wake();
      if (h.hubX != null) {
        const dx = (h.pos.x - h.hubX) * 2.4;
        this.rot += dx;
        this.vel = THREE.MathUtils.clamp(this.vel * 0.7 + (dx / Math.max(dt, 1e-3)) * 0.3, -3.5, 3.5);
        this.goal = null;
        sweeping = true;
      }
      h.hubX = h.pos.x;
    }
    this.dragging = sweeping;
  }

  onSelectNothing() {
    this._wake();
  }
}
