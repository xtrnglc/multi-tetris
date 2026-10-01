import { describe, expect, it } from 'vitest';
import { clearLabel, formatTicks, resultSummary, scoreBarStats } from '../src/ui/labels';

describe('clearLabel', () => {
  it('names each clear size', () => {
    expect([1, 2, 3, 4].map(clearLabel)).toEqual(['SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS']);
    expect(clearLabel(0)).toBe('');
  });
});

describe('formatTicks', () => {
  it('formats 60 Hz ticks as m:ss.cc', () => {
    expect(formatTicks(0)).toBe('0:00.00');
    expect(formatTicks(60)).toBe('0:01.00');
    expect(formatTicks(4987)).toBe('1:23.11');
    expect(formatTicks(216_000)).toBe('60:00.00');
  });
});

describe('scoreBarStats', () => {
  const base = { score: 500, lines: 12, level: 1, tick: 4987 };

  it('shows lines, score and level in marathon', () => {
    expect(scoreBarStats({ ...base, mode: 'marathon' })).toEqual({
      left: { label: 'LINES', value: '12' },
      center: '500',
      right: { label: 'LV', value: '1' },
    });
  });

  it('shows lines left, the timer and 40L in sprint', () => {
    expect(scoreBarStats({ ...base, mode: 'sprint' })).toEqual({
      left: { label: 'LEFT', value: '28' },
      center: '1:23.11',
      right: { label: '', value: '40L' },
    });
  });

  it('never shows negative lines left after an overshoot', () => {
    expect(scoreBarStats({ ...base, mode: 'sprint', lines: 42 }).left.value).toBe('0');
  });
});

describe('resultSummary', () => {
  const base = { ticks: 4987, score: 900, lines: 40, level: 1 };

  it('celebrates a cleared sprint with the time', () => {
    expect(resultSummary({ ...base, mode: 'sprint', result: 'cleared', lines: 42 })).toEqual({
      heading: 'CLEARED!',
      time: '1:23.11',
      detail: '42 LINES',
    });
  });

  it('shows progress for a topped-out sprint', () => {
    expect(resultSummary({ ...base, mode: 'sprint', result: 'toppedOut', lines: 23 })).toEqual({
      heading: 'TOPPED OUT',
      time: null,
      detail: '23 / 40 LINES · 1:23.11',
    });
  });

  it('says GAME OVER for a sprint the room ended (partner never returned)', () => {
    expect(resultSummary({ ...base, mode: 'sprint', result: null, lines: 23 }).heading).toBe(
      'GAME OVER',
    );
  });

  it('keeps the marathon summary', () => {
    expect(resultSummary({ ...base, mode: 'marathon', result: 'toppedOut', level: 3 })).toEqual({
      heading: 'GAME OVER',
      time: null,
      detail: 'SCORE 900 · LINES 40 · LV 3',
    });
  });
});
