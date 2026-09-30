import { useSyncExternalStore } from 'react';
import type { SessionState } from './session';
import { session } from './sessionInstance';

export function useSession(): SessionState {
  return useSyncExternalStore(session.subscribe, session.getState);
}
