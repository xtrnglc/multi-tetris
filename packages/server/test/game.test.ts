import { afterEach, describe, expect, it } from 'vitest';
import { spawnPosition } from '@mt/engine';
import type { RunningApp } from '../src/app';
import { TestClient } from './testClient';
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

  it('never rate-limits softDropOff, so soft drop cannot stick on', async () => {
    app = await startTestApp();
    const { a, b } = await createPair(app);
    await startGame(a, b);
    for (let seq = 1; seq <= 100; seq++) a.send({ type: 'input', seq, action: 'rotateCW' });
    a.send({ type: 'input', seq: 101, action: 'softDropOff' });
    const snap = await a.next('snapshot', (m) => m.ackSeq === 101);
    expect(snap.ackSeq).toBe(101);
  });

  it('ignores inputs from a superseded socket (duplicated tab)', async () => {
    app = await startTestApp();
    const { a, b, code } = await createPair(app);
    await startGame(a, b);
    const token = a.latest('roomState')!.reconnectToken;
    const type = a.latest('snapshot')!.state.players[0].active!.type;
    const a2 = await TestClient.connect(app.port);
    a2.send({ type: 'joinRoom', code, reconnectToken: token });
    await a2.next('snapshot');

    a.send({ type: 'input', seq: 5, action: 'left' });
    a.send({ type: 'ping', t: 1 });
    await a.next('pong');
    a2.send({ type: 'input', seq: 6, action: 'softDropOff' });
    const snap = await a2.next('snapshot', (m) => m.ackSeq === 6);
    expect(snap.state.players[0].active!.x).toBe(spawnPosition(type, 0).x);
    expect(a2.received.some((m) => m.type === 'snapshot' && m.ackSeq === 5)).toBe(false);
    await a2.close();
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

describe('play again when the partner leaves', () => {
  async function gameOver() {
    app = await startTestApp();
    const pair = await createPair(app);
    await startGame(pair.a, pair.b);
    for (let seq = 1; seq <= 40; seq++) pair.a.send({ type: 'input', seq, action: 'hardDrop' });
    await pair.a.next('roomState', (m) => m.phase === 'over');
    await pair.b.next('roomState', (m) => m.phase === 'over');
    pair.a.drain();
    pair.b.drain();
    return pair;
  }

  it('partner leaves, then the other clicks play again', async () => {
    const { a, b } = await gameOver();
    await b.close();
    await a.next('roomState', (m) => m.players[1] === null);
    a.send({ type: 'playAgain' });
    await a.next('roomState', (m) => m.phase === 'lobby');
  });

  it('the other clicks play again, then the partner leaves', async () => {
    const { a, b } = await gameOver();
    a.send({ type: 'playAgain' });
    await b.close();
    await a.next('roomState', (m) => m.phase === 'lobby');
  });
});
