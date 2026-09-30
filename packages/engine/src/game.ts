import { createBag, drawPiece } from './bag';
import { clearFullRows, collidesWithBoard, createBoard, piecesOverlap } from './board';
import {
  LOCK_DELAY_TICKS,
  MAX_LOCK_RESETS,
  NEXT_QUEUE_SIZE,
  SOFT_DROP_FACTOR,
  SPAWN_X,
} from './constants';
import { kickOffsets, pieceCells } from './pieces';
import { LINE_SCORES, gravityPerTick, levelForLines } from './scoring';
import type {
  Action,
  ActivePiece,
  GameState,
  PieceType,
  PlayerId,
  PlayerState,
  Rotation,
} from './types';

export const PLAYER_IDS: readonly PlayerId[] = [0, 1];

export function otherPlayer(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}

export function spawnPosition(type: PieceType, player: PlayerId): ActivePiece {
  return { type, x: SPAWN_X[player] + (type === 'O' ? 1 : 0), y: 0, rot: 0 };
}

export function createGame(seeds: readonly [number, number]): GameState {
  const state: GameState = {
    tick: 0,
    board: createBoard(),
    players: [createPlayer(seeds[0]), createPlayer(seeds[1])],
    score: 0,
    lines: 0,
    level: 1,
    lockCount: 0,
    lastClear: null,
    over: false,
  };
  for (const player of PLAYER_IDS) trySpawn(state, player);
  return state;
}

/** Collision against walls, floor, locked cells, and the partner's active piece. */
export function collides(state: GameState, player: PlayerId, piece: ActivePiece): boolean {
  if (collidesWithBoard(state.board, piece)) return true;
  const partner = state.players[otherPlayer(player)].active;
  return partner !== null && piecesOverlap(piece, partner);
}

export function applyInput(prev: GameState, player: PlayerId, action: Action): GameState {
  if (prev.over) return prev;
  const state = structuredClone(prev);
  const p = state.players[player];
  switch (action) {
    case 'left':
      if (tryShift(state, player, -1, 0)) afterManualMove(state, player);
      break;
    case 'right':
      if (tryShift(state, player, 1, 0)) afterManualMove(state, player);
      break;
    case 'rotateCW':
      if (tryRotate(state, player, 1)) afterManualMove(state, player);
      break;
    case 'rotateCCW':
      if (tryRotate(state, player, -1)) afterManualMove(state, player);
      break;
    case 'softDropOn':
      p.softDrop = true;
      break;
    case 'softDropOff':
      p.softDrop = false;
      break;
    case 'hardDrop':
      hardDrop(state, player);
      break;
    case 'hold':
      hold(state, player);
      break;
  }
  return state;
}

/** Float tolerance so that e.g. 60 × (1/60) counts as a full row. */
const GRAVITY_EPSILON = 1e-9;

export function tick(prev: GameState): GameState {
  if (prev.over) return prev;
  const state = structuredClone(prev);
  state.tick += 1;
  for (const player of PLAYER_IDS) {
    trySpawn(state, player);
    if (state.over) return state;
    stepPlayer(state, player);
    if (state.over) return state;
  }
  return state;
}

export function ghostPiece(state: GameState, player: PlayerId): ActivePiece | null {
  let piece = state.players[player].active;
  if (!piece) return null;
  while (!collides(state, player, { ...piece, y: piece.y + 1 }))
    piece = { ...piece, y: piece.y + 1 };
  return piece;
}

function hardDrop(state: GameState, player: PlayerId): void {
  const p = state.players[player];
  if (!p.active) return;
  let cells = 0;
  while (tryShift(state, player, 0, 1)) cells += 1;
  state.score += 2 * cells;
  if (p.active && onGround(state, p.active)) lockPiece(state, player);
  else p.lockTimer = 0; // landed on the partner's piece: hover
}

function hold(state: GameState, player: PlayerId): void {
  const p = state.players[player];
  if (!p.active || p.holdUsed) return;
  const current = p.active.type;
  p.nextSpawn = p.hold ?? takeNext(p);
  p.hold = current;
  p.holdUsed = true;
  p.active = null;
  trySpawn(state, player);
}

function stepPlayer(state: GameState, player: PlayerId): void {
  const p = state.players[player];
  if (!p.active) return;

  p.gravityAcc += gravityPerTick(state.level) * (p.softDrop ? SOFT_DROP_FACTOR : 1);
  while (p.gravityAcc >= 1 - GRAVITY_EPSILON) {
    p.gravityAcc -= 1;
    if (tryShift(state, player, 0, 1)) {
      p.lockTimer = 0;
      if (p.softDrop) state.score += 1;
    } else {
      p.gravityAcc = 0;
      break;
    }
  }

  if (p.active && onGround(state, p.active)) {
    p.lockTimer += 1;
    if (p.lockTimer >= LOCK_DELAY_TICKS) lockPiece(state, player);
  } else {
    // Airborne or hovering on the partner's piece: the lock timer does not run.
    p.lockTimer = 0;
  }
}

function lockPiece(state: GameState, player: PlayerId): void {
  const p = state.players[player];
  const piece = p.active;
  if (!piece) return;
  for (const [x, y] of pieceCells(piece)) state.board[y][x] = piece.type;
  p.active = null;
  p.holdUsed = false;
  p.lockTimer = 0;
  p.lockResets = 0;
  p.gravityAcc = 0;
  state.lockCount += 1;

  const { board, cleared } = clearFullRows(state.board);
  if (cleared > 0) {
    state.board = board;
    state.score += LINE_SCORES[cleared] * state.level;
    state.lines += cleared;
    state.level = levelForLines(state.lines);
    state.lastClear = { count: cleared, tick: state.tick };
    nudgeUp(state, otherPlayer(player));
    if (state.over) return;
  }

  p.nextSpawn = takeNext(p);
  trySpawn(state, player);
}

/** After rows shift down, move a player's active piece up until it no longer overlaps locked cells. */
function nudgeUp(state: GameState, player: PlayerId): void {
  const p = state.players[player];
  while (p.active && collidesWithBoard(state.board, p.active)) {
    if (p.active.y <= 0) {
      state.over = true;
      return;
    }
    p.active = { ...p.active, y: p.active.y - 1 };
  }
}

// ---- internal helpers (all mutate the already-cloned state) ----

function createPlayer(seed: number): PlayerState {
  const p: PlayerState = {
    active: null,
    nextSpawn: null,
    hold: null,
    holdUsed: false,
    queue: [],
    bag: createBag(seed),
    softDrop: false,
    gravityAcc: 0,
    lockTimer: 0,
    lockResets: 0,
  };
  fillQueue(p);
  p.nextSpawn = takeNext(p);
  return p;
}

function fillQueue(p: PlayerState): void {
  while (p.queue.length < NEXT_QUEUE_SIZE) {
    const [piece, bag] = drawPiece(p.bag);
    p.bag = bag;
    p.queue.push(piece);
  }
}

function takeNext(p: PlayerState): PieceType {
  const piece = p.queue.shift()!;
  fillQueue(p);
  return piece;
}

/** Spawns `nextSpawn` if possible: game over if locked cells block it, wait if the partner does. */
function trySpawn(state: GameState, player: PlayerId): void {
  const p = state.players[player];
  if (p.active !== null || p.nextSpawn === null) return;
  const piece = spawnPosition(p.nextSpawn, player);
  if (collidesWithBoard(state.board, piece)) {
    state.over = true;
    return;
  }
  const partner = state.players[otherPlayer(player)].active;
  if (partner !== null && piecesOverlap(piece, partner)) return;
  p.active = piece;
  p.nextSpawn = null;
  p.gravityAcc = 0;
  p.lockTimer = 0;
  p.lockResets = 0;
}

function tryShift(state: GameState, player: PlayerId, dx: number, dy: number): boolean {
  const p = state.players[player];
  if (!p.active) return false;
  const moved = { ...p.active, x: p.active.x + dx, y: p.active.y + dy };
  if (collides(state, player, moved)) return false;
  p.active = moved;
  return true;
}

function tryRotate(state: GameState, player: PlayerId, dir: 1 | -1): boolean {
  const p = state.players[player];
  const piece = p.active;
  if (!piece) return false;
  const to = ((piece.rot + dir + 4) % 4) as Rotation;
  for (const [dx, dy] of kickOffsets(piece.type, piece.rot, to)) {
    const candidate = { ...piece, rot: to, x: piece.x + dx, y: piece.y + dy };
    if (!collides(state, player, candidate)) {
      p.active = candidate;
      return true;
    }
  }
  return false;
}

/** Resting on the floor or locked cells (the partner's piece does not count). */
function onGround(state: GameState, piece: ActivePiece): boolean {
  return collidesWithBoard(state.board, { ...piece, y: piece.y + 1 });
}

function afterManualMove(state: GameState, player: PlayerId): void {
  const p = state.players[player];
  if (p.active && onGround(state, p.active) && p.lockResets < MAX_LOCK_RESETS) {
    p.lockTimer = 0;
    p.lockResets += 1;
  }
}
