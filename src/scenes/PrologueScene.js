import * as THREE from 'three';
import { BaseScene } from '../core/SceneManager.js';
import { ease, lerp, glowTexture } from '../core/util.js';
import { softMaterial, paintedTexture } from '../core/look.js';
import { loadArt, cutout, groundShadow } from '../core/collage.js';

// Scene 1 — The Garden. Before birth, the soul stands in Botticelli's night garden
// (La Primavera): the Graces dance, Zephyr chases Chloris, Cupid circles overhead,
// petals fall. The Muses are invoked; the poem is spoken. Then the grove opens onto
// the sea and Venus is born on a golden shell (The Birth of Venus) — and so are you.
//
// Look: mixed media. Figures are cut out of the public-domain paintings and stand
// around you like a paper theatre; the trees, ground and shell are engraved 3D.

const EYE = 1.6;

/** Scallop shell: a fan of ribs, hinge at the origin, opening along +Y. */
function shellGeometry(R = 1.6, ribs = 17) {
  const geo = new THREE.BufferGeometry();
  const segA = ribs * 8;
  const segR = 18;
  const pos = [];
  const idx = [];
  for (let j = 0; j <= segR; j++) {
    const r = 0.06 + (j / segR) * 0.94;
    for (let i = 0; i <= segA; i++) {
      const u = i / segA;
      const th = lerp(0.07, 0.93, u) * Math.PI;
      const rib = Math.pow(Math.abs(Math.sin(u * ribs * Math.PI)), 0.6);
      const lip = 1 + 0.06 * rib * r; // scalloped rim
      const x = Math.cos(th) * r * R * lip;
      const y = Math.sin(th) * r * R * lip;
      const z = (rib * 0.09 + 0.25 * r * r) * R; // corrugated, cupped
      pos.push(x, y, z);
    }
  }
  const row = segA + 1;
  for (let j = 0; j < segR; j++) {
    for (let i = 0; i < segA; i++) {
      const a = j * row + i;
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/** A pink rose petal for the falling-petal points. */
function petalTexture() {
  return paintedTexture(64, 64, (c) => {
    const g = c.createRadialGradient(28, 26, 2, 32, 32, 28);
    g.addColorStop(0, 'rgba(255,236,236,1)');
    g.addColorStop(0.55, 'rgba(236,160,170,0.95)');
    g.addColorStop(1, 'rgba(200,110,130,0)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(32, 32, 26, 16, 0.6, 0, Math.PI * 2);
    c.fill();
  });
}

export class PrologueScene extends BaseScene {
  async enter() {
    const { ctx } = this;
    ctx.rig.position.set(0, EYE, 0);
    ctx.look.reset(0, -0.05);
    const night = new THREE.Color('#0c110d');
    ctx.scene.background = night.clone();
    ctx.scene.fog = new THREE.Fog(night.clone(), 7, 26);
    ctx.grain.set({ grain: 0.05, vignette: 0.45, color: '#0a0705' });

    const names = ['graces', 'venus-primavera', 'mercury', 'flora', 'zephyr-chloris', 'cupid', 'venus', 'zephyr-aura', 'hora', 'meadow', 'grove', 'sea'];
    const [T] = await Promise.all([loadArt('garden', names), ctx.audio.preload(['moonlight'])]);

    // ---------- sky: night above the grove, dawn over the sea (engraved lines) ----------
    this.skyU = { dawn: { value: 0 } };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(60, 48, 24),
      new THREE.ShaderMaterial({
        uniforms: this.skyU,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float dawn;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            float e = asin(clamp(d.y, -1.0, 1.0));
            // night: Primavera's pale glimpses between the trees, black above
            vec3 nightCol = mix(vec3(0.34, 0.40, 0.38), vec3(0.02, 0.03, 0.03), smoothstep(0.0, 0.3, e));
            // dawn: Birth of Venus — pale aquamarine sky, warm at the horizon
            vec3 dawnCol = mix(vec3(0.96, 0.93, 0.83), vec3(0.50, 0.71, 0.76), smoothstep(0.0, 0.5, e));
            float az = atan(d.x, -d.z);
            float streak = smoothstep(0.62, 0.95, sin(e * 34.0 + sin(az * 2.3) * 1.4) * 0.5 + 0.5)
                         * smoothstep(0.03, 0.12, e) * (1.0 - smoothstep(0.32, 0.6, e));
            dawnCol = mix(dawnCol, vec3(1.0, 0.98, 0.93), streak * 0.25);
            dawnCol += vec3(1.0, 0.82, 0.66) * pow(max(dot(d, normalize(vec3(-0.75, 0.15, -0.65))), 0.0), 5.0) * 0.22;
            vec3 col = mix(nightCol, dawnCol, dawn);
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    sky.renderOrder = -2;
    sky.raycast = () => {};
    this.add(sky);

    // ---------- the grove ----------
    this.grove = this.add(new THREE.Group());
    this.groveMats = [];
    if (T.meadow) {
      T.meadow.wrapS = T.meadow.wrapT = THREE.RepeatWrapping;
      T.meadow.repeat.set(8, 8);
    }
    const groundMat = new THREE.MeshBasicMaterial({ map: T.meadow, color: T.meadow ? '#8f8f86' : '#141a10', transparent: true });
    this.groveMats.push(groundMat);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 64), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.renderOrder = -1;
    ground.raycast = () => {};
    this.grove.add(ground);

    const barkMat = softMaterial({ color: '#2b2017', rim: '#9fb0a0', rimStrength: 0.25, hatch: 26, transparent: true });
    this.groveMats.push(barkMat);
    const trunkGeo = new THREE.CylinderGeometry(0.11, 0.17, 9, 14);
    trunkGeo.translate(0, 4.5, 0);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.sin(i * 7.1) * 0.08;
      const r = 7.2 + Math.sin(i * 3.3) * 0.9;
      const t = new THREE.Mesh(trunkGeo, barkMat);
      t.position.set(Math.sin(a) * r, 0, -Math.cos(a) * r);
      t.rotation.z = Math.sin(i * 1.7) * 0.04;
      t.scale.setScalar(0.85 + (i % 3) * 0.12);
      t.raycast = () => {};
      this.grove.add(t);
    }
    if (T.grove) {
      // Orange trees all around: the painting's dark foliage as a canopy overhead
      // and, further back, a wall of leaves with pale sky showing low between them.
      T.grove.wrapS = THREE.RepeatWrapping;
      T.grove.wrapT = THREE.MirroredRepeatWrapping;
      const ring = (radius, height, y, repeatX, repeatY, opacityTop) => {
        const tex = T.grove.clone();
        tex.repeat.set(repeatX, repeatY);
        tex.needsUpdate = true;
        const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, transparent: true, opacity: opacityTop });
        this.groveMats.push(mat);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 72, 1, true), mat);
        m.position.y = y;
        m.renderOrder = -1; // backdrop: draw before figures and words (it is transparent only to fade out)
        m.raycast = () => {};
        this.grove.add(m);
      };
      ring(7.4, 3.6, 6.4, 6, 1, 1);
      ring(10.5, 8, 4.0, 7, 2.2, 1);
    }

    // The figures of La Primavera, standing in a half ring before you.
    this.figures = [];
    const place = (tex, h, angleDeg, dist, extra = {}) => {
      if (!tex) return null;
      const g = new THREE.Group();
      const fig = cutout(tex, h);
      g.add(fig);
      if (!extra.flying) g.add(groundShadow(h * 0.45));
      const a = THREE.MathUtils.degToRad(angleDeg);
      g.position.set(Math.sin(a) * dist, extra.y || 0, -Math.cos(a) * dist);
      g.lookAt(0, g.position.y, 0);
      g.userData = { base: g.position.clone(), phase: Math.random() * 6, ...extra };
      fig.material.transparent = true;
      this.groveMats.push(fig.material);
      this.grove.add(g);
      this.figures.push(g);
      return g;
    };
    place(T.mercury, 2.05, -62, 5.0);
    this.graces = place(T.graces, 2.0, -30, 4.2, { dance: true });
    place(T['venus-primavera'], 2.05, 0, 5.4);
    place(T.flora, 2.0, 28, 4.6);
    place(T['zephyr-chloris'], 2.15, 55, 4.9);
    this.cupid = place(T.cupid, 0.55, 0, 3.2, { flying: true, y: 3.0 });

    // Petals drift down everywhere.
    this.petalCount = 220;
    this.petalPos = new Float32Array(this.petalCount * 3);
    this.petalSeed = Array.from({ length: this.petalCount }, () => [Math.random(), Math.random(), Math.random(), 0.15 + Math.random() * 0.25]);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.petalPos, 3));
    this.petals = new THREE.Points(
      pg,
      new THREE.PointsMaterial({ map: petalTexture(), size: 0.07, transparent: true, depthWrite: false, alphaTest: 0.02 }),
    );
    this.petals.frustumCulled = false;
    this.petals.raycast = () => {};
    this.add(this.petals);
    this.petalWind = 0; // pushes petals toward Venus in the second half

    // Golden motes (fireflies) breathing in the dark between the trees.
    this.motes = Array.from({ length: 90 }, () => [(Math.random() - 0.5) * 12, 0.3 + Math.random() * 3.5, -1 - Math.random() * 7, Math.random() * 6]);
    this.motePos = new Float32Array(this.motes.length * 3);
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(this.motePos, 3));
    this.moteMat = new THREE.PointsMaterial({ map: glowTexture(), color: '#ffd98a', size: 0.09, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.motePoints = new THREE.Points(mg, this.moteMat);
    this.motePoints.frustumCulled = false;
    this.motePoints.raycast = () => {};
    this.grove.add(this.motePoints);

    // ---------- the sea and the birth of Venus (hidden at first) ----------
    this.venusWorld = this.add(new THREE.Group());
    this.venusWorld.visible = false;
    if (T.sea) {
      T.sea.wrapS = T.sea.wrapT = THREE.RepeatWrapping;
      T.sea.repeat.set(9, 9);
    }
    this.seaMat = new THREE.MeshBasicMaterial({ map: T.sea, color: T.sea ? '#ffffff' : '#9cc9c2', transparent: true, opacity: 0 });
    const sea = new THREE.Mesh(new THREE.CircleGeometry(40, 64), this.seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.02;
    sea.raycast = () => {};
    this.venusWorld.add(sea);

    this.shell = new THREE.Group();
    const shellMesh = new THREE.Mesh(
      shellGeometry(1.5),
      softMaterial({ color: '#d9b462', rim: '#fff4cc', rimPower: 1.6, rimStrength: 0.7, hatch: 46, side: THREE.DoubleSide }),
    );
    shellMesh.rotation.x = -1.15; // lying open, tilted back
    this.shell.add(shellMesh);
    this.shell.position.set(0, -1.2, -5.0);
    this.venusWorld.add(this.shell);
    const landMat = softMaterial({ color: '#6f7d48', rim: '#f6ecc8', rimStrength: 0.4, hatch: 6 });
    const cypressMat = softMaterial({ color: '#2f3b24', rim: '#f2e3b0', rimPower: 1.5, rimStrength: 0.45, hatch: 14 });
    // a cypress: a dark green flame, the Tuscan landscape's signature
    const cypressGeo = new THREE.LatheGeometry(
      [[0, 0], [0.32, 0.15], [0.55, 0.8], [0.58, 1.6], [0.45, 2.5], [0.24, 3.3], [0.06, 3.85], [0, 4]].map(([r, y]) => new THREE.Vector2(r, y)),
      20,
    );
    const headland = (x, z, sx, sz, h, trees) => {
      const land = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), landMat);
      land.scale.set(sx, h, sz);
      land.position.set(x, -0.05, z);
      land.raycast = () => {};
      this.venusWorld.add(land);
      for (let i = 0; i < trees; i++) {
        const t = new THREE.Mesh(cypressGeo, cypressMat);
        const u = i / Math.max(1, trees - 1) - 0.5;
        t.position.set(x + u * sx * 1.2, h * (0.55 + 0.35 * (1 - Math.abs(u) * 2)), z + Math.sin(i * 2.7) * sz * 0.25);
        t.scale.set(1, 0.65 + ((i * 37) % 10) / 18, 1);
        t.raycast = () => {};
        this.venusWorld.add(t);
      }
    };
    headland(9.5, -12, 5, 3.2, 1.3, 5);
    headland(15, -20, 6, 4, 1.8, 6);
    headland(-17, -24, 7, 3, 0.9, 0);
    // a soft halo of light behind Venus
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: '#fff3d6', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    );
    this.halo.position.set(0, 1.5, -0.25);
    this.halo.scale.setScalar(3.4);
    this.halo.raycast = () => {};
    this.shell.add(this.halo);
    if (T.venus) {
      this.venus = cutout(T.venus, 2.6);
      this.venus.position.set(0.05, 0.12, 0.25);
      this.shell.add(this.venus);
    }
    if (T['zephyr-aura']) {
      this.winds = cutout(T['zephyr-aura'], 2.3);
      this.winds.position.set(-7, 2.2, -6);
      this.winds.lookAt(0, 2.2, 0);
      this.venusWorld.add(this.winds);
    }
    // The Hora of spring waits on the shore with her cloak: a gilded medallion, since her
    // figure could not be cut cleanly from the painting.
    if (T.hora) {
      const hora = cutout(T.hora, 3.0);
      const [w, h] = hora.userData.size;
      const frame = new THREE.Mesh(
        new THREE.TorusGeometry(0.5, 0.022, 8, 72),
        softMaterial({ color: '#c9a24e', rim: '#fff2c4', rimPower: 1.4, rimStrength: 0.8, hatch: 0 }),
      );
      frame.scale.set(w * 0.97, h * 0.98, 1);
      frame.position.y = h / 2;
      frame.raycast = () => {};
      hora.add(frame);
      hora.position.set(3.9, 0.05, -5.8);
      hora.lookAt(0, 1.5, 0);
      this.venusWorld.add(hora);
    }

    // light for the engraved pieces
    this.hemi = new THREE.HemisphereLight('#c7d6c8', '#2a2016', 1.1);
    this.sun = new THREE.DirectionalLight('#ffe7c0', 1.6);
    this.sun.position.set(-3, 6, 2);
    this.root.add(this.hemi, this.sun);

  }

  async start() {
    const { audio, content } = this.ctx;
    audio.playMusic('moonlight', { volume: 0.32, fade: 6 });
    await this.wait(3);

    // The Muses are invoked; then the poem, line by line.
    await this.say(content.MYTHS.prologue.text, { hold: 1 });
    for (const line of content.POEM.stanza) await this.say(line, { hold: 0.5 });
    await this.wait(2);

    // The grove opens onto the sea: Venus rises on her shell, the winds blow her ashore.
    audio.fadeMusic(0.5, 6);
    this.venusWorld.visible = true;
    this.petalWind = 1;
    await this.tween(
      6,
      (k) => {
        this.skyU.dawn.value = k;
        this.seaMat.opacity = k;
        for (const m of this.groveMats) m.opacity = 1 - k;
        this.ctx.scene.fog.color.lerpColors(new THREE.Color('#0c110d'), new THREE.Color('#dfe6dc'), k);
        this.ctx.scene.background.copy(this.ctx.scene.fog.color);
        this.ctx.grain.set({ vignette: lerp(0.45, 0.2, k) });
      },
      ease.inOut,
    );
    this.grove.visible = false;
    this.tween(5, (k) => this.shell.position.setY(lerp(-1.2, 0, k)), ease.out);
    if (this.winds) {
      const w0 = this.winds.position.clone();
      this.tween(7, (k) => this.winds.position.set(lerp(w0.x, -2.4, k), w0.y + Math.sin(k * 3) * 0.15, lerp(w0.z, -4.6, k)), ease.out);
    }
    await this.wait(4);
    this.tween(4, (k) => (this.halo.material.opacity = 0.55 * k));
    await this.wait(5);
    this.next('crib', {}, { color: '#ffffff', out: 3, in: 2.5 });
  }

  update(dt, t) {
    super.update(dt, t);
    // paper-theatre life: figures sway, the Graces turn, Cupid circles
    for (const g of this.figures || []) {
      const u = g.userData;
      g.children[0].rotation.z = Math.sin(t * 0.7 + u.phase) * 0.025;
      if (u.dance) {
        g.position.x = u.base.x + Math.sin(t * 0.35) * 0.25;
        g.position.z = u.base.z + Math.cos(t * 0.35) * 0.15;
        g.lookAt(0, g.position.y, 0);
      }
    }
    if (this.cupid) {
      const a = t * 0.18;
      this.cupid.position.set(Math.sin(a) * 3.2, 3.0 + Math.sin(t * 1.3) * 0.15, -Math.cos(a) * 3.2);
      this.cupid.lookAt(0, this.cupid.position.y, 0);
    }
    if (this.venus) this.venus.rotation.z = Math.sin(t * 0.5) * 0.015;
    if (this.winds) this.winds.rotation.z = Math.sin(t * 0.9) * 0.04;

    // petals: fall slowly, drift; then stream toward Venus
    for (let i = 0; i < this.petalCount; i++) {
      const s = this.petalSeed[i];
      const fall = (s[2] * 6 - t * s[3]) % 6;
      const y = ((fall + 6) % 6) + 0.05;
      let x = (s[0] - 0.5) * 12 + Math.sin(t * 0.5 + i) * 0.3;
      let z = -(s[1] * 10) + 2 + Math.cos(t * 0.4 + i) * 0.3;
      if (this.petalWind) {
        const k = Math.min(1, this.petalWind);
        x = lerp(x, -2.5 + ((t * 0.6 + s[0] * 4) % 4) * 0.7, k * 0.8);
        z = lerp(z, -5.6 + s[1] * 0.8, k * 0.8);
      }
      this.petalPos.set([x, y, z], i * 3);
    }
    this.petals.geometry.attributes.position.needsUpdate = true;
    if (this.motePoints && this.grove.visible) {
      this.motes.forEach(([x, y, z, p], i) => {
        this.motePos.set([x + Math.sin(t * 0.3 + p) * 0.6, y + Math.sin(t * 0.5 + p * 2) * 0.3, z + Math.cos(t * 0.27 + p) * 0.5], i * 3);
      });
      this.motePoints.geometry.attributes.position.needsUpdate = true;
      this.moteMat.size = 0.07 + Math.sin(t * 2.1) * 0.02;
    }
  }
}
