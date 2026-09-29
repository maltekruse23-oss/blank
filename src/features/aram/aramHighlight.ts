// How special a game is, for the card after it (user's wish: a special animation when one is top
// or high in the leaderboard). Only what the games say – nothing made up (no MVP score).
import type { AramEntry, AramPlayer } from '../../adapters/aram';
import { categories, type CategoryId } from './aramCategories';
import { countedGames } from './aramStats';

/**
 * "legend": a Pentakill, or a new record of the group in "Höchster Schaden"; "top": the most
 * damage of all ten players, a new record in another category, a personal best or a place among
 * the three best games. The lines say why (at most three).
 */
export type AramHighlight = {
  tier: 'normal' | 'top' | 'legend';
  badge: string | null;
  lines: string[];
  /** Categories with a new record of the group in this game (shown as chips on the card). */
  records: CategoryId[];
};

const isNumber = (value: unknown): value is number => typeof value === 'number';

export function aramHighlight(
  entry: AramEntry,
  games: AramEntry[],
  players: AramPlayer[],
): AramHighlight {
  const counted = countedGames(games, players);
  // Games before this one; afterwards also this game (and friends in the same game).
  const before = counted.filter((g) => g.at < entry.at);
  const after = counted.filter((g) => g.at <= entry.at);
  // New records of the group: the leader of a "best in one game" category now.
  const records = categories
    .filter((c) => c.kind === 'best')
    .filter((c) => {
      const value = c.value(entry);
      const earlier = before.map(c.value).filter(isNumber);
      return isNumber(value) && value > 0 && earlier.length > 0 && value > Math.max(...earlier);
    });
  const record = records.some((c) => c.id === 'damage');
  const penta = entry.pentas > 0;
  const own = before.filter((g) => g.puuid === entry.puuid).map((g) => g.damage);
  const personal = !record && own.length > 0 && entry.damage > Math.max(...own);
  const bestPlace = after.filter((g) => g.damage > entry.damage).length + 1;
  const amongBest = !record && before.length >= 3 && bestPlace <= 3;
  const topDamage = entry.damageRank === 1;

  const lines: string[] = [];
  if (penta) lines.push(entry.pentas > 1 ? `${entry.pentas} Pentakills!` : 'Pentakill!');
  for (const c of records) lines.push(`Neuer Rekord: ${c.title}`);
  if (personal) lines.push('Deine neue Bestleistung');
  if (amongBest) lines.push(`Platz ${bestPlace} der besten Spiele`);
  if (topDamage && lines.length === 0) lines.push('Der meiste Schaden aller zehn Spieler');

  const tier =
    penta || record
      ? 'legend'
      : topDamage || records.length > 0 || personal || amongBest
        ? 'top'
        : 'normal';
  const badge = penta
    ? 'Pentakill'
    : record
      ? 'Neuer Rekord'
      : topDamage
        ? 'Top-Schaden'
        : records.length > 0
          ? 'Rekord'
          : personal
            ? 'Bestleistung'
            : amongBest
              ? `Top ${bestPlace}`
              : null;
  return { tier, badge, lines: lines.slice(0, 3), records: records.map((c) => c.id) };
}
