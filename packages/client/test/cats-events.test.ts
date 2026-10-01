import { describe, expect, it } from 'vitest';
import { HIDDEN_ROWS, applyInput, createGame, ghostPiece, tick, type GameState } from '@mt/engine';
import {
  centerColumn,
  dangerLevel,
  initialTracker,
  trackGame,
  type CatEvent,
} from '../src/cats/events';

function feed(...states: GameState[]) {
  let tracker = initialTracker;
  const events: CatEvent[] = [];
  for (const state of states) {
    const result = trackGame(tracker, state);
    tracker = result.tracker;
    events.push(...result.events);
  }
  return { tracker, events };
}

describe('trackGame', () => {
  it('treats the first state as a baseline', () => {
    expect(feed(createGame([1, 2])).events).toEqual([]);
  });

  it('reports a hard drop by either player with its landing column', () => {
    for (const player of [0, 1] as const) {
      const before = createGame([1, 2]);
      const after = applyInput(before, player, 'hardDrop');
      const landing = ghostPiece(before, player)!;
      expect(feed(before, after).events).toEqual([
        { type: 'hardDrop', player, column: centerColumn(landing) },
      ]);
    }
  });

  it('does not count a gravity lock as a hard drop', () => {
    const start = createGame([1, 2]);
    start.players[0].active = { type: 'O', x: 8, y: 20, rot: 0 };
    let before = start;
    for (let i = 0; i < 29; i++) before = tick(before);
    const after = tick(before);
    expect(after.lockCount).toBe(1);
    expect(feed(before, after).events).toEqual([]);
  });

  it('does not mistake a hold for a lock', () => {
    const before = createGame([1, 2]);
    const after = applyInput(applyInput(before, 1, 'hold'), 0, 'hardDrop');
    const drops = feed(before, after).events.filter((e) => e.type === 'hardDrop');
    expect(drops.map((e) => e.type === 'hardDrop' && e.player)).toEqual([0]);
  });

  it('reports clears with their size', () => {
    const before = createGame([1, 2]);
    const single: GameState = { ...before, tick: 5, lines: 1, lastClear: { count: 1, tick: 5 } };
    const tetris: GameState = { ...single, tick: 9, lines: 5, lastClear: { count: 4, tick: 9 } };
    expect(feed(before, single, tetris).events).toEqual([
      { type: 'clear', count: 1 },
      { type: 'clear', count: 4 },
    ]);
  });

  it('never repeats an event when the server confirms a predicted state', () => {
    const before = createGame([1, 2]);
    const predicted = applyInput(before, 0, 'hardDrop');
    const confirmed = structuredClone(predicted);
    const later = { ...structuredClone(predicted), tick: predicted.tick + 2 };
    expect(feed(before, predicted, confirmed, later).events).toHaveLength(1);
  });

  it('starts over without events when a new game begins', () => {
    const old: GameState = { ...createGame([1, 2]), tick: 900, lockCount: 40, lines: 12 };
    const fresh = createGame([3, 4]);
    const { tracker, events } = feed(old, fresh);
    expect(events).toEqual([]);
    expect(trackGame(tracker, applyInput(fresh, 0, 'hardDrop')).events).toHaveLength(1);
  });

  it('resets when the game goes away', () => {
    const { tracker } = feed(createGame([1, 2]));
    expect(trackGame(tracker, null).tracker).toEqual(initialTracker);
  });
});

describe('dangerLevel', () => {
  function withCellAtDepth(depth: number): GameState {
    const s = createGame([1, 2]);
    s.board[HIDDEN_ROWS + depth][0] = 'Z';
    return s;
  }

  it('turns on near the top and off only well below it', () => {
    expect(dangerLevel(createGame([1, 2]), true)).toBe(false);
    expect(dangerLevel(withCellAtDepth(5), false)).toBe(true);
    expect(dangerLevel(withCellAtDepth(6), false)).toBe(false);
    expect(dangerLevel(withCellAtDepth(7), true)).toBe(true);
    expect(dangerLevel(withCellAtDepth(8), true)).toBe(false);
    expect(dangerLevel(null, true)).toBe(false);
  });
});
