import type { CSSProperties } from 'react';
import { NEXT_QUEUE_SIZE, type GameState, type PlayerId } from '@mt/engine';
import { PLAYER_ACCENTS } from '../render/colors';
import { Panel } from './Panel';
import { PiecePreview } from './PiecePreview';

interface PlayerSideProps {
  player: PlayerId;
  me: PlayerId;
  state: GameState;
  side: 'left' | 'right';
}

export function PlayerSide({ player, me, state, side }: PlayerSideProps) {
  const ps = state.players[player];
  const upcoming = (ps.nextSpawn ? [ps.nextSpawn, ...ps.queue] : ps.queue).slice(
    0,
    NEXT_QUEUE_SIZE,
  );
  return (
    <div
      className={`player-side ${side}`}
      style={{ '--accent': PLAYER_ACCENTS[player] } as CSSProperties}
      data-cat-anchor={side === 'right' ? 'side-right' : undefined}
    >
      <Panel label="HOLD" align={side} anchor={side === 'left' ? 'hold-left' : undefined}>
        <PiecePreview type={ps.hold} dim={ps.holdUsed} />
      </Panel>
      <Panel label="NEXT" align={side}>
        <div className="next-list">
          {upcoming.map((type, i) => (
            <PiecePreview key={i} type={type} size={i === 0 ? 20 : 16} />
          ))}
        </div>
      </Panel>
      <div className="player-name">
        PLAYER {player + 1}
        {player === me && <span className="you"> (You)</span>}
      </div>
    </div>
  );
}
