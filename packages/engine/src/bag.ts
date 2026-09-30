import { PIECE_TYPES, type BagState, type PieceType } from './types';

/** mulberry32: returns a float in [0, 1) and the next 32-bit state. */
export function nextRandom(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(next ^ (next >>> 15), next | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, next];
}

export function createBag(seed: number): BagState {
  return { rng: seed >>> 0, remaining: [] };
}

export function drawPiece(bag: BagState): [PieceType, BagState] {
  let rng = bag.rng;
  let remaining = bag.remaining;
  if (remaining.length === 0) {
    const pieces = [...PIECE_TYPES];
    for (let i = pieces.length - 1; i > 0; i--) {
      const [r, next] = nextRandom(rng);
      rng = next;
      const j = Math.floor(r * (i + 1));
      [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }
    remaining = pieces;
  }
  const [piece, ...rest] = remaining;
  return [piece, { rng, remaining: rest }];
}
