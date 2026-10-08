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
  /** arammeta.com's numbers (user's choice, Rust `meta_info`); null when it did not answer. */
  meta?: MetaInfo | null;
};

/** An augment as arammeta lists it: English name, rarity kSilver/kGold/kPrismatic, categories
 * like "ap", "ad", "tank", icon path on arammeta.com. */
export type MetaAugment = { name: string; rarity: string; cats: string[]; icon: string };

export type MetaInfo = {
  patch: string;
  games: number | null;
  /** `/api/champions/<id>.json` as it came (checked in champCard.ts). */
  champion: string | null;
  augments: Record<string, MetaAugment>;
};

/** Follow the champion select while the client runs (on), or stop (off). With `itemSet` and
 * `spells` (blank.'s switches, MAYHEM-BERATER.md 6a) Rust also writes the item set and sets the
 * summoner spells; with `offers` it reads the augment offers in the game (offers.rs). */
export const watchChamp = (
  on: boolean,
  writes: { itemSet?: boolean; spells?: boolean; offers?: boolean } = {},
) =>
  isTauri()
    ? invoke<void>('aram_champ_watch', { on, ...writes }).catch(() => undefined)
    : Promise.resolve();

/** The build chosen for the champion held in the champion select: Rust remembers it for the
 * game's offers and writes the item set "blank. <direction>" with that switch on; nothing for any
 * other champion. Failures are in the error log. */
export const chooseBuild = (
  championId: number,
  direction: string,
  set: { core: number[]; more: number[] } | null,
) =>
  isTauri() && set
    ? invoke<void>('aram_champ_build', { championId, direction, ...set }).catch(() => undefined)
    : Promise.resolve();

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

/** Augments offered in the game, read off the screen (offers.rs); an empty list: the offer closed. */
export type Offers = {
  championId: number;
  direction: 'ap' | 'ad' | 'tank' | null;
  offers: { id: number; name: string }[];
};

export function onOffers(handler: (offers: Offers) => void) {
  if (!isTauri()) return () => undefined;
  const stop = listen<Offers>('aram-offers', ({ payload }) => handler(payload));
  return () => void stop.then((unlisten) => unlisten());
}
