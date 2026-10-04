// Every player of an archived game as an entry (the same form blank. uploads), so players without
// a profile get the same grades, ranks, records and profile page as the uploaders. The archive is
// the client's full answer for the game, so all ten have their Riot ID, values and the lobby.
// Pure, tested in the app's repo (src/features/aram/siteArchiveEntries.test.ts).
import type { AramEntry } from './adapters/aram';
import { rawAugments } from './augments';
import { riotId, type RawGame } from './game';

/** Raise when the entries are built differently: older rows are then built again from the archive. */
export const ARCHIVE_ENTRY_VERSION = 1;

export type ArchiveEntry = {
  puuid: string;
  /** Riot ID at the time of the game; null when the answer names nobody. */
  name: string | null;
  /** Profile icon at the time of the game; null when unknown. */
  icon: number | null;
  entry: AramEntry;
};

/** Public id of a player without a profile: no PUUID leaves the server for them. */
export const publicId = (archiveId: number) => `a${archiveId}`;
/** The archive id in a public id, or null when it is none. */
export function archiveIdOf(id: string): number | null {
  const match = /^a([1-9][0-9]{0,9})$/.exec(id);
  return match ? Number(match[1]) : null;
}

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0);
const icon = (value: unknown) => (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null);
const secondsOf = (duration: number) => (duration > 36_000 ? Math.round(duration / 1000) : duration);
const patchOf = (version: string) => version.split('.').slice(0, 2).join('.');

/** One entry per player of the game (empty when the answer is not complete). */
export function archiveEntries(raw: RawGame): ArchiveEntry[] {
  if (raw.participants.length !== 10) return [];
  const who = new Map(raw.participantIdentities.map((i) => [i.participantId, i.player]));
  const players = raw.participants.map((p) => ({ p, id: who.get(p.participantId), s: p.stats }));
  if (players.some(({ id }) => !id?.puuid)) return [];
  const damageOf = (s: RawGame['participants'][number]['stats']) => num(s.totalDamageDealtToChampions);
  const damages = players.map(({ s }) => damageOf(s)).sort((a, b) => b - a);
  const teams = new Map<number, number>();
  for (const { p, s } of players) teams.set(p.teamId, (teams.get(p.teamId) ?? 0) + damageOf(s));
  const lobby = players.map(({ p, s }) => ({
    team: p.teamId,
    championId: p.championId,
    kills: num(s.kills),
    deaths: num(s.deaths),
    assists: num(s.assists),
    damage: damageOf(s),
    taken: num(s.totalDamageTaken),
    mitigated: num(s.damageSelfMitigated),
    healed: num(s.totalHeal),
    shielded: num(s.totalDamageShieldedOnTeammates),
    gold: num(s.goldEarned),
  }));
  return players.map(({ p, id, s }, index) => {
    const damage = damageOf(s);
    const team = teams.get(p.teamId) ?? 0;
    const name = riotId(id!);
    return {
      puuid: id!.puuid,
      name,
      icon: icon(id!.profileIcon),
      entry: {
        gameId: raw.gameId,
        at: raw.gameCreation,
        seconds: secondsOf(raw.gameDuration),
        patch: patchOf(raw.gameVersion),
        puuid: id!.puuid,
        name: name ?? '',
        championId: p.championId,
        champion: '',
        championName: '',
        win: s.win === true,
        kills: lobby[index].kills,
        deaths: lobby[index].deaths,
        assists: lobby[index].assists,
        damage,
        taken: lobby[index].taken,
        healed: lobby[index].healed,
        shielded: lobby[index].shielded,
        gold: lobby[index].gold,
        level: num(s.champLevel),
        items: [0, 1, 2, 3, 4, 5, 6].map((n) => num(s[`item${n}`])),
        augments: rawAugments(s),
        damageRank: damages.indexOf(damage) + 1,
        teamShare: team ? damage / team : 0,
        multikill: num(s.largestMultiKill),
        pentas: num(s.pentaKills),
        details: {
          magic: num(s.magicDamageDealtToChampions),
          physical: num(s.physicalDamageDealtToChampions),
          trueDamage: num(s.trueDamageDealtToChampions),
          mitigated: lobby[index].mitigated,
          doubles: num(s.doubleKills),
          triples: num(s.tripleKills),
          quadras: num(s.quadraKills),
          largestCrit: num(s.largestCriticalStrike),
          ccSeconds: num(s.timeCCingOthers),
          largestSpree: num(s.largestKillingSpree),
          turretDamage: num(s.damageDealtToTurrets),
        },
        with: [],
        lobby: lobby.map((seat, j) => ({ you: j === index, ...seat })),
      },
    };
  });
}

/**
 * Uploads and archive entries together, one entry per player and game: the upload wins (it has the
 * friends and the skin), unless only the archive has the values of all ten.
 */
export function mergeEntries(uploads: AramEntry[], archive: AramEntry[]): AramEntry[] {
  const full = (e: AramEntry) => (e.lobby?.length ?? 0) === 10;
  const byKey = new Map<string, AramEntry>();
  for (const e of uploads) byKey.set(`${e.gameId}:${e.puuid}`, e);
  for (const e of archive) {
    const key = `${e.gameId}:${e.puuid}`;
    const upload = byKey.get(key);
    if (!upload || (!full(upload) && full(e))) byKey.set(key, e);
  }
  return [...byKey.values()].sort((a, b) => a.at - b.at || a.gameId - b.gameId || (a.puuid < b.puuid ? -1 : a.puuid > b.puuid ? 1 : 0));
}
