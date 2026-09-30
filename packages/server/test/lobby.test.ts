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
