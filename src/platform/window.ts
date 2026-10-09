// Native window controls for the frameless Tauri window. Only called from user input;
// the browser preview has no native window, so callers hide these controls there.
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

export const hasNativeWindow = isTauri();

function run(action: (window: ReturnType<typeof getCurrentWindow>) => Promise<void>) {
  if (!hasNativeWindow) return;
  action(getCurrentWindow()).catch((error: unknown) =>
    console.error('Window action failed', error),
  );
}

export const minimizeWindow = () => run((window) => window.minimize());
export const closeWindow = () => run((window) => window.close());
export const startWindowDrag = () => run((window) => window.startDragging());
export const toggleMaximizeWindow = () => run((window) => window.toggleMaximize());

/** Whether the window is maximized, now and after each resize (the Mayhem app's restore button);
 * returns the stop function. Without a native window nothing happens. */
export function watchMaximized(set: (maximized: boolean) => void): () => void {
  if (!hasNativeWindow) return () => {};
  const window = getCurrentWindow();
  const check = () => void window.isMaximized().then(set, () => {});
  check();
  const stop = window.onResized(check);
  return () => void stop.then((unlisten) => unlisten());
}
