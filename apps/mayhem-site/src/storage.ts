import { env } from 'cloudflare:workers';
export function db(): D1Database { if (!env.DB)
    throw new Error('Datenbank nicht verfügbar'); return env.DB; }
export function query(sql: string, ...args: unknown[]) { return db().prepare(sql).bind(...args); }
export async function rows<T = Record<string, unknown>>(sql: string, ...args: unknown[]): Promise<T[]> { return (await query(sql, ...args).all<T>()).results; }
export async function hash(s: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map(b => b.toString(16).padStart(2, '0')).join(''); }
export function secret() { return Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join(''); }
export function archiveBucket(): R2Bucket {
    if (!env.BUCKET) throw new Error('Rohdatenarchiv nicht verfügbar');
    return env.BUCKET;
}
export function archiveImportToken(): string | undefined { return env.ARCHIVE_IMPORT_TOKEN; }
