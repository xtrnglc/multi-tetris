import { describe, expect, it } from 'vitest';
import { createGame, type GameState } from '@mt/engine';
import { boardDrawList } from '../src/render/drawList';

function world(): GameState {
  const s = createGame([1, 2]);
  s.players[0].active = { type: 'T', x: 3, y: 5, rot: 0 };
  s.players[1].active = { type: 'O', x: 14, y: 1, rot: 0 };
  s.board[21][0] = 'I';
  return s;
}

describe('boardDrawList', () => {
  it('maps locked cells into visible-row coordinates', () => {
    expect(boardDrawList(world(), 0)).toContainEqual({
      col: 0,
      row: 19,
      type: 'I',
      kind: 'locked',
      owner: null,
    });
  });

  it('draws a ghost for my piece only', () => {
    const cells = boardDrawList(world(), 0);
    const ghosts = cells.filter((c) => c.kind === 'ghost');
    expect(ghosts).toHaveLength(4);
    expect(ghosts.every((c) => c.owner === 0)).toBe(true);
    expect(Math.max(...ghosts.map((c) => c.row))).toBe(19);
  });

  it('clips active cells in the hidden rows', () => {
    const p1Cells = boardDrawList(world(), 0).filter((c) => c.kind === 'active' && c.owner === 1);
    expect(p1Cells).toHaveLength(2);
    expect(p1Cells.every((c) => c.row === 0)).toBe(true);
  });

  it('omits the ghost when the piece is already resting', () => {
    const s = world();
    s.players[0].active = { type: 'T', x: 3, y: 20, rot: 0 };
    expect(boardDrawList(s, 0).some((c) => c.kind === 'ghost')).toBe(false);
  });
});
