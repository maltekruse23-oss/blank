// Augment and item statistics (/augments, /items and their pages): how often each one is taken,
// how often the games with it are won and the average grade of those games, over every counted
// player and game (uploads and archive, hidden players already left out by the server). A row
// shows a win rate and grade only from MIN_GAMES games on; pick rates always. Pure, tested in the
// app's repo (src/features/aram/siteMeta.test.ts).
import type { AramEntry } from './adapters/aram';
import { MIN_SECONDS, performanceOf, type Grade, type Performance } from './features/aram/aramPerformance';
import { gradeOfPct } from './insights';

/** Fewer games than this: "wenige Daten", no averages. */
export const MIN_GAMES = 5;
/** Items or augments taken together with one augment or item, at most this many. */
export const PAIRED = 12;

export type MetaStat = {
  games: number;
  /** Share of the games it is counted in (0–1): all games of all players, of one champion, … */
  pick: number;
  /** Share of won games; null below MIN_GAMES games. */
  winRate: number | null;
  /** Games with a grade (values of all ten). */
  graded: number;
  /** Average percentile; null below MIN_GAMES graded games. */
  pct: number | null;
  grade: Grade | null;
};

export type MetaRow = { id: number } & MetaStat;

export type MetaChampion = { championId: number; champion: string; championName: string } & MetaStat;

export type MetaDetail = MetaRow & {
  /** The champions it was taken on; `pick` = share of that champion's games. */
  champions: MetaChampion[];
  /** The items (on an augment's page) or augments (on an item's page) taken with it most often;
   * `pick` = share of its own games. */
  paired: MetaRow[];
};

export type Played = { entry: AramEntry; mark: Performance | null };

const mean = (values: number[]) => values.reduce((t, v) => t + v, 0) / values.length;

/** One entry per player and game, remakes left out. */
export function counted(entries: AramEntry[]) {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = `${e.gameId}:${e.puuid}`;
    if (seen.has(key) || e.seconds < MIN_SECONDS) return false;
    seen.add(key);
    return true;
  });
}

/** Share of wins; null below MIN_GAMES known results. */
export function winRateOf(results: (boolean | null)[]): number | null {
  const known = results.filter((w): w is boolean => w !== null);
  return known.length >= MIN_GAMES ? known.filter(Boolean).length / known.length : null;
}

/** The finished items of an entry, each once (0 = empty slot). */
export const itemsOf = (e: AramEntry) => e.items.filter((id) => Number.isInteger(id) && id > 0);

export function metaStat(list: Played[], total: number): MetaStat {
  const marks = list.map((p) => p.mark).filter((m): m is Performance => m !== null);
  const pct = marks.length >= MIN_GAMES ? mean(marks.map((m) => m.pct)) : null;
  return {
    games: list.length,
    pick: total ? list.length / total : 0,
    winRate: winRateOf(list.map((p) => p.entry.win)),
    graded: marks.length,
    pct,
    grade: pct === null ? null : gradeOfPct(pct),
  };
}

/** One row per id that `ids` names in an entry (each entry counts once per id), most games first. */
export function byId(list: Played[], ids: (e: AramEntry) => number[], total: number): MetaRow[] {
  const by = new Map<number, Played[]>();
  for (const p of list) for (const id of new Set(ids(p.entry))) by.set(id, [...(by.get(id) ?? []), p]);
  return [...by.entries()]
    .map(([id, games]) => ({ id, ...metaStat(games, total) }))
    .sort((a, b) => b.games - a.games || (b.pct ?? -1) - (a.pct ?? -1) || a.id - b.id);
}

/** Every counted entry with its grade (null without the values of all ten). */
export const playedOf = (entries: AramEntry[]): Played[] => counted(entries).map((entry) => ({ entry, mark: performanceOf(entry) }));

/** All augments (`kind` 'augments') or items, most taken first. */
export function metaView(entries: AramEntry[], kind: 'augments' | 'items'): MetaRow[] {
  const played = playedOf(entries);
  return byId(played, kind === 'augments' ? (e) => e.augments : itemsOf, played.length);
}

/** One augment or item: its row, the champions it was taken on and what was taken with it. Null
 * when no counted game has it. */
export function metaDetail(entries: AramEntry[], kind: 'augments' | 'items', id: number): MetaDetail | null {
  const own = kind === 'augments' ? (e: AramEntry) => e.augments : itemsOf;
  const other = kind === 'augments' ? itemsOf : (e: AramEntry) => e.augments;
  const played = playedOf(entries);
  const taken = played.filter((p) => own(p.entry).includes(id));
  if (!taken.length) return null;

  const keys = new Map<number, { champion: string; championName: string }>();
  for (const e of entries) if (e.champion) keys.set(e.championId, { champion: e.champion, championName: e.championName || e.champion });
  const perChampion = new Map<number, number>();
  for (const p of played) perChampion.set(p.entry.championId, (perChampion.get(p.entry.championId) ?? 0) + 1);
  const champions: MetaChampion[] = byId(taken, (e) => [e.championId], 0).map(({ id, ...stat }) => ({
    championId: id,
    champion: keys.get(id)?.champion ?? '',
    championName: keys.get(id)?.championName ?? '',
    ...stat,
    pick: stat.games / perChampion.get(id)!,
  }));

  return {
    id,
    ...metaStat(taken, played.length),
    champions,
    paired: byId(taken, (e) => other(e).filter((n) => n !== id), taken.length).slice(0, PAIRED),
  };
}
