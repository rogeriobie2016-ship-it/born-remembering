// Canova's Psyche, from the Scan the World photogrammetry (500,000 triangles, CC BY-NC-SA 4.0) to a mesh
// a headset can walk around: welded, simplified by quadric error, specks dropped, ambient occlusion baked
// into the vertices, then quantised. The output is an adaptation and keeps the licence (see CREDITS.md).
//
//   node art/tools/canova.mjs <scan.stl> public/art/psyche/canova.bin [triangles]
//
// Output layout (little-endian):
//   Uint32 vertexCount, Uint32 indexCount, Float32 min[3], Float32 size[3]   (32 bytes, metres)
//   Uint16 position[3 * n]  Uint16 index[m]  Int8 normal[3 * n]  Uint8 occlusion[n]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [, , inPath, outPath, targetArg] = process.argv;
const TARGET = Number(targetArg || 90000);
const REAL_HEIGHT = 1.55; // metres, the Louvre's figure for the group

// ---------- read and weld ----------
const raw = readFileSync(inPath);
const triCount = raw.readUInt32LE(80);
const index = new Map();
let P = [];
const T0 = new Int32Array(triCount * 3);
let o = 84;
for (let t = 0; t < triCount; t++) {
  o += 12;
  for (let k = 0; k < 3; k++) {
    const x = raw.readFloatLE(o), y = raw.readFloatLE(o + 4), z = raw.readFloatLE(o + 8);
    o += 12;
    const key = `${x},${y},${z}`;
    let id = index.get(key);
    if (id === undefined) {
      id = P.length / 3;
      index.set(key, id);
      P.push(x, y, z);
    }
    T0[t * 3 + k] = id;
  }
  o += 2;
}
index.clear();
let nv = P.length / 3;
console.log('read', triCount, 'triangles,', nv, 'vertices');

// to metres, standing on y = 0, centred
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (let i = 0; i < nv; i++) {
  minX = Math.min(minX, P[i * 3]); maxX = Math.max(maxX, P[i * 3]);
  minY = Math.min(minY, P[i * 3 + 1]); maxY = Math.max(maxY, P[i * 3 + 1]);
  minZ = Math.min(minZ, P[i * 3 + 2]); maxZ = Math.max(maxZ, P[i * 3 + 2]);
}
const unit = REAL_HEIGHT / (maxY - minY);
const pos = new Float64Array(nv * 3);
for (let i = 0; i < nv; i++) {
  pos[i * 3] = (P[i * 3] - (minX + maxX) / 2) * unit;
  pos[i * 3 + 1] = (P[i * 3 + 1] - minY) * unit;
  pos[i * 3 + 2] = (P[i * 3 + 2] - (minZ + maxZ) / 2) * unit;
}
P = null;

// ---------- quadric simplification, after Garland & Heckbert; the threshold sweep of Sp4cerat's FQMS ----------
let nt = triCount;
const tv = T0;
const terr = new Float64Array(nt * 4);
const tdel = new Uint8Array(nt);
const tdirty = new Uint8Array(nt);
const tn = new Float64Array(nt * 3);
const Q = new Float64Array(nv * 10);
const vstart = new Int32Array(nv);
const vcount = new Int32Array(nv);
const border = new Uint8Array(nv);
let refT = new Int32Array(nt * 6);
let refV = new Int8Array(nt * 6);
let refN = 0;
const pushRef = (t, v) => {
  if (refN === refT.length) {
    const a = new Int32Array(refT.length * 2); a.set(refT); refT = a;
    const b = new Int8Array(refV.length * 2); b.set(refV); refV = b;
  }
  refT[refN] = t;
  refV[refN++] = v;
};

const det = (m, a11, a12, a13, a21, a22, a23, a31, a32, a33) =>
  m[a11] * m[a22] * m[a33] + m[a13] * m[a21] * m[a32] + m[a12] * m[a23] * m[a31] - m[a13] * m[a22] * m[a31] - m[a11] * m[a23] * m[a32] - m[a12] * m[a21] * m[a33];
const qe = (q, x, y, z) => q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9];
const qs = new Float64Array(10);
const best = [0, 0, 0];
function edgeError(a, b) {
  for (let i = 0; i < 10; i++) qs[i] = Q[a * 10 + i] + Q[b * 10 + i];
  const d = det(qs, 0, 1, 2, 1, 4, 5, 2, 5, 7);
  if (Math.abs(d) > 1e-16 && !(border[a] & border[b])) {
    best[0] = (-1 / d) * det(qs, 1, 2, 3, 4, 5, 6, 5, 7, 8);
    best[1] = (1 / d) * det(qs, 0, 2, 3, 1, 5, 6, 2, 7, 8);
    best[2] = (-1 / d) * det(qs, 0, 1, 3, 1, 4, 6, 2, 5, 8);
    return qe(qs, best[0], best[1], best[2]);
  }
  const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
  const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
  const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
  const ea = qe(qs, ax, ay, az), eb = qe(qs, bx, by, bz), em = qe(qs, mx, my, mz);
  const e = Math.min(ea, eb, em);
  if (e === ea) { best[0] = ax; best[1] = ay; best[2] = az; }
  else if (e === eb) { best[0] = bx; best[1] = by; best[2] = bz; }
  else { best[0] = mx; best[1] = my; best[2] = mz; }
  return e;
}

function triNormal(t) {
  const a = tv[t * 3], b = tv[t * 3 + 1], c = tv[t * 3 + 2];
  const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
  const wx = pos[c * 3] - pos[a * 3], wy = pos[c * 3 + 1] - pos[a * 3 + 1], wz = pos[c * 3 + 2] - pos[a * 3 + 2];
  let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  tn[t * 3] = nx; tn[t * 3 + 1] = ny; tn[t * 3 + 2] = nz;
}

function setErrors(t) {
  let m = Infinity;
  for (let k = 0; k < 3; k++) {
    const e = edgeError(tv[t * 3 + k], tv[t * 3 + (k + 1) % 3]);
    terr[t * 4 + k] = e;
    if (e < m) m = e;
  }
  terr[t * 4 + 3] = m;
}

function rebuildRefs() {
  vcount.fill(0);
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) vcount[tv[t * 3 + k]]++;
  let s = 0;
  for (let v = 0; v < nv; v++) { vstart[v] = s; s += vcount[v]; vcount[v] = 0; }
  refN = s;
  if (refT.length < s) { refT = new Int32Array(s * 2); refV = new Int8Array(s * 2); }
  for (let t = 0; t < nt; t++) {
    for (let k = 0; k < 3; k++) {
      const v = tv[t * 3 + k];
      const r = vstart[v] + vcount[v]++;
      refT[r] = t;
      refV[r] = k;
    }
  }
}

function updateMesh(iter) {
  if (iter > 0) {
    let dst = 0;
    for (let t = 0; t < nt; t++) {
      if (tdel[t]) continue;
      if (dst !== t) {
        tv[dst * 3] = tv[t * 3]; tv[dst * 3 + 1] = tv[t * 3 + 1]; tv[dst * 3 + 2] = tv[t * 3 + 2];
        tn[dst * 3] = tn[t * 3]; tn[dst * 3 + 1] = tn[t * 3 + 1]; tn[dst * 3 + 2] = tn[t * 3 + 2];
        for (let i = 0; i < 4; i++) terr[dst * 4 + i] = terr[t * 4 + i];
      }
      tdel[dst] = 0;
      dst++;
    }
    nt = dst;
  }
  rebuildRefs();
  if (iter === 0) {
    // borders: a neighbour seen only once means an open edge
    const seen = new Map();
    for (let v = 0; v < nv; v++) {
      seen.clear();
      for (let r = vstart[v]; r < vstart[v] + vcount[v]; r++) {
        const t = refT[r], k = refV[r];
        for (let j = 1; j <= 2; j++) {
          const n = tv[t * 3 + (k + j) % 3];
          seen.set(n, (seen.get(n) || 0) + 1);
        }
      }
      for (const [n, c] of seen) if (c === 1) { border[v] = 1; border[n] = 1; }
    }
    for (let t = 0; t < nt; t++) {
      triNormal(t);
      const nx = tn[t * 3], ny = tn[t * 3 + 1], nz = tn[t * 3 + 2];
      const a = tv[t * 3];
      const d = -(nx * pos[a * 3] + ny * pos[a * 3 + 1] + nz * pos[a * 3 + 2]);
      const q = [nx * nx, nx * ny, nx * nz, nx * d, ny * ny, ny * nz, ny * d, nz * nz, nz * d, d * d];
      for (let k = 0; k < 3; k++) {
        const v = tv[t * 3 + k];
        for (let i = 0; i < 10; i++) Q[v * 10 + i] += q[i];
      }
    }
    for (let t = 0; t < nt; t++) setErrors(t);
  }
}

const del0 = [];
const del1 = [];
function flipped(px, py, pz, other, v, out) {
  out.length = vcount[v];
  for (let c = 0; c < vcount[v]; c++) {
    const r = vstart[v] + c;
    const t = refT[r];
    if (tdel[t]) { out[c] = 0; continue; }
    const s = refV[r];
    const a = tv[t * 3 + (s + 1) % 3], b = tv[t * 3 + (s + 2) % 3];
    if (a === other || b === other) { out[c] = 1; continue; }
    let ux = pos[a * 3] - px, uy = pos[a * 3 + 1] - py, uz = pos[a * 3 + 2] - pz;
    let wx = pos[b * 3] - px, wy = pos[b * 3 + 1] - py, wz = pos[b * 3 + 2] - pz;
    const lu = Math.hypot(ux, uy, uz) || 1, lw = Math.hypot(wx, wy, wz) || 1;
    ux /= lu; uy /= lu; uz /= lu; wx /= lw; wy /= lw; wz /= lw;
    if (Math.abs(ux * wx + uy * wy + uz * wz) > 0.999) return true;
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    out[c] = 0;
    if (nx * tn[t * 3] + ny * tn[t * 3 + 1] + nz * tn[t * 3 + 2] < 0.2) return true;
  }
  return false;
}

let deleted = 0;
function retarget(v0, v, dels) {
  let added = 0;
  for (let c = 0; c < vcount[v]; c++) {
    const r = vstart[v] + c;
    const t = refT[r];
    if (tdel[t]) continue;
    if (dels[c]) { tdel[t] = 1; deleted++; continue; }
    tv[t * 3 + refV[r]] = v0;
    tdirty[t] = 1;
    triNormal(t);
    setErrors(t);
    pushRef(t, refV[r]);
    added++;
  }
  return added;
}

const start = nt;
for (let iter = 0; iter < 200 && start - deleted > TARGET; iter++) {
  if (iter % 5 === 0) updateMesh(iter);
  tdirty.fill(0, 0, nt);
  const threshold = 1e-9 * Math.pow(iter + 3, 7);
  const count = nt;
  for (let t = 0; t < count && start - deleted > TARGET; t++) {
    if (terr[t * 4 + 3] > threshold || tdel[t] || tdirty[t]) continue;
    for (let k = 0; k < 3; k++) {
      if (terr[t * 4 + k] >= threshold) continue;
      const a = tv[t * 3 + k], b = tv[t * 3 + (k + 1) % 3];
      if (border[a] !== border[b]) continue;
      edgeError(a, b);
      const px = best[0], py = best[1], pz = best[2];
      if (!Number.isFinite(px + py + pz)) continue;
      if (flipped(px, py, pz, b, a, del0) || flipped(px, py, pz, a, b, del1)) continue;
      pos[a * 3] = px; pos[a * 3 + 1] = py; pos[a * 3 + 2] = pz;
      for (let i = 0; i < 10; i++) Q[a * 10 + i] += Q[b * 10 + i];
      const newStart = refN;
      const n = retarget(a, a, del0) + retarget(a, b, del1);
      vstart[a] = newStart;
      vcount[a] = n;
      break;
    }
  }
  if (iter % 10 === 0) console.log('iter', iter, 'triangles', start - deleted);
}

// ---------- gather what is left; drop specks ----------
const live = [];
for (let t = 0; t < nt; t++) if (!tdel[t]) live.push(t);
const parent = new Int32Array(nv).map((_, i) => i);
const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
for (const t of live) {
  const a = find(tv[t * 3]);
  parent[find(tv[t * 3 + 1])] = a;
  parent[find(tv[t * 3 + 2])] = a;
}
const compSize = new Map();
for (const t of live) { const c = find(tv[t * 3]); compSize.set(c, (compSize.get(c) || 0) + 1); }
console.log('components', [...compSize.values()].sort((a, b) => b - a).slice(0, 8));
const remap = new Int32Array(nv).fill(-1);
const verts = [];
const indices = [];
for (const t of live) {
  if (compSize.get(find(tv[t * 3])) < 300) continue;
  for (let k = 0; k < 3; k++) {
    const v = tv[t * 3 + k];
    if (remap[v] < 0) { remap[v] = verts.length; verts.push(v); }
    indices.push(remap[v]);
  }
}
const N = verts.length, M = indices.length;
const V = new Float64Array(N * 3);
verts.forEach((v, i) => { V[i * 3] = pos[v * 3]; V[i * 3 + 1] = pos[v * 3 + 1]; V[i * 3 + 2] = pos[v * 3 + 2]; });
console.log('final', M / 3, 'triangles,', N, 'vertices');
if (N >= 65536) throw new Error('too many vertices for Uint16 indices');

// ---------- normals, area weighted ----------
const NR = new Float64Array(N * 3);
for (let i = 0; i < M; i += 3) {
  const a = indices[i], b = indices[i + 1], c = indices[i + 2];
  const ux = V[b * 3] - V[a * 3], uy = V[b * 3 + 1] - V[a * 3 + 1], uz = V[b * 3 + 2] - V[a * 3 + 2];
  const wx = V[c * 3] - V[a * 3], wy = V[c * 3 + 1] - V[a * 3 + 1], wz = V[c * 3 + 2] - V[a * 3 + 2];
  const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
  for (const v of [a, b, c]) { NR[v * 3] += nx; NR[v * 3 + 1] += ny; NR[v * 3 + 2] += nz; }
}
for (let i = 0; i < N; i++) {
  const l = Math.hypot(NR[i * 3], NR[i * 3 + 1], NR[i * 3 + 2]) || 1;
  NR[i * 3] /= l; NR[i * 3 + 1] /= l; NR[i * 3 + 2] /= l;
}

// ---------- ambient occlusion, per vertex, through a uniform grid ----------
const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], V[i * 3 + k]); mx[k] = Math.max(mx[k], V[i * 3 + k]); }
const CELL = 0.03;
const dims = [0, 1, 2].map((k) => Math.max(1, Math.ceil((mx[k] - mn[k]) / CELL)));
const cellOf = (v, k) => Math.max(0, Math.min(dims[k] - 1, Math.floor((v - mn[k]) / CELL)));
const grid = new Map();
for (let i = 0; i < M; i += 3) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) {
    const c = V[indices[i + j] * 3 + k];
    lo[k] = Math.min(lo[k], c);
    hi[k] = Math.max(hi[k], c);
  }
  for (let x = cellOf(lo[0], 0); x <= cellOf(hi[0], 0); x++)
    for (let y = cellOf(lo[1], 1); y <= cellOf(hi[1], 1); y++)
      for (let z = cellOf(lo[2], 2); z <= cellOf(hi[2], 2); z++) {
        const key = x + y * dims[0] + z * dims[0] * dims[1];
        let cell = grid.get(key);
        if (!cell) grid.set(key, (cell = []));
        cell.push(i);
      }
}

function hit(ox, oy, oz, dx, dy, dz, tMax) {
  // walk the grid by small even steps: simple, and plenty for a soft term
  let closest = tMax;
  const step = CELL * 0.75;
  let lastKey = -1;
  for (let s = 0; s * step < closest; s++) {
    const d = s * step;
    const key = cellOf(ox + dx * d, 0) + cellOf(oy + dy * d, 1) * dims[0] + cellOf(oz + dz * d, 2) * dims[0] * dims[1];
    if (key === lastKey) continue;
    lastKey = key;
    const cell = grid.get(key);
    if (!cell) continue;
    for (const i of cell) {
      const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
      const e1x = V[b] - V[a], e1y = V[b + 1] - V[a + 1], e1z = V[b + 2] - V[a + 2];
      const e2x = V[c] - V[a], e2y = V[c + 1] - V[a + 1], e2z = V[c + 2] - V[a + 2];
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det3 = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det3) < 1e-12) continue;
      const inv = 1 / det3;
      const tx = ox - V[a], ty = oy - V[a + 1], tz = oz - V[a + 2];
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const w = (dx * qx + dy * qy + dz * qz) * inv;
      if (w < 0 || u + w > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t > 1e-3 && t < closest) closest = t;
    }
  }
  return closest;
}

const RAYS = 40;
const REACH = 0.3;
const ao = new Uint8Array(N);
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
for (let i = 0; i < N; i++) {
  const nx = NR[i * 3], ny = NR[i * 3 + 1], nz = NR[i * 3 + 2];
  const ox = V[i * 3] + nx * 0.003, oy = V[i * 3 + 1] + ny * 0.003, oz = V[i * 3 + 2] + nz * 0.003;
  // a frame around the normal
  let ax = Math.abs(nx) < 0.8 ? 1 : 0, ay = ax ? 0 : 1;
  const bx = ny * 0 - nz * ay, by = nz * ax - nx * 0, bz = nx * ay - ny * ax;
  const bl = Math.hypot(bx, by, bz) || 1;
  const tx = bx / bl, ty = by / bl, tz = bz / bl;
  const sx = ny * tz - nz * ty, sy = nz * tx - nx * tz, sz = nx * ty - ny * tx;
  let open = 0;
  for (let r = 0; r < RAYS; r++) {
    // cosine weighted
    const u = (r + rnd()) / RAYS, phi = rnd() * Math.PI * 2;
    const rr = Math.sqrt(u), h = Math.sqrt(1 - u);
    const lx = rr * Math.cos(phi), ly = rr * Math.sin(phi);
    const dx = tx * lx + sx * ly + nx * h, dy = ty * lx + sy * ly + ny * h, dz = tz * lx + sz * ly + nz * h;
    open += hit(ox, oy, oz, dx, dy, dz, REACH) / REACH;
  }
  ao[i] = Math.round((open / RAYS) * 255);
  if (i % 10000 === 0) console.log('occlusion', i, '/', N);
}
// a little smoothing across edges: keeps sampling noise out of the marble
const sum = new Float64Array(N), cnt = new Float64Array(N);
for (let i = 0; i < M; i += 3) {
  for (let j = 0; j < 3; j++) {
    const a = indices[i + j], b = indices[i + (j + 1) % 3];
    sum[a] += ao[b]; cnt[a]++;
    sum[b] += ao[a]; cnt[b]++;
  }
}
for (let i = 0; i < N; i++) ao[i] = Math.round((ao[i] + (cnt[i] ? sum[i] / cnt[i] : ao[i])) / 2);

// ---------- write ----------
const size = [0, 1, 2].map((k) => mx[k] - mn[k]);
const buf = Buffer.alloc(32 + N * 6 + M * 2 + N * 3 + N);
buf.writeUInt32LE(N, 0);
buf.writeUInt32LE(M, 4);
for (let k = 0; k < 3; k++) {
  buf.writeFloatLE(mn[k], 8 + k * 4);
  buf.writeFloatLE(size[k], 20 + k * 4);
}
let w = 32;
for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) { buf.writeUInt16LE(Math.round(((V[i * 3 + k] - mn[k]) / size[k]) * 65535), w); w += 2; }
for (let i = 0; i < M; i++) { buf.writeUInt16LE(indices[i], w); w += 2; }
for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) { buf.writeInt8(Math.round(NR[i * 3 + k] * 127), w); w += 1; }
for (let i = 0; i < N; i++) { buf.writeUInt8(ao[i], w); w += 1; }
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, buf);
console.log('wrote', outPath, (buf.length / 1e6).toFixed(2), 'MB; size', size.map((s) => s.toFixed(3)).join(' × '), 'm');
