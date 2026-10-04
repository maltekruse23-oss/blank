import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { validateMatch } from '../src/archive-validation.ts';

// Default is local inspection only. Real uploads require both --upload and a private environment token.
const args = process.argv.slice(2);
const upload = args.includes('--upload');
const source = args.find(a => !a.startsWith('--'));
if (!source || args.some(a => a.startsWith('--') && a !== '--upload')) throw new Error('Usage: node scripts/import-archive.mjs <saved-run-directory> [--upload]');
const origin = 'https://blank-mayhem.maltevfx.chatgpt.site';
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'archive-manifest.json')));
const requests = JSON.parse(fs.readFileSync(path.join(source, 'requests.json')));
const selected = requests.filter(r => r.label.startsWith('detail-'));
if (selected.length !== 50) throw new Error('This pilot imports exactly the approved 50 detail responses');
const unique = new Set(); const players = new Set(); let rawBytes = 0;
const files = selected.map(r => {
    if (path.basename(r.rawFile) !== r.rawFile) throw new Error('Invalid source filename');
    const filename = path.join(source, r.rawFile); const bytes = fs.readFileSync(filename);
    const expected = manifest.files.find(f => f.file === r.rawFile);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (!expected || sha256 !== expected.sha256 || r.httpStatus !== 200) throw new Error('Source verification failed');
    const parsed = validateMatch(JSON.parse(bytes));
    if (unique.has(parsed.matchKey)) throw new Error('Duplicate source match');
    unique.add(parsed.matchKey); parsed.participants.forEach(p => players.add(p.puuid)); rawBytes += bytes.length;
    return { bytes, sha256, matchKey: parsed.matchKey, capturedAt: Math.floor(fs.statSync(filename).mtimeMs) };
});
console.log(JSON.stringify({ mode:upload?'upload':'dry-run',matches:files.length,players:players.size,rawBytes,destination:origin }));
if (upload) {
    const token = process.env.ARCHIVE_IMPORT_TOKEN;
    if (!/^[a-f0-9]{64}$/.test(token ?? '')) throw new Error('Private ARCHIVE_IMPORT_TOKEN environment variable required');
    const headers = { Authorization:`Bearer ${token}`, 'Content-Type':'application/json', 'X-Archive-Collector-Version':'blank-spread-probe-v1' };
    for (const [index, file] of files.entries()) {
        if (index) await new Promise(resolve => setTimeout(resolve, 4500));
        const response = await fetch(origin+'/api/archive/matches', { method:'POST',redirect:'error',
            signal:AbortSignal.timeout(30000),headers:{...headers,'X-Archive-Captured-At':String(file.capturedAt)},body:file.bytes });
        if (!response.ok) throw new Error(`Import stopped: HTTP ${response.status}, match ${file.matchKey}`);
        const receipt = await response.json();
        if (!receipt.archived || receipt.sha256 !== file.sha256 || receipt.matchKey !== file.matchKey || receipt.conflict) throw new Error('Unexpected receipt; stopped');
        // Verify the actual stored object before reporting success.
        await new Promise(resolve => setTimeout(resolve, 4500));
        const exported = await fetch(`${origin}/api/archive/matches/${file.matchKey}/details`, {
            headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(30000) });
        if (!exported.ok) throw new Error(`Export verification failed: HTTP ${exported.status}`);
        const restored = gunzipSync(Buffer.from(await exported.arrayBuffer()));
        if (!restored.equals(file.bytes)) throw new Error('Archive differs from original');
        console.log(JSON.stringify({matchKey:file.matchKey,verified:true,index:index+1}));
    }
}
