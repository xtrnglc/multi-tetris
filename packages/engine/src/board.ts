import { BOARD_HEIGHT, BOARD_WIDTH } from './constants';
import { pieceCells } from './pieces';
import type { ActivePiece, Board, Cell } from './types';

function emptyRow(): Cell[] {
  return Array<Cell>(BOARD_WIDTH).fill(null);
}

export function createBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, emptyRow);
}

/** True if the piece is outside the well or overlaps a locked cell. */
export function collidesWithBoard(board: Board, piece: ActivePiece): boolean {
  return pieceCells(piece).some(
    ([x, y]) => x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_HEIGHT || board[y][x] !== null,
  );
}

export function piecesOverlap(a: ActivePiece, b: ActivePiece): boolean {
  const occupied = new Set(pieceCells(a).map(([x, y]) => `${x},${y}`));
  return pieceCells(b).some(([x, y]) => occupied.has(`${x},${y}`));
}

export function clearFullRows(board: Board): { board: Board; cleared: number } {
  const kept = board.filter((row) => row.some((cell) => cell === null));
  const cleared = board.length - kept.length;
  if (cleared === 0) return { board, cleared: 0 };
  return {
    board: [...Array.from({ length: cleared }, emptyRow), ...kept.map((row) => [...row])],
    cleared,
  };
}
