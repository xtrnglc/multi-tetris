import { describe, expect, it } from 'vitest';
import {
  BUBBLE_MS,
  MAX_CROUCH_MS,
  MAX_POUNCE_MS,
  createMax,
  stepMax,
  viewMax,
  type MaxInput,
  type MaxState,
} from '../src/cats/max';

const rng = () => 0.5;
const calm: MaxInput = {
  width: 500,
  target: null,
  pounceAt: null,
  meow: false,
  reducedMotion: false,
};

function run(s: MaxState, input: MaxInput, ms: number): MaxState {
  for (let t = 0; t < ms; t += 16) s = stepMax(s, input, 16, rng);
  return s;
}

describe('Max', () => {
  it('walks to a nearby target and sits when he arrives', () => {
    let s = stepMax(createMax(100, rng), { ...calm, target: 140 }, 16, rng);
    expect(s.action).toBe('walk');
    expect(s.facing).toBe(1);
    s = run(s, { ...calm, target: 140 }, 1000);
    expect(Math.abs(s.x - 140)).toBeLessThanOrEqual(4);
    expect(s.action).toBe('sit');
  });

  it('runs when the target is far away', () => {
    const s = stepMax(createMax(100, rng), { ...calm, target: 400 }, 16, rng);
    expect(s.action).toBe('run');
  });

  it('turns to face a target on his left', () => {
    const s = stepMax(createMax(300, rng), { ...calm, target: 250 }, 16, rng);
    expect(s.facing).toBe(-1);
  });

  it('never walks past the end of his edge', () => {
    const s = run(createMax(400, rng), { ...calm, target: 900 }, 3000);
    expect(s.x).toBeLessThanOrEqual(500);
  });

  it('stays on the edge when it shrinks', () => {
    const s = stepMax({ ...createMax(480, rng) }, { ...calm, width: 200 }, 16, rng);
    expect(s.x).toBeLessThanOrEqual(200);
  });

  it('crouches, then pounces in an arc to the landing spot', () => {
    let s = stepMax(createMax(100, rng), { ...calm, pounceAt: 300 }, 16, rng);
    expect(s.action).toBe('crouch');
    s = run(s, calm, MAX_CROUCH_MS);
    expect(s.action).toBe('pounce');
    s = run(s, calm, MAX_POUNCE_MS / 2);
    expect(s.y).toBeLessThan(0);
    s = run(s, calm, MAX_POUNCE_MS);
    expect(s.x).toBe(300);
    expect(s.y).toBe(0);
    expect(s.action).not.toBe('pounce');
  });

  it('meows on a line clear and the bubble fades after a second', () => {
    let s = stepMax(createMax(100, rng), { ...calm, meow: true }, 16, rng);
    expect(viewMax(s).bubble?.text).toBe('meow!');
    s = run(s, calm, BUBBLE_MS + 32);
    expect(viewMax(s).bubble).toBeNull();
  });

  it('gives each new meow a new bubble id', () => {
    const first = stepMax(createMax(100, rng), { ...calm, meow: true }, 16, rng);
    const second = stepMax(first, { ...calm, meow: true }, 16, rng);
    expect(second.bubble!.id).not.toBe(first.bubble!.id);
  });

  it('meows on his own every 20–40 s', () => {
    const s = run(createMax(100, rng), calm, 30_100);
    expect(s.bubble?.text).toBe('meow!');
  });

  it('wanders when there is nothing to follow', () => {
    const s = run(createMax(100, rng), calm, 5000);
    expect(s.x).not.toBe(100);
  });

  it('never moves with reduced motion', () => {
    let s = stepMax(
      createMax(100, rng),
      { ...calm, target: 400, pounceAt: 300, reducedMotion: true },
      16,
      rng,
    );
    s = run(s, { ...calm, target: 400, reducedMotion: true }, 5000);
    expect(s.x).toBe(100);
    expect(s.y).toBe(0);
    expect(['sit', 'stretch']).toContain(s.action);
  });
});
