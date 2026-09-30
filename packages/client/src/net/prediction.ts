import { applyInput, type Action, type GameState, type PlayerId } from '@mt/engine';

interface PendingInput {
  seq: number;
  action: Action;
}

/**
 * Predicts the local player's own inputs. Gravity and the partner always come from the server;
 * on each snapshot we adopt the server state and replay inputs it has not processed yet.
 */
export class Predictor {
  private pending: PendingInput[] = [];
  private nextSeq = 1;
  private view: GameState | null = null;

  constructor(readonly player: PlayerId) {}

  get state(): GameState | null {
    return this.view;
  }

  input(action: Action): number {
    const seq = this.nextSeq++;
    this.pending.push({ seq, action });
    if (this.view) this.view = applyInput(this.view, this.player, action);
    return seq;
  }

  snapshot(server: GameState, ackSeq: number): GameState {
    this.pending = this.pending.filter((p) => p.seq > ackSeq);
    this.view = this.pending.reduce((state, p) => applyInput(state, this.player, p.action), server);
    return this.view;
  }

  clearPending(): void {
    this.pending = [];
  }
}
