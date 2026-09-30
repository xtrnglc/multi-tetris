import {
  TICKS_PER_SECOND,
  type Action,
  type ClientMessage,
  type GameState,
  type RoomStateMessage,
  type ServerMessage,
} from '@mt/engine';
import { Predictor } from './prediction';

export interface ConnectionHandlers {
  onOpen(): void;
  onMessage(msg: ServerMessage): void;
  onClose(): void;
}

export interface ConnectionLike {
  readonly isOpen: boolean;
  send(msg: ClientMessage): void;
  close(): void;
}

export interface SessionDeps {
  connect(handlers: ConnectionHandlers): ConnectionLike;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  now(): number;
  setPath(path: string): void;
}

export interface GameResult {
  score: number;
  lines: number;
  level: number;
}

export interface SessionState {
  status: 'connecting' | 'open' | 'reconnecting';
  room: RoomStateMessage | null;
  game: GameState | null;
  countdownEndsAt: number | null;
  partnerDisconnectedUntil: number | null;
  gameOver: GameResult | null;
  error: string | null;
  pingMs: number | null;
}

export const initialSession: SessionState = {
  status: 'connecting',
  room: null,
  game: null,
  countdownEndsAt: null,
  partnerDisconnectedUntil: null,
  gameOver: null,
  error: null,
  pingMs: null,
};

const RECONNECT_INTERVAL_MS = 1000;
const RECONNECT_WINDOW_MS = 30_000;
const PING_INTERVAL_MS = 2000;

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function roomCodeFromPath(path: string): string | null {
  const match = /^\/r\/([A-Za-z0-9]{4})\/?$/.exec(path);
  return match ? normalizeCode(match[1]) : null;
}

const tokenKey = (code: string) => `mt:token:${code}`;

export function reduceServerMessage(
  state: SessionState,
  msg: ServerMessage,
  now: number,
): SessionState {
  switch (msg.type) {
    case 'roomState':
      return msg.phase === 'lobby'
        ? {
            ...state,
            room: msg,
            error: null,
            game: null,
            gameOver: null,
            countdownEndsAt: null,
            partnerDisconnectedUntil: null,
          }
        : { ...state, room: msg, error: null };
    case 'gameStart':
      return {
        ...state,
        countdownEndsAt: now + (msg.countdownTicks * 1000) / TICKS_PER_SECOND,
        gameOver: null,
        partnerDisconnectedUntil: null,
      };
    case 'snapshot':
      return { ...state, game: msg.state };
    case 'gameOver':
      return {
        ...state,
        gameOver: { score: msg.score, lines: msg.lines, level: msg.level },
        partnerDisconnectedUntil: null,
      };
    case 'partnerDisconnected':
      return { ...state, partnerDisconnectedUntil: now + msg.graceMs };
    case 'partnerReconnected':
      return { ...state, partnerDisconnectedUntil: null };
    case 'error':
      return msg.reason === 'badMessage'
        ? { ...state, error: msg.reason }
        : { ...initialSession, status: state.status, pingMs: state.pingMs, error: msg.reason };
    case 'pong':
      return { ...state, pingMs: Math.max(0, Math.round(now - msg.t)) };
  }
}

export class Session {
  private state: SessionState = initialSession;
  private readonly listeners = new Set<() => void>();
  private conn: ConnectionLike | null = null;
  private outbox: ClientMessage[] = [];
  private predictor = new Predictor(0);
  private reconnectDeadline: number | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Identifies the live connection; events from older connections are ignored. */
  private generation = 0;

  constructor(private readonly deps: SessionDeps) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getState = (): SessionState => this.state;

  connect(): void {
    this.clearReconnectTimer();
    const generation = ++this.generation;
    const current = () => generation === this.generation;
    this.conn = this.deps.connect({
      onOpen: () => current() && this.handleOpen(),
      onMessage: (msg) => current() && this.handleMessage(msg),
      onClose: () => current() && this.handleClose(),
    });
  }

  createRoom(): void {
    this.setState({ error: null });
    this.send({ type: 'createRoom' });
  }

  joinRoom(rawCode: string): void {
    const code = normalizeCode(rawCode);
    const token = this.deps.storage.getItem(tokenKey(code));
    this.setState({ error: null });
    this.send(
      token ? { type: 'joinRoom', code, reconnectToken: token } : { type: 'joinRoom', code },
    );
  }

  setReady(ready: boolean): void {
    this.send({ type: 'ready', ready });
  }

  playAgain(): void {
    this.send({ type: 'playAgain' });
  }

  sendInput(action: Action): void {
    if (this.state.room?.phase !== 'playing' || !this.conn?.isOpen) return;
    const seq = this.predictor.input(action);
    this.conn.send({ type: 'input', seq, action });
    if (this.predictor.state) this.setState({ game: this.predictor.state });
  }

  leave(): void {
    this.stopPing();
    this.clearReconnectTimer();
    const conn = this.conn;
    this.conn = null;
    conn?.close();
    this.reconnectDeadline = null;
    this.outbox = [];
    this.state = { ...initialSession };
    this.emit();
    this.deps.setPath('/');
    this.connect();
  }

  private send(msg: ClientMessage): void {
    if (this.conn?.isOpen) this.conn.send(msg);
    else this.outbox.push(msg);
  }

  private handleOpen(): void {
    this.predictor.clearPending();
    this.reconnectDeadline = null;
    this.setState({ status: 'open' });
    const room = this.state.room;
    if (room)
      this.conn?.send({ type: 'joinRoom', code: room.code, reconnectToken: room.reconnectToken });
    for (const msg of this.outbox.splice(0)) this.conn?.send(msg);
    this.startPing();
  }

  private handleMessage(msg: ServerMessage): void {
    if (msg.type === 'roomState') {
      this.deps.storage.setItem(tokenKey(msg.code), msg.reconnectToken);
      this.deps.setPath(`/r/${msg.code}`);
      if (this.predictor.player !== msg.you) this.predictor = new Predictor(msg.you);
      if (msg.phase !== 'playing') this.predictor.clearPending();
    }
    const hadRoom = this.state.room !== null;
    this.state = reduceServerMessage(this.state, msg, this.deps.now());
    if (msg.type === 'snapshot') {
      this.state = { ...this.state, game: this.predictor.snapshot(msg.state, msg.ackSeq) };
    }
    if (hadRoom && !this.state.room) this.deps.setPath('/');
    this.emit();
  }

  private handleClose(): void {
    this.stopPing();
    this.conn = null;
    if (this.state.room) {
      const now = this.deps.now();
      this.reconnectDeadline ??= now + RECONNECT_WINDOW_MS;
      if (now > this.reconnectDeadline) {
        this.reconnectDeadline = null;
        this.state = { ...initialSession, error: 'connectionLost' };
        this.deps.setPath('/');
      }
    }
    this.setState({ status: 'reconnecting' });
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_INTERVAL_MS);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(
      () => this.conn?.send({ type: 'ping', t: this.deps.now() }),
      PING_INTERVAL_MS,
    );
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private setState(patch: Partial<SessionState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
