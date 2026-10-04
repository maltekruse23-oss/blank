// Measures the table of the Mayhem performance score (src/features/aram/aramBase.ts): what each
// champion usually reaches in every stat, taken from the ARAM Mayhem games the League client on
// this PC can show (yours and your League friends' last 20 each, every player of those games).
// Only numbers per champion and role are written, no players. Reads the client only (GET on
// 127.0.0.1, like aram.rs). Run once per season, with the League client open and no game running:
//   node server/tools/perf-base.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import type { AramEntry } from '../../src/adapters/aram.ts';
import {
  features,
  MAYHEM_QUEUE,
  METRICS,
  rawFrom,
  roleOf,
} from '../../src/features/aram/aramPerformance.ts';

/** A champion's own average counts as fully as this many games of its role's. */
const SHRINK = 8;
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
type Row = { champion: number; x: number[] };
const rows: Row[] = [];
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
    const f = features(entry);
    if (f && !f.afk) rows.push({ champion: p.championId, x: f.x });
  });
}
if (rows.length < 400) {
  console.log(
    `Nur ${rows.length} Spielerzeilen aus ${games.length} Spielen – zu wenig, nichts geschrieben.`,
  );
  process.exit(1);
}

const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;
const roleRows = new Map<string, number[][]>();
const championRows = new Map<number, number[][]>();
for (const r of rows) {
  const role = roleOf(r.champion);
  roleRows.set(role, [...(roleRows.get(role) ?? []), r.x]);
  championRows.set(r.champion, [...(championRows.get(r.champion) ?? []), r.x]);
}
const columns = (xs: number[][]) => METRICS.map((_, i) => mean(xs.map((x) => x[i])));
const roleBase = new Map([...roleRows].map(([role, xs]) => [role, columns(xs)]));
const championBase = new Map(
  [...championRows].map(([id, xs]) => {
    const role = roleBase.get(roleOf(id)) ?? METRICS.map(() => 0);
    const own = columns(xs);
    return [id, own.map((v, i) => (xs.length * v + SHRINK * role[i]) / (xs.length + SHRINK))];
  }),
);
// The spread of what is left after the champion's baseline, per stat.
const sd = METRICS.map((_, i) => {
  const rest = rows.map((r) => r.x[i] - championBase.get(r.champion)![i]);
  const m = mean(rest);
  return Math.sqrt(mean(rest.map((v) => (v - m) ** 2))) || 1;
});
// The scale of all games, so that an average game scores 0 and one spread is 1.
const raws = rows.map((r) => rawFrom(r.x, championBase.get(r.champion)!, sd));
const rawMean = mean(raws);
const rawSd = Math.sqrt(mean(raws.map((v) => (v - rawMean) ** 2))) || 1;

const r3 = (value: number) => Math.round(value * 1000) / 1000;
const line = (values: number[]) => `[${values.map(r3).join(', ')}]`;
const date = new Date().toISOString().slice(0, 10);
writeFileSync(
  new URL('../../src/features/aram/aramBase.ts', import.meta.url),
  `// Generated by server/tools/perf-base.ts; do not edit by hand.
// Measured ${date} from ${games.length} ARAM Mayhem games (${rows.length} player rows).
// Order of the numbers: ${METRICS.join(', ')} (log share of the lobby, see aramPerformance.ts).

export const BASE = {
  /** Spread of what is left after the champion's baseline, per stat. */
  sd: ${line(sd)},
  /** Mean and spread of the weighted distance over all games (the scale of the score). */
  rawMean: ${r3(rawMean)},
  rawSd: ${r3(rawSd)},
  /** What a role usually reaches. */
  role: {
${[...roleBase]
  .sort()
  .map(([role, v]) => `    ${role}: ${line(v)},`)
  .join('\n')}
  } as Record<string, number[]>,
  /** What a champion usually reaches (its own average, pulled towards its role's the fewer games
   * there are), by champion ID. */
  champion: {
${[...championBase]
  .sort((a, b) => a[0] - b[0])
  .map(([id, v]) => `    ${id}: ${line(v)},`)
  .join('\n')}
  } as Record<number, number[]>,
};
`,
);
console.log(
  `${games.length} Spiele, ${rows.length} Zeilen, ${championBase.size} Champions, Streuung ${line(sd)}, Maß ${r3(rawMean)} / ${r3(rawSd)}: aramBase.ts geschrieben`,
);
