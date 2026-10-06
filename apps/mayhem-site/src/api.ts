import { z } from 'zod';
import { db, query, rows, hash, secret, archiveBucket } from './storage';
import { uploadSchema, augmentUploadSchema, groupSchema, memberSchema, hideSchema, puuid, quality, canonical, lobbyCanonical } from './validation';
import { standings, rankResult, seasonOf, RATING_VERSION } from './features/aram/aramRating';
import { open, summary, type Standing } from './summary';
import type { AramEntry } from './adapters/aram';
import { archiveRoute } from './archive';
import { gameView, type RawGame } from './game';
import { recordRanking, recordsView } from './records';
import { placesOf } from './places';
import { championsView, championView } from './champions';
import { counted, metaDetail, metaView } from './meta';
import { freshRecords, startView, TOP } from './start';
import { membersOf, sessionsOf } from './group';
import { decodeBase64, iconOf, type AugmentInfo, type Rarity } from './augments';
import { findPlayer, withoutHidden } from './hidden';
import { isFresh, snapshotKey, SNAPSHOT_MAX, type Snapshot } from './snapshot';
import { ARCHIVE_ENTRY_VERSION, archiveIdOf, mergeEntries, publicId } from './archive-entries';
import { indexPending } from './archive-index';
import { puuidsIn, withPublicIds } from './public-ids';
class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
const fail = (status: number, message: string): never => { throw new ApiError(status, message); };
const json = (data: unknown, status = 200) => Response.json(data, { status });
/** A reading page from its snapshot (src/snapshot.ts), or computed and stored. The cursor is read
 * before computing, so an upload during the computation makes the next request compute again. */
async function cached(url: URL, make: () => Promise<Response>): Promise<Response> {
    await indexSome();
    const key = snapshotKey(url.pathname.replace(/\/$/, ''), url.searchParams);
    const cursor = (await rows<{ id: number }>('SELECT COALESCE(MAX(id),0) id FROM events'))[0].id;
    const now = Date.now();
    const stored = (await rows<Snapshot & { json: string }>('SELECT version,cursor,at,json FROM snapshots WHERE key=?', key))[0];
    if (isFresh(stored, now, RATING_VERSION, cursor))
        return new Response(stored.json, { headers: { 'Content-Type': 'application/json' } });
    const response = await make();
    if (!response.ok)
        return response;
    const text = await response.text();
    if (text.length <= SNAPSHOT_MAX)
        await query('INSERT INTO snapshots (key,version,cursor,at,json) VALUES (?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET version=excluded.version,cursor=excluded.cursor,at=excluded.at,json=excluded.json', key, RATING_VERSION, cursor, now, text).run();
    return new Response(text, { status: response.status, headers: response.headers });
}
/** Builds the entries of a few older archived games (src/archive-index.ts); a missing or unreadable
 * archive never breaks a page. */
async function indexSome() {
    try {
        await indexPending();
    }
    catch {
        console.error('Archive entries not built');
    }
}
const codeCheck = (s: string) => /^[A-Za-z0-9]{12}$/.test(s) ? s : fail(400, 'Ungültiger Gruppencode');
async function body(req: Request) { const reader = req.body?.getReader(); let bytes = 0; const chunks: Uint8Array[] = []; if (reader)
    for (;;) {
        const v = await reader.read();
        if (v.done)
            break;
        bytes += v.value.length;
        if (bytes > 65536) {
            await reader.cancel();
            fail(413, 'Maximal 64 KB');
        }
        chunks.push(v.value);
    } const all = new Uint8Array(bytes); let at = 0; for (const c of chunks) {
    all.set(c, at);
    at += c.length;
} try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(all));
}
catch {
    fail(400, 'Ungültiges JSON');
} }
/** Reads the rest of a request body and throws it away. An answer that leaves the body unread
 * (the group restart, and every early 400/401/403/404/429) breaks the connection it came in on:
 * the next write request on the same connection fails without ever reaching the Worker — in the
 * local preview with „Your worker restarted mid-request“ and HTTP 503 (measured: 6 of 150).
 * Capped like `body`, so a huge body is cut off instead of read. */
async function drain(req: Request) { if (!req.body || req.bodyUsed || req.body.locked)
    return; try {
    const reader = req.body.getReader();
    let bytes = 0;
    for (;;) {
        const v = await reader.read();
        if (v.done)
            break;
        bytes += v.value.length;
        if (bytes > 65536) {
            await reader.cancel();
            break;
        }
    }
}
catch { /* nothing left to read: an already broken connection needs no draining */ } }
async function authorize(req: Request, id: string) { const token = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''; const p = (await rows<{
    tokenHash: string;
}>('SELECT tokenHash FROM players WHERE puuid=?', id))[0]; if (!p?.tokenHash || await hash(token) !== p.tokenHash)
    fail(401, 'Persönlicher Bearer-Schlüssel erforderlich'); }
async function group(code: string) { const g = (await rows<{
    code: string;
    name: string;
    since: number;
    createdAt: number;
    adminHash: string;
}>('SELECT * FROM groups WHERE code=?', codeCheck(code)))[0]; if (!g)
    fail(404, 'Gruppe nicht gefunden'); return g; }
async function context(url: URL) { const id = url.searchParams.get('season') ?? `v${RATING_VERSION}`; const season = (await rows<{
    id: string;
    start: number;
    ratingVersion: number;
}>('SELECT * FROM seasons WHERE id=?', id))[0]; if (!season)
    fail(404, 'Saison nicht gefunden'); if (season.ratingVersion !== RATING_VERSION)
    fail(409, 'Diese Saison benötigt eine andere Rating-Version'); const code = url.searchParams.get('group'); const g = code ? await group(code) : null; return { season, group: g ? { code: g.code, name: g.name, since: g.since } : null, since: Math.max(season.start, g?.since ?? 0) }; }
/**
 * The counted entries from `since` on: the uploads and, with `withArchive`, every player of the
 * archived games (src/archive-entries.ts), one entry per player and game. Players without a profile
 * appear under their public id (`a<number>`), never their PUUID; those who asked not to be named not
 * at all. `player` is a PUUID.
 */
async function entries(since = 0, code: string | null = null, player: string | null = null, includeDisputed = false, withArchive = false) { let sql = 'SELECT g.json,g.disputed FROM games g WHERE g.at>=?'; const args: unknown[] = [since]; if (!includeDisputed)
    sql += ' AND g.disputed=0'; if (code) {
    sql += ' AND EXISTS (SELECT 1 FROM group_members m WHERE m.code=? AND m.puuid=g.puuid)';
    args.push(code);
} if (player) {
    sql += ' AND g.puuid=?';
    args.push(player);
} sql += ' ORDER BY g.at,g.gameId,g.puuid'; const hidden = await hiddenPlayers(); const uploads = (await rows<{
    json: string;
    disputed: number;
}>(sql, ...args)).map(r => ({ ...withoutHidden(JSON.parse(r.json) as AramEntry, hidden), ...(includeDisputed ? { disputed: !!r.disputed } : {}) })) as AramEntry[];
    if (!withArchive)
        return uploads;
    return mergeEntries(uploads, await archiveOnly(since, code, player, hidden));
}
/** The archive's entries (see entries), already under the id the pages use. */
async function archiveOnly(since: number, code: string | null, player: string | null, hidden: ReadonlySet<string>): Promise<AramEntry[]> {
    const registered = await registeredPlayers();
    const members = code ? new Set((await rows<{ puuid: string }>('SELECT puuid FROM group_members WHERE code=?', code)).map(r => r.puuid)) : null;
    let sql = 'SELECT e.json,p.id,p.puuid FROM archive_entries e JOIN archive_players p ON p.id=e.playerId JOIN archive_indexed i ON i.matchKey=e.matchKey AND i.version=? WHERE e.at>=?';
    const args: unknown[] = [ARCHIVE_ENTRY_VERSION, since];
    if (player) {
        sql += ' AND p.puuid=?';
        args.push(player);
    }
    const list: AramEntry[] = [];
    for (const r of await rows<{ json: string; id: number; puuid: string }>(sql, ...args)) {
        const known = registered.has(r.puuid);
        if (!known && hidden.has(r.puuid))
            continue;
        if (members && !members.has(r.puuid))
            continue;
        const entry = JSON.parse(r.json) as AramEntry;
        list.push({ ...entry, puuid: known ? r.puuid : publicId(r.id) });
    }
    return list;
}
/** All games the site knows: uploaded or archived. */
async function trackedCount() { return (await rows<{ count: number }>('SELECT COUNT(*) AS count FROM (SELECT gameId FROM games UNION SELECT gameId FROM archive_entries)'))[0].count; }
/** Players with a profile: they upload themselves and keep their PUUID on the pages. */
async function registeredPlayers() { return new Set((await rows<{ puuid: string }>('SELECT DISTINCT puuid FROM games')).map(r => r.puuid)); }
/** PUUIDs of players without a profile who asked not to be named (/datenschutz/entfernen). */
/** The public ids of these PUUIDs (src/public-ids.ts); a PUUID without one gets one now. */
async function publicIdsOf(puuids: ReadonlySet<string>) {
    const ids = new Map<string, string>();
    const read = async (list: string[]) => { for (let i = 0; i < list.length; i += 90) {
        const part = list.slice(i, i + 90);
        for (const r of await rows<{ id: number; puuid: string }>(`SELECT id,puuid FROM archive_players WHERE puuid IN (${part.map(() => '?').join(',')})`, ...part))
            ids.set(r.puuid, publicId(r.id));
    } };
    await read([...puuids]);
    const missing = [...puuids].filter(p => !ids.has(p));
    if (missing.length) {
        await db().batch(missing.map(p => query('INSERT OR IGNORE INTO archive_players (puuid) VALUES (?)', p)));
        await read(missing);
    }
    return ids;
}
/** An answer without PUUIDs (user's decision: none leaves the server), except the one the request named. */
async function masked<T>(value: T, keep: string | null = null): Promise<T> { return withPublicIds(value, await publicIdsOf(puuidsIn(value, keep)), keep); }
async function hiddenPlayers() { return new Set((await rows<{ puuid: string }>('SELECT puuid FROM hidden_players')).map(r => r.puuid)); }
async function withIcons(list: Standing[]) { const known = await playersOf(list.map(s => s.puuid)); return list.map(s => summary(s, known.get(s.puuid)?.icon ?? null)); }
async function rate(req: Request) { const ip = req.headers.get('cf-connecting-ip') ?? 'local'; const now = Date.now(), bucket = Math.floor(now / 60000); const key = await hash(`${bucket}:${ip}`); const results = await db().batch([query('DELETE FROM rate_limits WHERE expires<=?', now), query('INSERT INTO rate_limits (key,expires,count) VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count', key, (bucket + 1) * 60000)]); const count = (results[1].results[0] as {
    count: number;
}).count; if (count > 30)
    fail(429, 'Höchstens 30 API-Anfragen pro Minute und IP'); }
async function upload(req: Request, url: URL) {
    const b = uploadSchema.parse(await body(req));
    const g = b.group ? await group(b.group) : null;
    const lobbyChecks = new Map<number, string>();
    for (const e of b.entries) {
        if (e.lobby?.length) {
            const h = lobbyCanonical(e);
            if (lobbyChecks.has(e.gameId) && lobbyChecks.get(e.gameId) !== h)
                fail(400, 'Widersprüchliche Lobbys innerhalb desselben Uploads');
            lobbyChecks.set(e.gameId, h);
        }
    }
    const old = (await rows<{
        tokenHash: string | null;
    }>('SELECT tokenHash FROM players WHERE puuid=?', b.player.puuid))[0];
    let playerToken: string | undefined;
    let tokenHash = old?.tokenHash;
    if (tokenHash)
        await authorize(req, b.player.puuid);
    else {
        const supplied = req.headers.get('authorization')?.replace(/^Bearer /, '');
        if (supplied && !/^[a-f0-9]{64}$/.test(supplied))
            fail(400, 'Neuer Schlüssel muss aus 64 zufälligen Hex-Zeichen bestehen');
        playerToken = supplied ?? secret();
        tokenHash = await hash(playerToken);
    }
    await query('INSERT INTO players (puuid,name,icon,lastSeen,tokenHash) VALUES (?,?,?,?,?) ON CONFLICT(puuid) DO UPDATE SET tokenHash=COALESCE(players.tokenHash,excluded.tokenHash)', b.player.puuid, b.player.name, b.player.icon, Date.now(), tokenHash).run();
    const claimed = (await rows<{
        tokenHash: string;
    }>('SELECT tokenHash FROM players WHERE puuid=?', b.player.puuid))[0];
    if (claimed.tokenHash !== tokenHash)
        fail(409, 'Spieler wurde gleichzeitig registriert');
    const now = Date.now();
    // Uploading means being shown: an earlier wish not to be named ends here.
    const statements: D1PreparedStatement[] = [query('INSERT INTO players (puuid,name,icon,lastSeen,tokenHash) VALUES (?,?,?,?,?) ON CONFLICT(puuid) DO UPDATE SET name=excluded.name,icon=excluded.icon,lastSeen=excluded.lastSeen,tokenHash=COALESCE(players.tokenHash,excluded.tokenHash)', b.player.puuid, b.player.name, b.player.icon, now, tokenHash), query('DELETE FROM hidden_players WHERE puuid=?', b.player.puuid)];
    if (g)
        statements.push(query('INSERT OR IGNORE INTO group_members (code,puuid) VALUES (?,?)', g.code, b.player.puuid));
    const storedIndexes: number[] = [];
    for (const e of b.entries) {
        const q = quality(e);
        if (e.lobby?.length) {
            const lh = await hash(lobbyCanonical(e));
            statements.push(query('INSERT INTO reports (gameId,uploader,quality,lobbyHash) VALUES (?,?,?,?) ON CONFLICT(gameId,uploader) DO UPDATE SET quality=excluded.quality,lobbyHash=excluded.lobbyHash WHERE excluded.quality>reports.quality', e.gameId, b.player.puuid, q, lh));
        }
        statements.push(query('INSERT INTO players (puuid,name,icon,lastSeen) VALUES (?,?,0,?) ON CONFLICT(puuid) DO NOTHING', e.puuid, e.name, now));
        storedIndexes.push(statements.length);
        statements.push(query('INSERT INTO games (gameId,puuid,name,at,quality,receivedAt,sourceHash,json,disputed) VALUES (?,?,?,?,?,?,?,?,0) ON CONFLICT(gameId,puuid) DO UPDATE SET name=excluded.name,at=excluded.at,quality=excluded.quality,receivedAt=excluded.receivedAt,sourceHash=excluded.sourceHash,json=excluded.json WHERE excluded.quality>games.quality RETURNING gameId', e.gameId, e.puuid, e.name, e.at, q, now, await hash(canonical(e)), JSON.stringify(e)));
        // changes() refers to the preceding UPSERT, so unchanged submissions create no game event.
        statements.push(query("INSERT INTO events (gameId,puuid,kind,at) SELECT ?,?,'game',? WHERE changes()>0", e.gameId, e.puuid, now));
    }
    for (const gameId of new Set(b.entries.map(e => e.gameId))) {
        statements.push(query("INSERT INTO events (gameId,puuid,kind,at) SELECT gameId,puuid,'game',? FROM games WHERE gameId=? AND disputed <> CASE WHEN (SELECT COUNT(DISTINCT lobbyHash) FROM reports WHERE gameId=?)>1 THEN 1 ELSE 0 END", now, gameId, gameId));
        statements.push(query('UPDATE games SET disputed=CASE WHEN (SELECT COUNT(DISTINCT lobbyHash) FROM reports WHERE gameId=?)>1 THEN 1 ELSE 0 END WHERE gameId=?', gameId, gameId));
    }
    statements.push(query('DELETE FROM events WHERE at<?', now - 86400000));
    const result = await db().batch(statements);
    // First-claim races must never return a token that was not actually installed.
    if (playerToken) {
        const installed = (await rows<{
            tokenHash: string;
        }>('SELECT tokenHash FROM players WHERE puuid=?', b.player.puuid))[0];
        if (installed.tokenHash !== tokenHash)
            fail(409, 'Spieler wurde gleichzeitig registriert; persönlichen Schlüssel verwenden');
    }
    const c = await context(new URL(url.origin + '/api/leaderboard' + (g ? '?group=' + g.code : '')));
    // A rank needs only the player's own games (with the archived ones, as on the pages).
    const own = new Map<string, AramEntry[]>();
    for (const id of new Set(b.entries.map(e => e.puuid)))
        own.set(id, await entries(c.since, g?.code ?? null, id, false, true));
    return json({ results: b.entries.map((e, i) => ({ gameId: e.gameId, puuid: e.puuid, stored: result[storedIndexes[i]].results.length > 0, rank: rankResult(own.get(e.puuid)!, e.puuid, e.gameId, c.since) })), ...(playerToken ? { playerToken } : {}), season: c.season, group: c.group });
}
async function live(req: Request, url: URL) {
    await context(url); // rejects an unknown season or group before the stream opens
    const last = req.headers.get('last-event-id') ?? url.searchParams.get('cursor');
    let cursor = last ? Number(last) : (await rows<{
        id: number;
    }>('SELECT COALESCE(MAX(id),0) id FROM events'))[0].id;
    if (!Number.isSafeInteger(cursor) || cursor < 0)
        fail(400, 'Ungültiger Ereignis-Cursor');
    let closed = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const encoder = new TextEncoder();
    const started = Date.now();
    const send = (s: string) => { if (!closed)
        controller.enqueue(encoder.encode(s)); };
    const stop = () => { if (closed)
        return; closed = true; clearTimeout(timer); try {
        controller.close();
    }
    catch { } };
    const stream = new ReadableStream<Uint8Array>({ start(ctrl) {
            controller = ctrl;
            send(`retry: 3000\nevent: ready\ndata: ${JSON.stringify({ cursor, intervalMs: 5000 })}\n\n`);
            const tick = async () => {
                try {
                    const ev = await rows<{
                        id: number;
                        gameId: number | null;
                        puuid: string | null;
                        kind: string;
                    }>('SELECT id,gameId,puuid,kind FROM events WHERE id>? ORDER BY id LIMIT 100', cursor);
                    if (ev.length) {
                        const fresh = await context(url);
                        const hidden = await hiddenPlayers();
                        const memberIds = fresh.group ? new Set((await rows<{
                            puuid: string;
                        }>('SELECT puuid FROM group_members WHERE code=?', fresh.group.code)).map(m => m.puuid)) : null;
                        let reset = false;
                        for (const e of ev) {
                            cursor = e.id;
                            if (e.kind !== 'game') {
                                // Many archived games arrive at once: one reload is enough.
                                reset = true;
                                continue;
                            }
                            if (memberIds && !memberIds.has(e.puuid!))
                                continue;
                            const row = (await rows<{
                                json: string;
                                disputed: number;
                            }>('SELECT json,disputed FROM games WHERE gameId=? AND puuid=?', e.gameId, e.puuid))[0];
                            if (row)
                                send(`id: ${cursor}\nevent: game\ndata: ${JSON.stringify(await masked({ entry: withoutHidden(JSON.parse(row.json) as AramEntry, hidden), disputed: !!row.disputed, rank: row.disputed ? null : rankResult(await entries(fresh.since, fresh.group?.code ?? null, e.puuid, false, true), e.puuid!, e.gameId!, fresh.since) }))}\n\n`);
                        }
                        if (reset)
                            send(`id: ${cursor}\nevent: reset\ndata: {}\n\n`);
                    }
                    send(`id: ${cursor}\nevent: heartbeat\ndata: {}\n\n`);
                    if (Date.now() - started > 45000) {
                        stop();
                        return;
                    }
                    timer = setTimeout(tick, 5000);
                }
                catch {
                    send('event: unavailable\ndata: {}\n\n');
                    stop();
                }
            };
            timer = setTimeout(tick, 0);
            req.signal.addEventListener('abort', stop, { once: true });
        }, cancel() { stop(); } });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
}
/** One game with all ten players (/spiel/<id>): uploaded or archived; the names come from the raw
 * archive when it holds the game, and no PUUID of a player without a profile leaves here (they are
 * linked by their public id). */
async function game(gameId: number) {
    const uploaded = await rows<{ json: string; disputed: number }>('SELECT json,disputed FROM games WHERE gameId=? ORDER BY quality DESC,puuid', gameId);
    const raw = await archived(gameId);
    if (!uploaded.length && !raw)
        fail(404, 'Spiel nicht gefunden');
    const hidden = await hiddenPlayers();
    const list = uploaded.map(r => withoutHidden(JSON.parse(r.json) as AramEntry, hidden));
    const ids = [...new Set([...list.flatMap(e => [e.puuid, ...e.with.map(m => m.puuid)]), ...(raw?.participantIdentities.map(i => i.player.puuid) ?? [])])];
    const registered = new Set<string>();
    const links = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 50) {
        const part = ids.slice(i, i + 50);
        for (const r of await rows<{ puuid: string }>(`SELECT DISTINCT puuid FROM games WHERE puuid IN (${part.map(() => '?').join(',')})`, ...part))
            registered.add(r.puuid);
        // Everyone else in the archive has a profile under a public id (src/archive-entries.ts).
        for (const r of await rows<{ id: number; puuid: string }>(`SELECT id,puuid FROM archive_players WHERE puuid IN (${part.map(() => '?').join(',')})`, ...part))
            links.set(r.puuid, publicId(r.id));
    }
    return gameView(list, raw, registered, uploaded.some(r => r.disputed), hidden, links) ?? fail(404, 'Spiel nicht gefunden');
}
/** Not being named (POST /api/ausblenden, /datenschutz/entfernen): a Riot ID from one uploaded or archived game
 * disappears from every page and the API, in every game. No proof needed, because hiding only shows
 * less; players with a profile are not hidden this way (they delete with their key). Only the PUUID
 * is kept. Undoing is up to the operator, or the player uploads themselves. */
async function hide(req: Request) {
    const b = hideSchema.parse(await body(req));
    const uploaded = await rows<{ json: string }>('SELECT json FROM games WHERE gameId=?', b.gameId);
    const raw = await archived(b.gameId);
    if (!uploaded.length && !raw)
        fail(404, 'Spiel nicht gefunden');
    const id = findPlayer(b.name, uploaded.map(r => JSON.parse(r.json) as AramEntry), raw) ?? fail(404, 'Diese Riot-ID kommt in dem Spiel nicht vor. Bitte mit #Tag eingeben.');
    if ((await rows('SELECT 1 FROM games WHERE puuid=? LIMIT 1', id)).length)
        fail(409, 'Dieser Spieler lädt selbst hoch und hat ein Profil. Löschen geht in blank. mit dem eigenen Schlüssel.');
    await db().batch([query('INSERT OR IGNORE INTO hidden_players (puuid,at) VALUES (?,?)', id, Date.now()), query('DELETE FROM snapshots'), query("INSERT INTO events (kind,at) VALUES ('reset',?)", Date.now())]);
    return json({ hidden: true });
}
/** The records (/rekorde): every category's best ten players with the game of their value, all time
 * or this season (seasonOf, three a year), optionally of one group from its start. */
async function records(url: URL) {
    const c = await context(url);
    const scope = url.searchParams.get('scope') ?? 'all';
    if (scope !== 'all' && scope !== 'season')
        fail(400, 'scope muss all oder season sein');
    const now = Date.now();
    const season = seasonOf(now);
    const all = await entries(scope === 'season' ? Math.max(c.since, season.start) : c.since, c.group?.code ?? null, null, false, true);
    const ids = [...new Set(all.map(e => e.puuid))];
    return json({ scope, season: { id: season.id, year: season.year, number: season.number, start: season.start }, group: c.group, games: new Set(all.map(e => e.gameId)).size, players: ids.length, categories: recordsView(all, now, await playersOf(ids)) });
}
/** The start page (/): head numbers, the top ten of the ladder, the games of the day, the grades of
 * the season and this week's new records. All players, no group. */
async function start() {
    const c = await context(new URL('http://x/'));
    const now = Date.now();
    const all = await entries(c.since, null, null, false, true);
    const list = standings(all, c.since);
    const trackedGames = await trackedCount();
    const ids = [...new Set(all.map(e => e.puuid))];
    const view = startView(list, now, seasonOf(now).start);
    return json({ season: c.season, trackedGames, ...view, top: await withIcons(list.slice(0, TOP)), records: freshRecords(recordsView(all, now, await playersOf(ids))) });
}
/** A player's own places (/api/plaetze/<public id>, "Deine Plätze"): ladder, Leistung Ø and every
 * record category of all time, best first. Only a public id (a123), never a PUUID. */
async function places(id: string) {
    const c = await context(new URL('http://x/'));
    const archiveId = archiveIdOf(id) ?? fail(404, 'Spieler nicht gefunden');
    const row = (await rows<{ puuid: string }>('SELECT puuid FROM archive_players WHERE id=?', archiveId))[0] ?? fail(404, 'Spieler nicht gefunden');
    // Players with a profile keep their PUUID in the entries, everyone else the public id.
    const key = (await registeredPlayers()).has(row.puuid) ? row.puuid : id;
    const all = await entries(c.since, null, null, false, true);
    const view = placesOf(standings(all, c.since), recordRanking(all, Date.now()), key);
    return view ? json({ id, season: c.season, ...view }) : fail(404, 'Spieler nicht gefunden');
}
/** A group's page (/gruppe/<code>): its ladder, what the duel needs of every member and its game
 * nights. Only members, from the group's start on. */
async function groupPage(code: string) {
    const url = new URL('http://x/');
    url.searchParams.set('group', code);
    const c = await context(url);
    const list = standings(await entries(c.since, c.group!.code, null, false, true), c.since);
    return json({ group: c.group, season: c.season, players: await withIcons(list), members: membersOf(list), sessions: sessionsOf(list) });
}
/** Current name and icon of these players: from the profile, or for a public id (`a<number>`) from
 * the player's newest archived game. */
async function playersOf(ids: string[]) {
    const players = new Map<string, { name: string; icon: number | null }>();
    const archived = ids.flatMap(id => { const n = archiveIdOf(id); return n === null ? [] : [n]; });
    for (let i = 0; i < archived.length; i += 50) {
        const part = archived.slice(i, i + 50);
        // SQLite takes the other columns from the row of MAX(at).
        for (const r of await rows<{ playerId: number; name: string | null; icon: number | null; at: number }>(`SELECT playerId,name,icon,MAX(at) AS at FROM archive_entries WHERE playerId IN (${part.map(() => '?').join(',')}) GROUP BY playerId`, ...part))
            players.set(publicId(r.playerId), { name: r.name ?? '', icon: r.icon });
    }
    ids = ids.filter(id => archiveIdOf(id) === null);
    for (let i = 0; i < ids.length; i += 50) {
        const part = ids.slice(i, i + 50);
        for (const r of await rows<{ puuid: string; name: string; icon: number | null }>(`SELECT puuid,name,icon FROM players WHERE puuid IN (${part.map(() => '?').join(',')})`, ...part))
            players.set(r.puuid, { name: r.name, icon: r.icon });
    }
    return players;
}
/** The games of the champions pages: all time or this season, optionally of one group. */
async function championGames(url: URL) {
    const c = await context(url);
    const scope = url.searchParams.get('scope') ?? 'all';
    if (scope !== 'all' && scope !== 'season')
        fail(400, 'scope muss all oder season sein');
    const season = seasonOf(Date.now());
    const all = await entries(scope === 'season' ? Math.max(c.since, season.start) : c.since, c.group?.code ?? null, null, false, true);
    return { scope, season: { id: season.id, year: season.year, number: season.number, start: season.start }, group: c.group, all };
}
/** All champions (/champions): every seat of the counted games, no names. */
async function champions(url: URL) {
    const { all, ...head } = await championGames(url);
    return json({ ...head, games: new Set(all.map(e => e.gameId)).size, champions: championsView(all) });
}
/** One champion (/champions/<name>, by Data Dragon key or ID): only players with a profile. */
async function champion(url: URL, name: string) {
    const { all, ...head } = await championGames(url);
    const championId = /^[0-9]+$/.test(name) ? Number(name) : all.find(e => e.champion.toLowerCase() === name.toLowerCase())?.championId ?? fail(404, 'Keine Spiele mit diesem Champion');
    const view = championView(all, championId, await playersOf([...new Set(all.filter(e => e.championId === championId).map(e => e.puuid))]));
    return json({ ...head, champion: view ?? fail(404, 'Keine Spiele mit diesem Champion') });
}
/** The archived raw game, or null (not archived, or the archive is unavailable: the page then
 * falls back to the uploads). */
/** All augments or items (/augments, /items): every counted player and game, no names. */
async function meta(url: URL, kind: 'augments' | 'items') {
    const { all, ...head } = await championGames(url);
    return json({ ...head, games: new Set(all.map(e => e.gameId)).size, entries: counted(all).length, rows: metaView(all, kind) });
}
/** One augment or item (/augments/<id>, /items/<id>). */
async function metaOne(url: URL, kind: 'augments' | 'items', id: number) {
    const { all, ...head } = await championGames(url);
    return json({ ...head, detail: metaDetail(all, kind, id) ?? fail(404, kind === 'augments' ? 'Keine Spiele mit diesem Augment' : 'Keine Spiele mit diesem Item') });
}
/** Names, rarity and whether an icon exists, for every known augment (GET /api/augments). */
async function augmentList() {
    const list = await rows<{ id: number; name: string; rarity: Rarity; icon: number }>('SELECT id,name,rarity,icon IS NOT NULL AS icon FROM augments');
    const augments: Record<string, AugmentInfo> = {};
    for (const a of list)
        augments[a.id] = { name: a.name, rarity: a.rarity, icon: !!a.icon };
    return Response.json({ augments }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
/** Augments from blank. (POST /api/augments): only with the player's key and only augments that
 * appear in an uploaded game. The first name stays; an icon is added when there was none. */
async function uploadAugments(req: Request) {
    const b = augmentUploadSchema.parse(await body(req));
    await authorize(req, b.puuid);
    const ids = b.augments.map(a => a.id);
    const seen = new Set((await rows<{ id: number }>(`SELECT DISTINCT CAST(j.value AS INTEGER) AS id FROM games, json_each(games.json,'$.augments') j WHERE CAST(j.value AS INTEGER) IN (${ids.map(() => '?').join(',')})`, ...ids)).map(r => r.id));
    const now = Date.now();
    const statements = b.augments.filter(a => seen.has(a.id)).map(a => {
        const icon = a.icon === null ? null : iconOf(a.icon);
        if (a.icon !== null && icon === null)
            fail(400, `Symbol von Augment ${a.id} ist kein kleines PNG`);
        return query('INSERT INTO augments (id,name,rarity,icon,receivedAt) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET icon=excluded.icon,receivedAt=excluded.receivedAt WHERE augments.icon IS NULL AND excluded.icon IS NOT NULL', a.id, a.name.trim(), a.rarity, icon, now);
    });
    if (statements.length)
        await db().batch(statements);
    const have = await rows<{ id: number }>(`SELECT id FROM augments WHERE icon IS NOT NULL AND id IN (${ids.map(() => '?').join(',')})`, ...ids);
    return json({ have: have.map(r => r.id).sort((a, c) => a - c) });
}
/** One augment icon (GET /api/augments/<id>.png): outside the rate limit, cached by browsers. */
async function augmentIcon(id: number) {
    const icon = (await rows<{ icon: string | null }>('SELECT icon FROM augments WHERE id=?', id))[0]?.icon;
    const bytes = icon ? decodeBase64(icon) : null;
    if (!bytes)
        return new Response('Nicht gefunden', { status: 404, headers: { 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
    return new Response(bytes.buffer as ArrayBuffer, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" } });
}
async function archived(gameId: number): Promise<RawGame | null> {
    try {
        const revision = (await rows<{ objectKey: string }>("SELECT r.objectKey FROM archive_matches m JOIN archive_revisions r ON r.matchKey=m.matchKey AND r.kind='details' AND r.sha256=m.detailsHash WHERE m.gameId=? AND m.queueId=2400 ORDER BY m.receivedAt LIMIT 1", gameId))[0];
        if (!revision)
            return null;
        const object = await archiveBucket().get(revision.objectKey);
        if (!object)
            return null;
        const text = await new Response(object.body.pipeThrough(new DecompressionStream('gzip'))).text();
        const value = JSON.parse(text) as RawGame;
        return value.gameId === gameId && Array.isArray(value.participants) && Array.isArray(value.participantIdentities) ? value : null;
    }
    catch {
        return null;
    }
}
export async function handle(req: Request) {
    const url = new URL(req.url);
    const origin = req.headers.get('origin');
    const allowed = !origin || origin === url.origin || origin === 'http://tauri.localhost';
    let response: Response;
    try {
        if (!allowed)
            fail(403, 'Origin nicht erlaubt');
        const icon = url.pathname.match(/^\/api\/augments\/([1-9][0-9]{0,6})\.png$/);
        // Pages show many icons at once; they are only read, so they stay outside the rate limit.
        if (icon && req.method === 'GET')
            return await augmentIcon(Number(icon[1]));
        if (req.method === 'OPTIONS')
            response = new Response(null, { status: 204 });
        else {
            // Only writes are limited (PLAN.md): reading pages polls and loads several parts at once,
            // and a visitor clicking through the site must never see an error for it.
            if (req.method !== 'GET')
                await rate(req);
            await query('INSERT OR IGNORE INTO seasons (id,start,ratingVersion) VALUES (?,?,?)', `v${RATING_VERSION}`, 1577836800000, RATING_VERSION).run();
            response = await dispatch(req, url);
            if (req.method === 'GET' && response.headers.get('Content-Type')?.includes('application/json')) {
                // Only blank. reading its own profile names a PUUID; it may come back as it is.
                const named = url.pathname.match(/^\/api\/players\/([^/]+)\/?$/);
                const data = await masked(await response.json(), named ? decodeURIComponent(named[1]) : null);
                const headers = new Headers(response.headers);
                headers.delete('Content-Length');
                response = new Response(JSON.stringify(data), { status: response.status, headers });
            }
        }
    }
    catch (e) {
        if (e instanceof z.ZodError)
            response = json({ error: 'Ungültige Daten', reasons: e.issues.map(i => `${i.path.join('.')}: ${i.message}`) }, 400);
        else if (e instanceof ApiError)
            response = json({ error: e.message }, e.status);
        else {
            console.error('API operation failed');
            response = json({ error: 'Dienst vorübergehend nicht verfügbar. Bitte erneut versuchen.' }, 503);
        }
    }
    await drain(req);
    const h = new Headers(response.headers);
    h.set('Cache-Control', h.get('Cache-Control') ?? 'no-store');
    h.set('Vary', 'Origin');
    h.set('X-Content-Type-Options', 'nosniff');
    if (origin && allowed)
        h.set('Access-Control-Allow-Origin', origin);
    h.set('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    h.set('Access-Control-Allow-Headers', 'Content-Type,Authorization,Last-Event-ID');
    h.set('Access-Control-Max-Age', '600');
    if (response.status === 429)
        h.set('Retry-After', '60');
    return new Response(response.body, { status: response.status, headers: h });
}
async function dispatch(req: Request, url: URL): Promise<Response> {
    const path = url.pathname.replace(/\/$/, '');
    const method = req.method;
    if (path.startsWith('/api/archive/')) return archiveRoute(req, url);
    if (path === '/api/games' && method === 'POST')
        return upload(req, url);
    if (path === '/api/live' && method === 'GET')
        return live(req, url);
    if (path === '/api/leaderboard' && method === 'GET')
        return cached(url, async () => {
            const c = await context(url);
            const all = await entries(c.since, c.group?.code ?? null, null, false, true);
            // Global stored matches (uploaded or archived), independent of group/season and duplicates.
            const trackedGames = await trackedCount();
            return json({ ...c, ratingVersion: RATING_VERSION, trackedGames, players: await withIcons(standings(all, c.since)) });
        });
    if (path === '/api/games' && method === 'GET') {
        const code = url.searchParams.get('group');
        const g = code ? await group(code) : null;
        const since = Number(url.searchParams.get('since') ?? 0);
        if (!Number.isSafeInteger(since) || since < 0)
            fail(400, 'since muss ein positiver Millisekunden-Zeitstempel sein');
        return json({ entries: await entries(Math.max(since, g?.since ?? 0), code), disputed: await rows<{
                gameId: number;
                puuid: string;
            }>('SELECT gameId,puuid FROM games WHERE disputed=1 AND at>=? AND (? IS NULL OR puuid IN (SELECT puuid FROM group_members WHERE code=?))', Math.max(since, g?.since ?? 0), code, code), since: Math.max(since, g?.since ?? 0) });
    }
    if (path === '/api/augments' && method === 'GET')
        return augmentList();
    if (path === '/api/ausblenden' && method === 'POST')
        return hide(req);
    if (path === '/api/augments' && method === 'POST')
        return uploadAugments(req);
    const gp = path.match(/^\/api\/gruppe\/([A-Za-z0-9]{12})$/);
    if (gp && method === 'GET')
        return cached(url, () => groupPage(gp[1]));
    if (path === '/api/start' && method === 'GET')
        return cached(url, start);
    const pl = path.match(/^\/api\/plaetze\/(a[1-9][0-9]{0,9})$/);
    if (pl && method === 'GET')
        return cached(url, () => places(pl[1]));
    if (path === '/api/rekorde' && method === 'GET')
        return cached(url, () => records(url));
    if (path === '/api/champions' && method === 'GET')
        return cached(url, () => champions(url));
    const cm = path.match(/^\/api\/champions\/([1-9][0-9]{0,4}|[A-Za-z][A-Za-z0-9]{0,29})$/);
    if (cm && method === 'GET')
        return cached(url, () => champion(url, cm[1]));
    const st = path.match(/^\/api\/stats\/(augments|items)(?:\/([1-9][0-9]{0,6}))?$/);
    if (st && method === 'GET') {
        const kind = st[1] as 'augments' | 'items';
        return cached(url, () => (st[2] ? metaOne(url, kind, Number(st[2])) : meta(url, kind)));
    }
    const sm = path.match(/^\/api\/spiel\/([1-9][0-9]{0,12})$/);
    if (sm && method === 'GET')
        return json(await game(Number(sm[1])));
    const pm = path.match(/^\/api\/players\/([^/]+)$/);
    if (pm && method === 'GET') {
        await indexSome();
        const c = await context(url);
        const id = decodeURIComponent(pm[1]);
        const archiveId = archiveIdOf(id);
        let head: { puuid: string; name: string; icon: number | null; lastSeen: number };
        let own: string;
        const inArchive = archiveId === null ? null : (await rows<{ puuid: string }>('SELECT puuid FROM archive_players WHERE id=?', archiveId))[0] ?? fail(404, 'Spieler nicht gefunden');
        if (inArchive && !(await registeredPlayers()).has(inArchive.puuid)) {
            // A player without a profile, by public id (src/archive-entries.ts); never the PUUID.
            if ((await hiddenPlayers()).has(inArchive.puuid))
                fail(404, 'Spieler nicht gefunden');
            const latest = (await rows<{ name: string | null; icon: number | null; at: number }>('SELECT name,icon,at FROM archive_entries WHERE playerId=? ORDER BY at DESC LIMIT 1', archiveId))[0] ?? fail(404, 'Spieler nicht gefunden');
            head = { puuid: publicId(archiveId!), name: latest.name ?? '', icon: latest.icon, lastSeen: latest.at };
            own = inArchive.puuid;
        }
        else {
            // A profile (also when an old public id belongs to someone who uploads by now).
            own = inArchive?.puuid ?? puuid.parse(id);
            head = (await rows<typeof head>('SELECT puuid,name,icon,lastSeen FROM players WHERE puuid=?', own))[0] ?? fail(404, 'Spieler nicht gefunden');
        }
        const s = standings(await entries(c.since, c.group?.code ?? null, own, false, true), c.since)[0];
        // The public id (pages of a PUUID link move there); head.puuid stays as the request named it.
        const publicIdOf = archiveIdOf(head.puuid) !== null ? head.puuid : (await publicIdsOf(new Set([own]))).get(own)!;
        return json({ ...head, id: publicIdOf, season: c.season, group: c.group, ...(s ? { ...open(s), puuid: head.puuid } : { rank: null, games: 0, wins: 0, placed: 0, climbing: false, average: null, seasons: [] }), history: s?.history ?? [], bestGames: [...(s?.history ?? [])].sort((a, b) => b.mark.pct - a.mark.pct || a.entry.gameId - b.entry.gameId).slice(0, 5) });
    }
    if (pm) {
        const id = puuid.parse(decodeURIComponent(pm[1]));
        if (method === 'DELETE') {
            await authorize(req, id);
            const affected = await rows<{
                gameId: number;
                puuid: string;
                json: string;
            }>("SELECT gameId,puuid,json FROM games WHERE puuid<>? AND EXISTS (SELECT 1 FROM json_each(games.json,'$.with') WHERE json_extract(value,'$.puuid')=?)", id, id);
            const redactions: D1PreparedStatement[] = [];
            for (const row of affected) {
                const e = JSON.parse(row.json) as AramEntry;
                e.with = e.with.filter(m => m.puuid !== id);
                redactions.push(query('UPDATE games SET json=?,sourceHash=? WHERE gameId=? AND puuid=?', JSON.stringify(e), await hash(canonical(e)), row.gameId, row.puuid));
            }
            // The archive still holds their games: without this they would come back as a player
            // without a profile. Uploading again shows them again.
            await db().batch([...redactions, query('INSERT OR IGNORE INTO hidden_players (puuid,at) VALUES (?,?)', id, Date.now()), query('DELETE FROM games WHERE puuid=?', id), query('DELETE FROM reports WHERE uploader=?', id), query('DELETE FROM group_members WHERE puuid=?', id), query('DELETE FROM events WHERE puuid=?', id), query('DELETE FROM players WHERE puuid=?', id), query('DELETE FROM snapshots'), query('UPDATE games SET disputed=CASE WHEN (SELECT COUNT(DISTINCT lobbyHash) FROM reports WHERE reports.gameId=games.gameId)>1 THEN 1 ELSE 0 END'), query("INSERT INTO events (kind,at) VALUES ('reset',?)", Date.now())]);
            return json({ deleted: true });
        }
    }
    if (path === '/api/groups' && method === 'POST') {
        const b = groupSchema.parse(await body(req));
        const code = Array.from(crypto.getRandomValues(new Uint8Array(12))).map(v => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[v % 62]).join('');
        const adminToken = secret(), now = Date.now();
        await query('INSERT INTO groups (code,name,since,createdAt,adminHash) VALUES (?,?,?,?,?)', code, b.name, now, now, await hash(adminToken)).run();
        return json({ code, name: b.name, since: now, createdAt: now, adminToken }, 201);
    }
    const gm = path.match(/^\/api\/groups\/([^/]+)\/(join|leave|restart)$/);
    if (gm && method === 'POST') {
        const g = await group(gm[1]);
        if (gm[2] === 'restart') {
            const token = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
            if (await hash(token) !== g.adminHash)
                fail(401, 'Gruppen-Admin-Schlüssel erforderlich');
            const since = Date.now();
            await db().batch([query('UPDATE groups SET since=? WHERE code=?', since, g.code), query("INSERT INTO events (kind,at) VALUES ('reset',?)", since)]);
            return json({ code: g.code, since });
        }
        const b = memberSchema.parse(await body(req));
        await authorize(req, b.puuid);
        await db().batch([gm[2] === 'join' ? query('INSERT OR IGNORE INTO group_members (code,puuid) VALUES (?,?)', g.code, b.puuid) : query('DELETE FROM group_members WHERE code=? AND puuid=?', g.code, b.puuid), query("INSERT INTO events (kind,at) VALUES ('reset',?)", Date.now())]);
        return json({ code: g.code, puuid: b.puuid, joined: gm[2] === 'join' });
    }
    if (path === '/api/export' && method === 'GET') {
        const hidden = await hiddenPlayers();
        return json({ exportedAt: Date.now(), ratingVersion: RATING_VERSION, seasons: await rows('SELECT * FROM seasons'), players: await rows('SELECT puuid,name,icon,lastSeen FROM players'), groups: await rows('SELECT code,name,since,createdAt FROM groups'), group_members: await rows('SELECT code,puuid FROM group_members'), games: (await rows<{
                json: string;
                quality: number;
                receivedAt: number;
                sourceHash: string;
                disputed: number;
            }>('SELECT json,quality,receivedAt,sourceHash,disputed FROM games')).map(({ json, ...metadata }) => ({ entry: withoutHidden(JSON.parse(json) as AramEntry, hidden), ...metadata, disputed: !!metadata.disputed })) });
    }
    return fail(404, 'Endpunkt nicht gefunden');
}
