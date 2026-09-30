import { describe, expect, it } from 'vitest';
import { kickOffsets, pieceCells } from '../src/pieces';
import type { Rotation } from '../src/types';

const sorted = (cells: [number, number][]) =>
  [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0]);

describe('pieceCells', () => {
  it('places a spawn-orientation T relative to its box origin', () => {
    expect(sorted(pieceCells({ type: 'T', x: 3, y: 0, rot: 0 }))).toEqual([
      [4, 0],
      [3, 1],
      [4, 1],
      [5, 1],
    ]);
  });

  it('rotates I clockwise into the third column of its box (SRS)', () => {
    expect(sorted(pieceCells({ type: 'I', x: 0, y: 0, rot: 1 }))).toEqual([
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
    ]);
  });

  it('T in state R points right', () => {
    expect(sorted(pieceCells({ type: 'T', x: 0, y: 0, rot: 1 }))).toEqual([
      [1, 0],
      [1, 1],
      [2, 1],
      [1, 2],
    ]);
  });

  it('O occupies the same cells in every rotation', () => {
    const base = sorted(pieceCells({ type: 'O', x: 4, y: 0, rot: 0 }));
    for (const rot of [1, 2, 3] as Rotation[]) {
      expect(sorted(pieceCells({ type: 'O', x: 4, y: 0, rot }))).toEqual(base);
    }
  });
});

describe('kickOffsets', () => {
  it('converts the SRS JLSTZ 0->R table to y-down', () => {
    expect(kickOffsets('T', 0, 1)).toEqual([
      [0, 0],
      [-1, 0],
      [-1, -1],
      [0, 2],
      [-1, 2],
    ]);
  });

  it('uses the I table for I pieces', () => {
    expect(kickOffsets('I', 0, 1)).toEqual([
      [0, 0],
      [-2, 0],
      [1, 0],
      [-2, 1],
      [1, -2],
    ]);
  });

  it('never kicks O', () => {
    expect(kickOffsets('O', 0, 1)).toEqual([[0, 0]]);
  });
});
