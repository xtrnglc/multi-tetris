import type { PieceType } from '@mt/engine';

export const PIECE_COLORS: Record<PieceType, string> = {
  I: '#42c9a4',
  O: '#d6c33f',
  T: '#b04fb4',
  S: '#9ac544',
  Z: '#d0484f',
  L: '#d9853b',
  J: '#5a52c8',
};

export const PLAYER_ACCENTS: readonly [string, string] = ['#7fd8ff', '#ffc94d'];
export const WELL_BACKGROUND = '#07060c';
export const GRID_LINE = 'rgba(255, 255, 255, 0.05)';
export const HOLD_USED_COLOR = '#4a4553';
