export const BOARD_WIDTH = 20;
export const VISIBLE_ROWS = 20;
export const HIDDEN_ROWS = 2;
export const BOARD_HEIGHT = VISIBLE_ROWS + HIDDEN_ROWS;

export const TICKS_PER_SECOND = 60;
export const LOCK_DELAY_TICKS = 30;
export const MAX_LOCK_RESETS = 15;
export const SOFT_DROP_FACTOR = 20;
export const NEXT_QUEUE_SIZE = 5;
export const LINES_PER_LEVEL = 20;
export const SPRINT_LINES = 40;

/** Left edge of each player's spawn box. O pieces spawn one column further right. */
export const SPAWN_X: readonly [number, number] = [3, 13];
