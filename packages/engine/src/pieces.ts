import type { ActivePiece, PieceType, Rotation } from './types';

type Offset = [number, number];

/** Spawn-orientation cells as [dx, dy] within an n×n box (SRS, y-down). */
const SPAWN_SHAPES: Record<PieceType, { size: number; cells: Offset[] }> = {
  I: {
    size: 4,
    cells: [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
    ],
  },
  J: {
    size: 3,
    cells: [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
  },
  L: {
    size: 3,
    cells: [
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
  },
  O: {
    size: 2,
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
  },
  S: {
    size: 3,
    cells: [
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
    ],
  },
  T: {
    size: 3,
    cells: [
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
  },
  Z: {
    size: 3,
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ],
  },
};

function rotateClockwise(cells: Offset[], size: number): Offset[] {
  return cells.map(([x, y]): Offset => [size - 1 - y, x]);
}

const SHAPES = Object.fromEntries(
  Object.entries(SPAWN_SHAPES).map(([type, { size, cells }]) => {
    const rotations: Offset[][] = [cells];
    for (let r = 1; r < 4; r++) rotations.push(rotateClockwise(rotations[r - 1], size));
    return [type, rotations];
  }),
) as Record<PieceType, Offset[][]>;

export function pieceCells(piece: ActivePiece): [number, number][] {
  return SHAPES[piece.type][piece.rot].map(([dx, dy]): Offset => [piece.x + dx, piece.y + dy]);
}

// SRS kick tables exactly as published (y-up). kickOffsets() negates y for our y-down board.
const JLSTZ_KICKS: Record<string, Offset[]> = {
  '0>1': [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ],
  '1>0': [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ],
  '1>2': [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ],
  '2>1': [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ],
  '2>3': [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ],
  '3>2': [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ],
  '3>0': [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ],
  '0>3': [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ],
};

const I_KICKS: Record<string, Offset[]> = {
  '0>1': [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, -1],
    [1, 2],
  ],
  '1>0': [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, 1],
    [-1, -2],
  ],
  '1>2': [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, 2],
    [2, -1],
  ],
  '2>1': [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, -2],
    [-2, 1],
  ],
  '2>3': [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, 1],
    [-1, -2],
  ],
  '3>2': [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, -1],
    [1, 2],
  ],
  '3>0': [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, -2],
    [-2, 1],
  ],
  '0>3': [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, 2],
    [2, -1],
  ],
};

/** Kick offsets [dx, dy] (y-down) to try, in order, when rotating `from` → `to`. */
export function kickOffsets(type: PieceType, from: Rotation, to: Rotation): Offset[] {
  if (type === 'O') return [[0, 0]];
  const table = type === 'I' ? I_KICKS : JLSTZ_KICKS;
  return table[`${from}>${to}`].map(([x, y]): Offset => [x, y === 0 ? 0 : -y]);
}
