// The build list of the Mayhem app's Champ page (user's decisions 09./10.10.2026): one list to
// choose a build from, first the measured meta cores, then the meta combos, then every offmeta
// build, the really good ones first; shown in three tabs Meta | Offmeta | Troll (`group`). No tier
// letter. Only a measured build has a win rate: combos and assembled builds were never measured as
// a whole (CLAUDE.md), their `winRate` is null. Builds that fit the augments taken in the game are
// highlighted (`takenMatches`). Pure, tested in builds.test.ts.
import {
  DIRECTION_LABEL,
  isOffmeta,
  itemSetOf,
  SET_MORE,
  type BuildPick,
  type BuildPlan,
  type ChampView,
  type ItemSet,
} from '../features/aram/champCard';
import {
  CORE_SIZE,
  DIRECTION_THEMES,
  META_ITEM_PICK,
  pulled,
  themeOf,
  themeText,
  type AugmentFacts,
  type Combo,
} from '../features/aram/combos';

type Item = { id: number; name: string; mana: boolean };
/** The tab of a build (user's decision 10.10.2026): Meta; Offmeta at least as good as the
 * champion's own win rate; Troll below it. */
export type BuildGroup = 'meta' | 'offmeta' | 'troll';
type Common = {
  /** Unique in the list, stable for the same build. */
  key: string;
  /** Unique in the list, English. */
  name: string;
  meta: boolean;
  group: BuildGroup;
  /** Sort key of the offmeta part only, never shown (not a win rate of the whole build). */
  quality: number | null;
  /** The core (a combo: its first three items) and the items after it. */
  items: Item[];
  later: Item[];
};
export type BuildEntry =
  | (Common & {
      /** 'site': a core from mayhemstats.lol's games (arammeta has none in that direction). */
      kind: 'core' | 'site';
      build: BuildPick;
      /** null: the card has no directions (its `builds` stand in). */
      plan: BuildPlan | null;
      winRate: number;
      games: number;
    })
  | (Common & {
      /** Put together from single items, each measured on its own (`offmetaBuild`). */
      kind: 'assembled';
      build: BuildPick;
      plan: BuildPlan;
      winRate: null;
      games: null;
    })
  | (Common & { kind: 'combo'; combo: Combo; winRate: null; games: null });

/** Longest set name (Rust `mayhem_item_set` takes 1–60 characters). */
export const SET_NAME = 60;
/** Longest core of an item set (Rust `set_of` takes 1–6 items). */
const SET_CORE = 6;

const BARE = new Set(Object.values(DIRECTION_LABEL).map((l) => l.toLowerCase()));
const ids = (items: Item[]) => items.map((i) => i.id).sort((a, b) => a - b);
const itemNames = (items: Item[]) => items.map((i) => i.name).join(' + ');
/** A build without a name of its own; never a bare "AP"/"AD"/"Tank" (user 09.10.2026). */
const firstBuild = (items: Item[]) => `${items[0]?.name ?? 'Item'} build`;
const mean = (list: number[]) => list.reduce((t, v) => t + v, 0) / list.length;

/** A combo's name: its theme's, a direction theme by its first item (never a bare "AP"). */
export function comboName(c: Combo) {
  const theme = themeOf(c.theme);
  return theme && !theme.direction ? themeText(theme, 'en').name : firstBuild(c.items);
}

/**
 * `known`: the champion's own win rate (arammeta's champion list); every sort key is pulled towards
 * it when few games (towards 50 %, a weak champion's rare builds rank first). An offmeta build below
 * it is Troll; unknown: 50 % for the order and no Troll (never against a guessed 50 %).
 */
export function buildList(view: ChampView, known?: number): BuildEntry[] {
  const base = known ?? 0.5;
  const combos = view.combos ?? [];
  // One scale for the offmeta order: each measured win rate pulled the same way, a build put
  // together by the Ø of its measured parts (single items, a combo's augments).
  const quality = (rows: { winRate: number; games: number }[]) =>
    mean(rows.map((r) => pulled(r.winRate, r.games, base)));
  const rank = (meta: boolean, q: number) => ({
    meta,
    group: (meta ? 'meta' : known !== undefined && q < known ? 'troll' : 'offmeta') as BuildGroup,
    quality: q,
  });
  // Meta: arammeta's measured cores. A website core beside them is offmeta (arammeta has none in
  // that direction); on a card from the website's games alone, a direction it goes in ≥ 20 %.
  const isMeta = (p: BuildPlan) =>
    !isOffmeta(p) &&
    p.source === view.source &&
    (p.source === 'arammeta' || p.share >= META_ITEM_PICK);
  const measured = (b: BuildPick, plan: BuildPlan | null, meta: boolean): BuildEntry => {
    const label = b.label?.trim() ?? '';
    const kind = plan && plan.source !== view.source ? 'site' : 'core';
    return {
      kind,
      key: `${kind}:${ids(b.items).join(',')}`,
      name: label && !BARE.has(label.toLowerCase()) ? label : itemNames(b.items),
      // Few games pull towards the base (a website core of 3 games would top the list otherwise).
      ...rank(meta, quality([b])),
      items: b.items,
      later: b.later ?? [],
      build: b,
      plan,
      winRate: b.winRate,
      games: b.games,
    };
  };
  const cores = view.plans.length
    ? view.plans.flatMap((p) =>
        p.builds.filter((b) => !b.assembled).map((b) => measured(b, p, isMeta(p))),
      )
    : view.builds.map((b) => measured(b, null, true));
  // A direction with its own combo shows only the combo (same engine, same items, plus augments).
  const assembled = view.plans
    .filter((p) => !combos.some((c) => c.theme === p.direction))
    .flatMap((p) =>
      p.builds
        .filter((b) => b.assembled?.length)
        .map((b): BuildEntry => ({
          kind: 'assembled',
          key: `assembled:${ids(b.items).join(',')}`,
          name: firstBuild(b.items),
          ...rank(false, quality(b.assembled!)),
          items: b.items,
          later: b.later ?? [],
          build: b,
          plan: p,
          winRate: null,
          games: null,
        })),
    );
  const combo = (c: Combo): BuildEntry => ({
    kind: 'combo',
    key: `combo:${c.theme}`,
    name: comboName(c),
    ...rank(c.meta, quality(c.augments)),
    items: c.items.slice(0, CORE_SIZE),
    later: c.items.slice(CORE_SIZE),
    combo: c,
    winRate: null,
    games: null,
  });
  const offmeta = [
    ...cores.filter((e) => !e.meta),
    ...assembled,
    ...combos.filter((c) => !c.meta).map(combo),
  ].sort((a, b) => (b.quality ?? -1) - (a.quality ?? -1));
  const ordered = [
    ...cores.filter((e) => e.meta),
    ...combos.filter((c) => c.meta).map(combo),
    ...offmeta,
  ];
  // The same core twice: the first one stays.
  const seen = new Set<string>();
  return named(
    ordered.filter((e) => {
      const core = ids(e.items).join(',');
      return !seen.has(core) && !!seen.add(core);
    }),
  );
}

/** An augment taken in the game as the rules see it: arammeta's categories, English name and text
 * (the tier list's augment; unknown: `cats: []`, `text: ''`, then only its own combo fits). */
export type TakenAugment = { id: number } & AugmentFacts;

/**
 * The builds that fit the augments taken this game (user's decision 10.10.2026, automatic
 * highlight): a combo that has the augment or whose theme's rule takes it, a core or assembled build
 * whose direction's rule takes it (`DIRECTION_THEMES`; rules, never id lists). By entry key the
 * taken augments that fit, in the order taken. Nothing hidden or re-sorted; offers do not count.
 */
export function takenMatches<T extends TakenAugment>(
  list: BuildEntry[],
  taken: T[],
): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const e of list) {
    const fits = (t: T) =>
      e.kind === 'combo'
        ? e.combo.augments.some((a) => a.id === t.id) || !!themeOf(e.combo.theme)?.augment(t)
        : !!e.plan && DIRECTION_THEMES[e.plan.direction].augment(t);
    const by = taken.filter(fits);
    if (by.length) out.set(e.key, by);
  }
  return out;
}

/** The build the card shows (user's decision 10.10.2026): one chosen by hand this game wins, else
 * the first that fits a taken augment, else the first. */
export const chosenEntry = (
  list: BuildEntry[],
  chosen: string | null,
  fits: Map<string, unknown>,
) => list.find((e) => e.key === chosen) ?? list.find((e) => fits.has(e.key)) ?? list[0];

/** Equal names get the first item of their own ("Tank / Heartsteel · Thornmail"), else a number. */
function named(list: BuildEntry[]): BuildEntry[] {
  const told = list.map((e) => {
    const twins = list.filter((o) => o !== e && o.name === e.name);
    if (!twins.length) return e;
    const others = new Set(twins.flatMap((o) => o.items.map((i) => i.id)));
    const own = e.items.find((i) => !others.has(i.id));
    return own ? { ...e, name: `${e.name} · ${own.name}` } : e;
  });
  const count = new Map<string, number>();
  return told.map((e) => {
    const n = (count.get(e.name) ?? 0) + 1;
    count.set(e.name, n);
    return n === 1 ? e : { ...e, name: `${e.name} (${n})` };
  });
}

/**
 * The item set "Mayhem: <name>" of an entry (Rust adds "Mayhem: "): its core, arammeta's best boots
 * (none when the core has boots), then its later items and, for a core, the rest as blank. writes
 * it (`itemSetOf`: the direction's other cores and best single items); mana items after the core
 * only when the core has one. A combo: its first three items, the rest after.
 */
export function itemSetFor(
  entry: BuildEntry,
  view: Pick<ChampView, 'builds' | 'extra'>,
): ItemSet & { name: string } {
  const own = { items: entry.items, mana: entry.items.filter((i) => i.mana).length };
  // Its later items go right after the core (itemSetOf puts the other builds' items there).
  const then = { items: entry.later, mana: 0 };
  const others =
    entry.kind === 'combo'
      ? []
      : (entry.plan?.builds ?? view.builds).filter((b) => b !== entry.build);
  const set = itemSetOf(
    {
      direction: entry.kind === 'combo' ? undefined : entry.plan?.direction,
      builds: [own, then, ...others],
    },
    view.extra,
  )!;
  const allBoots = new Set((view.extra?.boots ?? []).flatMap((b) => b.items.map((i) => i.id)));
  const boots = set.core.some((id) => allBoots.has(id)) ? [] : set.boots;
  const name = [...entry.name.replace(/\p{Cc}/gu, '').trim()].slice(0, SET_NAME).join('');
  // Rust takes a core of at most SET_CORE items; a longer one goes on in the next block.
  const more = [...set.core.slice(SET_CORE), ...set.more].filter((id) => !boots.includes(id));
  return {
    name: name || 'Build',
    core: set.core.slice(0, SET_CORE),
    boots,
    more: more.slice(0, SET_MORE),
  };
}
