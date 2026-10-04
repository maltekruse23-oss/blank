export type AramPlayer = { puuid: string; name: string; icon: number };

/** More values of a game (src-tauri/src/aram.rs, Details), for the leaderboard's categories. */
export type AramDetails = {
  /** Magic damage to champions ("AP"). */
  magic: number;
  /** Physical damage to champions ("AD"). */
  physical: number;
  trueDamage: number;
  mitigated: number;
  doubles: number;
  triples: number;
  quadras: number;
  largestCrit: number;
  ccSeconds: number;
  largestSpree: number;
  turretDamage: number;
};

/** One player's result in one ARAM Mayhem game. */
export type AramEntry = {
  gameId: number;
  /** Start of the game, ms since 1970. */
  at: number;
  seconds: number;
  /** "16.19", for the item pictures of that time. */
  patch: string;
  puuid: string;
  /** Riot ID at the time of the game ("Name#TAG"). */
  name: string;
  championId: number;
  /** Data Dragon name ("MonkeyKing"); empty when unknown. */
  champion: string;
  championName: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  /** Damage to champions. */
  damage: number;
  taken: number;
  healed: number;
  shielded: number;
  gold: number;
  level: number;
  items: number[];
  augments: number[];
  /** Place of this damage among all players of the game (1 = most). */
  damageRank: number;
  /** Share of the team's damage to champions, 0–1. */
  teamShare: number;
  multikill: number;
  pentas: number;
  /** null for games stored before these values existed, until fetched again. */
  details: AramDetails | null;
  /** Friends of the user in the same game (League friend list or leaderboard). */
  with: AramMate[];
  /** From the end-of-game screen, until the history's exact values replace it. */
  provisional?: boolean;
  /** The skin played (its number, 0 = base look), for the splash art; absent when not known. */
  skin?: number;
  /** All ten players' values without names (rank mode); absent for games stored before. */
  lobby?: AramSeat[];
};

/** One player of a game for the comparison with everyone: values only, no name. */
export type AramSeat = {
  /** The player of the entry. */
  you?: boolean;
  team: number;
  championId: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  taken: number;
  mitigated: number;
  healed: number;
  shielded: number;
  gold: number;
};

/** A friend in the same game, for the comparison on the card. */
export type AramMate = {
  puuid: string;
  name: string;
  champion: string;
  championName: string;
  damage: number;
  kills: number;
  deaths: number;
  assists: number;
  /** In the same team as the player of the entry. */
  sameTeam: boolean;
};
