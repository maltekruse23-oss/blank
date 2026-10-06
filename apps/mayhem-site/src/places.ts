// A player's own places (/api/plaetze/<id>, "Deine Plätze" on the start page): the place on the
// ladder, by Leistung Ø and in every record category, best place first. Built from the same
// standings and record rankings as the leaderboard and /rekorde, so the numbers match those pages.
// Pure, tested in the app's repo (src/features/aram/sitePlaces.test.ts).
import type { Average, Rank } from './features/aram/aramRating';
import type { Standing } from './summary';
import type { RecordHue, RecordView } from './records';

export type Placement = {
  /** rank: the ladder; performance: Leistung Ø; record: one category of /rekorde. */
  kind: 'rank' | 'performance' | 'record';
  /** 'rank', 'performance' or the record category's id. */
  id: string;
  /** Title of a record category; the page names the other two itself. */
  title: string | null;
  hue: RecordHue | null;
  unit: 'number' | 'seconds' | null;
  /** 1 = best; ties share the place. */
  place: number;
  /** Players in this ranking. */
  of: number;
  /** The record value (null for rank and performance). */
  value: number | null;
  /** The game of a record value. */
  gameId: number | null;
};

export type PlacesView = {
  name: string;
  rank: Rank | null;
  /** Games of the placement so far (a rank comes after 5). */
  placed: number;
  average: Average | null;
  games: number;
  placements: Placement[];
};

/** The place of every row with ties sharing one: `same` tells whether two rows are equal. */
function placesIn<T>(rows: T[], same: (a: T, b: T) => boolean): number[] {
  const out: number[] = [];
  rows.forEach((row, i) => out.push(i > 0 && same(rows[i - 1], row) ? out[i - 1] : i + 1));
  return out;
}

const share = (p: Placement) => p.place / p.of;
const ORDER = (p: Placement) => (p.kind === 'rank' ? 0 : p.kind === 'performance' ? 1 : 2);

/**
 * The places of player `id` (as the standings name it): `list` in the leaderboard's order,
 * `records` from recordRanking. Null when the player has no counted game. Best first: lower place;
 * on the same place the ladder, then Leistung Ø, then records with the smaller share of the field.
 */
export function placesOf(list: Standing[], records: RecordView[], id: string): PlacesView | null {
  const me = list.find((s) => s.puuid === id);
  if (!me) return null;
  const placements: Placement[] = [];
  const base = { title: null, hue: null, unit: null, value: null, gameId: null } as const;

  const ranked = list.filter((s) => s.rank);
  const rankPlaces = placesIn(ranked, (a, b) => a.rank!.ladder === b.rank!.ladder);
  const r = ranked.findIndex((s) => s.puuid === id);
  if (r >= 0) placements.push({ ...base, kind: 'rank', id: 'rank', place: rankPlaces[r], of: ranked.length });

  // Same order as the leaderboard's tab "Nach Leistung Ø".
  const rated = list
    .filter((s) => s.average)
    .sort((a, b) => b.average!.pct - a.average!.pct || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const ratedPlaces = placesIn(rated, (a, b) => a.average!.pct === b.average!.pct);
  const a = rated.findIndex((s) => s.puuid === id);
  if (a >= 0) placements.push({ ...base, kind: 'performance', id: 'performance', place: ratedPlaces[a], of: rated.length });

  for (const c of records) {
    const mine = c.places.find((p) => p.puuid === id);
    if (!mine) continue;
    placements.push({
      kind: 'record',
      id: c.id,
      title: c.title,
      hue: c.hue,
      unit: c.unit,
      place: mine.place,
      of: c.places.length,
      value: mine.value,
      gameId: mine.game.gameId,
    });
  }

  const index = new Map(placements.map((p, i) => [p, i]));
  placements.sort((x, y) => x.place - y.place || ORDER(x) - ORDER(y) || share(x) - share(y) || index.get(x)! - index.get(y)!);
  return { name: me.name, rank: me.rank, placed: me.placed, average: me.average, games: me.games, placements };
}
