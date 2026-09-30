import { describe, expect, it } from 'vitest';
import { LINE_SCORES, gravityPerTick, levelForLines } from '../src/scoring';

describe('scoring tables', () => {
  it('uses guideline line scores', () => {
    expect(LINE_SCORES).toEqual([0, 100, 300, 500, 800]);
  });

  it('levels up every 20 lines', () => {
    expect(levelForLines(0)).toBe(1);
    expect(levelForLines(19)).toBe(1);
    expect(levelForLines(20)).toBe(2);
    expect(levelForLines(45)).toBe(3);
  });

  it('falls one row per second at level 1 and speeds up with level', () => {
    expect(gravityPerTick(1)).toBeCloseTo(1 / 60, 10);
    expect(gravityPerTick(2)).toBeCloseTo(1 / (0.793 * 60), 6);
    expect(gravityPerTick(5)).toBeGreaterThan(gravityPerTick(4));
  });

  it('clamps the gravity curve at level 20', () => {
    expect(gravityPerTick(30)).toBe(gravityPerTick(20));
  });
});
