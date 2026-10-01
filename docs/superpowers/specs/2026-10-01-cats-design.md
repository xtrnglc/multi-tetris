# Cats — Design

**Date:** 2026-10-01
**Builds on:** `docs/superpowers/specs/2026-09-30-multi-tetris-design.md`, `docs/superpowers/specs/2026-10-01-sprint-mode-design.md`

## Goal

Add three animated pixel-art cats, modelled on the owner's real cats, that live around the home screen, the lobby and the gameplay screen and act out their personalities, reacting to the game and (on home/lobby) to the mouse. Purely cosmetic and client-only.

## The cast

| Cat  | Look                                                              | Personality                    |
| ---- | ----------------------------------------------------------------- | ------------------------------ |
| Misa | Grey/white tabby, thin, smaller than the others                   | Very shy, skittish             |
| Max  | Grey, white chest, white paws (socks)                             | Brave, curious, always moving  |
| Raye | Cream/beige, greyish face markings, darker ears                   | Sleepy, chill                  |

## Decisions

| Topic          | Decision                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Art style      | Pixel art                                                                                      |
| Gameplay layout | Perched on the game: Max on the well's top edge, Raye on the left HOLD panel, Misa under the right panel |
| Home / lobby   | Perched on the menu panel and reacting to the mouse                                             |
| Sound          | None (meows are speech bubbles)                                                                 |
| Rendering      | One small canvas per cat in an overlay layer, anchored to real DOM elements                     |
| Server/engine  | Unchanged                                                                                       |

## 1. Sprites and animation

- **Shared skeleton, three coats.** Poses are authored once as text grids (16×16, one character per pixel). Each cat has a palette and a small set of per-pixel overrides: Misa's tabby stripes, Max's white chest and socks, Raye's face markings and darker ears.
- **Display size.** Integer scaling with `image-rendering: pixelated`: Max and Raye at 3× (48 px), Misa at 2× (32 px).
- **Pre-rendering.** At startup every cat × pose × frame is drawn once to an offscreen canvas; animation swaps images.
- **Facing.** Side-view poses are authored facing right and mirrored for left.

### Pose library

| Pose             | Frames                               | Used by                 |
| ---------------- | ------------------------------------ | ----------------------- |
| `sit`            | 2 (blink, tail flick)                | all                     |
| `walk`           | 4                                    | Max, Misa               |
| `run`            | 2                                    | Max, Misa               |
| `crouch`         | 2                                    | Max                     |
| `pounce`         | 1 (airborne)                         | Max                     |
| `flinch`         | 1 (ears flat, low)                   | Misa                    |
| `peek`           | 1 (half body)                        | Misa                    |
| `sleep`          | 2 (breathing)                        | Raye                    |
| `alert`          | 1 (head up)                          | Raye                    |
| `stretch`        | 2                                    | Raye, Max               |
| `yawn`           | 1                                    | Raye                    |
| `earTwitch`      | 1                                    | Raye                    |
| `oneEye`         | 1                                    | Raye                    |

- **Bubbles.** Max's `meow!` and Raye's `z z z` are small DOM text bubbles in the UI font that fade after about 1 s (`z z z` repeats while asleep).

## 2. Behaviour and triggers

### Cat events (derived in the client)

A pure function compares the previous and next `GameState` the client already holds (snapshot or predicted) and emits:

- `clear { count }`: `lastClear` changed (new `tick`). `count === 4` is a Tetris.
- `hardDrop { player, column }`: when `lockCount` rises above the highest value seen, the player whose active piece locked is the one whose `prev` active piece is gone or replaced (next active is null or higher on the board). It counts as a hard drop if that piece's ghost row (where it would land) is at least **3 rows** below its last-seen row. `column` is the centre column of the landing position. This single rule covers the local player (whose hard drop is predicted instantly) and the partner (seen via snapshots), because gravity and soft drop never move a piece 3 rows between consecutive states.
- `danger { on }`: on when any locked cell is in the top **6** visible rows; off when no locked cell is in the top **8** visible rows (hysteresis).
- `gameOver`: `over` became true.
- Continuous inputs: the local player's active piece centre column (Max's target), cursor position, clicks on Raye, `prefers-reduced-motion`.

Events are emitted only for increases past the highest `lockCount` / latest `lastClear.tick` seen, so snapshot reconciliation never replays an event.

### Gameplay screen

- **Max** (on the top edge of the well)
  - Walks along the edge to stay above the local player's piece; runs when more than about a quarter of the well away; sits when aligned.
  - `hardDrop` (either player): crouch (~150 ms), arc jump toward the landing column along the edge, land.
  - `clear`: `meow!` bubble.
  - Idle: occasional stretch; a random `meow!` every 20–40 s.
- **Misa** (peeking from under the right side panel)
  - `clear` with count 1–3: `flinch` for 0.6 s.
  - Tetris: run off the right edge of the screen, stay away 3–5 s, then walk back slowly with one pause, then `peek` again. Another Tetris while away extends the absence.
- **Raye** (on top of the left HOLD panel)
  - Default `sleep` with `z z z`.
  - `danger on`: `alert` (head up) until danger has been off for 2 s, then `sleep`.
  - Tetris: `earTwitch`.
  - `gameOver`: `oneEye`, held for the rest of the game-over screen.
  - Idle: `stretch` + `yawn` every 30–60 s, then back to `sleep`.

### Home and lobby

- **Max** walks along the menu panel's top edge to stay under the cursor's x position (clamped to the edge) and sits when caught up; after 5 s without mouse movement he wanders on his own.
- **Misa** peeks from the panel's side; when the cursor comes within about 120 px she runs behind the panel and peeks again 2 s after it leaves.
- **Raye** sleeps on a top corner of the panel; clicking (or tapping) her plays `stretch` → `yawn` → `sleep`, with a cooldown so repeated clicks don't restart it.

### Accessibility and devices

- `prefers-reduced-motion: reduce`: no walking, running or jumping; cats stay at their perches and only change poses.
- Touch (no hover): Max wanders on his own, Misa only peeks; tapping Raye still works.

## 3. Integration

### Files (all in `packages/client/src/cats/`)

| File            | Responsibility                                                                    |
| --------------- | --------------------------------------------------------------------------------- |
| `sprites.ts`    | Pose grids, palettes, per-cat overrides                                           |
| `spriteSheet.ts` | Pre-render cat × pose × frame to offscreen canvases                              |
| `events.ts`     | Pure `(prev, next, seen) → CatEvent[]` derivation                                 |
| `max.ts`, `misa.ts`, `raye.ts` | Pure behaviour: `(state, events, inputs, dtMs, rng) → state` exposing pose, frame, position, facing, bubble |
| `CatLayer.tsx`  | Overlay component: one rAF loop, anchors cats to DOM elements, draws canvases and bubbles |

### Screen changes

- **Gameplay:** the layout gets roughly 50 px of extra top space so Max can stand above the well and Raye above the left HOLD panel. The well, the left HOLD panel and the right side panel get anchor attributes (`data-cat-anchor="…"`).
- **Home and lobby:** the menu panel gets an anchor attribute.
- **Pointer events:** the overlay is `pointer-events: none` except on Raye's sprite, so buttons are never blocked.

### Performance

One `requestAnimationFrame` loop; a cat's canvas is redrawn only when its pose or frame changes; the browser pauses rAF in background tabs.

## 4. Testing

- **Events:** clear, Tetris, hard drop by each player, a fast soft drop that is not a hard drop, danger hysteresis, game over, no duplicate events after reconciliation.
- **Behaviours** (fake clock and seeded random): Misa leaves on a Tetris and is back within 3–5 s; Raye wakes on danger and sleeps after 2 s of calm; Max approaches his target and runs the crouch → pounce sequence; home/lobby cursor and click reactions; reduced motion never moves a cat.
- **Sprites:** every grid has 16 rows of 16 characters and uses only palette letters.
- **Playwright:** all three cats are present on home, lobby and game; the existing click flows still pass through the overlay.
- README screenshots are retaken with the cats.

## Out of scope

Sound, a setting to hide the cats, additional cats or skins, any server or engine change.
