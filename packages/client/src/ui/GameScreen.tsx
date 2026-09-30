import { useEffect, useRef } from 'react';
import { useKeyboard } from '../input/useKeyboard';
import { session } from '../net/sessionInstance';
import { useSession } from '../net/useSession';
import { WELL_HEIGHT, WELL_WIDTH, drawBoard } from '../render/board';
import { GameOverOverlay } from './GameOverOverlay';
import { PlayerSide } from './PlayerSide';
import { ScoreBar } from './ScoreBar';
import { useNow } from './useNow';
import '../styles/game.css';

export function GameScreen() {
  const s = useSession();
  const room = s.room!;
  const me = room.you;
  const game = s.game;
  const now = useNow();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useKeyboard(room.phase === 'playing');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WELL_WIDTH * dpr;
    canvas.height = WELL_HEIGHT * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0;
    const frame = () => {
      const current = session.getState().game;
      if (current) drawBoard(ctx, current, me);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [me]);

  const countdown =
    room.phase === 'countdown' && s.countdownEndsAt !== null
      ? Math.max(1, Math.ceil((s.countdownEndsAt - now) / 1000))
      : null;
  const graceLeft =
    s.partnerDisconnectedUntil !== null ? Math.max(0, Math.ceil((s.partnerDisconnectedUntil - now) / 1000)) : null;

  return (
    <div className="game-layout" data-testid="game" data-phase={room.phase} data-lock-count={game?.lockCount ?? 0}>
      {game ? <PlayerSide player={0} me={me} state={game} side="left" /> : <div />}
      <div className="well-column">
        <div className="panel well">
          <div className="panel-inner well-inner">
            <canvas ref={canvasRef} style={{ width: WELL_WIDTH, height: WELL_HEIGHT }} />
            {countdown !== null && (
              <div className="overlay">
                <div className="countdown">{countdown}</div>
              </div>
            )}
            {room.phase === 'paused' && (
              <div className="overlay">
                <div>
                  <h2>PAUSED</h2>
                  <p>
                    Waiting for your partner to reconnect
                    {graceLeft !== null ? ` — ${graceLeft}s` : '…'}
                  </p>
                </div>
              </div>
            )}
            {room.phase === 'over' && s.gameOver && <GameOverOverlay result={s.gameOver} />}
          </div>
        </div>
        {game && <ScoreBar score={game.score} lines={game.lines} level={game.level} />}
      </div>
      {game ? <PlayerSide player={1} me={me} state={game} side="right" /> : <div />}
    </div>
  );
}
