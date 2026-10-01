import { between } from './anim';
import type { Bubble, CatView, Rng } from './types';

export interface MaxInput {
  /** Length of Max's edge in px; positions run from 0 (left end) to width. */
  width: number;
  /** Where Max wants to stand, or null to wander. */
  target: number | null;
  /** Pounce toward this position this step (a hard drop landed there). */
  pounceAt: number | null;
  /** A line was cleared this step. */
  meow: boolean;
  reducedMotion: boolean;
}

type MaxAction = 'sit' | 'walk' | 'run' | 'crouch' | 'pounce' | 'stretch';

export interface MaxState {
  action: MaxAction;
  actionMs: number;
  x: number;
  y: number;
  facing: 1 | -1;
  jumpFrom: number;
  jumpTo: number;
  wanderTarget: number | null;
  wanderMs: number;
  meowMs: number;
  stretchMs: number;
  bubble: Bubble | null;
  bubbleMs: number;
  bubbleCount: number;
}

/** Speeds in px per ms. */
export const MAX_WALK_SPEED = 0.08;
export const MAX_RUN_SPEED = 0.25;
export const MAX_CROUCH_MS = 150;
export const MAX_POUNCE_MS = 400;
export const MAX_POUNCE_HEIGHT = 20;
export const MAX_STRETCH_MS = 1200;
export const BUBBLE_MS = 1000;
const ARRIVED_PX = 4;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function createMax(x: number, rng: Rng): MaxState {
  return {
    action: 'sit',
    actionMs: 0,
    x,
    y: 0,
    facing: 1,
    jumpFrom: x,
    jumpTo: x,
    wanderTarget: null,
    wanderMs: between(rng, 3000, 6000),
    meowMs: between(rng, 20_000, 40_000),
    stretchMs: between(rng, 30_000, 60_000),
    bubble: null,
    bubbleMs: 0,
    bubbleCount: 0,
  };
}

function setAction(s: MaxState, action: MaxAction): MaxState {
  return { ...s, action, actionMs: 0 };
}

export function stepMax(prev: MaxState, input: MaxInput, dtMs: number, rng: Rng): MaxState {
  const s: MaxState = {
    ...prev,
    actionMs: prev.actionMs + dtMs,
    bubbleMs: prev.bubbleMs - dtMs,
    meowMs: prev.meowMs - dtMs,
  };
  if (s.action !== 'pounce') s.x = clamp(s.x, 0, input.width);
  if (s.bubbleMs <= 0) s.bubble = null;
  if (input.meow || s.meowMs <= 0) {
    s.bubbleCount += 1;
    s.bubble = { text: 'meow!', id: s.bubbleCount };
    s.bubbleMs = BUBBLE_MS;
    if (s.meowMs <= 0) s.meowMs = between(rng, 20_000, 40_000);
  }

  const busy = s.action === 'crouch' || s.action === 'pounce';
  if (input.pounceAt !== null && !input.reducedMotion && !busy) {
    s.jumpTo = clamp(input.pounceAt, 0, input.width);
    s.facing = s.jumpTo >= s.x ? 1 : -1;
    return setAction(s, 'crouch');
  }

  switch (s.action) {
    case 'crouch':
      if (s.actionMs < MAX_CROUCH_MS) return s;
      s.jumpFrom = s.x;
      return setAction(s, 'pounce');
    case 'pounce': {
      const p = Math.min(1, s.actionMs / MAX_POUNCE_MS);
      s.x = s.jumpFrom + (s.jumpTo - s.jumpFrom) * p;
      s.y = -4 * MAX_POUNCE_HEIGHT * p * (1 - p);
      if (p < 1) return s;
      s.y = 0;
      return setAction(s, 'sit');
    }
    case 'stretch':
      return s.actionMs >= MAX_STRETCH_MS ? setAction(s, 'sit') : s;
    default:
      return roam(s, input, dtMs, rng);
  }
}

function roam(s: MaxState, input: MaxInput, dtMs: number, rng: Rng): MaxState {
  if (input.target !== null) {
    s.wanderTarget = null;
  } else {
    s.wanderMs -= dtMs;
    if (s.wanderMs <= 0) {
      s.wanderTarget = rng() * input.width;
      s.wanderMs = between(rng, 3000, 6000);
    }
  }

  const goal = input.target ?? s.wanderTarget;
  const dist = goal === null ? 0 : clamp(goal, 0, input.width) - s.x;
  if (!input.reducedMotion && Math.abs(dist) > ARRIVED_PX) {
    const running = Math.abs(dist) > input.width / 4;
    const speed = running ? MAX_RUN_SPEED : MAX_WALK_SPEED;
    s.facing = dist > 0 ? 1 : -1;
    s.x += Math.sign(dist) * Math.min(Math.abs(dist), speed * dtMs);
    const action = running ? 'run' : 'walk';
    return s.action === action ? s : setAction(s, action);
  }

  s.stretchMs -= dtMs;
  if (s.stretchMs <= 0) {
    s.stretchMs = between(rng, 30_000, 60_000);
    return setAction(s, 'stretch');
  }
  return s.action === 'sit' ? s : setAction(s, 'sit');
}

export function viewMax(s: MaxState): CatView {
  return {
    pose: s.action,
    poseMs: s.actionMs,
    x: s.x,
    y: s.y,
    facing: s.facing,
    visible: true,
    bubble: s.bubble,
  };
}
