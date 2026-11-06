import { describe, it, expect } from 'vitest';
import { curlFromButtons, curlFromFingers } from '../src/core/PlayerHands.js';

describe('how closed your hand is', () => {
  it('rests a little open, and closes with the grip', () => {
    expect(curlFromButtons(0, 0)).toBeCloseTo(0.12);
    expect(curlFromButtons(0, 1)).toBeCloseTo(0.9);
  });

  it('closes less with the trigger than with the grip', () => {
    expect(curlFromButtons(1, 0)).toBeLessThan(curlFromButtons(0, 1));
    expect(curlFromButtons(1, 0)).toBeGreaterThan(curlFromButtons(0, 0));
  });

  it('reads an open hand and a fist from the fingertips', () => {
    expect(curlFromFingers(0.19)).toBe(0);
    expect(curlFromFingers(0.08)).toBe(1);
    expect(curlFromFingers(0.13)).toBeGreaterThan(0.2);
    expect(curlFromFingers(0.13)).toBeLessThan(0.8);
  });
});
