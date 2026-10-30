import * as THREE from 'three';
import { BaseScene } from '../core/SceneManager.js';
import { Dust, Orb } from '../core/props.js';
import { ease, lerp } from '../core/util.js';
import { softMaterial, inkOutlineAll } from '../core/look.js';
import { engravedSky } from '../core/engraved.js';
import { loadArt, cutout, groundShadow, cartouche, ScrollWriter } from '../core/collage.js';

// Scene 0 — the Sphinx (Apollodorus, Library III). The threshold, and the onboarding.
//
// You stand in Gustave Moreau's gorge at dusk ("Oedipus and the Sphinx", 1864): the
// painting itself, its figures lifted out, wraps all around you; on the ledge before you
// the Sphinx clings to Oedipus beside the white-and-blue column and its urn.
// She teaches you to look and to choose: find a light, hold your gaze on it. Then she asks
// you her riddle. Its answer — a human being, on four feet, then two, then three — is the
// life you are about to live. She throws herself from the rock, and you are born.
//
// Comfort: the rig never moves.

const EYE = 1.6;
const LEDGE = new THREE.Vector3(0, 0.6, -3.7); // top of the rock the pair stands on
const DUSK = new THREE.Color('#4f5d5a');

export class SphinxScene extends BaseScene {
  skipTo = 'prologue';

  async enter() {
    const { ctx } = this;
    ctx.rig.position.set(0, EYE, 0);
    ctx.look.reset(0, -0.02);
    ctx.scene.background = DUSK.clone();
    const EARTH = new THREE.Color('#2a2620');
    ctx.scene.fog = new THREE.Fog(EARTH, 6, 24); // the floor melts into the dark foot of the painting
    ctx.grain.set({ grain: 0.06, vignette: 0.45, color: '#0d1210' });
    ctx.haze.set({ amount: 0.1, color: '#2a3634', saturate: 0.95, blur: 0 });

    const [T] = await Promise.all([loadArt('sphinx', ['sphinx', 'gorge', 'rock', 'figtree']), ctx.audio.preload(['moonlight'])]);
    this.art = T;

    // ---------- Moreau's sky, all around ----------
    const sky = engravedSky({ top: '#1e2d33', horizon: '#7f8a84', cloudLow: '#36474a', cloudLit: '#9aaba4', glory: '#c9b9a0', cover: 0.75, sunDir: new THREE.Vector3(-0.6, 0.12, -0.4).normalize(), sunR: 0.0 });
    sky.mesh.raycast = () => {};
    this.add(sky.mesh);
    this.sky = sky;
    // ---------- Moreau's gorge, all around ----------
    // The painting with its figures lifted out (the gap filled with its own sky and rock),
    // mirrored round you six times; its ledge line sits at your feet.
    if (T.gorge) {
      T.gorge.wrapS = THREE.MirroredRepeatWrapping;
      T.gorge.repeat.set(6, 1);
      const R = 30;
      const h = ((2 * Math.PI * R) / 6) * (T.gorge.image.height / T.gorge.image.width);
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(R, R, h, 120, 1, true),
        new THREE.MeshBasicMaterial({ map: T.gorge, side: THREE.BackSide, fog: false, color: '#e6e2da' }),
      );
      band.position.y = h / 2 - h * 0.19 + EYE; // the painted horizon of the gorge (19% up) at eye level
      band.rotation.y = Math.PI / 2; // a copy's centre straight ahead (an odd, mirrored copy: seen from inside it reads the right way round)
      band.renderOrder = -1;
      band.raycast = () => {};
      this.add(band);
    }

    let rockMat;
    if (T.rock) {
      T.rock.wrapS = T.rock.wrapT = THREE.MirroredRepeatWrapping;
      T.rock.repeat.set(3, 1);
      rockMat = softMaterial({ map: T.rock, color: '#c9b394', rim: '#bcd2cc', rimStrength: 0.1, hatch: 0, umber: '#1e140c' });
    } else {
      rockMat = softMaterial({ color: '#6a5c48', rim: '#cfe0da', rimStrength: 0.1, hatch: 0, umber: '#2a1e14' });
    }

    // ground and the ledge
    const groundMat = T.rock
      ? softMaterial({ map: T.rock.clone(), color: '#4e3e2c', rim: '#cfe0da', rimStrength: 0.04, hatch: 0, umber: '#1a120a' })
      : softMaterial({ color: '#4a3c2c', hatch: 0 });
    if (groundMat.map) {
      groundMat.map.wrapS = groundMat.map.wrapT = THREE.MirroredRepeatWrapping;
      groundMat.map.repeat.set(30, 30);
      groundMat.map.needsUpdate = true;
    }
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.raycast = () => {};
    this.add(ground);

    // the ledge: a squared block of rock with a broken face, as in the painting
    const ledgeGeo = new THREE.BoxGeometry(2.6, LEDGE.y, 1.7, 10, 4, 8);
    ledgeGeo.translate(0, LEDGE.y / 2, 0);
    const lp = ledgeGeo.attributes.position;
    for (let i = 0; i < lp.count; i++) {
      const x = lp.getX(i);
      const y = lp.getY(i);
      const z = lp.getZ(i);
      if (y < LEDGE.y - 0.01) {
        const n = Math.sin(x * 7.1) * Math.cos(z * 5.3) + Math.sin(y * 13 + x * 3);
        lp.setXYZ(i, x * (1 + 0.04 * n), y, z * (1 + 0.05 * n));
      } else lp.setY(i, y + 0.03 * Math.sin(x * 4 + z * 6)); // a worn top
    }
    ledgeGeo.computeVertexNormals();
    const ledge = new THREE.Mesh(ledgeGeo, rockMat);
    ledge.position.set(LEDGE.x, 0, LEDGE.z);
    ledge.raycast = () => {};
    this.add(ledge);
    inkOutlineAll(ledge, 0.01);

    // the white-and-blue column and its urn, beside them
    const col = new THREE.Group();
    const white = softMaterial({ color: '#e9e3d4', rim: '#ffffff', rimStrength: 0.3, hatch: 0 });
    const blue = softMaterial({ color: '#5e9fbf', rim: '#d8f0ff', rimStrength: 0.3, hatch: 0 });
    const gold = softMaterial({ color: '#c49a48', rim: '#ffe2a0', rimStrength: 0.5, hatch: 0, umber: '#5a3a14' });
    const silver = softMaterial({ color: '#a9aaa2', rim: '#ffffff', rimStrength: 0.45, hatch: 0, umber: '#3a3a38' });
    const add = (geo, mat, y) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.y = y;
      m.raycast = () => {};
      col.add(m);
      return m;
    };
    add(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 24), gold, 0.06);
    add(new THREE.CylinderGeometry(0.11, 0.12, 1.5, 24), white, 0.87);
    add(new THREE.CylinderGeometry(0.11, 0.11, 0.42, 24), blue, 1.83);
    add(new THREE.CylinderGeometry(0.17, 0.12, 0.1, 24), gold, 2.09);
    add(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 24), gold, 2.165);
    const urnProfile = [[0, 0], [0.07, 0], [0.05, 0.05], [0.09, 0.1], [0.17, 0.2], [0.19, 0.3], [0.15, 0.4], [0.11, 0.45], [0.14, 0.5], [0, 0.5]];
    const urn = add(new THREE.LatheGeometry(urnProfile.map(([r, y]) => new THREE.Vector2(r, y)), 24), silver, 2.19);
    for (const s of [-1, 1]) {
      // its handles
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 8, 16, Math.PI), silver);
      h.position.set(s * 0.18, 0.36, 0);
      h.rotation.z = s * Math.PI / 2;
      urn.add(h);
    }
    col.position.set(1.65, 0, -3.9);
    inkOutlineAll(col, 0.006);
    this.add(col);

    // Moreau's fig tree at the edge of the ledge
    if (T.figtree) {
      const fig = cutout(T.figtree, 1.5);
      fig.position.set(-1.75, 0, -3.3);
      fig.lookAt(0, 0.75, 0);
      this.add(fig);
    }

    // ---------- the Sphinx and Oedipus ----------
    this.pair = new THREE.Group();
    if (T.sphinx) {
      this.pairFig = cutout(T.sphinx, 2.6);
      this.pairFig.position.x = -0.1;
      this.pair.add(this.pairFig);
    }
    this.pair.add(groundShadow(1.3));
    this.pair.position.copy(LEDGE);
    this.add(this.pair);

    this.hemi = new THREE.HemisphereLight('#93a7a2', '#2e2218', 0.85);
    this.sun = new THREE.DirectionalLight('#ffe2b8', 1.6);
    this.sun.position.set(-8, 10, 4); // Moreau lights his figures from the left
    this.root.add(this.hemi, this.sun);
    this.add(new Dust({ count: 260, radius: 6, opacity: 0.25, color: '#e8e2cf', size: 0.025, speed: 0.008 }));

    this.scroll = this.add(cartouche(2.1, 0.95));
    this.scroll.position.set(-1.6, 2.45, -3.1);
    this.scroll.lookAt(0, EYE, 0);
    this.writer = new ScrollWriter(this, this.scroll);
  }

  /** A light to find and choose. Returns the orb; `opts` go to input.add. */
  light(pos, label = '') {
    const orb = new Orb({ label, color: '#ffe9c2', radius: 0.06, labelSize: 0.085 });
    orb.position.copy(pos);
    orb.scale.setScalar(0.01);
    this.add(orb);
    this.tween(1.2, (k) => orb.scale.setScalar(Math.max(0.01, k)), ease.out);
    return orb;
  }

  async start() {
    const { ctx } = this;
    const { input, audio } = ctx;
    const S = ctx.content.SPHINX;
    const M = ctx.content.MYTHS.sphinx;
    audio.playMusic('moonlight', { volume: 0.3, fade: 4 });
    await this.wait(1.5);
    await this.writer.say(S.open, { hold: 1.5 });

    // ---- learn to look: a light off to your right ----
    const first = this.light(new THREE.Vector3(2.4, EYE + 0.1, -1.2));
    let found = false;
    let chosen = false;
    input.add(first, {
      onHover: (on) => {
        first.setHover(on);
        if (on) found = true;
      },
      onSelect: () => (chosen = true),
    });
    this.say(S.look, { hold: 3 });
    this.writer.say(S.find, { hold: 1 });
    await this.until(() => found || chosen, 20);

    // ---- learn to choose: hold your gaze, or click / tap / trigger ----
    this.say(S.choose, { hold: 3 });
    await this.until(() => chosen, 20);
    input.remove(first);
    const p0 = first.position.clone();
    const to = LEDGE.clone().add(new THREE.Vector3(-0.2, 2.0, 0.2));
    await this.tween(1.6, (k) => {
      first.position.lerpVectors(p0, to, k);
      first.scale.setScalar(1 - k * 0.9);
    }, ease.inOut);
    this.drop(first);

    // ---- the riddle ----
    await this.writer.say(S.ask, { hold: 1 });
    await this.writer.say(M.riddle, { source: M.source, hold: 2 });

    let answered = false;
    const orbs = S.options.map((label, i) => {
      const orb = this.light(new THREE.Vector3((i - 1) * 1.15, EYE - 0.62 + (i === 1 ? 0 : 0.06), -2.3), label); // low, clear of the figures
      input.add(orb, {
        onHover: (on) => orb.setHover(on),
        onSelect: () => {
          if (answered || !orb.visible) return;
          if (i === S.right) {
            answered = true;
            return;
          }
          // a wrong answer: the light goes out, and she waits
          input.remove(orb);
          this.tween(0.8, (k) => orb.scale.setScalar(Math.max(0.01, 1 - k))).then(() => (orb.visible = false));
          this.say(S.wrong, { hold: 1.2 });
        },
        dwell: 2,
      });
      return orb;
    });
    this.say(S.answerHint, { hold: 2 });
    await this.until(() => answered);
    input.clear();
    const right = orbs[S.right];
    orbs.forEach((o, i) => {
      if (i === S.right || !o.visible) return;
      const s0 = o.scale.x;
      this.tween(0.8, (k) => o.scale.setScalar(Math.max(0.01, s0 * (1 - k))));
    });
    this.tween(1.5, (k) => right.scale.setScalar(1 + k * 1.2), ease.out);
    await this.writer.say(M.answer, { source: M.source, hold: 2 });

    // ---- she throws herself from the rock; the light of a first morning ----
    const fig = this.pairFig;
    this.writer.say(M.fall, { source: M.source, hold: 1.5 });
    await this.tween(
      4,
      (k) => {
        if (fig) fig.material.opacity = 1 - k;
        right.scale.setScalar(2.2 + k * 3);
        this.ctx.haze.set({ amount: lerp(0.1, 0.9, k), color: '#fff6e6' });
      },
      ease.in,
    );
    this.next('prologue', {}, { color: '#ffffff', out: 2, in: 2 });
  }

  onSelectNothing() {}

  update(dt, t) {
    super.update(dt, t);
    this.sky.u.time.value = t;
    // the paper figures breathe a little, as in every scene
    if (this.pairFig) this.pairFig.rotation.z = Math.sin(t * 0.8) * 0.006;
  }
}
