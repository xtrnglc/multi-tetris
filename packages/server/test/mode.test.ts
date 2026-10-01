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

    a.drain();
    a.send({ type: 'playAgain' });
    b.send({ type: 'playAgain' });
    const lobby = await a.next('roomState', (m) => m.phase === 'lobby');
    expect(lobby.mode).toBe('sprint');
  });
});
