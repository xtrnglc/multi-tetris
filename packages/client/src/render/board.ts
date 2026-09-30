import { BOARD_WIDTH, VISIBLE_ROWS, type GameState, type PlayerId } from '@mt/engine';
import { GRID_LINE, PIECE_COLORS, PLAYER_ACCENTS, WELL_BACKGROUND } from './colors';
import { boardDrawList, type DrawCell } from './drawList';

export const CELL = 28;
export const WELL_WIDTH = BOARD_WIDTH * CELL;
export const WELL_HEIGHT = VISIBLE_ROWS * CELL;

export function drawBoard(ctx: CanvasRenderingContext2D, state: GameState, me: PlayerId): void {
  ctx.fillStyle = WELL_BACKGROUND;
  ctx.fillRect(0, 0, WELL_WIDTH, WELL_HEIGHT);

  ctx.strokeStyle = GRID_LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < BOARD_WIDTH; x++) {
    ctx.moveTo(x * CELL + 0.5, 0);
    ctx.lineTo(x * CELL + 0.5, WELL_HEIGHT);
  }
  for (let y = 1; y < VISIBLE_ROWS; y++) {
    ctx.moveTo(0, y * CELL + 0.5);
    ctx.lineTo(WELL_WIDTH, y * CELL + 0.5);
  }
  ctx.stroke();

  for (const cell of boardDrawList(state, me)) drawCell(ctx, cell);
}

export function drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
  const bevel = Math.max(2, Math.round(size / 9));
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.fillRect(x + 1, y + 1, size - 2, bevel);
  ctx.fillRect(x + 1, y + 1, bevel, size - 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.fillRect(x + 1, y + size - 1 - bevel, size - 2, bevel);
  ctx.fillRect(x + size - 1 - bevel, y + 1, bevel, size - 2);
}

function drawCell(ctx: CanvasRenderingContext2D, cell: DrawCell): void {
  const x = cell.col * CELL;
  const y = cell.row * CELL;
  const color = PIECE_COLORS[cell.type];

  if (cell.kind === 'ghost') {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 3, y + 3, CELL - 6, CELL - 6);
    ctx.restore();
    return;
  }

  if (cell.kind === 'active' && cell.owner !== null) {
    const accent = PLAYER_ACCENTS[cell.owner];
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 14;
    drawBlock(ctx, x, y, CELL, color);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
    ctx.restore();
    return;
  }

  drawBlock(ctx, x, y, CELL, color);
}
