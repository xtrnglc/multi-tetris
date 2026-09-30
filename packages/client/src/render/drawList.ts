import { HIDDEN_ROWS, ghostPiece, pieceCells, type GameState, type PieceType, type PlayerId } from '@mt/engine';

export interface DrawCell {
  col: number;
  /** Row within the visible area (0 = top visible row). */
  row: number;
  type: PieceType;
  kind: 'locked' | 'ghost' | 'active';
  owner: PlayerId | null;
}

/** Everything to paint on the well, in back-to-front order. */
export function boardDrawList(state: GameState, me: PlayerId): DrawCell[] {
  const cells: DrawCell[] = [];
  state.board.forEach((rowCells, y) => {
    if (y < HIDDEN_ROWS) return;
    rowCells.forEach((type, x) => {
      if (type) cells.push({ col: x, row: y - HIDDEN_ROWS, type, kind: 'locked', owner: null });
    });
  });

  const mine = state.players[me].active;
  const ghost = ghostPiece(state, me);
  if (mine && ghost && ghost.y !== mine.y) {
    for (const [x, y] of pieceCells(ghost)) {
      if (y >= HIDDEN_ROWS) cells.push({ col: x, row: y - HIDDEN_ROWS, type: ghost.type, kind: 'ghost', owner: me });
    }
  }

  for (const owner of [0, 1] as const) {
    const piece = state.players[owner].active;
    if (!piece) continue;
    for (const [x, y] of pieceCells(piece)) {
      if (y >= HIDDEN_ROWS) cells.push({ col: x, row: y - HIDDEN_ROWS, type: piece.type, kind: 'active', owner });
    }
  }
  return cells;
}
