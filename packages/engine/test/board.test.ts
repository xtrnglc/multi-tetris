import { describe, expect, it } from 'vitest';
import { clearFullRows, collidesWithBoard, createBoard, piecesOverlap } from '../src/board';
import { BOARD_HEIGHT, BOARD_WIDTH } from '../src/constants';

describe('createBoard', () => {
  it('is 22 rows of 20 empty cells', () => {
    const board = createBoard();
    expect(board).toHaveLength(BOARD_HEIGHT);
    for (const row of board) expect(row).toEqual(Array(BOARD_WIDTH).fill(null));
  });
});

describe('collidesWithBoard', () => {
  const board = createBoard();
  it('is false for a free position', () => {
    expect(collidesWithBoard(board, { type: 'T', x: 3, y: 0, rot: 0 })).toBe(false);
  });
  it('detects the left and right walls', () => {
    expect(collidesWithBoard(board, { type: 'T', x: -1, y: 5, rot: 0 })).toBe(true);
    expect(collidesWithBoard(board, { type: 'T', x: 18, y: 5, rot: 0 })).toBe(true);
    expect(collidesWithBoard(board, { type: 'T', x: 17, y: 5, rot: 0 })).toBe(false);
  });
  it('detects the floor and the ceiling', () => {
    expect(collidesWithBoard(board, { type: 'T', x: 3, y: 20, rot: 0 })).toBe(false);
    expect(collidesWithBoard(board, { type: 'T', x: 3, y: 21, rot: 0 })).toBe(true);
    expect(collidesWithBoard(board, { type: 'T', x: 3, y: -1, rot: 0 })).toBe(true);
  });
  it('detects occupied cells', () => {
    const filled = createBoard();
    filled[1][4] = 'Z';
    expect(collidesWithBoard(filled, { type: 'T', x: 3, y: 0, rot: 0 })).toBe(true);
  });
});

describe('piecesOverlap', () => {
  it('detects shared cells only', () => {
    const a = { type: 'O' as const, x: 4, y: 4, rot: 0 as const };
    expect(piecesOverlap(a, { type: 'O', x: 5, y: 5, rot: 0 })).toBe(true);
    expect(piecesOverlap(a, { type: 'O', x: 6, y: 4, rot: 0 })).toBe(false);
  });
});

describe('clearFullRows', () => {
  it('removes full rows, shifts rows above down, and does not mutate the input', () => {
    const board = createBoard();
    board[21] = Array(BOARD_WIDTH).fill('I');
    board[20][7] = 'T';
    const before = structuredClone(board);
    const { board: next, cleared } = clearFullRows(board);
    expect(cleared).toBe(1);
    expect(next[21][7]).toBe('T');
    expect(next[21].filter((c) => c !== null)).toHaveLength(1);
    expect(next[0]).toEqual(Array(BOARD_WIDTH).fill(null));
    expect(next).toHaveLength(BOARD_HEIGHT);
    expect(board).toEqual(before);
  });

  it('reports zero when nothing is full', () => {
    expect(clearFullRows(createBoard()).cleared).toBe(0);
  });
});
