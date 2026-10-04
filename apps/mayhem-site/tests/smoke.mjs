// Smoke test of every page and reading endpoint (PLAN.md Etappe 5): first with what the local
// database holds (run it on a fresh local D1 for the empty state), then with three fictional players
// who are removed again at the end. Local preview at 127.0.0.1:5173 only, never production.
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:5173';
const get = async (path, status = 200) => { const r = await fetch(base + path, { headers: { 'cf-connecting-ip': 'smoke' } }); assert.equal(r.status, status, `${path}: ${r.status}`); return r; };
const data = async (path, status = 200) => (await get(path, status)).json();
const pages = ['/', '/rangliste', '/rekorde', '/champions', '/wertung', '/datenschutz', '/datenschutz/entfernen', '/api-guide'];
const page = async (path, status = 200) => { const html = await (await get(path, status)).text(); assert.match(html, /<main id="inhalt"/, path); assert.match(html, /inoffizielles Fanprojekt/, `${path}: Riot notice`); return html; };
const api = async () => {
  const start = await data('/api/start');
  for (const k of ['trackedGames', 'players', 'grades', 'top', 'records']) assert.ok(k in start, `start.${k}`);
  const board = await data('/api/leaderboard');
  assert.ok(Array.isArray(board.players));
  for (const scope of ['all', 'season']) {
    assert.ok(Array.isArray((await data(`/api/rekorde?scope=${scope}`)).categories));
    assert.ok(Array.isArray((await data(`/api/champions?scope=${scope}`)).champions));
  }
  return board;
};

const send = (path, body, token, method = 'POST') => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': `smoke-${Math.random()}`, ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
const players = ['X', 'Y', 'W'].map((c, p) => ({ puuid: c.repeat(40), name: `Rauchtest ${c}#TEST`, token: String(p + 1).repeat(64) }));
// Leftovers of an aborted run.
for (const p of players) await send('/api/players/' + p.puuid, undefined, p.token, 'DELETE');

// 1. As the database is.
for (const p of pages) await page(p);
const empty = await api();
for (const p of ['/nicht-da', '/spiel/1/x']) assert.match(await page(p, 404), /Seite nicht gefunden/);
await data('/api/spiel/1', 404);
await data('/api/champions/Zzzz', 404);
await data('/api/gruppe/AAAAAAAAAAAA', 404);
await data('/api/players/' + 'Z'.repeat(40), 404);
await data('/api/rekorde?scope=nie', 400);

// 2. With three fictional players in one group (their games just after its start, which counts).
const group = await (await send('/api/groups', { name: 'Rauchtest' })).json();
const champions = [[22, 'Ashe'], [103, 'Ahri'], [54, 'Malphite']];
let gameId = 8100000000;
for (const [p, player] of players.entries()) {
  const entries = Array.from({ length: 6 }, (_, g) => {
    const [championId, champion] = champions[(p + g) % 3];
    const lobby = Array.from({ length: 10 }, (_, i) => ({ you: i === 0, team: i < 5 ? 100 : 200, championId: i === 0 ? championId : 200 + i, kills: 5 + ((i + g + p) % 9), deaths: 3 + ((i + g) % 5), assists: 10 + i, damage: 20000 + ((i * 7 + g * 3 + p) % 10) * 2000, taken: 18000, mitigated: 9000, healed: 600, shielded: 0, gold: 13000 + i * 100 }));
    const s = lobby[0];
    return { gameId: gameId++, at: group.since + 1000 + (p * 6 + g) * 1000, seconds: 1200, patch: '16.19', puuid: player.puuid, name: player.name, championId, champion, championName: champion, win: g % 2 === 0, kills: s.kills, deaths: s.deaths, assists: s.assists, damage: s.damage, taken: s.taken, healed: s.healed, shielded: 0, gold: s.gold, level: 18, items: [3006], augments: [], damageRank: 3, teamShare: 0.25, multikill: 1, pentas: 0, details: { magic: 0, physical: s.damage, trueDamage: 0, mitigated: 9000, doubles: 1, triples: 0, quadras: 0, largestCrit: 400, ccSeconds: 10, largestSpree: 3, turretDamage: 1500 }, with: [], lobby };
  });
  const r = await send('/api/games', { entries, player: { puuid: player.puuid, name: player.name, icon: p + 1 }, group: group.code }, player.token);
  assert.equal(r.status, 200, await r.text());
}
const board = await api();
for (const p of players) assert.ok(board.players.some(s => s.puuid === p.puuid), `${p.name} on the leaderboard`);
assert.ok(board.trackedGames >= empty.trackedGames + 18);
const own = await data('/api/gruppe/' + group.code);
assert.equal(own.players.length, 3);
assert.ok((await data('/api/champions/Ashe')).champion.players.length > 0);
const game = await data('/api/spiel/8100000000');
assert.ok(JSON.stringify(game).includes(players[0].name));
assert.equal(game.players.length, 10);
assert.deepEqual(game.players.filter(s => s.puuid).map(s => s.puuid), [players[0].puuid], 'no PUUID of a player without a profile');
assert.equal((await data('/api/players/' + players[0].puuid)).games, 6);
for (const p of [...pages, '/spiel/8100000000', '/champions/Ashe', '/gruppe/' + group.code, '/players/' + players[1].puuid]) await page(p);

// 3. Gone again everywhere, also from the stored pages.
for (const p of players) assert.equal((await send('/api/players/' + p.puuid, undefined, p.token, 'DELETE')).status, 200);
const after = await api();
for (const p of players) assert.ok(!after.players.some(s => s.puuid === p.puuid), `${p.name} removed`);
assert.ok(!JSON.stringify(await data('/api/start')).includes('Rauchtest'));
await data('/api/spiel/8100000000', 404);
console.log('PASS: all pages and reading endpoints, empty/404, filled, group, deletion. Local fixtures only.');
