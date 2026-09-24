import { useEffect, useState } from 'react';
import { readAppUsage, type AppUsage } from '../platform/system';

const INTERVAL_MS = 2_000;

export type UsageState =
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; usage: AppUsage };

/**
 * Live usage of the app, read every 2 s while the window is visible and `enabled` (not in pet
 * mode); paused when minimized.
 */
export function useAppUsage(enabled: boolean): UsageState {
  const [state, setState] = useState<UsageState>(
    readAppUsage ? { status: 'loading' } : { status: 'unavailable' },
  );
  useEffect(() => {
    const read = readAppUsage;
    if (!read || !enabled) return;
    let active = true;
    let timer: number | undefined;
    const tick = () =>
      read().then(
        (usage) => active && setState({ status: 'ready', usage }),
        () => active && setState({ status: 'error' }),
      );
    const start = () => {
      if (timer !== undefined || document.hidden) return;
      void tick();
      timer = window.setInterval(tick, INTERVAL_MS);
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
  }, [enabled]);
  return state;
}

export function formatCpu(percent: number | null) {
  if (percent === null) return '–';
  if (percent < 0.1) return '< 0,1 %';
  return `${percent.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

export function formatMemory(bytes: number | null) {
  return bytes === null ? '–' : `${Math.round(bytes / 1024 / 1024)} MB`;
}

/** Rough verdict for people who do not read these numbers every day. */
export function usageLevel({ cpuPercent, memoryBytes }: AppUsage) {
  if (cpuPercent === null || memoryBytes === null) return null;
  const mb = memoryBytes / 1024 / 1024;
  if (cpuPercent < 1 && mb < 300) return 'Niedrig';
  if (cpuPercent < 5 && mb < 600) return 'Mittel';
  return 'Hoch';
}
