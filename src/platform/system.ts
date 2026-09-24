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

/** "Start with Windows" (own entry in the user's Run key). */
export const autostart = isTauri()
  ? {
      read: () => invoke<boolean>('autostart_enabled'),
      /** Resolves to the state after the change. */
      set: (enabled: boolean) => invoke<boolean>('set_autostart', { enabled }),
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
