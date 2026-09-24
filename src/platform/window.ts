// Native window controls for the frameless Tauri window. Only called from user input;
// the browser preview has no native window, so callers hide these controls there.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
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

/** Pet mode (src-tauri/src/pet.rs): small borderless window; size in CSS pixels. */
export function setPetWindow(enabled: boolean, width: number, height: number) {
  if (!hasNativeWindow) return Promise.resolve();
  return invoke<void>('set_pet_mode', { enabled, width, height });
}

/**
 * The taskbar button or the tray icon asked for the full app while it is a pet
 * (src-tauri/src/pet.rs, tray.rs). Returns a function that stops listening.
 */
export function onShowApp(handler: () => void): () => void {
  if (!hasNativeWindow) return () => undefined;
  const unlisten = listen('show-app', handler);
  return () => void unlisten.then((stop) => stop());
}

/**
 * Grows or shrinks the pet window; its bottom-right corner stays in place. `front`: brings it
 * out from behind other windows and keeps it on top (without taking the focus) until called
 * again with `false`.
 */
export function resizePetWindow(width: number, height: number, front: boolean) {
  if (!hasNativeWindow) return;
  invoke<void>('pet_resize', { width, height, front }).catch((error: unknown) =>
    console.error('Pet resize failed', error),
  );
}
