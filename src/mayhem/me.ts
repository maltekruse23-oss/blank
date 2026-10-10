// The Mayhem app's player (ROADMAP "Jetzt 2"): the player signed in to the League client, their
// rank, games and the leaderboard from mayhemstats.lol (aram_website.rs, mayhem_ranks). The
// website's answers are checked strictly by aramSite.ts; what the pages need is taken from there.
// Values the website does not give stay null and show as "–", never 0.
import { isTauri } from '@tauri-apps/api/core';
import { readOwnRanks, readPlayer, type OwnRanks } from '../adapters/aramSite';
import { gradeOf, type Grade } from '../features/aram/aramPerformance';
import { TIERS, type Rank, type Step } from '../features/aram/aramRating';
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
  /** Ranked players on the whole leaderboard (the ladder rank's share); null without a place. */
  ranked: number | null;
  /** The highest rank reached: current, after any game or at a season's end. */
  peak: Rank | null;
  /** The most played champion. */
  /** `skin`: the one in its latest game (the player card's background), when the website knows it. */
  main: (Champ & { games: number; wins: number; grade: Grade; skin?: number }) | null;
  /** `game`: the one with the highest grade (the player card's best performance). */
  best: { damage: number | null; kills: number | null; game: (MeGame & { damage: number }) | null };
  /** The player's champions by average performance, best first (Home "Best champions"); with
   * two games or more when any champion has that many, so one lucky game does not lead. */
  champions: ChampStat[];
  /** The player against everyone in their games (Home "You vs. everyone"); null without values. */
  versus: Versus;
  /** The ladder after each of the last games, oldest first (the MP curve). */
  curve: number[];
  /** Every rated game, newest first (Match history; Home and Rank show the first few). */
  recent: MeGame[];
  /** Every counted game on the ladder, oldest first (the card after a game finds its step). */
  history: Step[];
};

export type ChampStat = Champ & { games: number; wins: number; grade: Grade };

export type Versus = {
  /** Average share of all Mayhem games this player's games beat (the grade's percentile), 0–1. */
  better: number | null;
  /** Average place in damage among the ten (1 = most). */
  damagePlace: number | null;
  /** Games with the most damage of all ten, and of how many games that is known. */
  topDamage: number;
  counted: number;
  /** Average share of the team's damage, 0–1. */
  share: number | null;
};

export type LadderRow = {
  place: number;
  name: string;
  /** The public id on mayhemstats.lol (opens the player card). */
  siteId: string | null;
  rank: Rank | null;
  me: boolean;
  /** The profile icon (Data Dragon id); null when the website has none. */
  icon: number | null;
};

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
      /** Every ranked player's rank (the distribution, the player card's place). */
      board: BoardRow[];
      /** Two places above and below the player (Home); empty when not on the ladder. */
      around: LadderRow[];
      mock: boolean;
    };

const CURVE = 20;
/** Rows of the leaderboard the Rank page gets (it shows 25 first, the rest behind "Show more"). */
const LADDER = 100;
const ALIAS = /^[A-Za-z0-9]{1,40}$/;

const max = (values: unknown[]) => {
  const ok = values.filter((v): v is number => Number.isSafeInteger(v) && (v as number) >= 0);
  return ok.length ? Math.max(...ok) : null;
};

/** What the distribution and the player card's place need of the whole leaderboard. */
export type BoardRow = Pick<Ranked, 'siteId' | 'rank'>;

/** The player's numbers from their profile; `board` gives the place among everyone. */
export function meView(profile: Ranked, board: BoardRow[]): MeView {
  const history = profile.history;
  const alias = (v: unknown) => (typeof v === 'string' && ALIAS.test(v) ? v : null);
  const champ = (e: (typeof history)[number]['entry']): Champ => ({
    championId: e.championId,
    alias: alias(e.champion),
    name: e.championName,
  });
  const game = (s: Step): MeGame => ({
    ...champ(s.entry),
    gameId: s.entry.gameId,
    win: s.entry.win,
    kda: `${s.entry.kills}/${s.entry.deaths}/${s.entry.assists}`,
    at: s.entry.at,
    grade: s.mark.grade,
    gain: s.gain,
  });
  const top = history.reduce<Step | null>((b, s) => (!b || s.mark.pct > b.mark.pct ? s : b), null);
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
      skin: games[games.length - 1]!.entry.skin,
    };
  }
  const champions = [...byChamp.values()]
    .map((games) => ({
      ...champ(games[games.length - 1]!.entry),
      games: games.length,
      wins: games.filter((s) => s.entry.win).length,
      pct: games.reduce((t, s) => t + s.mark.pct, 0) / games.length,
    }))
    .sort((a, b) => b.pct - a.pct || b.games - a.games);
  const often = champions.some((c) => c.games > 1);
  const place = profile.siteId
    ? ladderPlace(
        board.map((p) => ({ puuid: p.siteId ?? '', rank: p.rank })),
        profile.siteId,
      )
    : null;
  const peak = [
    profile.rank,
    ...history.map((s) => s.after),
    ...profile.seasons.map((s) => s.rank),
  ].reduce<Rank | null>((b, r) => (r && (!b || r.ladder > b.ladder) ? r : b), null);
  return {
    rank: profile.rank,
    placed: profile.placed,
    games: profile.games,
    wins: profile.wins,
    average: profile.average?.grade ?? null,
    place: profile.rank ? (place?.place ?? null) : null,
    top: profile.rank ? (place?.top ?? null) : null,
    ranked: profile.rank && place ? board.filter((p) => p.rank).length : null,
    peak,
    main,
    best: {
      damage: max(history.map((s) => s.entry.damage)),
      kills: max(history.map((s) => s.entry.kills)),
      game: top && { ...game(top), damage: top.entry.damage },
    },
    champions: champions
      .filter((c) => !often || c.games > 1)
      .map(({ pct, ...c }) => ({ ...c, grade: gradeOf(pct) })),
    versus: versusOf(history),
    curve: history.slice(-CURVE).flatMap((s) => (s.after ? [s.after.ladder] : [])),
    recent: [...history].reverse().map(game),
    history,
  };
}

const mean = (values: number[]) =>
  values.length ? values.reduce((t, v) => t + v, 0) / values.length : null;

/** The website's values of each game, checked here (aramSite.ts checks only what it shows):
 * a value out of range counts as unknown, never as 0. */
export function versusOf(history: Step[]): Versus {
  const places = history
    .map((s) => s.entry.damageRank as unknown)
    .filter((v): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 10);
  const share = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
  return {
    better: mean(history.map((s) => s.mark.pct).filter(share)),
    damagePlace: mean(places),
    topDamage: places.filter((p) => p === 1).length,
    counted: places.length,
    share: mean(history.map((s) => s.entry.teamShare as unknown).filter(share)),
  };
}

/** Games of the archive (Collector, "Find my Mayhem rank") name no champion: the app's champion list
 * (arammeta, tiers.ts) names them by id; without it "–". */
export function withChampions(
  me: MeState,
  champions: readonly { id: number; name: string; alias: string }[],
): MeState {
  if (me.state !== 'ready' || !me.me) return me;
  return { ...me, me: namedView(me.me, champions) };
}

function namedView(
  view: MeView,
  champions: readonly { id: number; name: string; alias: string }[],
) {
  const named = <T extends Champ>(c: T): T => {
    if (c.name) return c;
    const known = champions.find((k) => k.id === c.championId);
    return { ...c, name: known?.name ?? '–', alias: c.alias ?? known?.alias ?? null };
  };
  return {
    ...view,
    main: view.main && named(view.main),
    best: { ...view.best, game: view.best.game && named(view.best.game) },
    champions: view.champions.map(named),
    recent: view.recent.map(named),
  };
}

/** Another player's card (PlayerCard.tsx): their profile on mayhemstats.lol. */
export type PlayerState =
  | { state: 'loading' }
  /** mayhemstats.lol does not list the player. */
  | { state: 'missing' }
  | { state: 'failed' }
  | { state: 'ready'; name: string; me: MeView; mock: boolean };

/** The answer of mayhem_player; `board` gives the place among everyone (empty: none). */
export function playerState(
  text: string | null,
  board: BoardRow[],
  champions: readonly { id: number; name: string; alias: string }[],
): PlayerState {
  if (!text) return { state: 'missing' };
  try {
    const profile = parseProfile(text);
    return {
      state: 'ready',
      name: profile.name,
      me: namedView(meView(profile, board), champions),
      mock: false,
    };
  } catch {
    return { state: 'failed' };
  }
}

/** A player by public id or PUUID; the browser preview shows the mock player under their name. */
export const loadPlayer = (
  id: string,
  name: string,
  champions: readonly { id: number; name: string; alias: string }[],
  board: BoardRow[],
): Promise<PlayerState> =>
  isTauri()
    ? readPlayer(id).then(
        (text) => playerState(text, board, champions),
        (): PlayerState => ({ state: 'failed' }),
      )
    : Promise.resolve(
        MOCK_STATE.state === 'ready' && MOCK_STATE.me
          ? { state: 'ready', name, me: MOCK_STATE.me, mock: true }
          : { state: 'missing' },
      );

/** The top of the leaderboard in the website's order, and the player below it when further down. */
export function ladderOf(board: Ranked[], siteId: string | undefined): LadderRow[] {
  const rows = board.map((p, i) => ({
    place: i + 1,
    name: p.name,
    siteId: p.siteId ?? null,
    rank: p.rank,
    me: siteId !== undefined && p.siteId === siteId,
    icon: p.icon ?? null,
  }));
  const own = rows.find((r) => r.me && r.place > LADDER);
  return [...rows.slice(0, LADDER), ...(own ? [own] : [])];
}

/** The player's place with up to two neighbours on each side; empty when not listed. */
export function aroundOf(board: Ranked[], siteId: string | undefined): LadderRow[] {
  const i = siteId === undefined ? -1 : board.findIndex((p) => p.siteId === siteId);
  if (i < 0) return [];
  return board.slice(Math.max(0, i - 2), i + 3).map((p, j) => ({
    place: Math.max(0, i - 2) + j + 1,
    name: p.name,
    siteId: p.siteId ?? null,
    rank: p.rank,
    me: p.siteId === siteId,
    icon: p.icon ?? null,
  }));
}

/** How many ranked players stand in each tier, lowest first (the Rank page's distribution). */
export function distributionOf(board: BoardRow[]) {
  const counts = TIERS.map((tier) => ({ tier, players: 0 }));
  for (const p of board)
    if (p.rank) counts.find((c) => c.tier.id === p.rank!.tier.id)!.players += 1;
  return counts;
}

/** Where each tier begins on the ladder, in TIERS order (aramRating's zones: D–S 400 each, SS up
 * to SSS at 2800, MAYHEM from 3200). */
const TIER_STARTS = [0, 400, 800, 1200, 1600, 2000, 2800, 3200];

/** The Rank card's chart: zoomed to the last games' MP (a quarter of their range, at least 25 MP,
 * as room above and below, never below 0); the tiers visible in it as bands (0 = bottom, 1 = top,
 * lowest first, cut to the chart) and each game's place; null below two games. */
export function rankChart(values: number[]) {
  if (values.length < 2) return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const room = Math.max(25, (high - low) / 4);
  const bottom = Math.max(0, low - room);
  const top = high + room;
  const at = (v: number) => Math.min(1, Math.max(0, (v - bottom) / (top - bottom)));
  return {
    bands: TIERS.flatMap((tier, i) => {
      const from = TIER_STARTS[i]!;
      const to = TIER_STARTS[i + 1] ?? Infinity;
      return to > bottom && from < top ? [{ tier, from: at(from), to: at(to) }] : [];
    }),
    points: values.map((v, i) => [i / (values.length - 1), at(v)] as const),
  };
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
      board: board.map((p) => ({ siteId: p.siteId, rank: p.rank })),
      around: aroundOf(board, profile?.siteId),
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
