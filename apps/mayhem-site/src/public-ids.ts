// No PUUID leaves the server (user's decision 05.10.2026), not even an uploader's: every player
// appears under the public id of the archive (a123, src/archive-entries.ts). api.ts runs every
// answer it reads out through these two steps; the only PUUID that may stay is the one the request
// itself named (blank. reading its own profile). Pure, tested in the app's repo
// (src/features/aram/sitePublicIds.test.ts).

/** What a PUUID looks like (validation.ts). Public ids (a123) are far shorter. */
const PUUID = /^[A-Za-z0-9_-]{36,100}$/;

/** The PUUIDs in an answer: every value under a key `puuid` that looks like one. */
export function puuidsIn(value: unknown, keep: string | null = null): Set<string> {
  const found = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) for (const x of v) walk(x);
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) {
        if (k === 'puuid' && typeof x === 'string' && x !== keep && PUUID.test(x)) found.add(x);
        else walk(x);
      }
  };
  walk(value);
  return found;
}

/**
 * The answer with every known PUUID replaced by its public id, wherever it stands (also as a value
 * under another key). A PUUID under `puuid` without a public id becomes null: never the PUUID.
 */
export function withPublicIds<T>(value: T, ids: ReadonlyMap<string, string>, keep: string | null = null): T {
  const walk = (v: unknown, key: string | null): unknown => {
    if (typeof v === 'string') {
      if (v === keep) return v;
      const id = ids.get(v);
      if (id) return id;
      return key === 'puuid' && PUUID.test(v) ? null : v;
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, null));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return walk(value, null) as T;
}
