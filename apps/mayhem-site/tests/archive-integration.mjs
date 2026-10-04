import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

// Local-only test. Never point this fixture test at a public Site.
const base = 'http://127.0.0.1:5184';
const token = 'f'.repeat(64); // disposable local fixture, not a production credential
const source = process.env.ARCHIVE_TEST_SOURCE;
assert(source, 'ARCHIVE_TEST_SOURCE must name the saved 50-match run');
const requests = JSON.parse(fs.readFileSync(path.join(source, 'requests.json')));
const details = requests.filter(r => r.label.startsWith('detail-')).map(r => fs.readFileSync(path.join(source, r.rawFile)));
assert.equal(details.length, 50);
const digest = raw => createHash('sha256').update(raw).digest('hex');
let serial = 0; let transientRetries = 0;
async function api(route, body, authorized = true, extra = {}) {
    const request = () => fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: {
        'Content-Type': 'application/json', 'cf-connecting-ip': `archive-local-${++serial}`,
        'X-Archive-Captured-At': String(Date.now()), 'X-Archive-Collector-Version': 'local-integration-v1',
        ...(authorized ? { Authorization: `Bearer ${token}` } : {}), ...extra,
    }, ...(body === undefined ? {} : { body }) });
    let response = await request();
    if (response.status === 503) {
        await response.arrayBuffer(); transientRetries++;
        await new Promise(resolve => setTimeout(resolve, 100)); response = await request();
    }
    return response;
}
async function stats() { const r = await api('/api/archive/stats', undefined, false); assert.equal(r.status, 200); return r.json(); }
assert.equal((await stats()).matches, 0, 'Use a fresh local test database');
assert.equal((await api('/api/archive/matches', details[0], false)).status, 401);
assert.equal((await api('/api/archive/manifest', undefined, false)).status, 401);
const bad = JSON.parse(details[0]); bad.queueId = 450;
assert.equal((await api('/api/archive/matches', JSON.stringify(bad))).status, 400);
bad.queueId = 2400; bad.participantIdentities[1].player.puuid = bad.participantIdentities[0].player.puuid;
assert.equal((await api('/api/archive/matches', JSON.stringify(bad))).status, 400);
assert.equal((await api('/api/archive/matches', '{')).status, 400);
assert.equal((await api('/api/archive/matches', ' '.repeat(2 * 1024 * 1024 + 1))).status, 413);
assert.equal((await stats()).matches, 0);
let confirmedBytes = 0;
const expected = new Map(); const players = new Set();
for (const raw of details) {
    const match = JSON.parse(raw); const key = `${match.platformId}_${match.gameId}`;
    match.participantIdentities.forEach(p => players.add(p.player.puuid));
    expected.set(key, raw);
    const r = await api('/api/archive/matches', raw);
    assert.equal(r.status, 200, await r.clone().text());
    const receipt = await r.json(); assert.equal(receipt.sha256, digest(raw)); assert.equal(receipt.canonical, true);
    confirmedBytes += receipt.gzipBytes;
}
const first = [...expected.keys()][0];
await Promise.all(Array.from({length:8}, async () => {
    const r = await api('/api/archive/matches', details[0]); assert.equal(r.status, 200);
    assert.equal((await r.json()).canonical, true);
}));
let current = await stats();
assert.equal(current.matches, 50); assert.equal(current.players, players.size); assert.equal(current.timelines, 0);
const changed = JSON.parse(details[0]); changed.participants[0].stats.kills += 1;
let response = await api('/api/archive/matches', JSON.stringify(changed));
assert.equal(response.status, 200); assert.equal((await response.json()).conflict, true);
assert.equal((await stats()).matches, 50);
const timeline = JSON.stringify({ frames: [{timestamp:0,participantFrames:{},events:[]}] });
assert.equal((await api('/api/archive/matches/EUW1_123456789/timeline', timeline)).status, 409);
response = await api(`/api/archive/matches/${first}/timeline`, timeline);
assert.equal(response.status, 200); assert.equal((await response.json()).canonical, true);
assert.equal((await stats()).timelines, 1);
response = await api('/api/archive/manifest'); const manifest = await response.json();
assert.equal(manifest.revisions.length, 52); assert.equal(manifest.next, null);
assert(manifest.revisions.some(r => r.source === 'local-lcu' && r.validationVersion === 1));
for (const [key, raw] of expected) {
    response = await api(`/api/archive/matches/${key}/details`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Archive-Sha256'), digest(raw));
    assert.deepEqual(gunzipSync(Buffer.from(await response.arrayBuffer())), raw);
}
assert.equal((await api(`/api/archive/matches/${first}/details`, undefined, false)).status, 401);
response = await api('/api/leaderboard'); assert.equal(response.status, 200);
const board = await response.json(); assert.equal(board.trackedGames, 0); assert.equal(board.players.length, 0);
console.log(JSON.stringify({ passed:true, importedMatches:50, uniquePlayers:players.size, gzipBytes:confirmedBytes,
    byteExactExports:50, duplicates:8, preservedConflict:true, syntheticTimeline:true,
    protectedRawData:true, originalLeaderboardUnchanged:true, transientRetries }));
