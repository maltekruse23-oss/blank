// System functions implemented in Rust (src-tauri/src/usage.rs, autostart.rs, settings_file.rs).
// The browser preview has no usage and autostart (callers show "Nur in der Desktop-App"); the
// settings file is downloaded there instead.
import { invoke, isTauri } from '@tauri-apps/api/core';

/** Own resource usage: blank.exe plus its WebView2 processes. */
export type AppUsage = {
  /** Share of all logical processors since the previous reading; null on the first one. */
  cpuPercent: number | null;
  /** Private working set of all processes (Task Manager's "Memory"); null if not readable. */
  memoryBytes: number | null;
  processes: number;
};

export const readAppUsage = isTauri() ? () => invoke<AppUsage>('app_usage') : null;

/** True once right after an update (src-tauri/src/update.rs): show what is new. */
export const updateNews = isTauri() ? () => invoke<boolean>('update_news') : null;

/** Graphics card for the WebView (src-tauri/src/gpu.rs): follows "Animationen", after a restart. */
export const gpu = isTauri()
  ? {
      read: () => invoke<{ active: boolean; wanted: boolean }>('gpu_state'),
      set: (on: boolean) => invoke<void>('set_gpu', { on }),
      restart: () => invoke<void>('restart_app'),
    }
  : null;

/** What Windows starts at sign-in, seen from this copy of the app (src-tauri/src/autostart.rs). */
export type Autostart = {
  /** Windows starts this file at sign-in. */
  enabled: boolean;
  /** The entry starts another file, e.g. an older blank.exe in Downloads. */
  other: string | null;
  /** That other file no longer exists. */
  otherMissing: boolean;
  /** The entry is switched off in Task Manager. */
  disabled: boolean;
  /** This file. */
  path: string;
};

/** "Start with Windows" (own entry in the user's Run key). */
export const autostart = isTauri()
  ? {
      read: () => invoke<Autostart>('autostart_status'),
      /** Resolves to the state after the change; on always means this file. */
      set: (enabled: boolean) => invoke<Autostart>('set_autostart', { enabled }),
    }
  : null;

/**
 * Saves the settings file (src-tauri/src/settings_file.rs: Downloads folder, shown in Explorer,
 * Twitch part added there); resolves to the file name. The browser preview downloads it instead.
 */
export function saveSettingsFile(content: string): Promise<string> {
  if (isTauri()) return invoke<string>('settings_export', { content });
  const name = 'blank-einstellungen.json';
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return Promise.resolve(name);
}
