import { between } from './anim';
import type { CatView, Pose, Rng } from './types';

export interface MisaInput {
  /** How far (px) she runs from her perch before she is out of sight. */
  exitDistance: number;
  /** A 1–3 line clear happened this step. */
  flinch: boolean;
  /** A Tetris happened this step. */
  tetris: boolean;
  /** The mouse cursor is close to her. */
  cursorNear: boolean;
  reducedMotion: boolean;
}

type MisaAction = 'peek' | 'flinch' | 'flee' | 'away' | 'return' | 'pause' | 'cower';

export interface MisaState {
  action: MisaAction;
  actionMs: number;
  /** Distance from her perch toward the exit, in px. */
  x: number;
  /** How long to stay away (or cower) before coming back. */
  awayMs: number;
  /** She pauses once on the way back. */
  paused: boolean;
}

export const MISA_FLINCH_MS = 600;
/** Speeds in px per ms. */
export const MISA_FLEE_SPEED = 0.4;
export const MISA_RETURN_SPEED = 0.05;
export const MISA_PAUSE_MS = 800;
export const MISA_CURSOR_AWAY_MS = 2000;

const SETTLED: readonly MisaAction[] = ['peek', 'flinch', 'return', 'pause'];

export function createMisa(): MisaState {
  return { action: 'peek', actionMs: 0, x: 0, awayMs: 0, paused: false };
}

function setAction(s: MisaState, action: MisaAction): MisaState {
  return { ...s, action, actionMs: 0 };
}

export function stepMisa(prev: MisaState, input: MisaInput, dtMs: number, rng: Rng): MisaState {
  let s: MisaState = { ...prev, actionMs: prev.actionMs + dtMs };

  const spooked = input.tetris || (input.cursorNear && SETTLED.includes(s.action));
  if (spooked) {
    const awayMs = input.tetris ? between(rng, 3000, 5000) : MISA_CURSOR_AWAY_MS;
    if (input.reducedMotion) return { ...setAction(s, 'cower'), awayMs };
    if (s.action === 'away') s = { ...s, actionMs: 0, awayMs: Math.max(s.awayMs, awayMs) };
    else if (s.action === 'flee') s = { ...s, awayMs: Math.max(s.awayMs, awayMs) };
    else return { ...setAction(s, 'flee'), awayMs, paused: false };
  }

  if (input.flinch && s.action === 'peek') return setAction(s, 'flinch');

  switch (s.action) {
    case 'flinch':
      return s.actionMs >= MISA_FLINCH_MS ? setAction(s, 'peek') : s;
    case 'flee':
      s.x += MISA_FLEE_SPEED * dtMs;
      if (s.x < input.exitDistance) return s;
      s.x = input.exitDistance;
      return setAction(s, 'away');
    case 'away':
    case 'cower':
      if (input.cursorNear) s.actionMs = 0; // wait until the cursor has gone
      if (s.actionMs < s.awayMs) return s;
      return s.action === 'cower' ? setAction(s, 'peek') : setAction(s, 'return');
    case 'return':
      s.x -= MISA_RETURN_SPEED * dtMs;
      if (s.x <= 0) return { ...setAction(s, 'peek'), x: 0 };
      if (!s.paused && s.x <= input.exitDistance / 2) return setAction(s, 'pause');
      return s;
    case 'pause':
      return s.actionMs >= MISA_PAUSE_MS ? { ...setAction(s, 'return'), paused: true } : s;
    default:
      return s;
  }
}

const POSES: Record<MisaAction, Pose> = {
  peek: 'peek',
  flinch: 'flinch',
  flee: 'run',
  away: 'run',
  return: 'walk',
  pause: 'sit',
  cower: 'flinch',
};

export function viewMisa(s: MisaState): CatView {
  return {
    pose: POSES[s.action],
    poseMs: s.actionMs,
    x: s.x,
    y: 0,
    facing: s.action === 'return' || s.action === 'pause' ? -1 : 1,
    visible: s.action !== 'away',
    bubble: null,
  };
}
