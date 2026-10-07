// A player's server as the short name players know (EUW, NA, KR …), from Riot's platform id of
// their archived games (archive_matches.platformId, "EUW1"). Only the archive knows the platform:
// uploads from blank. carry none and get it only when the same game is archived too.

/** Riot's platform ids → the names op.gg and the client show. */
const NAMES: Record<string, string> = {
  BR1: 'BR',
  EUN1: 'EUNE',
  EUW1: 'EUW',
  JP1: 'JP',
  KR: 'KR',
  LA1: 'LAN',
  LA2: 'LAS',
  ME1: 'ME',
  NA1: 'NA',
  OC1: 'OCE',
  PH2: 'PH',
  RU: 'RU',
  SG2: 'SG',
  TH2: 'TH',
  TR1: 'TR',
  TW2: 'TW',
  VN2: 'VN',
  PBE1: 'PBE',
};

/** "EUW1" → "EUW"; an unknown platform without its trailing number ("XY3" → "XY"). */
export function serverName(platformId: string): string {
  const id = platformId.toUpperCase();
  return NAMES[id] ?? (id.replace(/[0-9]+$/, '') || id);
}

/** The value of ?server= on the leaderboard ("euw"), or null when it names no server. */
export function serverParam(value: string | null): string | null {
  return value && /^[a-z]{2,6}$/i.test(value) ? value.toUpperCase() : null;
}

/** The servers present, most players first, then by name. */
export function serversIn(players: readonly { server?: string | null }[]): { server: string; players: number }[] {
  const count = new Map<string, number>();
  for (const p of players) if (p.server) count.set(p.server, (count.get(p.server) ?? 0) + 1);
  return [...count].map(([server, n]) => ({ server, players: n })).sort((a, b) => b.players - a.players || a.server.localeCompare(b.server));
}
