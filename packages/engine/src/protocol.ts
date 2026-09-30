import { z } from 'zod';
import { ACTIONS, type GameState, type PlayerId } from './types';

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('createRoom') }),
  z.object({
    type: z.literal('joinRoom'),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{4}$/),
    reconnectToken: z.string().max(64).optional(),
  }),
  z.object({ type: z.literal('ready'), ready: z.boolean() }),
  z.object({
    type: z.literal('input'),
    seq: z.number().int().nonnegative(),
    action: z.enum(ACTIONS),
  }),
  z.object({ type: z.literal('playAgain') }),
  z.object({ type: z.literal('ping'), t: z.number() }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export function parseClientMessage(raw: string): ClientMessage | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = clientMessageSchema.safeParse(json);
  return result.success ? result.data : null;
}

export type RoomPhase = 'lobby' | 'countdown' | 'playing' | 'paused' | 'over';

export interface SlotInfo {
  connected: boolean;
  ready: boolean;
}

export interface RoomStateMessage {
  type: 'roomState';
  code: string;
  you: PlayerId;
  players: [SlotInfo | null, SlotInfo | null];
  phase: RoomPhase;
  reconnectToken: string;
}

export type ErrorReason = 'roomNotFound' | 'roomFull' | 'badMessage';

export type ServerMessage =
  | RoomStateMessage
  | { type: 'gameStart'; countdownTicks: number }
  | { type: 'snapshot'; tick: number; state: GameState; ackSeq: number }
  | { type: 'gameOver'; score: number; lines: number; level: number }
  | { type: 'partnerDisconnected'; graceMs: number }
  | { type: 'partnerReconnected' }
  | { type: 'error'; reason: ErrorReason }
  | { type: 'pong'; t: number };
