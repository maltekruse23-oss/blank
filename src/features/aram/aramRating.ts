/**
 * Mayhem rating (user's wish: a rank mode that fits a fun mode). Not a skill estimate like MMR
 * (Riot forbids alternatives to its ranked ladder): every game gets an open performance mark
 * 0–10 against the other nine in the same game. The ladder is close to LoL ranked (user's wish:
 * later public for LoL players): tiers with divisions IV–I, 0–100 points per division, promotion,
 * demotion with a shield, placement games, seasons; only the points per game come from the mark
 * (measured against what the current rank expects) instead of win or loss. Rules after LoL ranked
 * 2026 (the user's reference): overflow on demotion, landing at 75/50/25 by form, shield after a
 * tier promotion, placements up to SSS III 80, three seasons a year with a soft reset at a new year.
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

/** Placement games before the first rank of a year (as in LoL). */
export const PLACEMENT = 5;
/** Games after a promotion to a new tier in which it cannot be lost (as in LoL). */
export const SHIELD_GAMES = 3;
/** Recent games that make the form (like LoL's MMR against the rank, but open). */
export const FORM_GAMES = 10;

/** The tiers (user's choice: short grades as in action games; D–SSS stand for Iron–Diamond, MAYHEM
 * for the apex), the mark each expects at its start (within a tier it rises to the next) and the
 * points of a game there (LoL: about ±25 below Emerald, ±20 in Emerald and Diamond, ±30 apex). */
export const TIERS = [
  { id: 'd', name: 'D', expects: 3.0, points: 25 },
  { id: 'c', name: 'C', expects: 3.6, points: 25 },
  { id: 'b', name: 'B', expects: 4.3, points: 25 },
  { id: 'a', name: 'A', expects: 5, points: 25 },
  { id: 's', name: 'S', expects: 5.7, points: 25 },
  { id: 'ss', name: 'SS', expects: 6.4, points: 20 },
  { id: 'sss', name: 'SSS', expects: 7.1, points: 20 },
  { id: 'mayhem', name: 'MAYHEM', expects: 7.8, points: 30 },
] as const;

export type Tier = (typeof TIERS)[number];
export const DIVISION_NAMES = ['I', 'II', 'III', 'IV'] as const;

/** Each tier below the top has four divisions of 100 points; the top tier has only points. */
const TIER_SPAN = 400;
const TOP = (TIERS.length - 1) * TIER_SPAN;
/** Placements never place higher than SSS III 80 (LoL: about Diamond III 80). */
export const PLACEMENT_CAP = 6 * TIER_SPAN + 180;
/** The soft reset at a new year starts at most at SS I 0 (LoL: at most Emerald I). */
export const SOFT_RESET_CAP = 5 * TIER_SPAN + 300;

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

const tierIndex = (ladder: number) => Math.min(TIERS.length - 1, Math.floor(ladder / TIER_SPAN));

/** The mark a rank expects: the higher, the more is needed for points. */
export function expectedMark(ladder: number) {
  if (ladder >= TOP) return TIERS[TIERS.length - 1].expects + ((ladder - TOP) / TIER_SPAN) * 0.7;
  const tier = tierIndex(ladder);
  const within = (ladder - tier * TIER_SPAN) / TIER_SPAN;
  return TIERS[tier].expects + (TIERS[tier + 1].expects - TIERS[tier].expects) * within;
}

/** The form: how far the recent marks lie above what the rank expects (−2 … +2). Like LoL's MMR
 * against the rank, but open and only from the player's own games. */
export function formOf(recent: number[], ladder: number) {
  if (recent.length === 0) return 0;
  const mean = recent.reduce((s, m) => s + m, 0) / recent.length;
  return Math.max(-2, Math.min(2, mean - expectedMark(ladder)));
}

/**
 * Points for a game, in LoL's sizes (user's wish): a game at or above what the rank expects counts
 * as won, below as lost (the mark decides, not the result). The size comes from the tier and the
 * form: playing above the rank gives more and loses less (about +27/−13), below it the other way
 * round. A very clear game adds a little.
 */
export function pointsFor(mark: number, ladder: number, form: number) {
  const base = TIERS[tierIndex(ladder)].points;
  const beyond = mark - expectedMark(ladder);
  const extra = Math.min(4, Math.max(0, (Math.abs(beyond) - 1) * 3));
  const low = Math.max(5, base - 12);
  const high = base + 12;
  if (beyond >= 0) return Math.round(Math.min(high, Math.max(low, base + 5 * form + extra)));
  return -Math.round(Math.min(high, Math.max(low, base - 5 * form + extra)));
}

/** Where the placement games put a player: the rank whose expectation their mean mark meets. */
export function placementLadder(marks: number[], cap = PLACEMENT_CAP) {
  const mean = marks.reduce((s, m) => s + m, 0) / marks.length;
  let ladder = 0;
  while (ladder < cap && expectedMark(ladder + 1) <= mean) ladder += 1;
  return ladder;
}

/**
 * One game on the ladder, as in LoL: 100 points promote at once and the rest carries over; losing
 * points inside a tier overflows into the division below (10 − 25 → 85); falling out of a tier
 * lands at 75, 50 or 25 points by the form; a new tier is kept for SHIELD_GAMES games.
 */
export function applyPoints(ladder: number, gain: number, shield: number, form: number) {
  const next = ladder + gain;
  if (gain >= 0) return next;
  const tierStart = ladder >= TOP ? TOP : tierIndex(ladder) * TIER_SPAN;
  if (next >= tierStart) return next;
  if (tierStart === 0) return 0;
  if (shield > 0) return tierStart;
  const landing = form >= 0 ? 75 : form >= -1 ? 50 : 25;
  return tierStart - 100 + landing;
}

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

export type Step = {
  entry: AramEntry;
  mark: Mark;
  /** Points of this game; null for placement games. */
  gain: number | null;
  before: Rank | null;
  after: Rank | null;
  change: 'placed' | 'promoted' | 'demoted' | null;
  season: string;
};

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
  /** Form against the rank (−2 … +2); from CLIMBING on shown like LoL's Climb Indicator. */
  form: number;
  /** Final ranks of earlier seasons, newest first. */
  seasons: { season: Season; rank: Rank }[];
  /** Every counted game with the rank before and after it, oldest first. */
  history: Step[];
};

/** Form from which the rank shows "climbing" (like LoL's Climb Indicator). */
export const CLIMBING = 0.5;

const division = (rank: Rank) => (rank.ladder >= TOP ? TOP : Math.floor(rank.ladder / 100));

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
    let ladder: number | null = null;
    let placing: number[] = [];
    let recent: number[] = [];
    let shield = 0;
    let season: Season | null = null;
    let games = 0;
    let wins = 0;
    // A new year: the soft reset from the last rank, then new placements.
    let seed: number | null = null;
    for (const entry of list) {
      const mark = markGame(entry);
      if (!mark) continue;
      const now = seasonOf(entry.at);
      if (season && now.id !== season.id) {
        if (ladder !== null) seasons.unshift({ season, rank: rankOf(ladder) });
        if (now.year !== season.year) {
          seed = ladder === null ? null : Math.min(SOFT_RESET_CAP, Math.max(0, ladder - TIER_SPAN));
          ladder = null;
          placing = [];
          games = 0;
          wins = 0;
        }
      }
      season = now;
      games += 1;
      if (entry.win) wins += 1;
      recent = [...recent, mark.value].slice(-FORM_GAMES);
      if (ladder === null) {
        placing.push(mark.value);
        const placed = placing.length === PLACEMENT;
        if (placed) {
          const found = placementLadder(placing);
          ladder = seed === null ? found : Math.min(PLACEMENT_CAP, Math.round((seed + found) / 2));
          shield = SHIELD_GAMES;
        }
        history.push({
          entry,
          mark,
          gain: null,
          before: null,
          after: placed ? rankOf(ladder!) : null,
          change: placed ? 'placed' : null,
          season: now.id,
        });
        continue;
      }
      const before = rankOf(ladder);
      const form = formOf(recent, ladder);
      const gain = pointsFor(mark.value, ladder, form);
      ladder = applyPoints(ladder, gain, shield, form);
      shield = Math.max(0, shield - 1);
      const after = rankOf(ladder);
      if (after.tier !== before.tier && after.ladder > before.ladder) shield = SHIELD_GAMES;
      const change =
        division(after) > division(before)
          ? 'promoted'
          : division(after) < division(before)
            ? 'demoted'
            : null;
      history.push({ entry, mark, gain, before, after, change, season: now.id });
    }
    result.push({
      puuid,
      name: list[list.length - 1].name,
      games,
      wins,
      rank: ladder === null ? null : rankOf(ladder),
      placed: ladder === null ? placing.length : PLACEMENT,
      form: ladder === null ? 0 : formOf(recent, ladder),
      seasons,
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

/** The placement games of the year up to a step ("3/5"): the steps without points before it. */
function placementCount(history: Step[], index: number) {
  let count = 0;
  for (let i = index; i >= 0 && history[i].gain === null; i--) count += 1;
  return count;
}

/** What one game did on the ladder, for the card after the game (small: goes to the popout). */
export type RankResult = {
  mark: number;
  /** Points of the game; null in the placement games. */
  gain: number | null;
  before: Rank | null;
  after: Rank | null;
  change: Step['change'];
  /** Counted games up to this one (placement: "3/5"). */
  games: number;
};

/** The step of one player's game on the ladder (only games from `since` on), or null when the game
 * does not count (no values of all ten, remake, away). */
export function rankResult(
  entries: AramEntry[],
  puuid: string,
  gameId: number,
  since = 0,
): RankResult | null {
  const own = entries.filter((e) => e.puuid === puuid);
  const standing = standings(own, since)[0];
  const index = standing?.history.findIndex((h) => h.entry.gameId === gameId) ?? -1;
  if (!standing || index < 0) return null;
  const step = standing.history[index];
  return {
    mark: step.mark.value,
    gain: step.gain,
    before: step.before,
    after: step.after,
    change: step.change,
    games: placementCount(standing.history, index),
  };
}
