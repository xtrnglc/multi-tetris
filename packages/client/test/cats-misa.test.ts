import { describe, expect, it } from 'vitest';
import {
  MISA_CURSOR_AWAY_MS,
  MISA_FLINCH_MS,
  createMisa,
  stepMisa,
  viewMisa,
  type MisaInput,
  type MisaState,
} from '../src/cats/misa';

const rng = () => 0.5; // away for 4 s after a Tetris
const calm: MisaInput = {
  exitDistance: 200,
  flinch: false,
  tetris: false,
  cursorNear: false,
  reducedMotion: false,
};

function run(s: MisaState, input: MisaInput, ms: number, seen?: Set<string>): MisaState {
  for (let t = 0; t < ms; t += 16) {
    s = stepMisa(s, input, 16, rng);
    seen?.add(s.action);
  }
  return s;
}

/** Steps until she disappears off screen; returns her state at that moment. */
function untilGone(s: MisaState, input: MisaInput): MisaState {
  for (let t = 0; t < 10_000 && viewMisa(s).visible; t += 16) s = stepMisa(s, input, 16, rng);
  return s;
}

describe('Misa', () => {
  it('flinches on a small clear, then goes back to peeking', () => {
    let s = stepMisa(createMisa(), { ...calm, flinch: true }, 16, rng);
    expect(s.action).toBe('flinch');
    s = run(s, calm, MISA_FLINCH_MS + 16);
    expect(s.action).toBe('peek');
  });

  it('bolts off screen on a Tetris and is back 3–5 s later', () => {
    let s = stepMisa(createMisa(), { ...calm, tetris: true }, 16, rng);
    expect(viewMisa(s).pose).toBe('run');
    s = untilGone(s, calm);
    expect(viewMisa(s).visible).toBe(false);
    s = run(s, calm, 2900);
    expect(viewMisa(s).visible).toBe(false);
    s = run(s, calm, 2200);
    expect(viewMisa(s).visible).toBe(true);
  });

  it('creeps back slowly with one pause, then peeks again', () => {
    let s = untilGone(stepMisa(createMisa(), { ...calm, tetris: true }, 16, rng), calm);
    const seen = new Set<string>();
    s = run(s, calm, 12_000, seen);
    expect(seen.has('return')).toBe(true);
    expect(seen.has('pause')).toBe(true);
    expect(s.action).toBe('peek');
    expect(s.x).toBe(0);
  });

  it('stays away longer if another Tetris happens while she is gone', () => {
    let s = untilGone(stepMisa(createMisa(), { ...calm, tetris: true }, 16, rng), calm);
    s = run(s, calm, 3000);
    s = stepMisa(s, { ...calm, tetris: true }, 16, rng);
    s = run(s, calm, 3500);
    expect(viewMisa(s).visible).toBe(false);
  });

  it('hides from a nearby cursor and peeks again 2 s after it leaves', () => {
    let s = untilGone(stepMisa(createMisa(), { ...calm, cursorNear: true }, 16, rng), {
      ...calm,
      cursorNear: true,
    });
    s = run(s, { ...calm, cursorNear: true }, 5000);
    expect(viewMisa(s).visible).toBe(false);
    s = run(s, calm, MISA_CURSOR_AWAY_MS - 100);
    expect(viewMisa(s).visible).toBe(false);
    s = run(s, calm, 200);
    expect(viewMisa(s).visible).toBe(true);
  });

  it('cowers in place with reduced motion instead of running', () => {
    const rm = { ...calm, reducedMotion: true };
    let s = stepMisa(createMisa(), { ...rm, tetris: true }, 16, rng);
    expect(viewMisa(s).pose).toBe('flinch');
    s = run(s, rm, 3000);
    expect(s.x).toBe(0);
    expect(viewMisa(s).visible).toBe(true);
    s = run(s, rm, 1200);
    expect(s.action).toBe('peek');
  });
});
