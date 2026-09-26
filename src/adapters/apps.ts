// Reset helper: programs of a fixed list, downloaded straight from their makers and started only
// with a valid signature of the expected maker (src-tauri/src/apps.rs). Desktop app only; the
// browser preview has no access to Windows.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/** A program of blank.'s list: id (e.g. "discord") and display name. */
export type AppPackage = { id: string; name: string };

/** A program on offer; `silent`: installs without questions, otherwise its own window opens. */
export type AppOffer = AppPackage & { silent: boolean };

export type AppScan = {
  /** Programs of the list installed on this PC. */
  installed: AppOffer[];
  /** Programs of the list not installed here. */
  available: AppOffer[];
  /** Installed programs blank. cannot install (games from launchers, Store apps, …). */
  manual: string[];
};

export type InstallState =
  'downloading' | 'verifying' | 'installing' | 'done' | 'failed' | 'skipped';
/**
 * detail: percent while downloading, "window" while its own installer window is open, a note
 * when done ("Neustart nötig") or the reason when failed.
 */
export type InstallProgress = { id: string; state: InstallState; detail: string | null };

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isAppPackage(value: unknown): value is AppPackage {
  if (!value || typeof value !== 'object') return false;
  const { id, name } = value as Record<string, unknown>;
  return (
    typeof id === 'string' && ID.test(id) && typeof name === 'string' && name.trim().length > 0
  );
}

export const appsNative = isTauri()
  ? {
      scan: () => invoke<AppScan>('apps_scan'),
      /** Resolves when all are done or cancelled; progress comes via `onProgress`. */
      install: (ids: string[]) => invoke<void>('apps_install', { ids }),
      cancel: () => invoke<void>('apps_cancel'),
      onProgress: (handler: (progress: InstallProgress) => void) =>
        listen<InstallProgress>('apps-progress', (event) => handler(event.payload)),
    }
  : null;
