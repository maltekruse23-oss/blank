// The group page (/gruppe/<code>): what the duel needs of every member (radar, best values, graded
// games), the duel of two members and the group's game nights. Built from the group's standings,
// so every player here is a member with a profile.
import type { AramEntry } from './adapters/aram';
import type { Grade } from './features/aram/aramPerformance';
import { AVERAGE_GAMES, type Standing } from './features/aram/aramRating';
import { gradeOfPct, radarOf } from './insights';
import { recordsView } from './records';

/** A pause longer than this starts a new game night. */
export const SESSION_GAP = 3 * 60 * 60 * 1000;
/** Game nights shown, newest first. */
export const SESSIONS = 6;

export type MemberGame = { gameId: number; at: number; grade: Grade; pct: number };

export type Member = {
  puuid: string;
  /** The five axes over the last games; null without a counted game. */
  radar: number[] | null;
  /** Best value per record category (only values above 0). */
  bests: Record<string, number>;
  games: MemberGame[];
};

/** What the duel needs of every member. */
export function membersOf(list: Standing[]): Member[] {
  return list.map((s) => {
    const entries: AramEntry[] = s.history.map((h) => h.entry);
    const bests: Record<string, number> = {};
    for (const c of recordsView(entries, 0)) if (c.places[0]) bests[c.id] = c.places[0].value;
    return {
      puuid: s.puuid,
      radar: radarOf(entries.slice(-AVERAGE_GAMES)),
      bests,
      games: s.history.map((h) => ({ gameId: h.entry.gameId, at: h.entry.at, grade: h.mark.grade, pct: h.mark.pct })),
    };
  });
}

export type Duel = {
  /** Games both played in. */
  together: number;
  /** Average grade of each in those games (null without one). */
  a: Grade | null;
  b: Grade | null;
  /** Shared games where each had the better grade. */
  aAhead: number;
  bAhead: number;
};

const mean = (values: number[]) => values.reduce((t, v) => t + v, 0) / values.length;

/** Two members in the games they played together. */
export function duelOf(a: Member, b: Member): Duel {
  const theirs = new Map(b.games.map((g) => [g.gameId, g]));
  const pairs = a.games.flatMap((g) => (theirs.has(g.gameId) ? [[g, theirs.get(g.gameId)!] as const] : []));
  return {
    together: pairs.length,
    a: pairs.length ? gradeOfPct(mean(pairs.map(([x]) => x.pct))) : null,
    b: pairs.length ? gradeOfPct(mean(pairs.map(([, y]) => y.pct))) : null,
    aAhead: pairs.filter(([x, y]) => x.pct > y.pct).length,
    bAhead: pairs.filter(([x, y]) => y.pct > x.pct).length,
  };
}

export type SessionPlayer = {
  puuid: string;
  name: string;
  games: number;
  /** MP won and lost that night (placement games bring none). */
  gain: number;
  placements: number;
  best: Grade;
};

export type Session = { start: number; end: number; games: number; players: SessionPlayer[] };

/** The group's game nights: games with less than SESSION_GAP between them, newest first. */
export function sessionsOf(list: Standing[], limit = SESSIONS): Session[] {
  const steps = list
    .flatMap((s) => s.history.map((h) => ({ s, h })))
    .sort((x, y) => x.h.entry.at - y.h.entry.at || x.h.entry.gameId - y.h.entry.gameId);
  const nights: (typeof steps)[] = [];
  for (const step of steps) {
    const night = nights[nights.length - 1];
    if (night && step.h.entry.at - night[night.length - 1].h.entry.at <= SESSION_GAP) night.push(step);
    else nights.push([step]);
  }
  return nights
    .reverse()
    .slice(0, limit)
    .map((night) => {
      const byPlayer = new Map<string, typeof night>();
      for (const step of night) byPlayer.set(step.s.puuid, [...(byPlayer.get(step.s.puuid) ?? []), step]);
      const players = [...byPlayer.values()].map((own) => {
        const best = own.reduce((x, y) => (y.h.mark.pct > x.h.mark.pct ? y : x)).h.mark.grade;
        return {
          puuid: own[0].s.puuid,
          name: own[0].s.name,
          games: own.length,
          gain: own.reduce((t, { h }) => t + (h.gain ?? 0), 0),
          placements: own.filter(({ h }) => h.gain === null).length,
          best,
        };
      });
      players.sort((x, y) => y.gain - x.gain || y.games - x.games || x.name.localeCompare(y.name));
      return {
        start: night[0].h.entry.at,
        end: night[night.length - 1].h.entry.at,
        games: new Set(night.map(({ h }) => h.entry.gameId)).size,
        players,
      };
    });
}
