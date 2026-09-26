// Second copy of the saved settings in a file next to twitch.json (src-tauri/src/store.rs). The
// WebView storage (localStorage) stays the main place; the copy is only read at app start and
// fills in settings the WebView storage lost or has older. Desktop app only.
import { invoke, isTauri } from '@tauri-apps/api/core';

const KEYS = ['blank.preferences.v1', 'blank.music.v1', 'blank.apps.v1'] as const;
/** Time of the last save, in both places; the newer side wins at start. */
const STAMP = 'blank.saved-at.v1';
/** Saves in quick succession (volume slider) are written once. */
const WRITE_DELAY_MS = 150;

type Mirror = { savedAt: number; items: Partial<Record<(typeof KEYS)[number], string>> };

function readMirror(text: string): Mirror | null {
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (typeof raw.savedAt !== 'number' || !raw.items || typeof raw.items !== 'object') return null;
    const items: Mirror['items'] = {};
    for (const key of KEYS) {
      const value = (raw.items as Record<string, unknown>)[key];
      if (typeof value === 'string') items[key] = value;
    }
    return { savedAt: raw.savedAt, items };
  } catch {
    return null;
  }
}

/** Before the first render: takes the copy when it is newer or the WebView storage lost data. */
let fresh = false;

/** No saved settings at all when the app started: a new PC (or a new Windows). */
export const isFreshStart = () => fresh;

export async function restoreSettings(): Promise<void> {
  if (!isTauri()) return;
  try {
    const text = await invoke<string | null>('settings_mirror_read');
    const mirror = text ? readMirror(text) : null;
    if (mirror) {
      const local = Number(localStorage.getItem(STAMP) ?? 0);
      const lost = KEYS.some((key) => localStorage.getItem(key) === null && mirror.items[key]);
      if (mirror.savedAt > local || lost) {
        for (const key of KEYS) {
          const value = mirror.items[key];
          if (value !== undefined) localStorage.setItem(key, value);
        }
        localStorage.setItem(STAMP, String(mirror.savedAt));
      }
    }
    fresh = KEYS.every((key) => localStorage.getItem(key) === null);
    // First start with the copy (or an unusable one): create it from the current settings.
    if (!mirror) mirrorSettings();
  } catch {
    // No copy or no storage: the WebView storage alone, as before.
  }
}

let timer: number | undefined;

function writeMirror(): Promise<unknown> {
  try {
    const savedAt = Date.now();
    const items: Mirror['items'] = {};
    for (const key of KEYS) {
      const value = localStorage.getItem(key);
      if (value !== null) items[key] = value;
    }
    localStorage.setItem(STAMP, String(savedAt));
    return invoke('settings_mirror_write', { content: JSON.stringify({ savedAt, items }) }).catch(
      () => undefined,
    );
  } catch {
    // Storage unavailable: nothing to copy.
    return Promise.resolve();
  }
}

/** After every save: writes all settings to the copy. */
export function mirrorSettings() {
  if (!isTauri()) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void writeMirror(), WRITE_DELAY_MS);
}

/** Writes the copy right now, e.g. before the app restarts. */
export async function flushMirror(): Promise<void> {
  if (!isTauri()) return;
  window.clearTimeout(timer);
  await writeMirror();
}
