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
