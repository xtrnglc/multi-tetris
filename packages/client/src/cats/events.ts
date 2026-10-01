import {
  BOARD_HEIGHT,
  HIDDEN_ROWS,
  ghostPiece,
  pieceCells,
  type ActivePiece,
  type GameState,
  type PlayerId,
} from '@mt/engine';

export type CatEvent =
  { type: 'clear'; count: number } | { type: 'hardDrop'; player: PlayerId; column: number };

/** Gravity and soft drop never move a piece this far between two consecutive states. */
export const HARD_DROP_MIN_ROWS = 3;
/** Danger turns on when a locked cell is in the top N visible rows... */
export const DANGER_ON_ROWS = 6;
/** ...and off only once no locked cell is in the top N visible rows. */
export const DANGER_OFF_ROWS = 8;

export interface EventTracker {
  prev: GameState | null;
  /** Highest lock count and line total seen, so reconciled snapshots never replay events. */
  lockCount: number;
  lines: number;
}

export const initialTracker: EventTracker = { prev: null, lockCount: 0, lines: 0 };

export function trackGame(
  tracker: EventTracker,
  next: GameState | null,
): { tracker: EventTracker; events: CatEvent[] } {
  if (!next) return { tracker: initialTracker, events: [] };
  const prev = tracker.prev;
  if (!prev || next.tick < prev.tick) {
    // First state of a game, or a new game after Play again: baseline only.
    return { tracker: { prev: next, lockCount: next.lockCount, lines: next.lines }, events: [] };
  }

  const events: CatEvent[] = [];
  if (next.lockCount > tracker.lockCount) {
    for (const player of [0, 1] as const) {
      const column = hardDropColumn(prev, next, player);
      if (column !== null) events.push({ type: 'hardDrop', player, column });
    }
  }
  if (next.lines > tracker.lines) {
    events.push({ type: 'clear', count: next.lastClear?.count ?? next.lines - tracker.lines });
  }
  return {
    tracker: {
      prev: next,
      lockCount: Math.max(tracker.lockCount, next.lockCount),
      lines: Math.max(tracker.lines, next.lines),
    },
    events,
  };
}

/** Landing column if `player` hard-dropped between the two states, else null. */
function hardDropColumn(prev: GameState, next: GameState, player: PlayerId): number | null {
  const before = prev.players[player];
  const after = next.players[player];
  if (!before.active) return null;
  // A lock always takes the next piece from the queue; a hold that takes from the queue also fills the hold slot.
  const locked = before.queue.join() !== after.queue.join() && before.hold === after.hold;
  if (!locked) return null;
  const landing = ghostPiece(prev, player);
  if (!landing || landing.y - before.active.y < HARD_DROP_MIN_ROWS) return null;
  return centerColumn(landing);
}

export function centerColumn(piece: ActivePiece): number {
  const xs = pieceCells(piece).map(([x]) => x);
  return (Math.min(...xs) + Math.max(...xs) + 1) / 2;
}

/** Rows from the top of the visible well to the highest locked cell (negative if in the hidden rows). */
function stackDepth(state: GameState): number | null {
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    if (state.board[y].some((cell) => cell !== null)) return y - HIDDEN_ROWS;
  }
  return null;
}

export function dangerLevel(state: GameState | null, wasOn: boolean): boolean {
  if (!state) return false;
  const depth = stackDepth(state);
  if (depth === null || depth >= DANGER_OFF_ROWS) return false;
  if (depth < DANGER_ON_ROWS) return true;
  return wasOn;
}
