// The tier list (/tierliste): champions, augments and items in five tiers S–D by how often the
// games with them were won. Not by grade: the grade compares a player with what the champion
// usually reaches, so it says nothing about the champion itself. Small samples are pulled
// towards 50 % (PRIOR games), then the rows are cut by their place: the top 10 % S, then 20 % A,
// 40 % B, 20 % C and the last 10 % D. Rows without a win rate (below MIN_GAMES) stay out. Pure,
// tested in the app's repo (src/features/aram/siteTiers.test.ts).
import type { MetaStat } from './meta';

export const TIERS = ['S', 'A', 'B', 'C', 'D'] as const;
export type Tier = (typeof TIERS)[number];

/** Imagined games at 50 % added to every row, so three lucky wins do not make an S. */
export const PRIOR = 10;
/** Upper end of each tier as share of the ranked rows. */
const CUTS: Record<Tier, number> = { S: 0.1, A: 0.3, B: 0.7, C: 0.9, D: 1 };

/** The win rate pulled towards 50 % by the number of games. */
export const scoreOf = (s: Pick<MetaStat, 'games' | 'winRate'>) =>
  s.winRate === null ? null : (s.winRate * s.games + PRIOR * 0.5) / (s.games + PRIOR);

export type Tiered<T> = { row: T; tier: Tier; score: number };

/** Every row with a win rate in its tier, best first. */
export function tiersOf<T extends Pick<MetaStat, 'games' | 'winRate'>>(rows: T[]): Tiered<T>[] {
  const ranked = rows
    .flatMap((row) => {
      const score = scoreOf(row);
      return score === null ? [] : [{ row, score }];
    })
    .sort((a, b) => b.score - a.score || b.row.games - a.row.games);
  return ranked.map(({ row, score }, i) => {
    // Equal scores share the tier of the first of them.
    const first = ranked.findIndex((r) => r.score === score);
    const place = (Math.min(i, first) + 1) / ranked.length;
    return { row, score, tier: TIERS.find((t) => place <= CUTS[t])! };
  });
}
