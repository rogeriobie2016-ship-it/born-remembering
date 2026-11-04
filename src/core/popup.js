import * as THREE from 'three';
import { glowTexture, ease } from './util.js';
import { paintedTexture } from './look.js';

// The language of the pop-up book: paper standing up from a page, hinged at its foot.

export const PAGE_W = 6;
export const PAGE_D = 9;
export const SPINE_NEAR = 0.6; // the book's near edge (z); it runs back from there
const PAGE_Z = SPINE_NEAR - PAGE_D / 2;
const THICK = 0.14;

/** Cut paper: crisp alpha, lit by the scene, seen from both sides. */
export function paperMaterial(tex, tint = '#ffffff') {
  return new THREE.MeshLambertMaterial({ map: tex, color: tint, alphaTest: 0.5, side: THREE.DoubleSide });
}

/**
 * One sheet standing on a page. `fold` 0 = flat on the page, 1 = upright.
 * Its width is taken from the texture's proportions.
 */
export class PaperFlat extends THREE.Group {
  constructor(tex, height, { x = 0, z = 0, tint, lean = 0, yaw = 0 } = {}) {
    super();
    const w = height * (tex.image.width / tex.image.height);
    const geo = new THREE.PlaneGeometry(w, height);
    geo.translate(0, height / 2, 0);
    this.sheet = new THREE.Mesh(geo, paperMaterial(tex, tint));
    this.sheet.raycast = () => {};
    this.add(this.sheet);
    this.position.set(x, 0.02, z);
    this.rotation.y = yaw;
    this.lean = lean;
    this.width = w;
    this.fold = 0;
  }

  set fold(k) {
    this._fold = k;
    this.visible = k > 0.002;
    // falls back onto the page; the slight overshoot is the paper's spring
    this.sheet.rotation.x = -(Math.PI / 2) * (1 - k) + this.lean * k;
  }

  get fold() {
    return this._fold;
  }
}

/** A soft dark pool where a sheet meets the page, so nothing floats. */
export function pageShadow(w, d, x, z) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#000000', transparent: true, opacity: 0.6, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.012, z);
  m.raycast = () => {};
  return m;
}

/** A paper-coloured page, with a plate printed on it if given. */
export function pageTexture({ plate, ground = '#2c2430', rule = '#8a6c3c', plateTop = 0.08, wash = null } = {}) {
  const tex = paintedTexture(768, 1152, (c, w, h) => {
    c.fillStyle = ground;
    c.fillRect(0, 0, w, h);
    if (wash) {
      // an engraving printed faintly into the paper
      c.save();
      c.globalAlpha = 0.16;
      c.globalCompositeOperation = 'luminosity';
      c.drawImage(wash, 0, 0, w, h);
      c.restore();
    }
    // fibres in the paper
    for (let i = 0; i < 1400; i++) {
      c.strokeStyle = `rgba(255,240,215,${Math.random() * 0.05})`;
      c.beginPath();
      const x = Math.random() * w;
      const y = Math.random() * h;
      c.moveTo(x, y);
      c.lineTo(x + (Math.random() - 0.5) * 34, y + (Math.random() - 0.5) * 10);
      c.stroke();
    }
    c.strokeStyle = rule;
    c.lineWidth = 3;
    c.strokeRect(34, 34, w - 68, h - 68);
    c.lineWidth = 1;
    c.strokeRect(46, 46, w - 92, h - 92);
    if (plate) {
      const iw = w - 150;
      const ih = iw * (plate.height / plate.width);
      c.drawImage(plate, 75, h * plateTop, iw, ih);
      c.strokeStyle = rule;
      c.lineWidth = 2;
      c.strokeRect(75, h * plateTop, iw, ih);
    }
  });
  tex.anisotropy = 8;
  return tex;
}

function coverTexture() {
  const tex = paintedTexture(768, 1152, (c, w, h) => {
    c.fillStyle = '#1b1012';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      c.fillStyle = `rgba(255,220,180,${Math.random() * 0.025})`;
      c.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 4, 1);
    }
    c.strokeStyle = '#a37f3f';
    c.lineWidth = 5;
    c.strokeRect(46, 46, w - 92, h - 92);
    // Greek key along the border
    c.lineWidth = 3;
    for (let x = 70; x < w - 80; x += 44) {
      c.beginPath();
      c.moveTo(x, 90);
      c.lineTo(x, 70);
      c.lineTo(x + 30, 70);
      c.lineTo(x + 30, 84);
      c.lineTo(x + 14, 84);
      c.moveTo(x, h - 90);
      c.lineTo(x, h - 70);
      c.lineTo(x + 30, h - 70);
      c.lineTo(x + 30, h - 84);
      c.lineTo(x + 14, h - 84);
      c.stroke();
    }
    // a pomegranate on the cover
    c.fillStyle = '#7d1f24';
    c.beginPath();
    c.arc(w / 2, h * 0.46, 92, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#a37f3f';
    c.lineWidth = 4;
    c.stroke();
    c.fillStyle = '#a37f3f';
    c.beginPath();
    c.moveTo(w / 2 - 28, h * 0.46 - 88);
    c.lineTo(w / 2 - 36, h * 0.46 - 130);
    c.lineTo(w / 2 - 12, h * 0.46 - 108);
    c.lineTo(w / 2, h * 0.46 - 136);
    c.lineTo(w / 2 + 12, h * 0.46 - 108);
    c.lineTo(w / 2 + 36, h * 0.46 - 130);
    c.lineTo(w / 2 + 28, h * 0.46 - 88);
    c.fill();
  });
  tex.anisotropy = 8;
  return tex;
}

/**
 * The giant book on the floor. Closed it lies to the right of its spine; `open` (0..1) swings
 * the cover over and slides the book so the spine ends up at x = 0. `turn` (0..1) sweeps a page
 * from right to left. Spine along z, from SPINE_NEAR back.
 */
export class Book extends THREE.Group {
  constructor(spreads) {
    super();
    this.spreads = spreads; // [{ left: texture, right: texture }]
    this.index = 0;

    const leather = new THREE.MeshLambertMaterial({ color: '#1b1012' });
    const edges = new THREE.MeshLambertMaterial({ color: '#5e5444' });

    const blockGeo = new THREE.BoxGeometry(PAGE_W, THICK, PAGE_D);
    blockGeo.translate(PAGE_W / 2, THICK / 2, 0);
    const backCover = new THREE.Mesh(new THREE.BoxGeometry(PAGE_W + 0.1, 0.04, PAGE_D + 0.14).translate(PAGE_W / 2, -0.02, 0), leather);
    backCover.position.z = PAGE_Z;
    this.rightBlock = new THREE.Mesh(blockGeo, edges);
    this.rightBlock.position.z = PAGE_Z;

    // the left half appears as the cover lands
    this.leftBlock = new THREE.Mesh(blockGeo, edges);
    this.leftBlock.position.z = PAGE_Z;
    this.leftBlock.rotation.y = Math.PI;
    this.leftBlock.scale.y = 0.001;

    const pageGeo = new THREE.PlaneGeometry(PAGE_W, PAGE_D);
    pageGeo.rotateX(-Math.PI / 2);
    pageGeo.translate(PAGE_W / 2, 0, 0);
    this.rightPage = new THREE.Mesh(pageGeo, new THREE.MeshLambertMaterial({ map: spreads[0].right }));
    this.rightPage.position.set(0, THICK + 0.004, PAGE_Z);
    // same geometry turned about the spine; flipped UVs are fine for paper and plates turn with it
    const leftGeo = new THREE.PlaneGeometry(PAGE_W, PAGE_D);
    leftGeo.rotateX(-Math.PI / 2);
    leftGeo.translate(-PAGE_W / 2, 0, 0);
    this.leftPage = new THREE.Mesh(leftGeo, new THREE.MeshLambertMaterial({ map: spreads[0].left }));
    this.leftPage.position.set(0, THICK + 0.004, PAGE_Z);
    this.leftPage.visible = false;

    // the cover: pivots on the spine
    this.cover = new THREE.Group();
    this.cover.position.set(0, THICK + 0.02, PAGE_Z);
    const coverOut = new THREE.Mesh(new THREE.PlaneGeometry(PAGE_W + 0.1, PAGE_D + 0.14).rotateX(-Math.PI / 2).translate((PAGE_W + 0.1) / 2, 0.03, 0), new THREE.MeshLambertMaterial({ map: coverTexture() }));
    const coverIn = new THREE.Mesh(new THREE.BoxGeometry(PAGE_W + 0.1, 0.03, PAGE_D + 0.14).translate((PAGE_W + 0.1) / 2, 0.01, 0), leather);
    this.cover.add(coverIn, coverOut);

    // the turning page: pivots on the spine, a face on each side
    this.turner = new THREE.Group();
    this.turner.position.set(0, THICK + 0.012, PAGE_Z);
    this.turner.visible = false;
    this.turnFront = new THREE.Mesh(pageGeo, new THREE.MeshLambertMaterial({ map: spreads[0].right }));
    const backGeo = new THREE.PlaneGeometry(PAGE_W, PAGE_D);
    backGeo.rotateX(Math.PI / 2);
    backGeo.rotateY(Math.PI);
    backGeo.translate(PAGE_W / 2, -0.002, 0);
    this.turnBack = new THREE.Mesh(backGeo, new THREE.MeshLambertMaterial({ map: spreads[0].left }));
    this.turner.add(this.turnFront, this.turnBack);

    this.add(backCover, this.rightBlock, this.leftBlock, this.rightPage, this.leftPage, this.cover, this.turner);
    this.traverse((o) => (o.raycast = () => {}));
    this.open = 0;
  }

  set open(k) {
    this._open = k;
    this.cover.rotation.z = Math.PI * ease.inOut(k);
    this.position.x = -(PAGE_W / 2) * (1 - ease.inOut(k)); // closed, it sits centred before you
    const land = Math.max(0, (k - 0.82) / 0.18);
    this.leftBlock.visible = land > 0;
    this.leftBlock.scale.y = Math.max(0.001, land);
    this.leftPage.visible = land > 0.5;
    // the cover ends up beneath the pages it has just uncovered
    this.cover.position.y = THICK + 0.02 - land * (THICK + 0.05);
  }

  get open() {
    return this._open;
  }

  /** Begin turning to the next spread: the page's two faces are this right, next left. */
  prepareTurn() {
    const a = this.spreads[this.index];
    const b = this.spreads[this.index + 1];
    this.turnFront.material.map = a.right;
    this.turnBack.material.map = b.left;
    this.rightPage.material.map = b.right;
    this.turnFront.material.needsUpdate = this.turnBack.material.needsUpdate = this.rightPage.material.needsUpdate = true;
    this.turner.visible = true;
  }

  set turn(k) {
    this.turner.rotation.z = Math.PI * k;
  }

  /** A turn that was let go early falls back. */
  cancelTurn() {
    this.rightPage.material.map = this.spreads[this.index].right;
    this.rightPage.material.needsUpdate = true;
    this.turner.visible = false;
    this.turn = 0;
  }

  finishTurn() {
    this.index++;
    this.leftPage.material.map = this.spreads[this.index].left;
    this.leftPage.material.needsUpdate = true;
    this.turner.visible = false;
    this.turn = 0;
  }
}

/** A paper shroud with a bowed head: one of the shades. pose 0..2 */
export function shadeTexture(pose) {
  return paintedTexture(256, 512, (c, w, h) => {
    const bow = [18, -14, 30][pose];
    c.fillStyle = '#c9c6d6';
    c.beginPath();
    c.moveTo(w * 0.5 + bow, h * 0.04);
    c.bezierCurveTo(w * 0.72 + bow, h * 0.04, w * 0.74 + bow, h * 0.2, w * 0.64 + bow * 0.7, h * 0.26);
    c.bezierCurveTo(w * 0.82, h * 0.36, w * 0.84, h * 0.7, w * (0.92 - pose * 0.03), h * 0.98);
    c.lineTo(w * 0.72, h * 0.93);
    c.lineTo(w * 0.56, h * 0.99);
    c.lineTo(w * 0.42, h * 0.93);
    c.lineTo(w * 0.24, h * 0.99);
    c.lineTo(w * (0.08 + pose * 0.03), h * 0.95);
    c.bezierCurveTo(w * 0.16, h * 0.7, w * 0.18, h * 0.36, w * 0.36 + bow * 0.7, h * 0.26);
    c.bezierCurveTo(w * 0.26 + bow, h * 0.2, w * 0.28 + bow, h * 0.04, w * 0.5 + bow, h * 0.04);
    c.fill();
    // engraved folds, up over the veil
    c.save();
    c.clip();
    c.strokeStyle = 'rgba(38,30,52,0.5)';
    for (let i = 0; i < 30; i++) {
      c.lineWidth = 1 + Math.random() * 1.6;
      const x = w * 0.14 + (i / 30) * w * 0.72;
      c.beginPath();
      c.moveTo(w * 0.5 + bow + (x - w / 2) * 0.35, h * 0.05);
      c.bezierCurveTo(x + bow * 0.5, h * 0.3, x + 14, h * 0.7, x - 6 + (x - w / 2) * 0.25, h);
      c.stroke();
    }
    // the shadow the bowed head throws on the shoulders
    const g = c.createRadialGradient(w * 0.5 + bow * 0.8, h * 0.26, 4, w * 0.5 + bow * 0.8, h * 0.26, w * 0.34);
    g.addColorStop(0, 'rgba(20,16,30,0.6)');
    g.addColorStop(1, 'rgba(20,16,30,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.restore();
  });
}

export function flameTexture() {
  return paintedTexture(128, 256, (c, w, h) => {
    const lobe = (col, scale) => {
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(w / 2, h * (1 - 0.98 * scale));
      c.bezierCurveTo(w * (0.5 + 0.5 * scale), h * 0.5, w * (0.5 + 0.42 * scale), h * 0.95, w / 2, h * 0.98);
      c.bezierCurveTo(w * (0.5 - 0.42 * scale), h * 0.95, w * (0.5 - 0.5 * scale), h * 0.5, w / 2, h * (1 - 0.98 * scale));
      c.fill();
    };
    lobe('#c2410c', 1);
    lobe('#f59e0b', 0.72);
    lobe('#fde68a', 0.42);
  });
}
