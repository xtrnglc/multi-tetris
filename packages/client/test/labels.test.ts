import { describe, expect, it } from 'vitest';
import { clearLabel } from '../src/ui/labels';

describe('clearLabel', () => {
  it('names each clear size', () => {
    expect([1, 2, 3, 4].map(clearLabel)).toEqual(['SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS']);
    expect(clearLabel(0)).toBe('');
  });
});
