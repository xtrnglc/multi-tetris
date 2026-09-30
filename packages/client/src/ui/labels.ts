const CLEAR_LABELS = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];

export function clearLabel(count: number): string {
  return CLEAR_LABELS[count] ?? '';
}
