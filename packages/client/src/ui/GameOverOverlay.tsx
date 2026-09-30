import { useState } from 'react';
import type { GameResult } from '../net/session';
import { session } from '../net/sessionInstance';

export function GameOverOverlay({ result }: { result: GameResult }) {
  const [clicked, setClicked] = useState(false);
  return (
    <div className="overlay game-over">
      <div>
        <h2>GAME OVER</h2>
        <div className="stats">
          SCORE {result.score.toLocaleString()} · LINES {result.lines} · LV {result.level}
        </div>
        <div className="row">
          <button
            className="btn primary"
            disabled={clicked}
            onClick={() => {
              setClicked(true);
              session.playAgain();
            }}
          >
            {clicked ? 'Waiting for partner…' : 'Play again'}
          </button>
          <button className="btn" onClick={() => session.leave()}>
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
