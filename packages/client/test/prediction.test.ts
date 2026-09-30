import { describe, expect, it } from 'vitest';
import { applyInput, createGame, type GameState } from '@mt/engine';
import { Predictor } from '../src/net/prediction';

function world(partnerX = 14): GameState {
  const s = createGame([1, 2]);
  s.players[0].active = { type: 'T', x: 4, y: 5, rot: 0 };
  s.players[1].active = { type: 'O', x: partnerX, y: 5, rot: 0 };
  return s;
}

describe('Predictor', () => {
  it('applies local input immediately and numbers inputs from 1', () => {
    const p = new Predictor(0);
    p.snapshot(world(), 0);
    expect(p.input('left')).toBe(1);
    expect(p.state!.players[0].active!.x).toBe(3);
  });

  it('replays unacknowledged inputs on top of each snapshot', () => {
    const p = new Predictor(0);
    p.snapshot(world(), 0);
    p.input('left');
    p.input('left');
    expect(p.snapshot(world(), 0).players[0].active!.x).toBe(2);
  });

  it('drops inputs the server has acknowledged', () => {
    const p = new Predictor(0);
    const server = world();
    p.snapshot(server, 0);
    p.input('left');
    const acked = applyInput(server, 0, 'left');
    expect(p.snapshot(acked, 1).players[0].active!.x).toBe(3);
  });

  it("snaps to the server when the partner's piece invalidated the prediction", () => {
    const p = new Predictor(0);
    p.snapshot(world(), 0);
    p.input('right');
    expect(p.state!.players[0].active!.x).toBe(5);
    const server = applyInput(world(7), 0, 'right'); // blocked on the server
    expect(p.snapshot(server, 1).players[0].active!.x).toBe(4);
  });

  it('returns seq numbers even before the first snapshot', () => {
    const p = new Predictor(1);
    expect(p.input('hold')).toBe(1);
    expect(p.state).toBeNull();
  });

  it('clearPending forgets unacknowledged inputs', () => {
    const p = new Predictor(0);
    p.snapshot(world(), 0);
    p.input('left');
    p.clearPending();
    expect(p.snapshot(world(), 0).players[0].active!.x).toBe(4);
  });
});
