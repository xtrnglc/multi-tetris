import { randomInt, randomUUID } from 'node:crypto';
import {
  applyInput,
  createGame,
  tick,
  type Action,
  type GameState,
  type PlayerId,
  type RoomPhase,
  type ServerMessage,
} from '@mt/engine';

export interface RoomClient {
  send(msg: ServerMessage): void;
}

export interface RoomOptions {
  tickMs: number;
  countdownTicks: number;
  reconnectGraceMs: number;
  snapshotEveryTicks: number;
  inputsPerSecond: number;
}

export const DEFAULT_ROOM_OPTIONS: RoomOptions = {
  tickMs: 1000 / 60,
  countdownTicks: 180,
  reconnectGraceMs: 30_000,
  snapshotEveryTicks: 2,
  inputsPerSecond: 60,
};

export type JoinResult = { ok: true; player: PlayerId } | { ok: false; reason: 'roomFull' };

interface Slot {
  token: string;
  client: RoomClient | null;
  ready: boolean;
  wantsPlayAgain: boolean;
  ackSeq: number;
  inputWindowStart: number;
  inputsInWindow: number;
}

interface QueuedInput {
  player: PlayerId;
  seq: number;
  action: Action;
}

const PLAYERS: readonly PlayerId[] = [0, 1];
const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

export class Room {
  phase: RoomPhase = 'lobby';
  lastActivity: number;
  private slots: [Slot | null, Slot | null] = [null, null];
  private game: GameState | null = null;
  private queue: QueuedInput[] = [];
  private loop: ReturnType<typeof setInterval> | null = null;
  private countdownLeft = 0;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    readonly code: string,
    private readonly opts: RoomOptions,
    private readonly now: () => number = Date.now,
  ) {
    this.lastActivity = now();
  }

  join(client: RoomClient, reconnectToken?: string): JoinResult {
    if (this.disposed) return { ok: false, reason: 'roomFull' };
    this.touch();
    const returning = PLAYERS.find(
      (p) => reconnectToken !== undefined && this.slots[p]?.token === reconnectToken,
    );
    if (returning !== undefined) {
      const slot = this.slots[returning]!;
      slot.client = client;
      slot.ackSeq = 0;
      this.broadcastRoomState();
      if (this.phase === 'paused' && this.allConnected()) this.resume();
      else if (this.game) this.sendSnapshot(returning);
      return { ok: true, player: returning };
    }

    const free = PLAYERS.find((p) => this.slots[p] === null);
    if (free === undefined || (this.phase !== 'lobby' && this.phase !== 'over')) {
      return { ok: false, reason: 'roomFull' };
    }
    if (this.phase === 'over') this.backToLobby();
    this.slots[free] = {
      token: randomUUID(),
      client,
      ready: false,
      wantsPlayAgain: false,
      ackSeq: 0,
      inputWindowStart: 0,
      inputsInWindow: 0,
    };
    this.broadcastRoomState();
    return { ok: true, player: free };
  }

  /** Called when a socket closes. Ignored if the slot has since been taken over by a new socket. */
  leave(player: PlayerId, client: RoomClient): void {
    const slot = this.slots[player];
    if (this.disposed || !slot || slot.client !== client) return;
    this.touch();
    slot.client = null;

    if (this.phase === 'lobby' || this.phase === 'over') {
      this.slots[player] = null;
      if (this.phase === 'over' && this.everyoneWantsPlayAgain()) this.backToLobby();
      else this.broadcastRoomState();
      return;
    }

    if (this.phase !== 'paused') {
      this.phase = 'paused';
      this.stopLoop();
      this.graceTimer = setTimeout(() => this.endGame(), this.opts.reconnectGraceMs);
    }
    this.sendTo(other(player), {
      type: 'partnerDisconnected',
      graceMs: this.opts.reconnectGraceMs,
    });
    this.broadcastRoomState();
  }

  /** True if `client` still owns the player's slot (a newer socket may have taken it over). */
  isCurrent(player: PlayerId, client: RoomClient): boolean {
    return this.slots[player]?.client === client;
  }

  setReady(player: PlayerId, ready: boolean): void {
    const slot = this.slots[player];
    if (this.disposed || this.phase !== 'lobby' || !slot) return;
    this.touch();
    slot.ready = ready;
    this.broadcastRoomState();
    if (PLAYERS.every((p) => this.slots[p]?.ready && this.slots[p]?.client)) this.startGame();
  }

  input(player: PlayerId, seq: number, action: Action): void {
    const slot = this.slots[player];
    if (this.disposed || this.phase !== 'playing' || !slot) return;
    const now = this.now();
    if (now - slot.inputWindowStart >= 1000) {
      slot.inputWindowStart = now;
      slot.inputsInWindow = 0;
    }
    // softDropOff is idempotent and must never be dropped, or soft drop could stay stuck on.
    if (action !== 'softDropOff') {
      if (slot.inputsInWindow >= this.opts.inputsPerSecond) return;
      slot.inputsInWindow += 1;
    }
    this.queue.push({ player, seq, action });
  }

  playAgain(player: PlayerId): void {
    const slot = this.slots[player];
    if (this.disposed || this.phase !== 'over' || !slot) return;
    this.touch();
    slot.wantsPlayAgain = true;
    if (this.everyoneWantsPlayAgain()) this.backToLobby();
  }

  /** Empty slots (a player who left) count as agreeing. */
  private everyoneWantsPlayAgain(): boolean {
    const present = PLAYERS.map((p) => this.slots[p]).filter((s) => s !== null);
    return present.length > 0 && present.every((s) => s.wantsPlayAgain);
  }

  isEmpty(): boolean {
    return PLAYERS.every((p) => !this.slots[p]?.client);
  }

  dispose(): void {
    this.disposed = true;
    this.stopLoop();
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
  }

  // ---- lifecycle ----

  private startGame(): void {
    this.game = createGame([randomInt(2 ** 32), randomInt(2 ** 32)]);
    this.queue = [];
    for (const p of PLAYERS) {
      const slot = this.slots[p]!;
      slot.ackSeq = 0;
      slot.wantsPlayAgain = false;
    }
    this.beginCountdown();
  }

  private resume(): void {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
    this.broadcast({ type: 'partnerReconnected' });
    this.beginCountdown();
  }

  private beginCountdown(): void {
    if (!this.game) return;
    // Keys released while disconnected/paused never reached us; don't resume with soft drop stuck on.
    for (const p of PLAYERS) this.game = applyInput(this.game, p, 'softDropOff');
    this.phase = 'countdown';
    this.countdownLeft = this.opts.countdownTicks;
    this.broadcastRoomState();
    this.broadcast({ type: 'gameStart', countdownTicks: this.opts.countdownTicks });
    this.broadcastSnapshot();
    this.stopLoop();
    this.loop = setInterval(() => this.step(), this.opts.tickMs);
  }

  private step(): void {
    if (this.disposed || !this.game) return;
    if (this.phase === 'countdown') {
      this.countdownLeft -= 1;
      if (this.countdownLeft <= 0) {
        this.phase = 'playing';
        this.queue = [];
        this.broadcastRoomState();
      }
      return;
    }
    if (this.phase !== 'playing') return;

    const locksBefore = this.game.lockCount;
    let game = this.game;
    for (const { player, seq, action } of this.queue) {
      game = applyInput(game, player, action);
      const slot = this.slots[player];
      if (slot) slot.ackSeq = seq;
    }
    this.queue = [];
    game = tick(game);
    this.game = game;

    if (game.over) {
      this.endGame();
      return;
    }
    if (game.lockCount !== locksBefore || game.tick % this.opts.snapshotEveryTicks === 0) {
      this.broadcastSnapshot();
    }
  }

  private endGame(): void {
    this.stopLoop();
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
    this.phase = 'over';
    for (const p of PLAYERS) if (this.slots[p] && !this.slots[p]!.client) this.slots[p] = null;
    if (this.game) {
      this.broadcastSnapshot();
      const { score, lines, level } = this.game;
      this.broadcast({ type: 'gameOver', score, lines, level });
    }
    this.broadcastRoomState();
  }

  private backToLobby(): void {
    this.phase = 'lobby';
    this.game = null;
    this.queue = [];
    for (const p of PLAYERS) {
      const slot = this.slots[p];
      if (slot) {
        slot.ready = false;
        slot.wantsPlayAgain = false;
      }
    }
    this.broadcastRoomState();
  }

  // ---- messaging ----

  private allConnected(): boolean {
    return PLAYERS.every((p) => this.slots[p]?.client);
  }

  private touch(): void {
    this.lastActivity = this.now();
  }

  private stopLoop(): void {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }

  private sendTo(player: PlayerId, msg: ServerMessage): void {
    this.slots[player]?.client?.send(msg);
  }

  private broadcast(msg: ServerMessage): void {
    for (const p of PLAYERS) this.sendTo(p, msg);
  }

  private sendSnapshot(player: PlayerId): void {
    const slot = this.slots[player];
    if (!this.game || !slot) return;
    this.sendTo(player, {
      type: 'snapshot',
      tick: this.game.tick,
      state: this.game,
      ackSeq: slot.ackSeq,
    });
  }

  private broadcastSnapshot(): void {
    for (const p of PLAYERS) this.sendSnapshot(p);
  }

  private broadcastRoomState(): void {
    const players = this.slots.map((s) =>
      s ? { connected: s.client !== null, ready: s.ready } : null,
    ) as [
      { connected: boolean; ready: boolean } | null,
      { connected: boolean; ready: boolean } | null,
    ];
    for (const p of PLAYERS) {
      const slot = this.slots[p];
      if (!slot) continue;
      this.sendTo(p, {
        type: 'roomState',
        code: this.code,
        you: p,
        players,
        phase: this.phase,
        reconnectToken: slot.token,
      });
    }
  }
}
