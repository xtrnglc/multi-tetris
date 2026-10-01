import { describe, expect, it } from 'vitest';
import {
  RAYE_CALM_MS,
  RAYE_STRETCH_MS,
  RAYE_TWITCH_MS,
  RAYE_YAWN_MS,
  createRaye,
  stepRaye,
  viewRaye,
  type RayeInput,
  type RayeState,
} from '../src/cats/raye';

const rng = () => 0.5; // stretches on her own after 45 s
const calm: RayeInput = { danger: false, tetris: false, over: false, poked: false };

function run(s: RayeState, input: RayeInput, ms: number): RayeState {
  for (let t = 0; t < ms; t += 16) s = stepRaye(s, input, 16, rng);
  return s;
}

describe('Raye', () => {
  it('sleeps with z z z by default', () => {
    const v = viewRaye(createRaye(rng));
    expect(v.pose).toBe('sleep');
    expect(v.bubble?.text).toBe('z z z');
  });

  it('wakes up while the stack is dangerous and sleeps after 2 calm seconds', () => {
    let s = run(createRaye(rng), { ...calm, danger: true }, 3000);
    expect(s.action).toBe('alert');
    expect(viewRaye(s).bubble).toBeNull();
    s = run(s, calm, RAYE_CALM_MS - 100);
    expect(s.action).toBe('alert');
    s = run(s, calm, 200);
    expect(s.action).toBe('sleep');
  });

  it('twitches an ear at a Tetris without waking up', () => {
    let s = stepRaye(createRaye(rng), { ...calm, tetris: true }, 16, rng);
    expect(s.action).toBe('earTwitch');
    s = run(s, calm, RAYE_TWITCH_MS + 16);
    expect(s.action).toBe('sleep');
  });

  it('keeps one eye open for the whole game-over screen', () => {
    let s = run(createRaye(rng), { ...calm, over: true }, 5000);
    expect(s.action).toBe('oneEye');
    s = stepRaye(s, calm, 16, rng);
    expect(s.action).toBe('sleep');
  });

  it('stretches and yawns when clicked, then goes back to sleep', () => {
    let s = stepRaye(createRaye(rng), { ...calm, poked: true }, 16, rng);
    expect(s.action).toBe('stretch');
    s = run(s, calm, RAYE_STRETCH_MS);
    expect(s.action).toBe('yawn');
    s = run(s, calm, RAYE_YAWN_MS);
    expect(s.action).toBe('sleep');
  });

  it('ignores pokes during the cooldown', () => {
    let s = stepRaye(createRaye(rng), { ...calm, poked: true }, 16, rng);
    s = run(s, calm, RAYE_STRETCH_MS + RAYE_YAWN_MS + 32);
    expect(s.action).toBe('sleep');
    s = stepRaye(s, { ...calm, poked: true }, 16, rng);
    expect(s.action).toBe('sleep');
  });

  it('stretches on her own every 30–60 s', () => {
    const s = run(createRaye(rng), calm, 45_100);
    expect(s.action).toBe('stretch');
  });
});
