import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientMessage, RoomStateMessage } from '@mt/engine';
import {
  Session,
  initialSession,
  normalizeCode,
  reduceServerMessage,
  roomCodeFromPath,
  type ConnectionHandlers,
  type ConnectionLike,
} from '../src/net/session';

class FakeConnection implements ConnectionLike {
  isOpen = true;
  sent: ClientMessage[] = [];
  send(msg: ClientMessage) {
    this.sent.push(msg);
  }
  close() {
    this.isOpen = false;
  }
}

function roomState(patch: Partial<RoomStateMessage> = {}): RoomStateMessage {
  return {
    type: 'roomState',
    code: 'K7QX',
    you: 0,
    players: [{ connected: true, ready: false }, null],
    phase: 'lobby',
    mode: 'marathon',
    reconnectToken: 'tok-1',
    ...patch,
  };
}

function setup() {
  const conn = new FakeConnection();
  const store = new Map<string, string>();
  const paths: string[] = [];
  let handlers!: ConnectionHandlers;
  const connect = vi.fn((h: ConnectionHandlers) => {
    handlers = h;
    return conn;
  });
  const session = new Session({
    connect,
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
    now: () => 1000,
    setPath: (p) => paths.push(p),
  });
  session.connect();
  handlers.onOpen();
  return { session, conn, store, paths, connect, handlers: () => handlers };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('room codes', () => {
  it('normalizes typed codes', () => {
    expect(normalizeCode(' k7qx ')).toBe('K7QX');
  });
  it('reads codes from /r/CODE paths', () => {
    expect(roomCodeFromPath('/r/k7qx')).toBe('K7QX');
    expect(roomCodeFromPath('/r/K7QX/')).toBe('K7QX');
    expect(roomCodeFromPath('/')).toBeNull();
    expect(roomCodeFromPath('/r/TOOLONG')).toBeNull();
  });
});

describe('reduceServerMessage', () => {
  it('computes the countdown end from ticks', () => {
    const s = reduceServerMessage(initialSession, { type: 'gameStart', countdownTicks: 180 }, 1000);
    expect(s.countdownEndsAt).toBe(4000);
  });
  it('records ping from pong', () => {
    expect(reduceServerMessage(initialSession, { type: 'pong', t: 940 }, 1000).pingMs).toBe(60);
  });
  it('clears game state when the room returns to the lobby', () => {
    const inGame = { ...initialSession, gameOver: { score: 1, lines: 1, level: 1 } };
    const s = reduceServerMessage(inGame, roomState({ phase: 'lobby' }), 0);
    expect(s.gameOver).toBeNull();
    expect(s.room?.code).toBe('K7QX');
  });
  it('drops the room on roomNotFound (e.g. a stale rejoin)', () => {
    const inRoom = { ...initialSession, room: roomState() };
    const s = reduceServerMessage(inRoom, { type: 'error', reason: 'roomNotFound' }, 0);
    expect(s.room).toBeNull();
    expect(s.error).toBe('roomNotFound');
  });
});

describe('Session', () => {
  it('joinRoom normalizes the code and sends a stored reconnect token (page refresh)', () => {
    const { session, conn, store } = setup();
    store.set('mt:token:K7QX', 'saved-token');
    session.joinRoom(' k7qx ');
    expect(conn.sent.at(-1)).toEqual({
      type: 'joinRoom',
      code: 'K7QX',
      reconnectToken: 'saved-token',
    });
  });

  it('stores the reconnect token and updates the URL on roomState', () => {
    const { store, paths, handlers } = setup();
    handlers().onMessage(roomState());
    expect(store.get('mt:token:K7QX')).toBe('tok-1');
    expect(paths.at(-1)).toBe('/r/K7QX');
  });

  it('only sends inputs while playing', () => {
    const { session, conn, handlers } = setup();
    handlers().onMessage(roomState({ phase: 'countdown' }));
    session.sendInput('left');
    expect(conn.sent.filter((m) => m.type === 'input')).toHaveLength(0);
    handlers().onMessage(roomState({ phase: 'playing' }));
    session.sendInput('left');
    expect(conn.sent.filter((m) => m.type === 'input')).toEqual([
      { type: 'input', seq: 1, action: 'left' },
    ]);
  });

  it('reconnects after a dropped connection and rejoins with its token', () => {
    const { session, conn, connect, handlers } = setup();
    handlers().onMessage(roomState({ phase: 'playing' }));
    handlers().onClose();
    expect(session.getState().status).toBe('reconnecting');
    vi.advanceTimersByTime(1000);
    expect(connect).toHaveBeenCalledTimes(2);
    handlers().onOpen();
    expect(conn.sent.at(-1)).toEqual({ type: 'joinRoom', code: 'K7QX', reconnectToken: 'tok-1' });
  });

  it('queues messages sent before the socket opens', () => {
    const conn = new FakeConnection();
    conn.isOpen = false;
    let handlers!: ConnectionHandlers;
    const session = new Session({
      connect: (h) => {
        handlers = h;
        return conn;
      },
      storage: { getItem: () => null, setItem: () => {} },
      now: () => 0,
      setPath: () => {},
    });
    session.connect();
    session.createRoom();
    expect(conn.sent).toEqual([]);
    conn.isOpen = true;
    handlers.onOpen();
    expect(conn.sent).toEqual([{ type: 'createRoom' }]);
  });

  it('shows the predicted result of an input before the server confirms it', async () => {
    const { createGame } = await import('@mt/engine');
    const { session, handlers } = setup();
    handlers().onMessage(roomState({ phase: 'playing' }));
    const server = createGame([1, 2]);
    server.players[0].active = { type: 'T', x: 4, y: 5, rot: 0 };
    handlers().onMessage({ type: 'snapshot', tick: 0, state: server, ackSeq: 0 });
    session.sendInput('left');
    expect(session.getState().game!.players[0].active!.x).toBe(3);
    handlers().onMessage({ type: 'snapshot', tick: 1, state: server, ackSeq: 0 });
    expect(session.getState().game!.players[0].active!.x).toBe(3);
  });

  it('drops unacknowledged predictions when the room leaves the playing phase', async () => {
    const { createGame } = await import('@mt/engine');
    const { session, handlers } = setup();
    handlers().onMessage(roomState({ phase: 'playing' }));
    const server = createGame([1, 2]);
    server.players[0].active = { type: 'T', x: 4, y: 5, rot: 0 };
    handlers().onMessage({ type: 'snapshot', tick: 0, state: server, ackSeq: 0 });
    session.sendInput('left');
    expect(session.getState().game!.players[0].active!.x).toBe(3);
    handlers().onMessage(roomState({ phase: 'paused' }));
    handlers().onMessage({ type: 'snapshot', tick: 1, state: server, ackSeq: 0 });
    expect(session.getState().game!.players[0].active!.x).toBe(4);
  });
});

describe('Session connection ownership', () => {
  function multi() {
    const conns: { conn: FakeConnection; handlers: ConnectionHandlers }[] = [];
    const session = new Session({
      connect: (handlers) => {
        const conn = new FakeConnection();
        conns.push({ conn, handlers });
        return conn;
      },
      storage: { getItem: () => null, setItem: () => {} },
      now: () => 1000,
      setPath: () => {},
    });
    session.connect();
    conns[0]!.handlers.onOpen();
    return { session, conns };
  }

  it('leave() while reconnecting cancels the pending reconnect timer', () => {
    const { session, conns } = multi();
    conns[0]!.handlers.onMessage(roomState());
    conns[0]!.handlers.onClose();
    expect(session.getState().status).toBe('reconnecting');
    session.leave();
    expect(conns).toHaveLength(2);
    vi.advanceTimersByTime(5000);
    expect(conns).toHaveLength(2);
  });

  it('ignores events from a connection that is no longer current', () => {
    const { session, conns } = multi();
    conns[0]!.handlers.onMessage(roomState());
    session.leave();
    conns[1]!.handlers.onOpen();
    const before = session.getState();
    conns[0]!.handlers.onMessage(roomState({ code: 'ZZZZ' }));
    conns[0]!.handlers.onClose();
    vi.advanceTimersByTime(5000);
    expect(session.getState()).toBe(before);
    expect(session.getState().room).toBeNull();
    expect(conns).toHaveLength(2);
  });
});

describe('Session dead-connection detection', () => {
  function live() {
    const conns: { conn: FakeConnection; handlers: ConnectionHandlers }[] = [];
    const session = new Session({
      connect: (handlers) => {
        const conn = new FakeConnection();
        conns.push({ conn, handlers });
        return conn;
      },
      storage: { getItem: () => null, setItem: () => {} },
      now: () => Date.now(), // fake timers advance Date too
      setPath: () => {},
    });
    session.connect();
    conns[0]!.handlers.onOpen();
    conns[0]!.handlers.onMessage(roomState({ phase: 'playing' }));
    return { session, conns };
  }

  it('reconnects and rejoins when no pong arrives', () => {
    const { session, conns } = live();
    vi.advanceTimersByTime(10_000);
    expect(conns[0]!.conn.isOpen).toBe(false);
    expect(session.getState().status).toBe('reconnecting');
    vi.advanceTimersByTime(1000);
    expect(conns).toHaveLength(2);
    conns[1]!.handlers.onOpen();
    expect(conns[1]!.conn.sent.at(-1)).toEqual({
      type: 'joinRoom',
      code: 'K7QX',
      reconnectToken: 'tok-1',
    });
  });

  it('stays connected while pongs keep arriving', () => {
    const { session, conns } = live();
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(2000);
      conns[0]!.handlers.onMessage({ type: 'pong', t: Date.now() });
    }
    expect(conns).toHaveLength(1);
    expect(conns[0]!.conn.isOpen).toBe(true);
    expect(session.getState().status).toBe('open');
  });
});
