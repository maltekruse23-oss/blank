// The start page (/): head numbers, the top of the ladder, the games of the day, the grades of the
// season and this week's new records. Built from the same standings as the leaderboard, so every
// player here has a profile (only uploaded games count).
import type { Grade } from './features/aram/aramPerformance';
import type { Standing } from './features/aram/aramRating';
import { GRADE_IDS } from './insights';
import type { RecordView } from './records';

/** Players in the top list and games of the day. */
export const TOP = 10;
export const BEST_OF_DAY = 6;
export const DAY_MS = 24 * 60 * 60 * 1000;
/** New records shown at most. */
export const FRESH_RECORDS = 4;

export type DayGame = {
  puuid: string;
  name: string;
  grade: Grade;
  gameId: number;
  at: number;
  seconds: number;
  championId: number;
  champion: string;
  championName: string;
  skin: number | null;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
};

export type StartView = {
  /** Players with at least one counted game. */
  players: number;
  /** Graded games of the current season (one per player and game). */
  seasonGames: number;
  /** How many games of the season got each grade, F to MAYHEM. */
  grades: { grade: Grade; games: number }[];
  /** The best grades of the last 24 hours, best first. */
  today: DayGame[];
};

/** The numbers of the start page; `seasonStart` is the start of the current season. */
export function startView(list: Standing[], now: number, seasonStart: number): StartView {
  const steps = list.flatMap((s) => s.history.map((h) => ({ standing: s, step: h })));
  const season = steps.filter(({ step }) => step.entry.at >= seasonStart && step.entry.at <= now);
  const counts = new Map<Grade, number>(GRADE_IDS.map((g) => [g, 0]));
  for (const { step } of season) counts.set(step.mark.grade, (counts.get(step.mark.grade) ?? 0) + 1);
  const today = steps
    .filter(({ step }) => step.entry.at > now - DAY_MS && step.entry.at <= now)
    .sort((a, b) => b.step.mark.pct - a.step.mark.pct || a.step.entry.at - b.step.entry.at || a.standing.puuid.localeCompare(b.standing.puuid))
    .slice(0, BEST_OF_DAY)
    .map(({ standing, step: { entry: e, mark } }) => ({
      puuid: standing.puuid,
      name: standing.name,
      grade: mark.grade,
      gameId: e.gameId,
      at: e.at,
      seconds: e.seconds,
      championId: e.championId,
      champion: e.champion,
      championName: e.championName,
      skin: typeof e.skin === 'number' ? e.skin : null,
      kills: e.kills,
      deaths: e.deaths,
      assists: e.assists,
      damage: e.damage,
    }));
  return {
    players: list.length,
    seasonGames: season.length,
    grades: GRADE_IDS.map((grade) => ({ grade, games: counts.get(grade) ?? 0 })),
    today,
  };
}

/** Records whose first place was set in the last seven days, at most FRESH_RECORDS, each with only
 * its first place. */
export const freshRecords = (records: RecordView[]): RecordView[] =>
  records
    .filter((c) => c.places[0]?.fresh)
    .slice(0, FRESH_RECORDS)
    .map((c) => ({ ...c, places: c.places.filter((p) => p.place === 1) }));
