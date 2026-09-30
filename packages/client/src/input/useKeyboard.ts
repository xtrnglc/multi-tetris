import { useEffect } from 'react';
import { session } from '../net/sessionInstance';
import { KeyboardInput } from './keyboard';

/** While enabled, routes keyboard input to the session as game actions. */
export function useKeyboard(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const kb = new KeyboardInput((action) => session.sendInput(action));
    const onDown = (e: KeyboardEvent) => {
      if (kb.keyDown(e.code, performance.now())) e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => {
      if (kb.keyUp(e.code, performance.now())) e.preventDefault();
    };
    const onBlur = () => kb.releaseAll();
    let raf = 0;
    const frame = () => {
      kb.update(performance.now());
      raf = requestAnimationFrame(frame);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      kb.releaseAll();
    };
  }, [enabled]);
}
