import * as THREE from 'three';
import { ENGRAVE_GLSL } from './look.js';

// Engraved open air, shared by the sea scenes: a hand-coloured sky (fine horizontal
// lines, outlined cumulus, a sun in glory) and a sea drawn in wavy lines with foam.
// Uniforms are returned so scenes can animate sun, whiteout, swell and altitude.

export const NOISE_GLSL = /* glsl */ `
  float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float vnoise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
`;

/**
 * Sky dome. Options: top/horizon colours, sunDir (shared Vector3), sunR (angular radius),
 * cloudLow/cloudLit colours, cover (0..1, how cloudy).
 * Returns { mesh, u } — u.whiteout, u.sunR, u.time are meant to be animated.
 */
export function engravedSky({ top = '#5c84b3', horizon = '#d6dccf', sunDir, sunR = 0.035, cloudLow = '#bdc4d6', cloudLit = '#fffaee', glory = '#ffeeb8', cover = 0.5 } = {}) {
  const u = {
    top: { value: new THREE.Color(top) },
    horizon: { value: new THREE.Color(horizon) },
    white: { value: new THREE.Color('#fffaf0') },
    cloudLow: { value: new THREE.Color(cloudLow) },
    cloudLit: { value: new THREE.Color(cloudLit) },
    gloryCol: { value: new THREE.Color(glory) },
    whiteout: { value: 0 },
    sunDir: { value: sunDir || new THREE.Vector3(0, 0.5, -1).normalize() },
    sunR: { value: sunR },
    cover: { value: cover },
    time: { value: 0 },
  };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(250, 64, 32),
    new THREE.ShaderMaterial({
      uniforms: u,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top, horizon, white, sunDir, cloudLow, cloudLit, gloryCol;
        uniform float whiteout, sunR, time, cover;
        varying vec3 vDir;
        ${ENGRAVE_GLSL}
        ${NOISE_GLSL}
        void main() {
          vec3 d = normalize(vDir);
          float e = asin(clamp(d.y, -1.0, 1.0));
          float az = atan(d.x, -d.z);
          vec3 col = mix(horizon, top, smoothstep(0.0, 0.75, e));
          vec3 ink = vec3(0.16, 0.12, 0.1);

          // cumulus: billowing masses low in the sky, lit from above
          vec3 q = vec3(d.x * 2.4 + time * 0.003, d.y * 5.0, d.z * 2.4);
          float n = fbm(q);
          float band = smoothstep(0.0, 0.1, e) * (1.0 - smoothstep(0.38, 0.75, e));
          float field = n + band * (0.02 + cover * 0.2) - 0.1 * smoothstep(0.3, 0.7, e);
          float thr = 0.66 - cover * 0.08;
          float cloud = smoothstep(thr - 0.02, thr + 0.02, field);
          float lit = clamp(0.55 - (fbm(q + vec3(0.0, 0.18, 0.0)) - n) * 5.0 + (d.y - 0.1) * 1.5, 0.0, 1.0);
          col = mix(col, mix(cloudLow, cloudLit, lit), cloud);

          // engraver's lines: fine horizontals in the sky, curved hatching in cloud shadow, ink contours
          float skyInk = hatchLine(degrees(e) * 2.6, mix(0.08, 0.36, smoothstep(0.0, 1.1, e))) * (1.0 - cloud);
          float cloudInk = hatchLine(degrees(az) * 1.3 + degrees(e) * 2.2 + n * 8.0, (1.0 - lit) * 0.34) * cloud;
          float edge = (1.0 - smoothstep(0.0, fwidth(field) * 1.6, abs(field - thr))) * band;
          float k = max(skyInk * 0.8, max(cloudInk, edge * 0.85));

          // the sun in glory: a pale disc and engraved rays all around it
          float ang = acos(clamp(dot(d, sunDir), -1.0, 1.0));
          vec3 ax = normalize(cross(sunDir, vec3(0.0, 1.0, 0.0)));
          vec3 ay = cross(ax, sunDir);
          float ra = atan(dot(d, ay), dot(d, ax));
          float g = 1.0 - smoothstep(sunR, sunR * 5.0, ang);
          float rays = hatchLine(ra * 15.0, 0.35 * g) * step(sunR * 1.05, ang);
          col = mix(col, gloryCol, g * 0.55);
          k = max(k * (1.0 - g), rays * 0.7);
          float disc = 1.0 - smoothstep(sunR * 0.96, sunR * 1.04, ang);
          col = mix(col, vec3(1.0, 0.98, 0.9), disc);
          k *= 1.0 - disc;

          col = mix(col, ink, k * 0.6);
          col = mix(col, white, whiteout);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  mesh.renderOrder = -1;
  mesh.raycast = () => {};
  return { mesh, u };
}

/**
 * Sea plane (420 m). Lines are wavy horizontals, heavier in the troughs; foam on the crests.
 * Returns { mesh, u } — animate u.time, u.travel (forward scroll), u.seaLevel (world y of the plane), u.glare.
 */
export function engravedSea({ deep = '#2a6a6c', crest = '#86c2b0', sunDir, fogColor, fogNear = 30, fogFar = 190, swell = 1, lines = 1.4, ink = 0.6 } = {}) {
  const u = {
    time: { value: 0 },
    travel: { value: 0 },
    seaLevel: { value: 0 },
    swell: { value: swell },
    lines: { value: lines },
    inkAmt: { value: ink },
    sunDir: { value: sunDir || new THREE.Vector3(0, 0.5, -1).normalize() },
    deep: { value: new THREE.Color(deep) },
    crest: { value: new THREE.Color(crest) },
    fogColor: { value: fogColor || new THREE.Color('#d6dccf') },
    fogNear: { value: fogNear },
    fogFar: { value: fogFar },
    glare: { value: 0 },
  };
  const geo = new THREE.PlaneGeometry(420, 420, 96, 96);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms: u,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        uniform float time, travel, swell;
        varying vec3 vPos;
        float wave(vec2 p) {
          return sin(p.x * 0.17 + time * 0.9) * 0.45 + sin(p.y * 0.23 - time * 1.1) * 0.35 + sin((p.x + p.y) * 0.37 + time * 1.7) * 0.18;
        }
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          wp.y += wave(vec2(wp.x, wp.z - travel)) * swell;
          vPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 deep, crest, fogColor, sunDir;
        uniform float fogNear, fogFar, glare, seaLevel, time, travel, swell, lines, inkAmt;
        varying vec3 vPos;
        ${ENGRAVE_GLSL}
        void main() {
          vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
          if (n.y < 0.0) n = -n;
          float h = (vPos.y - seaLevel) / max(swell, 0.01);
          float diff = clamp(dot(n, sunDir), 0.0, 1.0);
          vec3 col = mix(deep, crest, smoothstep(-0.6, 0.6, h)) * (0.75 + 0.35 * diff);
          float z = vPos.z - travel;
          float c = z * lines + sin(vPos.x * 0.21 + z * 0.13) * 1.1 + h * 0.8;
          float ink = hatchLine(c, clamp(0.34 - h * 0.25, 0.04, 0.42));
          float foam = smoothstep(0.7, 0.95, h + 0.2 * sin(vPos.x * 1.3 + z * 0.9 + time));
          col = mix(col, vec3(0.97, 0.97, 0.93), foam * 0.6);
          ink *= 1.0 - foam;
          // close to the eye the lines would be fat stripes: let the wash carry the water there
          ink *= mix(0.2, 1.0, smoothstep(2.5, 14.0, length(cameraPosition - vPos)));
          vec3 v = normalize(cameraPosition - vPos);
          col += vec3(1.0, 0.92, 0.7) * pow(max(dot(n, normalize(sunDir + v)), 0.0), 60.0) * (0.8 + glare * 3.0);
          col = mix(col, vec3(0.13, 0.15, 0.14), ink * inkAmt);
          float f = smoothstep(fogNear, fogFar, length(cameraPosition - vPos));
          gl_FragColor = vec4(mix(col, fogColor, f), 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  return { mesh, u };
}
