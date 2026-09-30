import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunningApp } from '../src/app';
import { Room, type RoomClient } from '../src/room';
import { TEST_ROOM_OPTIONS, startTestApp } from './helpers';
import { TestClient } from './testClient';

describe('oversized frames', () => {
  let app: RunningApp;
  beforeEach(async () => {
    app = await startTestApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it('does not take down the server', async () => {
    const bad = await TestClient.connect(app.port);
    bad.send('x'.repeat(5000));
    const good = await TestClient.connect(app.port);
    good.send({ type: 'ping', t: 7 });
    expect((await good.next('pong')).t).toBe(7);
    const res = await fetch(`http://127.0.0.1:${app.port}/healthz`);
    expect(res.status).toBe(200);
  });
});

describe('disposed room', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores leave: no phase change and no timers', () => {
    const fake = (): RoomClient => ({ send: () => {} });
    const room = new Room('ABCD', TEST_ROOM_OPTIONS);
    const c0 = fake();
    const c1 = fake();
    const p0 = room.join(c0);
    const p1 = room.join(c1);
    if (!p0.ok || !p1.ok) throw new Error('join failed');
    room.setReady(p0.player, true);
    room.setReady(p1.player, true);
    expect(room.phase).toBe('countdown');
    room.dispose();
    expect(vi.getTimerCount()).toBe(0);
    room.leave(p0.player, c0);
    expect(room.phase).toBe('countdown');
    expect(vi.getTimerCount()).toBe(0);
  });
});
