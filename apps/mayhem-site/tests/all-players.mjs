// Local-only check of "everyone from the archive" (Etappe 7): eight fixture games through the archive
// upload, then leaderboard, profile by public id, game page, backfill, hiding, records, start and
// champions. No PUUID of a player without a profile may appear. Run after `npm run build`.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(root,'dist/server/wrangler.json')));
const serverRoot = path.join(root,'dist/server');
const files = fs.readdirSync(serverRoot,{recursive:true}).filter(f=>f.endsWith('.js') && f !== 'index.js');
const mf = new Miniflare({ modules:['index.js',...files].map(f=>({type:'ESModule',path:path.join(serverRoot,f)})), modulesRoot:serverRoot,
  compatibilityDate:config.compatibility_date, compatibilityFlags:config.compatibility_flags,
  d1Databases:['DB'], r2Buckets:['BUCKET'], bindings:{ARCHIVE_IMPORT_TOKEN:'f'.repeat(64)}, serviceBindings:{ASSETS:()=>new Response('Not found',{status:404})} });
const db = await mf.getD1Database('DB');
for (const file of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())
  for (const st of fs.readFileSync(path.join(root,'drizzle',file),'utf8').split('--> statement-breakpoint')) if (st.trim()) await db.prepare(st).run();
const base='http://127.0.0.1:5173';
let n=0;
const get = async p => { const r = await mf.dispatchFetch(base+p); return { status:r.status, body: await r.json() }; };
const pid = i => `puuid-${String(i).padStart(30,'0')}`;
const CH=[103,54,16,22,1,2,3,4,5,6];
function raw(gameId, at, shift){ return { gameId, platformId:'EUW1', queueId:2400, gameCreation:at, gameDuration:18*60, gameVersion:'16.19.712.1',
  participantIdentities: CH.map((_,i)=>({participantId:i+1, player:{puuid:pid((i+shift)%20), gameName:`Spieler ${(i+shift)%20}`, tagLine:'EUW', profileIcon:4000+i}})),
  participants: CH.map((c,i)=>({participantId:i+1, teamId:i<5?100:200, championId:CH[(i+gameId)%10], stats:{win:i<5, kills:3+((i*7+gameId)%11), deaths:2+((i*3+gameId)%7), assists:5+i, totalDamageDealtToChampions:15000+((i*5113+gameId*911)%30000), totalDamageTaken:20000+((i*3001+gameId*97)%20000), damageSelfMitigated:9000, totalHeal:2000+i*300, totalDamageShieldedOnTeammates:0, goldEarned:12000+i*150, champLevel:18, item0:3089}})) }; }
const post = (body) => mf.dispatchFetch(base+'/api/archive/matches',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+'f'.repeat(64),'X-Archive-Captured-At':String(Date.now()),'X-Archive-Collector-Version':'local-check','cf-connecting-ip':'x'+(++n)},body:JSON.stringify(body)});
const t0 = Date.now()-10*86400000;
for (let g=1; g<=8; g++) { const r = await post(raw(g, t0+g*3600000, g%3)); assert.equal(r.status,200, await r.text()); }
let c = await db.prepare('SELECT COUNT(*) n FROM archive_entries').first(); console.log('entries after upload', c.n);
assert.equal(c.n, 80);
let lb = await get('/api/leaderboard'); assert.equal(lb.status,200);
console.log('players', lb.body.players.length, 'ranked', lb.body.players.filter(p=>p.rank).length, 'tracked', lb.body.trackedGames);
assert(lb.body.players.every(p=>!p.puuid.startsWith('puuid-')), 'no PUUID leaks');
const someone = lb.body.players[0]; console.log('top', someone.puuid, someone.name, someone.rank?.tier?.name, someone.icon);
const prof = await get('/api/players/'+someone.puuid); assert.equal(prof.status,200); console.log('profile', prof.body.puuid, prof.body.name, prof.body.games, prof.body.history.length);
assert(!JSON.stringify(prof.body).includes('puuid-'), 'profile leaks no PUUID');
assert.equal((await get('/api/players/a99999')).status,404);
const pl = await get('/api/plaetze/'+someone.puuid); assert.equal(pl.status,200); console.log('places', pl.body.name, pl.body.placements.map(p=>`${p.id}:${p.place}/${p.of}`).join(','));
assert(!JSON.stringify(pl.body).includes('puuid-'), 'places leak no PUUID');
assert.equal(pl.body.placements.find(p=>p.kind==='rank')?.place, 1, 'the top of the leaderboard is place 1');
assert(pl.body.placements.every((p,i,a)=>i===0 || a[i-1].place<=p.place), 'best place first');
assert.equal((await get('/api/plaetze/a99999')).status,404);
assert.equal((await get('/api/plaetze/'+pid(1))).status,404, 'no lookup by PUUID');
const sp = await get('/api/spiel/3'); assert.equal(sp.status,200); console.log('game links', sp.body.players.map(p=>p.puuid).join(','));
assert(!JSON.stringify(sp.body).includes('puuid-'));
// backfill: drop the entries and read a page
await db.prepare('DELETE FROM archive_entries').run(); await db.prepare('DELETE FROM archive_indexed').run(); await db.prepare('DELETE FROM snapshots').run();
lb = await get('/api/leaderboard'); c = await db.prepare('SELECT COUNT(*) n FROM archive_entries').first(); console.log('after backfill', c.n, 'players', lb.body.players.length);
assert.equal(c.n,80);
// hide one
const target = lb.body.players.find(p=>p.name==='Spieler 5#EUW');
const h = await mf.dispatchFetch(base+'/api/ausblenden',{method:'POST',headers:{'Content-Type':'application/json','cf-connecting-ip':'y'},body:JSON.stringify({gameId:5,name:'Spieler 5#EUW'})});
console.log('hide', h.status, await h.text());
lb = await get('/api/leaderboard'); assert(!lb.body.players.some(p=>p.name==='Spieler 5#EUW')); assert.equal((await get('/api/players/'+target.puuid)).status,404);
assert.equal((await get('/api/plaetze/'+target.puuid)).status,404, 'a hidden player has no places');
const rec = await get('/api/rekorde'); console.log('records', rec.status, rec.body.players, rec.body.categories?.length);
const st = await get('/api/start'); console.log('start', st.status, st.body.top?.length);
const ch = await get('/api/champions'); console.log('champions', ch.status, ch.body.champions?.length, ch.body.games);
console.log('OK');
await mf.dispose();
