import { useEffect } from 'react';
import { hidePopout } from '../../platform/popout';

const RELOADED_KEY = 'blank.popout.reloaded';
const RELOAD_AT_MOST_MS = 60_000;

/**
 * The popout failed to draw (the error is in the log): it hides and loads itself again for the
 * next notice; at most once a minute, so a notice that always fails cannot loop.
 */
export function PopoutCrashed() {
  useEffect(() => {
    void hidePopout().catch(() => undefined);
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(RELOADED_KEY)) || 0;
    } catch {
      // No storage: reload anyway, the minute cannot be kept.
    }
    if (Date.now() - last < RELOAD_AT_MOST_MS) return;
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
      } catch {
        // See above.
      }
      window.location.reload();
    }, 1000);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}
