/**
 * The performance of one player in one Mayhem game (user's wish, 04.10.2026): a grade from F to
 * MAYHEM for how well the game went, independent of the rank, of win or loss, and of the player's
 * place among the ten.
 *
 * - Every stat counts (damage, taking hits, healing and shielding, taking part in kills, few
 *   deaths), each as a share of the whole lobby – so the length of the game does not matter.
 * - Each value is compared with what that CHAMPION usually reaches (table aramBase.ts, measured
 *   from many games, pulled towards the champion's role): a support with average support values
 *   lands in the middle, a damage dealer with average damage too. Nobody is punished for a role.
 * - The score is continuous: two players who were almost equal get almost equal scores (no places
 *   1–10, no cliff between 4th and 5th).
 * - The score is turned into a percentile of all measured games; the grades are cut from that, so
 *   MAYHEM is rare by definition (and F is "felt away from keyboard").
 *
 * Pure and deterministic. Change the rules only with a new RATING_VERSION in aramRating.ts.
 */
import type { AramEntry } from '../../adapters/aram';
import { BASE } from './aramBase.ts';
import { CHAMPION_ROLES } from './championRoles.ts';

export type Role = 'Assassin' | 'Fighter' | 'Mage' | 'Marksman' | 'Support' | 'Tank';
export const roleOf = (championId: number): Role => CHAMPION_ROLES[championId] ?? 'Fighter';

/** Riot's queue of ARAM Mayhem. */
export const MAYHEM_QUEUE = 2400;
/** Shorter games are remakes or early surrenders: no grade (very short ones are mostly noise). */
export const MIN_SECONDS = 8 * 60;
/** Less gold than this share of the game's median: away from keyboard, grade F. */
const AFK_GOLD = 0.4;

/** The stats in the order of the tables: damage, hits taken, healing + shields, taking part in
 * kills, few deaths. */
export const METRICS = ['dmg', 'tank', 'care', 'part', 'death'] as const;
export type Metric = (typeof METRICS)[number];
/** What counts how much (sums to 1). Taking part counts most, then damage. */
export const WEIGHTS: readonly number[] = [0.24, 0.15, 0.15, 0.32, 0.14];
/** One stat can never carry more than this many spreads. */
const CLIP = 2.5;
const EPS = 0.01;

export type Grade = 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS' | 'MAYHEM';
/** Grades by the share of games that are worse (percentile): F is the worst 3 %, MAYHEM the best
 * 0.3 %. */
export const GRADES: readonly { id: Grade; below: number }[] = [
  { id: 'F', below: 0.03 },
  { id: 'E', below: 0.1 },
  { id: 'D', below: 0.25 },
  { id: 'C', below: 0.45 },
  { id: 'B', below: 0.65 },
  { id: 'A', below: 0.82 },
  { id: 'S', below: 0.93 },
  { id: 'SS', below: 0.985 },
  { id: 'SSS', below: 0.997 },
  { id: 'MAYHEM', below: 1.01 },
];
export const gradeOf = (pct: number): Grade => (GRADES.find((g) => pct < g.below) ?? GRADES[9]).id;

/** Standard normal distribution function. */
export function phi(z: number) {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return 0.5 * (1 + (z >= 0 ? erf : -erf));
}

const finite = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0);
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** The player's stats as log shares of the lobby (0 = exactly the lobby's average share). */
export function features(entry: AramEntry): { x: number[]; afk: boolean } | null {
  const lobby = (entry.lobby ?? []).map((s) => ({
    kills: finite(s.kills),
    deaths: finite(s.deaths),
    assists: finite(s.assists),
    damage: finite(s.damage),
    hits: finite(s.taken) + finite(s.mitigated),
    care: finite(s.healed) + finite(s.shielded),
    gold: finite(s.gold),
    you: s.you === true,
  }));
  const you = lobby.findIndex((s) => s.you);
  if (you < 0 || lobby.length < 6 || entry.seconds < MIN_SECONDS) return null;
  const total = (f: (s: (typeof lobby)[number]) => number) => lobby.reduce((t, s) => t + f(s), 0);
  const even = 1 / lobby.length;
  const lg = (value: number, all: number) =>
    Math.log((all > 0 ? value / all : even) + EPS) - Math.log(even + EPS);
  const me = lobby[you];
  const golds = lobby.map((s) => s.gold).sort((a, b) => a - b);
  const mid = Math.floor(golds.length / 2);
  const median = golds.length % 2 ? golds[mid] : (golds[mid - 1] + golds[mid]) / 2;
  return {
    x: [
      lg(
        me.damage,
        total((s) => s.damage),
      ),
      lg(
        me.hits,
        total((s) => s.hits),
      ),
      lg(
        me.care,
        total((s) => s.care),
      ),
      lg(
        me.kills + me.assists,
        total((s) => s.kills + s.assists),
      ),
      -lg(
        me.deaths,
        total((s) => s.deaths),
      ),
    ],
    afk: me.gold < AFK_GOLD * median,
  };
}

/** What the champion usually reaches (its own table row, else its role's). */
export function baselineOf(championId: number): readonly number[] {
  return BASE.champion[championId] ?? BASE.role[roleOf(championId)] ?? METRICS.map(() => 0);
}

/** The weighted distance from the baseline, in spreads (before the scale of all games). */
export function rawFrom(x: readonly number[], base: readonly number[], sd: readonly number[]) {
  return METRICS.reduce(
    (t, _, i) => t + WEIGHTS[i] * clamp((x[i] - base[i]) / (sd[i] || 1), -CLIP, CLIP),
    0,
  );
}

export type Performance = {
  /** Spread-scaled score: 0 = an average game, +1 = one spread better. */
  y: number;
  /** Share of all measured games that were worse (0–1). */
  pct: number;
  grade: Grade;
  role: Role;
  win: boolean;
  afk: boolean;
};

/** The performance of a game, or null when it does not count (no values of all ten, remake). */
export function performanceOf(entry: AramEntry): Performance | null {
  const f = features(entry);
  if (!f) return null;
  const raw = rawFrom(f.x, baselineOf(entry.championId), BASE.sd);
  let y = clamp((raw - BASE.rawMean) / (BASE.rawSd || 1), -4, 4);
  if (f.afk) y = Math.min(y, -2.5);
  const pct = phi(y);
  return {
    y,
    pct,
    grade: f.afk ? 'F' : gradeOf(pct),
    role: roleOf(entry.championId),
    win: entry.win,
    afk: f.afk,
  };
}
