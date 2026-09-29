// Games that count and the best games of the ARAM Mayhem collection. Only the games of the players
// on the list count (the user and the chosen friends); games of friends taken off stay stored.
import type { AramEntry, AramPlayer } from '../../adapters/aram';

/** (Kills + Assists) / Deaths, with no deaths counting as one. */
export const kda = (e: Pick<AramEntry, 'kills' | 'deaths' | 'assists'>) =>
  (e.kills + e.assists) / Math.max(1, e.deaths);

/** The games that count: of the listed players, once per player and game. */
/** The games that count: only those that began after the (group's) start. */
export const sinceGames = (games: AramEntry[], since: number | null) =>
  since === null ? games : games.filter((g) => g.at >= since);

export function countedGames(games: AramEntry[], players: AramPlayer[]) {
  const listed = new Set(players.map((p) => p.puuid));
  const seen = new Set<string>();
  return games.filter((g) => {
    const key = `${g.gameId}:${g.puuid}`;
    if (!listed.has(g.puuid) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The collection of the best games, by damage to champions. */
export function bestGames(games: AramEntry[], players: AramPlayer[], count = 12) {
  return countedGames(games, players)
    .sort((a, b) => b.damage - a.damage || a.at - b.at)
    .slice(0, count);
}
