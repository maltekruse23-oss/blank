// One game for the page /spiel/<id>: all ten players with their Riot IDs. The names come from the
// raw archive (the client's full answer for the game); without it, the uploaded entries give the
// values of all ten, but names only of the uploaders and their friends in the game.
// Registered players (those who upload themselves) keep their PUUID for the link to their profile;
// everyone else from the archive is linked by a public id (`a<number>`), never by their PUUID. Pure, tested in the app's repo
// (src/features/aram/siteGame.test.ts).
import type { AramEntry, AramSeat } from './adapters/aram';
import { rawAugments } from './augments';

/** The parts of the client's match answer (/lol-match-history/v1/games/<id>) the page reads. */
export type RawGame = {
  gameId: number;
  gameCreation: number;
  gameDuration: number;
  gameVersion: string;
  participantIdentities: {
    participantId: number;
    player: { puuid: string; gameName?: string; tagLine?: string; summonerName?: string; profileIcon?: number };
  }[];
  participants: {
    participantId: number;
    teamId: number;
    championId: number;
    stats: Partial<Record<string, number | boolean>>;
  }[];
};

export type GamePlayer = Omit<AramSeat, 'you'> & {
  /** Riot ID ("Name#TAG"); null when no source names this player. */
  name: string | null;
  /** Link to the profile: the PUUID of a registered player, the public id of anyone else from the
   * archive (src/archive-entries.ts); null for players who asked not to be named. */
  puuid: string | null;
  win: boolean;
  /** Missing values stay null (never 0). */
  level: number | null;
  items: number[] | null;
  /** Augment IDs in the order they were picked; null when no source has them. */
  augments: number[] | null;
  /** Data Dragon key, when an entry of the game names it (for the fallback without archive). */
  champion: string | null;
};

export type GameView = {
  gameId: number;
  /** Start of the game, ms since 1970. */
  at: number;
  seconds: number;
  patch: string;
  /** Where the names come from: the full raw game, or only the uploads. */
  source: 'archive' | 'uploads';
  /** Uploads disagree about this game's lobby. */
  disputed: boolean;
  players: GamePlayer[];
  /** Friends named in the uploads, by champion key (the page maps them to seats without a name). */
  named: { champion: string; name: string; puuid: string | null }[];
};

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const maybe = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** "Name" + "TAG" → "Name#TAG"; the old summoner name only when there is no Riot ID. */
export function riotId(p: RawGame['participantIdentities'][number]['player']): string | null {
  const name = p.gameName?.trim();
  if (name) return p.tagLine?.trim() ? `${name}#${p.tagLine.trim()}` : name;
  return p.summonerName?.trim() || null;
}

/** "16.19.712.1234" → "16.19". */
const patchOf = (version: string) => version.split('.').slice(0, 2).join('.');

/** Older answers give the length in milliseconds. */
const secondsOf = (duration: number) => (duration > 36_000 ? Math.round(duration / 1000) : duration);

/** Teams in a fixed order (100 before 200), within a team the order of the source. */
const byTeam = (players: GamePlayer[]) =>
  players.map((p, i) => ({ p, i })).sort((a, b) => a.p.team - b.p.team || a.i - b.i).map(({ p }) => p);

/**
 * The game from its raw archive and the uploaded entries (both optional, at least one needed).
 * `registered` holds the PUUIDs that may be linked, `hidden` those who asked not to be named
 * (only without a profile: registered players stay named), `links` the public ids of the others.
 */
export function gameView(
  entries: AramEntry[],
  raw: RawGame | null,
  registered: ReadonlySet<string>,
  disputed = false,
  hidden: ReadonlySet<string> = new Set(),
  links: ReadonlyMap<string, string> = new Map(),
): GameView | null {
  const keep = (puuid: string | undefined) =>
    !puuid ? null : registered.has(puuid) ? puuid : hidden.has(puuid) ? null : (links.get(puuid) ?? null);
  const shown = (puuid: string | undefined) => !puuid || registered.has(puuid) || !hidden.has(puuid);
  const keys = new Map(entries.filter((e) => e.champion).map((e) => [e.championId, e.champion]));
  const named = dedupe(
    entries.flatMap((e) => [
      ...(e.champion && shown(e.puuid) ? [{ champion: e.champion, name: e.name, puuid: keep(e.puuid) }] : []),
      ...e.with.filter((m) => m.champion && shown(m.puuid)).map((m) => ({ champion: m.champion, name: m.name, puuid: keep(m.puuid) })),
    ]),
  );

  if (raw && raw.participants.length) {
    const who = new Map(raw.participantIdentities.map((i) => [i.participantId, i.player]));
    const players = raw.participants.map((p): GamePlayer => {
      const s = p.stats;
      const id = who.get(p.participantId);
      return {
        team: p.teamId,
        championId: p.championId,
        champion: keys.get(p.championId) ?? null,
        name: id && shown(id.puuid) ? riotId(id) : null,
        puuid: keep(id?.puuid),
        win: s.win === true,
        kills: num(s.kills),
        deaths: num(s.deaths),
        assists: num(s.assists),
        damage: num(s.totalDamageDealtToChampions),
        taken: num(s.totalDamageTaken),
        mitigated: num(s.damageSelfMitigated),
        healed: num(s.totalHeal),
        shielded: num(s.totalDamageShieldedOnTeammates),
        gold: num(s.goldEarned),
        level: maybe(s.champLevel),
        items: [0, 1, 2, 3, 4, 5, 6].map((n) => num(s[`item${n}`])),
        augments: rawAugments(s),
      };
    });
    return {
      gameId: raw.gameId,
      at: raw.gameCreation,
      seconds: secondsOf(raw.gameDuration),
      patch: patchOf(raw.gameVersion),
      source: 'archive',
      disputed,
      players: byTeam(players),
      named,
    };
  }

  // Without the archive: the fullest upload's lobby, names and items from the uploads themselves.
  const best = [...entries].sort((a, b) => (b.lobby?.length ?? 0) - (a.lobby?.length ?? 0) || +!!a.provisional - +!!b.provisional)[0];
  if (!best) return null;
  const mine = best.lobby?.find((s) => s.you);
  const seats: AramSeat[] = best.lobby?.length
    ? best.lobby
    : [{ you: true, team: 100, championId: best.championId, kills: best.kills, deaths: best.deaths, assists: best.assists, damage: best.damage, taken: best.taken, mitigated: best.details?.mitigated ?? 0, healed: best.healed, shielded: best.shielded, gold: best.gold }];
  const players = seats.map((seat): GamePlayer => {
    const own = entries.find((e) => e.championId === seat.championId);
    const win = own ? own.win : mine ? (seat.team === mine.team) === best.win : best.win;
    return {
      team: seat.team,
      championId: seat.championId,
      kills: seat.kills,
      deaths: seat.deaths,
      assists: seat.assists,
      damage: seat.damage,
      taken: seat.taken,
      mitigated: seat.mitigated,
      healed: seat.healed,
      shielded: seat.shielded,
      gold: seat.gold,
      champion: keys.get(seat.championId) ?? null,
      name: own?.name ?? null,
      puuid: keep(own?.puuid),
      win,
      level: own ? own.level : null,
      items: own ? own.items : null,
      augments: own ? own.augments : null,
    };
  });
  return {
    gameId: best.gameId,
    at: best.at,
    seconds: best.seconds,
    patch: best.patch,
    source: 'uploads',
    disputed,
    players: byTeam(players),
    named,
  };
}

function dedupe<T extends { champion: string }>(list: T[]) {
  const seen = new Map<string, T>();
  for (const item of list) if (!seen.has(item.champion)) seen.set(item.champion, item);
  return [...seen.values()];
}

/**
 * The game as one entry per player (same rules as an uploaded entry), so the grade of every seat
 * is computed exactly like one's own; `you` marks the seat.
 */
export function seatEntry(view: GameView, index: number): AramEntry {
  const p = view.players[index];
  return {
    gameId: view.gameId,
    at: view.at,
    seconds: view.seconds,
    patch: view.patch,
    puuid: '',
    name: p.name ?? '',
    championId: p.championId,
    champion: p.champion ?? '',
    championName: '',
    win: p.win,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    damage: p.damage,
    taken: p.taken,
    healed: p.healed,
    shielded: p.shielded,
    gold: p.gold,
    level: p.level ?? 0,
    items: p.items ?? [],
    augments: p.augments ?? [],
    damageRank: 1,
    teamShare: 0,
    multikill: 0,
    pentas: 0,
    details: null,
    with: [],
    lobby: view.players.map((o, j) => ({
      you: j === index,
      team: o.team,
      championId: o.championId,
      kills: o.kills,
      deaths: o.deaths,
      assists: o.assists,
      damage: o.damage,
      taken: o.taken,
      mitigated: o.mitigated,
      healed: o.healed,
      shielded: o.shielded,
      gold: o.gold,
    })),
  };
}
