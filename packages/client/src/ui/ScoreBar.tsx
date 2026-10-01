import type { GameState } from '@mt/engine';
import { scoreBarStats } from './labels';

export function ScoreBar({ game }: { game: GameState }) {
  const { left, center, right } = scoreBarStats(game);
  return (
    <div className="score-bar" data-testid="score-bar">
      <div className="stat">
        {left.label} <b>{left.value}</b>
      </div>
      <div className="emblem">{center}</div>
      <div className="stat">
        {right.label} <b>{right.value}</b>
      </div>
    </div>
  );
}
