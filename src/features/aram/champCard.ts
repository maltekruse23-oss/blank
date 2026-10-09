// Champ-Karte (user's wish): for the champion held in an ARAM Mayhem champion select, the best
// augments and item builds. Source: arammeta.com (user's choice 06.10.2026: open JSON of an
// MIT-licensed project, ARAM Mayhem only, far more games), else the website's own games
// (mayhemstats.lol, /api/champions/<id>). The card names its source; numbers of the two are never
// added together. Only a build direction arammeta has no item core for (e.g. AP-Alistar, user's
// choice 07.10.2026) takes the website's direction instead, and the card names that source there.
// Offmeta builds and Mayhem-Combos come from the Offmeta-System (combos.ts).
// Always several choices with their numbers, never one prescription
// (Riot: apps may highlight choices, not dictate them). Mana items count against a build (user's
// rule: mana is useless in ARAM). Pure, tested in champCard.test.ts.
import type { ChampInfo, ChampItem, MetaAugment } from '../../adapters/aramChamp';
import { gradeOf, type Grade } from './aramPerformance';
import {
  combosFor,
  CORE_SIZE,
  MANA_PENALTY,
  offmetaBuild,
  pulled,
  USELESS_ITEMS,
  type Combo,
  type ItemTexts,
} from './combos';
import { number, percent, type Lang } from './format';

// The engine behind offmeta builds and combos lives in combos.ts (Offmeta-System).
export {
  CORE_SIZE,
  MANA_PENALTY,
  META_PRIOR,
  OFFMETA_MARGIN,
  OFFMETA_MIN_GAMES,
  offmetaBuild,
  USELESS_ITEMS,
} from './combos';

/** Where the card's numbers come from, as the card names it. */
export const sourceLabel = (view: { source: 'arammeta' | 'mayhemstats'; patch: string | null }) =>
  view.source === 'arammeta'
    ? `arammeta.com${view.patch ? `, Patch ${view.patch}` : ''}`
    : 'mayhemstats.lol';

/** Champion of "Testen" (settings) and "Beispiel" (Mayhem app): the user's own example, AP-Alistar. */
export const SAMPLE_CHAMP = { championId: 12, alias: 'Alistar', name: 'Alistar' } as const;

/** Shown per list. */
export const AUGMENTS_SHOWN = 5;
export const BUILDS_SHOWN = 3;
/** A grade needs this many graded games (as on the website). */
export const MIN_GRADED = 5;
/** A build core needs this many games. */
export const MIN_BUILD_GAMES = 2;
/** Few games pull a value towards the middle (0.5) as if this many average games were added. */
export const PRIOR = 10;

export type AugmentInfo = { name: string; rarity: string; icon: boolean };

export type AugmentPick = {
  id: number;
  name: string;
  rarity: string;
  /** The website has a picture of it. */
  icon: boolean;
  /** Its picture (website or arammeta), if there is one. */
  image: string | null;
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
  /** arammeta only: the name of its core group ("Tank / Heartsteel") and the items its games
   * built later, without numbers of their own (useless ones left out). */
  label?: string;
  later?: { id: number; name: string; mana: boolean }[];
  /** Offmeta (`offmetaBuild`): put together from single items, each with its own numbers on the
   * champion; the build as a whole was never measured. */
  assembled?: { games: number; winRate: number }[];
};

export type ChampView = {
  championId: number;
  alias: string;
  name: string;
  /** Counted games of the champion at the source. */
  games: number;
  /** Where the numbers come from; arammeta with its patch. */
  source: 'arammeta' | 'mayhemstats';
  patch: string | null;
  augments: AugmentPick[];
  builds: BuildPick[];
  /** Build directions with enough games, most played first: the user picks one before the game. */
  plans: BuildPlan[];
  /** Everything else arammeta has per champion (boots, single items, pairs, spells, augments and
   * augment kinds to avoid); only with arammeta as source. */
  extra?: ChampExtra;
  /** In the game: the augments offered right now (read off the screen, offers.rs) and the build
   * chosen in the champion select; the card then shows them with their tier for that build. */
  offer?: Offer;
  /** Mayhem-Combos (combos.ts): themes of augments and items, Meta and Offmeta; arammeta only. */
  combos?: Combo[];
};

/** An item row of arammeta (boots, single items, pairs of two): its games and win rate. */
export type MetaItemPick = {
  items: { id: number; name: string; mana: boolean; kind: ChampItem['kind'] }[];
  games: number;
  winRate: number;
  /** Share of the champion's games with it. */
  pick: number | null;
};
export type SpellPick = {
  spells: { id: number; name: string; key: string }[];
  games: number;
  winRate: number;
  pick: number | null;
};
/** An augment arammeta ranks among the champion's weakest, with its numbers per pick (1st–4th). */
export type AvoidAugment = {
  id: number;
  name: string;
  rarity: string;
  image: string | null;
  games: number;
  winRate: number;
  slots: ({ games: number; winRate: number } | null)[];
};
/** A kind of augment (arammeta's "Health", "Size Up", …) with the champion's numbers. */
export type AugTypePick = { name: string; games: number; winRate: number; pick: number | null };
export type ChampExtra = {
  boots: MetaItemPick[];
  /** Single items that work best on the champion (mana ones last, never useless ones). */
  items: MetaItemPick[];
  /** Often bought, but weak on the champion ("beliebt, aber schwach"). */
  weak: MetaItemPick[];
  /** Two items that work well together. */
  pairs: MetaItemPick[];
  spells: SpellPick[];
  avoid: AvoidAugment[];
  augTypes: AugTypePick[];
  weakTypes: AugTypePick[];
};

export type Offer = {
  direction: Direction | null;
  augments: { id: number; name: string }[];
  /** Taken so far in this game, as far as known (shown only, ranks nothing). */
  taken: { id: number; name: string }[];
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
/**
 * At most this many places up to and including the tier (user's wish 07.10.2026: S was about 15
 * augments long and did not help to choose). Only the card; the website's tier list is unchanged.
 */
export const TIER_PLACES: Partial<Record<Tier, number>> = { S: 5, A: 15 };

export type TieredAugment = {
  id: number;
  name: string;
  rarity: string;
  icon: boolean;
  image: string | null;
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
  /** Share of the champion's games with a clear direction (at the card's main source). */
  share: number;
  /** Where this direction's numbers come from (the website when arammeta has no core for it). */
  source: 'arammeta' | 'mayhemstats';
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

/** Pictures of Mayhem augments on the website (Data Dragon has none). */
const siteImage = (id: number, icon: boolean) =>
  icon ? `https://mayhemstats.lol/api/augments/${id}.png` : null;

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
      image: siteImage(row.id, names.get(row.id)?.icon ?? false),
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
    const place = Math.min(i, first);
    const tier = TIERS.find(
      (t) => place < Math.min(CUTS[t] * rows.length, TIER_PLACES[t] ?? Infinity),
    )!;
    return { ...row, tier };
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
            image: siteImage(id, names.get(id)?.icon ?? false),
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
        source: 'mayhemstats' as const,
        builds: bestBuilds(own, items).slice(0, PLAN_BUILDS_SHOWN),
        augments: tiered(rows),
      };
    })
    .sort((a, b) => b.games - a.games);
}

/**
 * A line under the direction when its numbers are not the card's usual ones: taken from the
 * website, or arammeta has no games of that direction (its tiers then rest on all games).
 */
export function planNote(
  view: Pick<ChampView, 'source' | 'name' | 'alias'>,
  plan: BuildPlan,
  lang: Lang = 'de',
) {
  const dir = DIRECTION_LABEL[plan.direction];
  const n = number(plan.games, lang);
  if (lang === 'en') {
    const who = view.name || view.alias;
    if (plan.source !== view.source)
      return `arammeta.com has few ${dir} games. Core and augments come from mayhemstats.lol (${n} ${plan.games === 1 ? 'game' : 'games'}).`;
    if (plan.source === 'arammeta' && plan.builds.length && plan.builds.every((b) => b.assembled))
      return `Offmeta: arammeta.com has no full ${dir} build on ${who}. The core is the three best ${dir} items on ${who}, each measured on its own.`;
    if (plan.source === 'arammeta' && !plan.builds.length)
      return `arammeta.com has few ${dir} games on ${who}. The tiers rest on all games, ${dir} augments rank higher.`;
    return null;
  }
  if (plan.source !== view.source)
    return `Für ${dir} hat arammeta.com kaum Spiele. Kern und Augments kommen von mayhemstats.lol (${n} ${plan.games === 1 ? 'Spiel' : 'Spiele'}).`;
  if (plan.source === 'arammeta' && plan.builds.length && plan.builds.every((b) => b.assembled))
    return `Offmeta: arammeta.com hat keinen ganzen ${dir}-Build mit ${view.name || view.alias}. Der Kern sind die drei besten ${dir}-Items auf ihm, jedes einzeln gemessen.`;
  if (plan.source === 'arammeta' && !plan.builds.length)
    return `arammeta.com hat kaum ${dir}-Spiele mit ${view.name || view.alias}. Die Stufen beruhen auf allen Spielen, passende Augments stehen höher.`;
  return null;
}

/**
 * The item set written into the client for a direction (MAYHEM-BERATER.md 6a): the core of its
 * best build, arammeta's top boots as their own block, then the further items of its other builds
 * and arammeta's best single items of that direction; mana items only when the core has them.
 * Useless items never come here (`bestBuilds` and `metaExtra` leave them out). Null without a build.
 * Without a direction (a combo in the Mayhem app, src/mayhem/builds.ts): no single items.
 */
export function itemSetOf(
  plan: { direction?: Direction; builds: Pick<BuildPick, 'items' | 'mana'>[] },
  extra?: Pick<ChampExtra, 'boots' | 'items'>,
): ItemSet | null {
  const [best, ...rest] = plan.builds;
  if (!best) return null;
  const core = best.items.map((i) => i.id);
  const manaOk = best.mana > 0;
  // After the other cores: arammeta's best single items of the direction's kind.
  const singles = (extra?.items ?? []).flatMap((p) =>
    p.items.filter((i) => i.kind === plan.direction),
  );
  const more = [
    ...new Set(
      [...rest.flatMap((b) => b.items), ...singles]
        .filter((i) => manaOk || !i.mana)
        .map((i) => i.id),
    ),
  ]
    .filter((id) => !core.includes(id))
    .slice(0, SET_MORE);
  const boots = (extra?.boots ?? []).slice(0, SET_BOOTS).map((b) => b.items[0].id);
  return { core, boots, more };
}

export type ItemSet = { core: number[]; boots: number[]; more: number[] };
/** Items after the core, and boots, in the item set (Rust `item_set` takes at most 12 and 4). */
export const SET_MORE = 12;
export const SET_BOOTS = 3;

/**
 * The offered augments with their tier in the build (null: the champion's games have none with
 * it), in the order of the cards; the name the client shows when there is no row.
 */
export function offerRows(plan: BuildPlan, offer: Offer) {
  return offer.augments.map(
    (o) => plan.augments.find((a) => a.id === o.id) ?? { ...o, tier: null, missing: true as const },
  );
}

/** The card for a champion; null when the website's answer does not fit. A champion without
 * games on the website gets a card with empty lists (the card says so). */
export function champView(
  champ: { championId: number; alias: string; name: string },
  info: ChampInfo,
): ChampView | null {
  const meta = info.meta && metaView(champ, info.meta, info.items);
  const names = parseAugments(info.augments);
  const parsed = info.champion === null ? null : parseChampion(info.champion);
  if (meta) {
    // A direction without an item core at arammeta (none of its games go there): the website's
    // games of that direction, if it has enough; arammeta's share stays on the tab.
    const site = parsed ? buildPlans(parsed.builds, info.items, names) : [];
    // An offmeta build from arammeta's single items stays beside the website's games, never added.
    const plans = meta.plans.map((p) => {
      const measured = p.builds.filter((b) => !b.assembled);
      const own = measured.length ? null : site.find((s) => s.direction === p.direction);
      return own ? { ...own, share: p.share, builds: [...own.builds, ...p.builds] } : p;
    });
    return { ...meta, plans };
  }
  const site = { source: 'mayhemstats', patch: null } as const;
  if (info.champion === null)
    return { ...champ, ...site, games: 0, augments: [], builds: [], plans: [] };
  if (!parsed) return null;
  return {
    ...champ,
    ...site,
    games: parsed.games,
    augments: bestAugments(parsed.augments, names),
    builds: bestBuilds(parsed.builds, info.items),
    plans: buildPlans(parsed.builds, info.items, names),
  };
}

// --- arammeta.com ---

/** arammeta's augments of a champion from fewer games than this are left out. */
export const META_MIN_GAMES = 30;
/**
 * arammeta does not split augments by build direction; an augment of the direction's category
 * (arammeta's "ap", "ad", "tank") counts this much win rate more, one of another direction this
 * much less (user's rule: AP-Alistar, AP augments first; 07.10.2026: 0.03 left tank augments like
 * Icathia's Fall on top for AP). Augments without a direction (cooldown, amp, mechanic) stay.
 */
export const CATEGORY_BONUS = 0.06;
/** Item options per core read from a group. */
const META_OPTIONS = 4;

type MetaRow = { id: number; g: number; wr: number };
type MetaGroup = {
  core: number[];
  g: number;
  wr: number;
  options: MetaRow[];
  label: string;
  tail: number[];
};

const RARITY: Record<string, string> = {
  kSilver: 'silver',
  kGold: 'gold',
  kPrismatic: 'prismatic',
};

/** Only icons in arammeta's own icon folder. */
export const metaImage = (icon: string) =>
  /^assets\/icons\/[a-z0-9_.-]{1,80}\.png$/i.test(icon) && !icon.includes('..')
    ? `https://arammeta.com/${icon}`
    : null;

const metaRow = (v: unknown): MetaRow | null => {
  if (!isObject(v)) return null;
  const id = count(v.id);
  const g = count(v.g);
  const wr = share(v.wr);
  return id === null || g === null || wr === null ? null : { id, g, wr };
};

/** arammeta's champion file, checked; null if anything does not fit. */
export function parseMeta(text: string | null) {
  if (!text) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(json) || !Array.isArray(json.poolAugments) || json.poolAugments.length > 400)
    return null;
  const pool: (MetaRow & { pick: number | null })[] = [];
  for (const a of json.poolAugments) {
    const row = metaRow(a);
    if (!row) return null;
    // The share of the champion's games with it (Meta or Offmeta of a combo); odd: unknown.
    pool.push({ ...row, pick: isObject(a) ? share(a.pick) : null });
  }
  const groups: MetaGroup[] = [];
  const clusters = isObject(json.itemClusters) ? json.itemClusters.groups : [];
  if (!Array.isArray(clusters) || clusters.length > 50) return null;
  for (const c of clusters) {
    if (!isObject(c) || !Array.isArray(c.core) || !Array.isArray(c.options)) return null;
    const core = c.core.map((i) => (isObject(i) ? count(i.id) : null));
    const g = count(c.g);
    const wr = share(c.wr);
    if (core.some((id) => id === null) || core.length > 6 || g === null || wr === null) return null;
    const options: MetaRow[] = [];
    for (const o of c.options.slice(0, 40)) {
      const row = metaRow(o);
      if (!row) return null;
      options.push(row);
    }
    // Name and later items are extras: missing or odd, the group stays without them.
    const label = typeof c.name_en === 'string' ? c.name_en.slice(0, 60) : '';
    const tail = Array.isArray(c.tail) ? c.tail.slice(0, 6).map(idOf) : [];
    groups.push({
      core: core as number[],
      g,
      wr,
      options,
      label,
      tail: tail.every((id) => id !== null) ? (tail as number[]) : [],
    });
  }
  return { pool, groups, extra: parseExtra(json) };
}

const idOf = (v: unknown) => (isObject(v) ? count(v.id) : null);
const pickOf = (v: unknown) => (v === undefined ? null : share(v));
/** A list of at most `max` rows, each read by `read`; empty when the list or any row does not fit. */
function rowsOf<T>(v: unknown, max: number, read: (row: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(v) || v.length > max) return [];
  const out: T[] = [];
  for (const row of v) {
    const r = isObject(row) ? read(row) : null;
    if (r === null) return [];
    out.push(r);
  }
  return out;
}
type ExtraRow = { ids: number[]; g: number; wr: number; pick: number | null };
const extraRow = (size: number) => (r: Record<string, unknown>) => {
  const g = count(r.g);
  const wr = share(r.wr);
  const pick = pickOf(r.pick);
  const list = Array.isArray(r.items) && r.items.length === size ? r.items.map(idOf) : null;
  if (g === null || wr === null || (r.pick !== undefined && pick === null) || !list) return null;
  return list.every((id) => id !== null) ? { ids: list as number[], g, wr, pick } : null;
};
type TypeRow = { name: string; g: number; wr: number; pick: number | null };
const typeRow = (r: Record<string, unknown>): TypeRow | null => {
  const g = count(r.g);
  const wr = share(r.wr);
  const pick = pickOf(r.pick);
  if (typeof r.name_en !== 'string' || !r.name_en || g === null || wr === null) return null;
  return r.pick !== undefined && pick === null
    ? null
    : { name: r.name_en.slice(0, 60), g, wr, pick };
};
type BotRow = MetaRow & { slots: ({ g: number; wr: number } | null)[] };
const botRow = (r: Record<string, unknown>): BotRow | null => {
  const row = metaRow(r);
  if (!row || (r.slots !== undefined && (!Array.isArray(r.slots) || r.slots.length > 4)))
    return null;
  const slots = ((r.slots as unknown[] | undefined) ?? []).map((s) => {
    if (s === null) return null;
    const g = isObject(s) ? count(s.g) : null;
    const wr = isObject(s) ? share(s.wr) : null;
    return g === null || wr === null ? undefined : { g, wr };
  });
  return slots.includes(undefined)
    ? null
    : { ...row, slots: slots as ({ g: number; wr: number } | null)[] };
};

/**
 * Everything else in arammeta's champion file (08.10.2026, user: "alle Daten von arammeta"): its
 * best and weakest boots, single items and pairs of items, summoner spells, the weakest augments
 * per rarity and the augment kinds that work or not. Each part on its own: a part that does not fit
 * is left empty, the card keeps the rest. `sets` (augment set bonuses) has always been empty so far
 * and is not read.
 */
export function parseExtra(json: Record<string, unknown>) {
  const part = (key: string) => {
    const v = json[key];
    return isObject(v) ? v : {};
  };
  const bot = part('bot');
  return {
    boots: rowsOf(part('boots').top, 50, extraRow(1)),
    items: rowsOf(part('singleItems').top, 50, extraRow(1)),
    weak: [
      ...rowsOf(part('singleItems').popularBad, 50, extraRow(1)),
      ...rowsOf(part('singleItems').bot, 50, extraRow(1)),
    ],
    pairs: rowsOf(part('items').top, 50, extraRow(2)),
    spells: rowsOf(part('spells').top, 50, extraRow(2)),
    avoid: ['kPrismatic', 'kGold', 'kSilver'].flatMap((rarity) =>
      rowsOf(bot[rarity], 50, botRow).map((r) => ({ ...r, rarity: RARITY[rarity] })),
    ),
    augTypes: rowsOf(part('augTypes').top, 50, typeRow),
    weakTypes: rowsOf(part('augTypes').bot, 50, typeRow),
  };
}

/** How an augment of these categories fits a direction: 1 its own, -1 another one, 0 neither. */
export const fitOf = (cats: string[], d: Direction) =>
  cats.includes(d) ? 1 : DIRECTIONS.some((o) => o !== d && cats.includes(o)) ? -1 : 0;

/** The card from arammeta's numbers; null when its champion file is missing or does not fit. */
export function metaView(
  champ: { championId: number; alias: string; name: string },
  meta: {
    patch: string;
    games: number | null;
    champion: string | null;
    augments: Record<string, MetaAugment>;
    items?: ItemTexts;
  },
  items: Record<string, ChampItem>,
): ChampView | null {
  const parsed = parseMeta(meta.champion);
  if (!parsed) return null;
  const info = (id: number) => {
    const a = meta.augments[String(id)];
    return {
      name: a?.name ? a.name.slice(0, 80) : `Augment ${id}`,
      rarity: RARITY[a?.rarity ?? ''] ?? '',
      image: a ? metaImage(a.icon) : null,
      cats: a?.cats ?? [],
    };
  };
  const item = (id: number) => ({
    id,
    name: items[String(id)]?.name ?? `Item ${id}`,
    mana: !!items[String(id)]?.mana,
  });
  const usable = (id: number) => !(id in USELESS_ITEMS);

  // Each core group of items with its direction (from the core and its most played options).
  const groups = parsed.groups
    .filter((g) => g.core.every(usable))
    .map((g) => ({
      ...g,
      direction: directionOf([...g.core, ...g.options.slice(0, 3).map((o) => o.id)], items),
    }));
  const total = groups.reduce((t, g) => t + g.g, 0);
  const builds = (list: typeof groups): BuildPick[] =>
    list
      .flatMap((g) =>
        g.options
          .filter((o) => usable(o.id) && !g.core.includes(o.id))
          .slice(0, META_OPTIONS)
          .map((o) => {
            const ids = [...g.core, o.id];
            const mana = ids.filter((id) => items[String(id)]?.mana).length;
            return {
              score: pulled(o.wr, o.g) - MANA_PENALTY * mana,
              pick: {
                items: ids.map(item),
                games: o.g,
                winRate: o.wr,
                grade: null,
                mana,
                label: g.label,
                later: g.tail.filter((id) => usable(id) && !ids.includes(id)).map(item),
              },
            };
          }),
      )
      .sort((a, b) => b.score - a.score || b.pick.games - a.pick.games)
      .slice(0, PLAN_BUILDS_SHOWN)
      .map((b) => b.pick);

  const mainRate = total ? groups.reduce((t, g) => t + g.wr * g.g, 0) / total : null;
  const pool = parsed.pool.filter((a) => a.g >= META_MIN_GAMES);
  const known = pool.length > 0 || groups.length > 0;
  const plans: BuildPlan[] = (known ? DIRECTIONS : [])
    .map((d) => {
      const own = groups.filter((g) => g.direction === d);
      const games = own.reduce((t, g) => t + g.g, 0);
      const rows = pool
        .map((a) => {
          const { cats, ...shown } = info(a.id);
          const fits = fitOf(cats, d);
          return {
            id: a.id,
            ...shown,
            icon: shown.image !== null,
            score: pulled(a.wr, a.g) + CATEGORY_BONUS * fits,
            games: a.g,
            general: false,
            turns: null,
          };
        })
        .sort((a, b) => b.score - a.score || b.games - a.games || a.id - b.id);
      return {
        direction: d,
        games,
        share: total ? games / total : 0,
        source: 'arammeta' as const,
        builds: own.length
          ? builds(own)
          : [
              offmetaBuild(d, [...parsed.extra.items, ...parsed.extra.weak], items, mainRate),
            ].filter((b): b is BuildPick => b !== null),
        // Rounded once ranked: the card goes to the popout whole (flyout.rs takes ≤ 64 KB).
        augments: tiered(rows).map((r) => ({ ...r, score: Math.round(r.score * 1e4) / 1e4 })),
      };
    })
    .sort((a, b) => b.games - a.games);

  const best: AugmentPick[] = [...pool]
    .sort((a, b) => pulled(b.wr, b.g) - pulled(a.wr, a.g) || b.g - a.g)
    .slice(0, AUGMENTS_SHOWN)
    .map((a) => {
      const { cats: _cats, ...shown } = info(a.id);
      return {
        id: a.id,
        ...shown,
        icon: shown.image !== null,
        games: a.g,
        winRate: a.wr,
        grade: null,
      };
    });
  return {
    ...champ,
    games: meta.games ?? 0,
    source: 'arammeta',
    patch: meta.patch || null,
    augments: best,
    builds: builds(groups),
    plans,
    combos: combosFor({
      pool: parsed.pool,
      rows: [...parsed.extra.items, ...parsed.extra.weak],
      items,
      texts: meta.items ?? {},
      augments: meta.augments,
      info,
      offmeta: plans.filter(isOffmeta).map((p) => p.direction),
    }),
    // An augment the card ranks S or A for some direction is never also one to avoid.
    extra: metaExtra(
      parsed.extra,
      items,
      info,
      new Set([
        ...best.map((a) => a.id),
        ...plans.flatMap((p) =>
          p.augments.filter((a) => a.tier === 'S' || a.tier === 'A').map((a) => a.id),
        ),
      ]),
    ),
  };
}

/** A direction the champion rarely goes but that plays well (`offmetaBuild`). */
export const isOffmeta = (plan: BuildPlan) => plan.builds.some((b) => b.assembled);

/** The numbers of an offmeta build as the card names them: each item measured on its own. */
export function assembledFacts(b: BuildPick, lang: Lang = 'de') {
  if (!b.assembled?.length) return null;
  const g = b.assembled.map((a) => a.games);
  const [low, high] = [number(Math.min(...g), lang), number(Math.max(...g), lang)];
  const range = low === high ? low : `${low}–${high}`;
  return lang === 'en'
    ? `avg ${percent(b.winRate, lang)} wins · ${range} games per item`
    : `Ø ${percent(b.winRate)} Siege · ${range} Spiele je Item`;
}

/** An item's tooltip: mana marked, and its own numbers when the build is put together (offmeta). */
export function itemTitle(
  b: BuildPick,
  n: number,
  i: { name: string; mana: boolean },
  lang: Lang = 'de',
) {
  const own = b.assembled?.[n];
  if (lang === 'en')
    return `${i.name}${i.mana ? ' (mana, weak in ARAM)' : ''}${own ? `: ${percent(own.winRate, lang)} wins in ${number(own.games, lang)} games` : ''}`;
  const facts = own ? ` · ${number(own.games)} Spiele · ${percent(own.winRate)} Siege` : '';
  return `${i.name}${i.mana ? ' (Mana, in ARAM schwach)' : ''}${facts}`;
}

/** Rows shown per part of the extra data (the popout is small; the Mayhem app shows the same). */
export const EXTRA_SHOWN = {
  boots: 4,
  items: 12,
  weak: 6,
  pairs: 6,
  spells: 4,
  avoid: 4,
  types: 4,
};
/** Summoner spells the card names, by id: German name, Data Dragon key for the picture and English
 * name (the Mayhem app, `spellName`). */
export const SPELLS: Readonly<Record<number, readonly [string, string, string]>> = {
  1: ['Läuterung', 'SummonerBoost', 'Cleanse'],
  3: ['Erschöpfung', 'SummonerExhaust', 'Exhaust'],
  4: ['Blitz', 'SummonerFlash', 'Flash'],
  6: ['Geist', 'SummonerHaste', 'Ghost'],
  7: ['Heilen', 'SummonerHeal', 'Heal'],
  13: ['Klarheit', 'SummonerMana', 'Clarity'],
  14: ['Entzünden', 'SummonerDot', 'Ignite'],
  21: ['Barriere', 'SummonerBarrier', 'Barrier'],
  32: ['Markieren', 'SummonerSnowball', 'Mark'],
};
/** A spell's name by id in the language asked for; null for one the card does not know. */
export const spellName = (id: number, lang: Lang = 'de') =>
  SPELLS[id]?.[lang === 'en' ? 2 : 0] ?? null;
/** The numbers of a weak augment per pick (1st to 4th augment of the game), for its tooltip. */
export const slotsText = (slots: AvoidAugment['slots'], lang: Lang = 'de') =>
  slots
    .map((s, i) =>
      !s
        ? null
        : lang === 'en'
          ? `Pick ${i + 1}: ${percent(s.winRate, lang)} wins in ${number(s.games, lang)} games`
          : `Wahl ${i + 1}: ${s.games} Spiele, ${Math.round(s.winRate * 100)} % Siege`,
    )
    .filter(Boolean)
    .join('\n');
/** Never suggested (user's rule for ARAM Mayhem): Exhaust and Barrier. */
export const NEVER_SPELLS: readonly number[] = [3, 21];

/**
 * The card's extra data from arammeta (`parseExtra`), in arammeta's order: useless items never as
 * a suggestion and mana items last (they count against a build, marked), weak items only when not
 * among the best, spell pairs only of known spells and never with Exhaust or Barrier, the weakest
 * augments per rarity unless among the best (`best`: shown as best or ranked S/A on the card).
 * Always several rows with games and win rate.
 */
export function metaExtra(
  extra: ReturnType<typeof parseExtra>,
  items: Record<string, ChampItem>,
  info: (id: number) => { name: string; rarity: string; image: string | null },
  best: Set<number>,
): ChampExtra {
  const pick = (r: ExtraRow): MetaItemPick => ({
    items: r.ids.map((id) => ({
      id,
      name: items[String(id)]?.name ?? `Item ${id}`,
      mana: !!items[String(id)]?.mana,
      kind: items[String(id)]?.kind ?? 'other',
    })),
    games: r.g,
    winRate: r.wr,
    pick: r.pick,
  });
  const usable = (r: ExtraRow) => r.ids.every((id) => !(id in USELESS_ITEMS));
  const mana = (p: MetaItemPick) => p.items.filter((i) => i.mana).length;
  const suggest = (rows: ExtraRow[], n: number) =>
    rows
      .filter(usable)
      .map(pick)
      // Stable: arammeta's order, mana ones after.
      .sort((a, b) => mana(a) - mana(b))
      .slice(0, n);
  const top = new Set(extra.items.map((r) => r.ids[0]));
  const seen = new Set<number>();
  const weak = extra.weak
    .filter((r) => !top.has(r.ids[0]) && !seen.has(r.ids[0]) && !!seen.add(r.ids[0]))
    .slice(0, EXTRA_SHOWN.weak)
    .map(pick);
  const spells = extra.spells
    .filter((r) => r.ids.every((id) => id in SPELLS && !NEVER_SPELLS.includes(id)))
    .slice(0, EXTRA_SHOWN.spells)
    .map((r) => ({
      spells: r.ids.map((id) => ({ id, name: SPELLS[id][0], key: SPELLS[id][1] })),
      games: r.g,
      winRate: r.wr,
      pick: r.pick,
    }));
  const perRarity = new Map<string, number>();
  const avoid = extra.avoid
    .filter((a) => !best.has(a.id))
    .filter((a) => {
      const n = perRarity.get(a.rarity) ?? 0;
      perRarity.set(a.rarity, n + 1);
      return n < EXTRA_SHOWN.avoid;
    })
    .map((a) => ({
      id: a.id,
      name: info(a.id).name,
      image: info(a.id).image,
      rarity: a.rarity,
      games: a.g,
      winRate: a.wr,
      slots: a.slots.map((s) => s && { games: s.g, winRate: s.wr }),
    }));
  const type = (r: TypeRow): AugTypePick => ({
    name: r.name,
    games: r.g,
    winRate: r.wr,
    pick: r.pick,
  });
  const goodTypes = new Set(extra.augTypes.map((t) => t.name));
  return {
    boots: suggest(extra.boots, EXTRA_SHOWN.boots),
    items: suggest(extra.items, EXTRA_SHOWN.items),
    weak,
    pairs: suggest(extra.pairs, EXTRA_SHOWN.pairs),
    spells,
    avoid,
    augTypes: extra.augTypes.slice(0, EXTRA_SHOWN.types).map(type),
    weakTypes: extra.weakTypes
      .filter((t) => !goodTypes.has(t.name))
      .slice(0, EXTRA_SHOWN.types)
      .map(type),
  };
}
