# Multi-Tetris Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a web app where two players play co-op Tetris on one shared 20-wide well over WebSockets, joining via a private room link.

**Architecture:** npm-workspaces monorepo. `@mt/engine` is a pure, deterministic, tick-based game engine (plus protocol types) shared by `@mt/server` (Node + `ws`, authoritative 60 Hz loop per room, serves the built client) and `@mt/client` (Vite + React UI, canvas board). Stage 1 renders server snapshots; Stage 2 adds client-side prediction of the local player's own inputs.

**Tech Stack:** TypeScript (strict), Node 22, npm workspaces, Vitest, zod, ws, sirv, esbuild, tsx, Vite, React, Playwright, ESLint, Prettier, Docker, Fly.io, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-30-multi-tetris-design.md`

## Global Constraints

- Node **22** or newer is required (`.nvmrc` = `22`). The machine currently has Node 18.7 — Task 1 Step 1 upgrades it.
- TypeScript `strict: true` in every package; no `any` in source files.
- Board: **20 columns × 20 visible rows + 2 hidden rows** (22 total). Row 0 is the top; y grows downward.
- Spawn: Player 0 box origin x = **3**, Player 1 x = **13**, y = 0; the O piece spawns at x + 1.
- Handling: **DAS 167 ms, ARR 33 ms**, soft drop **20×** gravity, lock delay **500 ms (30 ticks)**, max **15** lock resets, hold once per piece.
- Tick rate **60/sec**; engine uses ticks only, never wall-clock time.
- Scoring: 100 / 300 / 500 / 800 × level; soft drop 1 per cell; hard drop 2 per cell; level = 1 + floor(lines / **20**).
- Gravity: seconds per row = `(0.8 − (level − 1) × 0.007)^(level − 1)`, level clamped at 20.
- Co-op rules: active pieces are solid to each other; a piece resting only on the partner's active piece never locks (lock timer stays 0); post-clear nudge upward; spawn deferred if blocked by partner, game over if blocked by locked cells.
- Each player has their own seeded 7-bag, hold slot, and **5**-piece next preview.
- Snapshots at **30 Hz** (every 2 ticks) plus immediately after any lock; inputs rate-limited to **60/sec** per player.
- Rooms: 2 players max; 4-char codes from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`; idle expiry **10 min**; reconnect grace **30 s**; countdown **3 s** (180 ticks) at start and on resume.
- Visual style: TETR.IO-inspired, original assets only. P1 accent `#7fd8ff` (ice-blue), P2 accent `#ffc94d` (gold). Fonts Rajdhani + JetBrains Mono from Google Fonts. Viewports under 900 px show a "keyboard required" notice.
- Deployment: one Node service on Fly.io, **exactly one machine** (in-memory rooms), `/healthz` health check, CD from `main` via GitHub Actions.
- Controls overlay toggles on the `/` key (spec said `?`, but typing `?` requires Shift, which is bound to hold).
- Protocol refinements vs. spec (intentional): `you` is `0 | 1` (UI shows `you + 1`); `gameStart` carries only `countdownTicks` (seeds travel inside the snapshot's bag state); `ping`/`pong` messages added for the ping indicator; `partnerDisconnected` carries `graceMs`.
- End every commit message with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Page refresh mid-game** — a player who refreshes should rejoin their slot using the token in `sessionStorage` and the game resumes after a countdown. Tests: Task 11 (server reconnect with token), Task 12 (client `joinRoom` sends stored token; reconnect loop rejoins).
2. **Window loses focus while keys are held** — soft drop and auto-repeat must stop, not stay stuck on. Test: Task 13 (`releaseAll` emits `softDropOff` and stops repeats).
3. **Room code typed in lowercase or with spaces** — `" k7qx "` should join room `K7QX`. Tests: Task 8 (protocol normalizes), Task 12 (`normalizeCode`).
4. **Inputs sent during countdown or pause** — must be dropped, not queued and burst-applied at resume. Test: Task 10.
5. **Browser key auto-repeat on Space / rotate / hold** — holding Space must hard-drop exactly once. Test: Task 13.

---

## File Map

```
package.json, tsconfig.base.json, vitest.config.ts, eslint.config.js,
.prettierrc, .prettierignore, .gitignore, .nvmrc, README.md
packages/engine/
  package.json, tsconfig.json, src/globals.d.ts
  src/constants.ts   board size, timings, spawn columns
  src/types.ts       PieceType, ActivePiece, PlayerState, GameState, ACTIONS
  src/pieces.ts      shapes, rotation states, pieceCells, SRS kick tables
  src/bag.ts         seeded PRNG + 7-bag
  src/board.ts       createBoard, collidesWithBoard, piecesOverlap, clearFullRows
  src/scoring.ts     LINE_SCORES, levelForLines, gravityPerTick
  src/game.ts        createGame, applyInput, tick, ghostPiece, co-op rules
  src/protocol.ts    zod client-message schema, ServerMessage types
  src/index.ts
  test/*.test.ts, test/helpers.ts
packages/server/
  package.json, tsconfig.json
  src/room.ts        Room: slots, phases, loop, snapshots, reconnect
  src/roomManager.ts RoomManager + generateCode
  src/app.ts         startApp: http (healthz, static), ws routing
  src/index.ts       entrypoint (PORT, STATIC_DIR)
  test/testClient.ts, test/helpers.ts, test/*.test.ts
packages/client/
  package.json, tsconfig.json, vite.config.ts, index.html
  src/main.tsx, src/App.tsx, src/vite-env.d.ts
  src/styles/theme.css, game.css, overlays.css
  src/net/connection.ts, session.ts, sessionInstance.ts, useSession.ts, prediction.ts
  src/input/keyboard.ts, useKeyboard.ts
  src/render/colors.ts, drawList.ts, board.ts
  src/ui/Panel.tsx, ControlsList.tsx, HomeScreen.tsx, LobbyScreen.tsx, GameScreen.tsx,
         PlayerSide.tsx, PiecePreview.tsx, ScoreBar.tsx, GameOverOverlay.tsx, useNow.ts, labels.ts
  test/*.test.ts
e2e/coop.spec.ts, playwright.config.ts
Dockerfile, .dockerignore, fly.toml, .github/workflows/ci.yml, .github/workflows/deploy.yml
```

---

### Task 1: Monorepo scaffold + engine types, constants, and pieces

**Files:**
- Create: `.nvmrc`, `.gitignore`, `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc`, `.prettierignore`
- Create: `packages/engine/package.json`, `packages/engine/tsconfig.json`, `packages/engine/src/globals.d.ts`, `packages/engine/src/constants.ts`, `packages/engine/src/types.ts`, `packages/engine/src/pieces.ts`, `packages/engine/src/index.ts`
- Test: `packages/engine/test/pieces.test.ts`

**Interfaces:**
- Produces: constants `BOARD_WIDTH=20`, `VISIBLE_ROWS=20`, `HIDDEN_ROWS=2`, `BOARD_HEIGHT=22`, `TICKS_PER_SECOND=60`, `LOCK_DELAY_TICKS=30`, `MAX_LOCK_RESETS=15`, `SOFT_DROP_FACTOR=20`, `NEXT_QUEUE_SIZE=5`, `LINES_PER_LEVEL=20`, `SPAWN_X=[3,13]`; types `PieceType`, `PIECE_TYPES`, `PlayerId (0|1)`, `Rotation`, `Cell`, `Board`, `ActivePiece {type,x,y,rot}`, `BagState {rng, remaining}`, `PlayerState`, `LineClear`, `GameState`, `ACTIONS`, `Action`; functions `pieceCells(piece): [number, number][]`, `kickOffsets(type, from, to): [number, number][]` (y-down).

- [ ] **Step 1: Ensure Node 22**

Run: `node --version`
If it prints anything below `v22`, install Node 22 (e.g. `brew install node@22 && brew link --overwrite --force node@22`, or `nvm install 22 && nvm use 22`) and re-run until it prints `v22.x`. **If you cannot install software, stop and ask the human partner to upgrade Node.**

- [ ] **Step 2: Create root config files**

`.nvmrc`:
```
22
```

`.gitignore`:
```
node_modules/
dist/
playwright-report/
test-results/
.DS_Store
*.log
```

`package.json`:
```json
{
  "name": "multi-tetris",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "concurrently -n server,client -c magenta,cyan \"npm run dev -w @mt/server\" \"npm run dev -w @mt/client\"",
    "build": "npm run build -w @mt/client && npm run build -w @mt/server",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "e2e": "playwright test"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "types": []
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
});
```

`eslint.config.js`:
```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/client/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
```

`.prettierrc`:
```json
{ "singleQuote": true, "printWidth": 100 }
```

`.prettierignore`:
```
node_modules
dist
package-lock.json
playwright-report
test-results
docs
```

- [ ] **Step 3: Create the engine package skeleton**

`packages/engine/package.json`:
```json
{
  "name": "@mt/engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc -p ." }
}
```

`packages/engine/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

`packages/engine/src/globals.d.ts` (the engine targets both Node and browsers; declare only the one global it uses):
```ts
declare function structuredClone<T>(value: T): T;
```

- [ ] **Step 4: Install root dev dependencies**

Run:
```bash
npm install -D typescript vitest eslint @eslint/js typescript-eslint eslint-plugin-react-hooks prettier concurrently @types/node
```
Expected: `package-lock.json` created, no errors.

- [ ] **Step 5: Write constants and types**

`packages/engine/src/constants.ts`:
```ts
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

/** Left edge of each player's spawn box. O pieces spawn one column further right. */
export const SPAWN_X: readonly [number, number] = [3, 13];
```

`packages/engine/src/types.ts`:
```ts
export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export const PIECE_TYPES: readonly PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export type PlayerId = 0 | 1;
export type Rotation = 0 | 1 | 2 | 3;
export type Cell = PieceType | null;
/** board[y][x]; y = 0 is the top hidden row. */
export type Board = Cell[][];

export interface ActivePiece {
  type: PieceType;
  /** Column of the piece's bounding box left edge. */
  x: number;
  /** Row of the piece's bounding box top edge. */
  y: number;
  rot: Rotation;
}

export interface BagState {
  rng: number;
  remaining: PieceType[];
}

export interface PlayerState {
  active: ActivePiece | null;
  /** Piece waiting to spawn (set while `active` is null). */
  nextSpawn: PieceType | null;
  hold: PieceType | null;
  holdUsed: boolean;
  /** Always NEXT_QUEUE_SIZE long. */
  queue: PieceType[];
  bag: BagState;
  softDrop: boolean;
  gravityAcc: number;
  lockTimer: number;
  lockResets: number;
}

export interface LineClear {
  count: number;
  tick: number;
}

export interface GameState {
  tick: number;
  board: Board;
  players: [PlayerState, PlayerState];
  score: number;
  lines: number;
  level: number;
  /** Increments on every lock; lets observers detect locks cheaply. */
  lockCount: number;
  lastClear: LineClear | null;
  over: boolean;
}

export const ACTIONS = [
  'left',
  'right',
  'softDropOn',
  'softDropOff',
  'hardDrop',
  'rotateCW',
  'rotateCCW',
  'hold',
] as const;
export type Action = (typeof ACTIONS)[number];
```

- [ ] **Step 6: Write the failing pieces test**

`packages/engine/test/pieces.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { kickOffsets, pieceCells } from '../src/pieces';
import type { Rotation } from '../src/types';

const sorted = (cells: [number, number][]) =>
  [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0]);

describe('pieceCells', () => {
  it('places a spawn-orientation T relative to its box origin', () => {
    expect(sorted(pieceCells({ type: 'T', x: 3, y: 0, rot: 0 }))).toEqual([
      [4, 0],
      [3, 1],
      [4, 1],
      [5, 1],
    ]);
  });

  it('rotates I clockwise into the third column of its box (SRS)', () => {
    expect(sorted(pieceCells({ type: 'I', x: 0, y: 0, rot: 1 }))).toEqual([
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
    ]);
  });

  it('T in state R points right', () => {
    expect(sorted(pieceCells({ type: 'T', x: 0, y: 0, rot: 1 }))).toEqual([
      [1, 0],
      [1, 1],
      [2, 1],
      [1, 2],
    ]);
  });

  it('O occupies the same cells in every rotation', () => {
    const base = sorted(pieceCells({ type: 'O', x: 4, y: 0, rot: 0 }));
    for (const rot of [1, 2, 3] as Rotation[]) {
      expect(sorted(pieceCells({ type: 'O', x: 4, y: 0, rot }))).toEqual(base);
    }
  });
});

describe('kickOffsets', () => {
  it('converts the SRS JLSTZ 0->R table to y-down', () => {
    expect(kickOffsets('T', 0, 1)).toEqual([
      [0, 0],
      [-1, 0],
      [-1, -1],
      [0, 2],
      [-1, 2],
    ]);
  });

  it('uses the I table for I pieces', () => {
    expect(kickOffsets('I', 0, 1)).toEqual([
      [0, 0],
      [-2, 0],
      [1, 0],
      [-2, 1],
      [1, -2],
    ]);
  });

  it('never kicks O', () => {
    expect(kickOffsets('O', 0, 1)).toEqual([[0, 0]]);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run packages/engine/test/pieces.test.ts`
Expected: FAIL — cannot resolve `../src/pieces`.

- [ ] **Step 8: Implement pieces**

`packages/engine/src/pieces.ts`:
```ts
import type { ActivePiece, PieceType, Rotation } from './types';

type Offset = [number, number];

/** Spawn-orientation cells as [dx, dy] within an n×n box (SRS, y-down). */
const SPAWN_SHAPES: Record<PieceType, { size: number; cells: Offset[] }> = {
  I: { size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  J: { size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  O: { size: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  S: { size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  T: { size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  Z: { size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
};

function rotateClockwise(cells: Offset[], size: number): Offset[] {
  return cells.map(([x, y]): Offset => [size - 1 - y, x]);
}

const SHAPES = Object.fromEntries(
  Object.entries(SPAWN_SHAPES).map(([type, { size, cells }]) => {
    const rotations: Offset[][] = [cells];
    for (let r = 1; r < 4; r++) rotations.push(rotateClockwise(rotations[r - 1], size));
    return [type, rotations];
  }),
) as Record<PieceType, Offset[][]>;

export function pieceCells(piece: ActivePiece): [number, number][] {
  return SHAPES[piece.type][piece.rot].map(([dx, dy]): Offset => [piece.x + dx, piece.y + dy]);
}

// SRS kick tables exactly as published (y-up). kickOffsets() negates y for our y-down board.
const JLSTZ_KICKS: Record<string, Offset[]> = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};

const I_KICKS: Record<string, Offset[]> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

/** Kick offsets [dx, dy] (y-down) to try, in order, when rotating `from` → `to`. */
export function kickOffsets(type: PieceType, from: Rotation, to: Rotation): Offset[] {
  if (type === 'O') return [[0, 0]];
  const table = type === 'I' ? I_KICKS : JLSTZ_KICKS;
  return table[`${from}>${to}`].map(([x, y]): Offset => [x, y === 0 ? 0 : -y]);
}
```

(`y === 0 ? 0 : -y` avoids `-0`, which `toEqual` treats as different from `0`.)

`packages/engine/src/index.ts`:
```ts
export * from './constants';
export * from './types';
export * from './pieces';
```

- [ ] **Step 9: Run tests, typecheck, lint**

Run: `npx vitest run packages/engine/test/pieces.test.ts && npm run typecheck && npm run lint`
Expected: 7 tests PASS; typecheck and lint print no errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold monorepo and add engine piece definitions"
```

---

### Task 2: Seeded 7-bag randomizer

**Files:**
- Create: `packages/engine/src/bag.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/bag.test.ts`

**Interfaces:**
- Consumes: `PIECE_TYPES`, `BagState`, `PieceType` (Task 1).
- Produces: `nextRandom(state: number): [number, number]` (value in [0,1), next state), `createBag(seed: number): BagState`, `drawPiece(bag: BagState): [PieceType, BagState]` (pure; does not mutate input).

- [ ] **Step 1: Write the failing test**

`packages/engine/test/bag.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createBag, drawPiece } from '../src/bag';
import { PIECE_TYPES, type BagState, type PieceType } from '../src/types';

function draw(bag: BagState, n: number): [PieceType[], BagState] {
  const out: PieceType[] = [];
  let b = bag;
  for (let i = 0; i < n; i++) {
    const [piece, next] = drawPiece(b);
    out.push(piece);
    b = next;
  }
  return [out, b];
}

describe('7-bag', () => {
  it('every group of 7 draws contains each piece exactly once', () => {
    let bag = createBag(42);
    for (let group = 0; group < 5; group++) {
      const [pieces, next] = draw(bag, 7);
      expect([...pieces].sort()).toEqual([...PIECE_TYPES].sort());
      bag = next;
    }
  });

  it('is deterministic for a given seed', () => {
    expect(draw(createBag(1234), 21)[0]).toEqual(draw(createBag(1234), 21)[0]);
  });

  it('differs across seeds', () => {
    expect(draw(createBag(1), 14)[0]).not.toEqual(draw(createBag(2), 14)[0]);
  });

  it('does not mutate the input bag', () => {
    const bag = createBag(9);
    const [, after] = drawPiece(bag);
    drawPiece(after);
    expect(bag).toEqual(createBag(9));
    const snapshot = structuredClone(after);
    drawPiece(after);
    expect(after).toEqual(snapshot);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/engine/test/bag.test.ts`
Expected: FAIL — cannot resolve `../src/bag`.

- [ ] **Step 3: Implement**

`packages/engine/src/bag.ts`:
```ts
import { PIECE_TYPES, type BagState, type PieceType } from './types';

/** mulberry32: returns a float in [0, 1) and the next 32-bit state. */
export function nextRandom(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(next ^ (next >>> 15), next | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, next];
}

export function createBag(seed: number): BagState {
  return { rng: seed >>> 0, remaining: [] };
}

export function drawPiece(bag: BagState): [PieceType, BagState] {
  let rng = bag.rng;
  let remaining = bag.remaining;
  if (remaining.length === 0) {
    const pieces = [...PIECE_TYPES];
    for (let i = pieces.length - 1; i > 0; i--) {
      const [r, next] = nextRandom(rng);
      rng = next;
      const j = Math.floor(r * (i + 1));
      [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }
    remaining = pieces;
  }
  const [piece, ...rest] = remaining;
  return [piece, { rng, remaining: rest }];
}
```

Append to `packages/engine/src/index.ts`:
```ts
export * from './bag';
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/engine/test/bag.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): add seeded 7-bag randomizer"
```

---

### Task 3: Board and collision primitives

**Files:**
- Create: `packages/engine/src/board.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/board.test.ts`

**Interfaces:**
- Consumes: `pieceCells` (Task 1), constants.
- Produces: `createBoard(): Board`, `collidesWithBoard(board, piece): boolean` (walls, floor, above-top, occupied cells), `piecesOverlap(a, b): boolean`, `clearFullRows(board): { board: Board; cleared: number }` (pure).

- [ ] **Step 1: Write the failing test**

`packages/engine/test/board.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { clearFullRows, collidesWithBoard, createBoard, piecesOverlap } from '../src/board';
import { BOARD_HEIGHT, BOARD_WIDTH } from '../src/constants';

describe('createBoard', () => {
  it('is 22 rows of 20 empty cells', () => {
    const board = createBoard();
    expect(board).toHaveLength(BOARD_HEIGHT);
    for (const row of board) expect(row).toEqual(Array(BOARD_WIDTH).fill(null));
  });
});

describe('collidesWithBoard', () => {
  const board = createBoard();
  it('is false for a free position', () => {
    expect(collidesWithBoard(board, { type: 'T', x: 3, y: 0, rot: 0 })).toBe(false);
  });
  it('detects the left and right walls', () => {
    expect(collidesWithBoard(board, { type: 'T', x: -1, y: 5, rot: 0 })).toBe(true);
    expect(collidesWithBoard(board, { type: 'T', x: 18, y: 5, rot: 0 })).toBe(true);
    expect(collidesWithBoard(board, { type: 'T', x: 17, y: 5, rot: 0 })).toBe(false);
  });
  it('detects the floor and the ceiling', () => {
    expect(collidesWithBoard(board, { type: 'T', x: 3, y: 20, rot: 0 })).toBe(false);
    expect(collidesWithBoard(board, { type: 'T', x: 3, y: 21, rot: 0 })).toBe(true);
    expect(collidesWithBoard(board, { type: 'T', x: 3, y: -1, rot: 0 })).toBe(true);
  });
  it('detects occupied cells', () => {
    const filled = createBoard();
    filled[1][4] = 'Z';
    expect(collidesWithBoard(filled, { type: 'T', x: 3, y: 0, rot: 0 })).toBe(true);
  });
});

describe('piecesOverlap', () => {
  it('detects shared cells only', () => {
    const a = { type: 'O' as const, x: 4, y: 4, rot: 0 as const };
    expect(piecesOverlap(a, { type: 'O', x: 5, y: 5, rot: 0 })).toBe(true);
    expect(piecesOverlap(a, { type: 'O', x: 6, y: 4, rot: 0 })).toBe(false);
  });
});

describe('clearFullRows', () => {
  it('removes full rows, shifts rows above down, and does not mutate the input', () => {
    const board = createBoard();
    board[21] = Array(BOARD_WIDTH).fill('I');
    board[20][7] = 'T';
    const before = structuredClone(board);
    const { board: next, cleared } = clearFullRows(board);
    expect(cleared).toBe(1);
    expect(next[21][7]).toBe('T');
    expect(next[21].filter((c) => c !== null)).toHaveLength(1);
    expect(next[0]).toEqual(Array(BOARD_WIDTH).fill(null));
    expect(next).toHaveLength(BOARD_HEIGHT);
    expect(board).toEqual(before);
  });

  it('reports zero when nothing is full', () => {
    expect(clearFullRows(createBoard()).cleared).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/engine/test/board.test.ts`
Expected: FAIL — cannot resolve `../src/board`.

- [ ] **Step 3: Implement**

`packages/engine/src/board.ts`:
```ts
import { BOARD_HEIGHT, BOARD_WIDTH } from './constants';
import { pieceCells } from './pieces';
import type { ActivePiece, Board, Cell } from './types';

function emptyRow(): Cell[] {
  return Array<Cell>(BOARD_WIDTH).fill(null);
}

export function createBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, emptyRow);
}

/** True if the piece is outside the well or overlaps a locked cell. */
export function collidesWithBoard(board: Board, piece: ActivePiece): boolean {
  return pieceCells(piece).some(
    ([x, y]) => x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_HEIGHT || board[y][x] !== null,
  );
}

export function piecesOverlap(a: ActivePiece, b: ActivePiece): boolean {
  const occupied = new Set(pieceCells(a).map(([x, y]) => `${x},${y}`));
  return pieceCells(b).some(([x, y]) => occupied.has(`${x},${y}`));
}

export function clearFullRows(board: Board): { board: Board; cleared: number } {
  const kept = board.filter((row) => row.some((cell) => cell === null));
  const cleared = board.length - kept.length;
  if (cleared === 0) return { board, cleared: 0 };
  return {
    board: [...Array.from({ length: cleared }, emptyRow), ...kept.map((row) => [...row])],
    cleared,
  };
}
```

Append to `packages/engine/src/index.ts`:
```ts
export * from './board';
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/engine/test/board.test.ts`
Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): add board and collision primitives"
```

---

### Task 4: Game creation, spawning, movement, and rotation (with co-op blocking)

**Files:**
- Create: `packages/engine/src/game.ts`, `packages/engine/test/helpers.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/movement.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `PLAYER_IDS`, `otherPlayer(p)`, `spawnPosition(type, player): ActivePiece`, `createGame(seeds: readonly [number, number]): GameState`, `collides(state, player, piece): boolean` (board **or** partner's active piece), `applyInput(state, player, action): GameState` (pure; handles left/right/rotateCW/rotateCCW/softDropOn/softDropOff in this task). Test helpers `gameWith({p0?, p1?, rows?})`, `row(cols)`, `fullRowExcept(...gaps)`.

- [ ] **Step 1: Write test helpers**

`packages/engine/test/helpers.ts`:
```ts
import { BOARD_WIDTH } from '../src/constants';
import { createGame } from '../src/game';
import type { ActivePiece, Cell, GameState } from '../src/types';

/**
 * A game with fully controlled pieces: no active pieces unless given, nothing waiting to spawn,
 * and optional board rows (20-char strings, '.' = empty, anything else = locked 'Z').
 */
export function gameWith(
  opts: { p0?: ActivePiece; p1?: ActivePiece; rows?: Record<number, string> } = {},
): GameState {
  const state = createGame([1, 2]);
  state.players[0].active = opts.p0 ?? null;
  state.players[1].active = opts.p1 ?? null;
  state.players[0].nextSpawn = null;
  state.players[1].nextSpawn = null;
  for (const [y, text] of Object.entries(opts.rows ?? {})) {
    if (text.length !== BOARD_WIDTH) throw new Error(`row ${y} must be ${BOARD_WIDTH} chars`);
    state.board[Number(y)] = [...text].map((c): Cell => (c === '.' ? null : 'Z'));
  }
  return state;
}

export function row(filledCols: number[]): string {
  return Array.from({ length: BOARD_WIDTH }, (_, x) => (filledCols.includes(x) ? 'X' : '.')).join('');
}

export function fullRowExcept(...gaps: number[]): string {
  return Array.from({ length: BOARD_WIDTH }, (_, x) => (gaps.includes(x) ? '.' : 'X')).join('');
}
```

- [ ] **Step 2: Write the failing test**

`packages/engine/test/movement.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyInput, createGame, spawnPosition } from '../src/game';
import { NEXT_QUEUE_SIZE } from '../src/constants';
import { gameWith } from './helpers';

describe('createGame', () => {
  it('spawns each player at their own spawn column with a full next queue', () => {
    const s = createGame([11, 22]);
    for (const player of [0, 1] as const) {
      const p = s.players[player];
      expect(p.active).toEqual(spawnPosition(p.active!.type, player));
      expect(p.queue).toHaveLength(NEXT_QUEUE_SIZE);
      expect(p.nextSpawn).toBeNull();
      expect(p.hold).toBeNull();
    }
    expect(s.players[0].active!.x).toBeLessThan(10);
    expect(s.players[1].active!.x).toBeGreaterThanOrEqual(10);
    expect(s.score).toBe(0);
    expect(s.level).toBe(1);
  });

  it('spawns O one column further right', () => {
    expect(spawnPosition('O', 0)).toEqual({ type: 'O', x: 4, y: 0, rot: 0 });
    expect(spawnPosition('T', 1)).toEqual({ type: 'T', x: 13, y: 0, rot: 0 });
  });
});

describe('movement', () => {
  it('moves left and right', () => {
    const s = gameWith({ p0: { type: 'T', x: 5, y: 5, rot: 0 } });
    expect(applyInput(s, 0, 'left').players[0].active!.x).toBe(4);
    expect(applyInput(s, 0, 'right').players[0].active!.x).toBe(6);
  });

  it('stops at walls', () => {
    const s = gameWith({ p0: { type: 'T', x: 0, y: 5, rot: 0 } });
    expect(applyInput(s, 0, 'left').players[0].active!.x).toBe(0);
  });

  it("is blocked by the partner's active piece (co-op rule 1)", () => {
    const s = gameWith({
      p0: { type: 'O', x: 3, y: 10, rot: 0 },
      p1: { type: 'O', x: 5, y: 10, rot: 0 },
    });
    expect(applyInput(s, 0, 'right').players[0].active!.x).toBe(3);
    expect(applyInput(s, 1, 'left').players[1].active!.x).toBe(5);
  });

  it('does not mutate the previous state', () => {
    const s = gameWith({ p0: { type: 'T', x: 5, y: 5, rot: 0 } });
    const before = structuredClone(s);
    applyInput(s, 0, 'left');
    expect(s).toEqual(before);
  });

  it('sets and clears the soft drop flag', () => {
    const s = gameWith({ p0: { type: 'T', x: 5, y: 5, rot: 0 } });
    const on = applyInput(s, 0, 'softDropOn');
    expect(on.players[0].softDrop).toBe(true);
    expect(applyInput(on, 0, 'softDropOff').players[0].softDrop).toBe(false);
  });
});

describe('rotation', () => {
  it('rotates in place when free', () => {
    const s = gameWith({ p0: { type: 'T', x: 5, y: 5, rot: 0 } });
    expect(applyInput(s, 0, 'rotateCW').players[0].active).toEqual({ type: 'T', x: 5, y: 5, rot: 1 });
    expect(applyInput(s, 0, 'rotateCCW').players[0].active).toEqual({ type: 'T', x: 5, y: 5, rot: 3 });
  });

  it('wall-kicks off the left wall', () => {
    const s = gameWith({ p0: { type: 'T', x: -1, y: 5, rot: 1 } });
    expect(applyInput(s, 0, 'rotateCW').players[0].active).toEqual({ type: 'T', x: 0, y: 5, rot: 2 });
  });

  it("treats the partner's piece as solid during kick tests", () => {
    const free = gameWith({ p0: { type: 'T', x: 3, y: 5, rot: 0 } });
    expect(applyInput(free, 0, 'rotateCW').players[0].active!.x).toBe(3);

    const blocked = gameWith({
      p0: { type: 'T', x: 3, y: 5, rot: 0 },
      p1: { type: 'O', x: 4, y: 7, rot: 0 },
    });
    expect(applyInput(blocked, 0, 'rotateCW').players[0].active).toEqual({
      type: 'T',
      x: 2,
      y: 5,
      rot: 1,
    });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run packages/engine/test/movement.test.ts`
Expected: FAIL — cannot resolve `../src/game`.

- [ ] **Step 4: Implement**

`packages/engine/src/game.ts`:
```ts
import { createBag, drawPiece } from './bag';
import { collidesWithBoard, createBoard, piecesOverlap } from './board';
import { MAX_LOCK_RESETS, NEXT_QUEUE_SIZE, SPAWN_X } from './constants';
import { kickOffsets } from './pieces';
import type {
  Action,
  ActivePiece,
  GameState,
  PieceType,
  PlayerId,
  PlayerState,
  Rotation,
} from './types';

export const PLAYER_IDS: readonly PlayerId[] = [0, 1];

export function otherPlayer(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}

export function spawnPosition(type: PieceType, player: PlayerId): ActivePiece {
  return { type, x: SPAWN_X[player] + (type === 'O' ? 1 : 0), y: 0, rot: 0 };
}

export function createGame(seeds: readonly [number, number]): GameState {
  const state: GameState = {
    tick: 0,
    board: createBoard(),
    players: [createPlayer(seeds[0]), createPlayer(seeds[1])],
    score: 0,
    lines: 0,
    level: 1,
    lockCount: 0,
    lastClear: null,
    over: false,
  };
  for (const player of PLAYER_IDS) trySpawn(state, player);
  return state;
}

/** Collision against walls, floor, locked cells, and the partner's active piece. */
export function collides(state: GameState, player: PlayerId, piece: ActivePiece): boolean {
  if (collidesWithBoard(state.board, piece)) return true;
  const partner = state.players[otherPlayer(player)].active;
  return partner !== null && piecesOverlap(piece, partner);
}

export function applyInput(prev: GameState, player: PlayerId, action: Action): GameState {
  if (prev.over) return prev;
  const state = structuredClone(prev);
  const p = state.players[player];
  switch (action) {
    case 'left':
      if (tryShift(state, player, -1, 0)) afterManualMove(state, player);
      break;
    case 'right':
      if (tryShift(state, player, 1, 0)) afterManualMove(state, player);
      break;
    case 'rotateCW':
      if (tryRotate(state, player, 1)) afterManualMove(state, player);
      break;
    case 'rotateCCW':
      if (tryRotate(state, player, -1)) afterManualMove(state, player);
      break;
    case 'softDropOn':
      p.softDrop = true;
      break;
    case 'softDropOff':
      p.softDrop = false;
      break;
    case 'hardDrop':
    case 'hold':
      break;
  }
  return state;
}

// ---- internal helpers (all mutate the already-cloned state) ----

function createPlayer(seed: number): PlayerState {
  const p: PlayerState = {
    active: null,
    nextSpawn: null,
    hold: null,
    holdUsed: false,
    queue: [],
    bag: createBag(seed),
    softDrop: false,
    gravityAcc: 0,
    lockTimer: 0,
    lockResets: 0,
  };
  fillQueue(p);
  p.nextSpawn = takeNext(p);
  return p;
}

function fillQueue(p: PlayerState): void {
  while (p.queue.length < NEXT_QUEUE_SIZE) {
    const [piece, bag] = drawPiece(p.bag);
    p.bag = bag;
    p.queue.push(piece);
  }
}

function takeNext(p: PlayerState): PieceType {
  const piece = p.queue.shift()!;
  fillQueue(p);
  return piece;
}

/** Spawns `nextSpawn` if possible: game over if locked cells block it, wait if the partner does. */
function trySpawn(state: GameState, player: PlayerId): void {
  const p = state.players[player];
  if (p.active !== null || p.nextSpawn === null) return;
  const piece = spawnPosition(p.nextSpawn, player);
  if (collidesWithBoard(state.board, piece)) {
    state.over = true;
    return;
  }
  const partner = state.players[otherPlayer(player)].active;
  if (partner !== null && piecesOverlap(piece, partner)) return;
  p.active = piece;
  p.nextSpawn = null;
  p.gravityAcc = 0;
  p.lockTimer = 0;
  p.lockResets = 0;
}

function tryShift(state: GameState, player: PlayerId, dx: number, dy: number): boolean {
  const p = state.players[player];
  if (!p.active) return false;
  const moved = { ...p.active, x: p.active.x + dx, y: p.active.y + dy };
  if (collides(state, player, moved)) return false;
  p.active = moved;
  return true;
}

function tryRotate(state: GameState, player: PlayerId, dir: 1 | -1): boolean {
  const p = state.players[player];
  const piece = p.active;
  if (!piece) return false;
  const to = ((piece.rot + dir + 4) % 4) as Rotation;
  for (const [dx, dy] of kickOffsets(piece.type, piece.rot, to)) {
    const candidate = { ...piece, rot: to, x: piece.x + dx, y: piece.y + dy };
    if (!collides(state, player, candidate)) {
      p.active = candidate;
      return true;
    }
  }
  return false;
}

/** Resting on the floor or locked cells (the partner's piece does not count). */
function onGround(state: GameState, piece: ActivePiece): boolean {
  return collidesWithBoard(state.board, { ...piece, y: piece.y + 1 });
}

function afterManualMove(state: GameState, player: PlayerId): void {
  const p = state.players[player];
  if (p.active && onGround(state, p.active) && p.lockResets < MAX_LOCK_RESETS) {
    p.lockTimer = 0;
    p.lockResets += 1;
  }
}
```

Append to `packages/engine/src/index.ts`:
```ts
export * from './game';
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run packages/engine && npm run typecheck`
Expected: all engine tests PASS; typecheck clean. Then run `npm run lint` — expected clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(engine): add game creation, spawning, movement and SRS rotation"
```

---

### Task 5: Gravity, soft drop, lock delay, and the hover rule

**Files:**
- Create: `packages/engine/src/scoring.ts`
- Modify: `packages/engine/src/game.ts`, `packages/engine/src/index.ts`, `packages/engine/test/helpers.ts`
- Test: `packages/engine/test/scoring.test.ts`, `packages/engine/test/gravity.test.ts`

**Interfaces:**
- Consumes: Task 4 internals.
- Produces: `LINE_SCORES: readonly number[]`, `levelForLines(lines): number`, `gravityPerTick(level): number`; `tick(state): GameState` (pure). Internal `lockPiece(state, player)` (no line clears yet — Task 7 adds them). Test helper `runTicks(state, n)`.

- [ ] **Step 1: Write the failing scoring test**

`packages/engine/test/scoring.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { LINE_SCORES, gravityPerTick, levelForLines } from '../src/scoring';

describe('scoring tables', () => {
  it('uses guideline line scores', () => {
    expect(LINE_SCORES).toEqual([0, 100, 300, 500, 800]);
  });

  it('levels up every 20 lines', () => {
    expect(levelForLines(0)).toBe(1);
    expect(levelForLines(19)).toBe(1);
    expect(levelForLines(20)).toBe(2);
    expect(levelForLines(45)).toBe(3);
  });

  it('falls one row per second at level 1 and speeds up with level', () => {
    expect(gravityPerTick(1)).toBeCloseTo(1 / 60, 10);
    expect(gravityPerTick(2)).toBeCloseTo(1 / (0.793 * 60), 6);
    expect(gravityPerTick(5)).toBeGreaterThan(gravityPerTick(4));
  });

  it('clamps the gravity curve at level 20', () => {
    expect(gravityPerTick(30)).toBe(gravityPerTick(20));
  });
});
```

- [ ] **Step 2: Implement scoring**

`packages/engine/src/scoring.ts`:
```ts
import { LINES_PER_LEVEL, TICKS_PER_SECOND } from './constants';

export const LINE_SCORES: readonly number[] = [0, 100, 300, 500, 800];

export function levelForLines(lines: number): number {
  return 1 + Math.floor(lines / LINES_PER_LEVEL);
}

/** Rows fallen per tick under normal gravity (Tetris Guideline curve). */
export function gravityPerTick(level: number): number {
  const l = Math.min(level, 20);
  const secondsPerRow = Math.pow(0.8 - (l - 1) * 0.007, l - 1);
  return 1 / (secondsPerRow * TICKS_PER_SECOND);
}
```

Append to `packages/engine/src/index.ts`:
```ts
export * from './scoring';
```

Run: `npx vitest run packages/engine/test/scoring.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 3: Add `runTicks` to test helpers**

In `packages/engine/test/helpers.ts`, change the game import line to:
```ts
import { createGame, tick } from '../src/game';
```
and append:
```ts
export function runTicks(state: GameState, n: number): GameState {
  let s = state;
  for (let i = 0; i < n; i++) s = tick(s);
  return s;
}
```

- [ ] **Step 4: Write the failing gravity/lock test**

`packages/engine/test/gravity.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyInput, tick } from '../src/game';
import { gameWith, runTicks } from './helpers';

describe('gravity', () => {
  it('drops one row per second at level 1', () => {
    const s = gameWith({ p0: { type: 'T', x: 3, y: 2, rot: 0 } });
    expect(runTicks(s, 59).players[0].active!.y).toBe(2);
    expect(runTicks(s, 60).players[0].active!.y).toBe(3);
  });

  it('soft drop falls 20x faster and scores 1 per row', () => {
    const s = applyInput(gameWith({ p0: { type: 'T', x: 3, y: 2, rot: 0 } }), 0, 'softDropOn');
    const after = runTicks(s, 30);
    expect(after.players[0].active!.y).toBe(12);
    expect(after.score).toBe(10);
  });

  it('advances the tick counter and does not mutate the previous state', () => {
    const s = gameWith({ p0: { type: 'T', x: 3, y: 2, rot: 0 } });
    const before = structuredClone(s);
    const next = tick(s);
    expect(next.tick).toBe(1);
    expect(s).toEqual(before);
  });
});

describe('lock delay', () => {
  it('locks after 30 ticks resting on the floor, then spawns the next piece', () => {
    const s = gameWith({ p0: { type: 'O', x: 8, y: 20, rot: 0 } });
    const almost = runTicks(s, 29);
    expect(almost.lockCount).toBe(0);
    const locked = tick(almost);
    expect(locked.lockCount).toBe(1);
    expect(locked.board[21][8]).toBe('O');
    expect(locked.board[20][9]).toBe('O');
    expect(locked.players[0].active!.y).toBe(0);
  });

  it('resets on move/rotate while grounded, at most 15 times', () => {
    let s = gameWith({ p0: { type: 'O', x: 8, y: 20, rot: 0 } });
    for (let i = 0; i < 15; i++) {
      s = runTicks(s, 20);
      s = applyInput(s, 0, i % 2 === 0 ? 'left' : 'right');
    }
    expect(s.lockCount).toBe(0);
    s = runTicks(s, 20);
    s = applyInput(s, 0, 'left'); // 16th move: no reset
    s = runTicks(s, 9);
    expect(s.lockCount).toBe(0);
    s = tick(s);
    expect(s.lockCount).toBe(1);
  });
});

describe("hover rule (resting on the partner's active piece)", () => {
  it('never runs the lock timer while resting only on the partner', () => {
    let s = gameWith({
      p0: { type: 'O', x: 8, y: 18, rot: 0 },
      p1: { type: 'O', x: 8, y: 20, rot: 0 },
    });
    s = runTicks(s, 29);
    expect(s.players[0].lockTimer).toBe(0);
    expect(s.players[1].lockTimer).toBe(29);
    s = tick(s); // partner locks underneath
    expect(s.lockCount).toBe(1);
    expect(s.players[0].active).toEqual({ type: 'O', x: 8, y: 18, rot: 0 });
    s = runTicks(s, 29);
    expect(s.lockCount).toBe(1);
    s = tick(s); // now resting on locked cells, so it locks after 30 ticks
    expect(s.lockCount).toBe(2);
  });

  it('resumes falling when the partner moves away', () => {
    let s = gameWith({
      p0: { type: 'O', x: 8, y: 18, rot: 0 },
      p1: { type: 'O', x: 8, y: 20, rot: 0 },
    });
    s = applyInput(s, 1, 'right');
    s = applyInput(s, 1, 'right');
    s = runTicks(s, 60);
    expect(s.players[0].active!.y).toBe(19);
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `npx vitest run packages/engine/test/gravity.test.ts`
Expected: FAIL — `tick` is not exported from `../src/game`.

- [ ] **Step 6: Implement `tick` and `lockPiece`**

In `packages/engine/src/game.ts`, replace the constants import with:
```ts
import {
  LOCK_DELAY_TICKS,
  MAX_LOCK_RESETS,
  NEXT_QUEUE_SIZE,
  SOFT_DROP_FACTOR,
  SPAWN_X,
} from './constants';
```
replace `import { kickOffsets } from './pieces';` with:
```ts
import { kickOffsets, pieceCells } from './pieces';
import { gravityPerTick } from './scoring';
```

Add these exported/internal functions after `applyInput`:
```ts
/** Float tolerance so that e.g. 60 × (1/60) counts as a full row. */
const GRAVITY_EPSILON = 1e-9;

export function tick(prev: GameState): GameState {
  if (prev.over) return prev;
  const state = structuredClone(prev);
  state.tick += 1;
  for (const player of PLAYER_IDS) {
    trySpawn(state, player);
    if (state.over) return state;
    stepPlayer(state, player);
    if (state.over) return state;
  }
  return state;
}

function stepPlayer(state: GameState, player: PlayerId): void {
  const p = state.players[player];
  if (!p.active) return;

  p.gravityAcc += gravityPerTick(state.level) * (p.softDrop ? SOFT_DROP_FACTOR : 1);
  while (p.gravityAcc >= 1 - GRAVITY_EPSILON) {
    p.gravityAcc -= 1;
    if (tryShift(state, player, 0, 1)) {
      p.lockTimer = 0;
      if (p.softDrop) state.score += 1;
    } else {
      p.gravityAcc = 0;
      break;
    }
  }

  if (p.active && onGround(state, p.active)) {
    p.lockTimer += 1;
    if (p.lockTimer >= LOCK_DELAY_TICKS) lockPiece(state, player);
  } else {
    // Airborne or hovering on the partner's piece: the lock timer does not run.
    p.lockTimer = 0;
  }
}

function lockPiece(state: GameState, player: PlayerId): void {
  const p = state.players[player];
  const piece = p.active;
  if (!piece) return;
  for (const [x, y] of pieceCells(piece)) state.board[y][x] = piece.type;
  p.active = null;
  p.holdUsed = false;
  p.lockTimer = 0;
  p.lockResets = 0;
  p.gravityAcc = 0;
  state.lockCount += 1;
  p.nextSpawn = takeNext(p);
  trySpawn(state, player);
}
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run packages/engine && npm run typecheck && npm run lint`
Expected: all PASS, no type or lint errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(engine): add gravity, soft drop, lock delay and hover rule"
```

---

### Task 6: Hard drop, hold, ghost piece, and spawn rules

**Files:**
- Modify: `packages/engine/src/game.ts`
- Test: `packages/engine/test/drop-hold.test.ts`

**Interfaces:**
- Consumes: Task 5 internals (`lockPiece`, `onGround`, `tryShift`, `trySpawn`, `takeNext`).
- Produces: `applyInput` now handles `hardDrop` and `hold`; `ghostPiece(state, player): ActivePiece | null` (lowest reachable position, partner counts as solid).

- [ ] **Step 1: Write the failing test**

`packages/engine/test/drop-hold.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyInput, ghostPiece, spawnPosition, tick } from '../src/game';
import { gameWith, row } from './helpers';

describe('hard drop', () => {
  it('drops to the floor, scores 2 per cell, and locks immediately', () => {
    const s = applyInput(gameWith({ p0: { type: 'T', x: 3, y: 0, rot: 0 } }), 0, 'hardDrop');
    expect(s.score).toBe(40);
    expect(s.lockCount).toBe(1);
    expect(s.board[21].slice(3, 6)).toEqual(['T', 'T', 'T']);
    expect(s.board[20][4]).toBe('T');
    expect(s.players[0].active).not.toBeNull();
  });

  it("hovers instead of locking when it lands on the partner's active piece", () => {
    const s = applyInput(
      gameWith({
        p0: { type: 'O', x: 3, y: 0, rot: 0 },
        p1: { type: 'O', x: 3, y: 20, rot: 0 },
      }),
      0,
      'hardDrop',
    );
    expect(s.lockCount).toBe(0);
    expect(s.players[0].active).toEqual({ type: 'O', x: 3, y: 18, rot: 0 });
    expect(s.score).toBe(36);
  });
});

describe('ghostPiece', () => {
  it('shows the landing position, stopping on the partner', () => {
    const alone = gameWith({ p0: { type: 'T', x: 3, y: 0, rot: 0 } });
    expect(ghostPiece(alone, 0)).toEqual({ type: 'T', x: 3, y: 20, rot: 0 });
    const shared = gameWith({
      p0: { type: 'O', x: 3, y: 0, rot: 0 },
      p1: { type: 'O', x: 3, y: 20, rot: 0 },
    });
    expect(ghostPiece(shared, 0)!.y).toBe(18);
    expect(ghostPiece(gameWith(), 0)).toBeNull();
  });
});

describe('hold', () => {
  it('stores the active piece and spawns the next one when hold is empty', () => {
    const s = gameWith({ p0: { type: 'T', x: 3, y: 10, rot: 0 } });
    const expectedNext = s.players[0].queue[0];
    const held = applyInput(s, 0, 'hold');
    expect(held.players[0].hold).toBe('T');
    expect(held.players[0].active).toEqual(spawnPosition(expectedNext, 0));
    expect(held.players[0].holdUsed).toBe(true);
  });

  it('only works once per piece', () => {
    const once = applyInput(gameWith({ p0: { type: 'T', x: 3, y: 10, rot: 0 } }), 0, 'hold');
    expect(applyInput(once, 0, 'hold')).toEqual(once);
  });

  it('swaps with the held piece, which respawns in spawn orientation', () => {
    const s = gameWith({ p0: { type: 'T', x: 7, y: 10, rot: 2 } });
    s.players[0].hold = 'I';
    const swapped = applyInput(s, 0, 'hold');
    expect(swapped.players[0].active).toEqual(spawnPosition('I', 0));
    expect(swapped.players[0].hold).toBe('T');
  });

  it('becomes available again after the next lock', () => {
    const held = applyInput(gameWith({ p0: { type: 'T', x: 3, y: 10, rot: 0 } }), 0, 'hold');
    expect(applyInput(held, 0, 'hardDrop').players[0].holdUsed).toBe(false);
  });
});

describe('spawn rules', () => {
  it("defers a spawn blocked by the partner's piece until it moves away", () => {
    let s = gameWith({
      p0: { type: 'T', x: 3, y: 10, rot: 0 },
      p1: { type: 'O', x: 4, y: 0, rot: 0 },
    });
    s = applyInput(s, 0, 'hold');
    expect(s.players[0].active).toBeNull();
    expect(s.players[0].nextSpawn).not.toBeNull();
    s = tick(s);
    expect(s.players[0].active).toBeNull();
    expect(s.over).toBe(false);
    for (let i = 0; i < 3; i++) s = applyInput(s, 1, 'right');
    s = tick(s);
    expect(s.players[0].active).not.toBeNull();
  });

  it('ends the game when locked cells block the spawn (block-out)', () => {
    const s = gameWith({
      p0: { type: 'O', x: 10, y: 20, rot: 0 },
      rows: { 1: row([3, 4, 5, 6]) },
    });
    const over = applyInput(s, 0, 'hardDrop');
    expect(over.over).toBe(true);
    expect(tick(over)).toBe(over);
    expect(applyInput(over, 0, 'left')).toBe(over);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/engine/test/drop-hold.test.ts`
Expected: FAIL — `ghostPiece` is not exported.

- [ ] **Step 3: Implement**

In `packages/engine/src/game.ts`, replace the two no-op switch cases:
```ts
    case 'hardDrop':
    case 'hold':
      break;
```
with:
```ts
    case 'hardDrop':
      hardDrop(state, player);
      break;
    case 'hold':
      hold(state, player);
      break;
```

Add after `tick`:
```ts
export function ghostPiece(state: GameState, player: PlayerId): ActivePiece | null {
  let piece = state.players[player].active;
  if (!piece) return null;
  while (!collides(state, player, { ...piece, y: piece.y + 1 })) piece = { ...piece, y: piece.y + 1 };
  return piece;
}

function hardDrop(state: GameState, player: PlayerId): void {
  const p = state.players[player];
  if (!p.active) return;
  let cells = 0;
  while (tryShift(state, player, 0, 1)) cells += 1;
  state.score += 2 * cells;
  if (p.active && onGround(state, p.active)) lockPiece(state, player);
  else p.lockTimer = 0; // landed on the partner's piece: hover
}

function hold(state: GameState, player: PlayerId): void {
  const p = state.players[player];
  if (!p.active || p.holdUsed) return;
  const current = p.active.type;
  p.nextSpawn = p.hold ?? takeNext(p);
  p.hold = current;
  p.holdUsed = true;
  p.active = null;
  trySpawn(state, player);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/engine && npm run typecheck && npm run lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): add hard drop, hold, ghost piece and spawn rules"
```

---

### Task 7: Line clears, scoring, levels, post-clear nudge, determinism

**Files:**
- Modify: `packages/engine/src/game.ts`
- Test: `packages/engine/test/clears.test.ts`

**Interfaces:**
- Consumes: `clearFullRows` (Task 3), `LINE_SCORES`, `levelForLines` (Task 5).
- Produces: `lockPiece` now clears rows, scores `LINE_SCORES[n] × level` (level **before** the clear), updates `lines`, `level`, `lastClear = { count, tick }`, and nudges the partner's active piece up until free (game over if it cannot be freed).

- [ ] **Step 1: Write the failing test**

`packages/engine/test/clears.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyInput, createGame, tick } from '../src/game';
import { ACTIONS, type GameState, type PlayerId } from '../src/types';
import { fullRowExcept, gameWith, row } from './helpers';

describe('line clears', () => {
  it('clears a double and scores 300 × level plus drop points', () => {
    const s = applyInput(
      gameWith({
        p0: { type: 'O', x: 0, y: 18, rot: 0 },
        rows: { 20: fullRowExcept(0, 1), 21: fullRowExcept(0, 1) },
      }),
      0,
      'hardDrop',
    );
    expect(s.score).toBe(304);
    expect(s.lines).toBe(2);
    expect(s.lastClear).toEqual({ count: 2, tick: 0 });
    expect(s.board[20].every((c) => c === null)).toBe(true);
    expect(s.board[21].every((c) => c === null)).toBe(true);
  });

  it('clears a tetris', () => {
    const s = applyInput(
      gameWith({
        p0: { type: 'I', x: -2, y: 10, rot: 1 },
        rows: {
          18: fullRowExcept(0),
          19: fullRowExcept(0),
          20: fullRowExcept(0),
          21: fullRowExcept(0),
        },
      }),
      0,
      'hardDrop',
    );
    expect(s.score).toBe(816);
    expect(s.lines).toBe(4);
    expect(s.lastClear!.count).toBe(4);
  });

  it('levels up at 20 lines, scoring the clear at the old level', () => {
    const s = gameWith({ p0: { type: 'I', x: -2, y: 18, rot: 1 }, rows: { 21: fullRowExcept(0) } });
    s.lines = 19;
    const after = applyInput(s, 0, 'hardDrop');
    expect(after.lines).toBe(20);
    expect(after.level).toBe(2);
    expect(after.score).toBe(100);
  });

  it('multiplies by the current level', () => {
    const s = gameWith({ p0: { type: 'I', x: -2, y: 18, rot: 1 }, rows: { 21: fullRowExcept(0) } });
    s.lines = 20;
    s.level = 2;
    expect(applyInput(s, 0, 'hardDrop').score).toBe(200);
  });
});

describe('post-clear nudge', () => {
  it("pushes the partner's piece up until it no longer overlaps shifted cells", () => {
    const s = gameWith({
      p0: { type: 'I', x: -2, y: 10, rot: 1 },
      p1: { type: 'O', x: 15, y: 18, rot: 0 },
      rows: {
        17: row([15]),
        20: row([15, 16]),
        21: fullRowExcept(0),
      },
    });
    const after = applyInput(s, 0, 'hardDrop');
    expect(after.lines).toBe(1);
    expect(after.board[18][15]).toBe('Z');
    expect(after.players[1].active).toEqual({ type: 'O', x: 15, y: 16, rot: 0 });
    expect(after.over).toBe(false);
  });
});

describe('determinism', () => {
  function play(): GameState {
    let s = createGame([7, 9]);
    let r = 12345;
    for (let i = 0; i < 3000; i++) {
      r = (Math.imul(r, 1103515245) + 12345) >>> 0;
      if (r % 3 === 0) {
        const player = ((r >>> 4) % 2) as PlayerId;
        s = applyInput(s, player, ACTIONS[(r >>> 8) % ACTIONS.length]);
      }
      s = tick(s);
    }
    return s;
  }

  it('produces identical states for identical inputs', () => {
    expect(play()).toEqual(play());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/engine/test/clears.test.ts`
Expected: FAIL — rows are not cleared (score 4 instead of 304, etc.). The determinism test may already pass.

- [ ] **Step 3: Implement**

In `packages/engine/src/game.ts`:

Change the board import to:
```ts
import { clearFullRows, collidesWithBoard, createBoard, piecesOverlap } from './board';
```
Change the scoring import to:
```ts
import { LINE_SCORES, gravityPerTick, levelForLines } from './scoring';
```

In `lockPiece`, replace:
```ts
  state.lockCount += 1;
  p.nextSpawn = takeNext(p);
  trySpawn(state, player);
}
```
with:
```ts
  state.lockCount += 1;

  const { board, cleared } = clearFullRows(state.board);
  if (cleared > 0) {
    state.board = board;
    state.score += LINE_SCORES[cleared] * state.level;
    state.lines += cleared;
    state.level = levelForLines(state.lines);
    state.lastClear = { count: cleared, tick: state.tick };
    nudgeUp(state, otherPlayer(player));
    if (state.over) return;
  }

  p.nextSpawn = takeNext(p);
  trySpawn(state, player);
}

/** After rows shift down, move a player's active piece up until it no longer overlaps locked cells. */
function nudgeUp(state: GameState, player: PlayerId): void {
  const p = state.players[player];
  while (p.active && collidesWithBoard(state.board, p.active)) {
    if (p.active.y <= 0) {
      state.over = true;
      return;
    }
    p.active = { ...p.active, y: p.active.y - 1 };
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/engine && npm run typecheck && npm run lint`
Expected: all engine tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): add line clears, scoring, levels and post-clear nudge"
```

---

### Task 8: Network protocol

**Files:**
- Create: `packages/engine/src/protocol.ts`
- Modify: `packages/engine/src/index.ts`, `packages/engine/package.json` (zod dependency)
- Test: `packages/engine/test/protocol.test.ts`

**Interfaces:**
- Consumes: `ACTIONS`, `GameState`, `PlayerId`.
- Produces: `clientMessageSchema`, `ClientMessage`, `parseClientMessage(raw: string): ClientMessage | null`, `RoomPhase`, `SlotInfo`, `RoomStateMessage`, `ErrorReason`, `ServerMessage`.

- [ ] **Step 1: Install zod**

Run: `npm install zod -w @mt/engine`
Expected: `packages/engine/package.json` gains `"dependencies": { "zod": ... }`.

- [ ] **Step 2: Write the failing test**

`packages/engine/test/protocol.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../src/protocol';

describe('parseClientMessage', () => {
  it('accepts every well-formed message type', () => {
    expect(parseClientMessage('{"type":"createRoom"}')).toEqual({ type: 'createRoom' });
    expect(parseClientMessage('{"type":"ready","ready":true}')).toEqual({ type: 'ready', ready: true });
    expect(parseClientMessage('{"type":"input","seq":3,"action":"hardDrop"}')).toEqual({
      type: 'input',
      seq: 3,
      action: 'hardDrop',
    });
    expect(parseClientMessage('{"type":"playAgain"}')).toEqual({ type: 'playAgain' });
    expect(parseClientMessage('{"type":"ping","t":12.5}')).toEqual({ type: 'ping', t: 12.5 });
  });

  it('normalizes room codes typed in lowercase or with spaces', () => {
    expect(parseClientMessage('{"type":"joinRoom","code":" k7qx "}')).toEqual({
      type: 'joinRoom',
      code: 'K7QX',
    });
    expect(
      parseClientMessage('{"type":"joinRoom","code":"K7QX","reconnectToken":"abc"}'),
    ).toEqual({ type: 'joinRoom', code: 'K7QX', reconnectToken: 'abc' });
  });

  it('rejects malformed input', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage('{"type":"nope"}')).toBeNull();
    expect(parseClientMessage('{"type":"input","seq":1,"action":"teleport"}')).toBeNull();
    expect(parseClientMessage('{"type":"input","seq":-1,"action":"left"}')).toBeNull();
    expect(parseClientMessage('{"type":"joinRoom","code":"TOOLONG"}')).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run packages/engine/test/protocol.test.ts`
Expected: FAIL — cannot resolve `../src/protocol`.

- [ ] **Step 4: Implement**

`packages/engine/src/protocol.ts`:
```ts
import { z } from 'zod';
import { ACTIONS, type GameState, type PlayerId } from './types';

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('createRoom') }),
  z.object({
    type: z.literal('joinRoom'),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{4}$/),
    reconnectToken: z.string().max(64).optional(),
  }),
  z.object({ type: z.literal('ready'), ready: z.boolean() }),
  z.object({ type: z.literal('input'), seq: z.number().int().nonnegative(), action: z.enum(ACTIONS) }),
  z.object({ type: z.literal('playAgain') }),
  z.object({ type: z.literal('ping'), t: z.number() }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export function parseClientMessage(raw: string): ClientMessage | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = clientMessageSchema.safeParse(json);
  return result.success ? result.data : null;
}

export type RoomPhase = 'lobby' | 'countdown' | 'playing' | 'paused' | 'over';

export interface SlotInfo {
  connected: boolean;
  ready: boolean;
}

export interface RoomStateMessage {
  type: 'roomState';
  code: string;
  you: PlayerId;
  players: [SlotInfo | null, SlotInfo | null];
  phase: RoomPhase;
  reconnectToken: string;
}

export type ErrorReason = 'roomNotFound' | 'roomFull' | 'badMessage';

export type ServerMessage =
  | RoomStateMessage
  | { type: 'gameStart'; countdownTicks: number }
  | { type: 'snapshot'; tick: number; state: GameState; ackSeq: number }
  | { type: 'gameOver'; score: number; lines: number; level: number }
  | { type: 'partnerDisconnected'; graceMs: number }
  | { type: 'partnerReconnected' }
  | { type: 'error'; reason: ErrorReason }
  | { type: 'pong'; t: number };
```

Append to `packages/engine/src/index.ts`:
```ts
export * from './protocol';
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run packages/engine && npm run typecheck && npm run lint`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(engine): add client/server protocol with validation"
```

---

### Task 9: Server — rooms, lobby, and HTTP/WebSocket app

**Files:**
- Create: `packages/server/package.json`, `packages/server/tsconfig.json`, `packages/server/src/room.ts`, `packages/server/src/roomManager.ts`, `packages/server/src/app.ts`
- Test: `packages/server/test/testClient.ts`, `packages/server/test/helpers.ts`, `packages/server/test/roomManager.test.ts`, `packages/server/test/lobby.test.ts`

**Interfaces:**
- Consumes: `@mt/engine` (`createGame`, `applyInput`, `tick`, `parseClientMessage`, protocol types).
- Produces:
  - `RoomClient { send(msg: ServerMessage): void }`, `RoomOptions { tickMs, countdownTicks, reconnectGraceMs, snapshotEveryTicks, inputsPerSecond }`, `DEFAULT_ROOM_OPTIONS`.
  - `class Room(code, opts, now?)` with `phase`, `lastActivity`, `join(client, token?) → {ok:true, player} | {ok:false, reason:'roomFull'}`, `leave(player, client)`, `setReady(player, ready)`, `input(player, seq, action)`, `playAgain(player)`, `isEmpty()`, `dispose()`.
  - `generateCode(random?)`, `class RoomManager(roomOptions, idleExpiryMs, now?)` with `create()`, `get(code)`, `sweep()`, `size`, `disposeAll()`.
  - `startApp({ port, staticDir?, roomOptions?, idleExpiryMs?, sweepIntervalMs? }) → Promise<RunningApp { port, rooms, close() }>`.

This task writes the complete `Room` (including game loop and reconnect logic) because its phases are tightly coupled; Tasks 10 and 11 add the tests that exercise the loop and disconnect paths.

- [ ] **Step 1: Create the package and install dependencies**

`packages/server/package.json`:
```json
{
  "name": "@mt/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "esbuild src/index.ts --bundle --platform=node --target=node22 --format=cjs --outfile=dist/index.cjs --external:bufferutil --external:utf-8-validate",
    "typecheck": "tsc -p ."
  },
  "dependencies": {
    "@mt/engine": "*"
  }
}
```

`packages/server/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "test"]
}
```

Run:
```bash
npm install ws sirv -w @mt/server
npm install -D @types/ws tsx esbuild -w @mt/server
```
Expected: installs succeed; `node_modules/@mt/engine` is a symlink to `packages/engine`.

- [ ] **Step 2: Write the test client and helpers**

`packages/server/test/testClient.ts`:
```ts
import WebSocket from 'ws';
import type { ClientMessage, ServerMessage } from '@mt/engine';

type Msg<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

export class TestClient {
  readonly received: ServerMessage[] = [];
  private readonly consumed = new Set<number>();
  private waiters: (() => void)[] = [];

  private constructor(private readonly ws: WebSocket) {
    ws.on('message', (data) => {
      this.received.push(JSON.parse(data.toString()) as ServerMessage);
      for (const wake of this.waiters.splice(0)) wake();
    });
  }

  static connect(port: number): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      ws.once('open', () => resolve(new TestClient(ws)));
      ws.once('error', reject);
    });
  }

  send(msg: ClientMessage | string): void {
    this.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  /** Resolves with the oldest not-yet-consumed message of `type` matching `predicate`. */
  async next<T extends ServerMessage['type']>(
    type: T,
    predicate: (m: Msg<T>) => boolean = () => true,
    timeoutMs = 2000,
  ): Promise<Msg<T>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      for (let i = 0; i < this.received.length; i++) {
        const m = this.received[i];
        if (!this.consumed.has(i) && m.type === type && predicate(m as Msg<T>)) {
          this.consumed.add(i);
          return m as Msg<T>;
        }
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`timed out waiting for ${type}`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, remaining);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  /** Most recent message of `type`, consumed or not. */
  latest<T extends ServerMessage['type']>(type: T): Msg<T> | undefined {
    return [...this.received].reverse().find((m) => m.type === type) as Msg<T> | undefined;
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.ws.readyState === WebSocket.CLOSED) return resolve();
      this.ws.once('close', () => resolve());
      this.ws.close();
    });
  }
}
```

`packages/server/test/helpers.ts`:
```ts
import { startApp, type RunningApp } from '../src/app';
import type { RoomOptions } from '../src/room';
import { TestClient } from './testClient';

export const TEST_ROOM_OPTIONS: RoomOptions = {
  tickMs: 5,
  countdownTicks: 2,
  reconnectGraceMs: 300,
  snapshotEveryTicks: 1,
  inputsPerSecond: 60,
};

export function startTestApp(
  overrides: Partial<RoomOptions> = {},
  extra: { staticDir?: string } = {},
): Promise<RunningApp> {
  return startApp({
    port: 0,
    roomOptions: { ...TEST_ROOM_OPTIONS, ...overrides },
    idleExpiryMs: 100,
    sweepIntervalMs: 20,
    ...extra,
  });
}

export async function createPair(app: RunningApp) {
  const a = await TestClient.connect(app.port);
  a.send({ type: 'createRoom' });
  const { code } = await a.next('roomState');
  const b = await TestClient.connect(app.port);
  b.send({ type: 'joinRoom', code });
  await b.next('roomState');
  return { a, b, code };
}

export async function startGame(a: TestClient, b: TestClient): Promise<void> {
  a.send({ type: 'ready', ready: true });
  b.send({ type: 'ready', ready: true });
  await a.next('roomState', (m) => m.phase === 'playing');
  await b.next('roomState', (m) => m.phase === 'playing');
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
```

- [ ] **Step 3: Write the failing tests**

`packages/server/test/roomManager.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { RoomManager, generateCode } from '../src/roomManager';
import { TEST_ROOM_OPTIONS } from './helpers';

describe('generateCode', () => {
  it('returns 4 characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}$/);
  });
});

describe('RoomManager', () => {
  it('creates rooms with unique codes and finds them', () => {
    const rooms = new RoomManager(TEST_ROOM_OPTIONS, 1000);
    const a = rooms.create();
    const b = rooms.create();
    expect(a.code).not.toBe(b.code);
    expect(rooms.get(a.code)).toBe(a);
    rooms.disposeAll();
  });

  it('sweeps rooms that are empty and idle past the expiry', () => {
    let now = 0;
    const rooms = new RoomManager(TEST_ROOM_OPTIONS, 1000, () => now);
    const room = rooms.create();
    now = 999;
    rooms.sweep();
    expect(rooms.get(room.code)).toBe(room);
    now = 1000;
    rooms.sweep();
    expect(rooms.get(room.code)).toBeUndefined();
    expect(rooms.size).toBe(0);
  });
});
```

`packages/server/test/lobby.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningApp } from '../src/app';
import { createPair, startTestApp } from './helpers';
import { TestClient } from './testClient';

let app: RunningApp;
beforeEach(async () => {
  app = await startTestApp();
});
afterEach(async () => {
  await app.close();
});

describe('lobby', () => {
  it('serves /healthz', async () => {
    const res = await fetch(`http://127.0.0.1:${app.port}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('creates a room and makes the creator player 0', async () => {
    const a = await TestClient.connect(app.port);
    a.send({ type: 'createRoom' });
    const state = await a.next('roomState');
    expect(state.code).toMatch(/^[A-Z0-9]{4}$/);
    expect(state.you).toBe(0);
    expect(state.phase).toBe('lobby');
    expect(state.players).toEqual([{ connected: true, ready: false }, null]);
    expect(state.reconnectToken.length).toBeGreaterThan(10);
  });

  it('lets a second player join by code and tells both', async () => {
    const { a, b } = await createPair(app);
    expect(b.latest('roomState')!.you).toBe(1);
    const seen = await a.next('roomState', (m) => m.players[1] !== null);
    expect(seen.players[1]).toEqual({ connected: true, ready: false });
  });

  it('accepts a lowercase code', async () => {
    const a = await TestClient.connect(app.port);
    a.send({ type: 'createRoom' });
    const { code } = await a.next('roomState');
    const b = await TestClient.connect(app.port);
    b.send({ type: 'joinRoom', code: ` ${code.toLowerCase()} ` });
    expect((await b.next('roomState')).code).toBe(code);
  });

  it('rejects a third player', async () => {
    const { code } = await createPair(app);
    const c = await TestClient.connect(app.port);
    c.send({ type: 'joinRoom', code });
    expect((await c.next('error')).reason).toBe('roomFull');
  });

  it('reports unknown rooms', async () => {
    const c = await TestClient.connect(app.port);
    c.send({ type: 'joinRoom', code: 'ZZZZ' });
    expect((await c.next('error')).reason).toBe('roomNotFound');
  });

  it('rejects malformed messages', async () => {
    const c = await TestClient.connect(app.port);
    c.send('{{{');
    expect((await c.next('error')).reason).toBe('badMessage');
  });

  it('answers ping with pong', async () => {
    const c = await TestClient.connect(app.port);
    c.send({ type: 'ping', t: 42 });
    expect((await c.next('pong')).t).toBe(42);
  });

  it('starts a countdown then play when both players are ready', async () => {
    const { a, b } = await createPair(app);
    a.send({ type: 'ready', ready: true });
    await b.next('roomState', (m) => m.players[0]?.ready === true);
    b.send({ type: 'ready', ready: true });
    expect((await a.next('gameStart')).countdownTicks).toBe(2);
    const snap = await b.next('snapshot');
    expect(snap.state.players[0].active).not.toBeNull();
    await a.next('roomState', (m) => m.phase === 'countdown');
    await a.next('roomState', (m) => m.phase === 'playing');
  });
});
```

- [ ] **Step 4: Run to verify they fail**

Run: `npx vitest run packages/server`
Expected: FAIL — cannot resolve `../src/app` / `../src/roomManager`.

- [ ] **Step 5: Implement `room.ts`**

`packages/server/src/room.ts`:
```ts
import { randomInt, randomUUID } from 'node:crypto';
import {
  applyInput,
  createGame,
  tick,
  type Action,
  type GameState,
  type PlayerId,
  type RoomPhase,
  type ServerMessage,
} from '@mt/engine';

export interface RoomClient {
  send(msg: ServerMessage): void;
}

export interface RoomOptions {
  tickMs: number;
  countdownTicks: number;
  reconnectGraceMs: number;
  snapshotEveryTicks: number;
  inputsPerSecond: number;
}

export const DEFAULT_ROOM_OPTIONS: RoomOptions = {
  tickMs: 1000 / 60,
  countdownTicks: 180,
  reconnectGraceMs: 30_000,
  snapshotEveryTicks: 2,
  inputsPerSecond: 60,
};

export type JoinResult = { ok: true; player: PlayerId } | { ok: false; reason: 'roomFull' };

interface Slot {
  token: string;
  client: RoomClient | null;
  ready: boolean;
  wantsPlayAgain: boolean;
  ackSeq: number;
  inputWindowStart: number;
  inputsInWindow: number;
}

interface QueuedInput {
  player: PlayerId;
  seq: number;
  action: Action;
}

const PLAYERS: readonly PlayerId[] = [0, 1];
const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

export class Room {
  phase: RoomPhase = 'lobby';
  lastActivity: number;
  private slots: [Slot | null, Slot | null] = [null, null];
  private game: GameState | null = null;
  private queue: QueuedInput[] = [];
  private loop: ReturnType<typeof setInterval> | null = null;
  private countdownLeft = 0;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly code: string,
    private readonly opts: RoomOptions,
    private readonly now: () => number = Date.now,
  ) {
    this.lastActivity = now();
  }

  join(client: RoomClient, reconnectToken?: string): JoinResult {
    this.touch();
    const returning = PLAYERS.find(
      (p) => reconnectToken !== undefined && this.slots[p]?.token === reconnectToken,
    );
    if (returning !== undefined) {
      const slot = this.slots[returning]!;
      slot.client = client;
      slot.ackSeq = 0;
      this.broadcastRoomState();
      if (this.phase === 'paused' && this.allConnected()) this.resume();
      else if (this.game) this.sendSnapshot(returning);
      return { ok: true, player: returning };
    }

    const free = PLAYERS.find((p) => this.slots[p] === null);
    if (free === undefined || (this.phase !== 'lobby' && this.phase !== 'over')) {
      return { ok: false, reason: 'roomFull' };
    }
    if (this.phase === 'over') this.backToLobby();
    this.slots[free] = {
      token: randomUUID(),
      client,
      ready: false,
      wantsPlayAgain: false,
      ackSeq: 0,
      inputWindowStart: 0,
      inputsInWindow: 0,
    };
    this.broadcastRoomState();
    return { ok: true, player: free };
  }

  /** Called when a socket closes. Ignored if the slot has since been taken over by a new socket. */
  leave(player: PlayerId, client: RoomClient): void {
    const slot = this.slots[player];
    if (!slot || slot.client !== client) return;
    this.touch();
    slot.client = null;

    if (this.phase === 'lobby' || this.phase === 'over') {
      this.slots[player] = null;
      this.broadcastRoomState();
      return;
    }

    if (this.phase !== 'paused') {
      this.phase = 'paused';
      this.stopLoop();
      this.graceTimer = setTimeout(() => this.endGame(), this.opts.reconnectGraceMs);
    }
    this.sendTo(other(player), { type: 'partnerDisconnected', graceMs: this.opts.reconnectGraceMs });
    this.broadcastRoomState();
  }

  setReady(player: PlayerId, ready: boolean): void {
    const slot = this.slots[player];
    if (this.phase !== 'lobby' || !slot) return;
    this.touch();
    slot.ready = ready;
    this.broadcastRoomState();
    if (PLAYERS.every((p) => this.slots[p]?.ready && this.slots[p]?.client)) this.startGame();
  }

  input(player: PlayerId, seq: number, action: Action): void {
    const slot = this.slots[player];
    if (this.phase !== 'playing' || !slot) return;
    const now = this.now();
    if (now - slot.inputWindowStart >= 1000) {
      slot.inputWindowStart = now;
      slot.inputsInWindow = 0;
    }
    if (slot.inputsInWindow >= this.opts.inputsPerSecond) return;
    slot.inputsInWindow += 1;
    this.queue.push({ player, seq, action });
  }

  playAgain(player: PlayerId): void {
    const slot = this.slots[player];
    if (this.phase !== 'over' || !slot) return;
    this.touch();
    slot.wantsPlayAgain = true;
    if (PLAYERS.every((p) => this.slots[p]?.wantsPlayAgain)) this.backToLobby();
  }

  isEmpty(): boolean {
    return PLAYERS.every((p) => !this.slots[p]?.client);
  }

  dispose(): void {
    this.stopLoop();
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
  }

  // ---- lifecycle ----

  private startGame(): void {
    this.game = createGame([randomInt(2 ** 32), randomInt(2 ** 32)]);
    this.queue = [];
    for (const p of PLAYERS) {
      const slot = this.slots[p]!;
      slot.ackSeq = 0;
      slot.wantsPlayAgain = false;
    }
    this.beginCountdown();
  }

  private resume(): void {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
    this.broadcast({ type: 'partnerReconnected' });
    this.beginCountdown();
  }

  private beginCountdown(): void {
    if (!this.game) return;
    // Keys released while disconnected/paused never reached us; don't resume with soft drop stuck on.
    for (const p of PLAYERS) this.game = applyInput(this.game, p, 'softDropOff');
    this.phase = 'countdown';
    this.countdownLeft = this.opts.countdownTicks;
    this.broadcastRoomState();
    this.broadcast({ type: 'gameStart', countdownTicks: this.opts.countdownTicks });
    this.broadcastSnapshot();
    this.stopLoop();
    this.loop = setInterval(() => this.step(), this.opts.tickMs);
  }

  private step(): void {
    if (!this.game) return;
    if (this.phase === 'countdown') {
      this.countdownLeft -= 1;
      if (this.countdownLeft <= 0) {
        this.phase = 'playing';
        this.queue = [];
        this.broadcastRoomState();
      }
      return;
    }
    if (this.phase !== 'playing') return;

    const locksBefore = this.game.lockCount;
    let game = this.game;
    for (const { player, seq, action } of this.queue) {
      game = applyInput(game, player, action);
      const slot = this.slots[player];
      if (slot) slot.ackSeq = seq;
    }
    this.queue = [];
    game = tick(game);
    this.game = game;

    if (game.over) {
      this.endGame();
      return;
    }
    if (game.lockCount !== locksBefore || game.tick % this.opts.snapshotEveryTicks === 0) {
      this.broadcastSnapshot();
    }
  }

  private endGame(): void {
    this.stopLoop();
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
    this.phase = 'over';
    for (const p of PLAYERS) if (this.slots[p] && !this.slots[p]!.client) this.slots[p] = null;
    if (this.game) {
      this.broadcastSnapshot();
      const { score, lines, level } = this.game;
      this.broadcast({ type: 'gameOver', score, lines, level });
    }
    this.broadcastRoomState();
  }

  private backToLobby(): void {
    this.phase = 'lobby';
    this.game = null;
    this.queue = [];
    for (const p of PLAYERS) {
      const slot = this.slots[p];
      if (slot) {
        slot.ready = false;
        slot.wantsPlayAgain = false;
      }
    }
    this.broadcastRoomState();
  }

  // ---- messaging ----

  private allConnected(): boolean {
    return PLAYERS.every((p) => this.slots[p]?.client);
  }

  private touch(): void {
    this.lastActivity = this.now();
  }

  private stopLoop(): void {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }

  private sendTo(player: PlayerId, msg: ServerMessage): void {
    this.slots[player]?.client?.send(msg);
  }

  private broadcast(msg: ServerMessage): void {
    for (const p of PLAYERS) this.sendTo(p, msg);
  }

  private sendSnapshot(player: PlayerId): void {
    const slot = this.slots[player];
    if (!this.game || !slot) return;
    this.sendTo(player, { type: 'snapshot', tick: this.game.tick, state: this.game, ackSeq: slot.ackSeq });
  }

  private broadcastSnapshot(): void {
    for (const p of PLAYERS) this.sendSnapshot(p);
  }

  private broadcastRoomState(): void {
    const players = this.slots.map((s) => (s ? { connected: s.client !== null, ready: s.ready } : null)) as [
      { connected: boolean; ready: boolean } | null,
      { connected: boolean; ready: boolean } | null,
    ];
    for (const p of PLAYERS) {
      const slot = this.slots[p];
      if (!slot) continue;
      this.sendTo(p, {
        type: 'roomState',
        code: this.code,
        you: p,
        players,
        phase: this.phase,
        reconnectToken: slot.token,
      });
    }
  }
}
```

- [ ] **Step 6: Implement `roomManager.ts`**

`packages/server/src/roomManager.ts`:
```ts
import { Room, type RoomOptions } from './room';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return code;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(
    private readonly roomOptions: RoomOptions,
    private readonly idleExpiryMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  create(): Room {
    let code = generateCode();
    while (this.rooms.has(code)) code = generateCode();
    const room = new Room(code, this.roomOptions, this.now);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  /** Deletes rooms nobody is connected to that have been idle for `idleExpiryMs`. */
  sweep(): void {
    const now = this.now();
    for (const [code, room] of this.rooms) {
      if (room.isEmpty() && now - room.lastActivity >= this.idleExpiryMs) {
        room.dispose();
        this.rooms.delete(code);
      }
    }
  }

  get size(): number {
    return this.rooms.size;
  }

  disposeAll(): void {
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
  }
}
```

- [ ] **Step 7: Implement `app.ts`**

`packages/server/src/app.ts`:
```ts
import { createServer } from 'node:http';
import sirv from 'sirv';
import { WebSocket, WebSocketServer } from 'ws';
import { parseClientMessage, type PlayerId, type ServerMessage } from '@mt/engine';
import { DEFAULT_ROOM_OPTIONS, type Room, type RoomClient, type RoomOptions } from './room';
import { RoomManager } from './roomManager';

export interface AppOptions {
  port: number;
  staticDir?: string;
  roomOptions?: Partial<RoomOptions>;
  idleExpiryMs?: number;
  sweepIntervalMs?: number;
}

export interface RunningApp {
  port: number;
  rooms: RoomManager;
  close(): Promise<void>;
}

export async function startApp(options: AppOptions): Promise<RunningApp> {
  const rooms = new RoomManager(
    { ...DEFAULT_ROOM_OPTIONS, ...options.roomOptions },
    options.idleExpiryMs ?? 10 * 60_000,
  );
  const serveStatic = options.staticDir ? sirv(options.staticDir, { single: true }) : null;

  const server = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }
    if (serveStatic) {
      serveStatic(req, res, () => {
        res.writeHead(404);
        res.end();
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
  wss.on('connection', (ws) => handleConnection(ws, rooms));

  const sweepTimer = setInterval(() => rooms.sweep(), options.sweepIntervalMs ?? 60_000);

  await new Promise<void>((resolve) => server.listen(options.port, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port;

  return {
    port,
    rooms,
    close: async () => {
      clearInterval(sweepTimer);
      rooms.disposeAll();
      for (const client of wss.clients) client.terminate();
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function handleConnection(ws: WebSocket, rooms: RoomManager): void {
  const client: RoomClient = {
    send: (msg: ServerMessage) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
  };
  let room: Room | null = null;
  let player: PlayerId | null = null;

  const enter = (target: Room, token?: string) => {
    const result = target.join(client, token);
    if (!result.ok) {
      client.send({ type: 'error', reason: result.reason });
      return;
    }
    room = target;
    player = result.player;
  };

  ws.on('message', (data) => {
    const msg = parseClientMessage(data.toString());
    if (!msg) {
      client.send({ type: 'error', reason: 'badMessage' });
      return;
    }
    switch (msg.type) {
      case 'ping':
        client.send({ type: 'pong', t: msg.t });
        return;
      case 'createRoom':
        if (!room) enter(rooms.create());
        return;
      case 'joinRoom': {
        if (room) return;
        const target = rooms.get(msg.code);
        if (!target) client.send({ type: 'error', reason: 'roomNotFound' });
        else enter(target, msg.reconnectToken);
        return;
      }
    }
    if (!room || player === null) return;
    switch (msg.type) {
      case 'ready':
        room.setReady(player, msg.ready);
        return;
      case 'input':
        room.input(player, msg.seq, msg.action);
        return;
      case 'playAgain':
        room.playAgain(player);
        return;
    }
  });

  ws.on('close', () => {
    if (room && player !== null) room.leave(player, client);
  });
}
```

- [ ] **Step 8: Run tests, typecheck, lint**

Run: `npx vitest run packages/server && npm run typecheck && npm run lint`
Expected: all server tests PASS; no errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(server): add rooms, lobby flow and websocket app"
```

---

### Task 10: Server — game loop, inputs, snapshots, game over

**Files:**
- Test: `packages/server/test/game.test.ts`
- Modify (only if a test exposes a bug): `packages/server/src/room.ts`

**Interfaces:**
- Consumes: `Room` loop from Task 9, `spawnPosition` from `@mt/engine`, test helpers.
- Produces: verified behavior — inputs acked via `snapshot.ackSeq`, partner sees moves, inputs outside `playing` dropped, rate limit 60/sec, block-out → `gameOver` → both `playAgain` → lobby.

- [ ] **Step 1: Write the tests**

`packages/server/test/game.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest';
import { spawnPosition } from '@mt/engine';
import type { RunningApp } from '../src/app';
import { createPair, sleep, startGame, startTestApp } from './helpers';

let app: RunningApp;
afterEach(async () => {
  await app.close();
});

describe('game loop', () => {
  it('applies inputs, acknowledges them, and shows them to the partner', async () => {
    app = await startTestApp();
    const { a, b } = await createPair(app);
    await startGame(a, b);
    const type = a.latest('snapshot')!.state.players[0].active!.type;
    const expectedX = spawnPosition(type, 0).x - 1;

    a.send({ type: 'input', seq: 1, action: 'left' });
    const mine = await a.next('snapshot', (m) => m.ackSeq === 1);
    expect(mine.state.players[0].active!.x).toBe(expectedX);
    await b.next('snapshot', (m) => m.state.players[0].active?.x === expectedX);
  });

  it('drops inputs sent during the countdown', async () => {
    app = await startTestApp({ countdownTicks: 40 });
    const { a, b } = await createPair(app);
    a.send({ type: 'ready', ready: true });
    b.send({ type: 'ready', ready: true });
    await a.next('gameStart');
    const type = (await a.next('snapshot')).state.players[0].active!.type;
    a.send({ type: 'input', seq: 1, action: 'left' });
    await a.next('roomState', (m) => m.phase === 'playing');
    a.send({ type: 'input', seq: 2, action: 'left' });
    const snap = await a.next('snapshot', (m) => m.ackSeq === 2);
    expect(snap.state.players[0].active!.x).toBe(spawnPosition(type, 0).x - 1);
  });

  it('rate-limits inputs to 60 per second per player', async () => {
    app = await startTestApp();
    const { a, b } = await createPair(app);
    await startGame(a, b);
    for (let seq = 1; seq <= 100; seq++) a.send({ type: 'input', seq, action: 'rotateCW' });
    await sleep(200);
    expect(a.latest('snapshot')!.ackSeq).toBe(60);
  });

  it('ends on block-out, then returns to the lobby when both choose play again', async () => {
    app = await startTestApp();
    const { a, b } = await createPair(app);
    await startGame(a, b);
    for (let seq = 1; seq <= 40; seq++) a.send({ type: 'input', seq, action: 'hardDrop' });
    const over = await a.next('gameOver');
    expect(over.score).toBeGreaterThan(0);
    await b.next('gameOver');
    await a.next('roomState', (m) => m.phase === 'over');

    a.send({ type: 'playAgain' });
    b.send({ type: 'playAgain' });
    const lobby = await a.next('roomState', (m) => m.phase === 'lobby');
    expect(lobby.players).toEqual([
      { connected: true, ready: false },
      { connected: true, ready: false },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run packages/server/test/game.test.ts`
Expected: 4 tests PASS. If any fail, use superpowers:systematic-debugging to find the root cause in `room.ts`, fix it, and re-run.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(server): cover game loop, input acks, rate limit and game over"
```

---

### Task 11: Server — disconnects, reconnects, room expiry, static hosting, entrypoint

**Files:**
- Create: `packages/server/src/index.ts`
- Test: `packages/server/test/connection.test.ts`

**Interfaces:**
- Consumes: `startApp`, `Room` reconnect logic (Task 9).
- Produces: `packages/server/src/index.ts` reading `PORT` (default 8080) and optional `STATIC_DIR`.

- [ ] **Step 1: Write the tests**

`packages/server/test/connection.test.ts`:
```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RunningApp } from '../src/app';
import { createPair, sleep, startGame, startTestApp } from './helpers';
import { TestClient } from './testClient';

let app: RunningApp;
afterEach(async () => {
  await app.close();
});

describe('disconnects', () => {
  it('frees the slot when a player leaves the lobby', async () => {
    app = await startTestApp();
    const { a, b } = await createPair(app);
    await b.close();
    await a.next('roomState', (m) => m.players[1] === null);
  });

  it('pauses mid-game and resumes when the player rejoins with their token', async () => {
    app = await startTestApp({ reconnectGraceMs: 2000 });
    const { a, b, code } = await createPair(app);
    await startGame(a, b);
    const token = b.latest('roomState')!.reconnectToken;

    await b.close();
    expect((await a.next('partnerDisconnected')).graceMs).toBe(2000);
    await a.next('roomState', (m) => m.phase === 'paused');

    const b2 = await TestClient.connect(app.port);
    b2.send({ type: 'joinRoom', code, reconnectToken: token });
    expect((await b2.next('roomState')).you).toBe(1);
    await b2.next('snapshot');
    await a.next('partnerReconnected');
    await a.next('gameStart');
    await a.next('roomState', (m) => m.phase === 'playing');
  });

  it('ends the game when the grace period runs out', async () => {
    app = await startTestApp({ reconnectGraceMs: 150 });
    const { a, b } = await createPair(app);
    await startGame(a, b);
    await b.close();
    await a.next('gameOver');
    const over = await a.next('roomState', (m) => m.phase === 'over');
    expect(over.players[1]).toBeNull();
  });

  it('expires rooms once everyone has left', async () => {
    app = await startTestApp();
    const { a, b, code } = await createPair(app);
    await a.close();
    await b.close();
    await sleep(300);
    const c = await TestClient.connect(app.port);
    c.send({ type: 'joinRoom', code });
    expect((await c.next('error')).reason).toBe('roomNotFound');
  });
});

describe('static hosting', () => {
  it('serves index.html for client-side routes like /r/CODE', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mt-static-'));
    writeFileSync(join(dir, 'index.html'), '<h1>multi-tetris-test</h1>');
    app = await startTestApp({}, { staticDir: dir });
    const res = await fetch(`http://127.0.0.1:${app.port}/r/ABCD`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('multi-tetris-test');
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run packages/server/test/connection.test.ts`
Expected: 5 tests PASS. If any fail, debug `room.ts`/`app.ts` with superpowers:systematic-debugging.

- [ ] **Step 3: Write the entrypoint**

`packages/server/src/index.ts`:
```ts
import { startApp } from './app';

const port = Number(process.env.PORT ?? 8080);
const staticDir = process.env.STATIC_DIR;

startApp({ port, staticDir }).then(({ port: actual }) => {
  console.log(`multi-tetris server listening on :${actual}${staticDir ? ` (static: ${staticDir})` : ''}`);
});
```

- [ ] **Step 4: Verify dev start and production build**

Run: `npm run build -w @mt/server && ls packages/server/dist`
Expected: `index.cjs` listed.

Run: `(PORT=8099 node packages/server/dist/index.cjs &) ; sleep 1; curl -s localhost:8099/healthz; pkill -f "dist/index.cjs"`
Expected: prints `ok`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): add reconnect/expiry coverage, static hosting and entrypoint"
```

---

### Task 12: Client scaffold, session store, Home and Lobby screens

**Files:**
- Create: `packages/client/package.json`, `packages/client/tsconfig.json`, `packages/client/vite.config.ts`, `packages/client/index.html`, `packages/client/src/vite-env.d.ts`, `packages/client/src/main.tsx`, `packages/client/src/App.tsx`, `packages/client/src/styles/theme.css`
- Create: `packages/client/src/net/connection.ts`, `packages/client/src/net/session.ts`, `packages/client/src/net/sessionInstance.ts`, `packages/client/src/net/useSession.ts`
- Create: `packages/client/src/ui/Panel.tsx`, `packages/client/src/ui/ControlsList.tsx`, `packages/client/src/ui/HomeScreen.tsx`, `packages/client/src/ui/LobbyScreen.tsx`
- Test: `packages/client/test/session.test.ts`

**Interfaces:**
- Consumes: `@mt/engine` protocol types, `TICKS_PER_SECOND`.
- Produces:
  - `ConnectionHandlers { onOpen, onMessage, onClose }`, `ConnectionLike { isOpen, send, close }`, `class Connection(url, handlers)`.
  - `normalizeCode(raw)`, `roomCodeFromPath(path)`, `SessionState`, `initialSession`, `reduceServerMessage(state, msg, now)`, `class Session(deps: SessionDeps)` with `subscribe`, `getState`, `connect()`, `createRoom()`, `joinRoom(code)`, `setReady(b)`, `playAgain()`, `sendInput(action)`, `leave()`.
  - `session` singleton (`sessionInstance.ts`), `useSession()` hook.
  - `Panel({label?, align?, className?, children})`, `ControlsList()`.

- [ ] **Step 1: Create the package and install dependencies**

`packages/client/package.json`:
```json
{
  "name": "@mt/client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc -p ."
  },
  "dependencies": {
    "@mt/engine": "*"
  }
}
```

`packages/client/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src", "test"]
}
```

`packages/client/vite.config.ts`:
```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/ws': { target: 'ws://localhost:8080', ws: true } },
  },
});
```

`packages/client/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Multi Tetris</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&family=Rajdhani:wght@500;600;700&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`packages/client/src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
```

Run:
```bash
npm install react react-dom -w @mt/client
npm install -D vite @vitejs/plugin-react @types/react @types/react-dom -w @mt/client
```

- [ ] **Step 2: Write the failing session test**

`packages/client/test/session.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientMessage, RoomStateMessage } from '@mt/engine';
import {
  Session,
  initialSession,
  normalizeCode,
  reduceServerMessage,
  roomCodeFromPath,
  type ConnectionHandlers,
  type ConnectionLike,
} from '../src/net/session';

class FakeConnection implements ConnectionLike {
  isOpen = true;
  sent: ClientMessage[] = [];
  send(msg: ClientMessage) {
    this.sent.push(msg);
  }
  close() {
    this.isOpen = false;
  }
}

function roomState(patch: Partial<RoomStateMessage> = {}): RoomStateMessage {
  return {
    type: 'roomState',
    code: 'K7QX',
    you: 0,
    players: [{ connected: true, ready: false }, null],
    phase: 'lobby',
    reconnectToken: 'tok-1',
    ...patch,
  };
}

function setup() {
  const conn = new FakeConnection();
  const store = new Map<string, string>();
  const paths: string[] = [];
  let handlers!: ConnectionHandlers;
  const connect = vi.fn((h: ConnectionHandlers) => {
    handlers = h;
    return conn;
  });
  const session = new Session({
    connect,
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
    now: () => 1000,
    setPath: (p) => paths.push(p),
  });
  session.connect();
  handlers.onOpen();
  return { session, conn, store, paths, connect, handlers: () => handlers };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('room codes', () => {
  it('normalizes typed codes', () => {
    expect(normalizeCode(' k7qx ')).toBe('K7QX');
  });
  it('reads codes from /r/CODE paths', () => {
    expect(roomCodeFromPath('/r/k7qx')).toBe('K7QX');
    expect(roomCodeFromPath('/r/K7QX/')).toBe('K7QX');
    expect(roomCodeFromPath('/')).toBeNull();
    expect(roomCodeFromPath('/r/TOOLONG')).toBeNull();
  });
});

describe('reduceServerMessage', () => {
  it('computes the countdown end from ticks', () => {
    const s = reduceServerMessage(initialSession, { type: 'gameStart', countdownTicks: 180 }, 1000);
    expect(s.countdownEndsAt).toBe(4000);
  });
  it('records ping from pong', () => {
    expect(reduceServerMessage(initialSession, { type: 'pong', t: 940 }, 1000).pingMs).toBe(60);
  });
  it('clears game state when the room returns to the lobby', () => {
    const inGame = { ...initialSession, gameOver: { score: 1, lines: 1, level: 1 } };
    const s = reduceServerMessage(inGame, roomState({ phase: 'lobby' }), 0);
    expect(s.gameOver).toBeNull();
    expect(s.room?.code).toBe('K7QX');
  });
  it('drops the room on roomNotFound (e.g. a stale rejoin)', () => {
    const inRoom = { ...initialSession, room: roomState() };
    const s = reduceServerMessage(inRoom, { type: 'error', reason: 'roomNotFound' }, 0);
    expect(s.room).toBeNull();
    expect(s.error).toBe('roomNotFound');
  });
});

describe('Session', () => {
  it('joinRoom normalizes the code and sends a stored reconnect token (page refresh)', () => {
    const { session, conn, store } = setup();
    store.set('mt:token:K7QX', 'saved-token');
    session.joinRoom(' k7qx ');
    expect(conn.sent.at(-1)).toEqual({ type: 'joinRoom', code: 'K7QX', reconnectToken: 'saved-token' });
  });

  it('stores the reconnect token and updates the URL on roomState', () => {
    const { store, paths, handlers } = setup();
    handlers().onMessage(roomState());
    expect(store.get('mt:token:K7QX')).toBe('tok-1');
    expect(paths.at(-1)).toBe('/r/K7QX');
  });

  it('only sends inputs while playing', () => {
    const { session, conn, handlers } = setup();
    handlers().onMessage(roomState({ phase: 'countdown' }));
    session.sendInput('left');
    expect(conn.sent.filter((m) => m.type === 'input')).toHaveLength(0);
    handlers().onMessage(roomState({ phase: 'playing' }));
    session.sendInput('left');
    expect(conn.sent.filter((m) => m.type === 'input')).toEqual([
      { type: 'input', seq: 1, action: 'left' },
    ]);
  });

  it('reconnects after a dropped connection and rejoins with its token', () => {
    const { session, conn, connect, handlers } = setup();
    handlers().onMessage(roomState({ phase: 'playing' }));
    handlers().onClose();
    expect(session.getState().status).toBe('reconnecting');
    vi.advanceTimersByTime(1000);
    expect(connect).toHaveBeenCalledTimes(2);
    handlers().onOpen();
    expect(conn.sent.at(-1)).toEqual({ type: 'joinRoom', code: 'K7QX', reconnectToken: 'tok-1' });
  });

  it('queues messages sent before the socket opens', () => {
    const conn = new FakeConnection();
    conn.isOpen = false;
    let handlers!: ConnectionHandlers;
    const session = new Session({
      connect: (h) => {
        handlers = h;
        return conn;
      },
      storage: { getItem: () => null, setItem: () => {} },
      now: () => 0,
      setPath: () => {},
    });
    session.connect();
    session.createRoom();
    expect(conn.sent).toEqual([]);
    conn.isOpen = true;
    handlers.onOpen();
    expect(conn.sent).toEqual([{ type: 'createRoom' }]);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run packages/client/test/session.test.ts`
Expected: FAIL — cannot resolve `../src/net/session`.

- [ ] **Step 4: Implement networking**

`packages/client/src/net/session.ts`:
```ts
import {
  TICKS_PER_SECOND,
  type Action,
  type ClientMessage,
  type GameState,
  type RoomStateMessage,
  type ServerMessage,
} from '@mt/engine';

export interface ConnectionHandlers {
  onOpen(): void;
  onMessage(msg: ServerMessage): void;
  onClose(): void;
}

export interface ConnectionLike {
  readonly isOpen: boolean;
  send(msg: ClientMessage): void;
  close(): void;
}

export interface SessionDeps {
  connect(handlers: ConnectionHandlers): ConnectionLike;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  now(): number;
  setPath(path: string): void;
}

export interface GameResult {
  score: number;
  lines: number;
  level: number;
}

export interface SessionState {
  status: 'connecting' | 'open' | 'reconnecting';
  room: RoomStateMessage | null;
  game: GameState | null;
  countdownEndsAt: number | null;
  partnerDisconnectedUntil: number | null;
  gameOver: GameResult | null;
  error: string | null;
  pingMs: number | null;
}

export const initialSession: SessionState = {
  status: 'connecting',
  room: null,
  game: null,
  countdownEndsAt: null,
  partnerDisconnectedUntil: null,
  gameOver: null,
  error: null,
  pingMs: null,
};

const RECONNECT_INTERVAL_MS = 1000;
const RECONNECT_WINDOW_MS = 30_000;
const PING_INTERVAL_MS = 2000;

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function roomCodeFromPath(path: string): string | null {
  const match = /^\/r\/([A-Za-z0-9]{4})\/?$/.exec(path);
  return match ? normalizeCode(match[1]) : null;
}

const tokenKey = (code: string) => `mt:token:${code}`;

export function reduceServerMessage(state: SessionState, msg: ServerMessage, now: number): SessionState {
  switch (msg.type) {
    case 'roomState':
      return msg.phase === 'lobby'
        ? {
            ...state,
            room: msg,
            error: null,
            game: null,
            gameOver: null,
            countdownEndsAt: null,
            partnerDisconnectedUntil: null,
          }
        : { ...state, room: msg, error: null };
    case 'gameStart':
      return {
        ...state,
        countdownEndsAt: now + (msg.countdownTicks * 1000) / TICKS_PER_SECOND,
        gameOver: null,
        partnerDisconnectedUntil: null,
      };
    case 'snapshot':
      return { ...state, game: msg.state };
    case 'gameOver':
      return {
        ...state,
        gameOver: { score: msg.score, lines: msg.lines, level: msg.level },
        partnerDisconnectedUntil: null,
      };
    case 'partnerDisconnected':
      return { ...state, partnerDisconnectedUntil: now + msg.graceMs };
    case 'partnerReconnected':
      return { ...state, partnerDisconnectedUntil: null };
    case 'error':
      return msg.reason === 'badMessage'
        ? { ...state, error: msg.reason }
        : { ...initialSession, status: state.status, pingMs: state.pingMs, error: msg.reason };
    case 'pong':
      return { ...state, pingMs: Math.max(0, Math.round(now - msg.t)) };
  }
}

export class Session {
  private state: SessionState = initialSession;
  private readonly listeners = new Set<() => void>();
  private conn: ConnectionLike | null = null;
  private outbox: ClientMessage[] = [];
  private seq = 0;
  private reconnectDeadline: number | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: SessionDeps) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getState = (): SessionState => this.state;

  connect(): void {
    this.conn = this.deps.connect({
      onOpen: () => this.handleOpen(),
      onMessage: (msg) => this.handleMessage(msg),
      onClose: () => this.handleClose(),
    });
  }

  createRoom(): void {
    this.setState({ error: null });
    this.send({ type: 'createRoom' });
  }

  joinRoom(rawCode: string): void {
    const code = normalizeCode(rawCode);
    const token = this.deps.storage.getItem(tokenKey(code));
    this.setState({ error: null });
    this.send(token ? { type: 'joinRoom', code, reconnectToken: token } : { type: 'joinRoom', code });
  }

  setReady(ready: boolean): void {
    this.send({ type: 'ready', ready });
  }

  playAgain(): void {
    this.send({ type: 'playAgain' });
  }

  sendInput(action: Action): void {
    if (this.state.room?.phase !== 'playing' || !this.conn?.isOpen) return;
    this.seq += 1;
    this.conn.send({ type: 'input', seq: this.seq, action });
  }

  leave(): void {
    this.stopPing();
    const conn = this.conn;
    this.conn = null;
    conn?.close();
    this.reconnectDeadline = null;
    this.outbox = [];
    this.state = { ...initialSession };
    this.emit();
    this.deps.setPath('/');
    this.connect();
  }

  private send(msg: ClientMessage): void {
    if (this.conn?.isOpen) this.conn.send(msg);
    else this.outbox.push(msg);
  }

  private handleOpen(): void {
    this.reconnectDeadline = null;
    this.setState({ status: 'open' });
    const room = this.state.room;
    if (room) this.conn?.send({ type: 'joinRoom', code: room.code, reconnectToken: room.reconnectToken });
    for (const msg of this.outbox.splice(0)) this.conn?.send(msg);
    this.startPing();
  }

  private handleMessage(msg: ServerMessage): void {
    if (msg.type === 'roomState') {
      this.deps.storage.setItem(tokenKey(msg.code), msg.reconnectToken);
      this.deps.setPath(`/r/${msg.code}`);
    }
    const hadRoom = this.state.room !== null;
    this.state = reduceServerMessage(this.state, msg, this.deps.now());
    if (hadRoom && !this.state.room) this.deps.setPath('/');
    this.emit();
  }

  private handleClose(): void {
    this.stopPing();
    this.conn = null;
    if (this.state.room) {
      const now = this.deps.now();
      this.reconnectDeadline ??= now + RECONNECT_WINDOW_MS;
      if (now > this.reconnectDeadline) {
        this.reconnectDeadline = null;
        this.state = { ...initialSession, error: 'connectionLost' };
        this.deps.setPath('/');
      }
    }
    this.setState({ status: 'reconnecting' });
    setTimeout(() => this.connect(), RECONNECT_INTERVAL_MS);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(
      () => this.conn?.send({ type: 'ping', t: this.deps.now() }),
      PING_INTERVAL_MS,
    );
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private setState(patch: Partial<SessionState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
```

`packages/client/src/net/connection.ts`:
```ts
import type { ClientMessage, ServerMessage } from '@mt/engine';
import type { ConnectionHandlers, ConnectionLike } from './session';

export class Connection implements ConnectionLike {
  private readonly ws: WebSocket;

  constructor(url: string, handlers: ConnectionHandlers) {
    this.ws = new WebSocket(url);
    this.ws.onopen = () => handlers.onOpen();
    this.ws.onmessage = (event) => handlers.onMessage(JSON.parse(String(event.data)) as ServerMessage);
    this.ws.onclose = () => handlers.onClose();
  }

  get isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  send(msg: ClientMessage): void {
    if (this.isOpen) this.ws.send(JSON.stringify(msg));
  }

  /** Intentional close: does not trigger the reconnect handler. */
  close(): void {
    this.ws.onclose = null;
    this.ws.close();
  }
}
```

`packages/client/src/net/sessionInstance.ts`:
```ts
import { Connection } from './connection';
import { Session } from './session';

function wsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws`;
}

export const session = new Session({
  connect: (handlers) => new Connection(wsUrl(), handlers),
  storage: window.sessionStorage,
  now: () => Date.now(),
  setPath: (path) => {
    if (window.location.pathname !== path) window.history.replaceState(null, '', path);
  },
});
```

`packages/client/src/net/useSession.ts`:
```ts
import { useSyncExternalStore } from 'react';
import type { SessionState } from './session';
import { session } from './sessionInstance';

export function useSession(): SessionState {
  return useSyncExternalStore(session.subscribe, session.getState);
}
```

- [ ] **Step 5: Run the session tests**

Run: `npx vitest run packages/client/test/session.test.ts`
Expected: all PASS.

- [ ] **Step 6: Write the theme and shared UI pieces**

`packages/client/src/styles/theme.css`:
```css
:root {
  --bg-top: #150a2e;
  --bg-mid: #2d1257;
  --bg-bottom: #4b1d7d;
  --frame: #6d3fb0;
  --frame-light: #9b6be0;
  --panel: #050308;
  --text: #f1eaff;
  --text-dim: #a996cc;
  --p1: #7fd8ff;
  --p2: #ffc94d;
  --ok: #6ee7a8;
  --danger: #ff5d73;
  --font-ui: 'Rajdhani', system-ui, sans-serif;
  --font-num: 'JetBrains Mono', ui-monospace, monospace;
}

* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }

body {
  background: linear-gradient(180deg, var(--bg-top), var(--bg-mid) 55%, var(--bg-bottom));
  color: var(--text);
  font-family: var(--font-ui);
  overflow: hidden;
}

.starfield {
  position: fixed;
  inset: -100% 0 0 0;
  pointer-events: none;
  opacity: 0.55;
  background-image:
    radial-gradient(1px 1px at 20px 30px, #ffffff90, transparent),
    radial-gradient(1px 1px at 120px 80px, #ffffff70, transparent),
    radial-gradient(1.5px 1.5px at 200px 160px, #ffffffb0, transparent),
    radial-gradient(1px 1px at 280px 40px, #ffffff60, transparent);
  background-size: 320px 220px;
  animation: drift 160s linear infinite;
}
@keyframes drift { to { transform: translateY(50%); } }

.app { position: relative; height: 100%; display: grid; place-items: center; }

.panel {
  --cut: 14px;
  background: var(--frame);
  padding: 5px;
  clip-path: polygon(var(--cut) 0, 100% 0, 100% calc(100% - var(--cut)), calc(100% - var(--cut)) 100%, 0 100%, 0 var(--cut));
}
.panel-inner {
  --cut: 11px;
  background: var(--panel);
  padding: 10px 12px;
  height: 100%;
  clip-path: polygon(var(--cut) 0, 100% 0, 100% calc(100% - var(--cut)), calc(100% - var(--cut)) 100%, 0 100%, 0 var(--cut));
}
.panel-label { margin: 0 0 8px; font-size: 20px; font-weight: 700; letter-spacing: 0.12em; }
.panel-label.right { text-align: right; }

.btn {
  font: 700 18px var(--font-ui);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text);
  background: var(--frame);
  border: none;
  padding: 10px 22px;
  cursor: pointer;
  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
}
.btn:hover:not(:disabled) { background: var(--frame-light); }
.btn:disabled { opacity: 0.5; cursor: default; }
.btn.primary { background: #3fb58e; color: #04110c; }
.btn.primary:hover:not(:disabled) { background: #5fd3ab; }

.title { font-size: 64px; letter-spacing: 0.3em; font-weight: 700; margin: 0 0 16px; text-align: center; line-height: 1; }
.dim { color: var(--text-dim); margin: 0; letter-spacing: 0.1em; }
.error { color: var(--danger); font-weight: 600; margin: 0; }
.row { display: flex; gap: 12px; }
.row > * { flex: 1; }

.home, .lobby { display: flex; flex-direction: column; gap: 16px; width: 440px; }
.code-input {
  font: 700 24px var(--font-num);
  letter-spacing: 0.4em;
  text-transform: uppercase;
  background: #000;
  color: var(--text);
  border: 2px solid var(--frame);
  padding: 8px 12px;
  min-width: 0;
}

.room-code { font: 700 56px var(--font-num); letter-spacing: 0.3em; text-align: center; }
.slots { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.slot { border: 2px solid; padding: 10px; text-align: center; font-weight: 700; letter-spacing: 0.08em; }
.slot.p1 { border-color: var(--p1); }
.slot.p2 { border-color: var(--p2); }
.slot.empty { opacity: 0.5; border-style: dashed; }
.ready-badge { display: block; font-size: 14px; color: var(--ok); }

.controls-list { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; font-size: 16px; margin: 0; }
.controls-list dd { margin: 0; }
kbd { font-family: var(--font-num); color: var(--text-dim); }
```

`packages/client/src/ui/Panel.tsx`:
```tsx
import type { ReactNode } from 'react';

interface PanelProps {
  label?: string;
  align?: 'left' | 'right';
  className?: string;
  children: ReactNode;
}

export function Panel({ label, align = 'left', className = '', children }: PanelProps) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-inner">
        {label && <h2 className={`panel-label ${align}`}>{label}</h2>}
        {children}
      </div>
    </section>
  );
}
```

`packages/client/src/ui/ControlsList.tsx`:
```tsx
import { Fragment } from 'react';

const CONTROLS: [string, string][] = [
  ['← →', 'Move'],
  ['↓', 'Soft drop'],
  ['Space', 'Hard drop'],
  ['↑ / X', 'Rotate clockwise'],
  ['Z', 'Rotate counter-clockwise'],
  ['C / Shift', 'Hold'],
  ['/', 'Show controls'],
];

export function ControlsList() {
  return (
    <dl className="controls-list">
      {CONTROLS.map(([key, action]) => (
        <Fragment key={key}>
          <dt>
            <kbd>{key}</kbd>
          </dt>
          <dd>{action}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
```

- [ ] **Step 7: Write the Home and Lobby screens and App**

`packages/client/src/ui/HomeScreen.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { normalizeCode, roomCodeFromPath } from '../net/session';
import { session } from '../net/sessionInstance';
import { useSession } from '../net/useSession';
import { Panel } from './Panel';

const ERROR_TEXT: Record<string, string> = {
  roomNotFound: 'Room not found.',
  roomFull: 'That room is full.',
  badMessage: 'Something went wrong. Try again.',
  connectionLost: 'Lost connection to the game.',
};

export function HomeScreen() {
  const s = useSession();
  const [code, setCode] = useState('');

  useEffect(() => {
    const fromPath = roomCodeFromPath(window.location.pathname);
    if (fromPath) session.joinRoom(fromPath);
  }, []);

  return (
    <Panel>
      <div className="home">
        <h1 className="title">
          MULTI
          <br />
          TETRIS
        </h1>
        <p className="dim" style={{ textAlign: 'center' }}>
          Co-op Tetris for two on one wide board
        </p>
        <button className="btn primary" onClick={() => session.createRoom()}>
          Create room
        </button>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (normalizeCode(code).length === 4) session.joinRoom(code);
          }}
        >
          <input
            className="code-input"
            aria-label="Room code"
            placeholder="CODE"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="btn" type="submit">
            Join room
          </button>
        </form>
        {s.error && <p className="error">{ERROR_TEXT[s.error] ?? s.error}</p>}
        {s.status !== 'open' && <p className="dim">Connecting…</p>}
      </div>
    </Panel>
  );
}
```

`packages/client/src/ui/LobbyScreen.tsx`:
```tsx
import { useState } from 'react';
import type { PlayerId, RoomStateMessage, SlotInfo } from '@mt/engine';
import { session } from '../net/sessionInstance';
import { ControlsList } from './ControlsList';
import { Panel } from './Panel';

export function LobbyScreen({ room }: { room: RoomStateMessage }) {
  const me = room.players[room.you];
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/r/${room.code}`;

  return (
    <Panel>
      <div className="lobby">
        <p className="dim">ROOM CODE</p>
        <div className="room-code" data-testid="room-code">
          {room.code}
        </div>
        <button
          className="btn"
          onClick={() => {
            void navigator.clipboard.writeText(link).then(() => setCopied(true));
          }}
        >
          {copied ? 'Link copied!' : 'Copy link'}
        </button>
        <div className="slots">
          {([0, 1] as const).map((p) => (
            <Slot key={p} player={p} info={room.players[p]} you={room.you} />
          ))}
        </div>
        <button className="btn primary" onClick={() => session.setReady(!me?.ready)}>
          {me?.ready ? 'Cancel ready' : 'Ready'}
        </button>
        <button className="btn" onClick={() => session.leave()}>
          Leave
        </button>
        <ControlsList />
      </div>
    </Panel>
  );
}

function Slot({ player, info, you }: { player: PlayerId; info: SlotInfo | null; you: PlayerId }) {
  const label = info === null ? 'Waiting…' : player === you ? 'You' : 'Partner';
  return (
    <div className={`slot p${player + 1} ${info ? '' : 'empty'}`} data-testid={`slot-${player}`}>
      PLAYER {player + 1}
      <br />
      {label}
      {info?.ready && <span className="ready-badge">READY</span>}
    </div>
  );
}
```

`packages/client/src/App.tsx`:
```tsx
import { useSession } from './net/useSession';
import { HomeScreen } from './ui/HomeScreen';
import { LobbyScreen } from './ui/LobbyScreen';

export function App() {
  const s = useSession();
  const room = s.room;
  return (
    <>
      <div className="starfield" />
      <main className="app">
        {!room ? (
          <HomeScreen />
        ) : room.phase === 'lobby' ? (
          <LobbyScreen room={room} />
        ) : (
          <p className="dim">Game starting…</p>
        )}
      </main>
    </>
  );
}
```

`packages/client/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { session } from './net/sessionInstance';
import './styles/theme.css';

session.connect();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 8: Typecheck, lint, and try it**

Run: `npm run typecheck && npm run lint && npm test`
Expected: clean; all tests PASS.

Manual check: run `npm run dev`, open `http://localhost:5173` in two browser windows. Create a room in one; paste the `/r/CODE` URL into the other. Both lobbies show two players; clicking Ready in both shows "Game starting…". Stop the dev server afterwards.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(client): add session store, home and lobby screens"
```

---

### Task 13: Keyboard input with DAS/ARR

**Files:**
- Create: `packages/client/src/input/keyboard.ts`, `packages/client/src/input/useKeyboard.ts`
- Test: `packages/client/test/keyboard.test.ts`

**Interfaces:**
- Consumes: `Action` from `@mt/engine`; `session.sendInput`.
- Produces: `DAS_MS=167`, `ARR_MS=33`, `class KeyboardInput(emit, das?, arr?)` with `keyDown(code, now): boolean` (true = handled, caller should `preventDefault`), `keyUp(code, now): boolean`, `update(now)`, `releaseAll()`; hook `useKeyboard(enabled: boolean)`.

- [ ] **Step 1: Write the failing test**

`packages/client/test/keyboard.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/client/test/keyboard.test.ts`
Expected: FAIL — cannot resolve `../src/input/keyboard`.

- [ ] **Step 3: Implement**

`packages/client/src/input/keyboard.ts`:
```ts
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
```

`packages/client/src/input/useKeyboard.ts`:
```ts
import { useEffect } from 'react';
import { session } from '../net/sessionInstance';
import { KeyboardInput } from './keyboard';

/** While enabled, routes keyboard input to the session as game actions. */
export function useKeyboard(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const kb = new KeyboardInput((action) => session.sendInput(action));
    const onDown = (e: KeyboardEvent) => {
      if (kb.keyDown(e.code, performance.now())) e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => {
      if (kb.keyUp(e.code, performance.now())) e.preventDefault();
    };
    const onBlur = () => kb.releaseAll();
    let raf = 0;
    const frame = () => {
      kb.update(performance.now());
      raf = requestAnimationFrame(frame);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      kb.releaseAll();
    };
  }, [enabled]);
}
```

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx vitest run packages/client && npm run typecheck && npm run lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): add keyboard input with DAS/ARR"
```

---

### Task 14: Board renderer and game screen (Stage 1 — playable)

**Files:**
- Create: `packages/client/src/render/colors.ts`, `packages/client/src/render/drawList.ts`, `packages/client/src/render/board.ts`
- Create: `packages/client/src/ui/useNow.ts`, `packages/client/src/ui/PiecePreview.tsx`, `packages/client/src/ui/PlayerSide.tsx`, `packages/client/src/ui/ScoreBar.tsx`, `packages/client/src/ui/GameOverOverlay.tsx`, `packages/client/src/ui/GameScreen.tsx`, `packages/client/src/styles/game.css`
- Modify: `packages/client/src/App.tsx`
- Test: `packages/client/test/drawList.test.ts`

**Interfaces:**
- Consumes: `ghostPiece`, `pieceCells`, constants from `@mt/engine`; `useSession`, `session`, `useKeyboard`.
- Produces: `PIECE_COLORS`, `PLAYER_ACCENTS`, `DrawCell`, `boardDrawList(state, me): DrawCell[]`, `CELL=28`, `drawBoard(ctx, state, me)`; `GameScreen` root has `data-testid="game"`, `data-phase`, `data-lock-count`.

- [ ] **Step 1: Write the failing test**

`packages/client/test/drawList.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createGame, type GameState } from '@mt/engine';
import { boardDrawList } from '../src/render/drawList';

function world(): GameState {
  const s = createGame([1, 2]);
  s.players[0].active = { type: 'T', x: 3, y: 5, rot: 0 };
  s.players[1].active = { type: 'O', x: 14, y: 1, rot: 0 };
  s.board[21][0] = 'I';
  return s;
}

describe('boardDrawList', () => {
  it('maps locked cells into visible-row coordinates', () => {
    expect(boardDrawList(world(), 0)).toContainEqual({
      col: 0,
      row: 19,
      type: 'I',
      kind: 'locked',
      owner: null,
    });
  });

  it('draws a ghost for my piece only', () => {
    const cells = boardDrawList(world(), 0);
    const ghosts = cells.filter((c) => c.kind === 'ghost');
    expect(ghosts).toHaveLength(4);
    expect(ghosts.every((c) => c.owner === 0)).toBe(true);
    expect(Math.max(...ghosts.map((c) => c.row))).toBe(19);
  });

  it('clips active cells in the hidden rows', () => {
    const p1Cells = boardDrawList(world(), 0).filter((c) => c.kind === 'active' && c.owner === 1);
    expect(p1Cells).toHaveLength(2);
    expect(p1Cells.every((c) => c.row === 0)).toBe(true);
  });

  it('omits the ghost when the piece is already resting', () => {
    const s = world();
    s.players[0].active = { type: 'T', x: 3, y: 20, rot: 0 };
    expect(boardDrawList(s, 0).some((c) => c.kind === 'ghost')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/client/test/drawList.test.ts`
Expected: FAIL — cannot resolve `../src/render/drawList`.

- [ ] **Step 3: Implement rendering**

`packages/client/src/render/colors.ts`:
```ts
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
```

`packages/client/src/render/drawList.ts`:
```ts
import { HIDDEN_ROWS, ghostPiece, pieceCells, type GameState, type PieceType, type PlayerId } from '@mt/engine';

export interface DrawCell {
  col: number;
  /** Row within the visible area (0 = top visible row). */
  row: number;
  type: PieceType;
  kind: 'locked' | 'ghost' | 'active';
  owner: PlayerId | null;
}

/** Everything to paint on the well, in back-to-front order. */
export function boardDrawList(state: GameState, me: PlayerId): DrawCell[] {
  const cells: DrawCell[] = [];
  state.board.forEach((rowCells, y) => {
    if (y < HIDDEN_ROWS) return;
    rowCells.forEach((type, x) => {
      if (type) cells.push({ col: x, row: y - HIDDEN_ROWS, type, kind: 'locked', owner: null });
    });
  });

  const mine = state.players[me].active;
  const ghost = ghostPiece(state, me);
  if (mine && ghost && ghost.y !== mine.y) {
    for (const [x, y] of pieceCells(ghost)) {
      if (y >= HIDDEN_ROWS) cells.push({ col: x, row: y - HIDDEN_ROWS, type: ghost.type, kind: 'ghost', owner: me });
    }
  }

  for (const owner of [0, 1] as const) {
    const piece = state.players[owner].active;
    if (!piece) continue;
    for (const [x, y] of pieceCells(piece)) {
      if (y >= HIDDEN_ROWS) cells.push({ col: x, row: y - HIDDEN_ROWS, type: piece.type, kind: 'active', owner });
    }
  }
  return cells;
}
```

`packages/client/src/render/board.ts`:
```ts
import { BOARD_WIDTH, VISIBLE_ROWS, type GameState, type PlayerId } from '@mt/engine';
import { GRID_LINE, PIECE_COLORS, PLAYER_ACCENTS, WELL_BACKGROUND } from './colors';
import { boardDrawList, type DrawCell } from './drawList';

export const CELL = 28;
export const WELL_WIDTH = BOARD_WIDTH * CELL;
export const WELL_HEIGHT = VISIBLE_ROWS * CELL;

export function drawBoard(ctx: CanvasRenderingContext2D, state: GameState, me: PlayerId): void {
  ctx.fillStyle = WELL_BACKGROUND;
  ctx.fillRect(0, 0, WELL_WIDTH, WELL_HEIGHT);

  ctx.strokeStyle = GRID_LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < BOARD_WIDTH; x++) {
    ctx.moveTo(x * CELL + 0.5, 0);
    ctx.lineTo(x * CELL + 0.5, WELL_HEIGHT);
  }
  for (let y = 1; y < VISIBLE_ROWS; y++) {
    ctx.moveTo(0, y * CELL + 0.5);
    ctx.lineTo(WELL_WIDTH, y * CELL + 0.5);
  }
  ctx.stroke();

  for (const cell of boardDrawList(state, me)) drawCell(ctx, cell);
}

export function drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
  const bevel = Math.max(2, Math.round(size / 9));
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.fillRect(x + 1, y + 1, size - 2, bevel);
  ctx.fillRect(x + 1, y + 1, bevel, size - 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.fillRect(x + 1, y + size - 1 - bevel, size - 2, bevel);
  ctx.fillRect(x + size - 1 - bevel, y + 1, bevel, size - 2);
}

function drawCell(ctx: CanvasRenderingContext2D, cell: DrawCell): void {
  const x = cell.col * CELL;
  const y = cell.row * CELL;
  const color = PIECE_COLORS[cell.type];

  if (cell.kind === 'ghost') {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 3, y + 3, CELL - 6, CELL - 6);
    ctx.restore();
    return;
  }

  if (cell.kind === 'active' && cell.owner !== null) {
    const accent = PLAYER_ACCENTS[cell.owner];
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 14;
    drawBlock(ctx, x, y, CELL, color);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
    ctx.restore();
    return;
  }

  drawBlock(ctx, x, y, CELL, color);
}
```

- [ ] **Step 4: Run the renderer test**

Run: `npx vitest run packages/client/test/drawList.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Build the game screen components**

`packages/client/src/ui/useNow.ts`:
```ts
import { useEffect, useState } from 'react';

export function useNow(intervalMs = 100): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
```

`packages/client/src/ui/PiecePreview.tsx`:
```tsx
import { useEffect, useRef } from 'react';
import { pieceCells, type PieceType } from '@mt/engine';
import { drawBlock } from '../render/board';
import { HOLD_USED_COLOR, PIECE_COLORS } from '../render/colors';

const BOX_COLS = 4;
const BOX_ROWS = 2;

export function PiecePreview({ type, size = 20, dim = false }: { type: PieceType | null; size?: number; dim?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = BOX_COLS * size * dpr;
    canvas.height = BOX_ROWS * size * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, BOX_COLS * size, BOX_ROWS * size);
    if (!type) return;
    const cells = pieceCells({ type, x: 0, y: 0, rot: 0 });
    const xs = cells.map(([x]) => x);
    const ys = cells.map(([, y]) => y);
    const width = Math.max(...xs) - Math.min(...xs) + 1;
    const height = Math.max(...ys) - Math.min(...ys) + 1;
    const offsetX = ((BOX_COLS - width) * size) / 2 - Math.min(...xs) * size;
    const offsetY = ((BOX_ROWS - height) * size) / 2 - Math.min(...ys) * size;
    for (const [x, y] of cells) {
      drawBlock(ctx, offsetX + x * size, offsetY + y * size, size, dim ? HOLD_USED_COLOR : PIECE_COLORS[type]);
    }
  }, [type, size, dim]);

  return <canvas ref={ref} className="piece-preview" style={{ width: BOX_COLS * size, height: BOX_ROWS * size }} />;
}
```

`packages/client/src/ui/PlayerSide.tsx`:
```tsx
import type { CSSProperties } from 'react';
import { NEXT_QUEUE_SIZE, type GameState, type PlayerId } from '@mt/engine';
import { PLAYER_ACCENTS } from '../render/colors';
import { Panel } from './Panel';
import { PiecePreview } from './PiecePreview';

interface PlayerSideProps {
  player: PlayerId;
  me: PlayerId;
  state: GameState;
  side: 'left' | 'right';
}

export function PlayerSide({ player, me, state, side }: PlayerSideProps) {
  const ps = state.players[player];
  const upcoming = (ps.nextSpawn ? [ps.nextSpawn, ...ps.queue] : ps.queue).slice(0, NEXT_QUEUE_SIZE);
  return (
    <div className={`player-side ${side}`} style={{ '--accent': PLAYER_ACCENTS[player] } as CSSProperties}>
      <Panel label="HOLD" align={side}>
        <PiecePreview type={ps.hold} dim={ps.holdUsed} />
      </Panel>
      <Panel label="NEXT" align={side}>
        <div className="next-list">
          {upcoming.map((type, i) => (
            <PiecePreview key={i} type={type} size={i === 0 ? 20 : 16} />
          ))}
        </div>
      </Panel>
      <div className="player-name">
        PLAYER {player + 1}
        {player === me && <span className="you"> (You)</span>}
      </div>
    </div>
  );
}
```

`packages/client/src/ui/ScoreBar.tsx`:
```tsx
export function ScoreBar({ score, lines, level }: { score: number; lines: number; level: number }) {
  return (
    <div className="score-bar">
      <div className="stat">
        LINES <b>{lines}</b>
      </div>
      <div className="emblem">{score.toLocaleString()}</div>
      <div className="stat">
        LV <b>{level}</b>
      </div>
    </div>
  );
}
```

`packages/client/src/ui/GameOverOverlay.tsx`:
```tsx
import { useState } from 'react';
import type { GameResult } from '../net/session';
import { session } from '../net/sessionInstance';

export function GameOverOverlay({ result }: { result: GameResult }) {
  const [clicked, setClicked] = useState(false);
  return (
    <div className="overlay game-over">
      <div>
        <h2>GAME OVER</h2>
        <div className="stats">
          SCORE {result.score.toLocaleString()} · LINES {result.lines} · LV {result.level}
        </div>
        <div className="row">
          <button
            className="btn primary"
            disabled={clicked}
            onClick={() => {
              setClicked(true);
              session.playAgain();
            }}
          >
            {clicked ? 'Waiting for partner…' : 'Play again'}
          </button>
          <button className="btn" onClick={() => session.leave()}>
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
```

`packages/client/src/ui/GameScreen.tsx`:
```tsx
import { useEffect, useRef } from 'react';
import { useKeyboard } from '../input/useKeyboard';
import { session } from '../net/sessionInstance';
import { useSession } from '../net/useSession';
import { WELL_HEIGHT, WELL_WIDTH, drawBoard } from '../render/board';
import { GameOverOverlay } from './GameOverOverlay';
import { PlayerSide } from './PlayerSide';
import { ScoreBar } from './ScoreBar';
import { useNow } from './useNow';
import '../styles/game.css';

export function GameScreen() {
  const s = useSession();
  const room = s.room!;
  const me = room.you;
  const game = s.game;
  const now = useNow();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useKeyboard(room.phase === 'playing');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WELL_WIDTH * dpr;
    canvas.height = WELL_HEIGHT * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0;
    const frame = () => {
      const current = session.getState().game;
      if (current) drawBoard(ctx, current, me);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [me]);

  const countdown =
    room.phase === 'countdown' && s.countdownEndsAt !== null
      ? Math.max(1, Math.ceil((s.countdownEndsAt - now) / 1000))
      : null;
  const graceLeft =
    s.partnerDisconnectedUntil !== null ? Math.max(0, Math.ceil((s.partnerDisconnectedUntil - now) / 1000)) : null;

  return (
    <div className="game-layout" data-testid="game" data-phase={room.phase} data-lock-count={game?.lockCount ?? 0}>
      {game ? <PlayerSide player={0} me={me} state={game} side="left" /> : <div />}
      <div className="well-column">
        <div className="panel well">
          <div className="panel-inner well-inner">
            <canvas ref={canvasRef} style={{ width: WELL_WIDTH, height: WELL_HEIGHT }} />
            {countdown !== null && (
              <div className="overlay">
                <div className="countdown">{countdown}</div>
              </div>
            )}
            {room.phase === 'paused' && (
              <div className="overlay">
                <div>
                  <h2>PAUSED</h2>
                  <p>
                    Waiting for your partner to reconnect
                    {graceLeft !== null ? ` — ${graceLeft}s` : '…'}
                  </p>
                </div>
              </div>
            )}
            {room.phase === 'over' && s.gameOver && <GameOverOverlay result={s.gameOver} />}
          </div>
        </div>
        {game && <ScoreBar score={game.score} lines={game.lines} level={game.level} />}
      </div>
      {game ? <PlayerSide player={1} me={me} state={game} side="right" /> : <div />}
    </div>
  );
}
```

`packages/client/src/styles/game.css`:
```css
.game-layout { display: grid; grid-template-columns: 150px auto 150px; gap: 10px; align-items: start; }

.player-side { display: flex; flex-direction: column; gap: 10px; }
.player-side .panel { --frame: color-mix(in srgb, var(--accent) 35%, #6d3fb0); }
.player-side.right .panel-label { text-align: right; }
.player-name { font-weight: 700; letter-spacing: 0.12em; color: var(--accent); }
.player-side.right .player-name { text-align: right; }
.player-name .you { color: var(--text); }
.next-list { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.piece-preview { display: block; margin: 0 auto; }

.well-column { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.well-inner { position: relative; padding: 0; }
.well canvas { display: block; }

.score-bar { display: flex; align-items: center; gap: 24px; font-size: 18px; letter-spacing: 0.1em; }
.score-bar b { font-family: var(--font-num); }
.emblem {
  padding: 6px 56px;
  background: linear-gradient(180deg, #3fd7c1, #1f7d9a);
  color: #031a1c;
  font: 700 26px var(--font-num);
  clip-path: polygon(0 50%, 14% 0, 86% 0, 100% 50%, 86% 100%, 14% 100%);
}

.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(5, 3, 8, 0.6);
  text-align: center;
}
.overlay h2 { font-size: 40px; letter-spacing: 0.3em; margin: 0 0 12px; }
.countdown { font: 700 120px var(--font-num); }
.game-over .stats { font-family: var(--font-num); font-size: 18px; margin-bottom: 16px; }
```

Replace `packages/client/src/App.tsx` with:
```tsx
import { useSession } from './net/useSession';
import { GameScreen } from './ui/GameScreen';
import { HomeScreen } from './ui/HomeScreen';
import { LobbyScreen } from './ui/LobbyScreen';

export function App() {
  const s = useSession();
  const room = s.room;
  return (
    <>
      <div className="starfield" />
      <main className="app">
        {!room ? <HomeScreen /> : room.phase === 'lobby' ? <LobbyScreen room={room} /> : <GameScreen />}
      </main>
    </>
  );
}
```

- [ ] **Step 6: Typecheck, lint, test, and play**

Run: `npm run typecheck && npm run lint && npm test`
Expected: clean; all PASS.

Manual check: `npm run dev`, open two windows (`http://localhost:5173` and the `/r/CODE` link), ready both. Verify: 3-2-1 countdown; each window shows both HOLD and NEXT columns with accent colors; your piece has a ghost; moving/rotating/hard-dropping works in both windows; closing one window shows PAUSED in the other; letting the stack reach the top shows GAME OVER. (Input will feel slightly delayed — that is expected until Task 15.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(client): add canvas renderer and game screen"
```

---

### Task 15: Client-side prediction (Stage 2)

**Files:**
- Create: `packages/client/src/net/prediction.ts`
- Modify: `packages/client/src/net/session.ts`
- Test: `packages/client/test/prediction.test.ts`, `packages/client/test/session.test.ts` (one added test)

**Interfaces:**
- Consumes: `applyInput` from `@mt/engine`.
- Produces: `class Predictor(player)` with `readonly player`, `state: GameState | null`, `input(action): number` (returns seq), `snapshot(server, ackSeq): GameState`, `clearPending()`. `Session.sendInput` now updates `state.game` immediately with the predicted state.

- [ ] **Step 1: Write the failing predictor test**

`packages/client/test/prediction.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyInput, createGame, type GameState } from '@mt/engine';
import { Predictor } from '../src/net/prediction';

function world(partnerX = 14): GameState {
  const s = createGame([1, 2]);
  s.players[0].active = { type: 'T', x: 4, y: 5, rot: 0 };
  s.players[1].active = { type: 'O', x: partnerX, y: 5, rot: 0 };
  return s;
}

describe('Predictor', () => {
  it('applies local input immediately and numbers inputs from 1', () => {
    const p = new Predictor(0);
    p.snapshot(world(), 0);
    expect(p.input('left')).toBe(1);
    expect(p.state!.players[0].active!.x).toBe(3);
  });

  it('replays unacknowledged inputs on top of each snapshot', () => {
    const p = new Predictor(0);
    p.snapshot(world(), 0);
    p.input('left');
    p.input('left');
    expect(p.snapshot(world(), 0).players[0].active!.x).toBe(2);
  });

  it('drops inputs the server has acknowledged', () => {
    const p = new Predictor(0);
    const server = world();
    p.snapshot(server, 0);
    p.input('left');
    const acked = applyInput(server, 0, 'left');
    expect(p.snapshot(acked, 1).players[0].active!.x).toBe(3);
  });

  it("snaps to the server when the partner's piece invalidated the prediction", () => {
    const p = new Predictor(0);
    p.snapshot(world(), 0);
    p.input('right');
    expect(p.state!.players[0].active!.x).toBe(5);
    const server = applyInput(world(7), 0, 'right'); // blocked on the server
    expect(p.snapshot(server, 1).players[0].active!.x).toBe(4);
  });

  it('returns seq numbers even before the first snapshot', () => {
    const p = new Predictor(1);
    expect(p.input('hold')).toBe(1);
    expect(p.state).toBeNull();
  });

  it('clearPending forgets unacknowledged inputs', () => {
    const p = new Predictor(0);
    p.snapshot(world(), 0);
    p.input('left');
    p.clearPending();
    expect(p.snapshot(world(), 0).players[0].active!.x).toBe(4);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/client/test/prediction.test.ts`
Expected: FAIL — cannot resolve `../src/net/prediction`.

- [ ] **Step 3: Implement the predictor**

`packages/client/src/net/prediction.ts`:
```ts
import { applyInput, type Action, type GameState, type PlayerId } from '@mt/engine';

interface PendingInput {
  seq: number;
  action: Action;
}

/**
 * Predicts the local player's own inputs. Gravity and the partner always come from the server;
 * on each snapshot we adopt the server state and replay inputs it has not processed yet.
 */
export class Predictor {
  private pending: PendingInput[] = [];
  private nextSeq = 1;
  private view: GameState | null = null;

  constructor(readonly player: PlayerId) {}

  get state(): GameState | null {
    return this.view;
  }

  input(action: Action): number {
    const seq = this.nextSeq++;
    this.pending.push({ seq, action });
    if (this.view) this.view = applyInput(this.view, this.player, action);
    return seq;
  }

  snapshot(server: GameState, ackSeq: number): GameState {
    this.pending = this.pending.filter((p) => p.seq > ackSeq);
    this.view = this.pending.reduce((state, p) => applyInput(state, this.player, p.action), server);
    return this.view;
  }

  clearPending(): void {
    this.pending = [];
  }
}
```

Run: `npx vitest run packages/client/test/prediction.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 4: Add a failing session test for predicted input**

Append inside the `describe('Session', ...)` block in `packages/client/test/session.test.ts`:
```ts
  it('shows the predicted result of an input before the server confirms it', async () => {
    const { createGame } = await import('@mt/engine');
    const { session, handlers } = setup();
    handlers().onMessage(roomState({ phase: 'playing' }));
    const server = createGame([1, 2]);
    server.players[0].active = { type: 'T', x: 4, y: 5, rot: 0 };
    handlers().onMessage({ type: 'snapshot', tick: 0, state: server, ackSeq: 0 });
    session.sendInput('left');
    expect(session.getState().game!.players[0].active!.x).toBe(3);
    handlers().onMessage({ type: 'snapshot', tick: 1, state: server, ackSeq: 0 });
    expect(session.getState().game!.players[0].active!.x).toBe(3);
  });
```

Run: `npx vitest run packages/client/test/session.test.ts`
Expected: the new test FAILS (x stays 4).

- [ ] **Step 5: Wire the predictor into the session**

In `packages/client/src/net/session.ts`:

Add the import:
```ts
import { Predictor } from './prediction';
```

Replace the field `private seq = 0;` with:
```ts
  private predictor = new Predictor(0);
```

Replace the whole `sendInput` method with:
```ts
  sendInput(action: Action): void {
    if (this.state.room?.phase !== 'playing' || !this.conn?.isOpen) return;
    const seq = this.predictor.input(action);
    this.conn.send({ type: 'input', seq, action });
    if (this.predictor.state) this.setState({ game: this.predictor.state });
  }
```

In `handleOpen`, add as the first line:
```ts
    this.predictor.clearPending();
```

Replace the whole `handleMessage` method with:
```ts
  private handleMessage(msg: ServerMessage): void {
    if (msg.type === 'roomState') {
      this.deps.storage.setItem(tokenKey(msg.code), msg.reconnectToken);
      this.deps.setPath(`/r/${msg.code}`);
      if (this.predictor.player !== msg.you) this.predictor = new Predictor(msg.you);
      if (msg.phase === 'lobby') this.predictor.clearPending();
    }
    const hadRoom = this.state.room !== null;
    this.state = reduceServerMessage(this.state, msg, this.deps.now());
    if (msg.type === 'snapshot') {
      this.state = { ...this.state, game: this.predictor.snapshot(msg.state, msg.ackSeq) };
    }
    if (hadRoom && !this.state.room) this.deps.setPath('/');
    this.emit();
  }
```

- [ ] **Step 6: Run all tests, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all PASS (the earlier "only sends inputs while playing" test still expects `seq: 1`, which the predictor provides).

Manual check: `npm run dev`, play in two windows; your own piece should now respond instantly.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(client): add client-side prediction for local inputs"
```

---

### Task 16: UI polish — callouts, ping, controls overlay, narrow-screen notice

**Files:**
- Create: `packages/client/src/ui/labels.ts`, `packages/client/src/styles/overlays.css`
- Modify: `packages/client/src/ui/GameScreen.tsx`, `packages/client/src/App.tsx`
- Test: `packages/client/test/labels.test.ts`

**Interfaces:**
- Consumes: session state (`pingMs`, `status`), `game.lastClear`, `game.lines`, `ControlsList`.
- Produces: `clearLabel(count): string`.

- [ ] **Step 1: Write the failing test**

`packages/client/test/labels.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { clearLabel } from '../src/ui/labels';

describe('clearLabel', () => {
  it('names each clear size', () => {
    expect([1, 2, 3, 4].map(clearLabel)).toEqual(['SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS']);
    expect(clearLabel(0)).toBe('');
  });
});
```

Run: `npx vitest run packages/client/test/labels.test.ts`
Expected: FAIL — cannot resolve `../src/ui/labels`.

- [ ] **Step 2: Implement labels and styles**

`packages/client/src/ui/labels.ts`:
```ts
const CLEAR_LABELS = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];

export function clearLabel(count: number): string {
  return CLEAR_LABELS[count] ?? '';
}
```

`packages/client/src/styles/overlays.css`:
```css
.callout {
  position: absolute;
  left: 0;
  right: 0;
  top: 38%;
  text-align: center;
  font-size: 48px;
  font-weight: 700;
  letter-spacing: 0.4em;
  pointer-events: none;
  text-shadow: 0 0 18px var(--frame-light);
  animation: callout 1.2s ease-out forwards;
}
@keyframes callout {
  0% { opacity: 0; transform: scale(1.2); }
  15% { opacity: 1; transform: scale(1); }
  75% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-20px); }
}

.ping { position: fixed; top: 10px; right: 14px; font: 14px var(--font-num); color: var(--text-dim); }
.ping.bad { color: var(--danger); }
.help-hint { position: fixed; bottom: 10px; right: 14px; color: var(--text-dim); font-size: 14px; letter-spacing: 0.08em; }
.help-overlay .panel { min-width: 320px; text-align: left; }

.narrow-notice { display: none; }
@media (max-width: 899px) {
  .narrow-notice {
    display: grid;
    position: fixed;
    inset: 0;
    z-index: 10;
    place-items: center;
    padding: 24px;
    text-align: center;
    font-size: 22px;
    background: var(--bg-mid);
  }
}
```

- [ ] **Step 3: Add the callout and controls overlay to the game screen**

In `packages/client/src/ui/GameScreen.tsx`:

Change the React import to:
```tsx
import { useEffect, useRef, useState } from 'react';
```
Add imports:
```tsx
import { ControlsList } from './ControlsList';
import { clearLabel } from './labels';
import { Panel } from './Panel';
import '../styles/overlays.css';
```

After `const canvasRef = useRef<HTMLCanvasElement>(null);` add:
```tsx
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Slash, not '?': typing '?' needs Shift, which is bound to hold.
      if (e.code === 'Slash') setShowHelp((v) => !v);
      if (e.key === 'Escape') setShowHelp(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
```

Immediately after the `<canvas ... />` element, add:
```tsx
            {game?.lastClear && game.lines > 0 && (
              <div key={game.lines} className="callout">
                {clearLabel(game.lastClear.count)}
              </div>
            )}
            {showHelp && (
              <div className="overlay help-overlay">
                <Panel label="CONTROLS">
                  <ControlsList />
                </Panel>
              </div>
            )}
```

Just before the final closing `</div>` of the `game-layout` element, add:
```tsx
      <div className="help-hint">Press / for controls</div>
```

- [ ] **Step 4: Add the ping indicator and narrow-screen notice to App**

Replace `packages/client/src/App.tsx` with:
```tsx
import { useSession } from './net/useSession';
import { GameScreen } from './ui/GameScreen';
import { HomeScreen } from './ui/HomeScreen';
import { LobbyScreen } from './ui/LobbyScreen';
import './styles/overlays.css';

export function App() {
  const s = useSession();
  const room = s.room;
  return (
    <>
      <div className="starfield" />
      <div className="narrow-notice">Multi Tetris needs a keyboard and a window at least 900px wide.</div>
      {room && (
        <div className={`ping ${s.status !== 'open' || (s.pingMs ?? 0) > 150 ? 'bad' : ''}`}>
          {s.status === 'open' ? `${s.pingMs ?? '—'} ms` : 'Reconnecting…'}
        </div>
      )}
      <main className="app">
        {!room ? <HomeScreen /> : room.phase === 'lobby' ? <LobbyScreen room={room} /> : <GameScreen />}
      </main>
    </>
  );
}
```

- [ ] **Step 5: Test, typecheck, lint, and look at it**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all PASS.

Manual check (`npm run dev`, two windows): clearing a line shows a fading SINGLE/DOUBLE/…; `/` toggles the controls panel; the top-right shows ping in ms; narrowing the window below 900 px shows the keyboard notice.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(client): add line-clear callouts, ping, controls overlay and narrow notice"
```

---

### Task 17: End-to-end smoke test

**Files:**
- Create: `playwright.config.ts`, `e2e/coop.spec.ts`

**Interfaces:**
- Consumes: built client + server (`npm run build`), `data-testid`s `room-code`, `slot-1`, `game`, and attributes `data-phase`, `data-lock-count`.

- [ ] **Step 1: Install Playwright**

Run:
```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Write the config and test**

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:8090', viewport: { width: 1280, height: 800 } },
  webServer: {
    command:
      'npm run build && PORT=8090 STATIC_DIR=packages/client/dist node packages/server/dist/index.cjs',
    url: 'http://127.0.0.1:8090/healthz',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
```

`e2e/coop.spec.ts`:
```ts
import { expect, test } from '@playwright/test';

test('two players create, join, ready up, and both see a hard drop', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();

  await a.goto('/');
  await a.getByRole('button', { name: 'Create room' }).click();
  const code = (await a.getByTestId('room-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{4}$/);

  await b.goto(`/r/${code}`);
  await expect(a.getByTestId('slot-1')).toContainText('Partner');

  await a.getByRole('button', { name: 'Ready', exact: true }).click();
  await b.getByRole('button', { name: 'Ready', exact: true }).click();

  const gameA = a.getByTestId('game');
  const gameB = b.getByTestId('game');
  await expect(gameA).toHaveAttribute('data-phase', 'playing', { timeout: 10_000 });

  await a.keyboard.press('Space');
  await expect(gameA).toHaveAttribute('data-lock-count', '1');
  await expect(gameB).toHaveAttribute('data-lock-count', '1');
});
```

- [ ] **Step 3: Lint and run it**

Run: `npm run lint && npm run e2e`
Expected: lint clean; 1 Playwright test PASSES.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: add end-to-end co-op smoke test"
```

---

### Task 18: Docker image, Fly.io config, CI/CD, README

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `fly.toml`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `README.md`

**Interfaces:**
- Consumes: `npm run build` outputs `packages/client/dist/` and `packages/server/dist/index.cjs`; server env `PORT`, `STATIC_DIR`; `GET /healthz`.

- [ ] **Step 1: Write the Docker files**

`Dockerfile`:
```dockerfile
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 STATIC_DIR=/app/public
COPY --from=build /app/packages/server/dist/index.cjs ./server.cjs
COPY --from=build /app/packages/client/dist ./public
EXPOSE 8080
CMD ["node", "server.cjs"]
```

`.dockerignore`:
```
**/node_modules
**/dist
.git
playwright-report
test-results
```

- [ ] **Step 2: Verify the image locally**

Run:
```bash
docker build -t multi-tetris . && docker run -d --rm -p 8080:8080 --name mt multi-tetris && sleep 2 && curl -s localhost:8080/healthz && curl -s localhost:8080/r/ABCD | head -c 200; docker stop mt
```
Expected: prints `ok`, then the start of `index.html` (`<!doctype html>…`). If Docker isn't running, start Docker Desktop first; if unavailable, note it and continue — CI and Fly build the image remotely.

- [ ] **Step 3: Write the Fly config**

`fly.toml`:
```toml
# Rooms live in memory: this app must run on exactly ONE machine.
# Deploy with `fly deploy --ha=false` and keep `fly scale count 1`.
app = "multi-tetris"
primary_region = "iad"

[build]

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

  [http_service.concurrency]
    type = "connections"
    soft_limit = 500
    hard_limit = 1000

  [[http_service.checks]]
    grace_period = "10s"
    interval = "30s"
    method = "GET"
    path = "/healthz"
    timeout = "5s"

[[vm]]
  size = "shared-cpu-1x"
  memory = "256mb"
```

- [ ] **Step 4: Write the GitHub Actions workflows**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  pull_request:
  push:
    branches-ignore: [main]
  workflow_call:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run format:check
      - run: npm test
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e
```

`.github/workflows/deploy.yml`:
```yaml
name: Deploy

on:
  push:
    branches: [main]

concurrency: deploy

jobs:
  ci:
    uses: ./.github/workflows/ci.yml

  deploy:
    needs: ci
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only --ha=false
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

- [ ] **Step 5: Write the README**

`README.md`:
````markdown
# Multi Tetris

Co-op Tetris for two players on one shared 20-wide well. Create a room, send the link, play.

## Develop

Requires Node 22+.

```bash
npm install
npm run dev        # server on :8080, client on http://localhost:5173
npm test           # unit + integration tests
npm run e2e        # Playwright smoke test (builds first)
npm run typecheck && npm run lint
```

Packages: `packages/engine` (pure game rules + protocol), `packages/server` (rooms, authoritative loop), `packages/client` (React + canvas UI).

## Deploy (Fly.io)

Rooms are kept in memory, so the app must run on **exactly one machine**.

One-time setup:

```bash
brew install flyctl
fly auth login
fly launch --no-deploy --copy-config --name <your-unique-app-name>   # updates fly.toml
fly deploy --ha=false
fly scale count 1
fly tokens create deploy    # add as GitHub secret FLY_API_TOKEN
```

After that, every push to `main` runs CI and deploys automatically.
````

- [ ] **Step 6: Format and run the full check suite**

Run: `npm run format && npm run typecheck && npm run lint && npm run format:check && npm test && npm run e2e`
Expected: everything passes.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: add Docker image, Fly.io config, CI/CD workflows and README"
```

- [ ] **Step 8: Hand off the account-bound steps to the human partner**

These need the partner's accounts and cannot be done by an agent. Tell the partner to:
1. Create a GitHub repo and push: `git remote add origin <url> && git push -u origin main`.
2. Run the one-time Fly setup from the README (install `flyctl`, `fly auth login`, `fly launch --no-deploy --copy-config --name <name>`, `fly deploy --ha=false`, `fly scale count 1`).
3. Add the `fly tokens create deploy` output as the `FLY_API_TOKEN` repository secret.
4. Open `https://<name>.fly.dev`, create a room, and join from a second browser to confirm.
