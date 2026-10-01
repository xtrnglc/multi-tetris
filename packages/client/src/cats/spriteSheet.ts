import { PALETTES, SPRITES, SPRITE_SIZE, type Grid, type Palette } from './sprites';
import type { CatName, Pose } from './types';

export interface Pixel {
  x: number;
  y: number;
  color: string;
}

export function framePixels(grid: Grid, palette: Palette): Pixel[] {
  const pixels: Pixel[] = [];
  grid.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== '.') pixels.push({ x, y, color: palette[ch] });
    }),
  );
  return pixels;
}

export type Sheet = Record<Pose, HTMLCanvasElement[]>;

/** Draws every pose frame of one cat once, at 1 px per sprite pixel (CSS scales it up). */
export function buildSheet(cat: CatName): Sheet {
  const sheet = {} as Sheet;
  for (const pose of Object.keys(SPRITES) as Pose[]) {
    sheet[pose] = SPRITES[pose].map((grid) => {
      const canvas = document.createElement('canvas');
      canvas.width = SPRITE_SIZE;
      canvas.height = SPRITE_SIZE;
      const ctx = canvas.getContext('2d')!;
      for (const { x, y, color } of framePixels(grid, PALETTES[cat])) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
      return canvas;
    });
  }
  return sheet;
}
