// The ranks as the Mayhem website computes them (PLAN.md Etappe 6: one truth for everyone). The
// website runs the same rating code (siteCore.test.ts) over every uploaded game, so its rank is
// the one all friends see. Its answers are checked strictly here; a player the website does not
// know keeps the rank computed from the games on this PC.
import type { AramEntry } from '../../adapters/aram';
import { GRADES, type Grade, type Performance } from './aramPerformance';
import {
  TIERS,
  type Average,
  type Rank,
  type Season,
  type Standing,
  type Step,
  CLIMBING,
} from './aramRating';

/** A game's grade and points, for the short form of the last games. */
export type Last = {
  gameId: number;
  gain: number | null;
  grade: Grade;
  change: Step['change'];
  /** Known for games on this PC (the website's short form has neither). */
  champion?: string;
  win?: boolean;
};

/** A player's rank as the app shows it, from the website or computed on this PC. */
export type Ranked = {
  puuid: string;
  name: string;
  games: number;
  wins: number;
  placed: number;
  rank: Rank | null;
  /** Form above the rank (the website never gives out the hidden rating itself). */
  climbing: boolean;
  average: Average | null;
  seasons: { season: Season; rank: Rank }[];
  /** The last (up to six) counted games, oldest first. */
  last: Last[];
  /** Every counted game; from the website only for the user's own profile. */
  history: Step[];
  source: 'site' | 'local';
  /** The website's public id of the player (it never gives out PUUIDs); only from the website. */
  siteId?: string;
  /** The profile icon (Data Dragon id) from the website's leaderboard; null when it has none. */
  icon?: number | null;
};

/** What the website answered: the global leaderboard and the user's own profile. */
export type SiteBoard = { players: Ranked[]; me: Ranked | null };

const LAST = 6;

class Invalid extends Error {}
const fail = (what: string): never => {
  throw new Invalid(what);
};
type Obj = Record<string, unknown>;
const obj = (v: unknown, what: string): Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : fail(what);
const list = (v: unknown, what: string): unknown[] => (Array.isArray(v) ? v : fail(what));
const int = (v: unknown, what: string, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
  Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max
    ? (v as number)
    : fail(what);
const num = (v: unknown, what: string): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fail(what);
const str = (v: unknown, what: string, max = 200): string =>
  typeof v === 'string' && v.length <= max ? v : fail(what);
const bool = (v: unknown, what: string): boolean => (typeof v === 'boolean' ? v : fail(what));
const grade = (v: unknown): Grade => (GRADES.some((g) => g.id === v) ? (v as Grade) : fail('Note'));

function rank(v: unknown): Rank | null {
  if (v === null) return null;
  const r = obj(v, 'Rang');
  const tier = TIERS.find((t) => t.id === obj(r.tier, 'Stufe').id) ?? fail('Stufe');
  const division = r.division === null ? null : int(r.division, 'Division', 1, 4);
  const apex = tier.id === 'sss' || tier.id === 'mayhem';
  if (apex && division !== null) fail('Division');
  return {
    tier,
    division,
    points: int(r.points, 'MP', 0, division === null ? 100_000 : 99),
    ladder: int(r.ladder, 'Leiter', 0, 1_000_000),
  };
}

function season(v: unknown): Season {
  const s = obj(v, 'Saison');
  return {
    id: str(s.id, 'Saison', 20),
    year: int(s.year, 'Jahr', 2000, 3000),
    number: int(s.number, 'Saison', 1, 3),
    start: int(s.start, 'Saisonstart'),
  };
}

function average(v: unknown): Average | null {
  if (v === null) return null;
  const a = obj(v, 'Leistung');
  const pct = num(a.pct, 'Leistung');
  if (pct < 0 || pct > 1) fail('Leistung');
  return { games: int(a.games, 'Leistung', 1, 1000), pct, grade: grade(a.grade) };
}

const change = (v: unknown): Step['change'] =>
  v === null || v === 'placed' || v === 'promoted' || v === 'demoted' ? v : fail('Wechsel');
const gain = (v: unknown) => (v === null ? null : int(v, 'MP', -100, 100));

/** One game of the user's profile. Only what the app shows is checked; the game itself is the
 * user's own upload. */
function step(v: unknown): Step {
  const s = obj(v, 'Spiel');
  const e = obj(s.entry, 'Spiel');
  int(e.gameId, 'Spiel', 1);
  int(e.at, 'Zeit');
  bool(e.win, 'Sieg');
  str(e.championName, 'Champion');
  for (const k of ['kills', 'deaths', 'assists'] as const) int(e[k], 'K/D/A', 0, 1000);
  const m = obj(s.mark, 'Note');
  const mark: Performance = {
    y: num(m.y, 'Note'),
    pct: num(m.pct, 'Note'),
    grade: grade(m.grade),
    role: str(m.role, 'Rolle', 20) as Performance['role'],
    win: bool(m.win, 'Sieg'),
    afk: bool(m.afk, 'Abwesend'),
  };
  return {
    entry: e as unknown as AramEntry,
    mark,
    gain: gain(s.gain),
    before: rank(s.before),
    after: rank(s.after),
    change: change(s.change),
    season: str(s.season, 'Saison', 20),
  };
}

/** The part every answer shares (open() in the website's api.ts). */
function standing(v: unknown): Omit<Ranked, 'last' | 'history'> {
  const p = obj(v, 'Spieler');
  const games = int(p.games, 'Spiele', 0, 100_000);
  return {
    puuid: str(p.puuid, 'PUUID', 100),
    name: str(p.name, 'Name', 100),
    games,
    wins: int(p.wins, 'Siege', 0, games),
    placed: int(p.placed, 'Einstufung', 0, 100),
    rank: rank(p.rank),
    climbing: bool(p.climbing, 'Form'),
    average: average(p.average),
    seasons: list(p.seasons, 'Saisons').map((x) => {
      const o = obj(x, 'Saison');
      return { season: season(o.season), rank: rank(o.rank) ?? fail('Saisonrang') };
    }),
    source: 'site',
  };
}

/** A profile icon id; missing (older website versions) or null stays null. */
const icon = (v: unknown) => (v === undefined || v === null ? null : int(v, 'Symbol', 0, 100_000));

/** GET /api/leaderboard: everyone the website rates, in its order. */
export function parseBoard(text: string): Ranked[] {
  const board = obj(JSON.parse(text), 'Rangliste');
  return list(board.players, 'Rangliste').map((v) => ({
    ...standing(v),
    siteId: str(obj(v, 'Spieler').puuid, 'PUUID', 100),
    icon: icon(obj(v, 'Spieler').icon),
    last: list(obj(v, 'Spieler').last6, 'Form')
      .slice(-LAST)
      .map((x) => {
        const o = obj(x, 'Form');
        return {
          gameId: int(o.gameId, 'Spiel', 1),
          gain: gain(o.gain),
          grade: grade(o.grade),
          change: change(o.change),
        };
      }),
    history: [],
  }));
}

/** GET /api/players/<puuid>: the user's own profile with every counted game. */
export function parseProfile(text: string): Ranked {
  const p = obj(JSON.parse(text), 'Profil');
  const history = list(p.history, 'Verlauf').map(step);
  const own = standing(p);
  // Older website versions have no `id`: then the address it answered is the public id.
  const siteId = p.id === undefined ? own.puuid : str(p.id, 'ID', 100);
  return { ...own, siteId, last: lastOf(history), history };
}

const lastOf = (history: Step[]): Last[] =>
  history.slice(-LAST).map((s) => ({
    gameId: s.entry.gameId,
    gain: s.gain,
    grade: s.mark.grade,
    change: s.change,
    champion: s.entry.championName,
    win: s.entry.win,
  }));

/** A standing computed on this PC, in the same form. */
export const fromLocal = (s: Standing): Ranked => ({
  puuid: s.puuid,
  name: s.name,
  games: s.games,
  wins: s.wins,
  placed: s.placed,
  rank: s.rank,
  climbing: s.rank !== null && s.form >= CLIMBING,
  average: s.average,
  seasons: s.seasons,
  last: lastOf(s.history),
  history: s.history,
  source: 'local',
});

/** Everyone's rank: the website's for everyone it knows (the user with the full profile), the
 * local one for the others. Without an answer of the website, all local. */
export function combine(local: Standing[], site: SiteBoard | null): Ranked[] {
  if (!site) return local.map(fromLocal);
  const all = onThisPc(site, local).map((p) =>
    site.me && p.puuid === site.me.puuid ? site.me : p,
  );
  if (site.me && !all.some((p) => p.puuid === site.me!.puuid)) all.push(site.me);
  const known = new Set(all.map((p) => p.puuid));
  return [...all, ...local.filter((s) => !known.has(s.puuid)).map(fromLocal)];
}

const nameKey = (name: string) => name.trim().toLowerCase();

/**
 * The website's players under the PUUIDs of this PC: the website lists everyone under a public id
 * and never a PUUID (user's decision), so the user is found by the public id of their own profile
 * and everyone else by their Riot ID among the players on this PC. Others keep the public id.
 */
export function onThisPc(site: SiteBoard, local: Pick<Standing, 'puuid' | 'name'>[]): Ranked[] {
  const byName = new Map(local.map((s) => [nameKey(s.name), s.puuid]));
  const me = site.me;
  return site.players.map((p) => {
    const puuid =
      me && ((me.siteId !== undefined && p.siteId === me.siteId) || p.puuid === me.puuid)
        ? me.puuid
        : byName.get(nameKey(p.name));
    return puuid ? { ...p, puuid } : p;
  });
}

/** One player's entry on the website: by PUUID (older website versions) or by Riot ID. */
export const siteEntry = (site: SiteBoard, player: { puuid: string; name: string }) =>
  site.players.find((p) => p.puuid === player.puuid) ??
  site.players.find((p) => nameKey(p.name) === nameKey(player.name));

/**
 * The games one player's rank is computed from, for the card right after a game (before its
 * upload): the website's games of the user's profile, plus the games on this PC it does not have
 * yet. The website runs the same code over the same games, so the card shows the step the website
 * will show. Null without the user's profile on the website (the card then computes locally).
 */
export function rankGames(site: SiteBoard | null, puuid: string, local: AramEntry[]) {
  if (site?.me?.puuid !== puuid) return null;
  const seen = new Set(site.me.history.map((s) => s.entry.gameId));
  return [
    ...site.me.history.map((s) => s.entry),
    ...local.filter((e) => e.puuid === puuid && !seen.has(e.gameId)),
  ];
}

export const isInvalid = (error: unknown) =>
  error instanceof Invalid || error instanceof SyntaxError;
