import { describe, expect, it } from 'vitest';
import type { Action } from '@mt/engine';
import { KeyboardInput } from '../src/input/keyboard';

function setup() {
  const out: Action[] = [];
  const kb = new KeyboardInput((a) => out.push(a));
  return { kb, out };
}

describe('KeyboardInput', () => {
  it('emits one move per tap', () => {
    const { kb, out } = setup();
    kb.keyDown('ArrowLeft', 0);
    kb.update(100);
    kb.keyUp('ArrowLeft', 120);
    kb.update(500);
    expect(out).toEqual(['left']);
  });

  it('auto-repeats after DAS (167ms) every ARR (33ms)', () => {
    const { kb, out } = setup();
    kb.keyDown('ArrowRight', 0);
    kb.update(166);
    expect(out).toHaveLength(1);
    kb.update(167);
    expect(out).toHaveLength(2);
    kb.update(199);
    expect(out).toHaveLength(2);
    kb.update(266);
    expect(out).toEqual(['right', 'right', 'right', 'right', 'right']);
  });

  it('the most recent direction wins, and releasing it resumes the other', () => {
    const { kb, out } = setup();
    kb.keyDown('ArrowLeft', 0);
    kb.keyDown('ArrowRight', 50);
    kb.update(100);
    kb.keyUp('ArrowRight', 100);
    expect(out).toEqual(['left', 'right', 'left']);
    kb.update(266);
    expect(out).toEqual(['left', 'right', 'left']);
    kb.update(267);
    expect(out.at(-1)).toBe('left');
    expect(out).toHaveLength(4);
  });

  it('maps soft drop to on/off', () => {
    const { kb, out } = setup();
    kb.keyDown('ArrowDown', 0);
    kb.keyUp('ArrowDown', 50);
    expect(out).toEqual(['softDropOn', 'softDropOff']);
  });

  it('fires hard drop, rotate, and hold once per press, ignoring browser key repeat', () => {
    const { kb, out } = setup();
    kb.keyDown('Space', 0);
    kb.keyDown('Space', 30); // browser auto-repeat
    kb.keyDown('KeyX', 40);
    kb.keyDown('KeyZ', 50);
    kb.keyDown('ShiftLeft', 60);
    kb.update(1000);
    expect(out).toEqual(['hardDrop', 'rotateCW', 'rotateCCW', 'hold']);
    kb.keyUp('Space', 1100);
    kb.keyDown('Space', 1200);
    expect(out.at(-1)).toBe('hardDrop');
  });

  it('releaseAll (window blur) stops auto-repeat and releases soft drop', () => {
    const { kb, out } = setup();
    kb.keyDown('ArrowLeft', 0);
    kb.keyDown('ArrowDown', 0);
    kb.releaseAll();
    kb.update(1000);
    expect(out).toEqual(['left', 'softDropOn', 'softDropOff']);
    kb.keyDown('ArrowLeft', 1100);
    expect(out.at(-1)).toBe('left');
  });

  it('ignores unmapped keys', () => {
    const { kb, out } = setup();
    expect(kb.keyDown('KeyQ', 0)).toBe(false);
    expect(out).toEqual([]);
  });
});
