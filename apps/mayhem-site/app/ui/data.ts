'use client';
// Loading data for the pages: one fetch helper with live updates (server-sent events from
// /api/live, otherwise every 5 s), and the Data Dragon lookups (champion, item and profile
// images only from Riot's CDN).
import { useEffect, useState } from 'react';
import type { AramEntry } from '../../src/adapters/aram';
import type { AugmentInfo } from '../../src/augments';
import { riotSlug } from '../../src/hidden';
import type { TagCensus } from '../../src/tags';
import type { Grade, Performance } from '../../src/features/aram/aramPerformance';
import type { Average, Rank, Season, Step } from '../../src/features/aram/aramRating';

export type Champion = { championId: number; champion: string; games: number };

export type PlayerSummary = {
  puuid: string;
  name: string;
  icon: number | null;
  rank: Rank | null;
  games: number;
  wins: number;
  placed: number;
  climbing: boolean;
  average: Average | null;
  seasons: { season: Season; rank: Rank }[];
  champions: Champion[];
  last6: { gameId: number; at: number; gain: number | null; grade: Grade; change: Step['change'] }[];
};

export type Board = {
  season: { id: string; ratingVersion: number };
  trackedGames: number;
  players: PlayerSummary[];
};

export type ProfileStep = Omit<Step, 'mark' | 'entry'> & { entry: AramEntry; mark: Performance };

export type Profile = Omit<PlayerSummary, 'champions' | 'last6'> & {
  lastSeen: number | null;
  /** The player's public id (no PUUID leaves the server); an old PUUID link moves there. */
  id?: string;
  history: ProfileStep[];
};

/** Loads `path` and reloads it on every new game; `live` tells whether events arrive. */
export function useLive<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  /** The path `data` answers. */
  const [loaded, setLoaded] = useState<string | null>(null);
  const [error, setError] = useState('');
  /** The server says the thing asked for does not exist (404). */
  const [missing, setMissing] = useState(false);
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!path) return;
    let stop = false;
    let busy = false;
    let again = false;
    const load = async () => {
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      try {
        const response = await fetch(path);
        const body = (await response.json()) as T & { error?: string };
        if (!stop) setMissing(response.status === 404);
        if (!response.ok) throw new Error(body.error || 'Nicht verfügbar.');
        if (!stop) {
          setData(body);
          setLoaded(path);
          setError('');
        }
      } catch (e) {
        if (!stop) setError((e as Error).message || 'Nicht verfügbar.');
      } finally {
        busy = false;
        if (again && !stop) {
          again = false;
          void load();
        }
      }
    };
    void load();
    const events = new EventSource('/api/live');
    const reload = () => void load();
    events.addEventListener('ready', () => setLive(true));
    events.addEventListener('game', reload);
    events.addEventListener('reset', reload);
    events.addEventListener('unavailable', () => setLive(false));
    events.onerror = () => setLive(false);
    const timer = setInterval(() => {
      if (events.readyState !== EventSource.OPEN && !document.hidden) void load();
    }, 5000);
    return () => {
      stop = true;
      events.close();
      clearInterval(timer);
    };
  }, [path]);
  return { data, error, live, missing, path: loaded };
}

// ---- Data Dragon --------------------------------------------------------------------------

type Dragon = { version: string; champions: Map<number, { id: string; name: string; tags: string[] }> };
let dragon: Promise<Dragon> | null = null;

function loadDragon(): Promise<Dragon> {
  dragon ??= (async () => {
    const versions = (await (
      await fetch('https://ddragon.leagueoflegends.com/api/versions.json')
    ).json()) as string[];
    const version = versions[0];
    const list = (await (
      await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/de_DE/champion.json`)
    ).json()) as { data: Record<string, { id: string; key: string; name: string; tags?: string[] }> };
    const champions = new Map(
      Object.values(list.data).map((c) => [Number(c.key), { id: c.id, name: c.name, tags: c.tags ?? [] }]),
    );
    return { version, champions };
  })().catch((error) => {
    dragon = null;
    throw error;
  });
  return dragon;
}

/** The current Data Dragon version and champion list (null while loading or offline). */
export function useDragon() {
  const [value, setValue] = useState<Dragon | null>(null);
  useEffect(() => {
    let stop = false;
    loadDragon().then(
      (d) => !stop && setValue(d),
      () => undefined,
    );
    return () => {
      stop = true;
    };
  }, []);
  return value;
}

const CDN = 'https://ddragon.leagueoflegends.com/cdn';

export const championImage = (d: Dragon | null, key: string | undefined) =>
  d && key ? `${CDN}/${d.version}/img/champion/${key}.png` : undefined;
export const itemImage = (d: Dragon | null, id: number) =>
  d ? `${CDN}/${d.version}/img/item/${id}.png` : undefined;
export const profileImage = (d: Dragon | null, icon: number | null) =>
  d && icon !== null ? `${CDN}/${d.version}/img/profileicon/${icon}.png` : undefined;
/** Data Dragon key of a champion: the uploaded one, otherwise from the list ('' while unknown). */
export const championKey = (d: Dragon | null, c: { championId: number; champion: string }) =>
  c.champion || d?.champions.get(c.championId)?.id || '';
/** German name of a champion. */
export const championLabel = (d: Dragon | null, c: { championId: number; champion: string; championName: string }) =>
  d?.champions.get(c.championId)?.name ?? (c.championName || c.champion || `Champion ${c.championId}`);
export const splashImage = (key: string, skin = 0) =>
  `${CDN}/img/champion/splash/${key}_${skin}.jpg`;

// ---- Items (names from Data Dragon) --------------------------------------------------------

/** What the items page sorts by: finished items, boots, everything else (parts, potions, …). */
export type ItemKind = 'done' | 'boots' | 'other';
export type ItemInfo = { name: string; kind: ItemKind; gold: number };

let items: Promise<Map<number, ItemInfo>> | null = null;

function loadItems() {
  items ??= (async () => {
    const { version } = await loadDragon();
    const list = (await (
      await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/de_DE/item.json`)
    ).json()) as { data: Record<string, { name: string; into?: string[]; tags?: string[]; gold?: { total: number } }> };
    return new Map(
      Object.entries(list.data).map(([id, i]) => {
        const tags = i.tags ?? [];
        const gold = i.gold?.total ?? 0;
        const kind: ItemKind = tags.includes('Boots')
          ? gold > 300
            ? 'boots'
            : 'other'
          : !i.into?.length && !tags.includes('Consumable') && !tags.includes('Trinket') && gold >= 1000
            ? 'done'
            : 'other';
        return [Number(id), { name: i.name, kind, gold }];
      }),
    );
  })().catch((error) => {
    items = null;
    throw error;
  });
  return items;
}

/** Names and kinds of all items (empty while loading or offline). */
export function useItems() {
  const [value, setValue] = useState<Map<number, ItemInfo>>(() => new Map());
  useEffect(() => {
    let stop = false;
    loadItems().then(
      (i) => !stop && setValue(i),
      () => undefined,
    );
    return () => {
      stop = true;
    };
  }, []);
  return value;
}

// ---- Augments (names and icons sent by blank., not on Data Dragon) ---------------------------

let augments: Promise<Map<number, AugmentInfo>> | null = null;

function loadAugments() {
  augments ??= (async () => {
    const response = await fetch('/api/augments');
    if (!response.ok) throw new Error('Augments nicht verfügbar.');
    const body = (await response.json()) as { augments: Record<string, AugmentInfo> };
    return new Map(Object.entries(body.augments).map(([id, a]) => [Number(id), a]));
  })().catch((error) => {
    augments = null;
    throw error;
  });
  return augments;
}

/** Names, rarity and icons of the known augments (empty while loading or unavailable). */
export function useAugments() {
  const [value, setValue] = useState<Map<number, AugmentInfo>>(() => new Map());
  useEffect(() => {
    let stop = false;
    loadAugments().then(
      (a) => !stop && setValue(a),
      () => undefined,
    );
    return () => {
      stop = true;
    };
  }, []);
  return value;
}

// ---- Tags (cut-offs and rarity from all players, src/tags.ts) --------------------------------

let census: Promise<TagCensus & { prismatic: number[] }> | null = null;

/** The tag census of all players (null while loading or unavailable). */
export function useTagCensus() {
  const [value, setValue] = useState<(TagCensus & { prismatic: number[] }) | null>(null);
  useEffect(() => {
    let stop = false;
    census ??= fetch('/api/tags').then((r) => {
      if (!r.ok) throw new Error('Tags nicht verfügbar.');
      return r.json();
    });
    census.then(
      (c) => !stop && setValue(c),
      () => {
        census = null;
      },
    );
    return () => {
      stop = true;
    };
  }, []);
  return value;
}

export const augmentImage = (id: number) => `/api/augments/${id}.png`;

/** The time of the first render (Date.now() must not run during rendering). */
export function useNow() {
  const [now] = useState(() => Date.now());
  return now;
}

// ---- Formatting ---------------------------------------------------------------------------

export const de = (n: number, digits = 0) =>
  n.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const date = (at: number) =>
  new Date(at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });

export const ago = (at: number, now: number) => {
  const minutes = Math.round((now - at) / 60000);
  if (minutes < 60) return `vor ${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} h`;
  const days = Math.round(hours / 24);
  return days < 30 ? `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}` : date(at);
};

export const duration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

/** "XI JINPING#KPCh" → name and tag. */
export const splitName = (name: string) => {
  const i = name.lastIndexOf('#');
  return i > 0 ? { name: name.slice(0, i), tag: name.slice(i + 1) } : { name, tag: '' };
};

/** A player's profile address: by Riot ID ("/players/Name-EUW", as op.gg), by id only when no name
 * is known. */
export function profileHref(p: { puuid: string; name?: string | null }) {
  return '/players/' + encodeURIComponent(p.name ? riotSlug(p.name) : p.puuid);
}
