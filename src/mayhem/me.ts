// The Mayhem app's player (ROADMAP "Jetzt 2"): the player signed in to the League client, their
// rank, games and the leaderboard from mayhemstats.lol (aram_website.rs, mayhem_ranks). The
// website's answers are checked strictly by aramSite.ts; what the pages need is taken from there.
// Values the website does not give stay null and show as "–", never 0.
import { isTauri } from '@tauri-apps/api/core';
import { readOwnRanks, type OwnRanks } from '../adapters/aramSite';
import { gradeOf, type Grade } from '../features/aram/aramPerformance';
import type { Rank } from '../features/aram/aramRating';
import { parseBoard, parseProfile, type Ranked } from '../features/aram/aramSite';
import { ladderPlace } from '../features/aram/RankHistory';
import { MOCK_STATE } from './mock';

/** A champion as the pages show it. */
type Champ = {
  championId: number;
  /** Data Dragon alias for the picture; null when the website gave none. */
  alias: string | null;
  name: string;
};

export type MeGame = Champ & {
  gameId: number;
  win: boolean;
  kda: string;
  at: number;
  grade: Grade;
  gain: number | null;
};

export type MeView = {
  rank: Rank | null;
  /** Games towards the placement (the rank comes after five). */
  placed: number;
  games: number;
  wins: number;
  average: Grade | null;
  place: number | null;
  top: number | null;
  /** The most played champion. */
  main: (Champ & { games: number; wins: number; grade: Grade }) | null;
  best: { damage: number | null; kills: number | null };
  /** The ladder after each of the last games, oldest first (the MP curve). */
  curve: number[];
  /** The last games, newest first. */
  recent: MeGame[];
};

export type LadderRow = { place: number; name: string; rank: Rank | null; me: boolean };

export type MeState =
  | { state: 'loading' }
  /** The League client is closed or nobody is signed in. */
  | { state: 'closed' }
  | { state: 'failed'; message: string }
  /** `me` null: mayhemstats.lol has no profile of the player ("no games yet"). `siteId`: the
   * player's public id there (`a123`), how the records name them. */
  | {
      state: 'ready';
      name: string;
      siteId: string | null;
      me: MeView | null;
      ladder: LadderRow[];
      mock: boolean;
    };

const RECENT = 6;
const CURVE = 20;
const LADDER = 10;
const ALIAS = /^[A-Za-z0-9]{1,40}$/;

const max = (values: unknown[]) => {
  const ok = values.filter((v): v is number => Number.isSafeInteger(v) && (v as number) >= 0);
  return ok.length ? Math.max(...ok) : null;
};

/** The player's numbers from their profile; `board` gives the place among everyone. */
export function meView(profile: Ranked, board: Ranked[]): MeView {
  const history = profile.history;
  const alias = (v: unknown) => (typeof v === 'string' && ALIAS.test(v) ? v : null);
  const champ = (e: (typeof history)[number]['entry']): Champ => ({
    championId: e.championId,
    alias: alias(e.champion),
    name: e.championName,
  });
  // By id: games of the archive come without champion names (withChampions names them).
  const byChamp = new Map<number, typeof history>();
  for (const s of history) {
    const games = byChamp.get(s.entry.championId) ?? [];
    byChamp.set(s.entry.championId, [...games, s]);
  }
  // Most games; a tie goes to the champion played last (later in the history).
  let main: MeView['main'] = null;
  for (const games of byChamp.values()) {
    if (main && games.length < main.games) continue;
    const pct = games.reduce((t, s) => t + s.mark.pct, 0) / games.length;
    main = {
      ...champ(games[games.length - 1]!.entry),
      games: games.length,
      wins: games.filter((s) => s.entry.win).length,
      grade: gradeOf(pct),
    };
  }
  const place = profile.siteId
    ? ladderPlace(
        board.map((p) => ({ puuid: p.siteId ?? '', rank: p.rank })),
        profile.siteId,
      )
    : null;
  return {
    rank: profile.rank,
    placed: profile.placed,
    games: profile.games,
    wins: profile.wins,
    average: profile.average?.grade ?? null,
    place: profile.rank ? (place?.place ?? null) : null,
    top: profile.rank ? (place?.top ?? null) : null,
    main,
    best: {
      damage: max(history.map((s) => s.entry.damage)),
      kills: max(history.map((s) => s.entry.kills)),
    },
    curve: history.slice(-CURVE).flatMap((s) => (s.after ? [s.after.ladder] : [])),
    recent: history
      .slice(-RECENT)
      .reverse()
      .map((s) => ({
        ...champ(s.entry),
        gameId: s.entry.gameId,
        win: s.entry.win,
        kda: `${s.entry.kills}/${s.entry.deaths}/${s.entry.assists}`,
        at: s.entry.at,
        grade: s.mark.grade,
        gain: s.gain,
      })),
  };
}

/** Games of the archive (Collector, "Find my Mayhem rank") name no champion: the app's champion list
 * (arammeta, tiers.ts) names them by id; without it "–". */
export function withChampions(
  me: MeState,
  champions: readonly { id: number; name: string; alias: string }[],
): MeState {
  if (me.state !== 'ready' || !me.me) return me;
  const named = <T extends Champ>(c: T): T => {
    if (c.name) return c;
    const known = champions.find((k) => k.id === c.championId);
    return { ...c, name: known?.name ?? '–', alias: c.alias ?? known?.alias ?? null };
  };
  const { main, recent } = me.me;
  return { ...me, me: { ...me.me, main: main && named(main), recent: recent.map(named) } };
}

/** The top of the leaderboard in the website's order, and the player below it when further down. */
export function ladderOf(board: Ranked[], siteId: string | undefined): LadderRow[] {
  const rows = board.map((p, i) => ({
    place: i + 1,
    name: p.name,
    rank: p.rank,
    me: siteId !== undefined && p.siteId === siteId,
  }));
  const own = rows.find((r) => r.me && r.place > LADDER);
  return [...rows.slice(0, LADDER), ...(own ? [own] : [])];
}

/** The MP curve's box (an SVG viewBox). */
export const CURVE_SIZE = { width: 300, height: 70 };

/** The ladder values as a line and the area below it; null below two games. */
export function curvePath(values: number[]) {
  if (values.length < 2) return null;
  const { width, height } = CURVE_SIZE;
  const low = Math.min(...values);
  const span = Math.max(...values) - low || 1;
  const points = values.map(
    (v, i) =>
      [
        Math.round((i / (values.length - 1)) * width * 10) / 10,
        Math.round((height - 6 - ((v - low) / span) * (height - 12)) * 10) / 10,
      ] as const,
  );
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  return { line, area: `${line} L${width} ${height} L0 ${height} Z`, end: points.at(-1)! };
}

/** "5 min ago", "2 h ago", "yesterday", else the date ("Oct 5"). */
export function ago(at: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  if (minutes < 48 * 60) return 'yesterday';
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** The answer of mayhem_ranks as the pages show it. */
export function ownState(answer: OwnRanks | null): MeState {
  if (!answer) return { state: 'closed' };
  try {
    const board = answer.board ? parseBoard(answer.board) : [];
    const profile = answer.me ? parseProfile(answer.me) : null;
    return {
      state: 'ready',
      name: answer.name || profile?.name || '–',
      siteId: profile?.siteId ?? null,
      me: profile && meView(profile, board),
      ladder: ladderOf(board, profile?.siteId),
      mock: false,
    };
  } catch {
    return { state: 'failed', message: 'The answer from mayhemstats.lol does not fit.' };
  }
}

/** The player's rank; the browser preview shows invented values (and says "Mock"). Rust's reasons
 * are German (blank.'s), so the Mayhem app says it in English. */
export const loadMe = (): Promise<MeState> =>
  isTauri()
    ? readOwnRanks().then(ownState, () => ({
        state: 'failed' as const,
        message: 'mayhemstats.lol did not answer. Check your connection.',
      }))
    : Promise.resolve(MOCK_STATE);
