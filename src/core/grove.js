import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp } from './util.js';
import { paintedTexture } from './look.js';

// Trees made of painting: a slim bent trunk, and a crown of painted clumps that always face you.
// The clumps come from an atlas of a painter's own leaves (Botticelli's orange grove, Corot's mist).

/** A bent trunk, flared at the root, and three limbs going up into the crown. */
export function trunkGeometry(seed) {
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
 * `position` is each clump's centre; `corner` opens the card in view space, so it faces you.
 * `cols` is the size of the square atlas, in cells.
 */
export function crownGeometry(seed, { count = 24, cols = 4, cy = 2.9, spread = 1.35, height = 0.95, size = 0.6 } = {}) {
  const rnd = (() => {
    let a = seed * 9301 + 49297;
    return () => (a = (a * 9301 + 49297) % 233280) / 233280;
  })();
  const pos = [];
  const corner = [];
  const uv = [];
  const shade = [];
  const index = [];
  const cw = 1 / cols;
  for (let i = 0; i < count; i++) {
    const th = rnd() * Math.PI * 2;
    const ph = Math.acos(rnd() * 1.5 - 0.5); // mostly the upper part of the ball
    const r = 0.35 + rnd() * 0.85;
    const x = Math.sin(ph) * Math.cos(th) * r * spread;
    const y = cy + Math.cos(ph) * r * height;
    const z = Math.sin(ph) * Math.sin(th) * r * spread;
    const half = size + rnd() * size * 0.53;
    const turn = rnd() * Math.PI * 2;
    const cell = Math.floor(rnd() * cols * cols);
    const u0 = (cell % cols) * cw;
    const v0 = 1 - (Math.floor(cell / cols) + 1) * cw;
    const lit = clamp(0.5 + (y - cy + 0.7) * 0.3 + (x > 0 ? -0.04 : 0.06) + rnd() * 0.1, 0.5, 1.12);
    const base = pos.length / 3;
    for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(x, y, z);
      corner.push((cx * Math.cos(turn) - cz * Math.sin(turn)) * half, (cx * Math.sin(turn) + cz * Math.cos(turn)) * half);
      uv.push(u0 + ((cx + 1) / 2) * cw, v0 + ((cz + 1) / 2) * cw);
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
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, cy, 0), (spread + size * 1.6) * 1.5);
  return g;
}

export function crownMaterial(map, { fogColor = '#ffffff', fogNear = 16, fogFar = 44 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      tint: { value: new THREE.Color('#ffffff') },
      fogColor: { value: new THREE.Color(fogColor) },
      fogNear: { value: fogNear },
      fogFar: { value: fogFar },
      time: { value: 0 },
      sway: { value: 0 },
    },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec2 corner;
      attribute float shade;
      attribute float phase;
      uniform float time;
      uniform float sway;
      varying vec2 vUv;
      varying float vShade;
      varying float vDepth;
      void main() {
        vUv = uv;
        vShade = shade;
        vec3 p = position;
        p.x += sin(time * 0.8 + phase) * sway * p.y;
        p.z += cos(time * 0.6 + phase) * sway * p.y * 0.7;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
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

/**
 * Many trees as two draw calls. spots: [{ x, z, scale, yaw }]. Each crown carries its own `phase`,
 * so the wind (crownMaterial's `sway`) moves them separately.
 */
export function plantGrove(spots, trunkMat, crownMat, crownOpts) {
  const trunks = [trunkGeometry(1.3), trunkGeometry(2.9), trunkGeometry(4.1)];
  const crowns = [1, 2, 3].map((seed) => crownGeometry(seed, crownOpts));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const placeT = [];
  const placeC = [];
  spots.forEach((t, i) => {
    m.compose(new THREE.Vector3(t.x, 0, t.z), q.setFromAxisAngle(up, t.yaw), new THREE.Vector3(t.scale, t.scale, t.scale));
    placeT.push(trunks[i % 3].clone().applyMatrix4(m));
    const c = crowns[i % 3].clone();
    const corner = c.attributes.corner;
    for (let v = 0; v < corner.count; v++) corner.setXY(v, corner.getX(v) * t.scale, corner.getY(v) * t.scale);
    c.applyMatrix4(m);
    const phase = new Float32Array(c.attributes.position.count).fill(i * 1.7);
    c.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
    c.deleteAttribute('normal');
    placeC.push(c);
  });
  const trunk = new THREE.Mesh(mergeGeometries(placeT), trunkMat);
  const crownGeo = mergeGeometries(placeC);
  const crown = new THREE.Mesh(crownGeo, crownMat);
  trunk.raycast = crown.raycast = () => {};
  trunk.frustumCulled = crown.frustumCulled = false;
  const group = new THREE.Group();
  group.add(trunk, crown);
  return group;
}

function figLeafTexture() {
  const tex = paintedTexture(256, 256, (c, w, h) => {
    const leaf = () => {
      c.beginPath();
      c.moveTo(w * 0.5, h * 0.98);
      c.bezierCurveTo(w * 0.36, h * 0.86, w * 0.1, h * 0.86, w * 0.06, h * 0.68);
      c.bezierCurveTo(w * 0.04, h * 0.58, w * 0.22, h * 0.6, w * 0.3, h * 0.56);
      c.bezierCurveTo(w * 0.18, h * 0.46, w * 0.1, h * 0.3, w * 0.2, h * 0.24);
      c.bezierCurveTo(w * 0.3, h * 0.2, w * 0.36, h * 0.34, w * 0.42, h * 0.4);
      c.bezierCurveTo(w * 0.4, h * 0.26, w * 0.42, h * 0.06, w * 0.5, h * 0.03);
      c.bezierCurveTo(w * 0.58, h * 0.06, w * 0.6, h * 0.26, w * 0.58, h * 0.4);
      c.bezierCurveTo(w * 0.64, h * 0.34, w * 0.7, h * 0.2, w * 0.8, h * 0.24);
      c.bezierCurveTo(w * 0.9, h * 0.3, w * 0.82, h * 0.46, w * 0.7, h * 0.56);
      c.bezierCurveTo(w * 0.78, h * 0.6, w * 0.96, h * 0.58, w * 0.94, h * 0.68);
      c.bezierCurveTo(w * 0.9, h * 0.86, w * 0.64, h * 0.86, w * 0.5, h * 0.98);
      c.closePath();
    };
    leaf();
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#6e8340');
    g.addColorStop(0.6, '#465f2c');
    g.addColorStop(1, '#2d4220');
    c.fillStyle = g;
    c.fill();
    c.save();
    leaf();
    c.clip();
    c.strokeStyle = 'rgba(205,214,150,0.55)';
    c.lineWidth = 2.4;
    for (const [x, y] of [[0.5, 0.06], [0.2, 0.28], [0.8, 0.28], [0.1, 0.68], [0.9, 0.68]]) {
      c.beginPath();
      c.moveTo(w * 0.5, h * 0.88);
      c.quadraticCurveTo(w * (0.5 + (x - 0.5) * 0.4), h * 0.6, w * x, h * y);
      c.stroke();
    }
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(20,32,14,0.35)';
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + 12, y + 6);
      c.stroke();
    }
    c.restore();
  });
  tex.anisotropy = 4;
  return tex;
}

/** Moreau's fig tree, as a real one: a gnarled little trunk, boughs, broad lobed leaves and a few figs. About 2.2 m tall. */
export function figTree() {
  const group = new THREE.Group();
  const seedRnd = (() => {
    let a = 4242;
    return () => (a = (a * 9301 + 49297) % 233280) / 233280;
  })();
  const barkTex = paintedTexture(64, 256, (c, w, h) => {
    c.fillStyle = '#3a3126';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      c.strokeStyle = `rgba(${i % 2 ? '160,146,118' : '14,10,8'},${0.1 + Math.random() * 0.25})`;
      c.lineWidth = 1 + Math.random() * 2;
      const x = Math.random() * w;
      const y = Math.random() * h;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (Math.random() - 0.5) * 8, y + 20 + Math.random() * 50);
      c.stroke();
    }
  });
  barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const boughs = [
    [[0, 0, 0], [0.06, 0.45, 0.02], [-0.04, 0.95, -0.02], [0.05, 1.3, 0.04]],
    [[-0.04, 0.8, 0], [-0.35, 1.2, 0.08], [-0.55, 1.75, 0.02], [-0.5, 2.15, 0.05]],
    [[0.02, 0.95, 0], [0.32, 1.3, -0.1], [0.62, 1.6, -0.08], [0.85, 2.0, 0.02]],
    [[0.05, 1.25, 0.03], [0.1, 1.6, 0.2], [0.05, 1.95, 0.32], [0.1, 2.3, 0.35]],
    [[0.04, 1.2, 0], [-0.1, 1.6, -0.25], [-0.2, 1.95, -0.35], [-0.12, 2.25, -0.4]],
    [[-0.3, 1.15, 0.06], [-0.6, 1.3, 0.25], [-0.85, 1.45, 0.3], [-1.0, 1.75, 0.35]],
  ];
  const curves = boughs.map((b) => new THREE.CatmullRomCurve3(b.map(([x, y, z]) => V(x, y, z))));
  const tubes = curves.map((c, i) => {
    const g = new THREE.TubeGeometry(c, 14, i === 0 ? 0.075 : 0.032, 8);
    // taper toward the tip
    const p = g.attributes.position;
    const steps = 15;
    const ring = 9;
    for (let k = 0; k < p.count; k++) {
      const t = Math.floor(k / ring) / (steps - 1);
      const centre = c.getPoint(Math.min(1, t));
      const taper = i === 0 ? 1 - 0.45 * t : 1 - 0.8 * t;
      p.setXYZ(k, centre.x + (p.getX(k) - centre.x) * taper, centre.y + (p.getY(k) - centre.y) * taper, centre.z + (p.getZ(k) - centre.z) * taper);
    }
    g.computeVertexNormals();
    return g;
  });
  const wood = new THREE.Mesh(mergeGeometries(tubes), new THREE.MeshLambertMaterial({ map: barkTex }));
  group.add(wood);

  const LEAVES = 150;
  const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshLambertMaterial({ map: figLeafTexture(), alphaTest: 0.5, side: THREE.DoubleSide }), LEAVES);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < LEAVES; i++) {
    const c = curves[1 + (i % (curves.length - 1))];
    const t = 0.35 + seedRnd() * 0.72;
    const p = c.getPoint(Math.min(1, t));
    dummy.position.set(p.x + (seedRnd() - 0.5) * 0.34, p.y + (seedRnd() - 0.5) * 0.3, p.z + (seedRnd() - 0.5) * 0.34);
    dummy.rotation.set(-0.9 + seedRnd() * 1.4, seedRnd() * Math.PI * 2, (seedRnd() - 0.5) * 1.2);
    dummy.scale.setScalar(0.7 + seedRnd() * 0.75);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
    leaves.setColorAt(i, col.setScalar(0.72 + seedRnd() * 0.5));
  }
  group.add(leaves);

  const figs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 10, 8).scale(1, 1.25, 1), new THREE.MeshLambertMaterial({ color: '#4c2c42' }), 9);
  for (let i = 0; i < 9; i++) {
    const p = curves[1 + (i % 5)].getPoint(0.55 + (i % 3) * 0.2);
    dummy.position.set(p.x + (seedRnd() - 0.5) * 0.1, p.y - 0.05, p.z + (seedRnd() - 0.5) * 0.1);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    figs.setMatrixAt(i, dummy.matrix);
  }
  group.add(figs);
  group.traverse((o) => (o.raycast = () => {}));
  return group;
}
