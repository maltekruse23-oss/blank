// The numbers on "How it works" (/scoring), read from the rating core itself, so the page
// can never say something the calculation does not do.
import {
  GRADES,
  METRICS,
  MIN_SECONDS,
  phi,
  WEIGHTS,
  type Grade,
  type Metric,
} from './features/aram/aramPerformance';
import {
  AVERAGE_GAMES,
  GAP_SCALE,
  MAX_SWING,
  muOf,
  PLACEMENT,
  PLACEMENT_CAP,
  pointsFor,
  rankName,
  rankOf,
  seasonOf,
  SHIELD_GAMES,
  SKILL_SD,
  TAU,
  TIERS,
  type Tier,
} from './features/aram/aramRating';
import { AXES } from './insights';

/** The ten grades with the share of games that get them (F = the worst 3 %). */
export const gradeShares = (): { grade: Grade; share: number; best: number }[] =>
  GRADES.map((g, i) => {
    const from = i ? GRADES[i - 1].below : 0;
    const to = Math.min(1, g.below);
    return { grade: g.id, share: to - from, best: 1 - from };
  });

/** What counts how much in a game's grade. */
export const weights = (): { metric: Metric; label: string; weight: number }[] =>
  METRICS.map((m, i) => ({ metric: m, label: AXES[m], weight: WEIGHTS[i] }));

export type TierInfo = {
  tier: Tier;
  /** Ladder place where the tier begins. */
  start: number;
  /** Share of players at this tier or higher (from the distribution the tiers are cut from). */
  top: number;
  /** Share of players in exactly this tier. */
  share: number;
  /** Begins with four divisions of 100 MP (SS turns into open MP at the apex line). */
  divisions: boolean;
  /** MP above the apex line where the tier begins (apex tiers only). */
  apexPoints: number | null;
  /** Usual MP of a game in this tier. */
  points: number;
};

/** Where the open MP begin (SS IV … SS I, then SS with open MP, as Diamond and Master). */
export const apexLine = () => {
  let apex = 0;
  while (rankOf(apex).division !== null) apex++;
  return apex;
};

/** The tiers with where they begin and how rare they are. */
export function tiers(): TierInfo[] {
  const starts: number[] = [];
  let last = '';
  for (let l = 0; l <= 4000; l++) {
    const id = rankOf(l).tier.id;
    if (id !== last) starts.push(l);
    last = id;
  }
  const apex = apexLine();
  const tops = starts.map((s, i) => (i === 0 ? 1 : 1 - phi(muOf(s) / SKILL_SD)));
  return TIERS.map((tier, i) => ({
    tier,
    start: starts[i],
    top: tops[i],
    share: tops[i] - (tops[i + 1] ?? 0),
    divisions: rankOf(starts[i]).division !== null,
    apexPoints: starts[i] > apex ? starts[i] - apex : null,
    points: tier.points,
  }));
}

/** MP of an unusually good (+) or bad (−) game when the hidden rating lies well above the rank,
 * in a tier – e.g. +27/−13 where ±20 is usual. */
export function climbing(tierIndex: number) {
  const ladder = tiers()[tierIndex].start + 50;
  const mu = muOf(ladder) + GAP_SCALE;
  return { up: pointsFor(muOf(ladder) + TAU, ladder, mu), down: pointsFor(muOf(ladder) - TAU, ladder, mu) };
}

/** The three season starts of a year, as "January 8". */
export function seasonStarts(year: number): string[] {
  const starts = new Set<number>();
  for (let day = 0; day < 366; day++) {
    const season = seasonOf(Date.UTC(year, 0, 1) + day * 86_400_000);
    if (season.year === year) starts.add(season.start);
  }
  return [...starts]
    .sort((a, b) => a - b)
    .map((s) => new Date(s).toLocaleDateString('en-US', { day: 'numeric', month: 'long', timeZone: 'UTC' }));
}

export const RULES = {
  placement: PLACEMENT,
  placementCap: rankName(rankOf(PLACEMENT_CAP)),
  shield: SHIELD_GAMES,
  maxSwing: MAX_SWING,
  averageGames: AVERAGE_GAMES,
  remakeMinutes: MIN_SECONDS / 60,
};
