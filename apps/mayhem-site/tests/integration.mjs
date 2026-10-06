import assert from 'node:assert/strict';
import {standings,rankResult} from '../src/features/aram/aramRating.ts';
const base='http://127.0.0.1:5173';let serial=0;const api=async(path,body,token,method=body?'POST':'GET',ip)=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json','Origin':'http://tauri.localhost','cf-connecting-ip':ip??`test-${++serial}`,...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});let data=await r.json();return {status:r.status,data,headers:r.headers};};
const a='A'.repeat(40),b='B'.repeat(40);const lobby=Array.from({length:10},(_,i)=>({you:i===0,team:i<5?100:200,championId:i===0?22:i+1,kills:10+i,deaths:4,assists:15,damage:20000+i*1000,taken:18000,mitigated:10000,healed:500,shielded:0,gold:14000}));
const details={magic:0,physical:20000,trueDamage:0,mitigated:10000,doubles:2,triples:0,quadras:0,largestCrit:800,ccSeconds:20,largestSpree:5,turretDamage:1000};
const entry=(i=0)=>({gameId:8000000000+i,at:Date.now()-86400000+i*1000,seconds:1200,patch:'16.19',puuid:a,name:'Local Test#A',championId:22,champion:'Ashe',championName:'Ashe',win:true,...Object.fromEntries(['kills','deaths','assists','damage','taken','healed','shielded','gold'].map(k=>[k,lobby[0][k]])),level:18,items:[3006],augments:[],damageRank:10,teamShare:.2,multikill:2,pentas:0,details,with:[],lobby});
const list=Array.from({length:7},(_,i)=>entry(i));const payload={entries:list,player:{puuid:a,name:'Local Test#A',icon:1},group:null};
let r=await api('/api/games',{...payload,entries:[{...list[0],kills:1001}]});assert.equal(r.status,400);
// Prime the stored pages (snapshots): the upload below must make them compute again.
const before=(await api('/api/leaderboard')).data.trackedGames;assert.equal((await api('/api/leaderboard')).data.trackedGames,before);
r=await api('/api/games',payload);assert.equal(r.status,200,JSON.stringify(r.data));const token=r.data.playerToken;assert.ok(token);assert.equal(r.headers.get('Access-Control-Allow-Origin'),'http://tauri.localhost');assert.deepEqual(r.data.results[6].rank,rankResult(list,a,list[6].gameId));
r=await api('/api/leaderboard');const listed=r.data.players.find(p=>p.name==='Local Test#A');assert.deepEqual(listed.rank,standings(list)[0].rank);assert.match(listed.puuid,/^a[0-9]+$/,'uploaders too only under a public id');assert.ok(!JSON.stringify(r.data).includes(a),'no PUUID on the leaderboard');assert.equal(r.data.trackedGames,before+7);
// The app reads its own profile by PUUID: that one comes back as asked, with the public id; by public id nothing names the PUUID.
r=await api('/api/players/'+a);assert.equal(r.data.puuid,a);assert.equal(r.data.id,listed.puuid);r=await api('/api/players/'+listed.puuid);assert.equal(r.data.puuid,listed.puuid);assert.equal(r.data.games,7);assert.ok(!JSON.stringify(r.data).includes(a));
r=await api('/api/games',payload,token);assert.ok(r.data.results.every(x=>!x.stored));
r=await api('/api/games',{...payload,entries:[{...list[0],skin:0}]},token);assert.equal(r.data.results[0].stored,true);
r=await api('/api/games',payload);assert.equal(r.status,401);
const group=await api('/api/groups',{name:'Lokaler Test'});assert.equal(group.status,201);assert.equal(group.data.code.length,12);
r=await api(`/api/groups/${group.data.code}/join`,{puuid:a},token);assert.equal(r.status,200);
r=await api('/api/leaderboard?group='+group.data.code);assert.equal(r.data.players.length,0); // starts now
r=await api(`/api/groups/${group.data.code}/restart`,{},token);assert.equal(r.status,401);
r=await api(`/api/groups/${group.data.code}/restart`,{},group.data.adminToken);assert.equal(r.status,200);
const peer={...list[0],puuid:b,name:'Local Test#B',championId:2,champion:'Olaf',championName:'Olaf',kills:11,damage:21000,lobby:lobby.map((s,i)=>({...s,you:i===1})).reverse()};
r=await api('/api/games',{entries:[peer],player:{puuid:b,name:'Local Test#B',icon:1},group:null});assert.equal(r.status,200,JSON.stringify(r.data));const tokenB=r.data.playerToken;
r=await api('/api/games');assert.equal(r.data.disputed.length,0,'you and lobby order must not dispute');assert.ok(![a,b].some(x=>JSON.stringify(r.data).includes(x)),'no PUUID in the games');
const controller=new AbortController();const stream=await fetch(base+'/api/live',{signal:controller.signal,headers:{'cf-connecting-ip':'sse-test'}});assert.equal(stream.status,200);const reader=stream.body.getReader();let events=new TextDecoder().decode((await reader.read()).value);assert.match(events,/event: ready/);
const conflicting={...peer,skin:1,lobby:peer.lobby.map(s=>s.championId===3?{...s,damage:s.damage+100}:s)};
r=await api('/api/games',{entries:[conflicting],player:{puuid:b,name:'Local Test#B',icon:1},group:null},tokenB);assert.equal(r.status,200);assert.equal(r.data.results[0].rank,null);
const deadline=Date.now()+12000;while(!events.includes('"disputed":true')&&Date.now()<deadline){events+=new TextDecoder().decode((await reader.read()).value);}controller.abort();assert.match(events,/event: game/);assert.match(events,/"disputed":true/);
r=await api('/api/games');assert.equal(r.data.disputed.length,2);
r=await api('/api/players/'+a);assert.equal(r.data.games,6);
r=await api('/api/players/'+a,undefined,undefined,'DELETE');assert.equal(r.status,401);
r=await api('/api/players/'+b,undefined,tokenB,'DELETE');assert.equal(r.status,200);
r=await api('/api/players/'+a);assert.equal(r.data.games,7,'deleting conflicting report resolves dispute');
r=await api(`/api/groups/${group.data.code}/leave`,{puuid:a},token);assert.equal(r.data.joined,false);
r=await api('/api/players/'+a,undefined,token,'DELETE');assert.equal(r.status,200);
const rateTestIp='rate-test-'+Date.now();for(let i=0;i<31;i++){r=await api('/api/leaderboard',undefined,undefined,'GET',rateTestIp);assert.equal(r.status,200,'reading is never limited');}for(let i=0;i<31;i++){r=await api('/api/ausblenden',{},undefined,'POST',rateTestIp);assert.equal(r.status,i<30?400:429);}
const oversize=await fetch(base+'/api/games',{method:'POST',headers:{'Content-Type':'application/json','cf-connecting-ip':'size-test'},body:' '.repeat(65537)});assert.equal(oversize.status,413);
const preflight=await fetch(base+'/api/games',{method:'OPTIONS',headers:{Origin:'http://tauri.localhost','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,authorization'}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'http://tauri.localhost');

const claimToken='c'.repeat(64);const future={...payload,entries:[{...entry(20),with:[{puuid:b,name:'Privacy#B',champion:'Olaf',championName:'Olaf',damage:1,kills:1,deaths:1,assists:1,sameTeam:true}]}]};
r=await api('/api/games',future,claimToken);assert.equal(r.status,200);assert.equal(r.data.playerToken,claimToken);r=await api('/api/games',future,claimToken);assert.equal(r.status,200);assert.equal(r.data.results[0].stored,false);
r=await api('/api/games',{entries:[{...peer,gameId:8000000020,at:future.entries[0].at}],player:{puuid:b,name:'Privacy#B',icon:1},group:null});const deleteB=r.data.playerToken;r=await api('/api/players/'+b,undefined,deleteB,'DELETE');assert.equal(r.status,200);r=await api('/api/export');assert.ok(![a,b].some(x=>JSON.stringify(r.data).includes(x)),'no PUUID in the export');const redacted=r.data.games.find(g=>g.entry.name==='Local Test#A');assert.equal(redacted.entry.with.length,0);assert.ok(!JSON.stringify(r.data).includes('Privacy#B'));await api('/api/players/'+a,undefined,claimToken,'DELETE');
// Namen ausblenden: a friend from an uploaded game, found by Riot ID, disappears from every answer; uploaders get 409; own uploading ends it.
const friend='F'.repeat(40);const hideGame={...entry(30),with:[{puuid:friend,name:'Versteckt#F',champion:'Olaf',championName:'Olaf',damage:1,kills:1,deaths:1,assists:1,sameTeam:true}]};
r=await api('/api/games',{...payload,entries:[hideGame]});assert.equal(r.status,200,JSON.stringify(r.data));const hideToken=r.data.playerToken;
r=await api('/api/ausblenden',{gameId:hideGame.gameId,name:'Niemand#F'});assert.equal(r.status,404);
r=await api('/api/ausblenden',{gameId:9999999,name:'Versteckt#F'});assert.equal(r.status,404);
r=await api('/api/ausblenden',{gameId:hideGame.gameId,name:'Local Test#A'});assert.equal(r.status,409);
r=await api('/api/ausblenden',{gameId:hideGame.gameId,name:' versteckt#f '});assert.equal(r.status,200,JSON.stringify(r.data));
for(const path of ['/api/export','/api/games','/api/spiel/'+hideGame.gameId,'/api/players/'+a]){r=await api(path);assert.equal(r.status,200,path);assert.ok(!JSON.stringify(r.data).includes('Versteckt#F'),path);assert.ok(!JSON.stringify(r.data).includes(friend),path);}
r=await api('/api/games',{entries:[{...peer,puuid:friend,name:'Versteckt#F',gameId:8000000031}],player:{puuid:friend,name:'Versteckt#F',icon:1},group:null});assert.equal(r.status,200,JSON.stringify(r.data));const friendToken=r.data.playerToken;
r=await api('/api/export');assert.ok(JSON.stringify(r.data.games.find(g=>g.entry.gameId===hideGame.gameId)).includes('Versteckt#F'),'uploading oneself ends hiding');
await api('/api/players/'+friend,undefined,friendToken,'DELETE');await api('/api/players/'+a,undefined,hideToken,'DELETE');
console.log('PASS: validation, original rating parity, quality, deduplication, auth, groups, lobby canonicalization, disputes, SSE, delete, hiding names, CORS, 64 KB, 30/min. Local fixtures only.');
