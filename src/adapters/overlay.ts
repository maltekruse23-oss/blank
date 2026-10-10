// The overlay over the League game (src-tauri/src/overlay.rs, Mayhem app only): the Mayhem window
// tells per offered augment its tier and the build it fits; the overlay window draws what Rust
// passes on while those cards are on screen. The browser preview has neither.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

/** This page is the overlay window (overlay.rs); in the browser preview `mayhem.html?overlay`. */
export const isOverlayWindow = () =>
  isTauri()
    ? getCurrentWindow().label === 'overlay'
    : new URLSearchParams(window.location.search).has('overlay');

/** One offered augment: its tier for the chosen build (null: too few games) and the first two
 * items of the build it fits (empty: none). */
export type OverlayCard = { id: number; tier: string | null; items: number[] };

/** What the overlay draws: per card on screen its badge where its name is (x, y: parts of the game
 * window's width and height), and the build the tiers are for. */
export type OverlayShown = {
  build: string;
  cards: { tier: string | null; items: number[]; x: number; y: number }[];
};

/** The Mayhem window, for the offer open now and again whenever the chosen build changes. */
export const tellOverlay = (championId: number, build: string, cards: OverlayCard[]) =>
  isTauri()
    ? invoke<void>('mayhem_overlay_cards', { told: { championId, build, cards } }).catch(
        () => undefined,
      )
    : Promise.resolve();

/** The overlay window at its start: what to draw now (null: nothing). */
export const overlayNow = () =>
  isTauri()
    ? invoke<OverlayShown | null>('mayhem_overlay_now').catch(() => null)
    : Promise.resolve(null);

/** Each change; null: hidden (emptied, so a later show never flashes the cards before). */
export function onOverlay(handler: (shown: OverlayShown | null) => void) {
  if (!isTauri()) return () => undefined;
  const stop = listen<OverlayShown | null>('overlay-cards', ({ payload }) => handler(payload));
  return () => void stop.then((unlisten) => unlisten());
}
