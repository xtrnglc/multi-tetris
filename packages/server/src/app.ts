import { createServer } from 'node:http';
import sirv from 'sirv';
import { WebSocket, WebSocketServer } from 'ws';
import { parseClientMessage, type PlayerId, type ServerMessage } from '@mt/engine';
import { DEFAULT_ROOM_OPTIONS, type Room, type RoomClient, type RoomOptions } from './room';
import { RoomManager } from './roomManager';

export interface AppOptions {
  port: number;
  staticDir?: string;
  roomOptions?: Partial<RoomOptions>;
  idleExpiryMs?: number;
  sweepIntervalMs?: number;
}

export interface RunningApp {
  port: number;
  rooms: RoomManager;
  close(): Promise<void>;
}

export async function startApp(options: AppOptions): Promise<RunningApp> {
  const rooms = new RoomManager(
    { ...DEFAULT_ROOM_OPTIONS, ...options.roomOptions },
    options.idleExpiryMs ?? 10 * 60_000,
  );
  const serveStatic = options.staticDir ? sirv(options.staticDir, { single: true }) : null;

  const server = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }
    if (serveStatic) {
      serveStatic(req, res, () => {
        res.writeHead(404);
        res.end();
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
  wss.on('connection', (ws) => handleConnection(ws, rooms));

  const sweepTimer = setInterval(() => rooms.sweep(), options.sweepIntervalMs ?? 60_000);

  await new Promise<void>((resolve) => server.listen(options.port, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port;

  return {
    port,
    rooms,
    close: async () => {
      clearInterval(sweepTimer);
      rooms.disposeAll();
      for (const client of wss.clients) client.terminate();
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function handleConnection(ws: WebSocket, rooms: RoomManager): void {
  const client: RoomClient = {
    send: (msg: ServerMessage) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
  };
  let room: Room | null = null;
  let player: PlayerId | null = null;

  const enter = (target: Room, token?: string) => {
    const result = target.join(client, token);
    if (!result.ok) {
      client.send({ type: 'error', reason: result.reason });
      return;
    }
    room = target;
    player = result.player;
  };

  ws.on('message', (data) => {
    const msg = parseClientMessage(data.toString());
    if (!msg) {
      client.send({ type: 'error', reason: 'badMessage' });
      return;
    }
    switch (msg.type) {
      case 'ping':
        client.send({ type: 'pong', t: msg.t });
        return;
      case 'createRoom':
        if (!room) enter(rooms.create());
        return;
      case 'joinRoom': {
        if (room) return;
        const target = rooms.get(msg.code);
        if (!target) client.send({ type: 'error', reason: 'roomNotFound' });
        else enter(target, msg.reconnectToken);
        return;
      }
    }
    if (!room || player === null) return;
    switch (msg.type) {
      case 'ready':
        room.setReady(player, msg.ready);
        return;
      case 'input':
        room.input(player, msg.seq, msg.action);
        return;
      case 'playAgain':
        room.playAgain(player);
        return;
    }
  });

  // Oversized/invalid frames surface as socket errors; without a listener they become uncaught exceptions.
  ws.on('error', () => ws.terminate());

  ws.on('close', () => {
    if (room && player !== null) room.leave(player, client);
  });
}
