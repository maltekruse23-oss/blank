// The Mayhem app's tier lists (user, 07.10.2026: augment tier list, champion tier list): every
// augment and champion with arammeta.com's win rate and games over all Mayhem games (Rust
// `mayhem_tiers`, read from the list the champ card already keeps). Checked strictly here, ranked
// by win rate pulled towards 50 % when there are few games, then cut into S–D like the website's
// tier list: best 10 % S, then 20 % A, 40 % B, 20 % C, last 10 % D.
import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Tier } from '../features/aram/champCard';

export type TierAugment = {
  id: number;
  name: string;
  rarity: 'prismatic' | 'gold' | 'silver';
  /** Picture on arammeta.com (allowed in the Mayhem window's CSP), null when unknown. */
  image: string | null;
  text: string;
  cats: string[];
  winRate: number;
  games: number;
  tier: Tier;
};

export type TierChampion = {
  id: number;
  name: string;
  alias: string;
  tags: string[];
  winRate: number;
  games: number;
  tier: Tier;
};

export type TierLists = { patch: string; augments: TierAugment[]; champions: TierChampion[] };

/** Games that count as a 50 % result before the real ones (as the website's tier list). */
export const PRIOR = 200;
/** Shares of the tiers S, A, B, C, D, best first. */
const CUTS: [Tier, number][] = [
  ['S', 0.1],
  ['A', 0.3],
  ['B', 0.7],
  ['C', 0.9],
  ['D', 1],
];

const META = 'https://arammeta.com/';
const RARITY: Record<string, TierAugment['rarity']> = {
  kPrismatic: 'prismatic',
  kGold: 'gold',
  kSilver: 'silver',
};

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const text = (value: unknown, max: number) =>
  typeof value === 'string' && value.length <= max ? value : null;
const count = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value < 1e9 ? value : null;
const rate = (value: unknown) =>
  typeof value === 'number' && value >= 0 && value <= 1 ? value : null;
const words = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.length <= 20).slice(0, 6)
    : [];

/** Win rate pulled towards 50 % by `PRIOR` games. */
export const pulled = (winRate: number, games: number) =>
  (winRate * games + 0.5 * PRIOR) / (games + PRIOR);

/** S–D by place: the list sorted best first, each entry gets its tier. */
export function withTiers<T extends { winRate: number; games: number }>(
  list: T[],
): (T & { tier: Tier })[] {
  const sorted = [...list].sort(
    (a, b) => pulled(b.winRate, b.games) - pulled(a.winRate, a.games) || b.games - a.games,
  );
  return sorted.map((entry, i) => {
    const place = (i + 1) / sorted.length;
    const tier = CUTS.find(([, upTo]) => place <= upTo)?.[0] ?? 'D';
    return { ...entry, tier };
  });
}

/** Rust's answer, checked; null when it is not a usable list. */
export function readTiers(raw: unknown): TierLists | null {
  const root = record(raw);
  if (!root || !Array.isArray(root.augments) || !Array.isArray(root.champions)) return null;
  const augments = root.augments.flatMap((value) => {
    const a = record(value);
    const id = count(a?.id);
    const name = text(a?.name, 60);
    const rarity = RARITY[text(a?.rarity, 20) ?? ''];
    const winRate = rate(a?.wr);
    const games = count(a?.games);
    if (!a || id === null || !name || !rarity || winRate === null || games === null) return [];
    const icon = text(a.icon, 200);
    const image = icon && /^assets\/[A-Za-z0-9_/.-]+\.png$/.test(icon) ? META + icon : null;
    return [
      {
        id,
        name,
        rarity,
        image,
        // arammeta writes [數值] ("value") where a number depends on the level.
        text: (text(a.text, 400) ?? '').replace(/\[數值\]/g, '?'),
        cats: words(a.cats),
        winRate,
        games,
      },
    ];
  });
  const champions = root.champions.flatMap((value) => {
    const c = record(value);
    const id = count(c?.id);
    const name = text(c?.name, 40);
    const alias = text(c?.alias, 40);
    const winRate = rate(c?.wr);
    const games = count(c?.games);
    if (
      !c ||
      id === null ||
      !name ||
      !alias ||
      !/^[A-Za-z0-9]+$/.test(alias) ||
      winRate === null ||
      games === null
    )
      return [];
    return [{ id, name, alias, tags: words(c.tags), winRate, games }];
  });
  if (!augments.length && !champions.length) return null;
  return {
    patch: text(root.patch, 12) ?? '',
    augments: withTiers(augments),
    champions: withTiers(champions),
  };
}

/** The tier lists from arammeta.com (desktop app only; the browser preview has none). */
export async function loadTiers(): Promise<TierLists> {
  if (!isTauri()) throw new Error('Nur in der Mayhem-App.');
  const lists = readTiers(await invoke<unknown>('mayhem_tiers'));
  if (!lists) throw new Error('Die Liste kam unvollständig an.');
  return lists;
}
