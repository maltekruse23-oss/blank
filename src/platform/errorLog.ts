// Errors the page caught go into the local error log (src-tauri/src/errors.rs); in Settings →
// System the user copies a report and sends it themselves. Nothing is sent from here. The browser
// preview keeps them in memory for the same report.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { version } from '../../package.json';

const MAX_TEXT = 1800;
/** The same error again within this time is not written again (e.g. once per frame). */
const REPEAT_MS = 10_000;
/** At most this many lines per run, so a loop cannot fill the log. */
const MAX_PER_RUN = 60;
const PREVIEW_LINES = 80;

const recent = new Map<string, number>();
let written = 0;
const previewLines: string[] = [];

/** "TypeError: x is undefined (at a | at b)", without the page's own address. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const where = (error.stack ?? '')
      .split('\n')
      .slice(1, 4)
      .map((line) => line.trim().replace(/[a-z]+:\/\/[^/\s)]+/gi, ''))
      .filter(Boolean)
      .join(' | ');
    return `${error.name}: ${error.message}${where ? ` (${where})` : ''}`;
  }
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

/** Writes one error; `where`: the part of the app ("Twitch", "Popout" …), `detail`: e.g. components. */
export function logError(where: string, error: unknown, detail?: string) {
  const text = `${describeError(error)}${detail ? ` [${detail}]` : ''}`.slice(0, MAX_TEXT);
  const key = `${where}\n${text}`;
  const now = Date.now();
  if (now - (recent.get(key) ?? -Infinity) < REPEAT_MS || written >= MAX_PER_RUN) return;
  recent.set(key, now);
  written += 1;
  console.error(`[${where}]`, error);
  if (isTauri()) {
    void invoke('log_error', { source: where, message: text }).catch(() => undefined);
  } else {
    previewLines.push(`${new Date(now).toISOString()} ${where}: ${text}`);
    previewLines.splice(0, Math.max(0, previewLines.length - PREVIEW_LINES));
  }
}

/** Harmless browser notes that are no errors of the app. */
const HARMLESS = [/ResizeObserver loop/i];

/** Errors nobody caught (also in async code), for this window. */
export function listenForErrors(where: string) {
  window.addEventListener('error', (event) => {
    const error: unknown = event.error ?? event.message;
    if (HARMLESS.some((pattern) => pattern.test(describeError(error)))) return;
    logError(where, error);
  });
  window.addEventListener('unhandledrejection', (event) => logError(where, event.reason));
}

/** The report to copy: version, Windows and the last errors (desktop: from errors.log). */
export function errorReport(): Promise<string> {
  if (isTauri()) return invoke<string>('error_report');
  const body = previewLines.length ? previewLines.join('\n') : 'Keine Fehler aufgezeichnet.';
  return Promise.resolve(
    `blank. Fehlerbericht\nVersion: ${version} (Browser-Vorschau)\nErstellt: ${new Date().toISOString()}\n\n${body}\n`,
  );
}
