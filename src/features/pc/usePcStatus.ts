import { useEffect, useState } from 'react';
import { readPcStatus, type PcStatus } from '../../adapters/pc';

export type PcState =
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; pc: PcStatus };

/**
 * Live PC values every `seconds` (PC page 2, Home 5) while the window is visible; 0 = off.
 * Fewer readings keep the app light where a rough value is enough.
 */
export function usePcStatus(seconds: number): PcState {
  const [state, setState] = useState<PcState>(
    readPcStatus ? { status: 'loading' } : { status: 'unavailable' },
  );
  useEffect(() => {
    const read = readPcStatus;
    if (!read || seconds === 0) return;
    let active = true;
    let timer: number | undefined;
    const tick = () =>
      read(seconds).then(
        (pc) => active && setState({ status: 'ready', pc }),
        () => active && setState({ status: 'error' }),
      );
    const start = () => {
      if (timer !== undefined || document.hidden) return;
      void tick();
      timer = window.setInterval(tick, seconds * 1000);
    };
    const stop = () => {
      window.clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [seconds]);
  return state;
}
