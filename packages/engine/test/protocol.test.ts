import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../src/protocol';

describe('parseClientMessage', () => {
  it('accepts every well-formed message type', () => {
    expect(parseClientMessage('{"type":"createRoom"}')).toEqual({ type: 'createRoom' });
    expect(parseClientMessage('{"type":"ready","ready":true}')).toEqual({
      type: 'ready',
      ready: true,
    });
    expect(parseClientMessage('{"type":"input","seq":3,"action":"hardDrop"}')).toEqual({
      type: 'input',
      seq: 3,
      action: 'hardDrop',
    });
    expect(parseClientMessage('{"type":"playAgain"}')).toEqual({ type: 'playAgain' });
    expect(parseClientMessage('{"type":"ping","t":12.5}')).toEqual({ type: 'ping', t: 12.5 });
  });

  it('normalizes room codes typed in lowercase or with spaces', () => {
    expect(parseClientMessage('{"type":"joinRoom","code":" k7qx "}')).toEqual({
      type: 'joinRoom',
      code: 'K7QX',
    });
    expect(parseClientMessage('{"type":"joinRoom","code":"K7QX","reconnectToken":"abc"}')).toEqual({
      type: 'joinRoom',
      code: 'K7QX',
      reconnectToken: 'abc',
    });
  });

  it('rejects malformed input', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage('{"type":"nope"}')).toBeNull();
    expect(parseClientMessage('{"type":"input","seq":1,"action":"teleport"}')).toBeNull();
    expect(parseClientMessage('{"type":"input","seq":-1,"action":"left"}')).toBeNull();
    expect(parseClientMessage('{"type":"joinRoom","code":"TOOLONG"}')).toBeNull();
  });
});
