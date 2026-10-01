import { BOARD_WIDTH } from '../src/constants';
import { createGame, tick } from '../src/game';
import type { ActivePiece, Cell, GameMode, GameState } from '../src/types';

/**
 * A game with fully controlled pieces: no active pieces unless given, nothing waiting to spawn,
 * and optional board rows (20-char strings, '.' = empty, anything else = locked 'Z').
 */
export function gameWith(
  opts: {
    p0?: ActivePiece;
    p1?: ActivePiece;
    rows?: Record<number, string>;
    mode?: GameMode;
  } = {},
): GameState {
  const state = createGame([1, 2], opts.mode);
  state.players[0].active = opts.p0 ?? null;
  state.players[1].active = opts.p1 ?? null;
  state.players[0].nextSpawn = null;
  state.players[1].nextSpawn = null;
  for (const [y, text] of Object.entries(opts.rows ?? {})) {
    if (text.length !== BOARD_WIDTH) throw new Error(`row ${y} must be ${BOARD_WIDTH} chars`);
    state.board[Number(y)] = [...text].map((c): Cell => (c === '.' ? null : 'Z'));
  }
  return state;
}

export function row(filledCols: number[]): string {
  return Array.from({ length: BOARD_WIDTH }, (_, x) => (filledCols.includes(x) ? 'X' : '.')).join(
    '',
  );
}

export function fullRowExcept(...gaps: number[]): string {
  return Array.from({ length: BOARD_WIDTH }, (_, x) => (gaps.includes(x) ? '.' : 'X')).join('');
}

export function runTicks(state: GameState, n: number): GameState {
  let s = state;
  for (let i = 0; i < n; i++) s = tick(s);
  return s;
}
