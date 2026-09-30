import { describe, expect, it } from 'vitest';
import { createBag, drawPiece } from '../src/bag';
import { PIECE_TYPES, type BagState, type PieceType } from '../src/types';

function draw(bag: BagState, n: number): [PieceType[], BagState] {
  const out: PieceType[] = [];
  let b = bag;
  for (let i = 0; i < n; i++) {
    const [piece, next] = drawPiece(b);
    out.push(piece);
    b = next;
  }
  return [out, b];
}

describe('7-bag', () => {
  it('every group of 7 draws contains each piece exactly once', () => {
    let bag = createBag(42);
    for (let group = 0; group < 5; group++) {
      const [pieces, next] = draw(bag, 7);
      expect([...pieces].sort()).toEqual([...PIECE_TYPES].sort());
      bag = next;
    }
  });

  it('is deterministic for a given seed', () => {
    expect(draw(createBag(1234), 21)[0]).toEqual(draw(createBag(1234), 21)[0]);
  });

  it('differs across seeds', () => {
    expect(draw(createBag(1), 14)[0]).not.toEqual(draw(createBag(2), 14)[0]);
  });

  it('does not mutate the input bag', () => {
    const bag = createBag(9);
    const [, after] = drawPiece(bag);
    drawPiece(after);
    expect(bag).toEqual(createBag(9));
    const snapshot = structuredClone(after);
    drawPiece(after);
    expect(after).toEqual(snapshot);
  });
});
