// Battery levels of the user's wireless devices, read in Rust (src-tauri/src/battery.rs) with
// read-only requests. Desktop app only; the browser preview has no access to devices.
import { invoke, isTauri } from '@tauri-apps/api/core';

export type DeviceKind = 'mouse' | 'keyboard' | 'headset' | 'controller' | 'other';

export type BatteryDevice = {
  id: string;
  name: string;
  kind: DeviceKind;
  /** How it is connected, e.g. "Logitech-Funk". */
  link: string;
  /** false: known from earlier, but not answering now (off, asleep, out of range). */
  reachable: boolean;
  /** 0–100; null when not readable (never shown as 0). */
  battery: number | null;
  /** null when unknown. */
  charge: 'charging' | 'full' | 'battery' | null;
};

/** `fresh` skips the few-seconds cache (manual refresh). */
export const readBatteries = isTauri()
  ? (fresh: boolean) => invoke<BatteryDevice[]>('device_batteries', { fresh })
  : null;
