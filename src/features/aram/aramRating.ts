/**
 * The Mayhem ladder (user's wish, 04.10.2026), close to LoL ranked, with a hidden rating:
 *
 * 1. Every game gets a performance (aramPerformance.ts): a grade F–MAYHEM and a continuous score
 *    `y`, independent of rank, win or loss and of the place among the ten.
 * 2. HIDDEN RATING (MMR, shown to nobody): an estimate of the player's usual `y` with its
 *    uncertainty (Kalman / Glicko style). It moves from game 1 on and with every game; at first a
 *    lot, later less.
 * 3. VISIBLE RANK only after PLACEMENT games of the player (never higher than S I, "Emerald I"):
 *    it starts where the hidden rating sits. Then every game gives or takes MP (0–100 per
 *    division): how much better or worse than what the rank expects, in LoL's sizes. A hidden
 *    rating above the rank gives more MP and takes less (about +27/−13), below it the other way
 *    round – the rank finds its place by itself.
 * 4. Rarity like LoL: the tiers are cut from the usual distribution of skill; SSS and MAYHEM are
 *    apex tiers without divisions (like Grandmaster and Challenger): they need many MP, a hidden
 *    rating in their band and a certain one.
 *
 * Pure and deterministic: the same games give everyone the same results, in any order of arrival;
 * a server can use the same code later. Change the rules only with a new RATING_VERSION (new
 * season). The hidden rating is internal and never put into the interface.
 */
import type { AramEntry } from '../../adapters/aram';
import { gradeOf, performanceOf, type Grade, type Performance } from './aramPerformance.ts';

export type { Role } from './aramPerformance.ts';
export type Mark = Performance;

export const RATING_VERSION = 2;
/** Placement games before the first rank of a year (as in LoL). */
export const PLACEMENT = 5;
/** Games after the placement or a promotion to a new tier in which the tier cannot be lost. */
export const SHIELD_GAMES = 3;

// --- Hidden rating -----------------------------------------------------------------------

/** How far apart players' usual scores are (the spread of skill; measured, to be re-measured with
 * more games – the tiers are cut from it). */
export const SKILL_SD = 0.7;
/** How much one game varies around a player's usual score. */
export const TAU = 0.89;
/** Variance added per game, so the rating never freezes. */
const DRIFT = 0.004;
/** A new year keeps this share of the hidden rating and becomes uncertain again. */
const SOFT_KEEP = 0.7;
const SOFT_VARIANCE = 0.25;

export type Mmr = { mu: number; variance: number };
export const INITIAL_MMR: Mmr = { mu: 0, variance: SKILL_SD ** 2 };

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** One game moves the hidden rating towards the game's score, by the share of uncertainty. */
export function updateMmr(m: Mmr, y: number): Mmr {
  const predicted = m.variance + DRIFT;
  const k = predicted / (predicted + TAU ** 2);
  return { mu: m.mu + k * (clamp(y, -3, 3) - m.mu), variance: (1 - k) * predicted };
}

// --- Tiers and the ladder ----------------------------------------------------------------

/** The tiers (user's choice: short grades; D = Iron+Bronze, C = Silver, B = Gold, A = Platinum,
 * S = Emerald, SS = Diamond+Master, SSS = Grandmaster, MAYHEM = Challenger) and the size of the
 * points of a game there (LoL: about ±25 below Emerald, ±20 in Emerald and Diamond, ±30 apex). */
export const TIERS = [
  { id: 'd', name: 'D', points: 25 },
  { id: 'c', name: 'C', points: 25 },
  { id: 'b', name: 'B', points: 25 },
  { id: 'a', name: 'A', points: 25 },
  { id: 's', name: 'S', points: 20 },
  { id: 'ss', name: 'SS', points: 20 },
  { id: 'sss', name: 'SSS', points: 30 },
  { id: 'mayhem', name: 'MAYHEM', points: 30 },
] as const;

export type Tier = (typeof TIERS)[number];
export const DIVISION_NAMES = ['I', 'II', 'III', 'IV'] as const;

/** D–SS have four divisions of 100 MP (ladder 0–2399); from here on only open MP, as the apex. */
const APEX = 2400;
/** SSS needs 400 MP above the apex line and a hidden rating in its band, MAYHEM 800 MP (as
 * Grandmaster 400 and Challenger 800 LP). */
const SSS_AT = 2800;
const MAYHEM_AT = 3200;
/** Placements and the new year never put a player higher than S I (LoL: Emerald I). */
export const PLACEMENT_CAP = 1900;
/** An apex tier needs this certainty of the hidden rating (a spread of at most this). */
const APEX_SIGMA = 0.3;

/** Where the tiers begin, as a place in the usual distribution of skill (standard-normal
 * z-values from LoL's rarity: Silver from the best 80.9 %, … Grandmaster 0.09 %, Challenger
 * 0.03 %), and the hidden rating that belongs to the start of each ladder step. */
const NODES: readonly (readonly [number, number])[] = (
  [
    [0, -1.9],
    [400, -0.875],
    [800, -0.2],
    [1200, 0.44],
    [1600, 1.02],
    [2000, 1.68],
    [2800, 3.12],
    [3200, 3.43],
    [4000, 3.73],
  ] as const
).map(([ladder, z]) => [ladder, z * SKILL_SD] as const);

/** The hidden rating a ladder place stands for (what that rank expects of a player). */
export function muOf(ladder: number) {
  const l = Math.max(0, ladder);
  let i = 0;
  while (i < NODES.length - 2 && l > NODES[i + 1][0]) i += 1;
  const [l0, m0] = NODES[i];
  const [l1, m1] = NODES[i + 1];
  return m0 + ((l - l0) / (l1 - l0)) * (m1 - m0);
}

/** The ladder place that belongs to a hidden rating (0 at the very bottom). */
export function ladderOfMu(mu: number) {
  if (mu <= NODES[0][1]) return 0;
  let i = 0;
  while (i < NODES.length - 2 && mu > NODES[i + 1][1]) i += 1;
  const [l0, m0] = NODES[i];
  const [l1, m1] = NODES[i + 1];
  return l0 + ((mu - m0) / (m1 - m0)) * (l1 - l0);
}

export type Rank = {
  tier: Tier;
  /** 4 (IV) … 1 (I); null from the apex line on. */
  division: number | null;
  /** 0–99 in a division; from the apex line on the open MP above it. */
  points: number;
  /** One number for the whole ladder (sorting, the way up). */
  ladder: number;
};

export type Gate = { sss: boolean; mayhem: boolean };

/** The apex tiers are only shown to those whose hidden rating and its certainty fit. */
export function gateOf(ladder: number, m: Mmr): Gate {
  const sure = Math.sqrt(m.variance) <= APEX_SIGMA;
  return {
    sss: sure && ladder >= SSS_AT && m.mu >= muOf(SSS_AT),
    mayhem: sure && ladder >= MAYHEM_AT && m.mu >= muOf(MAYHEM_AT),
  };
}

const zoneOf = (ladder: number) =>
  ladder < APEX ? Math.floor(ladder / 400) : ladder < SSS_AT ? 5 : ladder < MAYHEM_AT ? 6 : 7;

export function rankOf(ladder: number, gate?: Gate): Rank {
  const l = Math.max(0, Math.round(ladder));
  let zone = zoneOf(l);
  if (gate && zone === 7 && !gate.mayhem) zone = 6;
  if (gate && zone === 6 && !gate.sss) zone = 5;
  return {
    tier: TIERS[zone],
    division: l < APEX ? 4 - Math.floor((l % 400) / 100) : null,
    points: l < APEX ? l % 100 : l - APEX,
    ladder: l,
  };
}

/** "S II", "SS", "MAYHEM". */
export const rankName = (rank: Rank) =>
  rank.division === null
    ? rank.tier.name
    : `${rank.tier.name} ${DIVISION_NAMES[rank.division - 1]}`;

// --- Points per game ---------------------------------------------------------------------

/** How far the hidden rating lies above (+) or below (−) the rank, −1 … +1 (LoL's Climb
 * Indicator shows it above the rank). */
export const GAP_SCALE = 0.3;
const GAP_EFFECT = 0.35;
export const CLIMBING = 0.5;
export const gapOf = (mu: number, ladder: number) => clamp((mu - muOf(ladder)) / GAP_SCALE, -1, 1);

/**
 * Points for a game, in LoL's sizes: how much better or worse the game was than what the rank
 * expects, in game spreads, times the size of the tier. Smooth (almost equal games give almost
 * equal points, no cliffs); win or loss do not count. A hidden rating above the rank gives more
 * and takes less (gap 1: ×1.35 and ×0.65, e.g. +27/−13 where ±20 is usual), below it the other
 * way round. Never zero.
 */
export function pointsFor(y: number, ladder: number, mu: number) {
  const size = TIERS[zoneOf(ladder)].points;
  const better = clamp((y - muOf(ladder)) / TAU, -1.2, 1.2);
  const gap = gapOf(mu, ladder);
  const raw = size * better * (better >= 0 ? 1 + GAP_EFFECT * gap : 1 - GAP_EFFECT * gap);
  const points = Math.round(raw);
  return points !== 0 ? points : better >= 0 ? 1 : -1;
}

/**
 * One game on the ladder, as in LoL: 100 points promote at once and the rest carries over; losing
 * points inside a tier overflows into the division below (10 − 25 → 85); falling out of a tier
 * lands at 75, 50 or 25 points by the gap; a new tier is kept for SHIELD_GAMES games; from the
 * apex line on only open points count.
 */
export function applyPoints(ladder: number, gain: number, shield: number, gap: number) {
  const next = ladder + gain;
  if (gain >= 0) return next;
  if (ladder >= APEX) return Math.max(0, next);
  const tierStart = Math.floor(ladder / 400) * 400;
  if (next >= tierStart) return next;
  if (tierStart === 0) return 0;
  if (shield > 0) return tierStart;
  const landing = gap >= 0 ? 75 : gap >= -0.5 ? 50 : 25;
  return tierStart - 100 + landing;
}

/** Where the placements put a player: the place of the hidden rating, never higher than S I. */
export const placementLadder = (m: Mmr) =>
  Math.min(PLACEMENT_CAP, Math.max(0, Math.round(ladderOfMu(m.mu))));

// --- Seasons -----------------------------------------------------------------------------

/** Seasons as in LoL (user's wish): three a year, starting 8 January, 29 April and 29 July (UTC);
 * the rank carries over between them, a new year starts with a soft reset and new placements. */
const SEASON_STARTS: readonly (readonly [number, number])[] = [
  [0, 8],
  [3, 29],
  [6, 29],
];

export type Season = { year: number; number: number; id: string; start: number };

export function seasonOf(at: number): Season {
  let year = new Date(at).getUTCFullYear();
  let number = 0;
  for (let i = SEASON_STARTS.length - 1; i >= 0; i--) {
    const [month, day] = SEASON_STARTS[i];
    if (at >= Date.UTC(year, month, day)) {
      number = i + 1;
      break;
    }
  }
  if (number === 0) {
    year -= 1;
    number = SEASON_STARTS.length;
  }
  const [month, day] = SEASON_STARTS[number - 1];
  return { year, number, id: `${year}-${number}`, start: Date.UTC(year, month, day) };
}

export const seasonName = (season: Pick<Season, 'year' | 'number'>) =>
  `Saison ${season.number} · ${season.year}`;

// --- Everyone's ladder -------------------------------------------------------------------

export type Step = {
  entry: AramEntry;
  /** The game's performance (grade F–MAYHEM). */
  mark: Performance;
  /** Points of this game; null for placement games. */
  gain: number | null;
  before: Rank | null;
  after: Rank | null;
  change: 'placed' | 'promoted' | 'demoted' | null;
  season: string;
};

/** The average of the last games' performance (the "performance ranking", independent of rank). */
export type Average = { games: number; pct: number; grade: Grade };
export const AVERAGE_GAMES = 20;

export type Standing = {
  puuid: string;
  name: string;
  /** Counted games and wins of the current year. */
  games: number;
  wins: number;
  /** Null until the placement games of the year are played. */
  rank: Rank | null;
  /** Placement games played this year (0–5). */
  placed: number;
  /** Gap of the hidden rating to the rank (−1 … +1); from CLIMBING on "form above the rank". */
  form: number;
  /** Average performance of the last games. */
  average: Average | null;
  /** Final ranks of earlier seasons, newest first. */
  seasons: { season: Season; rank: Rank }[];
  /** Every counted game with the rank before and after it, oldest first. */
  history: Step[];
  /** The hidden rating – for tests and the server; never shown. */
  hidden: Mmr;
};

/** A rank's step: one count per division, the apex as one step after SS I, then SSS, MAYHEM. */
const stepOf = (rank: Rank) =>
  TIERS.indexOf(rank.tier) * 10 + (rank.division === null ? 4 : 4 - rank.division);

/** Everyone's ladder from the collected games (only games from `since` on); the same games in any
 * order give the same result. */
export function standings(entries: AramEntry[], since = 0): Standing[] {
  const byPlayer = new Map<string, AramEntry[]>();
  for (const entry of entries) {
    if (entry.at < since) continue;
    const list = byPlayer.get(entry.puuid) ?? [];
    list.push(entry);
    byPlayer.set(entry.puuid, list);
  }
  const result: Standing[] = [];
  for (const [puuid, list] of byPlayer) {
    list.sort((a, b) => a.at - b.at || a.gameId - b.gameId);
    const history: Step[] = [];
    const seasons: { season: Season; rank: Rank }[] = [];
    const pcts: number[] = [];
    let mmr = INITIAL_MMR;
    let ladder: number | null = null;
    let placing = 0;
    let shield = 0;
    let season: Season | null = null;
    let games = 0;
    let wins = 0;
    const shown = (l: number) => rankOf(l, gateOf(l, mmr));
    for (const entry of list) {
      const mark = performanceOf(entry);
      if (!mark) continue;
      const now = seasonOf(entry.at);
      if (season && now.id !== season.id) {
        if (ladder !== null) seasons.unshift({ season, rank: shown(ladder) });
        if (now.year !== season.year) {
          // New year: a soft reset, then new placements.
          mmr = { mu: mmr.mu * SOFT_KEEP, variance: Math.max(mmr.variance, SOFT_VARIANCE) };
          ladder = null;
          placing = 0;
          games = 0;
          wins = 0;
          shield = 0;
        }
      }
      season = now;
      games += 1;
      if (entry.win) wins += 1;
      pcts.push(mark.pct);
      // The points use the rating from before this game, as in LoL.
      const before = mmr;
      mmr = updateMmr(mmr, mark.y);
      if (ladder === null) {
        placing += 1;
        const placed = placing === PLACEMENT;
        if (placed) {
          ladder = placementLadder(mmr);
          shield = SHIELD_GAMES;
        }
        history.push({
          entry,
          mark,
          gain: null,
          before: null,
          after: placed ? shown(ladder!) : null,
          change: placed ? 'placed' : null,
          season: now.id,
        });
        continue;
      }
      const from = shown(ladder);
      const gain = pointsFor(mark.y, ladder, before.mu);
      ladder = applyPoints(ladder, gain, shield, gapOf(before.mu, ladder));
      shield = Math.max(0, shield - 1);
      const to = shown(ladder);
      if (to.tier !== from.tier && to.ladder > from.ladder) shield = SHIELD_GAMES;
      const change =
        stepOf(to) > stepOf(from) ? 'promoted' : stepOf(to) < stepOf(from) ? 'demoted' : null;
      history.push({ entry, mark, gain, before: from, after: to, change, season: now.id });
    }
    const last = pcts.slice(-AVERAGE_GAMES);
    const meanPct = last.reduce((s, p) => s + p, 0) / (last.length || 1);
    result.push({
      puuid,
      name: list[list.length - 1].name,
      games,
      wins,
      rank: ladder === null ? null : shown(ladder),
      placed: ladder === null ? placing : PLACEMENT,
      form: ladder === null ? 0 : gapOf(mmr.mu, ladder),
      average: last.length ? { games: last.length, pct: meanPct, grade: gradeOf(meanPct) } : null,
      seasons,
      history,
      hidden: mmr,
    });
  }
  // Plain comparisons: the same order on every PC.
  return result.sort(
    (a, b) =>
      (b.rank?.ladder ?? -1) - (a.rank?.ladder ?? -1) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
      (a.puuid < b.puuid ? -1 : 1),
  );
}

/** What one game did on the ladder, for the card after the game (small: goes to the popout). */
export type RankResult = {
  grade: Grade;
  /** Share of all measured games that were worse (0–1). */
  pct: number;
  /** Points of the game; null in the placement games. */
  gain: number | null;
  before: Rank | null;
  after: Rank | null;
  change: Step['change'];
  /** Placement games played up to this one (0 once placed). */
  games: number;
};

/** The step of one player's game on the ladder (only games from `since` on), or null when the game
 * does not count (no values of all ten, remake). */
export function rankResult(
  entries: AramEntry[],
  puuid: string,
  gameId: number,
  since = 0,
): RankResult | null {
  const standing = standings(
    entries.filter((e) => e.puuid === puuid),
    since,
  )[0];
  const index = standing?.history.findIndex((h) => h.entry.gameId === gameId) ?? -1;
  if (!standing || index < 0) return null;
  const step = standing.history[index];
  let count = 0;
  for (let i = index; i >= 0 && standing.history[i].gain === null; i--) count += 1;
  return {
    grade: step.mark.grade,
    pct: step.mark.pct,
    gain: step.gain,
    before: step.before,
    after: step.after,
    change: step.change,
    games: step.gain === null ? count : 0,
  };
}
