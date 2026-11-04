import * as THREE from 'three';
import { BaseScene } from '../core/SceneManager.js';
import { Dust } from '../core/props.js';
import { clamp, ease, glowTexture, lerp } from '../core/util.js';
import { paintedTexture } from '../core/look.js';
import { loadArt } from '../core/collage.js';
import { Book, PaperFlat, PAGE_W, SPINE_NEAR, flameTexture, pageShadow, pageTexture, paperMaterial, shadeTexture } from '../core/popup.js';
import { underworld, darkWater, paper, quake } from '../core/ambience.js';
import { thump } from '../core/synth.js';

// Hades, as a pop-up book. It lies shut on the dark floor and opens at your feet; sheets cut from
// Gustave Doré's Charon (1861) stand up from the page. You can walk on it. Take the gold ribbon or the
// page's corner and pull to turn it; pull a paper tab and something hidden comes out. Flames lean away from you,
// and the shades step aside: you are still warm. The last page is the way back up (Leighton, 1891).

const EYE = 1.6;
const START_Z = SPINE_NEAR + 2.6;
const FLAMES = [[-5.7, -0.8], [5.7, -0.8], [-5.7, -4.2], [5.7, -4.2], [-5.7, -7.6], [5.7, -7.6]];
const SHADES = 9;
const SHADE_FEAR = 2.3; // how near you can come before they step away
const BLINK_SPEED = 3.0; // how fast a page turns by itself: seconds
const STAGGER = 0.16;
const RIBBON_X = 1.3;
const TAB_X = -1.3;

function hillsTexture() {
  return paintedTexture(1400, 460, (c, w, h) => {
    c.fillStyle = '#2b2336';
    c.beginPath();
    c.moveTo(0, h);
    for (let x = 0; x <= w; x += 30) c.lineTo(x, h * (0.35 + 0.22 * Math.sin(x * 0.006) + 0.1 * Math.sin(x * 0.023) + Math.random() * 0.012));
    c.lineTo(w, h);
    c.fill();
    c.save();
    c.clip();
    c.strokeStyle = 'rgba(170,150,190,0.22)';
    for (let i = 0; i < 180; i++) {
      c.beginPath();
      const x = Math.random() * w;
      const y = Math.random() * h;
      c.moveTo(x, y);
      c.lineTo(x + 40 + Math.random() * 60, y + 18);
      c.stroke();
    }
    c.restore();
  });
}

function asphodelTexture() {
  return paintedTexture(420, 512, (c, w, h) => {
    c.strokeStyle = '#7b7f6a';
    c.fillStyle = '#d7d5c6';
    for (let i = 0; i < 8; i++) {
      const x = w * (0.1 + i * 0.115);
      const top = h * (0.12 + (i % 3) * 0.1);
      c.lineWidth = 7;
      c.beginPath();
      c.moveTo(x, h);
      c.quadraticCurveTo(x + (i % 2 ? 16 : -16), h * 0.55, x, top);
      c.stroke();
      for (let j = 0; j < 9; j++) {
        const y = top + j * 24;
        for (const s of [-1, 1]) {
          c.beginPath();
          c.ellipse(x + s * (11 - j * 0.3), y, 12, 6.5, s * 0.5, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
  });
}

function archTexture() {
  return paintedTexture(1024, 1000, (c, w, h) => {
    c.fillStyle = '#231a26';
    c.fillRect(0, h * 0.04, w, h);
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.moveTo(w * 0.29, h);
    c.lineTo(w * 0.29, h * 0.42);
    c.arc(w * 0.5, h * 0.42, w * 0.21, Math.PI, 0);
    c.lineTo(w * 0.71, h);
    c.fill();
    c.globalCompositeOperation = 'source-over';
    // columns and a Greek key, in gold line
    c.strokeStyle = '#8a6c3c';
    c.lineWidth = 5;
    c.beginPath();
    c.arc(w * 0.5, h * 0.42, w * 0.225, Math.PI, 0);
    c.stroke();
    for (const x of [0.08, 0.17, 0.83, 0.92]) {
      c.fillStyle = '#3a2e3e';
      c.fillRect(w * x - 26, h * 0.16, 52, h * 0.84);
      c.lineWidth = 2;
      for (let i = -2; i <= 2; i++) {
        c.beginPath();
        c.moveTo(w * x + i * 9, h * 0.18);
        c.lineTo(w * x + i * 9, h);
        c.stroke();
      }
    }
    c.lineWidth = 4;
    for (let x = 20; x < w - 30; x += 44) {
      c.beginPath();
      c.moveTo(x, h * 0.13);
      c.lineTo(x, h * 0.08);
      c.lineTo(x + 30, h * 0.08);
      c.lineTo(x + 30, h * 0.115);
      c.lineTo(x + 14, h * 0.115);
      c.stroke();
    }
  });
}

/** A strip of Doré's water, its top cut in waves. */
function waveStrip(img, phase) {
  return paintedTexture(1024, 200, (c, w, h) => {
    c.beginPath();
    c.moveTo(0, h);
    for (let x = 0; x <= w; x += 16) c.lineTo(x, 40 + Math.sin(x * 0.024 + phase) * 22 + Math.sin(x * 0.07 + phase * 2) * 8);
    c.lineTo(w, h);
    c.closePath();
    c.clip();
    c.drawImage(img, phase * 40, 0, img.width - phase * 40, img.height * 0.55, 0, 0, w, h);
    c.fillStyle = 'rgba(14,62,84,0.62)';
    c.fillRect(0, 0, w, h);
  });
}

/** The ferryman in black paper, poling. */
function boatTexture() {
  return paintedTexture(720, 420, (c, w, h) => {
    c.fillStyle = '#0d0a10';
    c.beginPath();
    c.moveTo(20, h * 0.68);
    c.quadraticCurveTo(w * 0.5, h * 0.98, w - 20, h * 0.62);
    c.lineTo(w - 90, h * 0.74);
    c.lineTo(90, h * 0.76);
    c.closePath();
    c.fill();
    // the figure
    c.beginPath();
    c.moveTo(w * 0.34, h * 0.76);
    c.lineTo(w * 0.37, h * 0.32);
    c.quadraticCurveTo(w * 0.4, h * 0.15, w * 0.45, h * 0.22);
    c.quadraticCurveTo(w * 0.49, h * 0.3, w * 0.47, h * 0.4);
    c.lineTo(w * 0.52, h * 0.76);
    c.fill();
    c.lineWidth = 9;
    c.strokeStyle = '#0d0a10';
    c.beginPath();
    c.moveTo(w * 0.62, 6);
    c.lineTo(w * 0.28, h * 0.98);
    c.stroke();
  });
}

/** He who stands behind the queen, in black paper, crowned. */
function kingTexture() {
  return paintedTexture(640, 960, (c, w, h) => {
    c.fillStyle = '#0a070c';
    c.beginPath();
    c.moveTo(w * 0.1, h);
    c.bezierCurveTo(w * 0.06, h * 0.5, w * 0.22, h * 0.28, w * 0.36, h * 0.25);
    c.lineTo(w * 0.34, h * 0.12);
    for (let i = 0; i <= 6; i++) c.lineTo(w * (0.34 + i * 0.053), h * (i % 2 ? 0.1 : 0.03));
    c.lineTo(w * 0.66, h * 0.12);
    c.lineTo(w * 0.64, h * 0.25);
    c.bezierCurveTo(w * 0.78, h * 0.28, w * 0.94, h * 0.5, w * 0.9, h);
    c.fill();
  });
}

function tabTexture() {
  return paintedTexture(128, 96, (c, w, h) => {
    c.fillStyle = '#c9b892';
    c.beginPath();
    c.roundRect(4, 4, w - 8, h - 8, 14);
    c.fill();
    c.strokeStyle = '#6b4f2c';
    c.lineWidth = 3;
    c.stroke();
    c.beginPath();
    c.moveTo(w / 2 - 20, h / 2 - 6);
    c.lineTo(w / 2, h / 2 + 14);
    c.lineTo(w / 2 + 20, h / 2 - 6);
    c.stroke();
  });
}

export class HadesScene extends BaseScene {
  skipTo = 'eros';

  async enter() {
    const { ctx } = this;
    ctx.rig.position.set(0, EYE, START_Z);
    ctx.look.reset(0, -0.25);
    this.bg = new THREE.Color('#07060b');
    ctx.scene.background = this.bg;
    ctx.scene.fog = new THREE.Fog('#07060b', 11, 30);
    ctx.grain.set({ grain: 0.07, vignette: 0.5, color: '#07060b' });
    ctx.haze.set({ amount: 0, color: '#120810', blur: 0, saturate: 1 });
    const { audio } = ctx;
    audio.define('underworld', underworld);
    audio.define('darkWater', darkWater);
    audio.define('paper', paper);
    audio.define('quake', quake);
    audio.define('thump', () => thump());

    const names = ['dore-sky', 'dore-hill', 'dore-crowd', 'dore-bank', 'dore-water', 'rubens-plate', 'proserpine', 'return', 'demeter', 'grove-tufts'];
    const [T, A] = await Promise.all([loadArt('persephone', names), loadArt('afterlife', ['cerberus']), audio.preload(['underworld', 'darkWater', 'paper', 'quake', 'thump'])]);
    this.T = T;

    const wash = T['dore-water']?.image;
    const blank = () => pageTexture({ wash });
    this.book = new Book([
      { left: pageTexture({ plate: T['rubens-plate']?.image, plateTop: 0.6, wash }), right: blank() },
      { left: blank(), right: blank() },
      { left: blank(), right: blank() },
      { left: pageTexture({ ground: '#e6dcc0', rule: '#a37f3f' }), right: pageTexture({ ground: '#e6dcc0', rule: '#a37f3f' }) },
    ]);
    this.add(this.book);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 40), new THREE.MeshLambertMaterial({ color: '#0f0c13' }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.07;
    floor.raycast = () => {};
    this.add(floor);

    this.spreads = [this._spreadStyx(T), this._spreadAsphodel(T, A), this._spreadThrone(T), this._spreadReturn(T)];
    for (const s of this.spreads) this.add(s.group);
    this.current = 0;

    this._buildFlames();
    this._buildCorner();

    this.hemi = new THREE.HemisphereLight('#8f80a6', '#241a24', 1.25);
    this.key = new THREE.DirectionalLight('#ffc79a', 1.5);
    this.key.position.set(-1.5, 6, 7);
    this.key.target.position.set(0, 0, -4);
    this.fireA = new THREE.PointLight('#ff8a3a', 16, 14, 1.5);
    this.fireB = new THREE.PointLight('#ff7a2a', 16, 14, 1.5);
    this.fireA.position.set(-5.2, 2.4, -0.4);
    this.fireB.position.set(5.2, 2.4, -0.4);
    this.root.add(this.hemi, this.key, this.key.target, this.fireA, this.fireB);
    this.embers = this.add(new Dust({ count: 240, radius: 9, inner: 1, color: '#ff9c55', size: 0.03, opacity: 0.45, speed: 0.012 }));
    this.embers.position.set(0, 1.8, -3.5);

    this.walkArea = { center: [0, -3.2], radius: 8.6 };
  }

  // ---------- the spreads ----------

  _flat(list, tex, h, opts) {
    if (!tex) return null;
    const f = new PaperFlat(tex, h, opts);
    list.push(f);
    return f;
  }

  _group(flats, extra = []) {
    const group = new THREE.Group();
    for (const f of flats) {
      group.add(f);
      group.add(pageShadow(f.width + 0.6, 0.7, f.position.x, f.position.z + 0.14));
    }
    group.add(...extra);
    group.visible = false;
    return { group, flats, fold: 0 };
  }

  _spreadStyx(T) {
    const flats = [];
    this._flat(flats, T['dore-sky'], 4.9, { x: 0, z: -7.9 });
    this._flat(flats, T['dore-hill'], 4.4, { x: -3.4, z: -6.5 });
    this._flat(flats, T['dore-crowd'], 3.3, { x: -1.6, z: -5.1 });
    this.waves = [];
    const img = T['dore-water']?.image;
    if (img) {
      [[-4.4, 0.8], [-3.5, 2.2], [-2.6, 3.6]].forEach(([z, ph], i) => {
        const tex = waveStrip(img, ph);
        const f = this._flat(flats, tex, 1.25 - i * 0.15, { x: 2.7, z, tint: '#a6dcea' });
        this.waves.push(f);
      });
    }
    this._flat(flats, T['dore-bank'], 1.7, { x: -3.3, z: -3.1 });

    // pull the tab: the boat comes across, between the waves
    this.boat = new PaperFlat(boatTexture(), 2.3, { x: 8, z: -3.05 });
    this.boat.fold = 1;
    this.boat.position.y = 0.42;
    this.boat.visible = false;
    return this._group(flats, [this.boat]);
  }

  _spreadAsphodel(T, A) {
    const flats = [];
    this._flat(flats, hillsTexture(), 4.0, { x: 0, z: -7.9 });
    const asph = asphodelTexture();
    for (const [x, z, h] of [[-4.6, -5.6, 1.6], [-2.2, -6.3, 1.3], [0.4, -4.8, 1.5], [3.6, -6.4, 1.4], [4.6, -3.2, 1.5], [-4.3, -2.4, 1.6], [-1, -2.6, 1.1]]) {
      this._flat(flats, asph, h, { x, z, tint: '#cfd0c0' });
    }
    // shades of the dead, cut from pale paper
    const textures = [shadeTexture(0), shadeTexture(1), shadeTexture(2)];
    this.shades = [];
    for (let i = 0; i < SHADES; i++) {
      const a = (i / SHADES) * Math.PI * 2;
      const home = new THREE.Vector2(Math.cos(a) * (2 + (i % 3)) * 1.25, -3.8 + Math.sin(a) * (1.4 + (i % 3)) * 1.05);
      const f = this._flat(flats, textures[i % 3], 1.6 + (i % 3) * 0.14, { x: home.x, z: home.y, tint: '#d4d2e4' });
      f.sheet.material.transparent = true;
      f.sheet.material.opacity = 0.82;
      f.sheet.material.alphaTest = 0.3;
      this.shades.push({ flat: f, home, phase: i * 2.1 });
    }
    // hidden under a tab: the dog
    this.cerberus = A.cerberus ? new PaperFlat(A.cerberus, 3.1, { x: 2.3, z: -5.4 }) : null;
    return this._group(flats, this.cerberus ? [this.cerberus] : []);
  }

  _spreadThrone(T) {
    const flats = [];
    this._flat(flats, archTexture(), 5.6, { x: 0, z: -7.7 });
    this._flat(flats, T.proserpine, 4.1, { x: 0, z: -5.7 });
    const asph = asphodelTexture();
    const shade = shadeTexture(2);
    for (const [x, z, h] of [[-4.7, -6, 1.7], [4.6, -5.6, 1.6], [-3.3, -3.6, 1.2], [3.5, -3.2, 1.3]]) this._flat(flats, asph, h, { x, z, tint: '#a9a896' });
    for (const [x, z, h] of [[-2.4, -4.2, 1.35], [2.5, -4, 1.45], [-1.5, -2.6, 1.2]]) this._flat(flats, shade, h, { x, z, tint: '#a8a6bc' });
    // hidden under a tab: who stands behind her
    this.king = new PaperFlat(kingTexture(), 5.2, { x: 0, z: -7.0 });
    this.throneGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ff9c55', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.throneGlow.position.set(0, 2.6, -7.45);
    this.throneGlow.scale.setScalar(5);
    this.throneGlow.raycast = () => {};
    return this._group(flats, [this.king, this.throneGlow]);
  }

  _spreadReturn(T) {
    const flats = [];
    this._flat(flats, T.demeter, 3.6, { x: -2.3, z: -5.0 });
    this._flat(flats, T.return, 4.4, { x: 2.2, z: -4.6 });
    const tufts = T['grove-tufts'];
    if (tufts) {
      for (let i = 0; i < 9; i++) {
        const tex = tufts.clone();
        tex.repeat.set(0.5, 0.5);
        tex.offset.set((i % 2) * 0.5, ((i >> 1) % 2) * 0.5);
        tex.needsUpdate = true;
        this._flat(flats, tex, 0.95 + (i % 3) * 0.12, { x: -4.6 + i * 1.15, z: -3 + ((i * 7) % 3) * 0.55 });
      }
    }
    this.dayGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#fff2d0', transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));
    this.dayGlow.position.set(0, 6, -6);
    this.dayGlow.scale.setScalar(22);
    this.dayGlow.raycast = () => {};
    return this._group(flats, [this.dayGlow]);
  }

  /** Stand a spread up (or lay it down): sheets rise one after another, back to front. */
  _setFold(spread, k) {
    spread.fold = k;
    spread.group.visible = k > 0.001;
    const n = spread.flats.length;
    spread.flats.forEach((f, i) => {
      const d = Math.min(0.7, (i / Math.max(1, n)) * (1 - STAGGER) * 0.8);
      f.fold = ease.out(clamp((k - d) / (1 - d), 0, 1));
    });
  }

  // ---------- flames ----------

  _buildFlames() {
    const tex = flameTexture();
    this.flames = FLAMES.map(([x, z], i) => {
      const g = new THREE.Group();
      g.position.set(x, 0.1, z);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.1, 0.5, 10), new THREE.MeshLambertMaterial({ color: '#2a1d16' }));
      bowl.position.y = 0.25;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.2).translate(0, 0.6, 0), new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, fog: false, toneMapped: false }));
      m.position.y = 0.45;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ff8a3a', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      halo.position.y = 1.0;
      halo.scale.setScalar(2.6);
      bowl.raycast = m.raycast = halo.raycast = () => {};
      g.add(bowl, m, halo);
      g.userData = { flame: m, halo, phase: i * 1.9 };
      g.visible = false;
      this.add(g);
      return g;
    });
  }

  // ---------- the page corner, the tabs ----------

  _buildCorner() {
    const { interact } = this.ctx;
    this.turnHandles = [];
    const turnHandle = (geo, x, z, material, reach) => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(x, 0.17, z);
      m.visible = false;
      this.add(m);
      this.turnHandles.push(m);
      interact.addHandle(m, {
        reach,
        tip: 'turn',
        onClick: () => this._autoTurn(),
        onDrag: (p) => this._dragTurn(p, x),
        onRelease: () => this._releaseTurn(),
      });
      return m;
    };
    const gold = new THREE.MeshBasicMaterial({ color: '#d9ad55', transparent: true, opacity: 0.8, fog: false, toneMapped: false, depthWrite: false, side: THREE.DoubleSide });
    this.gold = gold;
    // the corner of the page, for whoever walks to it
    const tri = new THREE.Shape();
    tri.moveTo(0, 0);
    tri.lineTo(-0.7, 0);
    tri.lineTo(0, 0.7);
    tri.closePath();
    turnHandle(new THREE.ShapeGeometry(tri).rotateX(-Math.PI / 2), PAGE_W - 0.02, SPINE_NEAR - 0.02, gold, 0.7);
    // a silk ribbon, at the edge of the page right in front of you
    const rib = new THREE.Shape();
    rib.moveTo(-0.17, 0.5);
    rib.lineTo(0.17, 0.5);
    rib.lineTo(0.17, -0.34);
    rib.lineTo(0, -0.2);
    rib.lineTo(-0.17, -0.34);
    rib.closePath();
    turnHandle(new THREE.ShapeGeometry(rib).rotateX(-Math.PI / 2), RIBBON_X, SPINE_NEAR + 0.02, gold, 0.5);
    this.turnState = null;

    const tabGeo = new THREE.PlaneGeometry(0.62, 0.46);
    tabGeo.rotateX(-Math.PI / 2);
    this.tab = new THREE.Mesh(tabGeo, paperMaterial(tabTexture()));
    this.tab.position.set(TAB_X, 0.17, SPINE_NEAR + 0.26);
    this.tab.visible = false;
    this.add(this.tab);
    this.tabK = 0;
    this.tabDone = null;
    interact.addHandle(this.tab, {
      reach: 0.55,
      tip: 'pull',
      onClick: () => this._finishTab(),
      onDrag: (p) => {
        this.tabK = clamp((p.z - (SPINE_NEAR + 0.26)) / 0.6, 0, 1);
        this.tab.position.z = SPINE_NEAR + 0.26 + this.tabK * 0.6;
        this.tabEffect?.(this.tabK);
      },
      onRelease: () => {
        if (this.tabK > 0.55) this._finishTab();
        else this.tween(0.25, (k) => {
          const z = lerp(this.tabK, 0, k);
          this.tab.position.z = SPINE_NEAR + 0.26 + z * 0.6;
          this.tabEffect?.(z);
        }).then(() => (this.tabK = 0));
      },
    });
  }

  /** Offer a tab: `effect(k)` runs as it is pulled. Resolves when it has been pulled all the way. */
  _offerTab(effect, seconds = 16) {
    this.tab.visible = true;
    this.tab.position.z = SPINE_NEAR + 0.26;
    this.tabK = 0;
    this.tabEffect = effect;
    effect(0);
    this.say(this.ctx.content.HADES.tab, { narrate: false, hold: 4 });
    return new Promise((resolve) => {
      this.tabDone = resolve;
      this.wait(seconds).then(() => this._finishTab());
    });
  }

  _finishTab() {
    if (!this.tabDone) return;
    const done = this.tabDone;
    this.tabDone = null;
    const from = this.tabK;
    this.sound('paper', { volume: 0.5 });
    this.tween(0.9, (k) => {
      const v = lerp(from, 1, ease.out(k));
      this.tab.position.z = SPINE_NEAR + 0.26 + v * 0.6;
      this.tabEffect?.(v);
    }).then(() => {
      this.tab.visible = false;
      done();
    });
  }

  /** Offer the corner. Resolves when the page has turned. */
  _offerTurn(seconds = 40) {
    for (const h of this.turnHandles) h.visible = true;
    this.say(this.ctx.content.HADES.turn, { narrate: false, hold: 4 });
    return new Promise((resolve) => {
      this.turnDone = resolve;
      this.wait(seconds).then(() => this._autoTurn());
    });
  }

  _beginTurn() {
    if (this.turnState || !this.turnDone) return false;
    this.book.prepareTurn();
    this.turnState = { k: 0 };
    this.spreads[this.current + 1].group.visible = true;
    this.sound('paper', { volume: 0.9 });
    return true;
  }

  _setTurn(k) {
    this.turnState.k = k;
    this.book.turn = k;
    this._setFold(this.spreads[this.current], 1 - Math.min(1, k * 3));
    this._setFold(this.spreads[this.current + 1], clamp((k - 0.6) / 0.4, 0, 1));
  }

  _autoTurn() {
    if (!this.turnDone) return;
    if (!this.turnState && !this._beginTurn()) return;
    const from = this.turnState.k;
    for (const h of this.turnHandles) h.visible = false;
    this.tween(BLINK_SPEED * (1 - from), (k) => this._setTurn(lerp(from, 1, k)), ease.inOut).then(() => this._finishTurn());
  }

  _dragTurn(p, from) {
    if (!this.turnState && !this._beginTurn()) return;
    this._setTurn(clamp((from - p.x) / (from * 2), 0, 1));
  }

  _releaseTurn() {
    if (!this.turnState) return;
    const from = this.turnState.k;
    if (from > 0.3) {
      this._autoTurn();
      return;
    }
    this.tween(0.4, (k) => this._setTurn(lerp(from, 0, k))).then(() => {
      this.book.cancelTurn();
      this.turnState = null;
      this._setFold(this.spreads[this.current], 1);
      this.spreads[this.current + 1].group.visible = false;
    });
  }

  _finishTurn() {
    this.book.finishTurn();
    this.turnState = null;
    this.spreads[this.current].group.visible = false;
    this.current++;
    for (const h of this.turnHandles) h.visible = false;
    const done = this.turnDone;
    this.turnDone = null;
    done?.();
  }

  // ---------- the story ----------

  async start() {
    const { ctx } = this;
    const H = ctx.content.HADES;
    const M = ctx.content.MYTHS.persephone;
    this.sound('underworld', { loop: true, volume: 0.9 });

    await this.wait(1.2);
    this.say(H.open, { hold: 1 });
    await this.wait(1.2);

    // the cover swings over
    this.sound('paper', { volume: 1 });
    this.sound('quake', { volume: 0.5 });
    await this.tween(3.4, (k) => (this.book.open = k), ease.linear);
    for (const f of this.flames) f.visible = true;

    // the first spread stands up
    this.sound('paper', { volume: 0.8 });
    this.spreads[0].group.visible = true;
    this.water = await this.sound('darkWater', { parent: this.spreads[0].flats[3]?.sheet || this.root, loop: true, volume: 0.9, refDistance: 3 });
    await this.tween(3.2, (k) => this._setFold(this.spreads[0], k), ease.linear);

    // Tab one: the ferry.
    this.boat.visible = true;
    await this._offerTab((k) => {
      this.boat.position.x = lerp(8, 1.7, ease.inOut(k));
      this.boat.visible = k > 0.001;
    });
    await this.say(H.crossing, { hold: 1 });
    await this._offerTurn();

    // Spread two: the shades, and what is under the tab.
    this.ctx.audio.fade(this.water, 0, 1);
    await this.say(H.shades, { hold: 1 });
    if (this.cerberus) {
      await this._offerTab((k) => (this.cerberus.fold = k));
      this.sound('quake', { parent: this.cerberus, volume: 0.9, refDistance: 3 });
      await this.say(ctx.content.MYTHS.afterlife.cerberus, { hold: 0.8 });
    }
    await this._offerTurn();

    // Spread three: the queen; and behind her, under the tab, the king.
    await this.say(H.queen, { hold: 1 });
    await this._offerTab((k) => (this.king.fold = k));
    this.sound('thump', { parent: this.king, volume: 0.6, refDistance: 4 });
    await this.say(M.seed, { hold: 1 });
    await this._offerTurn();

    // The last page: spring, and the way up.
    this.spring = true;
    this.tween(5, (k) => {
      this.dayGlow.material.opacity = 0.5 * k;
      this.hemi.intensity = lerp(1.0, 2.1, k);
      this.hemi.color.lerpColors(_violet, _day, k);
      this.bg.lerpColors(_night, _dawn, k);
      ctx.scene.fog.color.copy(this.bg);
      this.fireA.intensity = this.fireB.intensity = lerp(16, 3, k);
      for (const f of this.flames) f.scale.setScalar(Math.max(0.01, 1 - k));
    });
    await this.say(M.spring, { hold: 1 });
    await this.say(H.close, { hold: 1.2 });
    this.next('eros', {}, { color: '#000000', out: 3, in: 2 });
  }

  update(dt, t) {
    super.update(dt, t);
    const head = this.ctx.camera.getWorldPosition(_head);

    // flames lean away from you
    for (const g of this.flames) {
      if (!g.visible) continue;
      const u = g.userData;
      const dx = g.position.x - head.x;
      const dz = g.position.z - head.z;
      const near = clamp(1 - Math.hypot(dx, dz) / 3.2, 0, 1);
      u.flame.lookAt(head.x, u.flame.getWorldPosition(_p).y, head.z);
      u.flame.rotateZ((dx > 0 ? -1 : 1) * near * 0.75 + Math.sin(t * 7 + u.phase) * 0.06);
      u.flame.scale.set(1 + Math.sin(t * 13 + u.phase) * 0.06, 1 + Math.sin(t * 9 + u.phase) * 0.1 - near * 0.2, 1);
      u.halo.material.opacity = 0.42 + Math.sin(t * 11 + u.phase) * 0.08;
    }
    if (this.flames[0].visible && !this.spring) {
      this.fireA.intensity = 16 + Math.sin(t * 9) * 1.6 + Math.sin(t * 17) * 1;
      this.fireB.intensity = 16 + Math.sin(t * 8 + 1) * 1.6 + Math.sin(t * 19) * 1;
    }

    // the Styx rocks
    for (let i = 0; i < this.waves.length; i++) {
      const w = this.waves[i];
      if (w.fold >= 0.999) w.sheet.rotation.x = Math.sin(t * 0.8 + i * 1.3) * 0.05;
      w.position.x = 2.7 + Math.sin(t * 0.35 + i) * 0.12;
    }
    if (this.boat.visible) this.boat.sheet.rotation.z = Math.sin(t * 0.9) * 0.018;

    // the shades step aside, and drift back
    if (this.spreads[1].group.visible) {
      for (const s of this.shades) {
        const f = s.flat;
        const dx = f.position.x - head.x;
        const dz = f.position.z - head.z;
        const d = Math.max(0.01, Math.hypot(dx, dz));
        if (d < SHADE_FEAR) {
          const push = (SHADE_FEAR - d) * 2.4 * dt;
          f.position.x += (dx / d) * push;
          f.position.z += (dz / d) * push;
        } else {
          f.position.x += (s.home.x + Math.sin(t * 0.3 + s.phase) * 0.5 - f.position.x) * dt * 0.25;
          f.position.z += (s.home.y + Math.cos(t * 0.26 + s.phase) * 0.4 - f.position.z) * dt * 0.25;
        }
        f.rotation.y = Math.atan2(head.x - f.position.x, head.z - f.position.z);
      }
    }

    // the gold calls
    this.gold.opacity = 0.72 + Math.sin(t * 3) * 0.26;
  }
}

const _head = new THREE.Vector3();
const _p = new THREE.Vector3();
const _violet = new THREE.Color('#7c6c8c');
const _day = new THREE.Color('#fff2d8');
const _night = new THREE.Color('#07060b');
const _dawn = new THREE.Color('#b9a78c');
