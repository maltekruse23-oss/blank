import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

// Manual independent backup. Pause imports during the export for a stable manifest.
const destination = process.argv[2];
const token = process.env.ARCHIVE_IMPORT_TOKEN;
if (!destination || process.argv.length !== 3) throw new Error('Usage: node scripts/export-archive.mjs <new-backup-directory>');
if (!/^[a-f0-9]{64}$/.test(token ?? '')) throw new Error('Private ARCHIVE_IMPORT_TOKEN environment variable required');
if (fs.existsSync(destination)) throw new Error('Use a new backup directory; existing backups are never overwritten');
const base = 'https://mayhemstats.lol';
const headers = { Authorization:`Bearer ${token}` };
async function get(route) {
    const r = await fetch(base + route, { headers, redirect:'error', signal:AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`Backup stopped: HTTP ${r.status}`);
    return r;
}
const revisions = []; let after = ''; const cursors = new Set();
do {
    const page = await (await get('/api/archive/manifest?after='+encodeURIComponent(after))).json();
    if (!Array.isArray(page.revisions)) throw new Error('Invalid manifest');
    revisions.push(...page.revisions); after = page.next;
    if (after) {
        if (cursors.has(after)) throw new Error('Repeated cursor'); cursors.add(after);
        await new Promise(resolve => setTimeout(resolve, 4500));
    }
} while (after);
fs.mkdirSync(destination, {recursive:true});
fs.writeFileSync(path.join(destination,'manifest.incomplete.json'),JSON.stringify({version:1,revisions},null,2),{flag:'wx'});
for (const r of revisions) {
    if (!/^[A-Z][A-Z0-9]{1,7}_[1-9][0-9]{0,15}$/.test(r.matchKey) ||
        !['details','timeline'].includes(r.kind) || !/^[a-f0-9]{64}$/.test(r.sha256)) throw new Error('Invalid manifest identifier');
    await new Promise(resolve => setTimeout(resolve, 4500));
    const response = await get(`/api/archive/matches/${r.matchKey}/${r.kind}?sha256=${r.sha256}`);
    const compressed = Buffer.from(await response.arrayBuffer());
    const raw = gunzipSync(compressed,{maxOutputLength:2*1024*1024});
    if (createHash('sha256').update(raw).digest('hex') !== r.sha256 || raw.length !== r.rawBytes) throw new Error('Backup checksum mismatch');
    const filename = `${r.matchKey}-${r.kind}-${r.sha256}.json.gz`;
    fs.writeFileSync(path.join(destination,filename),compressed,{flag:'wx'});
}
fs.renameSync(path.join(destination,'manifest.incomplete.json'),path.join(destination,'manifest.json'));
console.log(JSON.stringify({backupComplete:true,verifiedFiles:revisions.length,directory:path.resolve(destination)}));
