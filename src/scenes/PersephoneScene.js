import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BaseScene } from '../core/SceneManager.js';
import { Dust } from '../core/props.js';
import { clamp, ease, glowTexture, lerp } from '../core/util.js';
import { softMaterial, paintedTexture, lightShaftMaterial, bindShaft } from '../core/look.js';
import { engravedSky } from '../core/engraved.js';
import { loadArt, cutout, groundShadow } from '../core/collage.js';
import { crunch, leavesWind, birds, rustle, quake } from '../core/ambience.js';
import { thump } from '../core/synth.js';

// A past life — Persephone (Homeric Hymn to Demeter). A garden you can walk in.
//
// Trees answer your hand: they shake, shed petals, sometimes drop a fruit. Pomegranates can be
// picked, held and thrown. Walter Crane's chariot (1877) rises from the ground across the meadow
// and takes her, while you watch. Then the garden dims and the fruit waits: bring one to your
// mouth (or burst one on the ground) and you are her, and the earth lets you down into Hades.
//
// The ground and the far orchard are Crane's own paint.

const EYE = 1.6;
const AREA_RADIUS = 13;
const CENTRE = new THREE.Vector3(0, 0, -5.5); // the tree that matters
const PETALS = 420;
const FLOWERS_EACH = 130;
const RUMBLE = new THREE.Vector3(1.5, 0, -11.5);

const DAWN = { top: '#7fa6c8', horizon: '#f4d9b4', hemi: '#f4efd8', sun: '#ffe9c0', ground: '#ffffff', fog: '#d9d3b8' };
const DUSK = { top: '#1c2238', horizon: '#6a3a44', hemi: '#5a5a78', sun: '#b0533a', ground: '#55506a', fog: '#2c2432' };

const FRUITS = {
  pomegranate: { skin: '#8f1c26', dark: '#4e0e16', blush: '#d0683e', crown: '#8a6230', squash: 0.92 },
  apple: { skin: '#a82a20', dark: '#6a1612', blush: '#d9a044', crown: '#4a3a20', squash: 0.98 },
};

/** A bent trunk, flared at the root, and three limbs going up into the crown. */
function trunkGeometry(seed) {
  const parts = [];
  const add = (h, r0, r1, bend, tilt, y, yaw) => {
    const g = new THREE.CylinderGeometry(r0, r1, h, 9, 6);
    g.translate(0, h / 2, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = p.getY(i);
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const flare = 1 + Math.max(0, 0.35 - v) * 2.2 * (1 + 0.4 * Math.sin(a * 5 + seed));
      p.setX(i, p.getX(i) * flare + Math.sin(v * 1.3 + seed) * bend);
      p.setZ(i, p.getZ(i) * flare + Math.cos(v * 0.9 + seed * 2) * bend * 0.6);
    }
    g.rotateZ(tilt);
    g.rotateY(yaw);
    g.translate(0, y, 0);
    parts.push(g.toNonIndexed());
  };
  add(2.7, 0.055, 0.1, 0.07, 0, 0, seed);
  add(1.3, 0.018, 0.05, 0.05, 0.7, 1.65, seed * 2.1);
  add(1.2, 0.018, 0.05, 0.05, -0.8, 1.85, seed * 2.1);
  add(1.1, 0.016, 0.04, 0.04, 0.6, 2.05, seed * 3.7);
  const merged = mergeGeometries(parts);
  merged.computeVertexNormals();
  return merged;
}

/**
 * A crown of painted clumps that always face you: Botticelli's leaves, laid in the atlas.
 * `position` is each clump's centre; `corner` opens the card in view space.
 */
function crownGeometry(seed, count = 24) {
  const rnd = (() => {
    let a = seed * 9301 + 49297;
    return () => (a = (a * 9301 + 49297) % 233280) / 233280;
  })();
  const pos = [];
  const corner = [];
  const uv = [];
  const shade = [];
  const index = [];
  for (let i = 0; i < count; i++) {
    const th = rnd() * Math.PI * 2;
    const ph = Math.acos(rnd() * 1.5 - 0.5); // mostly the upper part of the ball
    const r = 0.35 + rnd() * 0.85;
    const x = Math.sin(ph) * Math.cos(th) * r * 1.35;
    const y = 2.9 + Math.cos(ph) * r * 0.95;
    const z = Math.sin(ph) * Math.sin(th) * r * 1.35;
    const half = 0.6 + rnd() * 0.32;
    const turn = rnd() * Math.PI * 2;
    const cell = Math.floor(rnd() * 16);
    const u0 = (cell % 4) / 4;
    const v0 = 1 - (Math.floor(cell / 4) + 1) / 4;
    const lit = clamp(0.5 + (y - 2.2) * 0.3 + (x > 0 ? -0.04 : 0.06) + rnd() * 0.1, 0.5, 1.12);
    const base = pos.length / 3;
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(x, y, z);
      corner.push((cx * Math.cos(turn) - cy * Math.sin(turn)) * half, (cx * Math.sin(turn) + cy * Math.cos(turn)) * half);
      uv.push(u0 + ((cx + 1) / 2) * 0.25, v0 + ((cy + 1) / 2) * 0.25);
      shade.push(lit);
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('corner', new THREE.Float32BufferAttribute(corner, 2));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('shade', new THREE.Float32BufferAttribute(shade, 1));
  g.setIndex(index);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2.9, 0), 2.8);
  return g;
}

function crownMaterial(map) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      tint: { value: new THREE.Color('#ffffff') },
      fogColor: { value: new THREE.Color(DAWN.fog) },
      fogNear: { value: 16 },
      fogFar: { value: 44 },
    },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec2 corner;
      attribute float shade;
      varying vec2 vUv;
      varying float vShade;
      varying float vDepth;
      void main() {
        vUv = uv;
        vShade = shade;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float scale = length(modelViewMatrix[0].xyz);
        mv.xy += corner * scale;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 tint;
      uniform vec3 fogColor;
      uniform float fogNear;
      uniform float fogFar;
      varying vec2 vUv;
      varying float vShade;
      varying float vDepth;
      void main() {
        vec4 c = texture2D(map, vUv);
        if (c.a < 0.5) discard;
        vec3 col = c.rgb * vShade * tint;
        col = mix(col, fogColor, smoothstep(fogNear, fogFar, vDepth));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

function fruitGeometry(kind) {
  const f = FRUITS[kind] || FRUITS.pomegranate;
  const skin = new THREE.Color(f.skin);
  const dark = new THREE.Color(f.dark);
  const blush = new THREE.Color(f.blush);
  const crownC = new THREE.Color(f.crown);
  const c = new THREE.Color();
  const body = new THREE.SphereGeometry(0.058, 18, 12);
  body.scale(1, f.squash, 1);
  const p = body.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / 0.058;
    const y = p.getY(i) / 0.058;
    const z = p.getZ(i) / 0.058;
    // dark at the foot, a sunlit blush on one side, and a painter's mottling over all of it
    const mottle = 0.5 + 0.5 * Math.sin(x * 9 + y * 7) * Math.sin(z * 11 - y * 5);
    c.copy(dark).lerp(skin, THREE.MathUtils.smoothstep(y, -1, 0.15));
    c.lerp(blush, THREE.MathUtils.smoothstep(x * 0.7 + y * 0.5, 0.25, 1) * (0.5 + mottle * 0.4));
    c.multiplyScalar(0.9 + mottle * 0.14);
    col.set([c.r, c.g, c.b], i * 3);
  }
  body.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const parts = [body.toNonIndexed()];
  const n = kind === 'apple' ? 1 : 6;
  for (let i = 0; i < n; i++) {
    const cone = new THREE.ConeGeometry(0.01, 0.032, 5);
    const a = (i / n) * Math.PI * 2;
    const r = kind === 'apple' ? 0 : 0.014;
    cone.rotateZ(kind === 'apple' ? 0 : -Math.cos(a) * 0.45);
    cone.rotateX(kind === 'apple' ? 0 : Math.sin(a) * 0.45);
    cone.translate(Math.cos(a) * r, 0.062, Math.sin(a) * r);
    const q = cone.attributes.position.count;
    const cc = new Float32Array(q * 3);
    for (let k = 0; k < q; k++) cc.set([crownC.r, crownC.g, crownC.b], k * 3);
    cone.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    parts.push(cone.toNonIndexed());
  }
  return mergeGeometries(parts);
}

export class PersephoneScene extends BaseScene {
  skipTo = 'hades';

  async enter() {
    const { ctx } = this;
    ctx.rig.position.set(0, EYE, 2);
    ctx.look.reset(0, -0.02);
    ctx.scene.background = new THREE.Color(DAWN.fog);
    ctx.scene.fog = new THREE.Fog(new THREE.Color(DAWN.fog), 16, 44);
    ctx.grain.set({ grain: 0.05, vignette: 0.28, color: '#2a1c14' });
    ctx.haze.set({ amount: 0.06, color: '#ffe8c8', saturate: 1.05, blur: 0 });
    const { audio } = ctx;
    audio.define('leaves', leavesWind);
    audio.define('birds', birds);
    audio.define('rustle', rustle);
    audio.define('crunch', crunch);
    audio.define('quake', quake);
    audio.define('thump', () => thump());

    const [T] = await Promise.all([loadArt('persephone', ['rapture', 'maidens', 'grove-ground', 'orchard', 'grove-crown', 'grove-bark', 'grove-tufts']), audio.preload(['leaves', 'birds', 'rustle', 'crunch', 'quake', 'thump', 'elise'])]);

    this.stage = 'roam';
    this.dusk = 0;
    this.shaken = false;
    this.picked = false;
    this.eaten = false;

    this._buildWorld(T);
    this._buildTrees(T);
    this._buildFruit();
    this._buildFlowers(T);
    this._buildPetals();
    this._buildMyth(T);

    this.hemi = new THREE.HemisphereLight(DAWN.hemi, '#55663a', 1.25);
    this.sun = new THREE.DirectionalLight(DAWN.sun, 1.7);
    this.sun.position.set(-7, 8, -10);
    this.root.add(this.hemi, this.sun);

    this.walkArea = {
      center: [0, -3],
      radius: AREA_RADIUS,
      blockers: this.trees.map((t) => ({ x: t.position.x, z: t.position.z, r: 0.32 * t.scale.x })),
    };
    applyTint(this, 0);
  }

  _buildWorld(T) {
    this.sky = engravedSky({ top: DAWN.top, horizon: DAWN.horizon, cloudLow: '#e8c9b6', cloudLit: '#fff6e4', glory: '#ffe8bc', cover: 0.5, sunDir: new THREE.Vector3(-0.45, 0.18, -0.85).normalize(), sunR: 0.03 });
    this.sky.mesh.raycast = () => {};
    this.add(this.sky.mesh);

    // Crane's own meadow underfoot
    const turf = T['grove-ground'];
    if (turf) {
      turf.wrapS = turf.wrapT = THREE.MirroredRepeatWrapping;
      turf.repeat.set(46, 62);
      turf.anisotropy = 8;
    }
    this.groundMat = new THREE.MeshLambertMaterial({ map: turf || null, color: '#ffffff' });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.rotation.z = 0.5; // no row lines up with where you first look
    ground.raycast = () => {};
    this.add(ground);

    // Crane's orchard all around, soft against the sky
    if (T.orchard) {
      T.orchard.wrapS = THREE.MirroredRepeatWrapping;
      T.orchard.repeat.set(10, 1);
      const fade = paintedTexture(4, 64, (c, w, h) => {
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#000');
        g.addColorStop(0.35, '#fff');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
      });
      fade.colorSpace = THREE.NoColorSpace;
      this.bandMat = new THREE.MeshBasicMaterial({ map: T.orchard, alphaMap: fade, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(38, 38, 8.4, 64, 1, true), this.bandMat);
      band.position.y = 3.2;
      band.renderOrder = -1;
      band.raycast = () => {};
      this.add(band);
    }

    // light through the leaves
    this.shafts = [];
    for (const [x, z, rot] of [[-5, -7, 0.32], [-1.5, -9, 0.3], [3.5, -8, 0.26]]) {
      const geo = new THREE.PlaneGeometry(2.2, 12);
      geo.translate(0, -6, 0);
      const m = bindShaft(new THREE.Mesh(geo, lightShaftMaterial('#fff0c8', 0.16)));
      m.position.set(x, 11, z);
      m.rotation.z = rot;
      this.add(m);
      this.shafts.push(m);
    }
    this.pollen = this.add(new Dust({ count: 300, radius: 11, inner: 1, color: '#fff2c4', size: 0.035, opacity: 0.55, speed: 0.008 }));
    this.pollen.position.set(0, 1.8, -3);
  }

  _buildTrees(T) {
    const bark = T['grove-bark'];
    if (bark) {
      bark.wrapS = bark.wrapT = THREE.MirroredRepeatWrapping;
      bark.repeat.set(2, 1.5);
    }
    const barks = new THREE.MeshLambertMaterial({ map: bark || null, color: bark ? '#ffffff' : '#3a2a1e' });
    const leaves = crownMaterial(T['grove-crown']);
    this.barkMat = barks;
    this.leafMat = leaves;
    const trunks = [trunkGeometry(1), trunkGeometry(2.4), trunkGeometry(3.7)];
    const crowns = [crownGeometry(1), crownGeometry(2), crownGeometry(3)];

    const spots = [[CENTRE.x, CENTRE.z, 1.3]];
    // two loose rings, leaving the way from where you start to the centre open
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      if (Math.abs(a - Math.PI / 2) < 0.4) continue;
      spots.push([Math.cos(a) * 4.8 + CENTRE.x, Math.sin(a) * 4.2 + CENTRE.z, 0.95 + (i % 3) * 0.1]);
    }
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      if (Math.abs(a - Math.PI / 2) < 0.35) continue;
      spots.push([Math.cos(a) * 10.5 + CENTRE.x, Math.sin(a) * 9 + CENTRE.z + 1, 1.05 + (i % 4) * 0.12]);
    }

    this.trees = spots.map(([x, z, s], i) => {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(trunks[i % 3], barks);
      const crown = new THREE.Mesh(crowns[i % 3], leaves);
      trunk.raycast = crown.raycast = () => {};
      g.add(trunk, crown);
      g.position.set(x, 0, z);
      g.scale.setScalar(s);
      g.rotation.y = i * 1.3;
      g.userData = { shake: 0, phase: i * 1.7, fruits: [] };
      this.add(g);
      // what a hand or a pointer touches: the trunk and the top of the crown, leaving the fruit clear
      const hit = new THREE.Group();
      const hidden = new THREE.MeshBasicMaterial({ visible: false });
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * s, 0.28 * s, 2.6 * s, 8), hidden);
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.95 * s, 10, 8), hidden);
      top.position.y = 1.65 * s;
      hit.add(stem, top);
      hit.position.set(x, 1.5 * s, z);
      this.add(hit);
      this.ctx.interact.addTouch(hit, { radius: 0.8 * s, cooldown: 0.7, tip: 'shake', onTouch: () => this._shake(g) });
      return g;
    });

    // sound lives in the trees
    this.soundTrees = [this.trees[1], this.trees[5], this.trees[9]];
  }

  _buildFruit() {
    const kind = this.ctx.content.PERSEPHONE.fruit;
    const geo = fruitGeometry(kind);
    const mat = softMaterial({ color: '#ffffff', vertexColors: true, rim: '#ffd8b8', rimStrength: 0.25, hatch: 0, umber: '#3a0c10' });
    this.fruits = [];
    const hang = (tree, n) => {
      const s = tree.scale.x;
      const twigs = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + tree.userData.phase;
        const r = (0.62 + (i % 2) * 0.3) * s;
        const y = 1.55 + (i % 3) * 0.2;
        const m = new THREE.Mesh(geo, mat);
        m.position.set(tree.position.x + Math.cos(a) * r, y, tree.position.z + Math.sin(a) * r);
        m.userData = { rest: m.position.clone(), tree, free: false };
        twigs.push(this._twig(tree, m.position));
        this.add(m);
        tree.userData.fruits.push(m);
        this.fruits.push(m);
        this.ctx.interact.addGrabbable(m, {
          radius: 0.056,
          reach: 0.1,
          bounce: 0.4,
          friction: 1.4,
          onGrab: () => {
            m.userData.free = true;
            this.picked = true;
          },
          onHit: (speed, obj) => this._fruitHit(speed, obj),
        });
      }
      const mesh = new THREE.Mesh(mergeGeometries(twigs), this.barkMat);
      mesh.raycast = () => {};
      tree.add(mesh);
    };
    hang(this.trees[0], 7);
    for (let i = 1; i < 7; i++) hang(this.trees[i], 3);

    // the glow that marks the fruit, when the time comes
    this.glows = this.trees[0].userData.fruits.map((f) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffcf8a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      s.position.copy(f.position);
      s.scale.setScalar(0.42);
      s.raycast = () => {};
      this.add(s);
      return s;
    });
  }

  /** A thin bough from up in the crown down to where a fruit hangs, in the tree's own space. */
  _twig(tree, world) {
    tree.updateMatrixWorld(true);
    const end = tree.worldToLocal(world.clone().add(new THREE.Vector3(0, 0.06, 0)));
    const start = new THREE.Vector3(end.x * 0.7, 2.3, end.z * 0.7);
    const curve = new THREE.QuadraticBezierCurve3(start, new THREE.Vector3(end.x * 0.95, end.y + 0.55, end.z * 0.95), end);
    return new THREE.TubeGeometry(curve, 6, 0.011, 5, false);
  }

  _buildFlowers(T) {
    // The narcissus she reached for: tufts cut from Crane's own bank of them.
    const atlas = T['grove-tufts'];
    if (!atlas) return;
    atlas.anisotropy = 4;
    const dummy = new THREE.Object3D();
    this.flowerMat = new THREE.MeshBasicMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide });
    for (let cell = 0; cell < 4; cell++) {
      const quad = () => {
        const g = new THREE.PlaneGeometry(0.46, 0.46).translate(0, 0.21, 0);
        const uv = g.attributes.uv;
        const u0 = (cell % 2) / 2;
        const v0 = 1 - (Math.floor(cell / 2) + 1) / 2;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) / 2, v0 + uv.getY(i) / 2);
        return g;
      };
      const cross = mergeGeometries([quad(), quad().rotateY(Math.PI / 2)]);
      const inst = new THREE.InstancedMesh(cross, this.flowerMat, FLOWERS_EACH);
      for (let i = 0; i < FLOWERS_EACH; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * AREA_RADIUS * 1.35;
        dummy.position.set(Math.cos(a) * r, 0, Math.sin(a) * r - 3);
        dummy.rotation.y = Math.random() * Math.PI;
        dummy.scale.setScalar(0.75 + Math.random() * 0.7);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      inst.raycast = () => {};
      this.add(inst);
    }
  }

  _buildPetals() {
    const pos = new Float32Array(PETALS * 3);
    const col = new Float32Array(PETALS * 3);
    pos.fill(-50);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.petals = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTexture(), size: 0.055, vertexColors: true, transparent: true, alphaTest: 0.25, depthWrite: false, fog: false }));
    this.petals.frustumCulled = false;
    this.petals.raycast = () => {};
    this.add(this.petals);
    this.petalVel = new Float32Array(PETALS * 3);
    this.petalNext = 0;
  }

  /** Throw some bits into the air: petals from a tree, juice from a burst fruit. */
  _spray(x, y, z, count, colour, spread, up) {
    const p = this.petals.geometry.attributes.position.array;
    const c = this.petals.geometry.attributes.color.array;
    const v = this.petalVel;
    const col = new THREE.Color(colour);
    for (let n = 0; n < count; n++) {
      const i = this.petalNext++ % PETALS;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      p.set([x + Math.cos(a) * r, y + Math.random() * spread * 0.5, z + Math.sin(a) * r], i * 3);
      c.set([col.r, col.g, col.b], i * 3);
      v.set([Math.cos(a) * 0.3, up * Math.random(), Math.sin(a) * 0.3], i * 3);
    }
    this.petals.geometry.attributes.color.needsUpdate = true;
  }

  _shake(tree) {
    const u = tree.userData;
    u.shake = 1;
    this.shaken = true;
    this._spray(tree.position.x, 2.7 * tree.scale.x, tree.position.z, 34, Math.random() < 0.5 ? '#f6d7dd' : '#e78fa0', 1.3 * tree.scale.x, 0.25);
    this.sound('rustle', { parent: tree, volume: 0.7, refDistance: 3 });
    // sometimes a fruit lets go
    const loose = u.fruits.find((f) => this.ctx.interact.bodies.get(f)?.asleep && f.position.y > 0.3);
    if (loose && Math.random() < 0.45) this.ctx.interact.bodies.get(loose).asleep = false;
  }

  _fruitHit(speed, obj) {
    this.sound('thump', { parent: obj, volume: Math.min(0.7, speed * 0.14), refDistance: 2 });
    if (speed > 3.2) {
      this._spray(obj.position.x, obj.position.y + 0.05, obj.position.z, 26, '#a81f2c', 0.12, 1.4);
      this.sound('crunch', { parent: obj, volume: 0.7, refDistance: 2 });
      if (this.stage === 'taste') this._eat(obj); // burst on the ground: it counts
    }
  }

  _buildMyth(T) {
    // the maidens at play, across the meadow
    if (T.maidens) {
      this.maidens = new THREE.Group();
      this.maidensFig = cutout(T.maidens, 1.85);
      this.maidens.add(this.maidensFig, groundShadow(2.4));
      this.maidens.position.set(-5.4, 0, -11);
      this.maidens.lookAt(0, 0, 2);
      this.add(this.maidens);
    }
    // the chariot, waiting under the ground
    if (T.rapture) {
      this.rapture = cutout(T.rapture, 3.3);
      this.rapture.material.depthWrite = true;
      this.rapture.position.copy(RUMBLE).setY(-3.6);
      this.rapture.visible = false;
      this.add(this.rapture);
    }
    this.crack = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#000000', transparent: true, opacity: 0, depthWrite: false, fog: false }),
    );
    this.crack.rotation.x = -Math.PI / 2;
    this.crack.position.copy(RUMBLE).setY(0.03);
    this.crack.scale.set(4.4, 2.1, 1);
    this.crack.raycast = () => {};
    this.add(this.crack);

    // where you go down, at the end
    this.pit = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#000000', transparent: true, opacity: 0, depthWrite: false, fog: false }),
    );
    this.pit.rotation.x = -Math.PI / 2;
    this.pit.position.y = 0.04;
    this.pit.scale.setScalar(0.01);
    this.pit.raycast = () => {};
    this.add(this.pit);
  }

  /** In front of you, wherever you have wandered, in the clearest gap among the trees. */
  _placeRapture() {
    const cam = this.ctx.camera;
    const head = cam.getWorldPosition(new THREE.Vector3());
    const fwd = cam.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    const yaw = Math.atan2(fwd.x, fwd.z);
    let best = null;
    for (const dy of [0, 0.3, -0.3, 0.6, -0.6]) {
      for (const d of [6.5, 5.5, 7.5]) {
        const x = head.x + Math.sin(yaw + dy) * d;
        const z = head.z + Math.cos(yaw + dy) * d;
        let score = 99;
        for (const t of this.trees) {
          // how far is each trunk from the line between you and the chariot?
          const k = clamp(((t.position.x - head.x) * (x - head.x) + (t.position.z - head.z) * (z - head.z)) / (d * d), 0, 1);
          score = Math.min(score, Math.hypot(t.position.x - head.x - (x - head.x) * k, t.position.z - head.z - (z - head.z) * k));
        }
        score -= Math.abs(dy) * 0.6;
        if (!best || score > best.score) best = { x, z, score };
      }
    }
    this.crack.position.set(best.x, 0.03, best.z);
    if (this.rapture) {
      this.rapture.position.set(best.x, -3.6, best.z);
      this.rapture.lookAt(head.x, -3.6, head.z);
      this.crack.rotation.z = -Math.atan2(head.x - best.x, head.z - best.z);
    }
  }

  /** The earth opens across the meadow, and she is gone. You only watch. */
  async _rapture() {
    const { M } = this;
    this._placeRapture();
    this.sound('quake', { parent: this.crack, volume: 1, refDistance: 8 });
    this.crack.scale.set(5, 1.7, 1);
    await this.tween(1.2, (k) => (this.crack.material.opacity = 0.92 * k));
    if (this.rapture) {
      this.rapture.visible = true;
      const y = this.rapture.position.y;
      this.tween(2.2, (k) => this.rapture.position.setY(lerp(y, 0, k)), ease.out);
    }
    if (this.maidens) {
      const p = this.maidens.position.clone();
      this.tween(5, (k) => {
        this.maidens.position.set(p.x - 3.5 * k, 0, p.z - 1.5 * k);
        this.maidensFig.material.opacity = 1 - k * k;
      });
    }
    await this.say(M.opens, { hold: 1 });
    await this.wait(1.2);
    if (this.rapture) await this.tween(2.4, (k) => this.rapture.position.setY(lerp(0, -3.6, k)), ease.in);
    this.tween(2.5, (k) => (this.crack.material.opacity = 0.92 * (1 - k)));
    if (this.rapture) this.rapture.visible = false;
  }

  async start() {
    const { ctx } = this;
    const P = ctx.content.PERSEPHONE;
    this.M = ctx.content.MYTHS.persephone;
    ctx.audio.playMusic('elise', { volume: 0.22, fade: 5 });
    this.sound('leaves', { parent: this.soundTrees[0], loop: true, volume: 0.9, refDistance: 5 });
    this.sound('leaves', { parent: this.soundTrees[1], loop: true, volume: 0.8, rate: 0.85, refDistance: 5 });
    this.sound('birds', { parent: this.soundTrees[2], loop: true, volume: 0.8, refDistance: 7 });

    await this.wait(1.5);
    await this.say(P.enter, { hold: 0.8 });
    await this.say(this.M.flowers, { hold: 1 });

    this.say(P.hintTree, { narrate: false, hold: 4 });
    await this.until(() => this.shaken, 20);
    this.say(P.hintFruit, { narrate: false, hold: 5 });
    await this.until(() => this.picked, 30);
    await this.wait(14); // a little while with the fruit, unhurried

    // What happens to her. You watch.
    await this._rapture();
    ctx.audio.fadeMusic(0.1, 6);
    this.tween(8, (k) => (this.dusk = k));
    await this.say(P.taken, { hold: 1 });

    // And then it is your turn.
    this.stage = 'taste';
    ctx.interact.setHeldAction(P.tasteButton, (obj) => this._eat(obj));
    for (const g of this.glows) this.tween(2, (k) => (g.material.opacity = 0.75 * k));
    await this.say(this.M.seed, { hold: 0.6 });
    this.say(P.taste, { narrate: false, hold: 6 });
    await this.until(() => this.eaten, 75);
    if (!this.eaten) this._eat(null); // no one stays in this garden for ever
  }

  async _eat(obj) {
    if (this.eaten) return;
    this.eaten = true;
    this.stage = 'gone';
    const { ctx } = this;
    const P = ctx.content.PERSEPHONE;
    ctx.interact.setHeldAction(null);
    this.sound('crunch', { volume: 0.9 });
    if (obj) {
      const pos = obj.getWorldPosition(new THREE.Vector3());
      this._spray(pos.x, pos.y, pos.z, 24, '#a81f2c', 0.08, 0.9);
      ctx.interact.remove(obj);
      this.drop(obj);
    }
    for (const h of ctx.interact.hands) if (h.state.source) h.state.source.gamepad?.hapticActuators?.[0]?.pulse?.(1, 220);
    ctx.haze.set({ color: '#7a1020' });
    this.tween(0.5, (k) => ctx.haze.set({ amount: 0.06 + 0.5 * k }), ease.out).then(() => this.tween(2.5, (k) => ctx.haze.set({ amount: 0.56 * (1 - k) })));
    ctx.audio.stopMusic(4);
    await this.say(P.you, { hold: 0.5 });

    // The ground lets go, right where you stand.
    this.sound('quake', { volume: 0.9 });
    const head = ctx.camera.getWorldPosition(new THREE.Vector3());
    this.pit.position.set(head.x, 0.04, head.z);
    await this.tween(3, (k) => {
      this.pit.material.opacity = 0.95 * Math.min(1, k * 2);
      this.pit.scale.setScalar(lerp(0.1, 9, k * k));
    }, ease.in);
    this.next('hades', {}, { color: '#000000', out: 1.6, in: 1.5 });
  }

  update(dt, t) {
    super.update(dt, t);
    this.sky.u.time.value = t;
    applyTint(this, this.dusk);

    for (const tree of this.trees) {
      const u = tree.userData;
      u.shake = Math.max(0, u.shake - dt * 1.3);
      const wind = 0.008 + 0.006 * Math.sin(t * 0.5 + u.phase);
      tree.rotation.z = Math.sin(t * 1.1 + u.phase) * wind + Math.sin(t * 11) * 0.055 * u.shake;
      tree.rotation.x = Math.cos(t * 0.9 + u.phase) * wind + Math.cos(t * 13) * 0.045 * u.shake;
    }

    // a fruit on the bough moves with the bough
    for (const f of this.fruits) {
      const u = f.userData;
      if (u.free || !f.parent) continue;
      const body = this.ctx.interact.bodies.get(f);
      if (!body?.asleep) {
        u.free = true;
        continue;
      }
      const tree = u.tree;
      f.position.set(u.rest.x - tree.rotation.z * u.rest.y, u.rest.y, u.rest.z + tree.rotation.x * u.rest.y);
    }

    // petals and juice: drift and fall
    const p = this.petals.geometry.attributes.position.array;
    const v = this.petalVel;
    for (let i = 0; i < PETALS; i++) {
      const j = i * 3;
      if (p[j + 1] < 0.01) continue;
      v[j + 1] = Math.max(-0.55, v[j + 1] - dt * 0.8);
      p[j] += (v[j] + Math.sin(t * 2 + i) * 0.22) * dt;
      p[j + 1] += v[j + 1] * dt;
      p[j + 2] += (v[j + 2] + Math.cos(t * 1.7 + i) * 0.22) * dt;
    }
    this.petals.geometry.attributes.position.needsUpdate = true;

    if (this.stage === 'taste') {
      // the fruit at your mouth
      const head = this.ctx.camera.getWorldPosition(_head);
      const held = this.ctx.interact.heldNear(head, 0.2);
      if (held) this._eat(held);
      for (let i = 0; i < this.glows.length; i++) {
        const f = this.trees[0].userData.fruits[i];
        if (f.parent) this.glows[i].position.copy(f.position);
        else this.glows[i].visible = false;
        this.glows[i].material.opacity = clamp(this.glows[i].material.opacity, 0, 0.8) * (0.9 + Math.sin(t * 2.4 + i) * 0.1);
      }
    }
  }
}

const _head = new THREE.Vector3();
const _a = new THREE.Color();
const _b = new THREE.Color();

/** Everything that changes from morning to the dark that comes after her. */
function applyTint(s, k) {
  if (s._tint === k) return;
  s._tint = k;
  const mix = (key, out) => out.copy(_a.set(DAWN[key])).lerp(_b.set(DUSK[key]), k);
  mix('top', s.sky.u.top.value);
  mix('horizon', s.sky.u.horizon.value);
  if (s.hemi) {
    mix('hemi', s.hemi.color);
    s.hemi.intensity = lerp(1.25, 0.6, k);
    mix('sun', s.sun.color);
    s.sun.intensity = lerp(1.7, 0.5, k);
  }
  s.groundMat.color.setScalar(1).lerp(_b.set('#9a93a8'), k);
  s.leafMat.uniforms.tint.value.setScalar(1).lerp(_b.set('#6c6880'), k);
  mix('fog', s.leafMat.uniforms.fogColor.value);
  mix('ground', s.barkMat.color);
  if (s.flowerMat) s.flowerMat.color.setScalar(1).lerp(_b.set('#4a4760'), k);
  if (s.bandMat) mix('ground', s.bandMat.color);
  const fog = s.ctx.scene.fog;
  if (fog) {
    mix('fog', fog.color);
    s.ctx.scene.background.copy(fog.color);
  }
  for (const m of s.shafts) m.material.opacity = 0.16 * (1 - k);
}
