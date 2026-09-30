import { useSession } from './net/useSession';
import { GameScreen } from './ui/GameScreen';
import { HomeScreen } from './ui/HomeScreen';
import { LobbyScreen } from './ui/LobbyScreen';
import './styles/overlays.css';

export function App() {
  const s = useSession();
  const room = s.room;
  return (
    <>
      <div className="starfield" />
      <div className="narrow-notice">
        Multi Tetris needs a keyboard and a window at least 900px wide.
      </div>
      {room && (
        <div className={`ping ${s.status !== 'open' || (s.pingMs ?? 0) > 150 ? 'bad' : ''}`}>
          {s.status === 'open' ? `${s.pingMs ?? '—'} ms` : 'Reconnecting…'}
        </div>
      )}
      <main className="app">
        {!room ? (
          <HomeScreen />
        ) : room.phase === 'lobby' ? (
          <LobbyScreen room={room} />
        ) : (
          <GameScreen />
        )}
      </main>
    </>
  );
}
