import WebSocket from 'ws';
import type { ClientMessage, ServerMessage } from '@mt/engine';

type Msg<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

export class TestClient {
  readonly received: ServerMessage[] = [];
  private readonly consumed = new Set<number>();
  private waiters: (() => void)[] = [];

  private constructor(private readonly ws: WebSocket) {
    ws.on('message', (data) => {
      this.received.push(JSON.parse(data.toString()) as ServerMessage);
      for (const wake of this.waiters.splice(0)) wake();
    });
  }

  static connect(port: number): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      ws.once('open', () => resolve(new TestClient(ws)));
      ws.once('error', reject);
    });
  }

  send(msg: ClientMessage | string): void {
    this.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  /** Resolves with the oldest not-yet-consumed message of `type` matching `predicate`. */
  async next<T extends ServerMessage['type']>(
    type: T,
    predicate: (m: Msg<T>) => boolean = () => true,
    timeoutMs = 2000,
  ): Promise<Msg<T>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      for (let i = 0; i < this.received.length; i++) {
        const m = this.received[i];
        if (!this.consumed.has(i) && m.type === type && predicate(m as Msg<T>)) {
          this.consumed.add(i);
          return m as Msg<T>;
        }
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`timed out waiting for ${type}`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, remaining);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  /** Marks everything received so far as consumed, so `next` only sees newer messages. */
  drain(): void {
    for (let i = 0; i < this.received.length; i++) this.consumed.add(i);
  }

  /** Most recent message of `type`, consumed or not. */
  latest<T extends ServerMessage['type']>(type: T): Msg<T> | undefined {
    return [...this.received].reverse().find((m) => m.type === type) as Msg<T> | undefined;
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.ws.readyState === WebSocket.CLOSED) return resolve();
      this.ws.once('close', () => resolve());
      this.ws.close();
    });
  }
}
