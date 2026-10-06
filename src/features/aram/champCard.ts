// Champ-Karte (user's wish): for the champion held in an ARAM Mayhem champion select, the best
// augments and item builds from the website's games (mayhemstats.lol, /api/champions/<id>; only
// our own raw Mayhem games). Always several choices with their numbers, never one prescription
// (Riot: apps may highlight choices, not dictate them). Mana items count against a build (user's
// rule: mana is useless in ARAM). Pure, tested in champCard.test.ts.
import type { ChampInfo, ChampItem } from '../../adapters/aramChamp';
import { gradeOf, type Grade } from './aramPerformance';

/** Shown per list. */
export const AUGMENTS_SHOWN = 5;
export const BUILDS_SHOWN = 3;
/** A grade needs this many graded games (as on the website). */
export const MIN_GRADED = 5;
/** A build core needs this many games. */
export const MIN_BUILD_GAMES = 2;
/** Few games pull a value towards the middle (0.5) as if this many average games were added. */
export const PRIOR = 10;
/** Each mana item lowers a build's score by this much (percentile, 0–1). */
export const MANA_PENALTY = 0.08;
/** Items in a build core. */
export const CORE_SIZE = 3;

/**
 * Items whose main effect does nothing in ARAM Mayhem (user's wish "Items, die komplett useless
 * sind, wie Umbral"): never part of a suggested build, whatever their numbers. By Data Dragon id;
 * the reason is for the next person who edits the list.
 */
export const USELESS_ITEMS: Readonly<Record<number, string>> = {
  3179: 'Umbral Glaive: der Effekt deckt Wards auf und zerstört sie, in ARAM gibt es keine',
  1101: 'Jungle-Begleiter: nur für Monster im Dschungel, den es in ARAM nicht gibt',
  1102: 'Jungle-Begleiter: nur für Monster im Dschungel, den es in ARAM nicht gibt',
  1103: 'Jungle-Begleiter: nur für Monster im Dschungel, den es in ARAM nicht gibt',
  3865: 'Support-Questitem: lebt von Gold aus Vasallen einer Lane mit Partner und von Wards',
  3866: 'Support-Questitem: lebt von Gold aus Vasallen einer Lane mit Partner und von Wards',
  3867: 'Support-Questitem: lebt von Gold aus Vasallen einer Lane mit Partner und von Wards',
  3869: 'Support-Questitem (Ausbaustufe): Quest und Ward-Effekt greifen in ARAM nicht',
  3870: 'Support-Questitem (Ausbaustufe): Quest und Ward-Effekt greifen in ARAM nicht',
  3871: 'Support-Questitem (Ausbaustufe): Quest und Ward-Effekt greifen in ARAM nicht',
  3876: 'Support-Questitem (Ausbaustufe): Quest und Ward-Effekt greifen in ARAM nicht',
  3877: 'Support-Questitem (Ausbaustufe): Quest und Ward-Effekt greifen in ARAM nicht',
};

export type AugmentInfo = { name: string; rarity: string; icon: boolean };

export type AugmentPick = {
  id: number;
  name: string;
  rarity: string;
  /** The website has a picture of it. */
  icon: boolean;
  games: number;
  winRate: number | null;
  grade: Grade | null;
};

export type BuildPick = {
  items: { id: number; name: string; mana: boolean }[];
  games: number;
  winRate: number;
  grade: Grade | null;
  /** Mana items in it (they lower its place). */
  mana: number;
};

export type ChampView = {
  championId: number;
  alias: string;
  name: string;
  /** Counted games of the champion on the website. */
  games: number;
  augments: AugmentPick[];
  builds: BuildPick[];
  /** Build directions with enough games, most played first: the user picks one before the game. */
  plans: BuildPlan[];
};

/** Where a build goes. */
export type Direction = 'ap' | 'ad' | 'tank';
export const DIRECTIONS: readonly Direction[] = ['ap', 'ad', 'tank'];
export const DIRECTION_LABEL: Record<Direction, string> = { ap: 'AP', ad: 'AD', tank: 'Tank' };
/** A direction needs this many games of the champion to be offered. */
export const MIN_DIRECTION_GAMES = 3;
/** An augment needs this many games in a direction for its own tier there (else: general). */
export const MIN_AUGMENT_GAMES = 2;
/** A transform augment ("Umwandler"): enough games, mostly in a direction the champion rarely goes. */
export const TURN_GAMES = 4;
export const TURN_SHARE = 0.6;
export const TURN_BASE = 0.35;
/** Augments listed per direction on the card (all of them are tiered for the game). */
export const PLAN_AUGMENTS_SHOWN = 6;
export const PLAN_BUILDS_SHOWN = 2;

/** Tiers as on the website's tier list (src/tiers.ts there): by place among the ranked rows. */
export const TIERS = ['S', 'A', 'B', 'C', 'D'] as const;
export type Tier = (typeof TIERS)[number];
const CUTS: Record<Tier, number> = { S: 0.1, A: 0.3, B: 0.7, C: 0.9, D: 1 };

export type TieredAugment = {
  id: number;
  name: string;
  rarity: string;
  icon: boolean;
  tier: Tier;
  /** Ø percentile in this direction, pulled to the augment's general value when few. */
  score: number;
  /** Games of the champion with it in this direction. */
  games: number;
  /** Too few games in this direction: the tier rests on the augment's general value. */
  general: boolean;
  /** A transform augment towards this direction (it is played mostly there). */
  turns: Direction | null;
};

export type BuildPlan = {
  direction: Direction;
  games: number;
  /** Share of the champion's games with a clear direction. */
  share: number;
  builds: BuildPick[];
  /** Every augment of the champion with a value, best first (the game ranks offers by this). */
  augments: TieredAugment[];
};

type AugmentRow = {
  id: number;
  games: number;
  winRate: number | null;
  graded: number;
  pct: number | null;
};
type BuildGame = { augments: number[]; items: number[]; win: boolean; pct: number | null };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown) =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1e9 ? (v as number) : null;
const share = (v: unknown) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : null);
const ids = (v: unknown) =>
  Array.isArray(v) && v.length <= 12 && v.every((x) => Number.isInteger(x) && x >= 0 && x < 1e7)
    ? (v as number[])
    : null;

/** The champion of the website's answer, checked; null if anything does not fit. */
export function parseChampion(text: string | null) {
  if (!text) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(json) || !isObject(json.champion)) return null;
  const c = json.champion;
  const games = count(c.games);
  if (games === null || !Array.isArray(c.augments) || !Array.isArray(c.builds)) return null;
  const augments: AugmentRow[] = [];
  for (const a of c.augments) {
    if (!isObject(a)) return null;
    const id = count(a.id);
    const n = count(a.games);
    const graded = count(a.graded);
    if (id === null || n === null || graded === null) return null;
    augments.push({ id, games: n, graded, winRate: share(a.winRate), pct: share(a.pct) });
  }
  const builds: BuildGame[] = [];
  for (const b of c.builds) {
    if (!isObject(b) || typeof b.win !== 'boolean') return null;
    const aug = ids(b.augments);
    const items = ids(b.items);
    if (!aug || !items) return null;
    builds.push({ augments: aug, items, win: b.win, pct: share(b.pct) });
  }
  return { games, augments, builds };
}

/** Names and rarity of the augments (website's /api/augments), checked. */
export function parseAugments(text: string | null): Map<number, AugmentInfo> {
  const out = new Map<number, AugmentInfo>();
  if (!text) return out;
  try {
    const json: unknown = JSON.parse(text);
    if (!isObject(json) || !isObject(json.augments)) return out;
    for (const [id, a] of Object.entries(json.augments)) {
      if (!/^[0-9]{1,7}$/.test(id) || !isObject(a) || typeof a.name !== 'string') continue;
      out.set(Number(id), {
        name: a.name.slice(0, 80),
        rarity: typeof a.rarity === 'string' ? a.rarity : '',
        icon: a.icon === true,
      });
    }
  } catch {
    return out;
  }
  return out;
}

/** A percentile from few games, pulled towards the middle. */
export const shrunk = (pct: number, games: number) => (pct * games + 0.5 * PRIOR) / (games + PRIOR);

/** The best augments: by Ø grade over enough graded games (pulled to the middle when few). */
export function bestAugments(rows: AugmentRow[], names: Map<number, AugmentInfo>): AugmentPick[] {
  return rows
    .filter((r) => r.pct !== null && r.graded >= MIN_GRADED)
    .map((r) => ({ row: r, score: shrunk(r.pct as number, r.graded) }))
    .sort((a, b) => b.score - a.score || b.row.games - a.row.games || a.row.id - b.row.id)
    .slice(0, AUGMENTS_SHOWN)
    .map(({ row }) => ({
      id: row.id,
      name: names.get(row.id)?.name ?? `Augment ${row.id}`,
      rarity: names.get(row.id)?.rarity ?? '',
      icon: names.get(row.id)?.icon ?? false,
      games: row.games,
      winRate: row.winRate,
      grade: row.pct === null ? null : gradeOf(row.pct),
    }));
}

/** All sets of `size` ids, each sorted. */
function subsets(list: number[], size: number): number[][] {
  const sorted = [...new Set(list)].sort((a, b) => a - b);
  const out: number[][] = [];
  const pick = (from: number, chosen: number[]) => {
    if (chosen.length === size) return void out.push(chosen);
    for (let i = from; i <= sorted.length - (size - chosen.length); i++)
      pick(i + 1, [...chosen, sorted[i]]);
  };
  pick(0, []);
  return out;
}

/**
 * The best cores of three finished items (what was in the inventory at the end; the order of
 * buying is not stored): Ø grade of their games, pulled to the middle when few, minus
 * MANA_PENALTY per mana item; without grades the win rate stands in. Items of USELESS_ITEMS never
 * take part.
 */
export function bestBuilds(games: BuildGame[], items: Record<string, ChampItem>): BuildPick[] {
  const by = new Map<string, { ids: number[]; games: BuildGame[] }>();
  for (const g of games) {
    const done = g.items.filter((id) => items[String(id)]?.done && !(id in USELESS_ITEMS));
    for (const set of subsets(done, CORE_SIZE)) {
      const key = set.join(',');
      const row = by.get(key) ?? { ids: set, games: [] };
      row.games.push(g);
      by.set(key, row);
    }
  }
  return [...by.values()]
    .filter((r) => r.games.length >= MIN_BUILD_GAMES)
    .map((r) => {
      const graded = r.games.filter((g) => g.pct !== null).map((g) => g.pct as number);
      const wins = r.games.filter((g) => g.win).length / r.games.length;
      const pct = graded.length ? graded.reduce((t, v) => t + v, 0) / graded.length : null;
      const mana = r.ids.filter((id) => items[String(id)]?.mana).length;
      const base = pct !== null ? shrunk(pct, graded.length) : shrunk(wins, r.games.length);
      return {
        score: base - MANA_PENALTY * mana,
        pick: {
          items: r.ids.map((id) => ({
            id,
            name: items[String(id)]?.name ?? `Item ${id}`,
            mana: !!items[String(id)]?.mana,
          })),
          games: r.games.length,
          winRate: wins,
          grade: pct !== null && graded.length >= MIN_GRADED ? gradeOf(pct) : null,
          mana,
        },
      };
    })
    .sort((a, b) => b.score - a.score || b.pick.games - a.pick.games)
    .slice(0, BUILDS_SHOWN)
    .map((r) => r.pick);
}

/** The direction of a game: the kind of most of its finished items (two at least, no tie). */
export function directionOf(items: number[], known: Record<string, ChampItem>): Direction | null {
  const count: Record<Direction, number> = { ap: 0, ad: 0, tank: 0 };
  for (const id of new Set(items)) {
    const it = known[String(id)];
    if (!it?.done || id in USELESS_ITEMS || it.kind === 'other') continue;
    count[it.kind] += 1;
  }
  const ranked = DIRECTIONS.map((d) => [d, count[d]] as const).sort((a, b) => b[1] - a[1]);
  return ranked[0][1] >= 2 && ranked[0][1] > ranked[1][1] ? ranked[0][0] : null;
}

/** Rows (best first) by place into the five tiers; equal scores share the tier of the first. */
function tiered<T extends { score: number }>(rows: T[]): (T & { tier: Tier })[] {
  return rows.map((row, i) => {
    const first = rows.findIndex((r) => r.score === row.score);
    // Rows ahead of it, as a share: the best is always S, even in a short list.
    const ahead = Math.min(i, first) / rows.length;
    return { ...row, tier: TIERS.find((t) => ahead < CUTS[t])! };
  });
}

const mean = (list: number[]) => list.reduce((t, v) => t + v, 0) / list.length;

/**
 * The build directions of a champion and, for each, every augment in a tier S–D (user's wish:
 * pick the build before the game, then all augments are ranked for it, "AP-Alistar: Stormsurge,
 * AP-Augments S"). An augment's value in a direction is the Ø percentile of the direction's games
 * with it, pulled towards its general value on the champion (itself pulled to the middle) when
 * few. A transform augment is one played mostly in a direction the champion rarely goes.
 */
export function buildPlans(
  games: BuildGame[],
  items: Record<string, ChampItem>,
  names: Map<number, AugmentInfo>,
): BuildPlan[] {
  const graded = games.filter((g): g is BuildGame & { pct: number } => g.pct !== null);
  const dir = new Map(graded.map((g) => [g, directionOf(g.items, items)]));
  const directed = graded.filter((g) => dir.get(g) !== null);
  if (!directed.length) return [];
  const base = Object.fromEntries(
    DIRECTIONS.map((d) => [d, directed.filter((g) => dir.get(g) === d).length / directed.length]),
  ) as Record<Direction, number>;

  // Per augment: all graded games of the champion with it, and those per direction.
  const augs = new Map<number, { all: number[]; by: Record<Direction, number[]> }>();
  for (const g of graded)
    for (const id of new Set(g.augments)) {
      const row = augs.get(id) ?? { all: [], by: { ap: [], ad: [], tank: [] } };
      row.all.push(g.pct);
      const d = dir.get(g);
      if (d) row.by[d].push(g.pct);
      augs.set(id, row);
    }
  const turnsOf = (row: { by: Record<Direction, number[]> }): Direction | null => {
    const n = DIRECTIONS.reduce((t, d) => t + row.by[d].length, 0);
    if (n < TURN_GAMES) return null;
    return (
      DIRECTIONS.find((d) => row.by[d].length / n >= TURN_SHARE && base[d] <= TURN_BASE) ?? null
    );
  };

  return DIRECTIONS.filter(
    (d) => directed.filter((g) => dir.get(g) === d).length >= MIN_DIRECTION_GAMES,
  )
    .map((d) => {
      const own = directed.filter((g) => dir.get(g) === d);
      const rows = [...augs.entries()]
        .map(([id, row]) => {
          const general = shrunk(mean(row.all), row.all.length);
          const here = row.by[d];
          const score = here.length
            ? (mean(here) * here.length + general * PRIOR) / (here.length + PRIOR)
            : general;
          return {
            id,
            name: names.get(id)?.name ?? `Augment ${id}`,
            rarity: names.get(id)?.rarity ?? '',
            icon: names.get(id)?.icon ?? false,
            score,
            games: here.length,
            general: here.length < MIN_AUGMENT_GAMES,
            turns: turnsOf(row),
          };
        })
        .sort((a, b) => b.score - a.score || b.games - a.games || a.id - b.id);
      return {
        direction: d,
        games: own.length,
        share: base[d],
        builds: bestBuilds(own, items).slice(0, PLAN_BUILDS_SHOWN),
        augments: tiered(rows),
      };
    })
    .sort((a, b) => b.games - a.games);
}

/** The card for a champion; null when the website's answer does not fit. A champion without
 * games on the website gets a card with empty lists (the card says so). */
export function champView(
  champ: { championId: number; alias: string; name: string },
  info: ChampInfo,
): ChampView | null {
  const names = parseAugments(info.augments);
  if (info.champion === null) return { ...champ, games: 0, augments: [], builds: [], plans: [] };
  const parsed = parseChampion(info.champion);
  if (!parsed) return null;
  return {
    ...champ,
    games: parsed.games,
    augments: bestAugments(parsed.augments, names),
    builds: bestBuilds(parsed.builds, info.items),
    plans: buildPlans(parsed.builds, info.items, names),
  };
}
