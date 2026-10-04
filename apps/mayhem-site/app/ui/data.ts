'use client';
// Loading data for the pages: one fetch helper with live updates (server-sent events from
// /api/live, otherwise every 5 s), and the Data Dragon lookups (champion, item and profile
// images only from Riot's CDN).
import { useEffect, useState } from 'react';
import type { AramEntry } from '../../src/adapters/aram';
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
  group: { code: string; name: string } | null;
  trackedGames: number;
  players: PlayerSummary[];
};

export type ProfileStep = Omit<Step, 'mark' | 'entry'> & { entry: AramEntry; mark: Performance };

export type Profile = Omit<PlayerSummary, 'champions' | 'last6'> & {
  lastSeen: number | null;
  history: ProfileStep[];
};

/** Loads `path` and reloads it on every new game; `live` tells whether events arrive. */
export function useLive<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
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
        if (!response.ok) throw new Error(body.error || 'Nicht verfügbar.');
        if (!stop) {
          setData(body);
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
    const group = new URL(path, 'http://x').searchParams.get('group');
    const events = new EventSource('/api/live' + (group ? '?group=' + encodeURIComponent(group) : ''));
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
  return { data, error, live };
}

// ---- Data Dragon --------------------------------------------------------------------------

type Dragon = { version: string; champions: Map<number, { id: string; name: string }> };
let dragon: Promise<Dragon> | null = null;

function loadDragon(): Promise<Dragon> {
  dragon ??= (async () => {
    const versions = (await (
      await fetch('https://ddragon.leagueoflegends.com/api/versions.json')
    ).json()) as string[];
    const version = versions[0];
    const list = (await (
      await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/de_DE/champion.json`)
    ).json()) as { data: Record<string, { id: string; key: string; name: string }> };
    const champions = new Map(
      Object.values(list.data).map((c) => [Number(c.key), { id: c.id, name: c.name }]),
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
