import { startApp, type RunningApp } from '../src/app';
import type { RoomOptions } from '../src/room';
import { TestClient } from './testClient';

export const TEST_ROOM_OPTIONS: RoomOptions = {
  tickMs: 5,
  countdownTicks: 2,
  reconnectGraceMs: 300,
  snapshotEveryTicks: 1,
  inputsPerSecond: 60,
};

export function startTestApp(
  overrides: Partial<RoomOptions> = {},
  extra: { staticDir?: string; livenessTimeoutMs?: number; livenessCheckMs?: number } = {},
): Promise<RunningApp> {
  return startApp({
    port: 0,
    roomOptions: { ...TEST_ROOM_OPTIONS, ...overrides },
    idleExpiryMs: 100,
    sweepIntervalMs: 20,
    ...extra,
  });
}

export async function createPair(app: RunningApp) {
  const a = await TestClient.connect(app.port);
  a.send({ type: 'createRoom' });
  const { code } = await a.next('roomState');
  const b = await TestClient.connect(app.port);
  b.send({ type: 'joinRoom', code });
  await b.next('roomState');
  return { a, b, code };
}

export async function startGame(a: TestClient, b: TestClient): Promise<void> {
  a.send({ type: 'ready', ready: true });
  b.send({ type: 'ready', ready: true });
  await a.next('roomState', (m) => m.phase === 'playing');
  await b.next('roomState', (m) => m.phase === 'playing');
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
