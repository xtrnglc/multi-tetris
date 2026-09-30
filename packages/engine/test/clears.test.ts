import { describe, expect, it } from 'vitest';
import { applyInput, createGame, tick } from '../src/game';
import { ACTIONS, type GameState, type PlayerId } from '../src/types';
import { fullRowExcept, gameWith, row } from './helpers';

describe('line clears', () => {
  it('clears a double and scores 300 × level plus drop points', () => {
    const s = applyInput(
      gameWith({
        p0: { type: 'O', x: 0, y: 18, rot: 0 },
        rows: { 20: fullRowExcept(0, 1), 21: fullRowExcept(0, 1) },
      }),
      0,
      'hardDrop',
    );
    expect(s.score).toBe(304);
    expect(s.lines).toBe(2);
    expect(s.lastClear).toEqual({ count: 2, tick: 0 });
    expect(s.board[20].every((c) => c === null)).toBe(true);
    expect(s.board[21].every((c) => c === null)).toBe(true);
  });

  it('clears a tetris', () => {
    const s = applyInput(
      gameWith({
        p0: { type: 'I', x: -2, y: 10, rot: 1 },
        rows: {
          18: fullRowExcept(0),
          19: fullRowExcept(0),
          20: fullRowExcept(0),
          21: fullRowExcept(0),
        },
      }),
      0,
      'hardDrop',
    );
    expect(s.score).toBe(816);
    expect(s.lines).toBe(4);
    expect(s.lastClear!.count).toBe(4);
  });

  it('levels up at 20 lines, scoring the clear at the old level', () => {
    const s = gameWith({ p0: { type: 'I', x: -2, y: 18, rot: 1 }, rows: { 21: fullRowExcept(0) } });
    s.lines = 19;
    const after = applyInput(s, 0, 'hardDrop');
    expect(after.lines).toBe(20);
    expect(after.level).toBe(2);
    expect(after.score).toBe(100);
  });

  it('multiplies by the current level', () => {
    const s = gameWith({ p0: { type: 'I', x: -2, y: 18, rot: 1 }, rows: { 21: fullRowExcept(0) } });
    s.lines = 20;
    s.level = 2;
    expect(applyInput(s, 0, 'hardDrop').score).toBe(200);
  });
});

describe('post-clear nudge', () => {
  it("pushes the partner's piece up until it no longer overlaps shifted cells", () => {
    const s = gameWith({
      p0: { type: 'I', x: -2, y: 10, rot: 1 },
      p1: { type: 'O', x: 15, y: 18, rot: 0 },
      rows: {
        17: row([15]),
        20: row([15, 16]),
        21: fullRowExcept(0),
      },
    });
    const after = applyInput(s, 0, 'hardDrop');
    expect(after.lines).toBe(1);
    expect(after.board[18][15]).toBe('Z');
    expect(after.players[1].active).toEqual({ type: 'O', x: 15, y: 16, rot: 0 });
    expect(after.over).toBe(false);
  });
});

describe('determinism', () => {
  function play(): GameState {
    let s = createGame([7, 9]);
    let r = 12345;
    for (let i = 0; i < 3000; i++) {
      r = (Math.imul(r, 1103515245) + 12345) >>> 0;
      if (r % 3 === 0) {
        const player = ((r >>> 4) % 2) as PlayerId;
        s = applyInput(s, player, ACTIONS[(r >>> 8) % ACTIONS.length]);
      }
      s = tick(s);
    }
    return s;
  }

  it('produces identical states for identical inputs', () => {
    expect(play()).toEqual(play());
  });
});
