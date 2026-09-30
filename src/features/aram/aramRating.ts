/**
 * Mayhem rating (user's wish: a rank mode that fits a fun mode). Not a skill estimate like MMR
 * (Riot forbids alternatives to its ranked ladder): every game gets an open performance mark
 * 0–10 against the other nine in the same game, the season shows the mean of the best marks.
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

/** The season's value: mean of the best marks; missing games up to BEST count as START, so a few
 * lucky games do not make a high tier and every new best mark lifts the value. */
export const BEST = 20;
export const PLACEMENT = 5;
export const START = 3.5;

export function seasonValue(marks: number[]) {
  const best = [...marks].sort((a, b) => b - a).slice(0, BEST);
  const sum = best.reduce((s, m) => s + m, 0) + Math.max(0, BEST - best.length) * START;
  return Math.round((sum / BEST) * 100) / 100;
}

/** The tiers (user's choice: short grades as in action games). */
export const TIERS = [
  { id: 'd', name: 'D', from: 0 },
  { id: 'c', name: 'C', from: 3.6 },
  { id: 'b', name: 'B', from: 4.3 },
  { id: 'a', name: 'A', from: 5 },
  { id: 's', name: 'S', from: 5.7 },
  { id: 'ss', name: 'SS', from: 6.4 },
  { id: 'sss', name: 'SSS', from: 7.1 },
  { id: 'mayhem', name: 'MAYHEM', from: 7.8 },
] as const;

export type Tier = (typeof TIERS)[number];

/** The tier of a season value and how far it is to the next (0–1; 1 in the top tier). */
export function tierOf(value: number) {
  let at = 0;
  TIERS.forEach((tier, i) => {
    if (value >= tier.from) at = i;
  });
  const next = TIERS[at + 1];
  const progress = next
    ? Math.min(1, Math.max(0, (value - TIERS[at].from) / (next.from - TIERS[at].from)))
    : 1;
  return { tier: TIERS[at] as Tier, next: next as Tier | undefined, progress };
}

export type MarkedGame = { entry: AramEntry; mark: Mark; before: number; after: number };

export type Standing = {
  puuid: string;
  name: string;
  /** Counted games of the season. */
  games: number;
  value: number;
  /** Null until the placement games are played. */
  tier: ReturnType<typeof tierOf> | null;
  /** Every counted game with the season value before and after it, oldest first. */
  history: MarkedGame[];
};

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
    const history: MarkedGame[] = [];
    for (const entry of list) {
      const mark = markGame(entry);
      if (!mark) continue;
      const before = seasonValue(marks);
      marks.push(mark.value);
      history.push({ entry, mark, before, after: seasonValue(marks) });
    }
    const value = seasonValue(marks);
    result.push({
      puuid,
      name: list[list.length - 1].name,
      games: marks.length,
      value,
      tier: marks.length >= PLACEMENT ? tierOf(value) : null,
      history,
    });
  }
  // Plain comparisons: the same order on every PC.
  return result.sort(
    (a, b) =>
      b.value - a.value ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
      (a.puuid < b.puuid ? -1 : 1),
  );
}
