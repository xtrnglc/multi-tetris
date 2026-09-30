import { Room, type RoomOptions } from './room';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return code;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(
    private readonly roomOptions: RoomOptions,
    private readonly idleExpiryMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  create(): Room {
    let code = generateCode();
    while (this.rooms.has(code)) code = generateCode();
    const room = new Room(code, this.roomOptions, this.now);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  /** Deletes rooms nobody is connected to that have been idle for `idleExpiryMs`. */
  sweep(): void {
    const now = this.now();
    for (const [code, room] of this.rooms) {
      if (room.isEmpty() && now - room.lastActivity >= this.idleExpiryMs) {
        room.dispose();
        this.rooms.delete(code);
      }
    }
  }

  get size(): number {
    return this.rooms.size;
  }

  disposeAll(): void {
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
  }
}
