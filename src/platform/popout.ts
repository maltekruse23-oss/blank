// Popouts (src-tauri/src/flyout.rs): the app window hands over notices, the popout window shows
// them. Desktop app only; in the browser preview there are no popouts.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { AppLoad } from '../adapters/pc';
import type { Page } from '../app/App';
import type { AramAugment, AramEntry } from '../adapters/aram';
import type { AramHighlight } from '../features/aram/aramHighlight';
import type { PopoutPlace, PopoutScreen } from '../features/popouts/placement';

/** blank.'s own SoundCloud mix; positions in ms, `at`: when `position` was true. */
export type MixItem = {
  kind: 'mix';
  id: number;
  title: string;
  artist: string;
  cover: string | null;
  playing: boolean;
  position: number | null;
  duration: number | null;
  at: number;
  /** Came by itself after the track before ended: the small "Als Nächstes" popout. */
  upNext?: boolean;
  /** The mix was stopped: an open mix popout goes away. */
  ended?: boolean;
};

export type MixAction = 'toggle' | 'next' | 'seek';

export type PopoutItem =
  /** What plays in any app (read in the popout window); `upNext`: the small variant. */
  | { kind: 'music'; id: number; upNext?: boolean }
  | MixItem
  /** Sample from the settings, to see the chosen place and look. */
  | { kind: 'test'; id: number }
  /**
   * Live preview while popout settings change: a sample track or notice, updated in place (same
   * id) with every change; `stamp` restarts its time.
   */
  | { kind: 'preview'; id: number; topic: 'music' | 'notice'; stamp: number }
  /** A short note, e.g. that nothing plays. */
  | { kind: 'info'; id: number; title: string; detail: string }
  /** The card after an ARAM Mayhem game (features/aram/AramResult.tsx), with its augments' icons. */
  | {
      kind: 'aram';
      id: number;
      entry: AramEntry;
      augments: Record<string, AramAugment>;
      highlight: AramHighlight;
    }
  | {
      kind: 'live';
      id: number;
      login: string;
      displayName: string;
      imageUrl?: string;
      game: string;
    }
  | {
      kind: 'warning';
      id: number;
      battery: boolean;
      title: string;
      detail: string;
      page: Page;
      /** Program a click may close (overload warnings). */
      culprit?: AppLoad;
    };

export const hasPopouts = isTauri();

/** This page is a popout window, not the app. */
export const isPopoutWindow = () => isTauri() && getCurrentWindow().label.startsWith('flyout-');

function subscribe<T>(event: string, handler: (payload: T) => void): () => void {
  const unlisten = listen<T>(event, (e) => handler(e.payload));
  return () => void unlisten.then((stop) => stop());
}

// --- App window ---

/**
 * `false` when it is held back because a full-screen game, video or presentation runs on the
 * popout's screen `screen` (the setting; unless `overFullScreen`, a setting). `acrylic`: the
 * setting for the popout window's background.
 */
export const showPopout = (
  item: PopoutItem,
  options: { overFullScreen?: boolean; acrylic?: boolean; screen?: PopoutScreen } = {},
) =>
  invoke<boolean>('flyout_show', {
    item,
    overFullScreen: options.overFullScreen ?? false,
    acrylic: options.acrylic ?? false,
    screen: options.screen ?? null,
  }).catch((error: unknown) => {
    console.error('Popout failed', error);
    return false;
  });

/** New state for a popout that may be open (the own mix); never opens one. */
export const updatePopout = (item: PopoutItem) =>
  invoke<void>('flyout_update', { item }).catch(() => undefined);

/** A live notice or warning was closed or clicked in the popout. */
export const onPopoutDone = (handler: (done: { kind: PopoutItem['kind']; id: number }) => void) =>
  subscribe('flyout-done', handler);

/** A popout asked the app to open a page. */
export const onOpenPage = (handler: (page: Page) => void) => subscribe('open-page', handler);

/** A button for the own mix was pressed in a popout. */
export const onMixControl = (
  handler: (control: { action: MixAction; position: number | null }) => void,
) => subscribe('mix-control', handler);

/** Left click on the icon in the notification area, set to show the music. */
export const onTrayMusic = (handler: () => void) => subscribe('tray-music', handler);

/** What a left click on the icon in the notification area does (src-tauri/src/tray.rs). */
export const setTrayClick = (music: boolean) =>
  invoke<void>('set_tray_click', { music }).catch(() => undefined);

/** Number of screens (the choice of screen only matters with more than one). */
export const countScreens = () => invoke<number>('flyout_screens').catch(() => 1);

/** Taskbar icons on the left: popouts in the taskbar then sit at its right end (flyout.rs). */
export const taskbarIconsLeft = () => invoke<boolean>('taskbar_icons_left').catch(() => false);

// --- Popout window ---

export const onPopoutItem = (handler: (item: PopoutItem) => void) =>
  subscribe('flyout-item', handler);
export const onPopoutUpdate = (handler: (item: PopoutItem) => void) =>
  subscribe('flyout-update', handler);
/** Something on the popout's screen turned full screen: it is hidden already (fullscreen.rs). */
export const onPopoutFullScreen = (handler: () => void) =>
  subscribe<null>('flyout-fullscreen', () => handler());
export const takePendingPopouts = () => invoke<PopoutItem[]>('flyout_pending');
export const preparePopout = () => invoke<void>('flyout_prepare');
/**
 * Size of the whole window in CSS pixels; `inset`: transparent edge kept for the own shadow;
 * `taskbar`: the card's height to place it in the taskbar (a setting). Resolves to the taskbar's
 * edge and the end it keeps to, or null if it went to `place` (no taskbar there).
 */
export const presentPopout = (
  width: number,
  height: number,
  place: PopoutPlace,
  screen: PopoutScreen,
  inset: number,
  taskbar: number | null = null,
) =>
  invoke<{ edge: 'top' | 'bottom'; side: 'left' | 'right'; light: boolean } | null>(
    'flyout_present',
    {
      width,
      height,
      place,
      screen,
      inset,
      taskbar,
    },
  );
/** Shows only this part of the popout window (x, y, width, height in CSS px); null: all of it. */
export const setPopoutRegion = (rect: [number, number, number, number] | null) =>
  invoke<void>('flyout_region', { rect });
export const hidePopout = () => invoke<void>('flyout_hide');
export const popoutDone = (kind: PopoutItem['kind'], id: number) =>
  invoke<void>('flyout_done', { kind, id });
/** The full app, optionally on a page. */
export const openApp = (page?: Page) => invoke<void>('show_app', { page: page ?? null });
export const openStream = (login: string) => invoke<void>('twitch_open_channel', { login });
/** Play/pause, next track or jump (ms) in blank.'s own mix, which plays in the app window. */
export const controlMix = (action: MixAction, position?: number) =>
  invoke<void>('flyout_mix', { action, position: position ?? null });
