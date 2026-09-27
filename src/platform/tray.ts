// "Nicht stören" in the menu of the icon in the notification area (src-tauri/src/tray.rs). Desktop
// app only.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/** Sets the tick of "Nicht stören" in the menu. */
export const setTrayQuiet = isTauri()
  ? (quiet: boolean) => invoke<void>('set_tray_quiet', { quiet }).catch(() => undefined)
  : null;

/** "Nicht stören" was clicked in the menu. */
export function onTrayQuiet(handler: () => void) {
  if (!isTauri()) return () => undefined;
  const stop = listen('tray-quiet', () => handler());
  return () => void stop.then((unlisten) => unlisten());
}
