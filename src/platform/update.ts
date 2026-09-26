// Updates from the app's GitHub releases (src-tauri/src/update.rs). Only the desktop app has them.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export type UpdateInfo = { current: string; latest: string; available: boolean };

export const updater = isTauri()
  ? {
      /** Asks GitHub for the latest release; rejects with a German message. */
      check: () => invoke<UpdateInfo>('update_check'),
      /** Downloads, verifies and installs the found version, then restarts the app. */
      install: () => invoke<void>('update_install'),
      /** Download progress in percent; returns a function that stops listening. */
      onProgress: (handler: (percent: number) => void) => {
        const stop = listen<number>('update-progress', (event) => handler(event.payload));
        return () => void stop.then((unlisten) => unlisten());
      },
    }
  : null;
