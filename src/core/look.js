import * as THREE from 'three';

// Shared look: a hand-coloured copper engraving with Renaissance modelling.
// Tone is drawn with ink hatching (parallel lines, crossed in the shadows) over
// flat watercolour washes; shadows stay warm. Everything happens inside the
// materials, so it works in the headset (no post-processing).
//
// Lines are fixed to the world (never to the screen), and fade to their average
// tone where they get finer than a pixel, so they don't shimmer in VR.

/** GLSL: hatching helpers, shared by materials, sky and sea. */
export const ENGRAVE_GLSL = /* glsl */ `
  // Ink coverage of one family of parallel lines (one line per unit of c), half-width t (0..1).
  float hatchLine(float c, float t) {
    float w = fwidth(c);
    float d = abs(fract(c) - 0.5) * 2.0;
    float ink = (1.0 - smoothstep(t - w, t + w, d)) * smoothstep(0.0, 0.04, t);
    return mix(ink, t, smoothstep(0.3, 0.75, w)); // too fine to draw: the average tone
  }
  // Engraver's tone scale. p is a world position in line units: each family is a stack of
  // parallel planes slicing the form, so lines wrap around it like a burin's (no seams).
  // One family in the half-tones, crossed in the shadows, a third in the deepest darks.
  float engrave(vec3 p, float shade) {
    float dark = clamp(1.0 - smoothstep(0.05, 0.85, shade), 0.0, 1.0);
    float a = hatchLine(dot(p, vec3(0.58, 0.72, 0.38)), clamp((dark - 0.2) * 0.45, 0.0, 0.3));
    float b = hatchLine(dot(p, vec3(-0.62, 0.55, 0.56)), clamp((dark - 0.55) * 0.6, 0.0, 0.26));
    float c = hatchLine(dot(p, vec3(0.1, -0.35, 0.93)), clamp((dark - 0.8) * 1.0, 0.0, 0.22));
    return max(a, max(b, c));
  }
`;

export const INK = new THREE.Color('#2a1c14');

/**
 * Lambert, engraved and hand-coloured: watercolour wash + ink hatching in world space,
 * warm (umber) shadows, a soft rim so forms still read as backlit.
 * `hatch` = engraved lines per metre (0 = wash only). Uniforms live in `mat.userData.rim`.
 */
export function softMaterial({ color = '#ffffff', rim = '#fff1dc', rimPower = 2.2, rimStrength = 0.35, hatch = 70, umber = '#5a3522', ...extra } = {}) {
  const mat = new THREE.MeshLambertMaterial({ color, ...extra });
  const uniforms = {
    rimColor: { value: new THREE.Color(rim) },
    rimPower: { value: rimPower },
    rimStrength: { value: rimStrength },
    hatchScale: { value: hatch },
    umber: { value: new THREE.Color(umber) },
    inkColor: { value: INK.clone() },
  };
  mat.userData.rim = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPaintPos;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 paintWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          paintWorld = instanceMatrix * paintWorld;
        #endif
        vPaintPos = (modelMatrix * paintWorld).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 rimColor;
        uniform float rimPower;
        uniform float rimStrength;
        uniform float hatchScale;
        uniform vec3 umber;
        uniform vec3 inkColor;
        varying vec3 vPaintPos;
        ${ENGRAVE_GLSL}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          vec3 albedo = diffuseColor.rgb;
          float shade = clamp(dot(outgoingLight, vec3(0.299, 0.587, 0.114)) / max(dot(albedo, vec3(0.299, 0.587, 0.114)), 0.06), 0.0, 1.4);
          // hand-coloured wash: mostly flat colour, modelled gently, shadows warm
          vec3 wash = albedo * mix(0.62, 1.06, smoothstep(0.05, 1.0, shade));
          wash = mix(umber * 0.9 + albedo * 0.25, wash, smoothstep(0.0, 0.55, shade) * 0.75 + 0.25);
          float ink = 0.0;
          if (hatchScale > 0.0) ink = engrave(vPaintPos * hatchScale, shade);
          float rimK = pow(1.0 - saturate(abs(dot(normalize(normal), normalize(vViewPosition)))), rimPower);
          outgoingLight = mix(wash, inkColor, ink * 0.72) + rimColor * rimK * rimStrength;
        }
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'engraved';
  return mat;
}

/**
 * Ink contour around a mesh (inverted hull): a back-facing copy pushed out along its normals.
 * Adds it as a child; `width` in metres (local units are scaled with the mesh).
 */
export function inkOutline(mesh, width = 0.008, color = INK) {
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.outlineWidth = { value: width };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float outlineWidth;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * outlineWidth;');
  };
  mat.customProgramCacheKey = () => 'ink-outline';
  const hull = mesh.isInstancedMesh ? new THREE.InstancedMesh(mesh.geometry, mat, mesh.count) : new THREE.Mesh(mesh.geometry, mat);
  if (mesh.isInstancedMesh) hull.instanceMatrix = mesh.instanceMatrix;
  hull.raycast = () => {};
  hull.userData.outline = true;
  mesh.add(hull);
  return hull;
}

/** Outline every mesh under `root` (skips transparent ones and existing outlines). */
export function inkOutlineAll(root, width = 0.008) {
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh && !o.userData.outline && !(o.material && o.material.transparent) && !o.isSprite) meshes.push(o);
  });
  for (const m of meshes) {
    // the hull inherits the mesh's scale: keep the visible width constant
    const s = new THREE.Vector3();
    m.getWorldScale(s);
    inkOutline(m, width / Math.max(1e-3, (s.x + s.y + s.z) / 3));
  }
}

/**
 * A shaft of light: additive, soft at the edges, fading along its length, with faint streaks.
 * Geometry UVs: u across the shaft, v from the source (0) to the far end (1).
 * Set `mat.opacity` as usual; the mesh copies it to the shader each frame.
 */
export function lightShaftMaterial(color = '#fff1cf', opacity = 0.2) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      opacity: { value: opacity },
      time: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vFacing;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vFacing = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float opacity;
      uniform float time;
      varying vec2 vUv;
      varying float vFacing;
      void main() {
        float across = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
        float along = smoothstep(0.0, 0.08, vUv.y) * (1.0 - 0.65 * vUv.y);
        float streak = 0.75 + 0.25 * sin(vUv.x * 23.0 + sin(vUv.y * 3.0 + time * 0.4) * 2.0);
        float a = opacity * across * along * streak * pow(vFacing, 1.4);
        gl_FragColor = vec4(color * a, a);
      }`,
  });
  mat.opacity = opacity;
  return mat;
}

/** Keep a shaft's shader in sync with `material.opacity` and the clock. */
export function bindShaft(mesh) {
  mesh.raycast = () => {};
  mesh.onBeforeRender = () => {
    const u = mesh.material.uniforms;
    u.opacity.value = mesh.material.opacity;
    u.time.value = performance.now() / 1000;
  };
  return mesh;
}

/** A painted canvas texture, sRGB. `draw(ctx, w, h)` paints it. */
export function paintedTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Canvas helper: fill `path()` with engraved parallel lines (angle in radians, spacing in px),
 * the way an engraver lays tone. Clipped to the path.
 */
export function hatchFill(c, path, { angle = 0.6, spacing = 4, width = 1, color = 'rgba(42,28,20,0.8)', bounds } = {}) {
  const [x0, y0, x1, y1] = bounds || [0, 0, c.canvas.width, c.canvas.height];
  c.save();
  path();
  c.clip();
  c.strokeStyle = color;
  c.lineWidth = width;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const r = Math.hypot(x1 - x0, y1 - y0) / 2 + spacing;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  c.beginPath();
  for (let o = -r; o <= r; o += spacing) {
    const px = cx - dy * o;
    const py = cy + dx * o;
    c.moveTo(px - dx * r, py - dy * r);
    c.lineTo(px + dx * r, py + dy * r);
  }
  c.stroke();
  c.restore();
}

/** Bake a vertical gradient + optional radial lift into a geometry's vertex colors (cheap fake AO). */
export function bakeGradient(geometry, { low, high, from = 0, to = 1, lift = null } = {}) {
  const pos = geometry.attributes.position;
  const cLow = new THREE.Color(low);
  const cHigh = new THREE.Color(high);
  const out = new THREE.Color();
  const v = new THREE.Vector3();
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = THREE.MathUtils.smoothstep(v.y, from, to);
    out.copy(cLow).lerp(cHigh, k);
    if (lift) {
      const d = v.distanceTo(lift.at);
      const l = Math.max(0, 1 - d / lift.radius);
      out.lerp(new THREE.Color(lift.color), l * l * lift.strength);
    }
    colors.set([out.r, out.g, out.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}
