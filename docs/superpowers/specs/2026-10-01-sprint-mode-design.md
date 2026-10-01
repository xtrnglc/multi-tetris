# Sprint 40L Mode — Design

**Date:** 2026-10-01
**Builds on:** `docs/superpowers/specs/2026-09-30-multi-tetris-design.md`

## Goal

Add a second game mode, **Sprint 40L**: both players race together to clear 40 lines on the shared well as fast as possible. The existing endless co-op mode becomes **Marathon**. Players pick the mode in the lobby.

## Decisions

| Topic           | Decision                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| Records         | None. The results screen shows the run's time; nothing is stored.                                           |
| Gravity         | Fixed at level 1 for the whole run (1 row/s; soft drop 20×). Level never changes.                           |
| Mode selection  | Lobby toggle; either player may change it. A change clears both players' Ready flags.                       |
| Where rules live | In the shared engine (`@mt/engine`), so the server and client prediction agree and rules are unit-testable. |

## 1. Engine

### State and API

- `export type GameMode = 'marathon' | 'sprint'` and `export type GameOutcome = 'cleared' | 'toppedOut'` in `types.ts`.
- `GameState` gains `mode: GameMode` and `result: GameOutcome | null` (`null` while the game is running).
- `createGame(seeds, mode: GameMode = 'marathon')`. The default keeps existing callers and tests unchanged.
- New constant `SPRINT_LINES = 40` in `constants.ts`.

### Rules

- **Gravity:** in sprint, the level stays 1. The level-up after a line clear only applies in marathon.
- **Finish:** in `lockPiece`, after a clear in sprint, if `state.lines >= SPRINT_LINES` then `state.over = true` and `state.result = 'cleared'`. Overshoot counts (38 + a 4-line clear ends at 42). The run ends on the lock that crossed 40, including a lock caused by a hard drop inside `applyInput`.
- **Top-out:** every existing game-over path (blocked spawn, a post-clear nudge above row 0) sets `result = 'toppedOut'` in both modes.
- **Score:** still accumulates identically (×1 at level 1) but is not displayed in sprint.

### Timer

- Run time in ticks is `state.tick` at the moment the game ends; seconds = `tick / TICKS_PER_SECOND`.
- Ticks begin at 0 when play starts (after the countdown) and do not advance while the room is paused, so disconnect pauses are excluded automatically.

## 2. Protocol and room

### Protocol (`protocol.ts`)

- New client message `{ type: 'setMode', mode: 'marathon' | 'sprint' }` validated by zod; any other mode value is rejected as a bad message.
- `RoomStateMessage` gains `mode: GameMode`.
- `gameOver` becomes `{ type: 'gameOver'; mode; result; ticks; score; lines; level }`.

### Room (`room.ts`)

- `mode: GameMode = 'marathon'` on new rooms.
- `setMode(player, mode)`: ignored unless phase is `lobby` and the sender holds the slot. If `mode` equals the current mode, no-op. Otherwise set it, clear both slots' `ready`, and broadcast `roomState`.
- `startCountdown` passes `this.mode` to `createGame`.
- The mode persists across Play again (back to lobby) and reconnects; it changes only through `setMode`.
- `gameOver` broadcast includes `mode`, `result` and `ticks` (= `game.tick`).

## 3. Client

### Session

- Session state exposes `mode` from `roomState`, and `session.setMode(mode)` sends the message.
- `GameResult` (game-over payload) carries `mode`, `result`, `ticks` alongside score, lines and level.

### Lobby

- A segmented toggle **MARATHON | SPRINT 40L** above the Ready buttons, with a one-line description of the selected mode. Clicking the unselected option calls `session.setMode`.

### In-game score bar

| Position | Marathon (unchanged) | Sprint                             |
| -------- | -------------------- | ---------------------------------- |
| Left     | `LINES n`            | `LEFT n` = `max(0, 40 − lines)`    |
| Center   | score                | timer `m:ss.cc` from `game.tick`   |
| Right    | `LV n`               | `40L`                              |

- A pure `formatTicks(ticks): string` helper (e.g. `4987 → "1:23.11"`) renders `m:ss.cc`.

### Results overlay

- Sprint, cleared: heading **CLEARED!**, the time large, `<lines> LINES` beneath.
- Sprint, topped out: heading **TOPPED OUT**, `<lines> / 40 LINES · <time>` beneath.
- Marathon: unchanged (**GAME OVER**, score · lines · level).
- Play again and Leave are unchanged.

## 4. Testing

- **Engine:** sprint never levels up and gravity stays at level-1 rate; clearing to ≥ 40 ends with `cleared` (exact and overshoot cases, and via hard drop); top-out sets `toppedOut` in both modes; marathon still levels up and never ends at 40.
- **Protocol:** `setMode` parses; invalid mode is rejected.
- **Room integration:** `setMode` clears Ready, is ignored outside the lobby and is a no-op for the current mode; the chosen mode reaches the game; mode survives Play again; `gameOver` carries `result` and `ticks`.
- **Client unit:** `formatTicks`; score bar labels per mode.
- **Playwright e2e:** existing marathon flow unchanged; a new step switches to Sprint in one browser, sees it in the partner's lobby, starts, and sees `LEFT 40` and a timer.

## Out of scope

Persistent or best times, leaderboards, ghost races, sprint lengths other than 40, a "GO!" splash.
