import { describe, expect, it } from 'vitest';
import { RoomManager, generateCode } from '../src/roomManager';
import { TEST_ROOM_OPTIONS } from './helpers';

describe('generateCode', () => {
  it('returns 4 characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++)
      expect(generateCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}$/);
  });
});

describe('RoomManager', () => {
  it('creates rooms with unique codes and finds them', () => {
    const rooms = new RoomManager(TEST_ROOM_OPTIONS, 1000);
    const a = rooms.create();
    const b = rooms.create();
    expect(a.code).not.toBe(b.code);
    expect(rooms.get(a.code)).toBe(a);
    rooms.disposeAll();
  });

  it('sweeps rooms that are empty and idle past the expiry', () => {
    let now = 0;
    const rooms = new RoomManager(TEST_ROOM_OPTIONS, 1000, () => now);
    const room = rooms.create();
    now = 999;
    rooms.sweep();
    expect(rooms.get(room.code)).toBe(room);
    now = 1000;
    rooms.sweep();
    expect(rooms.get(room.code)).toBeUndefined();
    expect(rooms.size).toBe(0);
  });
});
