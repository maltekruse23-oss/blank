// The Mayhem app's tier lists (user, 07.10.2026: augment tier list, champion tier list): every
// augment and champion with arammeta.com's win rate and games over all Mayhem games (Rust
// `mayhem_tiers`, read from the list the champ card already keeps). Checked strictly here, ranked
// by win rate pulled towards 50 % when there are few games, then cut into S–D like the website's
// tier list: best 10 % S, then 20 % A, 40 % B, 20 % C, last 10 % D. arammeta's own tiers (OP,
// T1–T5) are not read, so the lists keep this tiering.
// Since 08.10.2026 (user: "alle Daten von arammeta … so viele wie möglich") also each champion's
// best augments, teammates and team profile, augment lift, pick rate and linked champions, the
// augment categories; all from the same one list (the item and patch pages went again).
import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Tier } from '../features/aram/champCard';
import { MOCK_TIERS } from './mock';

export type Rarity = 'prismatic' | 'gold' | 'silver';

export type TierAugment = {
  id: number;
  name: string;
  rarity: Rarity;
  /** Picture on arammeta.com (allowed in the Mayhem window's CSP), null when unknown. */
  image: string | null;
  text: string;
  cats: string[];
  winRate: number;
  games: number;
  /** Win rate above what its champions win anyway; null when arammeta has none. */
  lift: number | null;
  pick: number | null;
  /** Champions arammeta's search links with the augment. */
  champions: number[];
  tier: Tier;
};

/** One of a champion's best augments (arammeta's `top`, best first per rarity). */
export type ChampAugment = {
  id: number;
  rarity: Rarity;
  games: number;
  winRate: number;
  lift: number | null;
  pick: number | null;
};

/** A teammate (arammeta's `pairs`): win rate together against the expected one. */
export type Teammate = {
  id: number;
  games: number;
  winRate: number;
  expected: number | null;
  lift: number | null;
};

/** The team profile's keys: damage per minute by type, then scores 0–3. */
export const DAMAGE_KEYS = ['phys', 'magic', 'true'] as const;
export const SCORE_KEYS = ['front', 'damage', 'engage', 'wave', 'poke', 'sustain', 'cc'] as const;
export type CompKey = (typeof DAMAGE_KEYS)[number] | (typeof SCORE_KEYS)[number];

export type TierChampion = {
  id: number;
  name: string;
  alias: string;
  tags: string[];
  winRate: number;
  games: number;
  top: ChampAugment[];
  pairs: Teammate[];
  comp: Partial<Record<CompKey, number>>;
  tier: Tier;
};

export type Category = { id: string; label: string };

export type TierLists = {
  patch: string;
  augments: TierAugment[];
  champions: TierChampion[];
  categories: Category[];
  /** Invented values of the browser preview (mock.ts). */
  mock?: boolean;
};

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
        lift: signed(a.lift),
        pick: rate(a.pick),
        champions: ids(a.champions, 200),
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
    return [
      {
        id,
        name,
        alias,
        tags: words(c.tags),
        winRate,
        games,
        top: list(c.top, 60, readChampAugment),
        pairs: list(c.pairs, 30, readTeammate),
        comp: readComp(c.comp),
      },
    ];
  });
  if (!augments.length && !champions.length) return null;
  return {
    patch: text(root.patch, 12) ?? '',
    augments: withTiers(augments),
    champions: withTiers(champions),
    categories: list(root.categories, 20, (value) => {
      const c = record(value);
      const id = text(c?.id, 20);
      const label = text(c?.label, 30);
      return id && label ? { id, label } : null;
    }),
  };
}

const signed = (value: unknown) =>
  typeof value === 'number' && value >= -1 && value <= 1 ? value : null;
const ids = (value: unknown, max: number) =>
  Array.isArray(value)
    ? value.flatMap((v) => (count(v) === null ? [] : [v as number])).slice(0, max)
    : [];
function list<T>(value: unknown, max: number, read: (value: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, max).flatMap((v) => {
    const entry = read(v);
    return entry === null ? [] : [entry];
  });
}

function readChampAugment(value: unknown): ChampAugment | null {
  const a = record(value);
  const id = count(a?.id);
  const rarity = RARITY[text(a?.rarity, 20) ?? ''];
  const games = count(a?.games);
  const winRate = rate(a?.wr);
  if (!a || id === null || !rarity || games === null || winRate === null) return null;
  return { id, rarity, games, winRate, lift: signed(a.lift), pick: rate(a.pick) };
}

function readTeammate(value: unknown): Teammate | null {
  const p = record(value);
  const id = count(p?.id);
  const games = count(p?.games);
  const winRate = rate(p?.wr);
  if (!p || id === null || games === null || winRate === null) return null;
  return { id, games, winRate, expected: rate(p.expected), lift: signed(p.lift) };
}

function readComp(value: unknown): Partial<Record<CompKey, number>> {
  const c = record(value);
  const comp: Partial<Record<CompKey, number>> = {};
  for (const key of [...DAMAGE_KEYS, ...SCORE_KEYS]) {
    const v = c?.[key];
    if (typeof v === 'number' && v >= 0 && v < 100_000) comp[key] = v;
  }
  return comp;
}

/** One bar of the team profile: the value and its share of the most any champion has. */
export type ProfileBar = { key: CompKey; value: number; share: number };

/**
 * A champion's team profile as bars: the damage per minute split by type (shares of its own
 * total), the scores against the highest of all champions. Missing keys stay out (never 0).
 */
export function teamProfile(
  champion: TierChampion,
  all: TierChampion[],
): { damage: ProfileBar[]; scores: ProfileBar[] } {
  const damageTotal = DAMAGE_KEYS.reduce((sum, key) => sum + (champion.comp[key] ?? 0), 0);
  const damage = DAMAGE_KEYS.flatMap((key) => {
    const value = champion.comp[key];
    return value === undefined || damageTotal <= 0
      ? []
      : [{ key, value, share: value / damageTotal }];
  });
  const scores = SCORE_KEYS.flatMap((key) => {
    const value = champion.comp[key];
    const most = Math.max(0, ...all.map((c) => c.comp[key] ?? 0));
    return value === undefined ? [] : [{ key, value, share: most > 0 ? value / most : 0 }];
  });
  return { damage, scores };
}

/** arammeta's own (English) label of an augment category; the id when it has none. */
export const categoryName = (lists: Pick<TierLists, 'categories'>, id: string) =>
  lists.categories.find((c) => c.id === id)?.label ?? id;

/** The categories some augment has, in arammeta's order. */
export const usedCategories = (lists: Pick<TierLists, 'categories' | 'augments'>) =>
  lists.categories.filter((c) => lists.augments.some((a) => a.cats.includes(c.id)));

/** A share difference in percentage points with one decimal, like "+2.3" or "−1.4". */
export const signedPoints = (difference: number) => {
  const points = Math.round(difference * 1000) / 10;
  const sign = points > 0 ? '+' : points < 0 ? '−' : '±';
  return `${sign}${Math.abs(points).toLocaleString('en-US', { minimumFractionDigits: 1 })}`;
};

/** The champions that have the augment among their best, surest high win rate first. */
export function championsWithAugment(champions: TierChampion[], augmentId: number) {
  return champions
    .flatMap((champion) => {
      const entry = champion.top.find((a) => a.id === augmentId);
      return entry ? [{ champion, entry }] : [];
    })
    .sort(
      (a, b) =>
        pulled(b.entry.winRate, b.entry.games) - pulled(a.entry.winRate, a.entry.games) ||
        b.entry.games - a.entry.games,
    );
}

/** The tier lists from arammeta.com; the browser preview shows invented ones (mock.ts). */
export async function loadTiers(): Promise<TierLists> {
  if (!isTauri()) return { ...readTiers(MOCK_TIERS)!, mock: true };
  const lists = readTiers(await invoke<unknown>('mayhem_tiers'));
  if (!lists) throw new Error('The list arrived incomplete.');
  return lists;
}
