// Pure maths for walking and for loose objects (no three.js, so the tests can run it).

/**
 * Keep a point inside a scene's walkable area.
 * area: { center: [x, z], radius, blockers: [{ x, z, r }] }
 * Returns [x, z]: inside the circle and outside every blocker.
 */
export function clampToArea(area, x, z) {
  const [cx, cz] = area.center || [0, 0];
  let dx = x - cx;
  let dz = z - cz;
  const d = Math.hypot(dx, dz);
  if (d > area.radius) {
    dx *= area.radius / d;
    dz *= area.radius / d;
  }
  let px = cx + dx;
  let pz = cz + dz;
  for (const b of area.blockers || []) {
    const ox = px - b.x;
    const oz = pz - b.z;
    const od = Math.hypot(ox, oz);
    if (od < b.r) {
      // dead centre: push toward the viewer's side (+z), never leave them inside
      const k = od > 1e-5 ? b.r / od : 0;
      px = b.x + (od > 1e-5 ? ox * k : 0);
      pz = b.z + (od > 1e-5 ? oz * k : b.r);
    }
  }
  return [px, pz];
}

/**
 * The teleport arc: a thrown point under gravity, until it meets the floor.
 * Returns { points: [[x, y, z], ...], landing: [x, z] | null }.
 */
export function teleportArc(origin, dir, { speed = 7, gravity = 9.8, floorY = 0, step = 0.05, maxSteps = 48 } = {}) {
  const points = [[origin[0], origin[1], origin[2]]];
  let [x, y, z] = origin;
  let vx = dir[0] * speed;
  let vy = dir[1] * speed;
  let vz = dir[2] * speed;
  for (let i = 0; i < maxSteps; i++) {
    const nx = x + vx * step;
    const ny = y + vy * step;
    const nz = z + vz * step;
    vy -= gravity * step;
    if (ny <= floorY) {
      const k = (y - floorY) / Math.max(1e-6, y - ny);
      const lx = x + (nx - x) * k;
      const lz = z + (nz - z) * k;
      points.push([lx, floorY, lz]);
      return { points, landing: [lx, lz] };
    }
    x = nx;
    y = ny;
    z = nz;
    points.push([x, y, z]);
  }
  return { points, landing: null };
}

/**
 * One physics step for a loose sphere: gravity, floor bounce, rolling friction, round blockers.
 * body: { x, y, z, vx, vy, vz, radius, bounce, friction, asleep }
 * env: { floorY, gravity, blockers }
 * Returns the speed of an impact this step (0 if none).
 */
export function stepBody(b, dt, env = {}) {
  if (b.asleep) return 0;
  const floor = (env.floorY ?? 0) + b.radius;
  const g = env.gravity ?? 9.8;
  let impact = 0;

  b.vy -= g * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;

  for (const o of env.blockers || []) {
    const dx = b.x - o.x;
    const dz = b.z - o.z;
    const d = Math.hypot(dx, dz);
    const min = o.r + b.radius;
    if (d < min && d > 1e-5 && b.y < (o.top ?? Infinity)) {
      const nx = dx / d;
      const nz = dz / d;
      b.x = o.x + nx * min;
      b.z = o.z + nz * min;
      const vn = b.vx * nx + b.vz * nz;
      if (vn < 0) {
        impact = Math.max(impact, -vn);
        b.vx -= (1 + b.bounce) * vn * nx;
        b.vz -= (1 + b.bounce) * vn * nz;
      }
    }
  }

  b.grounded = false;
  if (b.y <= floor) {
    b.y = floor;
    if (b.vy < -0.6) {
      impact = Math.max(impact, -b.vy);
      b.vy = -b.vy * b.bounce;
    } else {
      b.vy = 0;
      b.grounded = true;
      const f = Math.exp(-b.friction * dt);
      b.vx *= f;
      b.vz *= f;
      if (Math.hypot(b.vx, b.vz) < 0.03) {
        b.vx = b.vz = 0;
        b.asleep = true;
      }
    }
  }
  return impact;
}

/** Average velocity over recent hand samples [{ x, y, z, t }], capped so a flick can't launch things to orbit. */
export function throwVelocity(samples, max = 12) {
  if (samples.length < 2) return [0, 0, 0];
  const a = samples[0];
  const b = samples[samples.length - 1];
  const dt = Math.max(1e-3, b.t - a.t);
  const v = [(b.x - a.x) / dt, (b.y - a.y) / dt, (b.z - a.z) / dt];
  const s = Math.hypot(...v);
  return s > max ? v.map((c) => (c * max) / s) : v;
}

/** Where one click takes you: toward the point, but no further than `reach`. */
export function tapTarget(hx, hz, x, z, reach) {
  const dx = x - hx;
  const dz = z - hz;
  const d = Math.hypot(dx, dz);
  if (d <= reach) return [x, z];
  return [hx + (dx / d) * reach, hz + (dz / d) * reach];
}

/** Gliding to a clicked point: walking pace, slowing into the last metre so that you arrive, not brake. */
export function glideSpeed(remaining, pace = 1.8, slowFrom = 0.9) {
  return Math.max(0.35, pace * Math.min(1, remaining / slowFrom));
}
