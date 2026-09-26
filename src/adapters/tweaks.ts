// Gaming optimisation: a fixed list of per-user Windows settings, changed only on click and
// restored from a backup of the previous values (src-tauri/src/tweaks.rs). Desktop app only.
import { invoke, isTauri } from '@tauri-apps/api/core';

export type Tweak = {
  id: string;
  name: string;
  detail: string;
  /** open: can be applied; done: Windows already has it; changed: changed by blank., reversible. */
  state: 'open' | 'done' | 'changed';
  /** Current state in words ("an", "aus", "Windows-Standard"). */
  now: string;
  /** State before blank. changed it. */
  before: string | null;
  /** Milliseconds since 1970. */
  changedAt: number | null;
  /** Changed by blank., but set differently since. */
  drifted: boolean;
};

/** Each call resolves to the new state of all tweaks; errors are German messages. */
export const tweaks = isTauri()
  ? {
      status: () => invoke<Tweak[]>('tweaks_status'),
      apply: (ids: string[]) => invoke<Tweak[]>('tweaks_apply', { ids }),
      restore: (ids: string[]) => invoke<Tweak[]>('tweaks_restore', { ids }),
    }
  : null;
