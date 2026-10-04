// The champions pages (/champions and /champions/<name>). The table counts every seat of a game
// with the values of all ten (the fullest upload's lobby, no names), so a champion nobody of us
// plays still shows up; the leaderboard, augments and best games of one champion come only from
// games someone uploaded, so every player there has a profile. Grades follow the same rule as
// everywhere (performanceOf, seen from each seat). Below MIN_GAMES no values are shown as a tier
// list. Pure, tested in the app's repo (src/features/aram/siteChampions.test.ts).
import type { AramEntry } from './adapters/aram';
import { MIN_SECONDS, performanceOf, roleOf, type Grade, type Performance, type Role } from './features/aram/aramPerformance';
import { gradeOfPct, lobbyPerformances } from './insights';

/** Fewer games than this: "wenige Daten", no averages. */
export const MIN_GAMES = 5;
/** Best games shown on a champion's page. */
export const BEST_GAMES = 5;

export const ROLES: Record<Role, string> = {
  Assassin: 'Assassine',
  Fighter: 'Kämpfer',
  Mage: 'Magier',
  Marksman: 'Schütze',
  Support: 'Unterstützer',
  Tank: 'Tank',
};

const TOP: readonly Grade[] = ['SSS', 'MAYHEM'];

type Seat = { championId: number; champion: string; championName: string; seconds: number; damage: number; mark: Performance | null };

export type ChampionStat = {
  championId: number;
  /** Data Dragon key; empty when no upload names it (the page maps the ID). */
  champion: string;
  championName: string;
  role: Role;
  games: number;
  /** Games with a grade (values of all ten). */
  graded: number;
  /** Below MIN_GAMES graded games all of these are null. */
  pct: number | null;
  grade: Grade | null;
  /** Share of graded games with SSS or MAYHEM (0–1). */
  top: number | null;
  damagePerMinute: number | null;
};

const mean = (values: number[]) => values.reduce((t, v) => t + v, 0) / values.length;
const perMinute = (damage: number, seconds: number) => damage / Math.max(1, seconds / 60);

/** One entry per player and game, remakes left out. */
function counted(entries: AramEntry[]) {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = `${e.gameId}:${e.puuid}`;
    if (seen.has(key) || e.seconds < MIN_SECONDS) return false;
    seen.add(key);
    return true;
  });
}

/** Every seat of every game once: the fullest lobby when there is one, otherwise the uploads. */
function seatsOf(entries: AramEntry[]): Seat[] {
  const keys = new Map<number, { champion: string; championName: string }>();
  for (const e of entries) if (e.champion) keys.set(e.championId, { champion: e.champion, championName: e.championName || e.champion });
  const byGame = new Map<number, AramEntry[]>();
  for (const e of counted(entries)) byGame.set(e.gameId, [...(byGame.get(e.gameId) ?? []), e]);
  const seats: Seat[] = [];
  for (const list of byGame.values()) {
    const best = [...list].sort((a, b) => (b.lobby?.length ?? 0) - (a.lobby?.length ?? 0) || +!!a.provisional - +!!b.provisional)[0];
    if (best.lobby?.length) {
      const marks = lobbyPerformances(best);
      best.lobby.forEach((s, i) => {
        const key = keys.get(s.championId);
        seats.push({ championId: s.championId, champion: key?.champion ?? '', championName: key?.championName ?? '', seconds: best.seconds, damage: s.damage, mark: marks[i] });
      });
    } else {
      for (const e of list)
        seats.push({ championId: e.championId, champion: e.champion, championName: e.championName || e.champion, seconds: e.seconds, damage: e.damage, mark: null });
    }
  }
  return seats;
}

function statOf(seats: Seat[]): ChampionStat {
  const first = seats.find((s) => s.champion) ?? seats[0];
  const marks = seats.map((s) => s.mark).filter((m): m is Performance => m !== null);
  const enough = marks.length >= MIN_GAMES;
  const pct = enough ? mean(marks.map((m) => m.pct)) : null;
  return {
    championId: first.championId,
    champion: first.champion,
    championName: first.championName,
    role: roleOf(first.championId),
    games: seats.length,
    graded: marks.length,
    pct,
    grade: pct === null ? null : gradeOfPct(pct),
    top: enough ? marks.filter((m) => TOP.includes(m.grade)).length / marks.length : null,
    damagePerMinute: enough ? mean(seats.map((s) => perMinute(s.damage, s.seconds))) : null,
  };
}

/** One row per champion: enough data first (best Ø grade first), then by games. */
export function championsView(entries: AramEntry[]): ChampionStat[] {
  const by = new Map<number, Seat[]>();
  for (const s of seatsOf(entries)) by.set(s.championId, [...(by.get(s.championId) ?? []), s]);
  return [...by.values()]
    .map(statOf)
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.games - a.games || a.championId - b.championId);
}

export type ChampionPlayer = {
  puuid: string;
  name: string;
  icon: number | null;
  games: number;
  graded: number;
  /** Null without a graded game. */
  pct: number | null;
  grade: Grade | null;
  kills: number;
  deaths: number;
  assists: number;
  damagePerMinute: number;
  best: { gameId: number; grade: Grade } | null;
};

export type ChampionAugment = {
  id: number;
  games: number;
  graded: number;
  /** Below MIN_GAMES graded games null. */
  pct: number | null;
  grade: Grade | null;
};

export type ChampionGame = {
  gameId: number;
  at: number;
  seconds: number;
  puuid: string;
  name: string;
  icon: number | null;
  grade: Grade;
  pct: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  skin: number | null;
};

export type ChampionDetail = ChampionStat & {
  players: ChampionPlayer[];
  augments: ChampionAugment[];
  best: ChampionGame[];
};

/**
 * One champion: the table's row, the players with a profile on it (best Ø grade first), the
 * augments by Ø grade and the best games. Null when no game has this champion. `players` gives
 * the current name and icon; without it the Riot ID of the player's latest game.
 */
export function championView(
  entries: AramEntry[],
  championId: number,
  players: Map<string, { name: string; icon: number | null }> = new Map(),
): ChampionDetail | null {
  const seats = seatsOf(entries).filter((s) => s.championId === championId);
  if (!seats.length) return null;
  const own = counted(entries)
    .filter((e) => e.championId === championId)
    .map((entry) => ({ entry, mark: performanceOf(entry) }));
  const who = (e: AramEntry) => {
    const known = players.get(e.puuid);
    return { name: known?.name || e.name, icon: known ? known.icon : null };
  };

  const byPlayer = new Map<string, typeof own>();
  for (const g of own) byPlayer.set(g.entry.puuid, [...(byPlayer.get(g.entry.puuid) ?? []), g]);
  const list: ChampionPlayer[] = [...byPlayer.values()].map((games) => {
    const latest = games.reduce((a, b) => (b.entry.at > a.entry.at ? b : a)).entry;
    const { name, icon } = who(latest);
    const graded = games.filter((g): g is { entry: AramEntry; mark: Performance } => g.mark !== null);
    const top = graded.length ? graded.reduce((a, b) => (b.mark.pct > a.mark.pct ? b : a)) : null;
    const pct = graded.length ? mean(graded.map((g) => g.mark.pct)) : null;
    return {
      puuid: latest.puuid,
      name,
      icon,
      games: games.length,
      graded: graded.length,
      pct,
      grade: pct === null ? null : gradeOfPct(pct),
      kills: mean(games.map((g) => g.entry.kills)),
      deaths: mean(games.map((g) => g.entry.deaths)),
      assists: mean(games.map((g) => g.entry.assists)),
      damagePerMinute: mean(games.map((g) => perMinute(g.entry.damage, g.entry.seconds))),
      best: top ? { gameId: top.entry.gameId, grade: top.mark.grade } : null,
    };
  });
  list.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.games - a.games || a.name.localeCompare(b.name));

  const byAugment = new Map<number, typeof own>();
  for (const g of own) for (const id of new Set(g.entry.augments)) byAugment.set(id, [...(byAugment.get(id) ?? []), g]);
  const augments: ChampionAugment[] = [...byAugment.entries()].map(([id, games]) => {
    const marks = games.map((g) => g.mark).filter((m): m is Performance => m !== null);
    const pct = marks.length >= MIN_GAMES ? mean(marks.map((m) => m.pct)) : null;
    return { id, games: games.length, graded: marks.length, pct, grade: pct === null ? null : gradeOfPct(pct) };
  });
  augments.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.games - a.games || a.id - b.id);

  const best: ChampionGame[] = own
    .filter((g): g is { entry: AramEntry; mark: Performance } => g.mark !== null)
    .sort((a, b) => b.mark.pct - a.mark.pct || a.entry.at - b.entry.at)
    .slice(0, BEST_GAMES)
    .map(({ entry: e, mark }) => ({
      gameId: e.gameId,
      at: e.at,
      seconds: e.seconds,
      puuid: e.puuid,
      ...who(e),
      grade: mark.grade,
      pct: mark.pct,
      kills: e.kills,
      deaths: e.deaths,
      assists: e.assists,
      damage: e.damage,
      skin: typeof e.skin === 'number' ? e.skin : null,
    }));

  return { ...statOf(seats), players: list, augments, best };
}
