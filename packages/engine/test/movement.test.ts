import { describe, expect, it } from 'vitest';
import { applyInput, createGame, spawnPosition } from '../src/game';
import { NEXT_QUEUE_SIZE } from '../src/constants';
import { gameWith } from './helpers';

describe('createGame', () => {
  it('spawns each player at their own spawn column with a full next queue', () => {
    const s = createGame([11, 22]);
    for (const player of [0, 1] as const) {
      const p = s.players[player];
      expect(p.active).toEqual(spawnPosition(p.active!.type, player));
      expect(p.queue).toHaveLength(NEXT_QUEUE_SIZE);
      expect(p.nextSpawn).toBeNull();
      expect(p.hold).toBeNull();
    }
    expect(s.players[0].active!.x).toBeLessThan(10);
    expect(s.players[1].active!.x).toBeGreaterThanOrEqual(10);
    expect(s.score).toBe(0);
    expect(s.level).toBe(1);
  });

  it('spawns O one column further right', () => {
    expect(spawnPosition('O', 0)).toEqual({ type: 'O', x: 4, y: 0, rot: 0 });
    expect(spawnPosition('T', 1)).toEqual({ type: 'T', x: 13, y: 0, rot: 0 });
  });
});

describe('movement', () => {
  it('moves left and right', () => {
    const s = gameWith({ p0: { type: 'T', x: 5, y: 5, rot: 0 } });
    expect(applyInput(s, 0, 'left').players[0].active!.x).toBe(4);
    expect(applyInput(s, 0, 'right').players[0].active!.x).toBe(6);
  });

  it('stops at walls', () => {
    const s = gameWith({ p0: { type: 'T', x: 0, y: 5, rot: 0 } });
    expect(applyInput(s, 0, 'left').players[0].active!.x).toBe(0);
  });

  it("is blocked by the partner's active piece (co-op rule 1)", () => {
    const s = gameWith({
      p0: { type: 'O', x: 3, y: 10, rot: 0 },
      p1: { type: 'O', x: 5, y: 10, rot: 0 },
    });
    expect(applyInput(s, 0, 'right').players[0].active!.x).toBe(3);
    expect(applyInput(s, 1, 'left').players[1].active!.x).toBe(5);
  });

  it('does not mutate the previous state', () => {
    const s = gameWith({ p0: { type: 'T', x: 5, y: 5, rot: 0 } });
    const before = structuredClone(s);
    applyInput(s, 0, 'left');
    expect(s).toEqual(before);
  });

  it('sets and clears the soft drop flag', () => {
    const s = gameWith({ p0: { type: 'T', x: 5, y: 5, rot: 0 } });
    const on = applyInput(s, 0, 'softDropOn');
    expect(on.players[0].softDrop).toBe(true);
    expect(applyInput(on, 0, 'softDropOff').players[0].softDrop).toBe(false);
  });
});

describe('rotation', () => {
  it('rotates in place when free', () => {
    const s = gameWith({ p0: { type: 'T', x: 5, y: 5, rot: 0 } });
    expect(applyInput(s, 0, 'rotateCW').players[0].active).toEqual({ type: 'T', x: 5, y: 5, rot: 1 });
    expect(applyInput(s, 0, 'rotateCCW').players[0].active).toEqual({ type: 'T', x: 5, y: 5, rot: 3 });
  });

  it('wall-kicks off the left wall', () => {
    const s = gameWith({ p0: { type: 'T', x: -1, y: 5, rot: 1 } });
    expect(applyInput(s, 0, 'rotateCW').players[0].active).toEqual({ type: 'T', x: 0, y: 5, rot: 2 });
  });

  it("treats the partner's piece as solid during kick tests", () => {
    const free = gameWith({ p0: { type: 'T', x: 3, y: 5, rot: 0 } });
    expect(applyInput(free, 0, 'rotateCW').players[0].active!.x).toBe(3);

    const blocked = gameWith({
      p0: { type: 'T', x: 3, y: 5, rot: 0 },
      p1: { type: 'O', x: 4, y: 7, rot: 0 },
    });
    expect(applyInput(blocked, 0, 'rotateCW').players[0].active).toEqual({
      type: 'T',
      x: 2,
      y: 5,
      rot: 1,
    });
  });
});
