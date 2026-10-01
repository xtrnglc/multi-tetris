# Sprint 40L Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Sprint 40L co-op mode (race to clear 40 lines together, fixed level-1 gravity) selectable in the lobby next to the existing endless mode (Marathon).

**Architecture:** Mode and outcome live in the shared engine's `GameState`, so the server's authoritative loop and the client's prediction apply identical rules. The room stores the lobby's chosen mode, passes it to `createGame`, and reports `mode`/`result`/`ticks` in `gameOver`. The client adds a lobby toggle, a mode-aware score bar (lines left + timer) and a mode-aware results overlay.

**Tech Stack:** TypeScript (strict), npm workspaces (`@mt/engine`, `@mt/server`, `@mt/client`), Vitest, zod, ws, React + Vite, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-sprint-mode-design.md`

## Global Constraints

- Node 22 is required. Prefix every npm/npx command with `PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH` (the default `node` on this machine is 18).
- Modes are exactly `'marathon' | 'sprint'`; new rooms default to `'marathon'`.
- `SPRINT_LINES = 40`; sprint gravity stays at level 1 (level never changes in sprint).
- Run time = `state.tick` when the game ends; seconds = `tick / TICKS_PER_SECOND` (60).
- Timer display format `m:ss.cc` (e.g. `4987` ticks → `1:23.11`).
- Lobby toggle labels: `Marathon`, `Sprint 40L` (buttons render uppercase via CSS).
- Results headings: `CLEARED!`, `TOPPED OUT`, `GAME OVER`.
- No persistence of times anywhere.
- Every task must leave `npm test`, `npm run typecheck`, `npm run lint` and `npm run format:check` passing.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The 40th line clear also pushes the partner's piece above the ceiling** — players expect the run to count as `cleared`, not `toppedOut`. Pinned in Task 1 (`cleared wins over a simultaneous partner top-out`).
2. **The run finishes on a hard drop between ticks** — the reported time must be the tick of that lock, and further ticks must not advance it. Pinned in Task 1 (`finishes on a hard drop without advancing the tick`) and the server reports `ticks` from the final game state (Task 2).
3. **The partner never returns from a disconnect in Sprint** (grace expires) — the game ends with `result: null`; the overlay must not claim CLEARED or TOPPED OUT. Ruling: heading `GAME OVER` with `<lines> / 40 LINES · <time>`. Pinned in Task 3 (`resultSummary` test).
4. **Mode change races a Ready click / arrives after the countdown started** — `setMode` outside the lobby is ignored and must not change the mode of the running game. Pinned in Task 2 (`ignores setMode outside the lobby`).
5. **Picking the mode that is already selected** must not clear Ready (otherwise a stray click un-readies the partner). Pinned in Task 2 (`selecting the current mode is a no-op`).

---

### Task 1: Engine — game mode, sprint rules, outcome

**Files:**
- Modify: `packages/engine/src/types.ts` (add `GameMode`, `GameOutcome`; extend `GameState`)
- Modify: `packages/engine/src/constants.ts` (add `SPRINT_LINES`)
- Modify: `packages/engine/src/game.ts` (`createGame`, `lockPiece`, `nudgeUp`, `trySpawn`, new `finishGame`)
- Modify: `packages/engine/test/helpers.ts` (`gameWith` accepts `mode`)
- Create: `packages/engine/test/sprint.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (exported from `@mt/engine`):
  - `type GameMode = 'marathon' | 'sprint'`
  - `type GameOutcome = 'cleared' | 'toppedOut'`
  - `GameState.mode: GameMode`, `GameState.result: GameOutcome | null`
  - `const SPRINT_LINES = 40`
  - `createGame(seeds: readonly [number, number], mode: GameMode = 'marathon'): GameState`

- [ ] **Step 1: Let the test helper build sprint games**

In `packages/engine/test/helpers.ts`, change the imports and `gameWith`:

```ts
import { BOARD_WIDTH } from '../src/constants';
import { createGame, tick } from '../src/game';
import type { ActivePiece, Cell, GameMode, GameState } from '../src/types';

/**
 * A game with fully controlled pieces: no active pieces unless given, nothing waiting to spawn,
 * and optional board rows (20-char strings, '.' = empty, anything else = locked 'Z').
 */
export function gameWith(
  opts: {
    p0?: ActivePiece;
    p1?: ActivePiece;
    rows?: Record<number, string>;
    mode?: GameMode;
  } = {},
): GameState {
  const state = createGame([1, 2], opts.mode);
```

(The rest of the function body is unchanged.)

- [ ] **Step 2: Write the failing tests**

Create `packages/engine/test/sprint.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SPRINT_LINES } from '../src/constants';
import { applyInput, createGame, tick } from '../src/game';
import { fullRowExcept, gameWith, row, runTicks } from './helpers';

/** Player 0 holds a vertical I in column 0, resting on the floor above a row missing only column 0. */
function oneLineAway(mode: 'marathon' | 'sprint', lines: number) {
  const s = gameWith({
    mode,
    p0: { type: 'I', x: -2, y: 18, rot: 1 },
    rows: { 21: fullRowExcept(0) },
  });
  s.lines = lines;
  return s;
}

describe('game mode', () => {
  it('defaults to marathon with no result', () => {
    const s = createGame([1, 2]);
    expect(s.mode).toBe('marathon');
    expect(s.result).toBeNull();
  });

  it('creates a sprint game', () => {
    expect(createGame([1, 2], 'sprint').mode).toBe('sprint');
    expect(SPRINT_LINES).toBe(40);
  });
});

describe('sprint', () => {
  it('never levels up, so gravity stays at level 1', () => {
    const after = applyInput(oneLineAway('sprint', 19), 0, 'hardDrop');
    expect(after.lines).toBe(20);
    expect(after.level).toBe(1);
    expect(after.over).toBe(false);
  });

  it('finishes as cleared on the 40th line', () => {
    const after = applyInput(oneLineAway('sprint', 39), 0, 'hardDrop');
    expect(after.lines).toBe(40);
    expect(after.over).toBe(true);
    expect(after.result).toBe('cleared');
  });

  it('finishes on a hard drop without advancing the tick', () => {
    const s = oneLineAway('sprint', 39);
    s.tick = 500;
    const after = applyInput(s, 0, 'hardDrop');
    expect(after.tick).toBe(500);
    expect(tick(after).tick).toBe(500);
  });

  it('counts overshoot past 40 lines', () => {
    const s = gameWith({
      mode: 'sprint',
      p0: { type: 'I', x: -2, y: 10, rot: 1 },
      rows: {
        18: fullRowExcept(0),
        19: fullRowExcept(0),
        20: fullRowExcept(0),
        21: fullRowExcept(0),
      },
    });
    s.lines = 38;
    const after = applyInput(s, 0, 'hardDrop');
    expect(after.lines).toBe(42);
    expect(after.result).toBe('cleared');
  });

  it('finishes on a lock-delay lock at that tick', () => {
    const s = oneLineAway('sprint', 39);
    const after = runTicks(s, 30);
    expect(after.over).toBe(true);
    expect(after.result).toBe('cleared');
    expect(after.tick).toBe(30);
    expect(runTicks(after, 10).tick).toBe(30);
  });

  it('cleared wins over a simultaneous partner top-out', () => {
    // Clearing row 21 shifts the cell at row 0 down into the partner's O piece at the ceiling.
    const s = gameWith({
      mode: 'sprint',
      p0: { type: 'I', x: -2, y: 18, rot: 1 },
      p1: { type: 'O', x: 15, y: 1, rot: 0 },
      rows: { 0: row([15]), 21: fullRowExcept(0) },
    });
    s.lines = 39;
    const after = applyInput(s, 0, 'hardDrop');
    expect(after.over).toBe(true);
    expect(after.result).toBe('cleared');
  });
});

describe('top-out result', () => {
  it('is toppedOut when the partner is pushed above the ceiling', () => {
    const s = gameWith({
      p0: { type: 'I', x: -2, y: 18, rot: 1 },
      p1: { type: 'O', x: 15, y: 1, rot: 0 },
      rows: { 0: row([15]), 21: fullRowExcept(0) },
    });
    const after = applyInput(s, 0, 'hardDrop');
    expect(after.over).toBe(true);
    expect(after.result).toBe('toppedOut');
  });

  it('is toppedOut when a spawn is blocked, in either mode', () => {
    for (const mode of ['marathon', 'sprint'] as const) {
      const s = gameWith({ mode, rows: { 0: row([3, 4, 5, 6]), 1: row([3, 4, 5, 6]) } });
      s.players[0].nextSpawn = 'T';
      const after = tick(s);
      expect(after.over).toBe(true);
      expect(after.result).toBe('toppedOut');
    }
  });
});

describe('marathon', () => {
  it('keeps going past 40 lines and still levels up', () => {
    const after = applyInput(oneLineAway('marathon', 39), 0, 'hardDrop');
    expect(after.lines).toBe(40);
    expect(after.level).toBe(3);
    expect(after.over).toBe(false);
    expect(after.result).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH npx vitest run packages/engine/test/sprint.test.ts`
Expected: FAIL (`SPRINT_LINES` is undefined / `mode` and `result` are undefined).

- [ ] **Step 4: Add the types and constant**

In `packages/engine/src/types.ts`, add above `GameState`:

```ts
export type GameMode = 'marathon' | 'sprint';
/** How a finished game ended; null while running or when the room ended it (partner never returned). */
export type GameOutcome = 'cleared' | 'toppedOut';
```

and add two fields to `GameState` (after `level`):

```ts
  level: number;
  mode: GameMode;
  result: GameOutcome | null;
```

In `packages/engine/src/constants.ts`, after `LINES_PER_LEVEL`:

```ts
export const SPRINT_LINES = 40;
```

- [ ] **Step 5: Implement the rules in `game.ts`**

Update the constants import to include `SPRINT_LINES`, and the types import to include `GameMode` and `GameOutcome`.

Replace `createGame`:

```ts
export function createGame(
  seeds: readonly [number, number],
  mode: GameMode = 'marathon',
): GameState {
  const state: GameState = {
    tick: 0,
    board: createBoard(),
    players: [createPlayer(seeds[0]), createPlayer(seeds[1])],
    score: 0,
    lines: 0,
    level: 1,
    mode,
    result: null,
    lockCount: 0,
    lastClear: null,
    over: false,
  };
  for (const player of PLAYER_IDS) trySpawn(state, player);
  return state;
}
```

In `lockPiece`, replace the `if (cleared > 0) { ... }` block with:

```ts
  if (cleared > 0) {
    state.board = board;
    state.score += LINE_SCORES[cleared] * state.level;
    state.lines += cleared;
    if (state.mode === 'marathon') state.level = levelForLines(state.lines);
    state.lastClear = { count: cleared, tick: state.tick };
    // Finish before nudging, so a partner pushed off the top by the winning clear can't turn it into a loss.
    if (state.mode === 'sprint' && state.lines >= SPRINT_LINES) finishGame(state, 'cleared');
    nudgeUp(state, otherPlayer(player));
    if (state.over) return;
  }
```

In `nudgeUp`, replace `state.over = true;` with `finishGame(state, 'toppedOut');`.

In `trySpawn`, replace `state.over = true;` with `finishGame(state, 'toppedOut');`.

Add this helper below `nudgeUp`:

```ts
/** Ends the game with `result`; the first outcome recorded wins. */
function finishGame(state: GameState, result: GameOutcome): void {
  if (state.over) return;
  state.over = true;
  state.result = result;
}
```

- [ ] **Step 6: Run the engine tests**

Run: `PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH npx vitest run packages/engine`
Expected: PASS (all engine tests, including the existing determinism and clears tests).

- [ ] **Step 7: Full checks**

Run: `PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH npm test && PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH npm run typecheck && PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH npm run lint && PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH npx prettier --check .`
Expected: all pass (server and client only call `createGame(seeds)`, which still defaults to marathon).

- [ ] **Step 8: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): add sprint 40L mode and game outcome

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Protocol and room — setMode, mode in roomState, richer gameOver

**Files:**
- Modify: `packages/engine/src/protocol.ts`
- Modify: `packages/engine/test/protocol.test.ts`
- Modify: `packages/server/src/room.ts`
- Modify: `packages/server/src/app.ts` (dispatch `setMode`)
- Create: `packages/server/test/mode.test.ts`
- Modify: `packages/client/test/session.test.ts` (the `roomState()` fixture gains `mode`, so the client still typechecks)

**Interfaces:**
- Consumes (Task 1): `GameMode`, `GameOutcome`, `createGame(seeds, mode)`, `GameState.mode/result/tick`.
- Produces:
  - Client message `{ type: 'setMode'; mode: GameMode }`
  - `RoomStateMessage.mode: GameMode`
  - Server message `{ type: 'gameOver'; mode: GameMode; result: GameOutcome | null; ticks: number; score: number; lines: number; level: number }`
  - `Room.mode: GameMode` and `Room.setMode(player: PlayerId, mode: GameMode): void`

- [ ] **Step 1: Write the failing protocol tests**

Append to the `describe('parseClientMessage', ...)` block in `packages/engine/test/protocol.test.ts`:

```ts
  it('accepts setMode for both modes and rejects anything else', () => {
    expect(parseClientMessage('{"type":"setMode","mode":"sprint"}')).toEqual({
      type: 'setMode',
      mode: 'sprint',
    });
    expect(parseClientMessage('{"type":"setMode","mode":"marathon"}')).toEqual({
      type: 'setMode',
      mode: 'marathon',
    });
    expect(parseClientMessage('{"type":"setMode","mode":"zen"}')).toBeNull();
    expect(parseClientMessage('{"type":"setMode"}')).toBeNull();
  });
```

- [ ] **Step 2: Write the failing room tests**

Create `packages/server/test/mode.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningApp } from '../src/app';
import type { TestClient } from './testClient';
import { createPair, startGame, startTestApp } from './helpers';

let app: RunningApp;
beforeEach(async () => {
  app = await startTestApp();
});
afterEach(async () => {
  await app.close();
});

/** Round-trips a ping so every message sent before it has been processed. */
async function sync(c: TestClient): Promise<void> {
  c.send({ type: 'ping', t: 7 });
  await c.next('pong', (m) => m.t === 7);
}

describe('game mode', () => {
  it('starts new rooms in marathon', async () => {
    const { a } = await createPair(app);
    expect(a.latest('roomState')!.mode).toBe('marathon');
  });

  it('setMode switches both lobbies and clears Ready', async () => {
    const { a, b } = await createPair(app);
    a.send({ type: 'ready', ready: true });
    await b.next('roomState', (m) => m.players[0]?.ready === true);
    b.send({ type: 'setMode', mode: 'sprint' });
    const seen = await a.next('roomState', (m) => m.mode === 'sprint');
    expect(seen.players).toEqual([
      { connected: true, ready: false },
      { connected: true, ready: false },
    ]);
    await b.next('roomState', (m) => m.mode === 'sprint');
  });

  it('selecting the current mode is a no-op', async () => {
    const { a } = await createPair(app);
    a.send({ type: 'ready', ready: true });
    await a.next('roomState', (m) => m.players[0]?.ready === true);
    a.send({ type: 'setMode', mode: 'marathon' });
    await sync(a);
    const latest = a.latest('roomState')!;
    expect(latest.mode).toBe('marathon');
    expect(latest.players[0]?.ready).toBe(true);
  });

  it('ignores setMode outside the lobby', async () => {
    const { a, b } = await createPair(app);
    await startGame(a, b);
    a.send({ type: 'setMode', mode: 'sprint' });
    await sync(a);
    expect(a.latest('roomState')!.mode).toBe('marathon');
    expect(a.latest('snapshot')!.state.mode).toBe('marathon');
  });

  it('plays the chosen mode, reports the outcome, and keeps the mode after play again', async () => {
    const { a, b } = await createPair(app);
    a.send({ type: 'setMode', mode: 'sprint' });
    await b.next('roomState', (m) => m.mode === 'sprint');
    await startGame(a, b);
    expect(a.latest('snapshot')!.state.mode).toBe('sprint');

    for (let seq = 1; seq <= 40; seq++) a.send({ type: 'input', seq, action: 'hardDrop' });
    const over = await a.next('gameOver');
    expect(over.mode).toBe('sprint');
    expect(over.result).toBe('toppedOut');
    expect(over.ticks).toBe(a.latest('snapshot')!.state.tick);

    a.send({ type: 'playAgain' });
    b.send({ type: 'playAgain' });
    const lobby = await a.next('roomState', (m) => m.phase === 'lobby');
    expect(lobby.mode).toBe('sprint');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH npx vitest run packages/engine/test/protocol.test.ts packages/server/test/mode.test.ts`
Expected: FAIL (setMode rejected; `mode` undefined on roomState).

- [ ] **Step 4: Extend the protocol**

In `packages/engine/src/protocol.ts`:

Change the types import to:

```ts
import { ACTIONS, type GameMode, type GameOutcome, type GameState, type PlayerId } from './types';
```

Add to the `clientMessageSchema` union, after the `ready` entry:

```ts
  z.object({ type: z.literal('setMode'), mode: z.enum(['marathon', 'sprint']) }),
```

Add `mode` to `RoomStateMessage` (after `phase`):

```ts
  phase: RoomPhase;
  mode: GameMode;
```

Replace the `gameOver` member of `ServerMessage`:

```ts
  | {
      type: 'gameOver';
      mode: GameMode;
      /** null when the room ended the game (partner never reconnected). */
      result: GameOutcome | null;
      /** Game ticks played; the run time is ticks / TICKS_PER_SECOND. */
      ticks: number;
      score: number;
      lines: number;
      level: number;
    }
```

- [ ] **Step 5: Implement the room changes**

In `packages/server/src/room.ts`:

Add `type GameMode` to the `@mt/engine` import list.

Add a field after `phase`:

```ts
  phase: RoomPhase = 'lobby';
  mode: GameMode = 'marathon';
```

Add this method after `setReady`:

```ts
  setMode(player: PlayerId, mode: GameMode): void {
    const slot = this.slots[player];
    if (this.disposed || this.phase !== 'lobby' || !slot) return;
    this.touch();
    if (mode === this.mode) return;
    this.mode = mode;
    // Nobody should start a mode they didn't agree to.
    for (const p of PLAYERS) {
      const s = this.slots[p];
      if (s) s.ready = false;
    }
    this.broadcastRoomState();
  }
```

In `startGame`, change the `createGame` call to:

```ts
    this.game = createGame([randomInt(2 ** 32), randomInt(2 ** 32)], this.mode);
```

In `endGame`, replace the two lines that destructure and broadcast `gameOver` with:

```ts
      const { mode, result, tick: ticks, score, lines, level } = this.game;
      this.broadcast({ type: 'gameOver', mode, result, ticks, score, lines, level });
```

In `broadcastRoomState`, add `mode: this.mode,` after `phase: this.phase,`.

- [ ] **Step 6: Dispatch `setMode` in the server**

In `packages/server/src/app.ts`, in the second `switch (msg.type)` (the one with `case 'ready':`), add after the `ready` case:

```ts
      case 'setMode':
        room.setMode(player, msg.mode);
        return;
```

- [ ] **Step 7: Keep the client fixture typechecking**

In `packages/client/test/session.test.ts`, in the `roomState()` fixture, add `mode: 'marathon',` after `phase: 'lobby',`.

- [ ] **Step 8: Run the tests**

Run: `PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH npx vitest run packages/engine/test/protocol.test.ts packages/server`
Expected: PASS (new mode tests and all existing server tests).

- [ ] **Step 9: Full checks**

Run: `PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH npm test && PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH npm run typecheck && PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH npm run lint && PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH npx prettier --check .`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add packages/engine packages/server packages/client/test/session.test.ts
git commit -m "feat(server): lobby mode selection and sprint results in gameOver

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Client — lobby toggle, sprint score bar, results overlay, e2e, README

**Files:**
- Modify: `packages/client/src/ui/labels.ts` (add `formatTicks`, `scoreBarStats`, `resultSummary`, `MODE_LABELS`, `MODE_DESCRIPTIONS`)
- Modify: `packages/client/test/labels.test.ts`
- Modify: `packages/client/src/net/session.ts` (`GameResult` fields, reducer, `setMode`)
- Modify: `packages/client/test/session.test.ts`
- Modify: `packages/client/src/ui/ScoreBar.tsx`
- Modify: `packages/client/src/ui/GameScreen.tsx` (ScoreBar call)
- Modify: `packages/client/src/ui/GameOverOverlay.tsx`
- Modify: `packages/client/src/ui/LobbyScreen.tsx`
- Modify: `packages/client/src/styles/theme.css` (mode toggle)
- Modify: `packages/client/src/styles/game.css` (big result time)
- Modify: `e2e/coop.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes (Tasks 1–2): `GameMode`, `GameOutcome`, `SPRINT_LINES`, `TICKS_PER_SECOND`, `GameState.mode/tick`, `RoomStateMessage.mode`, `gameOver.mode/result/ticks`, client message `setMode`.
- Produces:
  - `formatTicks(ticks: number): string`
  - `scoreBarStats(game: Pick<GameState, 'mode' | 'score' | 'lines' | 'level' | 'tick'>): ScoreBarStats`
  - `resultSummary(result: GameResult): { heading: string; time: string | null; detail: string }`
  - `GameResult` = `{ mode; result; ticks; score; lines; level }`
  - `Session.setMode(mode: GameMode): void`

- [ ] **Step 1: Write the failing label tests**

Replace `packages/client/test/labels.test.ts` with:

```ts
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
```

- [ ] **Step 2: Write the failing session tests**

In `packages/client/test/session.test.ts`:

Change the existing fixture on the line `const inGame = { ...initialSession, gameOver: { score: 1, lines: 1, level: 1 } };` to:

```ts
    const inGame = {
      ...initialSession,
      gameOver: {
        mode: 'marathon' as const,
        result: 'toppedOut' as const,
        ticks: 60,
        score: 1,
        lines: 1,
        level: 1,
      },
    };
```

Add inside `describe('reduceServerMessage', ...)`:

```ts
  it('keeps the mode, outcome and time from gameOver', () => {
    const s = reduceServerMessage(
      initialSession,
      {
        type: 'gameOver',
        mode: 'sprint',
        result: 'cleared',
        ticks: 4987,
        score: 900,
        lines: 40,
        level: 1,
      },
      0,
    );
    expect(s.gameOver).toEqual({
      mode: 'sprint',
      result: 'cleared',
      ticks: 4987,
      score: 900,
      lines: 40,
      level: 1,
    });
  });
```

Add a new block at the end of the file:

```ts
describe('setMode', () => {
  it('sends the chosen mode to the server', () => {
    const { session, conn } = setup();
    session.setMode('sprint');
    expect(conn.sent.at(-1)).toEqual({ type: 'setMode', mode: 'sprint' });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH npx vitest run packages/client/test/labels.test.ts packages/client/test/session.test.ts`
Expected: FAIL (`formatTicks` not exported; `setMode` not a function; gameOver missing fields).

- [ ] **Step 4: Implement the session changes**

In `packages/client/src/net/session.ts`:

Add `type GameMode` and `type GameOutcome` to the `@mt/engine` import.

Replace `GameResult`:

```ts
export interface GameResult {
  mode: GameMode;
  result: GameOutcome | null;
  ticks: number;
  score: number;
  lines: number;
  level: number;
}
```

In `reduceServerMessage`, replace the `gameOver` case's `gameOver:` line with:

```ts
        gameOver: {
          mode: msg.mode,
          result: msg.result,
          ticks: msg.ticks,
          score: msg.score,
          lines: msg.lines,
          level: msg.level,
        },
```

Add after `setReady`:

```ts
  setMode(mode: GameMode): void {
    this.send({ type: 'setMode', mode });
  }
```

- [ ] **Step 5: Implement the labels**

Replace `packages/client/src/ui/labels.ts` with:

```ts
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
```

- [ ] **Step 6: Run the unit tests**

Run: `PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH npx vitest run packages/client`
Expected: PASS.

- [ ] **Step 7: Mode-aware score bar**

Replace `packages/client/src/ui/ScoreBar.tsx` with:

```tsx
import type { GameState } from '@mt/engine';
import { scoreBarStats } from './labels';

export function ScoreBar({ game }: { game: GameState }) {
  const { left, center, right } = scoreBarStats(game);
  return (
    <div className="score-bar" data-testid="score-bar">
      <div className="stat">
        {left.label} <b>{left.value}</b>
      </div>
      <div className="emblem">{center}</div>
      <div className="stat">
        {right.label} <b>{right.value}</b>
      </div>
    </div>
  );
}
```

In `packages/client/src/ui/GameScreen.tsx`, replace
`{game && <ScoreBar score={game.score} lines={game.lines} level={game.level} />}`
with
`{game && <ScoreBar game={game} />}`.

- [ ] **Step 8: Mode-aware results overlay**

Replace `packages/client/src/ui/GameOverOverlay.tsx` with:

```tsx
import { useState } from 'react';
import type { GameResult } from '../net/session';
import { session } from '../net/sessionInstance';
import { resultSummary } from './labels';

export function GameOverOverlay({ result }: { result: GameResult }) {
  const [clicked, setClicked] = useState(false);
  const { heading, time, detail } = resultSummary(result);
  return (
    <div className="overlay game-over" data-testid="game-over">
      <div>
        <h2>{heading}</h2>
        {time && <div className="result-time">{time}</div>}
        <div className="stats">{detail}</div>
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

In `packages/client/src/styles/game.css`, add after the `.game-over .stats` rule:

```css
.result-time {
  font: 700 56px var(--font-num);
  margin-bottom: 4px;
}
```

- [ ] **Step 9: Lobby mode toggle**

In `packages/client/src/ui/LobbyScreen.tsx`:

Change the engine import to:

```ts
import type { GameMode, PlayerId, RoomStateMessage, SlotInfo } from '@mt/engine';
```

Add imports:

```ts
import { MODE_DESCRIPTIONS, MODE_LABELS } from './labels';
```

Add below the imports:

```ts
const MODES: readonly GameMode[] = ['marathon', 'sprint'];
```

Insert between the closing `</div>` of `.slots` and the Ready button:

```tsx
        <div className="mode-toggle" role="group" aria-label="Game mode">
          {MODES.map((mode) => (
            <button
              key={mode}
              className={`btn ${room.mode === mode ? 'selected' : ''}`}
              aria-pressed={room.mode === mode}
              onClick={() => {
                if (room.mode !== mode) session.setMode(mode);
              }}
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
        <p className="dim mode-desc">{MODE_DESCRIPTIONS[room.mode]}</p>
```

In `packages/client/src/styles/theme.css`, add after the `.ready-badge` rule:

```css
.mode-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.mode-toggle .btn.selected {
  background: var(--frame-light);
  box-shadow: inset 0 -3px 0 #3fd7c1;
}
.mode-desc {
  text-align: center;
  font-size: 14px;
}
```

- [ ] **Step 10: Add the e2e test**

Append to `e2e/coop.spec.ts`:

```ts
test('either player can switch to Sprint 40L and the run shows lines left and a timer', async ({
  browser,
}) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();

  await a.goto('/');
  await a.getByRole('button', { name: 'Create room' }).click();
  const code = (await a.getByTestId('room-code').textContent())!.trim();
  await b.goto(`/r/${code}`);
  await expect(a.getByTestId('slot-1')).toContainText('Partner');

  await a.getByRole('button', { name: 'Ready', exact: true }).click();
  await expect(b.getByTestId('slot-0')).toContainText('READY');
  await b.getByRole('button', { name: 'Sprint 40L' }).click();
  await expect(a.getByRole('button', { name: 'Sprint 40L' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(b.getByTestId('slot-0')).not.toContainText('READY');

  await a.getByRole('button', { name: 'Ready', exact: true }).click();
  await b.getByRole('button', { name: 'Ready', exact: true }).click();
  await expect(a.getByTestId('game')).toHaveAttribute('data-phase', 'playing', {
    timeout: 10_000,
  });

  const bar = a.getByTestId('score-bar');
  await expect(bar).toContainText('LEFT 40');
  await expect(bar).toContainText('40L');
  await expect(bar).toContainText(/\d+:\d\d\.\d\d/);
});
```

- [ ] **Step 11: Document the mode in the README**

In `README.md`, under `## How it plays`, add this bullet as the first bullet of the list:

```markdown
- Two modes, picked in the lobby by either player: **Marathon** (endless; pieces speed up every 20 lines) and **Sprint 40L** (clear 40 lines together as fast as you can at a fixed speed; the results screen shows your time).
```

- [ ] **Step 12: Full checks including e2e**

Run: `PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH npm test && PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH npm run typecheck && PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH npm run lint && PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH npx prettier --check . && PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH npm run e2e`
Expected: all pass, both Playwright tests green. (If prettier reports files, run `npx prettier --write` on them and re-check.)

- [ ] **Step 13: Commit**

```bash
git add packages/client e2e README.md
git commit -m "feat(client): lobby mode toggle, sprint timer and results screen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
