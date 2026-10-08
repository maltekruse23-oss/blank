// Everything the pages derive from the rating's results: no new rules, only views of them
// (radar of the five grade axes, playstyle badges, champions, distribution, apex lines).
// Pure functions, tested in the app's repo (src/features/aram/siteInsights.test.ts).
import type { AramEntry, AramSeat } from './adapters/aram';
import { BASE } from './features/aram/aramBase';
import {
  baselineOf,
  features,
  GRADES,
  METRICS,
  performanceOf,
  type Grade,
  type Metric,
  type Performance,
} from './features/aram/aramPerformance';
import { TIERS, type Rank } from './features/aram/aramRating';

export const GRADE_IDS: readonly Grade[] = GRADES.map((g) => g.id);

/** Names of the five axes of a grade, in the order of METRICS. */
export const AXES: Record<Metric, string> = {
  dmg: 'Damage',
  tank: 'Damage taken',
  care: 'Healing & shields',
  part: 'Kill participation',
  death: 'Survival',
};

const mean = (values: number[]) =>
  values.length ? values.reduce((t, v) => t + v, 0) / values.length : 0;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** How far a game lies above (+) or below (−) what its champion usually reaches, per axis, in
 * spreads (−2.5 … +2.5); null when the game does not count. */
export function axesOf(entry: AramEntry): number[] | null {
  const f = features(entry);
  if (!f) return null;
  const base = baselineOf(entry.championId);
  return METRICS.map((_, i) => clamp((f.x[i] - base[i]) / (BASE.sd[i] || 1), -2.5, 2.5));
}

/** The radar: the mean of each axis over the given games; null without a counted game. */
export function radarOf(entries: AramEntry[]): number[] | null {
  const all = entries.map(axesOf).filter((a): a is number[] => a !== null);
  if (!all.length) return null;
  return METRICS.map((_, i) => mean(all.map((a) => a[i])));
}

export type Badge = { id: string; name: string; hint: string };

/** Playstyle badges from the radar (fixed rules, never a judgement: one per strong axis, at most
 * three, strongest first). */
export function badgesOf(radar: number[] | null, games: number): Badge[] {
  if (!radar || games < 5) return [];
  const [dmg, tank, care, part, death] = radar;
  const all: (Badge & { score: number })[] = [
    { id: 'carry', name: 'Damage dealer', hint: 'More damage than their champion usually does', score: dmg },
    { id: 'front', name: 'Frontliner', hint: 'Takes more damage than their champion usually does', score: tank },
    { id: 'care', name: 'Healer', hint: 'Heals and shields more than their champion usually does', score: care },
    { id: 'team', name: 'Team player', hint: 'In on more kills than usual', score: part },
    { id: 'alive', name: 'Survivor', hint: 'Dies less often than usual', score: death },
    {
      id: 'glass',
      name: 'Glass cannon',
      hint: 'Lots of damage, but dies often',
      score: dmg > 0.4 && death < -0.4 ? (dmg - death) / 2 : -Infinity,
    },
  ];
  return all
    .filter((b) => b.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ id, name, hint }) => ({ id, name, hint }));
}

/** The grades of all ten in a game (same rule as one's own grade, seen from each seat). */
export function lobbyPerformances(entry: AramEntry): (Performance | null)[] {
  const lobby: AramSeat[] = entry.lobby ?? [];
  const mine = lobby.find((s) => s.you);
  return lobby.map((seat, i) =>
    performanceOf({
      ...entry,
      championId: seat.championId,
      win: mine ? (seat.team === mine.team) === entry.win : entry.win,
      lobby: lobby.map((s, j) => ({ ...s, you: j === i })),
    }),
  );
}

/** Index of the best grade in the lobby (the MVP, win or not), or −1. */
export function mvpOf(performances: (Performance | null)[]) {
  let best = -1;
  performances.forEach((p, i) => {
    if (p && (best < 0 || p.y > performances[best]!.y)) best = i;
  });
  return best;
}

export type ChampionRow = {
  championId: number;
  champion: string;
  championName: string;
  games: number;
  wins: number;
  /** Mean share of games that were worse (0–1), as a grade too. */
  pct: number;
  grade: Grade;
  kills: number;
  deaths: number;
  assists: number;
  damagePerMinute: number;
  best: { gameId: number; grade: Grade; pct: number };
};

/** One row per champion, most played first. */
export function championsOf(history: { entry: AramEntry; mark: Performance }[]): ChampionRow[] {
  const by = new Map<number, { entry: AramEntry; mark: Performance }[]>();
  for (const h of history) by.set(h.entry.championId, [...(by.get(h.entry.championId) ?? []), h]);
  return [...by.values()]
    .map((games) => {
      const first = games[0].entry;
      const best = games.reduce((a, b) => (b.mark.pct > a.mark.pct ? b : a));
      const pct = mean(games.map((g) => g.mark.pct));
      return {
        championId: first.championId,
        champion: first.champion,
        championName: first.championName || first.champion,
        games: games.length,
        wins: games.filter((g) => g.entry.win).length,
        pct,
        grade: gradeOfPct(pct),
        kills: mean(games.map((g) => g.entry.kills)),
        deaths: mean(games.map((g) => g.entry.deaths)),
        assists: mean(games.map((g) => g.entry.assists)),
        damagePerMinute: mean(games.map((g) => g.entry.damage / Math.max(1, g.entry.seconds / 60))),
        best: { gameId: best.entry.gameId, grade: best.mark.grade, pct: best.mark.pct },
      };
    })
    .sort((a, b) => b.games - a.games || b.pct - a.pct || a.championId - b.championId);
}

export const gradeOfPct = (pct: number): Grade =>
  (GRADES.find((g) => pct < g.below) ?? GRADES[GRADES.length - 1]).id;

/** The longest run of games with grade S or better, and the current one. */
export function streaksOf(grades: Grade[]) {
  const good = (g: Grade) => GRADE_IDS.indexOf(g) >= GRADE_IDS.indexOf('S');
  let best = 0;
  let run = 0;
  for (const g of grades) {
    run = good(g) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { best, current: run };
}

/** Moving mean of the grades' percentiles (window `size`), for the form line. */
export function formLine(pcts: number[], size = 5) {
  return pcts.map((_, i) => mean(pcts.slice(Math.max(0, i - size + 1), i + 1)));
}

/** How many ranked players are in each tier (ladder order). */
export function distributionOf(ranks: (Rank | null)[]) {
  return TIERS.map((tier) => ({
    tier,
    players: ranks.filter((r) => r?.tier.id === tier.id).length,
  }));
}

/** The lowest MP of each apex tier's players (op.gg's "cutoff"), or null when nobody is there. */
export function apexLines(ranks: (Rank | null)[]) {
  return (['mayhem', 'sss'] as const).map((id) => {
    const there = ranks.filter((r): r is Rank => r?.tier.id === id);
    return {
      tier: TIERS.find((t) => t.id === id)!,
      players: there.length,
      lowest: there.length ? Math.min(...there.map((r) => r.points)) : null,
    };
  });
}

/** Share of ranked players below this rank (0–1), for "Top x %" from 10 ranked players on. */
export function topShare(rank: Rank | null, ranks: (Rank | null)[]) {
  const ranked = ranks.filter((r): r is Rank => r !== null);
  if (!rank || ranked.length < 10) return null;
  return ranked.filter((r) => r.ladder > rank.ladder).length / ranked.length;
}
