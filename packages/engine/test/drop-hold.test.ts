import { describe, expect, it } from 'vitest';
import { applyInput, ghostPiece, spawnPosition, tick } from '../src/game';
import { gameWith, row } from './helpers';

describe('hard drop', () => {
  it('drops to the floor, scores 2 per cell, and locks immediately', () => {
    const s = applyInput(gameWith({ p0: { type: 'T', x: 3, y: 0, rot: 0 } }), 0, 'hardDrop');
    expect(s.score).toBe(40);
    expect(s.lockCount).toBe(1);
    expect(s.board[21].slice(3, 6)).toEqual(['T', 'T', 'T']);
    expect(s.board[20][4]).toBe('T');
    expect(s.players[0].active).not.toBeNull();
  });

  it("hovers instead of locking when it lands on the partner's active piece", () => {
    const s = applyInput(
      gameWith({
        p0: { type: 'O', x: 3, y: 0, rot: 0 },
        p1: { type: 'O', x: 3, y: 20, rot: 0 },
      }),
      0,
      'hardDrop',
    );
    expect(s.lockCount).toBe(0);
    expect(s.players[0].active).toEqual({ type: 'O', x: 3, y: 18, rot: 0 });
    expect(s.score).toBe(36);
  });
});

describe('ghostPiece', () => {
  it('shows the landing position, stopping on the partner', () => {
    const alone = gameWith({ p0: { type: 'T', x: 3, y: 0, rot: 0 } });
    expect(ghostPiece(alone, 0)).toEqual({ type: 'T', x: 3, y: 20, rot: 0 });
    const shared = gameWith({
      p0: { type: 'O', x: 3, y: 0, rot: 0 },
      p1: { type: 'O', x: 3, y: 20, rot: 0 },
    });
    expect(ghostPiece(shared, 0)!.y).toBe(18);
    expect(ghostPiece(gameWith(), 0)).toBeNull();
  });
});

describe('hold', () => {
  it('stores the active piece and spawns the next one when hold is empty', () => {
    const s = gameWith({ p0: { type: 'T', x: 3, y: 10, rot: 0 } });
    const expectedNext = s.players[0].queue[0];
    const held = applyInput(s, 0, 'hold');
    expect(held.players[0].hold).toBe('T');
    expect(held.players[0].active).toEqual(spawnPosition(expectedNext, 0));
    expect(held.players[0].holdUsed).toBe(true);
  });

  it('only works once per piece', () => {
    const once = applyInput(gameWith({ p0: { type: 'T', x: 3, y: 10, rot: 0 } }), 0, 'hold');
    expect(applyInput(once, 0, 'hold')).toEqual(once);
  });

  it('swaps with the held piece, which respawns in spawn orientation', () => {
    const s = gameWith({ p0: { type: 'T', x: 7, y: 10, rot: 2 } });
    s.players[0].hold = 'I';
    const swapped = applyInput(s, 0, 'hold');
    expect(swapped.players[0].active).toEqual(spawnPosition('I', 0));
    expect(swapped.players[0].hold).toBe('T');
  });

  it('becomes available again after the next lock', () => {
    const held = applyInput(gameWith({ p0: { type: 'T', x: 3, y: 10, rot: 0 } }), 0, 'hold');
    expect(applyInput(held, 0, 'hardDrop').players[0].holdUsed).toBe(false);
  });
});

describe('spawn rules', () => {
  it("defers a spawn blocked by the partner's piece until it moves away", () => {
    let s = gameWith({
      p0: { type: 'T', x: 3, y: 10, rot: 0 },
      p1: { type: 'O', x: 4, y: 0, rot: 0 },
    });
    s = applyInput(s, 0, 'hold');
    expect(s.players[0].active).toBeNull();
    expect(s.players[0].nextSpawn).not.toBeNull();
    s = tick(s);
    expect(s.players[0].active).toBeNull();
    expect(s.over).toBe(false);
    for (let i = 0; i < 3; i++) s = applyInput(s, 1, 'right');
    s = tick(s);
    expect(s.players[0].active).not.toBeNull();
  });

  it('ends the game when locked cells block the spawn (block-out)', () => {
    const s = gameWith({
      p0: { type: 'O', x: 10, y: 20, rot: 0 },
      rows: { 1: row([3, 4, 5, 6]) },
    });
    const over = applyInput(s, 0, 'hardDrop');
    expect(over.over).toBe(true);
    expect(tick(over)).toBe(over);
    expect(applyInput(over, 0, 'left')).toBe(over);
  });
});
