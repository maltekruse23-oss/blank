import { useEffect, useRef, useState } from 'react';
import type { BatteryDevice } from '../adapters/devices';
import { formatGb, onBatteryLow, onPcWarning, type PcWarning } from '../adapters/pc';
import { playAlertSound } from '../platform/sound';
import type { Page } from './App';

type NewWarning = { kind: 'battery'; device: BatteryDevice } | { kind: 'load'; load: PcWarning };
export type Warning = NewWarning & { id: number; at: number };

/** Same as the live notices: long enough to notice and click. */
const SHOW_MS = 30_000;

const resourceLabel: Record<PcWarning['resource'], string> = {
  cpu: 'CPU',
  memory: 'Arbeitsspeicher',
  gpu: 'Grafikkarte',
};

/** Short texts for toasts and the pet's bubble, and the page a click opens. */
export function warningText(warning: Warning): { title: string; detail: string; page: Page } {
  if (warning.kind === 'battery') {
    const { device } = warning;
    return {
      title: `${device.name} · ${device.battery ?? '—'} %`,
      detail: 'Akku fast leer, bald laden',
      page: 'devices',
    };
  }
  const { load } = warning;
  const apps = load.apps
    .slice(0, 2)
    .map((app) =>
      load.resource === 'memory'
        ? `${app.name} ${formatGb(app.value)} GB`
        : `${app.name} ${Math.round(app.value)} %`,
    )
    .join(' · ');
  return {
    title: `${resourceLabel[load.resource]} bei ${load.percent} %`,
    detail: apps || 'Keine einzelne Ursache erkennbar',
    page: 'pc',
  };
}

/**
 * Low-battery and overload warnings from the background watch in Rust (pc.rs). Each can be
 * switched off in the settings; they arrive whatever page or mode is shown. Overload warnings play
 * the warning sound at `volume` (0 = silent, e.g. do not disturb).
 */
export function useWarnings(battery: boolean, load: boolean, volume: number) {
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const nextId = useRef(1);
  const enabled = useRef({ battery, load, volume });
  enabled.current = { battery, load, volume };

  function dismiss(id: number) {
    setWarnings((list) => list.filter((w) => w.id !== id));
  }

  useEffect(() => {
    const add = (warning: NewWarning) => {
      const id = nextId.current++;
      setWarnings((list) => [...list.slice(-2), { ...warning, id, at: Date.now() }]);
      window.setTimeout(() => dismiss(id), SHOW_MS);
    };
    const stops = [
      onPcWarning?.((w) => {
        if (!enabled.current.load) return;
        add({ kind: 'load', load: w });
        playAlertSound(enabled.current.volume, 'warning');
      }),
      onBatteryLow?.((d) => enabled.current.battery && add({ kind: 'battery', device: d })),
    ];
    return () => {
      for (const stop of stops) void stop?.then((unlisten) => unlisten());
    };
  }, []);

  return { warnings, dismiss };
}
