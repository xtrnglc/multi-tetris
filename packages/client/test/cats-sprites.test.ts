import { describe, expect, it } from 'vitest';
import { FRAME_MS, between, frameIndex } from '../src/cats/anim';
import { PALETTES, SCALE, SPRITES, SPRITE_SIZE } from '../src/cats/sprites';
import { framePixels } from '../src/cats/spriteSheet';

describe('sprites', () => {
  it('every frame is a 16×16 grid using only palette letters', () => {
    for (const [pose, frames] of Object.entries(SPRITES)) {
      expect(frames.length, pose).toBeGreaterThan(0);
      for (const grid of frames) {
        expect(grid, pose).toHaveLength(SPRITE_SIZE);
        for (const row of grid) {
          expect(row, `${pose}: ${row}`).toHaveLength(SPRITE_SIZE);
          for (const ch of row) {
            if (ch === '.') continue;
            for (const palette of Object.values(PALETTES)) {
              expect(palette[ch], `${pose} uses ${ch}`).toBeDefined();
            }
          }
        }
      }
    }
  });

  it('gives each cat her own coat', () => {
    expect(PALETTES.misa.S).not.toBe(PALETTES.misa.B); // tabby stripes
    expect(PALETTES.max.S).toBe(PALETTES.max.B); // no stripes
    expect(PALETTES.max.W).not.toBe(PALETTES.max.B); // white chest and socks
    expect(PALETTES.raye.F).not.toBe(PALETTES.raye.B); // face markings
    expect(SCALE.misa).toBeLessThan(SCALE.max);
  });

  it('turns a grid into coloured pixels, skipping transparent cells', () => {
    const pixels = framePixels(['O.', '.B'], { O: '#000', B: '#fff' });
    expect(pixels).toEqual([
      { x: 0, y: 0, color: '#000' },
      { x: 1, y: 1, color: '#fff' },
    ]);
  });
});

describe('animation helpers', () => {
  it('cycles through a pose’s frames', () => {
    expect(frameIndex('walk', 0)).toBe(0);
    expect(frameIndex('walk', FRAME_MS.walk)).toBe(1);
    expect(frameIndex('walk', FRAME_MS.walk * SPRITES.walk.length)).toBe(0);
    expect(frameIndex('pounce', 99_999)).toBe(0);
  });

  it('picks a value in a range from the random source', () => {
    expect(between(() => 0, 10, 20)).toBe(10);
    expect(between(() => 0.5, 10, 20)).toBe(15);
  });
});
