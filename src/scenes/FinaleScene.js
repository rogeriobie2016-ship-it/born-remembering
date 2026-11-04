import * as THREE from 'three';
import { BaseScene } from '../core/SceneManager.js';
import { Dust, Orb } from '../core/props.js';
import { cry } from '../core/synth.js';
import { glowTexture, lerp } from '../core/util.js';
import { paintedTexture } from '../core/look.js';
import { loadArt } from '../core/collage.js';

// Scene 10 — every life at once (Iliad VI: "men come and go as leaves").
// The montage cuts through the paintings of every past life — Venus, Hector and
// Andromache, Icarus, the Sirens, Orpheus and Eurydice, Beethoven, Medusa, Elysium —
// each a gilded oval on a ground of old paper, while olive and laurel leaves fall
// through all of them. Then white, a newborn's cry, and the whole poem once more.


/** The lives, in order: [art dir, file, paper ground]. */
const LIVES = [
  ['garden', 'venus', '#3a2c22'],
  ['crib', 'hayez', '#2e2018'],
  ['icarus', 'icarus', '#2c3238'],
  ['sirens', 'sirens-climbing', '#1e2a2e'],
  ['orpheus', 'leighton', '#22261e'],
  ['orpheus', 'beethoven', '#1a120e'],
  ['medusa', 'shield', '#1c1a18'],
  ['afterlife', 'elysium-lyre', '#2a2a1e'],
];

/** An olive or laurel leaf, painted: silvery-green blade with a pale midrib. */
function leafTexture(color, rib) {
  return paintedTexture(64, 160, (c, w, h) => {
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(w / 2, 4);
    c.quadraticCurveTo(w - 4, h * 0.45, w / 2, h - 4);
    c.quadraticCurveTo(4, h * 0.45, w / 2, 4);
    c.fill();
    c.strokeStyle = rib;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(w / 2, 8);
    c.lineTo(w / 2, h - 8);
    c.stroke();
    // engraved shading on one half
    c.strokeStyle = 'rgba(30,24,14,0.35)';
    c.lineWidth = 1;
    for (let y = 20; y < h - 16; y += 6) {
      c.beginPath();
      c.moveTo(w / 2, y);
      c.lineTo(w / 2 + 16, y + 9);
      c.stroke();
    }
  });
}

/** Leaves falling and turning around the viewer, forever. */
class Leaves extends THREE.Group {
  constructor(count = 70) {
    super();
    this.items = [];
    const geo = new THREE.PlaneGeometry(0.05, 0.13);
    const mats = [
      ['#8a9a6e', '#d8dcc0'], // olive, silver-green
      ['#4e6a3a', '#a8b890'], // laurel
      ['#b08a4a', '#f0d8a0'], // a gilded leaf
    ].map(([col, rib]) => new THREE.MeshBasicMaterial({ map: leafTexture(col, rib), transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mats[i % 7 === 0 ? 2 : i % 2]);
      m.raycast = () => {};
      m.userData = { phase: Math.random() * 6.28, speed: 0.12 + Math.random() * 0.14, spin: (Math.random() - 0.5) * 2.5 };
      Leaves.spawn(m, -1.5 + Math.random() * 4.5);
      this.add(m);
      this.items.push(m);
    }
    this.opacity = 0;
  }

  static spawn(m, y) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2; // mostly in front of you
    const r = 1.1 + Math.random() * 2.6;
    m.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
  }

  update(t, dt) {
    for (const m of this.items) {
      const u = m.userData;
      m.position.y -= u.speed * dt;
      m.position.x += Math.sin(t * 0.9 + u.phase) * 0.12 * dt;
      m.rotation.set(Math.sin(t * 1.3 + u.phase) * 0.9, t * u.spin + u.phase, Math.cos(t * 1.1 + u.phase) * 0.7);
      if (m.position.y < -1.7) Leaves.spawn(m, 2.6 + Math.random() * 0.5);
      m.material.opacity = this.opacity;
    }
  }
}

/** A painting of one life, as a gilded oval medallion in front of you. */
function lifeMedallion(tex) {
  const g = new THREE.Group();
  // fit inside 2.4 × 1.7 m, keeping the painting's proportions
  const aspect = tex.image.width / tex.image.height;
  const h = Math.min(1.7, 2.4 / aspect);
  const w = h * aspect;
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false }));
  // Fit the picture into an oval opening: crop by alpha with a soft-edged oval mask.
  pic.material.alphaMap = ovalMask();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.018, 8, 96),
    new THREE.MeshBasicMaterial({ color: '#c8a050', fog: false }),
  );
  ring.scale.set(w * 0.49, h * 0.49, 1);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffdca0', transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  );
  glow.scale.set(w * 1.6, h * 1.4, 1);
  glow.position.z = -0.05;
  g.add(glow, pic, ring);
  g.position.set(0, 0.05, -2.4);
  g.traverse((o) => (o.raycast = () => {}));
  return g;
}

let _oval = null;
function ovalMask() {
  if (_oval) return _oval;
  _oval = paintedTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#000';
    c.fillRect(0, 0, w, h);
    const g = c.createRadialGradient(w / 2, h / 2, w * 0.38, w / 2, h / 2, w * 0.5);
    g.addColorStop(0, '#fff');
    g.addColorStop(1, '#000');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(w / 2, h / 2, w * 0.49, h * 0.49, 0, 0, Math.PI * 2);
    c.fill();
  });
  _oval.userData.shared = true;
  return _oval;
}

/** Scene 10 — every life at once, the cycle closes, the whole poem returns. */
export class FinaleScene extends BaseScene {
  skipTo = 'credits';

  async enter(params = {}) {
    const { ctx } = this;
    const { FINALE } = ctx.content;
    this.ending = params.ending === 'letgo' ? 'letgo' : 'hold';
    const cold = this.ending === 'letgo';
    ctx.scene.background = new THREE.Color('#000000');
    ctx.grain.set({ grain: 0.07, vignette: 0.5, color: '#120c08' });

    // Every life's painting, plus the ending you chose: your mother's face, or Argos.
    const dirs = {};
    for (const [dir, name] of LIVES) (dirs[dir] ||= []).push(name);
    const lastDir = cold ? 'endings' : 'crib';
    const last = cold ? 'argos' : 'andromache-face';
    (dirs[lastDir] ||= []).push(last);
    const loaded = await Promise.all(Object.entries(dirs).map(([d, names]) => loadArt(d, names).then((a) => [d, a])));
    const art = Object.fromEntries(loaded);
    this.cuts = [...LIVES, [lastDir, last, cold ? '#1a1e24' : '#2e2018']]
      .filter(([d, n]) => art[d][n])
      .map(([d, n, bg]) => {
        const m = lifeMedallion(art[d][n]);
        m.visible = false;
        m.userData.bg = bg;
        this.root.add(m);
        return m;
      });

    this.leaves = this.add(new Leaves());

    // Compile every material now (all visible for one pass), so the cuts never stutter.
    for (const c of this.cuts) c.visible = true;
    try {
      ctx.renderer.compile(ctx.scene, ctx.camera);
    } catch {}
    this._showCut(-1);

    this.dust = this.add(new Dust({ count: 400, opacity: 0, speed: 0.01, color: cold ? '#dfe8f5' : '#fff4e0' }));

    this.orbs = [
      { label: FINALE.again, to: 'prologue', color: '#ffe9c2', x: -0.45 },
      { label: FINALE.credits, to: 'credits', color: '#c9d8f0', x: 0.45 },
    ].map((o) => {
      const orb = this.add(new Orb({ label: o.label, color: o.color }));
      orb.position.set(o.x, -0.85, -2.4);
      orb.visible = false;
      ctx.input.add(orb, { onSelect: () => this.next(o.to), onHover: (on) => orb.setHover(on) });
      return orb;
    });

    ctx.audio.defineFile('cry-finale', 'cry-newborn-1.mp3', () => cry(7)); // a newborn's first cry
    return ctx.audio.preload(['cry-finale', 'ninth', 'moonlight']);
  }

  _showCut(i) {
    this.cuts.forEach((c, j) => (c.visible = j === i));
    if (this.cuts[i]) this.ctx.scene.background = new THREE.Color(this.cuts[i].userData.bg);
  }

  async start() {
    const { audio, fader, content } = this.ctx;
    const { FINALE, POEM, MYTHS } = content;
    const cold = this.ending === 'letgo';
    const n = this.cuts.length;

    // 1 · Every life at once, leaves falling through all of them.
    // Cuts accelerate but stay ≥ 0.3 s (≈3 flashes/s max, photosensitivity-safe).
    await this.wait(cold ? 2.2 : 1.2);
    audio.playMusic('ninth', { volume: 0.75, fade: 0.6 });
    this.tween(2, (k) => (this.leaves.opacity = k));
    const total = n * 2 + 2;
    for (let i = 0; i < total; i++) {
      const cut = i % n;
      this._showCut(cut);
      const m = this.cuts[cut];
      if (m) m.scale.setScalar(1 + (i / total) * 0.15); // each pass a little nearer
      await this.wait(lerp(0.75, 0.3, i / (total - 1)));
    }

    // 2 · The cycle closes: white void, a newborn's first cry.
    await fader.fade(1, 0.5, '#ffffff');
    this._showCut(-1);
    const voidColor = new THREE.Color(cold ? '#eef2f7' : '#fffaf0');
    this.ctx.scene.background = voidColor.clone();
    this.leaves.opacity = 0;
    audio.stopMusic(0.4);
    await this.wait(0.6);
    fader.fade(0, 2.2);
    await this.wait(1.0);
    this.sound('cry-finale', { volume: 0.9 });
    await this.wait(2.6);

    // The white closes back into the dark where the poem lives; the leaves return.
    const dark = new THREE.Color(cold ? '#06080c' : '#0c0806');
    this.tween(4.5, (k) => (this.leaves.opacity = k * 0.8));
    await this.tween(4.5, (k) => {
      this.ctx.scene.background.copy(voidColor).lerp(dark, k);
      this.dust.material.opacity = 0.35 * k;
    });
    audio.playMusic('moonlight', { volume: 0.6, fade: 4 });
    await this.say(MYTHS.finale.text, { hold: 2 });
    await this.say(FINALE.cycle, { hold: 2 });
    await this.wait(1);

    // 3 · The whole poem, once more.
    for (const line of POEM.stanza) await this.say(line, { hold: 0.7 });
    await this.wait(2);

    // 4 · Begin again, or the credits.
    for (const orb of this.orbs) orb.visible = true;
  }
}
