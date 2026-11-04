import { describe, it, expect } from 'vitest';
import { clampToArea, teleportArc, stepBody, throwVelocity, tapTarget, glideSpeed } from '../src/core/walk.js';
import { wrapLines, paginate, MIN_PAGE_SECONDS } from '../src/core/captions.js';
import * as content from '../src/content.js';

describe('clampToArea', () => {
  const area = { center: [0, 0], radius: 5, blockers: [{ x: 2, z: 0, r: 1 }] };

  it('leaves a point inside alone', () => {
    expect(clampToArea(area, -1, 1)).toEqual([-1, 1]);
  });

  it('pulls a far point back to the edge', () => {
    const [x, z] = clampToArea(area, 0, -50);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(-5);
  });

  it('pushes a point out of a blocker', () => {
    const [x, z] = clampToArea(area, 2.5, 0);
    expect(Math.hypot(x - 2, z)).toBeCloseTo(1);
  });

  it('never leaves you at the exact centre of a blocker', () => {
    const [x, z] = clampToArea(area, 2, 0);
    expect(Math.hypot(x - 2, z)).toBeCloseTo(1);
  });
});

describe('teleportArc', () => {
  it('lands in front of a controller pointing forward and slightly up', () => {
    const { points, landing } = teleportArc([0, 1.2, 0], [0, 0.3, -0.95]);
    expect(landing).not.toBeNull();
    expect(landing[1]).toBeLessThan(-2);
    expect(points.at(-1)[1]).toBe(0);
  });

  it('finds no landing when pointing at the sky', () => {
    expect(teleportArc([0, 1.2, 0], [0, 1, 0], { speed: 40, maxSteps: 8 }).landing).toBeNull();
  });
});

describe('stepBody', () => {
  const body = (o) => ({ x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, radius: 0.1, bounce: 0.4, friction: 3, asleep: false, ...o });

  it('falls, reports the impact, bounces and comes to rest on the floor', () => {
    const b = body();
    let hit = 0;
    for (let i = 0; i < 600 && !b.asleep; i++) hit = Math.max(hit, stepBody(b, 1 / 60));
    expect(hit).toBeGreaterThan(2);
    expect(b.asleep).toBe(true);
    expect(b.y).toBeCloseTo(0.1);
  });

  it('rolls to a stop', () => {
    const b = body({ y: 0.1, vx: 3 });
    for (let i = 0; i < 600 && !b.asleep; i++) stepBody(b, 1 / 60);
    expect(b.asleep).toBe(true);
    expect(b.x).toBeGreaterThan(0.2);
  });

  it('does not move while asleep', () => {
    const b = body({ asleep: true });
    stepBody(b, 1);
    expect(b.y).toBe(1);
  });

  it('bounces off a blocker instead of passing through', () => {
    const b = body({ y: 0.1, x: -1, vx: 4 });
    const env = { blockers: [{ x: 0, z: 0, r: 0.5 }] };
    for (let i = 0; i < 120; i++) stepBody(b, 1 / 60, env);
    expect(b.x).toBeLessThan(-0.5);
  });
});

describe('throwVelocity', () => {
  it('reads the hand’s speed', () => {
    const [vx] = throwVelocity([{ x: 0, y: 0, z: 0, t: 0 }, { x: 0.3, y: 0, z: 0, t: 0.1 }]);
    expect(vx).toBeCloseTo(3);
  });

  it('caps a wild flick', () => {
    const v = throwVelocity([{ x: 0, y: 0, z: 0, t: 0 }, { x: 10, y: 0, z: 0, t: 0.01 }]);
    expect(Math.hypot(...v)).toBeCloseTo(12);
  });
});

describe('subtitles', () => {
  it('never breaks a word or overflows a line', () => {
    for (const line of wrapLines('In the polished bronze she saw a face she had never seen. It was her own. And she, too, became stone.')) {
      expect(line.length).toBeLessThanOrEqual(52);
    }
  });

  it('keeps every page to two lines and long enough to read', () => {
    const long = content.MYTHS.afterlife.elysium;
    const pages = paginate(long);
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) {
      expect(p.lines.length).toBeLessThanOrEqual(2);
      expect(p.seconds).toBeGreaterThanOrEqual(MIN_PAGE_SECONDS);
    }
    expect(pages.flatMap((p) => p.lines).join(' ')).toBe(long);
  });
});

describe('clicking the ground', () => {
  it('goes to a near point', () => {
    expect(tapTarget(0, 0, 1, 2, 4.5)).toEqual([1, 2]);
  });

  it('never takes you further than one reach, however far the click', () => {
    const [x, z] = tapTarget(1, 1, 1, -99, 4.5);
    expect(x).toBeCloseTo(1);
    expect(z).toBeCloseTo(-3.5);
  });

  it('slows down into the last metre, and never stalls', () => {
    expect(glideSpeed(5)).toBeCloseTo(1.8);
    expect(glideSpeed(0.45)).toBeLessThan(1);
    expect(glideSpeed(0.01)).toBeGreaterThan(0);
  });
});
