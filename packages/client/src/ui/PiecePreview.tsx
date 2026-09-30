import { useEffect, useRef } from 'react';
import { pieceCells, type PieceType } from '@mt/engine';
import { drawBlock } from '../render/board';
import { HOLD_USED_COLOR, PIECE_COLORS } from '../render/colors';

const BOX_COLS = 4;
const BOX_ROWS = 2;

export function PiecePreview({
  type,
  size = 20,
  dim = false,
}: {
  type: PieceType | null;
  size?: number;
  dim?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = BOX_COLS * size * dpr;
    canvas.height = BOX_ROWS * size * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, BOX_COLS * size, BOX_ROWS * size);
    if (!type) return;
    const cells = pieceCells({ type, x: 0, y: 0, rot: 0 });
    const xs = cells.map(([x]) => x);
    const ys = cells.map(([, y]) => y);
    const width = Math.max(...xs) - Math.min(...xs) + 1;
    const height = Math.max(...ys) - Math.min(...ys) + 1;
    const offsetX = ((BOX_COLS - width) * size) / 2 - Math.min(...xs) * size;
    const offsetY = ((BOX_ROWS - height) * size) / 2 - Math.min(...ys) * size;
    for (const [x, y] of cells) {
      drawBlock(
        ctx,
        offsetX + x * size,
        offsetY + y * size,
        size,
        dim ? HOLD_USED_COLOR : PIECE_COLORS[type],
      );
    }
  }, [type, size, dim]);

  return (
    <canvas
      ref={ref}
      className="piece-preview"
      style={{ width: BOX_COLS * size, height: BOX_ROWS * size }}
    />
  );
}
