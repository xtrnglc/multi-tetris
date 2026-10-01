import { useEffect, useRef } from 'react';
import { BOARD_WIDTH } from '@mt/engine';
import { session } from '../net/sessionInstance';
import { frameIndex } from './anim';
import { centerColumn, dangerLevel, initialTracker, trackGame, type EventTracker } from './events';
import { createMax, stepMax, viewMax } from './max';
import { createMisa, stepMisa, viewMisa } from './misa';
import { createRaye, stepRaye, viewRaye } from './raye';
import { buildSheet, type Sheet } from './spriteSheet';
import { SCALE, SPRITE_SIZE } from './sprites';
import type { CatName, CatView } from './types';
import '../styles/cats.css';

export type CatScreen = 'menu' | 'game';

const CATS: readonly CatName[] = ['misa', 'max', 'raye'];
/** Max stops following a mouse that hasn't moved for this long. */
const CURSOR_IDLE_MS = 5000;
const MISA_NEAR_PX = 120;
/** Caps a frame's time step, e.g. after the tab was in the background. */
const MAX_DT_MS = 100;
/** Thickness of a panel's frame, so cats stand on it rather than inside it. */
const FRAME_PX = 5;

/** Where each cat lives this frame, in viewport px. */
interface Perches {
  /** Max walks along an edge from `left` to `left + width`, feet at `bottom`. */
  max: { left: number; bottom: number; width: number; cellPx: number | null };
  raye: { x: number; bottom: number };
  /** Misa's perch; she flees toward +x for `exitDistance` px. */
  misa: { x: number; bottom: number; exitDistance: number };
}

function rectOf(anchor: string): DOMRect | null {
  return document.querySelector(`[data-cat-anchor="${anchor}"]`)?.getBoundingClientRect() ?? null;
}

function findPerches(screen: CatScreen): Perches | null {
  if (screen === 'game') {
    const well = rectOf('well');
    const hold = rectOf('hold-left');
    const side = rectOf('side-right');
    if (!well || !hold || !side) return null;
    const misaX = side.left + side.width / 2;
    return {
      max: {
        left: well.left,
        bottom: well.top - FRAME_PX,
        width: well.width,
        cellPx: well.width / BOARD_WIDTH,
      },
      raye: { x: hold.left + hold.width / 2, bottom: hold.top },
      misa: { x: misaX, bottom: side.bottom + 40, exitDistance: window.innerWidth - misaX + 40 },
    };
  }
  const menu = rectOf('menu');
  if (!menu) return null;
  return {
    // Max keeps clear of Raye's corner.
    max: { left: menu.left, bottom: menu.top, width: menu.width - 80, cellPx: null },
    raye: { x: menu.right - 40, bottom: menu.top },
    // She "runs behind the panel": a short dash toward it, then out of sight.
    misa: { x: menu.left - 20, bottom: menu.bottom - 16, exitDistance: 40 },
  };
}

export function CatLayer({ screen }: { screen: CatScreen }) {
  const screenRef = useRef(screen);
  const wrappers = useRef<Partial<Record<CatName, HTMLDivElement | null>>>({});
  const canvases = useRef<Partial<Record<CatName, HTMLCanvasElement | null>>>({});
  const bubbles = useRef<Partial<Record<CatName, HTMLDivElement | null>>>({});
  const poked = useRef(false);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    const rng = Math.random;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const sheets: Record<CatName, Sheet> = {
      misa: buildSheet('misa'),
      max: buildSheet('max'),
      raye: buildSheet('raye'),
    };
    let max = createMax(0, rng);
    let misa = createMisa();
    let raye = createRaye(rng);
    let tracker: EventTracker = initialTracker;
    let danger = false;
    let cursor: { x: number; y: number; at: number } | null = null;
    const drawn: Record<CatName, string> = { misa: '', max: '', raye: '' };
    const bubbleIds: Record<CatName, number> = { misa: -1, max: -1, raye: -1 };

    const onMove = (e: MouseEvent) => {
      cursor = { x: e.clientX, y: e.clientY, at: performance.now() };
    };
    window.addEventListener('mousemove', onMove);

    const place = (name: CatName, view: CatView, originX: number, bottom: number) => {
      const wrap = wrappers.current[name];
      const canvas = canvases.current[name];
      const bubble = bubbles.current[name];
      if (!wrap || !canvas || !bubble) return;
      const size = SPRITE_SIZE * SCALE[name];
      wrap.style.visibility = view.visible ? 'visible' : 'hidden';
      wrap.style.transform = `translate(${Math.round(originX + view.x - size / 2)}px, ${Math.round(bottom + view.y - size)}px)`;
      canvas.style.transform = view.facing < 0 ? 'scaleX(-1)' : '';
      const frame = frameIndex(view.pose, view.poseMs);
      const key = `${view.pose}:${frame}`;
      if (drawn[name] !== key) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
          ctx.drawImage(sheets[name][view.pose][frame], 0, 0);
        }
        drawn[name] = key;
      }
      if (view.bubble) {
        if (bubbleIds[name] !== view.bubble.id) {
          bubble.textContent = view.bubble.text;
          bubbleIds[name] = view.bubble.id;
        }
        bubble.classList.add('show');
      } else {
        bubble.classList.remove('show');
      }
    };

    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(MAX_DT_MS, Math.max(0, now - last));
      last = now;
      const where = screenRef.current;
      const perches = findPerches(where);
      if (!perches) {
        for (const name of CATS) wrappers.current[name]?.style.setProperty('visibility', 'hidden');
        return;
      }

      const state = session.getState();
      const game = where === 'game' ? state.game : null;
      const tracked = trackGame(tracker, game);
      tracker = tracked.tracker;
      danger = dangerLevel(game, danger);
      let meow = false;
      let flinch = false;
      let tetris = false;
      let pounceAt: number | null = null;
      for (const event of tracked.events) {
        if (event.type === 'clear') {
          meow = true;
          if (event.count >= 4) tetris = true;
          else flinch = true;
        } else if (perches.max.cellPx !== null) {
          pounceAt = event.column * perches.max.cellPx;
        }
      }

      const active = game?.players[state.room?.you ?? 0].active ?? null;
      const recentCursor = cursor && now - cursor.at < CURSOR_IDLE_MS ? cursor : null;
      const maxTarget =
        perches.max.cellPx !== null
          ? active
            ? centerColumn(active) * perches.max.cellPx
            : null
          : recentCursor
            ? recentCursor.x - perches.max.left
            : null;
      const misaNear =
        where === 'menu' &&
        cursor !== null &&
        Math.hypot(cursor.x - perches.misa.x, cursor.y - (perches.misa.bottom - 16)) < MISA_NEAR_PX;

      max = stepMax(
        max,
        { width: perches.max.width, target: maxTarget, pounceAt, meow, reducedMotion },
        dt,
        rng,
      );
      misa = stepMisa(
        misa,
        {
          exitDistance: perches.misa.exitDistance,
          flinch,
          tetris,
          cursorNear: misaNear,
          reducedMotion,
        },
        dt,
        rng,
      );
      raye = stepRaye(
        raye,
        { danger, tetris, over: game?.over ?? false, poked: poked.current },
        dt,
        rng,
      );
      poked.current = false;

      place('max', viewMax(max), perches.max.left, perches.max.bottom);
      place('misa', viewMisa(misa), perches.misa.x, perches.misa.bottom);
      place('raye', viewRaye(raye), perches.raye.x, perches.raye.bottom);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  return (
    <div className="cat-layer" aria-hidden="true">
      {CATS.map((name) => (
        <div
          key={name}
          className={`cat cat-${name}`}
          data-testid={`cat-${name}`}
          ref={(el) => {
            wrappers.current[name] = el;
          }}
        >
          <div
            className="cat-bubble"
            ref={(el) => {
              bubbles.current[name] = el;
            }}
          />
          <canvas
            width={SPRITE_SIZE}
            height={SPRITE_SIZE}
            style={{ width: SPRITE_SIZE * SCALE[name], height: SPRITE_SIZE * SCALE[name] }}
            ref={(el) => {
              canvases.current[name] = el;
            }}
            onClick={
              name === 'raye'
                ? () => {
                    poked.current = true;
                  }
                : undefined
            }
          />
        </div>
      ))}
    </div>
  );
}
