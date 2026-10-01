import { between } from './anim';
import type { CatView, Rng } from './types';

export interface RayeInput {
  /** The stack is near the top (level). */
  danger: boolean;
  /** A Tetris happened this step. */
  tetris: boolean;
  /** The game is over (level). */
  over: boolean;
  /** Someone clicked her this step. */
  poked: boolean;
}

type RayeAction = 'sleep' | 'alert' | 'stretch' | 'yawn' | 'earTwitch' | 'oneEye';

export interface RayeState {
  action: RayeAction;
  actionMs: number;
  /** Time since danger ended, while alert. */
  calmMs: number;
  /** Time until her next stretch on her own. */
  stretchMs: number;
  /** Time until a click can wake her again. */
  cooldownMs: number;
}

export const RAYE_CALM_MS = 2000;
export const RAYE_TWITCH_MS = 400;
export const RAYE_STRETCH_MS = 1200;
export const RAYE_YAWN_MS = 800;
export const RAYE_POKE_COOLDOWN_MS = 4000;

export function createRaye(rng: Rng): RayeState {
  return {
    action: 'sleep',
    actionMs: 0,
    calmMs: 0,
    stretchMs: between(rng, 30_000, 60_000),
    cooldownMs: 0,
  };
}

function setAction(s: RayeState, action: RayeAction): RayeState {
  return { ...s, action, actionMs: 0 };
}

export function stepRaye(prev: RayeState, input: RayeInput, dtMs: number, rng: Rng): RayeState {
  const s: RayeState = {
    ...prev,
    actionMs: prev.actionMs + dtMs,
    cooldownMs: Math.max(0, prev.cooldownMs - dtMs),
  };

  if (input.over) return s.action === 'oneEye' ? s : setAction(s, 'oneEye');
  if (s.action === 'oneEye') return setAction(s, 'sleep');
  if (input.danger && s.action !== 'alert') return { ...setAction(s, 'alert'), calmMs: 0 };

  switch (s.action) {
    case 'alert':
      if (input.danger) return { ...s, calmMs: 0 };
      s.calmMs += dtMs;
      return s.calmMs >= RAYE_CALM_MS ? setAction(s, 'sleep') : s;
    case 'earTwitch':
      return s.actionMs >= RAYE_TWITCH_MS ? setAction(s, 'sleep') : s;
    case 'stretch':
      return s.actionMs >= RAYE_STRETCH_MS ? setAction(s, 'yawn') : s;
    case 'yawn':
      return s.actionMs >= RAYE_YAWN_MS ? setAction(s, 'sleep') : s;
    default: // sleep
      if (input.poked && s.cooldownMs <= 0) {
        return { ...setAction(s, 'stretch'), cooldownMs: RAYE_POKE_COOLDOWN_MS };
      }
      if (input.tetris) return setAction(s, 'earTwitch');
      s.stretchMs -= dtMs;
      if (s.stretchMs > 0) return s;
      return { ...setAction(s, 'stretch'), stretchMs: between(rng, 30_000, 60_000) };
  }
}

export function viewRaye(s: RayeState): CatView {
  return {
    pose: s.action,
    poseMs: s.actionMs,
    x: 0,
    y: 0,
    facing: 1,
    visible: true,
    bubble: s.action === 'sleep' ? { text: 'z z z', id: 0 } : null,
  };
}
