// ARAM Mayhem leaderboard (user's wish): games of the user and up to three friends, read-only
// from the League client on this PC (src-tauri/src/aram.rs). The browser preview shows fictional
// games (src/data/mock.ts).
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { mockAramData, mockAramFriends } from '../data/mock';
import { DDRAGON_VERSION } from '../data/proStreamers';

export type AramPlayer = { puuid: string; name: string; icon: number };

/** More values of a game (src-tauri/src/aram.rs, Details), for the leaderboard's categories. */
export type AramDetails = {
  /** Magic damage to champions ("AP"). */
  magic: number;
  /** Physical damage to champions ("AD"). */
  physical: number;
  trueDamage: number;
  mitigated: number;
  doubles: number;
  triples: number;
  quadras: number;
  largestCrit: number;
  ccSeconds: number;
  largestSpree: number;
  turretDamage: number;
};

/** One player's result in one ARAM Mayhem game. */
export type AramEntry = {
  gameId: number;
  /** Start of the game, ms since 1970. */
  at: number;
  seconds: number;
  /** "16.19", for the item pictures of that time. */
  patch: string;
  puuid: string;
  /** Riot ID at the time of the game ("Name#TAG"). */
  name: string;
  championId: number;
  /** Data Dragon name ("MonkeyKing"); empty when unknown. */
  champion: string;
  championName: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  /** Damage to champions. */
  damage: number;
  taken: number;
  healed: number;
  shielded: number;
  gold: number;
  level: number;
  items: number[];
  augments: number[];
  /** Place of this damage among all players of the game (1 = most). */
  damageRank: number;
  /** Share of the team's damage to champions, 0–1. */
  teamShare: number;
  multikill: number;
  pentas: number;
  /** null for games stored before these values existed, until fetched again. */
  details: AramDetails | null;
  /** Friends of the user in the same game (League friend list or leaderboard). */
  with: AramMate[];
  /** From the end-of-game screen, until the history's exact values replace it. */
  provisional?: boolean;
};

/** A friend in the same game, for the comparison on the card. */
export type AramMate = {
  puuid: string;
  name: string;
  champion: string;
  championName: string;
  damage: number;
  kills: number;
  deaths: number;
  assists: number;
  /** In the same team as the player of the entry. */
  sameTeam: boolean;
};

/** An augment: name, rarity and its icon from the League client (data URL), if it had one. */
export type AramAugment = {
  name: string;
  rarity: 'prismatic' | 'gold' | 'silver' | '';
  icon: string | null;
};

export type AramData = {
  /** The League client is open. */
  client: boolean;
  me: AramPlayer | null;
  games: AramEntry[];
  syncedAt: number | null;
  /** By augment id. */
  augments: Record<string, AramAugment>;
  /** Started anew at this moment (ms): only later games count. */
  since: number | null;
  /** Players whose history the client did not give out this time. */
  missing: string[];
};

export type AramAdapter = {
  source: 'league' | 'mock';
  /** Stored games; asks the League client nothing. */
  data: () => Promise<AramData>;
  /** Fetches new games from the League client (the user's and the friends'). */
  sync: (friends: string[]) => Promise<AramData>;
  /** The friend list of the League client. */
  friends: () => Promise<AramPlayer[]>;
  /** Starts the leaderboard anew: all games go, only later ones count. */
  reset: () => Promise<AramData>;
  /** A group's start (null: none): only later games count and are fetched. */
  setSince: (since: number | null) => Promise<AramData>;
  /** Games of the group's members from the other apps (checked strictly in aram.rs). */
  merge: (entries: AramEntry[], members: string[]) => Promise<number>;
  /** blank. fetched new games by itself (after a game ended); returns the unsubscribe. */
  onUpdate: (handler: () => void) => () => void;
  /** An ARAM Mayhem game of the user just ended and is in the collection (for the card). */
  onResult: (handler: (played: { gameId: number; puuid: string }) => void) => () => void;
};

export const aramAdapter: AramAdapter = isTauri()
  ? {
      source: 'league',
      data: () => invoke<AramData>('aram_data'),
      sync: (friends) => invoke<AramData>('aram_sync', { friends }),
      friends: () => invoke<AramPlayer[]>('aram_friends'),
      reset: () => invoke<AramData>('aram_reset'),
      setSince: (since) => invoke<AramData>('aram_set_since', { since }),
      merge: (entries, members) => invoke<number>('aram_merge', { entries, members }),
      onUpdate: (handler) => {
        const stop = listen('aram-updated', () => handler());
        return () => void stop.then((unlisten) => unlisten());
      },
      onResult: (handler) => {
        const stop = listen<{ gameId: number; puuid: string }>('aram-result', (event) =>
          handler(event.payload),
        );
        return () => void stop.then((unlisten) => unlisten());
      },
    }
  : {
      source: 'mock',
      data: () => Promise.resolve(mockAramData),
      sync: () => Promise.resolve({ ...mockAramData, syncedAt: Date.now() }),
      friends: () => Promise.resolve(mockAramFriends),
      reset: () => Promise.resolve({ ...mockAramData, games: [], since: Date.now() }),
      setSince: (since) => Promise.resolve({ ...mockAramData, since }),
      merge: () => Promise.resolve(0),
      onUpdate: () => () => undefined,
      onResult: () => () => undefined,
    };

/** With the user ten players, as many as in one game (user's wish: more than three). */
export const MAX_ARAM_FRIENDS = 9;
// As the League client gives them (36 characters, like a UUID); Riot's web API uses 78.
const PUUID = /^[A-Za-z0-9_-]{30,100}$/;

/** Friends chosen for the leaderboard, from stored or imported settings (strictly checked). */
export function readAramFriends(raw: unknown): AramPlayer[] {
  if (!Array.isArray(raw)) return [];
  const friends: AramPlayer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { puuid, name, icon } = item as Record<string, unknown>;
    if (
      typeof puuid === 'string' &&
      PUUID.test(puuid) &&
      typeof name === 'string' &&
      name.length > 0 &&
      name.length <= 40 &&
      !/\p{Cc}/u.test(name) &&
      typeof icon === 'number' &&
      Number.isInteger(icon) &&
      icon >= 0 &&
      icon < 1_000_000 &&
      !friends.some((f) => f.puuid === puuid)
    )
      friends.push({ puuid, name, icon });
  }
  return friends.slice(0, MAX_ARAM_FRIENDS);
}

// Pictures from Riot's Data Dragon (allowed in the CSP), never copied into the app.
const CDN = 'https://ddragon.leagueoflegends.com/cdn';
const ALIAS = /^[A-Za-z0-9]{1,40}$/;
const version = (patch: string) =>
  /^\d{1,3}\.\d{1,3}$/.test(patch) ? `${patch}.1` : DDRAGON_VERSION;

export const championSquare = (alias: string) =>
  ALIAS.test(alias) ? `${CDN}/${DDRAGON_VERSION}/img/champion/${alias}.png` : null;
export const championSplash = (alias: string) =>
  ALIAS.test(alias) ? `${CDN}/img/champion/splash/${alias}_0.jpg` : null;
export const itemIcon = (id: number, patch: string) =>
  `${CDN}/${version(patch)}/img/item/${Math.trunc(id)}.png`;
export const profileIcon = (id: number) =>
  `${CDN}/${DDRAGON_VERSION}/img/profileicon/${Math.trunc(id)}.png`;

/** "Name#TAG" → name and tag apart. */
export function splitRiotId(name: string) {
  const at = name.lastIndexOf('#');
  return at > 0 ? { name: name.slice(0, at), tag: name.slice(at + 1) } : { name, tag: '' };
}
