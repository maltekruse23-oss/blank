// Run the unchanged legacy suite directly in an isolated Worker, without CLI hot reload.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(root,'dist/server/wrangler.json')));
const serverRoot = path.join(root,'dist/server');
const files = fs.readdirSync(serverRoot,{recursive:true}).filter(f=>f.endsWith('.js') && f !== 'index.js');
const mf = new Miniflare({ modules:['index.js',...files].map(f=>({type:'ESModule',path:path.join(serverRoot,f)})),
    modulesRoot:serverRoot,
    compatibilityDate:config.compatibility_date, compatibilityFlags:config.compatibility_flags,
    d1Databases:['DB'], r2Buckets:['BUCKET'], bindings:{ARCHIVE_IMPORT_TOKEN:'f'.repeat(64)},
    serviceBindings:{ASSETS:()=>new Response('Not found',{status:404})},
});
const originalFetch = globalThis.fetch;
const archiveSuite = process.argv.includes('--archive');
try {
    const db = await mf.getD1Database('DB');
    for (const file of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort()) {
        for (const statement of fs.readFileSync(path.join(root,'drizzle',file),'utf8').split('--> statement-breakpoint')) {
            if (statement.trim()) await db.prepare(statement).run();
        }
    }
    globalThis.fetch = (url, options) => {
        if (String(url).startsWith('http://127.0.0.1:5173/') || String(url).startsWith('http://127.0.0.1:5184/')) return mf.dispatchFetch(String(url), options);
        throw new Error('Regression test attempted a nonlocal request');
    };
    await import(archiveSuite ? './archive-integration.mjs' : './integration.mjs');
    if (archiveSuite) {
        const {default:assert} = await import('node:assert/strict');
        const {createHash} = await import('node:crypto');
        const {gunzipSync} = await import('node:zlib');
        const row = await db.prepare('SELECT r.* FROM archive_revisions r JOIN archive_matches m ON r.matchKey=m.matchKey AND r.sha256=m.detailsHash WHERE r.kind=? LIMIT 1').bind('details').first();
        const bucket = await mf.getR2Bucket('BUCKET');
        const originalObject = await bucket.get(row.objectKey);
        const original = gunzipSync(Buffer.from(await originalObject.arrayBuffer()));
        const headers = {Authorization:'Bearer '+'f'.repeat(64),'Content-Type':'application/json',
            'X-Archive-Captured-At':String(Date.now()),'X-Archive-Collector-Version':'local-failure-test'};
        // Recover an intentionally missing object; the index must not count it twice.
        await bucket.delete(row.objectKey);
        let r = await mf.dispatchFetch('http://localhost/api/archive/matches/'+row.matchKey+'/details',{headers});
        assert.equal(r.status,503);
        r = await mf.dispatchFetch('http://localhost/api/archive/matches',{method:'POST',headers,body:original});
        assert.equal(r.status,200);
        assert.deepEqual(gunzipSync(Buffer.from(await (await bucket.get(row.objectKey)).arrayBuffer())),original);
        // Simulate D1 failure AFTER the object is saved. A retry must finish the import.
        const changed = JSON.parse(original); changed.archiveFailureFixture = true;
        const body = JSON.stringify(changed); const digest = createHash('sha256').update(body).digest('hex');
        await db.prepare(`CREATE TRIGGER archive_test_failure BEFORE INSERT ON archive_revisions WHEN NEW.sha256='${digest}' BEGIN SELECT RAISE(ABORT, 'test failure'); END`).run();
        r = await mf.dispatchFetch('http://localhost/api/archive/matches',{method:'POST',headers,body});
        assert.equal(r.status,503);
        assert(await bucket.head(`matches/${row.matchKey}/details/${digest}.json.gz`));
        assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM archive_revisions WHERE sha256=?').bind(digest).first()).n,0);
        await db.prepare('DROP TRIGGER archive_test_failure').run();
        r = await mf.dispatchFetch('http://localhost/api/archive/matches',{method:'POST',headers,body});
        assert.equal(r.status,200); assert.equal((await r.json()).conflict,true);
        assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM archive_matches').first()).n,50);
        console.log('PASS: missing object restored; object-first/D1 failure recovered; counts unchanged. Local fault injection only.');
    }
} finally { globalThis.fetch = originalFetch; await mf.dispose(); }
