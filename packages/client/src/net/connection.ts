import type { ClientMessage, ServerMessage } from '@mt/engine';
import type { ConnectionHandlers, ConnectionLike } from './session';

export class Connection implements ConnectionLike {
  private readonly ws: WebSocket;

  constructor(url: string, handlers: ConnectionHandlers) {
    this.ws = new WebSocket(url);
    this.ws.onopen = () => handlers.onOpen();
    this.ws.onmessage = (event) =>
      handlers.onMessage(JSON.parse(String(event.data)) as ServerMessage);
    this.ws.onclose = () => handlers.onClose();
  }

  get isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  send(msg: ClientMessage): void {
    if (this.isOpen) this.ws.send(JSON.stringify(msg));
  }

  /** Intentional close: does not trigger the reconnect handler. */
  close(): void {
    this.ws.onclose = null;
    this.ws.close();
  }
}
