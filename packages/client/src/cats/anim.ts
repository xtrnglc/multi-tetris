import { SPRITES } from './sprites';
import type { Pose, Rng } from './types';

/** How long each frame of a pose stays on screen. */
export const FRAME_MS: Record<Pose, number> = {
  sit: 600,
  walk: 140,
  run: 90,
  crouch: 120,
  pounce: 1000,
  flinch: 1000,
  peek: 1000,
  sleep: 900,
  alert: 1000,
  stretch: 500,
  yawn: 1000,
  earTwitch: 1000,
  oneEye: 1000,
};

export function frameIndex(pose: Pose, poseMs: number): number {
  return Math.floor(poseMs / FRAME_MS[pose]) % SPRITES[pose].length;
}

export function between(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}
