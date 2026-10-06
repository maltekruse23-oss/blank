// Champ-Karte: the champion the user holds in an ARAM Mayhem champion select (src-tauri/src/
// aram_live.rs, from the League client's own event stream, read-only), and what the card shows
// (the champion's stats from the website, items from Data Dragon). Desktop app only; the browser
// preview has no client.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { DDRAGON_VERSION } from '../data/proStreamers';

/** An item as the card needs it (from Data Dragon, reduced in Rust). */
export type ChampItem = {
  name: string;
  done: boolean;
  mana: boolean;
  /** What it builds towards, from its Data Dragon tags (Rust, `kind_of`). */
  kind: 'ap' | 'ad' | 'tank' | 'other';
};

/** The website's answers as JSON text (checked in champCard.ts) and the items. */
export type ChampInfo = {
  champion: string | null;
  augments: string | null;
  items: Record<string, ChampItem>;
};

/** Follow the champion select while the client runs (on), or stop (off). */
export const watchChamp = (on: boolean) =>
  isTauri() ? invoke<void>('aram_champ_watch', { on }).catch(() => undefined) : Promise.resolve();

/** The champion held in the champion select, with Data Dragon key and name from the client. */
export type HeldChamp = { championId: number; alias: string; name: string };

/** The champion picked or swapped to (championId 0: the champion select ended). */
export function onChamp(handler: (champ: HeldChamp) => void) {
  if (!isTauri()) return () => undefined;
  const stop = listen<HeldChamp>('aram-champ', ({ payload }) => handler(payload));
  return () => void stop.then((unlisten) => unlisten());
}

export const readChampInfo = (championId: number): Promise<ChampInfo> =>
  invoke<ChampInfo>('aram_champ_info', { championId, version: DDRAGON_VERSION });

/** Mayhem app only (src-tauri/src/mayhem.rs): whether the League client runs. */
export const leagueClientOpen = () =>
  isTauri() ? invoke<boolean>('league_client_open').catch(() => false) : Promise.resolve(false);

/** Mayhem app only: the League client opened (true) or closed (false). */
export function onLeagueClient(handler: (open: boolean) => void) {
  if (!isTauri()) return () => undefined;
  const stop = listen<boolean>('league-client', ({ payload }) => handler(payload));
  return () => void stop.then((unlisten) => unlisten());
}
