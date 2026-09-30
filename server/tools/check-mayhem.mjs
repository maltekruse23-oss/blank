// Checks whether Riot's web API gives out ARAM Mayhem games (queue 2400) and which values they
// carry: the first gate of the public version. Reads only; the key comes from RIOT_API_KEY and is
// never printed. Usage: node server/tools/check-mayhem.mjs "Name#TAG" [europe|americas|asia|sea]
// Only the key itself: pasting in a terminal can add invisible characters around it.
const key = process.env.RIOT_API_KEY?.match(/RGAPI-[0-9a-f-]{36}/i)?.[0];
const [riotId, routing = 'europe'] = process.argv.slice(2);
if (!key || !riotId?.includes('#')) {
  console.log(
    'Aufruf: RIOT_API_KEY setzen, dann: node server/tools/check-mayhem.mjs "Name#TAG" [europe]',
  );
  process.exit(1);
}
if (!['europe', 'americas', 'asia', 'sea'].includes(routing)) {
  console.log('Region: europe, americas, asia oder sea');
  process.exit(1);
}
const base = `https://${routing}.api.riotgames.com`;

async function get(path) {
  const response = await fetch(base + path, {
    headers: { 'X-Riot-Token': key },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const hint = {
      401: 'Schlüssel fehlt oder ist falsch',
      403: 'verboten (Schlüssel abgelaufen – Entwickler-Schlüssel gelten 24 h – oder dieser Bereich ist gesperrt)',
      404: 'nicht gefunden',
      429: 'zu viele Anfragen, kurz warten',
    }[response.status];
    throw new Error(
      `${response.status} ${hint ?? ''} bei ${path.split('?')[0].replace(/[^/]{20,}/g, '…')}`,
    );
  }
  return response.json();
}

const [name, tag] = riotId.split('#');
try {
  const account = await get(
    `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
  );
  console.log('1. Konto gefunden: ja');
  const all = await get(`/lol/match/v5/matches/by-puuid/${account.puuid}/ids?count=100`);
  const mayhem = await get(
    `/lol/match/v5/matches/by-puuid/${account.puuid}/ids?queue=2400&count=100`,
  );
  console.log(`2. Letzte Spiele: ${all.length}, davon ARAM Mayhem (Queue 2400): ${mayhem.length}`);
  if (mayhem.length === 0) {
    console.log(
      '   Keine Mayhem-Spiele – entweder keine gespielt oder die API gibt sie nicht heraus.',
    );
    // Which modes the latest games really are (Mayhem could come under another queue or mode).
    const modes = new Map();
    let newest = null;
    for (const id of all.slice(0, 20)) {
      const { info } = await get(`/lol/match/v5/matches/${id}`);
      const label = `Queue ${info.queueId} · ${info.gameMode} · Karte ${info.mapId}`;
      modes.set(label, (modes.get(label) ?? 0) + 1);
      newest ??= new Date(info.gameCreation).toLocaleString('de-DE');
    }
    console.log(`   Die letzten 20 Spiele nach Modus (neuestes vom ${newest}):`);
    for (const [label, count] of modes) console.log(`   ${count}× ${label}`);
  } else {
    const match = await get(`/lol/match/v5/matches/${mayhem[0]}`);
    const info = match.info;
    const p = info.participants[0];
    const has = (k) => (p[k] !== undefined ? 'ja' : 'nein');
    console.log(
      `3. Neuestes Mayhem-Spiel: Queue ${info.queueId}, ${info.participants.length} Spieler, ${Math.round(info.gameDuration / 60)} min`,
    );
    console.log(
      `   Schaden an Champions: ${has('totalDamageDealtToChampions')}, Eingesteckt: ${has('totalDamageTaken')}, Abgewehrt: ${has('damageSelfMitigated')}`,
    );
    console.log(
      `   Heilen an andere: ${has('totalHealsOnTeammates')}, Schilde an andere: ${has('totalDamageShieldedOnTeammates')}`,
    );
    console.log(
      `   Augments: ${has('playerAugment1')}, Team-Schadensanteil: ${p.challenges?.teamDamagePercentage !== undefined ? 'ja' : 'nein'}, Kill-Beteiligung: ${p.challenges?.killParticipation !== undefined ? 'ja' : 'nein'}`,
    );
    const timeline = await get(`/lol/match/v5/matches/${mayhem[0]}/timeline`).then(
      () => 'ja',
      () => 'nein',
    );
    console.log(`4. Zeitleiste abrufbar: ${timeline}`);
    console.log('Ergebnis: Die API gibt ARAM Mayhem heraus.');
  }
} catch (error) {
  console.log('Fehler:', error.message);
  process.exitCode = 1;
}
