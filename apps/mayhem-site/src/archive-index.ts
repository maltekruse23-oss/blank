// The entries of archived games (src/archive-entries.ts) in D1: written with every new archived
// game, and older games a few at a time while the pages are read (no step by hand after deploying).
import { ARCHIVE_ENTRY_VERSION, archiveEntries } from './archive-entries';
import type { RawGame } from './game';
import { riotKey } from './hidden';
import { archiveBucket, db, query, rows } from './storage';

/** Older games built per request at most (each one reads its answer from the archive). */
const PENDING_PER_REQUEST = 20;

/**
 * Statements that store the entries of one archived game. `digest` (on upload) makes them apply
 * only when this answer became the game's canonical one, as the other archive rows.
 */
export function entryStatements(matchKey: string, raw: RawGame, now: number, digest?: string): D1PreparedStatement[] {
  const guard = digest ? ' AND EXISTS (SELECT 1 FROM archive_matches WHERE matchKey=? AND detailsHash=?)' : '';
  const guardArgs = digest ? [matchKey, digest] : [];
  const list = archiveEntries(raw);
  return [
    ...list.map((a) => query(
      `INSERT INTO archive_entries (matchKey,playerId,gameId,at,name,search,icon,json) SELECT ?,id,?,?,?,?,?,? FROM archive_players WHERE puuid=?${guard} ON CONFLICT(matchKey,playerId) DO UPDATE SET gameId=excluded.gameId,at=excluded.at,name=excluded.name,search=excluded.search,icon=excluded.icon,json=excluded.json`,
      matchKey, a.entry.gameId, a.entry.at, a.name, a.name ? riotKey(a.name) : null, a.icon, JSON.stringify(a.entry), a.puuid, ...guardArgs)),
    query(`INSERT INTO archive_indexed (matchKey,version,ok,at) SELECT ?,?,?,?${digest ? ' WHERE EXISTS (SELECT 1 FROM archive_matches WHERE matchKey=? AND detailsHash=?)' : ''} ON CONFLICT(matchKey) DO UPDATE SET version=excluded.version,ok=excluded.ok,at=excluded.at`,
      matchKey, ARCHIVE_ENTRY_VERSION, list.length ? 1 : 0, now, ...guardArgs),
    // The pages computed before this game are out of date (src/snapshot.ts).
    query("INSERT INTO events (kind,at) VALUES ('archive',?)", now),
  ];
}

/** Builds the entries of a few archived games that have none yet (or of an older version). */
export async function indexPending(limit = PENDING_PER_REQUEST): Promise<void> {
  const pending = await rows<{ matchKey: string; objectKey: string }>(
    "SELECT m.matchKey,r.objectKey FROM archive_matches m JOIN archive_revisions r ON r.matchKey=m.matchKey AND r.kind='details' AND r.sha256=m.detailsHash WHERE m.queueId=2400 AND NOT EXISTS (SELECT 1 FROM archive_indexed i WHERE i.matchKey=m.matchKey AND i.version=?) ORDER BY m.gameCreation LIMIT ?",
    ARCHIVE_ENTRY_VERSION, limit);
  if (!pending.length) return;
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  for (const p of pending) {
    let raw: RawGame | null = null;
    try {
      const object = await archiveBucket().get(p.objectKey);
      if (!object) continue; // not readable right now: tried again later
      const value = JSON.parse(await new Response(object.body.pipeThrough(new DecompressionStream('gzip'))).text()) as RawGame;
      raw = Array.isArray(value?.participants) && Array.isArray(value?.participantIdentities) ? value : null;
    } catch {
      raw = null;
    }
    statements.push(...(raw ? entryStatements(p.matchKey, raw, now).slice(0, -1)
      : [query('INSERT INTO archive_indexed (matchKey,version,ok,at) VALUES (?,?,0,?) ON CONFLICT(matchKey) DO UPDATE SET version=excluded.version,ok=0,at=excluded.at', p.matchKey, ARCHIVE_ENTRY_VERSION, now)]));
  }
  if (!statements.length) return;
  statements.push(query("INSERT INTO events (kind,at) VALUES ('archive',?)", now), query('DELETE FROM events WHERE at<?', now - 86400000));
  await db().batch(statements);
}
