import { query, rows } from './storage';

const tokenPattern = /^[a-f0-9]{64}$/;
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const digest = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));

/** Automatic installation enrollment: the app generates and keeps its own secret locally. */
export async function enrollCollector(req: Request): Promise<Response> {
    const token = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
    if (!tokenPattern.test(token)) return Response.json({ error: 'Installation nicht erkennbar' }, { status: 401 });
    const hash = await digest(token);
    const existing = (await rows<{ revokedAt: number | null }>('SELECT revokedAt FROM archive_collectors WHERE tokenHash=?', hash))[0];
    if (existing) return Response.json({ enabled: existing.revokedAt === null }, { status: existing.revokedAt === null ? 200 : 403 });
    const day = Math.floor(Date.now() / 86400000);
    const ipKey = await digest(`collector-enroll:${day}:${req.headers.get('cf-connecting-ip') ?? 'local'}`);
    const quota = await query('INSERT INTO rate_limits (key,expires,count) VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count', ipKey, (day+1)*86400000).all<{ count: number }>();
    if ((quota.results[0]?.count ?? 4) > 3) return Response.json({ error: 'Heute zu viele neue Installationen; morgen erneut versuchen' }, { status: 429 });
    await query('INSERT OR IGNORE INTO archive_collectors (id,tokenHash,label,createdAt,requests,day) VALUES (?,?,?,?,0,0)', hash.slice(0,32), hash, 'automatic-installation', Date.now()).run();
    return Response.json({ enabled: true }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Independently revocable, upload-only installation credentials. Never store or list the plain code. */
export async function collectorAccess(req: Request, consume: boolean) {
    const token = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
    if (!tokenPattern.test(token)) return null;
    const hash = await digest(token);
    const collector = (await rows<{ id: string; requests: number; day: number }>(
        'SELECT id,requests,day FROM archive_collectors WHERE tokenHash=? AND revokedAt IS NULL', hash))[0];
    if (!collector) return null;
    if (consume) {
        const day = Math.floor(Date.now() / 86400000);
        const result = await query('UPDATE archive_collectors SET requests=CASE WHEN day=? THEN requests+1 ELSE 1 END,day=? WHERE id=? AND revokedAt IS NULL AND (day<>? OR requests<200)', day, day, collector.id, day).run();
        if (!result.meta.changes) return { limited: true, id: collector.id };
    }
    return { limited: false, id: collector.id };
}

/** Caller must have passed the existing private administrator authorization. */
export async function manageCollectors(req: Request, path: string): Promise<Response | null> {
    if (path === '/api/archive/collectors' && req.method === 'GET') {
        return Response.json({ collectors: await rows('SELECT id,label,createdAt,revokedAt,requests,day FROM archive_collectors ORDER BY createdAt DESC LIMIT 200') });
    }
    const revoke = path.match(/^\/api\/archive\/collectors\/([a-f0-9]{32})\/revoke$/);
    if (revoke && req.method === 'POST') {
        const result = await query('UPDATE archive_collectors SET revokedAt=? WHERE id=?', Date.now(), revoke[1]).run();
        return Response.json({ revoked: result.meta.changes > 0 });
    }
    return null;
}
