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
