import { z } from 'zod';
import { db, query, rows, hash, secret } from './storage';
import { uploadSchema, groupSchema, memberSchema, puuid, quality, canonical, lobbyCanonical } from './validation';
import { standings, rankResult, RATING_VERSION, CLIMBING } from './features/aram/aramRating';
import type { AramEntry } from './adapters/aram';
import { archiveRoute } from './archive';
class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
const fail = (status: number, message: string): never => { throw new ApiError(status, message); };
const json = (data: unknown, status = 200) => Response.json(data, { status });
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
async function entries(since = 0, code: string | null = null, player: string | null = null, includeDisputed = false) { let sql = 'SELECT g.json,g.disputed FROM games g WHERE g.at>=?'; const args: unknown[] = [since]; if (!includeDisputed)
    sql += ' AND g.disputed=0'; if (code) {
    sql += ' AND EXISTS (SELECT 1 FROM group_members m WHERE m.code=? AND m.puuid=g.puuid)';
    args.push(code);
} if (player) {
    sql += ' AND g.puuid=?';
    args.push(player);
} sql += ' ORDER BY g.at,g.gameId,g.puuid'; return (await rows<{
    json: string;
    disputed: number;
}>(sql, ...args)).map(r => ({ ...JSON.parse(r.json), ...(includeDisputed ? { disputed: !!r.disputed } : {}) })) as AramEntry[]; }
type Standing = ReturnType<typeof standings>[number];
/** What the site shows of a standing; never the hidden rating (Standing.hidden), only whether the form is above the rank. */
const open = (s: Standing) => ({ puuid: s.puuid, name: s.name, rank: s.rank, games: s.games, wins: s.wins, placed: s.placed, climbing: s.rank !== null && s.form >= CLIMBING, average: s.average, seasons: s.seasons });
const summary = (s: Standing) => ({ ...open(s), last6: s.history.slice(-6).map(h => ({ gameId: h.entry.gameId, at: h.entry.at, gain: h.gain, grade: h.mark.grade, change: h.change })) });
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
    const statements: D1PreparedStatement[] = [query('INSERT INTO players (puuid,name,icon,lastSeen,tokenHash) VALUES (?,?,?,?,?) ON CONFLICT(puuid) DO UPDATE SET name=excluded.name,icon=excluded.icon,lastSeen=excluded.lastSeen,tokenHash=COALESCE(players.tokenHash,excluded.tokenHash)', b.player.puuid, b.player.name, b.player.icon, now, tokenHash)];
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
    const all = await entries(c.since, g?.code ?? null);
    return json({ results: b.entries.map((e, i) => ({ gameId: e.gameId, puuid: e.puuid, stored: result[storedIndexes[i]].results.length > 0, rank: rankResult(all, e.puuid, e.gameId, c.since) })), ...(playerToken ? { playerToken } : {}), season: c.season, group: c.group });
}
async function live(req: Request, url: URL) {
    const c = await context(url);
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
            send(`retry: 3000\nevent: ready\ndata: ${JSON.stringify({ cursor, intervalMs: 2000 })}\n\n`);
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
                        const all = await entries(fresh.since, fresh.group?.code ?? null);
                        const memberIds = fresh.group ? new Set((await rows<{
                            puuid: string;
                        }>('SELECT puuid FROM group_members WHERE code=?', fresh.group.code)).map(m => m.puuid)) : null;
                        for (const e of ev) {
                            cursor = e.id;
                            if (e.kind !== 'game') {
                                send(`id: ${cursor}\nevent: reset\ndata: {}\n\n`);
                                continue;
                            }
                            if (memberIds && !memberIds.has(e.puuid!))
                                continue;
                            const row = (await rows<{
                                json: string;
                                disputed: number;
                            }>('SELECT json,disputed FROM games WHERE gameId=? AND puuid=?', e.gameId, e.puuid))[0];
                            if (row)
                                send(`id: ${cursor}\nevent: game\ndata: ${JSON.stringify({ entry: JSON.parse(row.json), disputed: !!row.disputed, rank: row.disputed ? null : rankResult(all, e.puuid!, e.gameId!, fresh.since) })}\n\n`);
                        }
                    }
                    send(`id: ${cursor}\nevent: heartbeat\ndata: {}\n\n`);
                    if (Date.now() - started > 45000) {
                        stop();
                        return;
                    }
                    timer = setTimeout(tick, 2000);
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
export async function handle(req: Request) {
    const url = new URL(req.url);
    const origin = req.headers.get('origin');
    const allowed = !origin || origin === url.origin || origin === 'http://tauri.localhost';
    let response: Response;
    try {
        if (!allowed)
            fail(403, 'Origin nicht erlaubt');
        if (req.method === 'OPTIONS')
            response = new Response(null, { status: 204 });
        else {
            await rate(req);
            await query('INSERT OR IGNORE INTO seasons (id,start,ratingVersion) VALUES (?,?,?)', `v${RATING_VERSION}`, 1577836800000, RATING_VERSION).run();
            response = await dispatch(req, url);
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
    if (path === '/api/leaderboard' && method === 'GET') {
        const c = await context(url);
        const all = await entries(c.since, c.group?.code ?? null);
        // Global stored matches, independent of group/season and player-entry duplicates.
        const trackedGames = (await rows<{ count: number }>('SELECT COUNT(DISTINCT gameId) AS count FROM games'))[0].count;
        return json({ ...c, ratingVersion: RATING_VERSION, trackedGames, players: standings(all, c.since).map(summary) });
    }
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
    const pm = path.match(/^\/api\/players\/([^/]+)$/);
    if (pm) {
        const id = puuid.parse(decodeURIComponent(pm[1]));
        if (method === 'GET') {
            const c = await context(url);
            const p = (await rows('SELECT puuid,name,icon,lastSeen FROM players WHERE puuid=?', id))[0];
            if (!p)
                fail(404, 'Spieler nicht gefunden');
            const all = await entries(c.since, c.group?.code ?? null, id);
            const s = standings(all, c.since)[0];
            return json({ ...p, season: c.season, group: c.group, ...(s ? open(s) : { rank: null, games: 0, wins: 0, placed: 0, climbing: false, average: null, seasons: [] }), history: s?.history ?? [], bestGames: [...(s?.history ?? [])].sort((a, b) => b.mark.pct - a.mark.pct || a.entry.gameId - b.entry.gameId).slice(0, 5) });
        }
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
            await db().batch([...redactions, query('DELETE FROM games WHERE puuid=?', id), query('DELETE FROM reports WHERE uploader=?', id), query('DELETE FROM group_members WHERE puuid=?', id), query('DELETE FROM events WHERE puuid=?', id), query('DELETE FROM players WHERE puuid=?', id), query('UPDATE games SET disputed=CASE WHEN (SELECT COUNT(DISTINCT lobbyHash) FROM reports WHERE reports.gameId=games.gameId)>1 THEN 1 ELSE 0 END'), query("INSERT INTO events (kind,at) VALUES ('reset',?)", Date.now())]);
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
        return json({ exportedAt: Date.now(), ratingVersion: RATING_VERSION, seasons: await rows('SELECT * FROM seasons'), players: await rows('SELECT puuid,name,icon,lastSeen FROM players'), groups: await rows('SELECT code,name,since,createdAt FROM groups'), group_members: await rows('SELECT code,puuid FROM group_members'), games: (await rows<{
                json: string;
                quality: number;
                receivedAt: number;
                sourceHash: string;
                disputed: number;
            }>('SELECT json,quality,receivedAt,sourceHash,disputed FROM games')).map(({ json, ...metadata }) => ({ entry: JSON.parse(json), ...metadata, disputed: !!metadata.disputed })) });
    }
    return fail(404, 'Endpunkt nicht gefunden');
}
