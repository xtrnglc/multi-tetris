export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export const PIECE_TYPES: readonly PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export type PlayerId = 0 | 1;
export type Rotation = 0 | 1 | 2 | 3;
export type Cell = PieceType | null;
/** board[y][x]; y = 0 is the top hidden row. */
export type Board = Cell[][];

export interface ActivePiece {
  type: PieceType;
  /** Column of the piece's bounding box left edge. */
  x: number;
  /** Row of the piece's bounding box top edge. */
  y: number;
  rot: Rotation;
}

export interface BagState {
  rng: number;
  remaining: PieceType[];
}

export interface PlayerState {
  active: ActivePiece | null;
  /** Piece waiting to spawn (set while `active` is null). */
  nextSpawn: PieceType | null;
  hold: PieceType | null;
  holdUsed: boolean;
  /** Always NEXT_QUEUE_SIZE long. */
  queue: PieceType[];
  bag: BagState;
  softDrop: boolean;
  gravityAcc: number;
  lockTimer: number;
  lockResets: number;
}

export interface LineClear {
  count: number;
  tick: number;
}

export type GameMode = 'marathon' | 'sprint';
/** How a finished game ended; null while running or when the room ended it (partner never returned). */
export type GameOutcome = 'cleared' | 'toppedOut';

export interface GameState {
  tick: number;
  board: Board;
  players: [PlayerState, PlayerState];
  score: number;
  lines: number;
  level: number;
  mode: GameMode;
  result: GameOutcome | null;
  /** Increments on every lock; lets observers detect locks cheaply. */
  lockCount: number;
  lastClear: LineClear | null;
  over: boolean;
}

export const ACTIONS = [
  'left',
  'right',
  'softDropOn',
  'softDropOff',
  'hardDrop',
  'rotateCW',
  'rotateCCW',
  'hold',
] as const;
export type Action = (typeof ACTIONS)[number];
