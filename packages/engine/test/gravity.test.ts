import { describe, expect, it } from 'vitest';
import { applyInput, tick } from '../src/game';
import { gameWith, runTicks } from './helpers';

describe('gravity', () => {
  it('drops one row per second at level 1', () => {
    const s = gameWith({ p0: { type: 'T', x: 3, y: 2, rot: 0 } });
    expect(runTicks(s, 59).players[0].active!.y).toBe(2);
    expect(runTicks(s, 60).players[0].active!.y).toBe(3);
  });

  it('soft drop falls 20x faster and scores 1 per row', () => {
    const s = applyInput(gameWith({ p0: { type: 'T', x: 3, y: 2, rot: 0 } }), 0, 'softDropOn');
    const after = runTicks(s, 30);
    expect(after.players[0].active!.y).toBe(12);
    expect(after.score).toBe(10);
  });

  it('advances the tick counter and does not mutate the previous state', () => {
    const s = gameWith({ p0: { type: 'T', x: 3, y: 2, rot: 0 } });
    const before = structuredClone(s);
    const next = tick(s);
    expect(next.tick).toBe(1);
    expect(s).toEqual(before);
  });
});

describe('lock delay', () => {
  it('locks after 30 ticks resting on the floor, then spawns the next piece', () => {
    const s = gameWith({ p0: { type: 'O', x: 8, y: 20, rot: 0 } });
    const almost = runTicks(s, 29);
    expect(almost.lockCount).toBe(0);
    const locked = tick(almost);
    expect(locked.lockCount).toBe(1);
    expect(locked.board[21][8]).toBe('O');
    expect(locked.board[20][9]).toBe('O');
    expect(locked.players[0].active!.y).toBe(0);
  });

  it('resets on move/rotate while grounded, at most 15 times', () => {
    let s = gameWith({ p0: { type: 'O', x: 8, y: 20, rot: 0 } });
    for (let i = 0; i < 15; i++) {
      s = runTicks(s, 20);
      s = applyInput(s, 0, i % 2 === 0 ? 'left' : 'right');
    }
    expect(s.lockCount).toBe(0);
    s = runTicks(s, 20);
    s = applyInput(s, 0, 'left'); // 16th move: no reset
    s = runTicks(s, 9);
    expect(s.lockCount).toBe(0);
    s = tick(s);
    expect(s.lockCount).toBe(1);
  });
});

describe("hover rule (resting on the partner's active piece)", () => {
  it('never runs the lock timer while resting only on the partner', () => {
    let s = gameWith({
      p0: { type: 'O', x: 8, y: 18, rot: 0 },
      p1: { type: 'O', x: 8, y: 20, rot: 0 },
    });
    s = runTicks(s, 29);
    expect(s.players[0].lockTimer).toBe(0);
    expect(s.players[1].lockTimer).toBe(29);
    s = tick(s); // partner locks underneath
    expect(s.lockCount).toBe(1);
    expect(s.players[0].active).toEqual({ type: 'O', x: 8, y: 18, rot: 0 });
    s = runTicks(s, 29);
    expect(s.lockCount).toBe(1);
    s = tick(s); // now resting on locked cells, so it locks after 30 ticks
    expect(s.lockCount).toBe(2);
  });

  it('resumes falling when the partner moves away', () => {
    let s = gameWith({
      p0: { type: 'O', x: 8, y: 18, rot: 0 },
      p1: { type: 'O', x: 8, y: 20, rot: 0 },
    });
    s = applyInput(s, 1, 'right');
    s = applyInput(s, 1, 'right');
    s = runTicks(s, 60);
    expect(s.players[0].active!.y).toBe(19);
  });
});
