// Measures the balance of the Mayhem rating (src/features/aram/aramBias.ts): marks every player of
// the ARAM Mayhem games the League client on this PC can show (yours and your League friends'
// last 20 each), then writes how far each role and champion lies above the average. Only numbers
// per role and champion are written, no players. Reads the client only (GET on 127.0.0.1, like
// aram.rs). Run once per season, with the League client open: node server/tools/mark-bias.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import type { AramEntry } from '../../src/adapters/aram.ts';
import { markGame, MAYHEM_QUEUE, roleOf, type Role } from '../../src/features/aram/aramRating.ts';

/** A champion's own average counts as fully as this many games of its role's. */
const SHRINK = 15;
const lockfile = process.argv[2] ?? 'C:/Riot Games/League of Legends/lockfile';

const [, , port, password] = readFileSync(lockfile, 'utf8').split(':');
const auth = 'Basic ' + Buffer.from('riot:' + password).toString('base64');
function get<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = request(
      // The client's own certificate, for this local connection only.
      {
        host: '127.0.0.1',
        port: Number(port),
        path,
        rejectUnauthorized: false,
        headers: { Authorization: auth },
      },
      (response) => {
        let body = '';
        response.on('data', (chunk) => (body += chunk));
        response.on('end', () =>
          response.statusCode === 200
            ? resolve(JSON.parse(body) as T)
            : reject(new Error(`${response.statusCode}`)),
        );
      },
    );
    req.setTimeout(15_000, () => req.destroy(new Error('Zeitüberschreitung')));
    req.on('error', reject);
    req.end();
  });
}

type Stats = Record<string, number | boolean | undefined>;
type Game = {
  gameDuration: number;
  queueId: number;
  participants: { participantId: number; teamId: number; championId: number; stats: Stats }[];
};

const me = await get<{ puuid: string }>('/lol-summoner/v1/current-summoner');
const friends = await get<{ puuid: string }[]>('/lol-chat/v1/friends').catch(() => []);
const seen = new Set<number>();
const games: Game[] = [];
for (const puuid of [me.puuid, ...friends.map((f) => f.puuid)]) {
  const history = await get<{ games: { games: { gameId: number; queueId: number }[] } }>(
    `/lol-match-history/v1/products/lol/${puuid}/matches?begIndex=0&endIndex=20`,
  ).catch(() => null);
  for (const { gameId, queueId } of history?.games.games ?? []) {
    if (queueId !== MAYHEM_QUEUE || seen.has(gameId)) continue;
    seen.add(gameId);
    const game = await get<Game>(`/lol-match-history/v1/games/${gameId}`).catch(() => null);
    if (game?.queueId === MAYHEM_QUEUE) games.push(game);
  }
}

const n = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const byRole = new Map<Role, number[]>();
const byChampion = new Map<number, number[]>();
for (const game of games) {
  const seconds = game.gameDuration > 36_000 ? game.gameDuration / 1000 : game.gameDuration;
  const lobby = game.participants.map((p) => ({
    team: p.teamId,
    championId: p.championId,
    kills: n(p.stats.kills),
    deaths: n(p.stats.deaths),
    assists: n(p.stats.assists),
    damage: n(p.stats.totalDamageDealtToChampions),
    taken: n(p.stats.totalDamageTaken),
    mitigated: n(p.stats.damageSelfMitigated),
    healed: n(p.stats.totalHeal),
    shielded: n(p.stats.totalDamageShieldedOnTeammates),
    gold: n(p.stats.goldEarned),
  }));
  game.participants.forEach((p, i) => {
    const entry = {
      seconds,
      championId: p.championId,
      win: p.stats.win === true,
      lobby: lobby.map((seat, j) => ({ ...seat, you: i === j })),
    } as AramEntry;
    const mark = markGame(entry, true);
    if (!mark) return;
    byRole.set(mark.role, [...(byRole.get(mark.role) ?? []), mark.value]);
    byChampion.set(p.championId, [...(byChampion.get(p.championId) ?? []), mark.value]);
  });
}

const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;
const all = [...byRole.values()].flat();
if (all.length < 200) {
  console.log(
    `Nur ${all.length} Noten aus ${games.length} Spielen – zu wenig, nichts geschrieben.`,
  );
  process.exit(1);
}
const overall = mean(all);
const round = (value: number) => Math.round(value * 100) / 100;
const roleBias = new Map([...byRole].map(([role, values]) => [role, mean(values) - overall]));
const championLines = [...byChampion]
  .sort((a, b) => a[0] - b[0])
  .map(([id, values]) => {
    const prior = roleBias.get(roleOf(id)) ?? 0;
    const own = mean(values) - overall;
    const bias = (values.length * own + SHRINK * prior) / (values.length + SHRINK);
    return `  ${id}: ${round(bias)}, // ${values.length} Spiele`;
  });

const date = new Date().toISOString().slice(0, 10);
writeFileSync(
  new URL('../../src/features/aram/aramBias.ts', import.meta.url),
  `// Generated by server/tools/mark-bias.ts; do not edit by hand.
// Measured ${date} from ${games.length} ARAM Mayhem games (${all.length} marks); average ${round(overall)}.

/** How far each role's marks lie above the average of all (mark points). */
export const ROLE_BIAS: Readonly<Record<string, number>> = {
${[...roleBias]
  .sort()
  .map(([role, bias]) => `  ${role}: ${round(bias)}, // ${byRole.get(role)!.length} Noten`)
  .join('\n')}
};

/** How far each champion's marks lie above the average of all, by champion ID (its own average,
 * pulled towards its role's the fewer games there are). */
export const CHAMPION_BIAS: Readonly<Record<number, number>> = {
${championLines.join('\n')}
};
`,
);
console.log(
  `${games.length} Spiele, ${all.length} Noten, Schnitt ${round(overall)}: aramBias.ts geschrieben`,
);
