// Isolated worker only. This test cannot contact the production Site.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Miniflare } from 'miniflare';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = path.join(root, 'dist/server');
const config = JSON.parse(fs.readFileSync(path.join(server,'wrangler.json')));
const files = fs.readdirSync(server,{recursive:true}).filter(f=>f.endsWith('.js') && f!=='index.js');
const admin = 'f'.repeat(64);
const mf = new Miniflare({ modules:['index.js',...files].map(f=>({type:'ESModule',path:path.join(server,f)})), modulesRoot:server,
  compatibilityDate:config.compatibility_date, compatibilityFlags:config.compatibility_flags, d1Databases:['DB'],r2Buckets:['BUCKET'],
  bindings:{ARCHIVE_IMPORT_TOKEN:admin},serviceBindings:{ASSETS:()=>new Response('Not found',{status:404})} });
let requests=0;
const request=(url,token,method='GET',body,extra={})=>mf.dispatchFetch('http://localhost'+url,{method,body,headers:{
  'CF-Connecting-IP':`127.1.0.${++requests}`, ...(token?{Authorization:'Bearer '+token}:{}),
  'Content-Type':'application/json','X-Archive-Captured-At':String(Date.now()),'X-Archive-Collector-Version':'isolated-mini-test',...extra}});
try {
  const db=await mf.getD1Database('DB');
  for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())
    for(const sql of fs.readFileSync(path.join(root,'drizzle',file),'utf8').split('--> statement-breakpoint')) if(sql.trim())await db.prepare(sql).run();
  let r=await request('/api/archive/collectors',null,'POST');assert.equal(r.status,401);
  const code='a'.repeat(64), id=createHash('sha256').update(code).digest('hex').slice(0,32);
  r=await request('/api/archive/enroll',code,'POST');assert.equal(r.status,200);
  r=await request('/api/archive/enroll',code,'POST');assert.equal(r.status,200);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM archive_collectors').first()).n,1);
  const row=await db.prepare('SELECT * FROM archive_collectors WHERE id=?').bind(id).first();
  assert.equal(row.tokenHash,createHash('sha256').update(code).digest('hex'));assert(!JSON.stringify(row).includes(code));
  r=await request('/api/archive/contributor-status',code);assert.equal(r.status,200);assert.equal((await r.json()).uploadOnly,true);
  for(const [url,method] of [['/api/archive/manifest','GET'],['/api/archive/collectors','GET'],['/api/archive/collectors','POST'],['/api/archive/matches/EUW1_42/details','GET'],['/api/archive/matches/EUW1_42/timeline','POST']]) {
    r=await request(url,code,method);assert.equal(r.status,401,`${method} ${url} must remain admin-only`);
  }
  const game={gameId:42,platformId:'EUW1',queueId:2400,gameCreation:Date.now()-900000,gameDuration:900,gameVersion:'26.19',
    participantIdentities:Array.from({length:10},(_,i)=>({participantId:i+1,player:{puuid:`fixture-player-${String(i).padStart(24,'0')}`}})),
    participants:Array.from({length:10},(_,i)=>({participantId:i+1,teamId:i<5?100:200,championId:i+1,stats:{win:i<5}}))};
  const body=JSON.stringify(game),digest=createHash('sha256').update(body).digest('hex');
  r=await request('/api/archive/contribute',code,'POST',body);assert.equal(r.status,200);assert.equal((await r.json()).sha256,digest);
  r=await request('/api/archive/contribute',code,'POST',body);assert.equal(r.status,200);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM archive_matches').first()).n,1);
  assert.equal((await db.prepare('SELECT source FROM archive_revisions').first()).source,'contributor:'+id);
  game.queueId=450;r=await request('/api/archive/contribute',code,'POST',JSON.stringify(game));assert.equal(r.status,400);
  await db.prepare('UPDATE archive_collectors SET requests=200,day=? WHERE id=?').bind(Math.floor(Date.now()/86400000),id).run();
  r=await request('/api/archive/contribute',code,'POST',body);assert.equal(r.status,429);
  // Different IP does not bypass the per-code quota; status does not consume upload allowance.
  r=await request('/api/archive/contributor-status',code);assert.equal(r.status,200);
  await db.prepare('UPDATE archive_collectors SET day=0 WHERE id=?').bind(id).run();
  r=await request('/api/archive/contribute',code,'POST',body);assert.equal(r.status,200);
  r=await request(`/api/archive/collectors/${id}/revoke`,admin,'POST');assert.equal(r.status,200);
  r=await request('/api/archive/contribute',code,'POST',body);assert.equal(r.status,401);
  r=await request('/api/archive/contributor-status',code);assert.equal(r.status,401);
  r=await request('/api/archive/enroll',code,'POST');assert.equal(r.status,403,'revocation must survive automatic registration');
  for(let i=0;i<4;i++) {
    const key=createHash('sha256').update('installation-'+i).digest('hex');
    r=await request('/api/archive/enroll',key,'POST',undefined,{'CF-Connecting-IP':'127.2.0.1'});
    assert.equal(r.status,i<3?200:429,'installation quota');
  }
  r=await request('/api/archive/matches',admin,'POST',body);assert.equal(r.status,200,'existing native administrator uploader unchanged');
  console.log('PASS: automatic enrollment, enrollment deduplication/quota, hash-only storage, upload-only access, duplicate handling, provenance, invalid queue, per-installation quota, day reset, persistent revocation, administrator compatibility. Local data only.');
} finally { await mf.dispose(); }
