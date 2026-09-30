import { useSession } from './net/useSession';
import { HomeScreen } from './ui/HomeScreen';
import { LobbyScreen } from './ui/LobbyScreen';

export function App() {
  const s = useSession();
  const room = s.room;
  return (
    <>
      <div className="starfield" />
      <main className="app">
        {!room ? (
          <HomeScreen />
        ) : room.phase === 'lobby' ? (
          <LobbyScreen room={room} />
        ) : (
          <p className="dim">Game starting…</p>
        )}
      </main>
    </>
  );
}
