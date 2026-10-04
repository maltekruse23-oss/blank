import { archiveBucket, archiveImportToken, db, query, rows } from './storage';
import { MAX_RAW_BYTES, platform, validateMatch, validateTimeline } from './archive-validation';
import { collectorAccess, enrollCollector, manageCollectors } from './archive-collectors';
import { entryStatements } from './archive-index';
import type { RawGame } from './game';

class ArchiveError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
const fail = (status: number, message: string): never => { throw new ArchiveError(status, message); };
const reply = (value: unknown, status = 200) => Response.json(value, { status });
const hex = (value: ArrayBuffer) => Array.from(new Uint8Array(value), b => b.toString(16).padStart(2, '0')).join('');
async function sha(bytes: Uint8Array<ArrayBuffer>) { return hex(await crypto.subtle.digest('SHA-256', bytes)); }
async function authorize(req: Request) {
    const expected = archiveImportToken();
    if (!expected || !/^[a-f0-9]{64}$/.test(expected)) fail(503, 'Archivimport ist noch nicht freigeschaltet');
    const supplied = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
    if (!/^[a-f0-9]{64}$/.test(supplied)) fail(401, 'Privater Archivschlüssel erforderlich');
    const a = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(expected));
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(supplied));
    let different = 0;
    new Uint8Array(a).forEach((x, i) => { different |= x ^ new Uint8Array(b)[i]; });
    if (different) fail(401, 'Privater Archivschlüssel erforderlich');
}
async function readBody(req: Request) {
    if (req.headers.get('content-encoding') && req.headers.get('content-encoding') !== 'identity')
        fail(415, 'Unkomprimiertes JSON senden; das Archiv komprimiert serverseitig');
    if (req.headers.get('content-type')?.split(';')[0] !== 'application/json') fail(415, 'JSON erforderlich');
    const reader = req.body?.getReader();
    const chunks: Uint8Array[] = []; let length = 0;
    if (reader) for (;;) {
        const part = await reader.read(); if (part.done) break;
        length += part.value.length;
        if (length > MAX_RAW_BYTES) { await reader.cancel(); fail(413, 'Maximal 2 MiB Rohdaten pro Datei'); }
        chunks.push(part.value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let value: unknown;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { fail(400, 'Ungültiges JSON'); }
    return { bytes, value };
}
type Revision = { objectKey: string; sha256: string; rawBytes: number; gzipBytes: number };
async function upload(req: Request, timelineKey: string | null, contributor?: string) {
    const capturedAt = Number(req.headers.get('x-archive-captured-at'));
    const collector = req.headers.get('x-archive-collector-version') ?? '';
    if (!Number.isSafeInteger(capturedAt) || capturedAt <= 0 || capturedAt > Date.now() + 300000 ||
        !/^[A-Za-z0-9._-]{1,64}$/.test(collector)) fail(400, 'Gültige Abrufzeit und Sammlerversion erforderlich');
    const { bytes, value } = await readBody(req);
    let parsed: ReturnType<typeof validateMatch> | null = null;
    try { if (timelineKey) validateTimeline(value); else parsed = validateMatch(value); }
    catch { fail(400, 'Ungültige Mayhem-Matchdaten oder Timeline'); }
    const matchKey = timelineKey ?? parsed!.matchKey;
    const kind = timelineKey ? 'timeline' : 'details';
    const column = timelineKey ? 'timelineHash' : 'detailsHash';
    if (timelineKey && !(await rows('SELECT matchKey FROM archive_matches WHERE matchKey=?', matchKey)).length)
        fail(409, 'Zuerst die Matchdetails archivieren');
    const digest = await sha(bytes);
    const objectKey = `matches/${matchKey}/${kind}/${digest}.json.gz`;
    const bucket = archiveBucket();
    const indexed = (await rows('SELECT sha256 FROM archive_revisions WHERE matchKey=? AND kind=? AND sha256=?', matchKey, kind, digest)).length > 0;
    // Complete object first; a D1 failure leaves only an unreferenced, recoverable object.
    // Retrying also repairs a missing object without multiplying database rows.
    const existing = await bucket.head(objectKey);
    let gzipBytes = existing?.size ?? 0;
    if (!existing) {
        const compressed = new Uint8Array(await new Response(
            new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
        gzipBytes = compressed.length;
        await bucket.put(objectKey, compressed, { httpMetadata: { contentType: 'application/gzip' },
            customMetadata: { sha256: digest, matchKey, kind } });
    }
    if (indexed) {
        const canonical = (await rows<Record<string, string>>(`SELECT ${column} FROM archive_matches WHERE matchKey=?`, matchKey))[0]?.[column];
        return reply({ matchKey, kind, sha256: digest, archived: true, canonical: canonical === digest,
            conflict: canonical !== digest, rawBytes: bytes.length, gzipBytes });
    }
    const now = Date.now();
    const statements: D1PreparedStatement[] = [];
    if (parsed) {
        const g = parsed.game;
        statements.push(query('INSERT OR IGNORE INTO archive_matches (matchKey,platformId,gameId,queueId,gameCreation,gameDuration,gameVersion,detailsHash,receivedAt) VALUES (?,?,?,?,?,?,?,?,?)',
            matchKey, g.platformId, g.gameId, g.queueId, g.gameCreation, g.gameDuration, g.gameVersion, digest, now));
        for (const p of parsed.participants) {
            statements.push(query('INSERT OR IGNORE INTO archive_players (puuid) SELECT ? WHERE EXISTS (SELECT 1 FROM archive_matches WHERE matchKey=? AND detailsHash=?)', p.puuid, matchKey, digest));
            statements.push(query('INSERT OR IGNORE INTO archive_participants (matchKey,participantId,playerId,teamId,championId) SELECT ?,?,id,?,? FROM archive_players WHERE puuid=? AND EXISTS (SELECT 1 FROM archive_matches WHERE matchKey=? AND detailsHash=?)',
                matchKey, p.participantId, p.teamId, p.championId, p.puuid, matchKey, digest));
        }
        // Every player of the game as an entry, for the pages (src/archive-index.ts).
        statements.push(...entryStatements(matchKey, value as RawGame, now, digest));
    } else {
        statements.push(query('UPDATE archive_matches SET timelineHash=? WHERE matchKey=? AND timelineHash IS NULL', digest, matchKey));
    }
    statements.push(query('INSERT OR IGNORE INTO archive_revisions (matchKey,kind,sha256,objectKey,rawBytes,gzipBytes,capturedAt,receivedAt,source,collectorVersion,validationVersion) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        matchKey, kind, digest, objectKey, bytes.length, gzipBytes, capturedAt, now, contributor ? `contributor:${contributor}` : 'local-lcu', collector, 1));
    await db().batch(statements);
    const canonical = (await rows<Record<string, string>>(`SELECT ${column} FROM archive_matches WHERE matchKey=?`, matchKey))[0]?.[column];
    return reply({ matchKey, kind, sha256: digest, archived: true, canonical: canonical === digest,
        conflict: canonical !== digest, rawBytes: bytes.length, gzipBytes });
}

export async function archiveRoute(req: Request, url: URL): Promise<Response> {
    try {
        const path = url.pathname.replace(/\/$/, '');
        if (path === '/api/archive/stats' && req.method === 'GET') {
            const result = (await rows('SELECT (SELECT COUNT(*) FROM archive_matches) AS matches, (SELECT COUNT(*) FROM archive_players) AS players, (SELECT COUNT(*) FROM archive_matches WHERE timelineHash IS NOT NULL) AS timelines, (SELECT MAX(receivedAt) FROM archive_revisions) AS lastUpdated'))[0];
            return Response.json(result, { headers: { 'Cache-Control': 'public, max-age=30' } });
        }
        if (path === '/api/archive/enroll' && req.method === 'POST') return await enrollCollector(req);
        if ((path === '/api/archive/contribute' && req.method === 'POST') ||
            (path === '/api/archive/contributor-status' && req.method === 'GET')) {
            const access = await collectorAccess(req, req.method === 'POST');
            if (!access) return reply({ error: 'Upload-Code fehlt oder wurde widerrufen' }, 401);
            if (access.limited) return Response.json({ error: 'Tageslimit erreicht; später erneut versuchen' }, { status: 429, headers: { 'Retry-After': '86400' } });
            if (req.method === 'GET') return reply({ enabled: true, uploadOnly: true, dailyRequests: 200 });
            return await upload(req, null, access.id);
        }
        await authorize(req);
        const managed = await manageCollectors(req, path);
        if (managed) return managed;
        if (path === '/api/archive/matches' && req.method === 'POST') return await upload(req, null);
        const match = path.match(/^\/api\/archive\/matches\/([A-Z][A-Z0-9]{1,7})_([1-9][0-9]{0,15})\/(details|timeline)$/);
        if (match) {
            const matchKey = `${platform.parse(match[1])}_${match[2]}`;
            if (req.method === 'POST' && match[3] === 'timeline') return await upload(req, matchKey);
            if (req.method === 'GET') {
                const digest = url.searchParams.get('sha256');
                if (digest && !/^[a-f0-9]{64}$/.test(digest)) fail(400, 'Ungültige Prüfsumme');
                const revision = (await rows<Revision>(digest
                    ? 'SELECT objectKey,sha256,rawBytes,gzipBytes FROM archive_revisions WHERE matchKey=? AND kind=? AND sha256=?'
                    : `SELECT r.objectKey,r.sha256,r.rawBytes,r.gzipBytes FROM archive_revisions r JOIN archive_matches m ON m.matchKey=r.matchKey WHERE r.matchKey=? AND r.kind=? AND r.sha256=m.${match[3] === 'details' ? 'detailsHash' : 'timelineHash'}`,
                    matchKey, match[3], ...(digest ? [digest] : [])))[0];
                if (!revision) fail(404, 'Datei nicht archiviert');
                const object = await archiveBucket().get(revision.objectKey);
                if (!object) return fail(503, 'Archivdatei fehlt; Wiederherstellung erforderlich');
                return new Response(object.body, { headers: { 'Content-Type': 'application/gzip',
                    'Cache-Control': 'no-store', 'X-Archive-Sha256': revision.sha256,
                    'Content-Disposition': `attachment; filename="${matchKey}-${match[3]}.json.gz"` } });
            }
        }
        if (path === '/api/archive/manifest' && req.method === 'GET') {
            const after = url.searchParams.get('after') ?? '';
            if (after.length > 200) fail(400, 'Ungültiger Cursor');
            const revisions = await rows('SELECT r.*,m.platformId,m.gameId,m.queueId,m.gameCreation,m.gameDuration,m.gameVersion,m.detailsHash,m.timelineHash FROM archive_revisions r JOIN archive_matches m ON m.matchKey=r.matchKey WHERE (r.matchKey || "/" || r.kind || "/" || r.sha256)>? ORDER BY r.matchKey,r.kind,r.sha256 LIMIT 100', after);
            const last = revisions.at(-1);
            return reply({ version: 1, revisions, next: revisions.length === 100 && last ? `${last.matchKey}/${last.kind}/${last.sha256}` : null });
        }
        return reply({ error: 'Archiv-Endpunkt nicht gefunden' }, 404);
    } catch (error) {
        if (error instanceof ArchiveError) return reply({ error: error.message }, error.status);
        console.error('Archive operation failed');
        return reply({ error: 'Archiv vorübergehend nicht verfügbar; Upload kann wiederholt werden' }, 503);
    }
}
