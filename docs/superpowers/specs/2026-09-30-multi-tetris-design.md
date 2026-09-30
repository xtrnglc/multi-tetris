# Multi-Tetris — Design Spec

**Date:** 2026-09-30
**Status:** Approved in brainstorming; pending written-spec review

## 1. Goal

A publicly deployed, portfolio-quality web app where **two players play co-op Tetris on one shared, wide well** over the internet. Players join a private room via link/code; no accounts.

**Success looks like:** send someone a link → both play a smooth co-op game with no perceptible input lag on your own piece → the codebase is clean and well-tested enough to show in interviews.

### Assumptions
- Desktop + keyboard only.
- No accounts, persistence, or database in v1.

## 2. Game Rules

### Board
- Well is **20 columns × 20 visible rows**, plus **2 hidden rows** above for spawning (22 total).
- Player 1 spawns centered on the left half (piece origin around column 4); Player 2 on the right half (around column 14).

### Controls & handling (guideline-style)
| Action | Default key |
|---|---|
| Move left / right | ← / → |
| Soft drop | ↓ (held) |
| Hard drop | Space |
| Rotate clockwise | ↑ or X |
| Rotate counter-clockwise | Z |
| Hold | C or Shift |

- **DAS 167 ms, ARR 33 ms** for held left/right (applied client-side; see §4).
- **Soft drop** = 20× current gravity while held.
- **Hold**: once per piece; swapping resets the held piece to its spawn orientation at the player's spawn location.
- **Rotation**: SRS with standard wall-kick tables (separate I-piece table).
- **Lock delay**: 500 ms (30 ticks); reset by a successful move or rotate, max **15 resets** per piece. Lock delay only runs while the piece rests on the floor or locked blocks.

### Co-op interaction rules
1. **Active pieces are solid to each other.** Movement, rotation, and every SRS kick test treat the partner's active piece as occupied cells.
2. **Hover rule:** a piece resting on the partner's *active* piece (and not on locked blocks/floor) **never locks** and its lock timer does not run. It resumes falling when space opens.
3. **Hard drop** moves the piece to the lowest reachable position. If that position rests on locked blocks or the floor → locks immediately. If it rests only on the partner's active piece → it hovers (rule 2).
4. **Post-clear nudge:** after a line clear shifts rows down, if any locked cell overlaps the partner's active piece, that piece is moved upward one row at a time until it no longer overlaps.
5. **Spawn:** if the spawn position overlaps the partner's active piece, the spawn is **deferred** and retried each tick. If it overlaps locked blocks → **game over for the team** (block-out).
6. Hold swap-in follows rule 5 (deferred if blocked by partner, game over if blocked by locked blocks).

### Queues
- Each player has their **own seeded 7-bag** randomizer, **own hold slot**, and **own 5-piece next preview**.

### Scoring & progression (shared team score)
- Line clears: single 100, double 300, triple 500, tetris 800, × current level.
- Soft drop: 1 point per cell. Hard drop: 2 points per cell.
- **Level** starts at 1 and increases every **20 lines** (team total).
- Gravity follows the Tetris Guideline curve: seconds per row = `(0.8 − (level − 1) × 0.007)^(level − 1)`, converted to ticks.
- No pause (except the disconnect pause in §4).

### Out of scope (v1)
T-spin / combo / back-to-back bonuses, partner ghost piece, sound, same-keyboard mode, mobile/touch, spectators, accounts, leaderboards.

## 3. Architecture

Monorepo with **npm workspaces**, TypeScript strict everywhere.

```
packages/
  engine/   pure, deterministic game logic + protocol types (shared)
  server/   Node + ws: rooms, authoritative 60 Hz game loop, static hosting
  client/   Vite + React UI, <canvas> board renderer
```
Dependency direction: `client → engine ← server`. `engine` has no I/O, timers, or DOM.

### `engine`
- `pieces.ts` — tetromino shapes, rotation states, SRS kick tables.
- `bag.ts` — seeded PRNG + 7-bag generator. Same seed → same sequence.
- `collision.ts` — `collides(state, piece)` against walls, floor, locked cells, and the other player's active piece.
- `game.ts` —
  - `createGame(seeds): GameState`
  - `applyInput(state, player, action): GameState`
  - `tick(state): GameState` — gravity, soft drop, lock delay, lock, line clear, nudge, spawn, game over.
- `scoring.ts` — points, level, gravity table.
- `protocol.ts` — message type definitions and runtime validators.
- **Time is measured in ticks (60/sec).** No wall-clock time inside the engine, so identical inputs yield identical states on client and server.

### `server`
- `RoomManager` — create rooms with 4-character codes (unambiguous alphabet), join/leave, reconnect tokens, expire rooms idle for 10 minutes.
- `Room` — owns one `GameState`; lifecycle `lobby → countdown → playing → paused → over`; runs a 60 Hz loop; drains queued inputs each tick in arrival order; broadcasts snapshots.
- HTTP: serves built client assets, SPA fallback for `/r/:code`, `GET /healthz`, WebSocket at `/ws`.

### `client`
- `input/keyboard.ts` — converts key state into discrete actions, implementing DAS/ARR and soft-drop on/off.
- `net/connection.ts` — typed WebSocket wrapper.
- `net/prediction.ts` — local prediction + reconciliation (§4).
- `render/board.ts` — canvas rendering of well, blocks, player glow, own ghost piece.
- React screens: **Home**, **Lobby**, **Game**, **GameOver**.

## 4. Networking

WebSocket, JSON messages, all types defined in `engine/protocol.ts` and validated server-side.

### Client → server
| Message | Payload |
|---|---|
| `createRoom` | — |
| `joinRoom` | `{ code, reconnectToken? }` |
| `ready` | `{ ready: boolean }` |
| `input` | `{ seq, action }` — action ∈ `left, right, softDropOn, softDropOff, hardDrop, rotateCW, rotateCCW, hold` |
| `playAgain` | — |

### Server → client
| Message | Payload |
|---|---|
| `roomState` | `{ code, you: 1\|2, players, ready, phase, reconnectToken }` |
| `gameStart` | `{ seeds, countdownTicks }` |
| `snapshot` | `{ tick, state, ackSeq }` — full `GameState`; `ackSeq` = last input seq processed for the receiving player |
| `gameOver` | `{ score, lines, level }` |
| `partnerDisconnected` / `partnerReconnected` | — |
| `error` | `{ reason }` — e.g. `roomNotFound`, `roomFull`, `badMessage` |

### Snapshots
Full state broadcast at **30 Hz**, plus immediately after any lock or line clear. State is ~1 KB; no delta compression.

### Build stages
- **Stage 1 (no prediction):** client renders the latest server snapshot only.
- **Stage 2 (prediction):** client applies its own inputs locally via `engine.applyInput` and records them as pending. On each snapshot: adopt server state, drop pending inputs with `seq ≤ ackSeq`, replay the rest. Gravity and the partner's piece always come from the server. Own next spawn is predicted from the player's seeded bag. Mispredictions snap to server state.

### Server rules
- Inputs apply on the next tick in arrival order; no rewind.
- Invalid/unknown messages → `error { badMessage }`, ignored.
- Inputs rate-limited to ~60/sec per player; excess dropped.

### Rooms & disconnects
- Max 2 players; a third join → `error { roomFull }`.
- Game starts after both players are ready, with a 3-2-1 countdown.
- Each player receives a **reconnect token**, stored in `sessionStorage`.
- Mid-game disconnect → game **pauses up to 30 seconds**. Rejoin with a valid token → 3-second countdown, then resume. Timeout → game over with current score.
- `playAgain` from both players → return to lobby in the same room.
- Server restart loses all in-memory rooms (accepted).

## 5. UI — TETR.IO-inspired

Visual style follows TETR.IO as a reference, recreated with original assets (no copied logos, fonts, or images).

### Visual language
- **Background:** deep purple gradient with a faint drifting starfield.
- **Well:** near-black with a subtle dark grid.
- **Panels:** thick purple frames with chamfered/angled corners, black interiors, bold uppercase labels (**HOLD**, **NEXT**).
- **Type:** condensed geometric sans for labels (Rajdhani, Google Fonts); monospace for numbers.
- **Blocks:** flat, slightly desaturated colors with a thin bevel — I teal-green, O yellow, T magenta, S lime, Z red, L orange, J blue-violet.
- **Player accents:** P1 ice-blue, P2 gold. Used on that player's side panels, "PLAYER 1"/"PLAYER 2" label (no custom names in v1), and a soft glow around their active piece. Locked blocks carry no player marking.

### Game screen
```
┌HOLD─────┐ ┌─────────── shared 20-wide well ───────────┐ ┌─────HOLD┐
│ P1 hold │ │                                           │ │ P2 hold │
└─────────┘ │     ▓▓ P1 piece           ░░ P2 piece     │ └─────────┘
┌NEXT─────┐ │                                           │ ┌─────NEXT┐
│ P1 next │ │                                           │ │ P2 next │
│   ×5    │ │                                           │ │   ×5    │
└─────────┘ └───────────────────────────────────────────┘ └─────────┘
  PLAYER 1           ◆ SCORE 12,400 ◆  LINES 37  LV 2       PLAYER 2
```
- Both players' HOLD and 5-piece NEXT queues always visible, on their respective sides. Own side labeled **(You)**.
- Own ghost piece shown as a faint outline; partner ghost not shown.
- Shared score bottom-center in a winged emblem; lines and level alongside.
- Brief large letter-spaced callout on line clears (SINGLE / DOUBLE / TRIPLE / TETRIS); cosmetic only.
- Connection indicator (ping); banner when partner disconnects, with reconnect countdown.
- `?` toggles a controls overlay (also shown in lobby).

### Other screens
- **Home:** title, **Create room**, **Join room** (code input). Visiting `/r/CODE` auto-joins.
- **Lobby:** big room code, **Copy link**, two player slots ("You" / "Waiting…"), **Ready** toggle, controls reference.
- **Game Over:** final score, lines, level; **Play again** (both must click), **Leave**.
- Viewports under ~900px wide show a "keyboard required" notice.

## 6. Testing

Vitest across packages.

- **engine (primary):** collision; SRS kicks incl. standard kick cases; bag distribution + seed determinism; lock delay + 15-reset cap; line clear + scoring per level; gravity table; co-op rules (mutual blocking, hover never locks, hard drop onto partner hovers, post-clear nudge, deferred spawn, block-out game over); replay determinism.
- **server:** integration tests with a real server on a random port and two `ws` clients — create/join, room full, ready → start, input → snapshot, validation, rate limit, disconnect → pause → reconnect → resume, and timeout → game over.
- **client:** keyboard DAS/ARR with fake timers; prediction reconciliation with synthetic snapshots.
- **E2E:** one Playwright smoke test — two browser contexts create/join, ready, hard drop, both see the locked piece.

## 7. Tooling & Deployment

- `npm run dev`: Vite client + watched server; Vite proxies `/ws`.
- TypeScript strict, ESLint, Prettier.
- GitHub Actions CI: typecheck, lint, test on every push.

### Deployment (Fly.io)
- **One Node service** serves the built client assets and the `/ws` WebSocket endpoint on the same origin — no CORS or cross-origin config.
- **Multi-stage Dockerfile:** install → build `engine`, `client`, `server` → slim runtime image with the server bundle and client `dist/`.
- **`fly.toml`:** HTTPS on `<app>.fly.dev` (WebSockets as `wss://` on the same host); HTTP health check on `GET /healthz`; auto-stop when idle and auto-start on request.
- **Single instance required.** Rooms live in server memory, so the app must run on exactly one machine (pinned to 1; no horizontal scaling). Scaling out would split players across machines who could not find each other's room.
- **Continuous deployment:** a GitHub Actions job runs `fly deploy` on push to `main` after typecheck, lint, and tests pass (uses a `FLY_API_TOKEN` repo secret).
- Optional custom domain via `fly certs add`.
- Server restart or idle auto-stop drops in-memory rooms; acceptable since idle stop only occurs with no connected players.
