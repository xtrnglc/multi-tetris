import { describe, expect, it } from 'vitest';
import { SPRINT_LINES } from '../src/constants';
import { applyInput, createGame, tick } from '../src/game';
import { fullRowExcept, gameWith, row, runTicks } from './helpers';

/** Player 0 holds a vertical I in column 0, resting on the floor above a row missing only column 0. */
function oneLineAway(mode: 'marathon' | 'sprint', lines: number) {
  const s = gameWith({
    mode,
    p0: { type: 'I', x: -2, y: 18, rot: 1 },
    rows: { 21: fullRowExcept(0) },
  });
  s.lines = lines;
  return s;
}

describe('game mode', () => {
  it('defaults to marathon with no result', () => {
    const s = createGame([1, 2]);
    expect(s.mode).toBe('marathon');
    expect(s.result).toBeNull();
  });

  it('creates a sprint game', () => {
    expect(createGame([1, 2], 'sprint').mode).toBe('sprint');
    expect(SPRINT_LINES).toBe(40);
  });
});

describe('sprint', () => {
  it('never levels up, so gravity stays at level 1', () => {
    const after = applyInput(oneLineAway('sprint', 19), 0, 'hardDrop');
    expect(after.lines).toBe(20);
    expect(after.level).toBe(1);
    expect(after.over).toBe(false);
  });

  it('finishes as cleared on the 40th line', () => {
    const after = applyInput(oneLineAway('sprint', 39), 0, 'hardDrop');
    expect(after.lines).toBe(40);
    expect(after.over).toBe(true);
    expect(after.result).toBe('cleared');
  });

  it('finishes on a hard drop without advancing the tick', () => {
    const s = oneLineAway('sprint', 39);
    s.tick = 500;
    const after = applyInput(s, 0, 'hardDrop');
    expect(after.tick).toBe(500);
    expect(tick(after).tick).toBe(500);
  });

  it('counts overshoot past 40 lines', () => {
    const s = gameWith({
      mode: 'sprint',
      p0: { type: 'I', x: -2, y: 10, rot: 1 },
      rows: {
        18: fullRowExcept(0),
        19: fullRowExcept(0),
        20: fullRowExcept(0),
        21: fullRowExcept(0),
      },
    });
    s.lines = 38;
    const after = applyInput(s, 0, 'hardDrop');
    expect(after.lines).toBe(42);
    expect(after.result).toBe('cleared');
  });

  it('finishes on a lock-delay lock at that tick', () => {
    const s = oneLineAway('sprint', 39);
    const after = runTicks(s, 30);
    expect(after.over).toBe(true);
    expect(after.result).toBe('cleared');
    expect(after.tick).toBe(30);
    expect(runTicks(after, 10).tick).toBe(30);
  });

  it('cleared wins over a simultaneous partner top-out', () => {
    // Clearing row 21 shifts the cell at row 0 down into the partner's O piece at the ceiling.
    const s = gameWith({
      mode: 'sprint',
      p0: { type: 'I', x: -2, y: 18, rot: 1 },
      p1: { type: 'O', x: 15, y: 1, rot: 0 },
      rows: { 0: row([15]), 21: fullRowExcept(0) },
    });
    s.lines = 39;
    const after = applyInput(s, 0, 'hardDrop');
    expect(after.over).toBe(true);
    expect(after.result).toBe('cleared');
  });
});

describe('top-out result', () => {
  it('is toppedOut when the partner is pushed above the ceiling', () => {
    const s = gameWith({
      p0: { type: 'I', x: -2, y: 18, rot: 1 },
      p1: { type: 'O', x: 15, y: 1, rot: 0 },
      rows: { 0: row([15]), 21: fullRowExcept(0) },
    });
    const after = applyInput(s, 0, 'hardDrop');
    expect(after.over).toBe(true);
    expect(after.result).toBe('toppedOut');
  });

  it('is toppedOut when a spawn is blocked, in either mode', () => {
    for (const mode of ['marathon', 'sprint'] as const) {
      const s = gameWith({ mode, rows: { 0: row([3, 4, 5, 6]), 1: row([3, 4, 5, 6]) } });
      s.players[0].nextSpawn = 'T';
      const after = tick(s);
      expect(after.over).toBe(true);
      expect(after.result).toBe('toppedOut');
    }
  });
});

describe('marathon', () => {
  it('keeps going past 40 lines and still levels up', () => {
    const after = applyInput(oneLineAway('marathon', 39), 0, 'hardDrop');
    expect(after.lines).toBe(40);
    expect(after.level).toBe(3);
    expect(after.over).toBe(false);
    expect(after.result).toBeNull();
  });
});
