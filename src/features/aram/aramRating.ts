/**
 * Mayhem rating (user's wish: a rank mode that fits a fun mode). Not a skill estimate like MMR
 * (Riot forbids alternatives to its ranked ladder): every game gets an open performance mark
 * 0–10 against the other nine in the same game. The ladder is close to LoL ranked (user's wish:
 * later public for LoL players): tiers with divisions IV–I, 0–100 points per division, promotion,
 * demotion with a shield, placement games, seasons; only the points per game come from the mark
 * (measured against what the current rank expects) instead of win or loss.
 *
 * - Relative to the lobby: shares and places among all ten, so stretching a game to farm damage or
 *   ending it fast changes nothing (everyone farms more in a long game).
 * - By role (Data Dragon): a tank counts what it takes, a support what it heals and shields.
 * - Every value is a place among ten, so no single value can carry more than its weight; not
 *   dying only counts together with being part of the fights (doing nothing never pays).
 * - A win or loss moves the mark only a little (some Mayhem games cannot be won).
 *
 * Pure and deterministic: the same games give everyone the same marks and tiers; a server can use
 * the same code later. Change the rules only with a new RATING_VERSION (new season).
 */
import type { AramEntry, AramSeat } from '../../adapters/aram';
import { CHAMPION_BIAS, ROLE_BIAS } from './aramBias.ts';
import { CHAMPION_ROLES } from './championRoles.ts';

export type Role = 'Assassin' | 'Fighter' | 'Mage' | 'Marksman' | 'Support' | 'Tank';

export const RATING_VERSION = 1;

/** Riot's queue of ARAM Mayhem. */
export const MAYHEM_QUEUE = 2400;

type Metric = 'damage' | 'share' | 'involved' | 'frontline' | 'care' | 'alive';

/** What counts how much, by role; each row sums to 1. */
const WEIGHTS: Record<Role, Record<Metric, number>> = {
  Mage: { damage: 0.2, share: 0.35, involved: 0.25, frontline: 0.05, care: 0, alive: 0.15 },
  Marksman: { damage: 0.2, share: 0.35, involved: 0.25, frontline: 0.05, care: 0, alive: 0.15 },
  Assassin: { damage: 0.2, share: 0.35, involved: 0.25, frontline: 0.05, care: 0, alive: 0.15 },
  Fighter: { damage: 0.15, share: 0.25, involved: 0.25, frontline: 0.2, care: 0, alive: 0.15 },
  Tank: { damage: 0.05, share: 0.1, involved: 0.3, frontline: 0.4, care: 0.05, alive: 0.1 },
  Support: { damage: 0.05, share: 0.1, involved: 0.35, frontline: 0.05, care: 0.35, alive: 0.1 },
};

/** A win or a loss moves the mark by this much only. */
export const WIN_BONUS = 0.3;
/** Shorter games are remakes or early surrenders: no mark. */
export const MIN_SECONDS = 5 * 60;
/** Less gold than this share of the game's median: away from keyboard, no mark. */
const AFK_GOLD = 0.4;

export type MarkPart = { metric: Metric; place: number; weight: number; points: number };

export type Mark = {
  /** 0–10, one decimal. */
  value: number;
  role: Role;
  win: boolean;
  /** What made the mark, biggest share first. */
  parts: MarkPart[];
};

export const roleOf = (championId: number): Role => CHAMPION_ROLES[championId] ?? 'Fighter';

/** Place of a value among all ten as 0 (worst) … 1 (best); ties share their place. */
function standing(values: number[], index: number, higherIsBetter = true) {
  const own = values[index];
  let below = 0;
  let equal = 0;
  values.forEach((v, i) => {
    if (i === index) return;
    if (v === own) equal += 1;
    else if (higherIsBetter ? v < own : v > own) below += 1;
  });
  return values.length < 2 ? 0.5 : (below + equal / 2) / (values.length - 1);
}

const teamSum = (lobby: AramSeat[], team: number, value: (s: AramSeat) => number) =>
  lobby.filter((s) => s.team === team).reduce((sum, s) => sum + value(s), 0);

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** How much a champion's marks lie above the average of all in Mayhem (its own when played often
 * enough, else its role's): taken off, so strong champions and roles bring no advantage. */
export const biasOf = (championId: number) =>
  CHAMPION_BIAS[championId] ?? ROLE_BIAS[roleOf(championId)] ?? 0;

const finite = (value: number) => (Number.isFinite(value) ? value : 0);

/** The mark of one game, or null when the game does not count (no values of all ten, remake,
 * away from keyboard). `neutral`: without the champion's balance (to measure it). */
export function markGame(entry: AramEntry, neutral = false): Mark | null {
  const lobby = (entry.lobby ?? []).map((s) => ({
    ...s,
    kills: finite(s.kills),
    deaths: finite(s.deaths),
    assists: finite(s.assists),
    damage: finite(s.damage),
    taken: finite(s.taken),
    mitigated: finite(s.mitigated),
    healed: finite(s.healed),
    shielded: finite(s.shielded),
    gold: finite(s.gold),
  }));
  const index = lobby.findIndex((s) => s.you);
  if (index < 0 || lobby.length < 6 || entry.seconds < MIN_SECONDS) return null;
  const golds = lobby.map((s) => s.gold);
  if (lobby[index].gold < AFK_GOLD * median(golds)) return null;

  const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
  const values: Record<Metric, number[]> = {
    damage: lobby.map((s) => s.damage),
    share: lobby.map((s) =>
      ratio(
        s.damage,
        teamSum(lobby, s.team, (o) => o.damage),
      ),
    ),
    involved: lobby.map((s) =>
      ratio(
        s.kills + s.assists,
        teamSum(lobby, s.team, (o) => o.kills),
      ),
    ),
    frontline: lobby.map((s) => s.taken + s.mitigated),
    care: lobby.map((s) => s.healed + s.shielded),
    alive: lobby.map((s) => s.deaths),
  };
  const role = roleOf(entry.championId);
  const weights = WEIGHTS[role];
  const involved = standing(values.involved, index);
  const parts = (Object.keys(weights) as Metric[])
    .filter((metric) => weights[metric] > 0)
    .map((metric) => {
      const place = standing(values[metric], index, metric !== 'alive');
      // Not dying only counts as far as the player took part in the fights.
      const earned = metric === 'alive' ? place * involved : place;
      return { metric, place, weight: weights[metric], points: 10 * weights[metric] * earned };
    })
    .sort((a, b) => b.points - a.points || a.metric.localeCompare(b.metric));
  const raw =
    parts.reduce((sum, p) => sum + p.points, 0) +
    (entry.win ? WIN_BONUS : -WIN_BONUS) -
    (neutral ? 0 : biasOf(entry.championId));
  const value = Math.round(Math.min(10, Math.max(0, raw)) * 10) / 10;
  return { value, role, win: entry.win, parts };
}

/** Placement games before the first rank (as in LoL). */
export const PLACEMENT = 5;
/** Points per mark point above or below what the rank expects, and the most per game. */
export const POINTS_PER_MARK = 10;
export const MAX_GAIN = 30;
export const MAX_LOSS = 25;
/** Games after the placement or a promotion to a new tier in which the tier cannot be lost. */
export const SHIELD_GAMES = 3;
/** Points after a demotion (as in LoL). */
const AFTER_DEMOTION = 75;
/** Placements never place higher than the start of this tier (index into TIERS). */
const PLACEMENT_CAP = 4;

/** The tiers (user's choice: short grades as in action games) and the mark each expects at its
 * start; within a tier the expectation rises towards the next. */
export const TIERS = [
  { id: 'd', name: 'D', expects: 3.0 },
  { id: 'c', name: 'C', expects: 3.6 },
  { id: 'b', name: 'B', expects: 4.3 },
  { id: 'a', name: 'A', expects: 5 },
  { id: 's', name: 'S', expects: 5.7 },
  { id: 'ss', name: 'SS', expects: 6.4 },
  { id: 'sss', name: 'SSS', expects: 7.1 },
  { id: 'mayhem', name: 'MAYHEM', expects: 7.8 },
] as const;

export type Tier = (typeof TIERS)[number];
export const DIVISION_NAMES = ['I', 'II', 'III', 'IV'] as const;

/** Each tier below the top has four divisions of 100 points; the top tier has only points. */
const TIER_SPAN = 400;
const TOP = (TIERS.length - 1) * TIER_SPAN;

export type Rank = {
  tier: Tier;
  /** 4 (IV) … 1 (I); null in the top tier. */
  division: number | null;
  /** 0–99 in a division, open-ended in the top tier. */
  points: number;
  /** One number for the whole ladder (sorting, the way up). */
  ladder: number;
};

export function rankOf(ladder: number): Rank {
  const l = Math.max(0, Math.round(ladder));
  if (l >= TOP)
    return { tier: TIERS[TIERS.length - 1], division: null, points: l - TOP, ladder: l };
  const tier = Math.floor(l / TIER_SPAN);
  return {
    tier: TIERS[tier],
    division: 4 - Math.floor((l % TIER_SPAN) / 100),
    points: l % 100,
    ladder: l,
  };
}

/** "S II", "MAYHEM". */
export const rankName = (rank: Rank) =>
  rank.division === null
    ? rank.tier.name
    : `${rank.tier.name} ${DIVISION_NAMES[rank.division - 1]}`;

/** The mark a rank expects: the higher, the more is needed for points. */
export function expectedMark(ladder: number) {
  if (ladder >= TOP) return TIERS[TIERS.length - 1].expects + ((ladder - TOP) / TIER_SPAN) * 0.7;
  const tier = Math.floor(ladder / TIER_SPAN);
  const within = (ladder - tier * TIER_SPAN) / TIER_SPAN;
  return TIERS[tier].expects + (TIERS[tier + 1].expects - TIERS[tier].expects) * within;
}

/** Points for a game: its mark against what the rank expects (never zero, like LP). */
export function pointsFor(mark: number, ladder: number) {
  const raw = Math.round(POINTS_PER_MARK * (mark - expectedMark(ladder)));
  const gain = Math.max(-MAX_LOSS, Math.min(MAX_GAIN, raw));
  return gain !== 0 ? gain : mark >= expectedMark(ladder) ? 1 : -1;
}

/** Where the placement games put a player: the rank whose expectation their mean mark meets. */
export function placementLadder(marks: number[]) {
  const mean = marks.reduce((s, m) => s + m, 0) / marks.length;
  let ladder = 0;
  while (ladder < PLACEMENT_CAP * TIER_SPAN && expectedMark(ladder + 1) <= mean) ladder += 1;
  return ladder;
}

/** One game on the ladder: promotion carries the extra points; below 0 a player first drops to 0,
 * then one division down to 75 points; a new tier is kept for SHIELD_GAMES games. */
export function applyPoints(ladder: number, gain: number, shield: number) {
  const next = ladder + gain;
  if (gain >= 0) return next;
  const floor = ladder >= TOP ? TOP : Math.floor(ladder / 100) * 100;
  if (next >= floor) return next;
  if (ladder > floor) return floor;
  if (floor === 0) return 0;
  if (floor % TIER_SPAN === 0 && shield > 0) return floor;
  return floor - 100 + AFTER_DEMOTION;
}

export type Step = {
  entry: AramEntry;
  mark: Mark;
  /** Points of this game; null for placement games. */
  gain: number | null;
  before: Rank | null;
  after: Rank | null;
  change: 'placed' | 'promoted' | 'demoted' | null;
};

export type Standing = {
  puuid: string;
  name: string;
  /** Counted games of the season. */
  games: number;
  /** Null until the placement games are played. */
  rank: Rank | null;
  /** Every counted game with the rank before and after it, oldest first. */
  history: Step[];
};

const division = (rank: Rank) => (rank.ladder >= TOP ? TOP : Math.floor(rank.ladder / 100));

/** Everyone's season from the collected games (only games from `since` on); the same games in any
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
    const marks: number[] = [];
    const history: Step[] = [];
    let ladder: number | null = null;
    let shield = 0;
    for (const entry of list) {
      const mark = markGame(entry);
      if (!mark) continue;
      marks.push(mark.value);
      if (ladder === null) {
        const placed = marks.length === PLACEMENT;
        if (placed) {
          ladder = placementLadder(marks);
          shield = SHIELD_GAMES;
        }
        const after = placed ? rankOf(ladder!) : null;
        history.push({
          entry,
          mark,
          gain: null,
          before: null,
          after,
          change: placed ? 'placed' : null,
        });
        continue;
      }
      const before = rankOf(ladder);
      const gain = pointsFor(mark.value, ladder);
      ladder = applyPoints(ladder, gain, shield);
      shield = Math.max(0, shield - 1);
      const after = rankOf(ladder);
      if (after.tier !== before.tier && after.ladder > before.ladder) shield = SHIELD_GAMES;
      const change =
        division(after) > division(before)
          ? 'promoted'
          : division(after) < division(before)
            ? 'demoted'
            : null;
      history.push({ entry, mark, gain, before, after, change });
    }
    result.push({
      puuid,
      name: list[list.length - 1].name,
      games: marks.length,
      rank: ladder === null ? null : rankOf(ladder),
      history,
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
