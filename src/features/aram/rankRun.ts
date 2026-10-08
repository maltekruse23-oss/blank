// How the rank bar runs after a game (blank.'s RankStrip and the Mayhem app's card): from the
// points before to the points after; a promotion fills it and starts again in the new tier, a
// demotion drains it and comes back full in the tier below. Kept apart from RankStrip.tsx so the
// Mayhem app does not load `motion`.
import type { Rank, RankResult } from './aramRating';

/** The bar's fill for a rank (0–1); an apex tier has no divisions and shows full. */
export const rankFill = (rank: Rank | null) =>
  !rank ? 0 : rank.division === null ? 1 : rank.points / 100;

export function rankRun(rank: RankResult) {
  const up = rank.change === 'promoted' || rank.change === 'placed';
  const down = rank.change === 'demoted';
  const from = rankFill(rank.before);
  const to = rankFill(rank.after);
  const widths = up && rank.before ? [from, 1, 0, to] : down ? [from, 0, 1, to] : [from, to];
  /** Where each width is reached (0–1 of the run); the jump sits halfway. */
  const times = widths.length === 4 ? [0, 0.5, 0.501, 1] : [0, 1];
  return { up, down, from, to, widths, times };
}
