import { LINES_PER_LEVEL, TICKS_PER_SECOND } from './constants';

export const LINE_SCORES: readonly number[] = [0, 100, 300, 500, 800];

export function levelForLines(lines: number): number {
  return 1 + Math.floor(lines / LINES_PER_LEVEL);
}

/** Rows fallen per tick under normal gravity (Tetris Guideline curve). */
export function gravityPerTick(level: number): number {
  const l = Math.min(level, 20);
  const secondsPerRow = Math.pow(0.8 - (l - 1) * 0.007, l - 1);
  return 1 / (secondsPerRow * TICKS_PER_SECOND);
}
