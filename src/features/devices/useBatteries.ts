import { useEffect, useRef, useState } from 'react';
import { readBatteries, type BatteryDevice } from '../../adapters/devices';

const INTERVAL_MS = 30_000;

export type BatteryState =
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; devices: BatteryDevice[]; updatedAt: Date; staleBecause: null | 'error' };

/**
 * Battery levels, read every 30 s while `enabled` (Home or Devices open) and the window is
 * visible; nothing is read while minimized. `reload` reads again right away.
 */
export function useBatteries(enabled: boolean) {
  const [state, setState] = useState<BatteryState>(
    readBatteries ? { status: 'loading' } : { status: 'unavailable' },
  );
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0);
  const fresh = useRef(false);

  useEffect(() => {
    const read = readBatteries;
    if (!read || !enabled) return;
    let active = true;
    let timer: number | undefined;
    const load = () => {
      const skipCache = fresh.current;
      fresh.current = false;
      read(skipCache)
        .then(
          (devices) =>
            active &&
            setState({ status: 'ready', devices, updatedAt: new Date(), staleBecause: null }),
          () =>
            active &&
            setState((previous) =>
              previous.status === 'ready'
                ? { ...previous, staleBecause: 'error' }
                : { status: 'error' },
            ),
        )
        .finally(() => active && setRefreshing(false));
    };
    const start = () => {
      if (timer !== undefined || document.hidden) return;
      load();
      timer = window.setInterval(load, INTERVAL_MS);
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
  }, [enabled, revision]);

  return {
    state,
    refreshing,
    reload: () => {
      fresh.current = true;
      setRefreshing(true);
      setRevision((r) => r + 1);
    },
  };
}

export type Batteries = ReturnType<typeof useBatteries>;
