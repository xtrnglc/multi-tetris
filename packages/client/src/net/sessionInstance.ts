import { Connection } from './connection';
import { Session } from './session';

function wsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws`;
}

export const session = new Session({
  connect: (handlers) => new Connection(wsUrl(), handlers),
  storage: window.sessionStorage,
  now: () => Date.now(),
  setPath: (path) => {
    if (window.location.pathname !== path) window.history.replaceState(null, '', path);
  },
});
