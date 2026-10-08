// Updates from the app's GitHub releases (src-tauri/src/update.rs; blank.exe in blank., mayhem.exe
// in the Mayhem app). Only the desktop apps have them.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export type UpdateInfo = {
  current: string;
  latest: string;
  available: boolean;
  /** The Mayhem app's English notes of the latest release (plain text, checked in Rust); empty
   * for blank. and when the release has none. */
  notes: string[];
};

export const updater = isTauri()
  ? {
      /** Asks GitHub for the latest release; rejects with a message (German in blank., English in
       * the Mayhem app). */
      check: () => invoke<UpdateInfo>('update_check'),
      /** Downloads, verifies and installs the found version, then restarts the app (true). False:
       * installed, but the new version did not start; the user starts the app again. */
      install: () => invoke<boolean>('update_install'),
      /** Download progress in percent; returns a function that stops listening. */
      onProgress: (handler: (percent: number) => void) => {
        const stop = listen<number>('update-progress', (event) => handler(event.payload));
        return () => void stop.then((unlisten) => unlisten());
      },
    }
  : null;
