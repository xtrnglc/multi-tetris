import { SPRINT_LINES, TICKS_PER_SECOND, type GameMode, type GameState } from '@mt/engine';
import type { GameResult } from '../net/session';

const CLEAR_LABELS = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];

export function clearLabel(count: number): string {
  return CLEAR_LABELS[count] ?? '';
}

export const MODE_LABELS: Record<GameMode, string> = {
  marathon: 'Marathon',
  sprint: 'Sprint 40L',
};

export const MODE_DESCRIPTIONS: Record<GameMode, string> = {
  marathon: 'Endless co-op. Pieces speed up every 20 lines.',
  sprint: `Clear ${SPRINT_LINES} lines together as fast as you can.`,
};

/** 60 Hz game ticks as m:ss.cc. */
export function formatTicks(ticks: number): string {
  const centis = Math.floor((ticks * 100) / TICKS_PER_SECOND);
  const minutes = Math.floor(centis / 6000);
  const seconds = Math.floor(centis / 100) % 60;
  const cc = centis % 100;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(cc).padStart(2, '0')}`;
}

export interface ScoreBarStats {
  left: { label: string; value: string };
  center: string;
  right: { label: string; value: string };
}

export function scoreBarStats(
  game: Pick<GameState, 'mode' | 'score' | 'lines' | 'level' | 'tick'>,
): ScoreBarStats {
  if (game.mode === 'sprint') {
    return {
      left: { label: 'LEFT', value: String(Math.max(0, SPRINT_LINES - game.lines)) },
      center: formatTicks(game.tick),
      right: { label: '', value: `${SPRINT_LINES}L` },
    };
  }
  return {
    left: { label: 'LINES', value: String(game.lines) },
    center: game.score.toLocaleString(),
    right: { label: 'LV', value: String(game.level) },
  };
}

export function resultSummary(result: GameResult): {
  heading: string;
  time: string | null;
  detail: string;
} {
  const time = formatTicks(result.ticks);
  if (result.mode === 'sprint') {
    if (result.result === 'cleared') {
      return { heading: 'CLEARED!', time, detail: `${result.lines} LINES` };
    }
    return {
      heading: result.result === 'toppedOut' ? 'TOPPED OUT' : 'GAME OVER',
      time: null,
      detail: `${result.lines} / ${SPRINT_LINES} LINES · ${time}`,
    };
  }
  return {
    heading: 'GAME OVER',
    time: null,
    detail: `SCORE ${result.score.toLocaleString()} · LINES ${result.lines} · LV ${result.level}`,
  };
}
