// One player's overview (user's wish: click a player, see an overview of them): their records with
// place and medal, their numbers over all games, their best games and champions. Only from the
// games that count; missing values stay missing (never 0).
import type { AramEntry, AramPlayer } from '../../adapters/aram';
import { categories, ranking, recordCategories, type Category } from './aramCategories';
import { countedGames } from './aramStats';

/** A category from this player's view: the value and the place among all (ties share it). */
export type Standing = {
  category: Category;
  value: number | null;
  /** 1 = best; null without a value. */
  place: number | null;
  /** For a record: the game it was set in. */
  game: AramEntry | null;
};

/** Numbers over all games, in this order (the records are on the leaderboard). */
const overallIds = [
  'games',
  'wins',
  'kda',
  'avgDamage',
  'avgDpm',
  'share',
  'topDamage',
  'quadras',
] as const;

export type PlayerOverview = {
  games: number;
  /** Medals over the records: places 1–3 with a value over 0, only with at least two players. */
  medals: [number, number, number];
  records: Standing[];
  overall: Standing[];
  /** The player's best games by damage. */
  best: AramEntry[];
  /** Most played champions. */
  champions: { champion: string; championName: string; games: number; wins: number }[];
};

function standing(
  category: Category,
  player: AramPlayer,
  players: AramPlayer[],
  games: AramEntry[],
) {
  const rows = ranking(category, players, games);
  const own = rows.find((r) => r.player.puuid === player.puuid);
  const value = own?.value ?? null;
  return {
    category,
    value,
    place:
      value === null ? null : 1 + rows.filter((r) => r.value !== null && r.value > value).length,
    game: own?.game ?? null,
  };
}

export function playerOverview(
  player: AramPlayer,
  players: AramPlayer[],
  games: AramEntry[],
): PlayerOverview {
  const own = countedGames(games, players).filter((g) => g.puuid === player.puuid);
  const records = recordCategories
    .map((c) => standing(c, player, players, games))
    .filter((s) => s.value !== null && s.value > 0)
    .sort((a, b) => a.place! - b.place!);
  const medals: [number, number, number] = [0, 0, 0];
  if (players.length > 1) for (const s of records) if (s.place! <= 3) medals[s.place! - 1]! += 1;
  const overall = overallIds.map((id) =>
    standing(
      categories.find((c) => c.id === id)!,
      player,
      players,
      games,
    ),
  );
  const byChampion = new Map<string, PlayerOverview['champions'][number]>();
  for (const g of own) {
    const key = g.champion || g.championName;
    const entry = byChampion.get(key) ?? {
      champion: g.champion,
      championName: g.championName,
      games: 0,
      wins: 0,
    };
    entry.games += 1;
    entry.wins += g.win ? 1 : 0;
    byChampion.set(key, entry);
  }
  return {
    games: own.length,
    medals,
    records,
    overall,
    best: [...own].sort((a, b) => b.damage - a.damage || a.at - b.at).slice(0, 3),
    champions: [...byChampion.values()]
      .sort(
        (a, b) =>
          b.games - a.games || b.wins - a.wins || a.championName.localeCompare(b.championName),
      )
      .slice(0, 3),
  };
}
