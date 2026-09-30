import type { Action } from '@mt/engine';

export const DAS_MS = 167;
export const ARR_MS = 33;
const MAX_REPEATS_PER_UPDATE = 20;

type Binding = 'left' | 'right' | 'softDrop' | 'hardDrop' | 'rotateCW' | 'rotateCCW' | 'hold';
type Direction = 'left' | 'right';

const KEYMAP: Record<string, Binding> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'softDrop',
  Space: 'hardDrop',
  ArrowUp: 'rotateCW',
  KeyX: 'rotateCW',
  KeyZ: 'rotateCCW',
  KeyC: 'hold',
  ShiftLeft: 'hold',
  ShiftRight: 'hold',
};

/** Turns raw key events into discrete game actions, applying DAS/ARR to left/right. */
export class KeyboardInput {
  private readonly held = new Set<string>();
  private directions: Direction[] = [];
  private nextRepeatAt: number | null = null;

  constructor(
    private readonly emit: (action: Action) => void,
    private readonly das = DAS_MS,
    private readonly arr = ARR_MS,
  ) {}

  keyDown(code: string, now: number): boolean {
    const binding = KEYMAP[code];
    if (!binding) return false;
    if (this.held.has(code)) return true; // browser auto-repeat
    this.held.add(code);
    switch (binding) {
      case 'left':
      case 'right':
        this.directions = [...this.directions.filter((d) => d !== binding), binding];
        this.startDirection(binding, now);
        break;
      case 'softDrop':
        this.emit('softDropOn');
        break;
      default:
        this.emit(binding);
    }
    return true;
  }

  keyUp(code: string, now: number): boolean {
    const binding = KEYMAP[code];
    if (!binding) return false;
    if (!this.held.delete(code)) return true;
    if (binding === 'left' || binding === 'right') {
      const wasActive = this.current() === binding;
      this.directions = this.directions.filter((d) => d !== binding);
      const next = this.current();
      if (wasActive) {
        if (next) this.startDirection(next, now);
        else this.nextRepeatAt = null;
      }
    } else if (binding === 'softDrop') {
      this.emit('softDropOff');
    }
    return true;
  }

  update(now: number): void {
    const dir = this.current();
    if (!dir || this.nextRepeatAt === null) return;
    let emitted = 0;
    while (now >= this.nextRepeatAt && emitted < MAX_REPEATS_PER_UPDATE) {
      this.emit(dir);
      this.nextRepeatAt += this.arr;
      emitted += 1;
    }
    if (emitted === MAX_REPEATS_PER_UPDATE) this.nextRepeatAt = now + this.arr;
  }

  /** Forget every held key (e.g. on window blur) without triggering direction switches. */
  releaseAll(): void {
    if ([...this.held].some((code) => KEYMAP[code] === 'softDrop')) this.emit('softDropOff');
    this.held.clear();
    this.directions = [];
    this.nextRepeatAt = null;
  }

  private current(): Direction | null {
    return this.directions[this.directions.length - 1] ?? null;
  }

  private startDirection(dir: Direction, now: number): void {
    this.emit(dir);
    this.nextRepeatAt = now + this.das;
  }
}
