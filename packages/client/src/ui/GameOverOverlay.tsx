import { useState } from 'react';
import type { GameResult } from '../net/session';
import { session } from '../net/sessionInstance';
import { resultSummary } from './labels';

export function GameOverOverlay({ result }: { result: GameResult }) {
  const [clicked, setClicked] = useState(false);
  const { heading, time, detail } = resultSummary(result);
  return (
    <div className="overlay game-over" data-testid="game-over">
      <div>
        <h2>{heading}</h2>
        {time && <div className="result-time">{time}</div>}
        <div className="stats">{detail}</div>
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
