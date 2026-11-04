// The arithmetic of a zoetrope, kept apart so that it can be tested.
//
// No strobe: a real zoetrope flashes, which is uncomfortable and unsafe for some people. Here a band of N figures,
// each one pose further on than the last, turns by exactly 360/N degrees at each tick. Whatever stands in front of you
// is always a figure in the next pose, in the same place: it appears to stay still and come alive.

export const TAU = Math.PI * 2;
export const TICK_HZ = 14; // the speed at which the eye takes it for movement

/** The turn of the band after `tick` ticks: always a whole number of slots. */
export function bandAngle(tick, n) {
  return (tick / n) * TAU;
}

/** Which sector of `count` faces you, for a wheel turned by `rot`. Sector i faces you at rot = -i * step. */
export function sectorAt(rot, count) {
  const i = Math.round(-rot / (TAU / count));
  return ((i % count) + count) % count;
}

/** The wheel's nearest position with sector `i` in front, so that it never takes the long way round. */
export function rotFor(i, rot, count) {
  const step = TAU / count;
  const target = -i * step;
  return target + Math.round((rot - target) / TAU) * TAU;
}

/**
 * Pose i of n of a figure, as a paper puppet can move. x and y are in units of the figure's height;
 * rot in radians. Every pose loops: pose n is pose 0.
 */
export function poseAt(kind, i, n) {
  const t = i / n;
  const a = t * TAU;
  switch (kind) {
    case 'walk': // two steps to the loop
      return { x: Math.sin(a * 2) * 0.03, y: Math.abs(Math.sin(a * 2)) * 0.07, rot: Math.sin(a * 2) * 0.035, scale: 1 };
    case 'fly': // up towards the sun, and down
      return { x: Math.cos(a) * 0.05, y: 0.05 + Math.sin(a) * 0.14, rot: Math.sin(a) * 0.28, scale: 1 };
    case 'swim': // a long swaying, with the hips
      return { x: Math.sin(a) * 0.06, y: Math.sin(a * 2) * 0.03, rot: Math.sin(a) * 0.14, scale: 1 };
    case 'tremble':
      return { x: Math.sin(a * 6) * 0.012, y: 0, rot: Math.sin(a * 5) * 0.03, scale: 1 + Math.sin(a) * 0.05 };
    case 'pulse': // something that breathes
      return { x: 0, y: Math.sin(a) * 0.02, rot: 0, scale: 1 + Math.sin(a) * 0.09 };
    case 'sway':
    default:
      return { x: Math.sin(a) * 0.025, y: Math.abs(Math.cos(a)) * 0.02, rot: Math.sin(a) * 0.08, scale: 1 };
  }
}
