// Builds of one champion (/champions/<name>): which augments are taken together and which item
// cores are built, with share of the champion's games, win rate and Ø grade. The server sends one
// row per counted game (augments, final items, win, grade; no names), the page groups them, because
// only the page knows from Data Dragon which items are finished. Only the final inventory is
// stored, not the order of buying. Pure, tested in the app's repo (src/features/aram/siteBuilds.test.ts).
import type { Grade } from './features/aram/aramPerformance';
import { gradeOfPct } from './insights';
import { itemsOf, MIN_GAMES, winRateOf, type Played } from './meta';

/** One game of the champion, as the page groups it. */
export type BuildGame = { augments: number[]; items: number[]; win: boolean; pct: number | null };

export type Combo = {
  ids: number[];
  games: number;
  /** Share of the champion's games (0–1). */
  pick: number;
  winRate: number | null;
  graded: number;
  pct: number | null;
  grade: Grade | null;
};

/** Combos shown per list. */
export const COMBOS = 6;
/** A combo needs at least this many games to be listed. */
export const MIN_COMBO_GAMES = 2;

export const buildGamesOf = (played: Played[]): BuildGame[] =>
  played.map(({ entry, mark }) => ({ augments: entry.augments, items: itemsOf(entry), win: entry.win, pct: mark?.pct ?? null }));

/** All subsets of `size` ids, each sorted. */
function subsets(ids: number[], size: number): number[][] {
  const list = [...new Set(ids)].sort((a, b) => a - b);
  const out: number[][] = [];
  const pick = (from: number, chosen: number[]) => {
    if (chosen.length === size) return void out.push(chosen);
    for (let i = from; i <= list.length - (size - chosen.length); i++) pick(i + 1, [...chosen, list[i]]);
  };
  pick(0, []);
  return out;
}

/**
 * The most common combos of `size` ids that `ids` names in a game (augments, or the finished
 * items the page passes), most games first, then win rate. At most COMBOS, each with at least
 * MIN_COMBO_GAMES games.
 */
export function combosOf(games: BuildGame[], ids: (g: BuildGame) => number[], size: number): Combo[] {
  const by = new Map<string, { ids: number[]; games: BuildGame[] }>();
  for (const g of games)
    for (const set of subsets(ids(g), size)) {
      const key = set.join(',');
      const row = by.get(key) ?? { ids: set, games: [] };
      row.games.push(g);
      by.set(key, row);
    }
  return [...by.values()]
    .filter((r) => r.games.length >= MIN_COMBO_GAMES)
    .map((r) => {
      const pcts = r.games.flatMap((g) => (g.pct === null ? [] : [g.pct]));
      const pct = pcts.length >= MIN_GAMES ? pcts.reduce((t, v) => t + v, 0) / pcts.length : null;
      return {
        ids: r.ids,
        games: r.games.length,
        pick: games.length ? r.games.length / games.length : 0,
        winRate: winRateOf(r.games.map((g) => g.win)),
        graded: pcts.length,
        pct,
        grade: pct === null ? null : gradeOfPct(pct),
      };
    })
    .sort((a, b) => b.games - a.games || (b.winRate ?? -1) - (a.winRate ?? -1) || a.ids.join().localeCompare(b.ids.join()))
    .slice(0, COMBOS);
}
