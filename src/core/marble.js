import * as THREE from 'three';

// Marble: a mesh made by art/tools/scan.mjs, and a material for it. Stone that takes the light of one
// flame well: warm where it is lit, a little glow carried through it, the folds kept dark by the occlusion
// baked in the vertices.

/** Loads a .bin from scan.mjs. Returns a BufferGeometry in metres, standing on y = 0; null if it is missing. */
export async function loadMarble(path) {
  const res = await fetch(`${import.meta.env.BASE_URL}${path}`).catch(() => null);
  if (!res || !res.ok) return null;
  const buf = await res.arrayBuffer();
  const head = new DataView(buf);
  const n = head.getUint32(0, true);
  const m = head.getUint32(4, true);
  if (buf.byteLength !== 32 + n * 6 + m * 2 + n * 3 + n) return null;
  const min = [8, 12, 16].map((o) => head.getFloat32(o, true));
  const size = [20, 24, 28].map((o) => head.getFloat32(o, true));
  let at = 32;
  const quant = new Uint16Array(buf, at, n * 3);
  at += n * 6;
  const index = new Uint16Array(buf, at, m);
  at += m * 2;
  const normal = new Int8Array(buf, at, n * 3);
  at += n * 3;
  const occlusion = new Uint8Array(buf, at, n);

  const position = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) position[i * 3 + k] = min[k] + (quant[i * 3 + k] / 65535) * size[k];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3, true));
  geo.setAttribute('occlusion', new THREE.BufferAttribute(occlusion, 1, true));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingSphere();
  return geo;
}

/** Warm stone. `uniforms.heart` is a point in world space the stone glows around from inside (w = strength). */
export function marbleMaterial({ color = '#efe2cf', shadow = '#2a1c16', through = '#ff9a5c' } = {}) {
  const mat = new THREE.MeshLambertMaterial({ color });
  const uniforms = {
    marbleShadow: { value: new THREE.Color(shadow) },
    marbleThrough: { value: new THREE.Color(through) },
    heart: { value: new THREE.Vector4(0, 0, 0, 0) },
    heartColor: { value: new THREE.Color('#ff5a3c') },
  };
  mat.userData.marble = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float occlusion;
        varying float vOcc;
        varying vec3 vMarbleWorld;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vOcc = occlusion;
        vMarbleWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 marbleShadow;
        uniform vec3 marbleThrough;
        uniform vec4 heart;
        uniform vec3 heartColor;
        varying float vOcc;
        varying vec3 vMarbleWorld;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          float occ = smoothstep(0.08, 0.85, vOcc);
          vec3 lit = outgoingLight * mix(0.35, 1.0, occ);
          float amount = dot(lit, vec3(0.299, 0.587, 0.114));
          // light carried a little way into the stone: the edge of the shadow goes warm, never grey
          vec3 carried = marbleThrough * smoothstep(0.0, 0.32, amount) * (1.0 - smoothstep(0.32, 0.8, amount)) * 0.16;
          outgoingLight = marbleShadow * 0.05 * occ + lit + carried;
          float near = heart.w * exp(-distance(vMarbleWorld, heart.xyz) * 2.6);
          outgoingLight += heartColor * near;
        }
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'marble';
  return mat;
}
