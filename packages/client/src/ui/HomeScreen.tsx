import { useEffect, useState } from 'react';
import { normalizeCode, roomCodeFromPath } from '../net/session';
import { session } from '../net/sessionInstance';
import { useSession } from '../net/useSession';
import { Panel } from './Panel';

const ERROR_TEXT: Record<string, string> = {
  roomNotFound: 'Room not found.',
  roomFull: 'That room is full.',
  badMessage: 'Something went wrong. Try again.',
  connectionLost: 'Lost connection to the game.',
};

export function HomeScreen() {
  const s = useSession();
  const [code, setCode] = useState('');

  useEffect(() => {
    const fromPath = roomCodeFromPath(window.location.pathname);
    if (fromPath) session.joinRoom(fromPath);
  }, []);

  return (
    <Panel anchor="menu">
      <div className="home">
        <h1 className="title">
          MULTI
          <br />
          TETRIS
        </h1>
        <p className="dim" style={{ textAlign: 'center' }}>
          Co-op Tetris for two on one wide board
        </p>
        <button className="btn primary" onClick={() => session.createRoom()}>
          Create room
        </button>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (normalizeCode(code).length === 4) session.joinRoom(code);
          }}
        >
          <input
            className="code-input"
            aria-label="Room code"
            placeholder="CODE"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="btn" type="submit">
            Join room
          </button>
        </form>
        {s.error && <p className="error">{ERROR_TEXT[s.error] ?? s.error}</p>}
        {s.status !== 'open' && <p className="dim">Connecting…</p>}
      </div>
    </Panel>
  );
}
