import * as THREE from 'three';
import { ease } from './util.js';

const PX = 128; // canvas font size; world size is set by `size`
const FAMILY = '"Cormorant Garamond", Georgia, "Times New Roman", serif';

/** Wait (briefly) for the web font so canvases don't render in a fallback face. */
export async function loadFonts() {
  if (!document.fonts) return;
  const timeout = new Promise((r) => setTimeout(r, 3000));
  const fonts = Promise.all([
    document.fonts.load(`italic 400 ${PX}px "Cormorant Garamond"`),
    document.fonts.load(`400 ${PX}px "Cormorant Garamond"`),
    document.fonts.load(`600 ${PX}px "Cormorant Garamond"`),
  ]).catch(() => {});
  await Promise.race([fonts, timeout]);
}

/** Split text into lines of at most `max` characters. */
export function wrap(text, max = 40) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && (line + ' ' + word).length > max) {
      lines.push(line);
      line = word;
    } else line = line ? line + ' ' + word : word;
  }
  if (line) lines.push(line);
  return lines;
}

function wordTexture(text, o) {
  const font = `${o.italic ? 'italic ' : ''}${o.weight} ${PX}px ${FAMILY}`;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = font;
  const w = Math.ceil(g.measureText(text).width);
  const pad = Math.ceil(PX * 0.3);
  c.width = w + pad * 2;
  c.height = Math.ceil(PX * 1.6);
  g.font = font;
  g.textBaseline = 'middle';
  g.fillStyle = o.color;
  if (o.glow) {
    g.shadowColor = o.glow;
    g.shadowBlur = PX * 0.2;
    g.fillText(text, pad, c.height / 2);
    g.shadowBlur = 0;
  }
  g.fillText(text, pad, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, w, cw: c.width, ch: c.height };
}

/**
 * Text floating in 3D, one mesh per word so it can appear word by word.
 * Planes face +Z: place the block in front of the viewer (negative z).
 */
export class TextBlock extends THREE.Group {
  constructor(lines, opts = {}) {
    super();
    const o = {
      size: 0.16,
      lineHeight: 1.5,
      color: '#f3ede2',
      glow: 'rgba(255,236,205,0.55)',
      italic: true,
      weight: 400,
      spacing: 0.28,
      float: 1,
      opacity: 1,
      ...opts,
    };
    this.opts = o;
    this.words = [];
    this.lines = [];
    this.width = 0;
    const scale = o.size / PX;
    const space = o.size * o.spacing;

    lines.forEach((line, li) => {
      const items = line
        .split(/\s+/)
        .filter(Boolean)
        .map((tok) => {
          const t = wordTexture(tok, o);
          return { ...t, adv: t.w * scale };
        });
      const total = items.reduce((s, it) => s + it.adv, 0) + space * Math.max(0, items.length - 1);
      this.width = Math.max(this.width, total);
      const y = ((lines.length - 1) / 2 - li) * o.size * o.lineHeight;
      let x = -total / 2;
      const lineWords = [];
      for (const it of items) {
        const mat = new THREE.MeshBasicMaterial({ map: it.tex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(it.cw * scale, it.ch * scale), mat);
        mesh.position.set(x + it.adv / 2, y, 0);
        mesh.renderOrder = 10;
        mesh.userData.baseY = y;
        mesh.userData.rise = 0;
        mesh.userData.phase = Math.random() * Math.PI * 2;
        this.add(mesh);
        const word = { mesh, line: li };
        this.words.push(word);
        lineWords.push(word);
        x += it.adv + space;
      }
      this.lines.push(lineWords);
    });
    this.height = lines.length * o.size * o.lineHeight;
  }

  setOpacity(v) {
    for (const w of this.words) w.mesh.material.opacity = v * this.opts.opacity;
  }

  /** Gentle drift. Call every frame from the owning scene. */
  update(t) {
    const amp = this.opts.size * 0.035 * this.opts.float;
    for (const w of this.words) {
      const u = w.mesh.userData;
      w.mesh.position.y = u.baseY + u.rise + Math.sin(t * 0.7 + u.phase) * amp;
    }
  }

  _showWord(scene, w, seconds) {
    const m = w.mesh;
    const drop = this.opts.size * 0.35;
    return scene.tween(
      seconds,
      (k) => {
        m.material.opacity = k * this.opts.opacity;
        m.userData.rise = -drop * (1 - k);
      },
      ease.out,
    );
  }

  /** Reveal one line word by word. `scene` owns the timers (cancelled on exit). */
  async revealLine(scene, index, { perWord = 0.3, fade = 1.0 } = {}) {
    let last = Promise.resolve();
    for (const w of this.lines[index]) {
      last = this._showWord(scene, w, fade);
      await scene.wait(perWord);
    }
    await last;
  }

  async reveal(scene, { perWord = 0.3, fade = 1.0, linePause = 0.5 } = {}) {
    for (let i = 0; i < this.lines.length; i++) {
      await this.revealLine(scene, i, { perWord, fade });
      if (i < this.lines.length - 1) await scene.wait(linePause);
    }
  }

  fadeOut(scene, seconds = 1.5) {
    const from = this.words.map((w) => w.mesh.material.opacity);
    return scene.tween(seconds, (k) => this.words.forEach((w, i) => (w.mesh.material.opacity = from[i] * (1 - k))), ease.inOut);
  }
}
