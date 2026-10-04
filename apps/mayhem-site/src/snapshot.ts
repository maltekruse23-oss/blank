// Stored results of the reading pages (table `snapshots`, PLAN.md Etappe 5): a page computes its
// standings once and serves the stored JSON until something changes. Every write that changes what
// a page shows adds a row to `events` (upload, reset, hide, group change, deletion), so a snapshot
// is valid while the newest event is the one it was computed after. Pages that depend on the clock
// (games of the day, records of the week, the season) and name or icon changes without a new game
// are covered by a short lifetime.

/** How long a snapshot stays valid at most, even when nothing was written. */
export const SNAPSHOT_TTL = 5 * 60_000;
/** Larger results are not stored (D1 allows 2 MB per row); the page is then computed every time. */
export const SNAPSHOT_MAX = 1_500_000;
/** The only query parameters a cached page reads; anything else does not split the cache. */
const PARAMS = ['season', 'group', 'scope'] as const;

export interface Snapshot {
  version: number;
  cursor: number;
  at: number;
}

/** The cache key of a page: its path plus the parameters it reads, in a fixed order. */
export function snapshotKey(path: string, params: URLSearchParams): string {
  const used = PARAMS.flatMap(p => { const v = params.get(p); return v === null ? [] : [`${p}=${v}`]; });
  return used.length ? `${path}?${used.join('&')}` : path;
}

/** Whether a stored snapshot may still be served: same rating version, no event since, not too old. */
export function isFresh(s: Snapshot | undefined, now: number, version: number, cursor: number): s is Snapshot {
  return !!s && s.version === version && s.cursor === cursor && now >= s.at && now - s.at < SNAPSHOT_TTL;
}
