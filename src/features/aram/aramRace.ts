// The leaderboard's race (user's wish: after every game the new stats count up slowly, as if read
// live, so it gets exciting who is first). The values last seen are kept (per app, only for this):
// what changed since counts up from there, one category after another.
import type { CategoryId } from './aramCategories';

/** One category counts up this long; the next starts a little later. */
export const RACE_MS = 2800;
export const STAGGER_MS = 650;
/** Gains and "new number one" stay this long after the race. */
export const AFTER_MS = 6000;
const SEEN_KEY = 'blank.aram.seen.v1';

/** Value by category and player ("damage:<puuid>"); null: none yet. */
export type Seen = Record<string, number | null>;

export const slot = (category: CategoryId, puuid: string) => `${category}:${puuid}`;

/** Fast at first, slowly at the end: the last places are decided last. */
export const ease = (p: number) => 1 - (1 - p) ** 3;

/** The values last seen (strictly: only numbers or null by short keys); null if none. */
export function loadSeen(): Seen | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const seen: Seen = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>).slice(0, 2000))
      if (key.length <= 120 && (value === null || (typeof value === 'number' && isFinite(value))))
        seen[key] = value as number | null;
    return seen;
  } catch {
    return null;
  }
}

export function saveSeen(seen: Seen) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // Only the next count-up starts from further back.
  }
}

/** Where a value stands at `progress` (0–1) between what was seen and now. */
export function between(from: number | null | undefined, to: number | null, progress: number) {
  if (to === null || progress >= 1) return to;
  const start = from ?? 0;
  const value = start + (to - start) * ease(Math.max(0, progress));
  // Counts stay whole numbers while they run.
  return Number.isInteger(to) && Number.isInteger(start) ? Math.round(value) : value;
}
