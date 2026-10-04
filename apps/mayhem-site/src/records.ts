// The records page (/rekorde): one ranking per category, the best ten players, each with the game
// of their value. The same categories, order and counting as the app's leaderboard
// (src/features/aram/aramCategories.ts, recordCategories; src/features/aram/siteRecords.test.ts
// checks both). Only games someone uploaded, so every player here has a profile.
import type { AramDetails, AramEntry } from './adapters/aram';

export type RecordHue = 'fire' | 'magic' | 'physical' | 'gold' | 'guard';

export type RecordCategory = {
  id: string;
  hue: RecordHue;
  title: string;
  note: string;
  /** best: highest single game (with that game); total: summed up. */
  kind: 'best' | 'total';
  /** How the value reads: whole number, or seconds. */
  unit: 'number' | 'seconds';
  value: (game: AramEntry) => number | null;
};

const detail = (pick: (d: AramDetails) => number) => (g: AramEntry) => (g.details ? pick(g.details) : null);
const perMinute = (g: AramEntry) => (g.seconds >= 60 ? g.damage / (g.seconds / 60) : null);

export const RECORDS: RecordCategory[] = [
  { id: 'damage', hue: 'fire', title: 'Höchster Schaden', note: 'an Champions · bestes Spiel', kind: 'best', unit: 'number', value: (g) => g.damage },
  { id: 'dpm', hue: 'fire', title: 'Schaden pro Minute', note: 'an Champions · bestes Spiel', kind: 'best', unit: 'number', value: perMinute },
  { id: 'pentas', hue: 'gold', title: 'Pentakills', note: 'insgesamt', kind: 'total', unit: 'number', value: (g) => g.pentas },
  { id: 'ap', hue: 'magic', title: 'AP-Schaden', note: 'Magieschaden · bestes Spiel', kind: 'best', unit: 'number', value: detail((d) => d.magic) },
  { id: 'ad', hue: 'physical', title: 'AD-Schaden', note: 'Physisch · bestes Spiel', kind: 'best', unit: 'number', value: detail((d) => d.physical) },
  { id: 'kills', hue: 'physical', title: 'Meiste Kills', note: 'bestes Spiel', kind: 'best', unit: 'number', value: (g) => g.kills },
  { id: 'tank', hue: 'guard', title: 'Größter Tank', note: 'Eingesteckt · bestes Spiel', kind: 'best', unit: 'number', value: (g) => g.taken },
  { id: 'heal', hue: 'guard', title: 'Meiste Heilung', note: 'bestes Spiel', kind: 'best', unit: 'number', value: (g) => g.healed },
  { id: 'true', hue: 'fire', title: 'True-Schaden', note: 'bestes Spiel', kind: 'best', unit: 'number', value: detail((d) => d.trueDamage) },
  { id: 'mitigated', hue: 'guard', title: 'Abgewehrt', note: 'durch Rüstung · bestes Spiel', kind: 'best', unit: 'number', value: detail((d) => d.mitigated) },
  { id: 'crit', hue: 'physical', title: 'Größter Krit', note: 'ein Treffer', kind: 'best', unit: 'number', value: detail((d) => d.largestCrit) },
  { id: 'cc', hue: 'magic', title: 'Meiste Kontrolle', note: 'Sekunden CC · bestes Spiel', kind: 'best', unit: 'seconds', value: detail((d) => d.ccSeconds) },
  { id: 'spree', hue: 'physical', title: 'Längste Serie', note: 'Kills ohne Tod', kind: 'best', unit: 'number', value: detail((d) => d.largestSpree) },
  { id: 'gold', hue: 'gold', title: 'Meistes Gold', note: 'bestes Spiel', kind: 'best', unit: 'number', value: (g) => g.gold },
  { id: 'turrets', hue: 'fire', title: 'Turm-Schaden', note: 'bestes Spiel', kind: 'best', unit: 'number', value: detail((d) => d.turretDamage) },
];

/** Places shown per category. */
export const PLACES = 10;
/** A record is new when its game began this long ago at most. */
export const FRESH_MS = 7 * 24 * 60 * 60 * 1000;

export type RecordGame = {
  gameId: number;
  at: number;
  seconds: number;
  championId: number;
  /** Data Dragon name; empty when unknown. */
  champion: string;
  championName: string;
  skin: number | null;
};

export type RecordPlace = {
  /** 1 = best; ties share the place. */
  place: number;
  puuid: string;
  name: string;
  icon: number | null;
  value: number;
  /** The game of the value (best), or the latest game that added to it (total). */
  game: RecordGame;
  /** That game began within the last seven days. */
  fresh: boolean;
};

export type RecordView = Omit<RecordCategory, 'value'> & { places: RecordPlace[] };

const gameOf = (e: AramEntry): RecordGame => ({
  gameId: e.gameId,
  at: e.at,
  seconds: e.seconds,
  championId: e.championId,
  champion: e.champion,
  championName: e.championName,
  skin: typeof e.skin === 'number' ? e.skin : null,
});

/**
 * All record categories from these games (once per player and game). Only values above 0 count;
 * a category nobody has a value in comes with no places. `players` gives the current name and
 * icon; without it the Riot ID of the player's latest game.
 */
export function recordsView(
  games: AramEntry[],
  now: number,
  players: Map<string, { name: string; icon: number | null }> = new Map(),
): RecordView[] {
  const seen = new Set<string>();
  const counted = games.filter((g) => {
    const key = `${g.gameId}:${g.puuid}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const byPlayer = new Map<string, AramEntry[]>();
  for (const g of counted) byPlayer.set(g.puuid, [...(byPlayer.get(g.puuid) ?? []), g]);

  return RECORDS.map(({ value: of, ...category }) => {
    const rows: Omit<RecordPlace, 'place'>[] = [];
    for (const [puuid, own] of byPlayer) {
      const scored = own
        .map((game) => ({ game, value: of(game) }))
        .filter((v): v is { game: AramEntry; value: number } => typeof v.value === 'number' && Number.isFinite(v.value));
      if (!scored.length) continue;
      let value: number;
      let game: AramEntry;
      if (category.kind === 'best') {
        // The earlier game keeps a tie.
        const top = scored.reduce((a, b) => (b.value > a.value || (b.value === a.value && b.game.at < a.game.at) ? b : a));
        value = top.value;
        game = top.game;
      } else {
        value = scored.reduce((t, v) => t + v.value, 0);
        const adding = scored.filter((v) => v.value > 0);
        if (!adding.length) continue;
        game = adding.reduce((a, b) => (b.game.at > a.game.at ? b : a)).game;
      }
      if (!(value > 0)) continue;
      const latest = own.reduce((a, b) => (b.at > a.at ? b : a));
      const known = players.get(puuid);
      rows.push({
        puuid,
        name: known?.name || latest.name,
        icon: known ? known.icon : null,
        value,
        game: gameOf(game),
        fresh: now - game.at <= FRESH_MS && game.at <= now,
      });
    }
    rows.sort((a, b) => b.value - a.value || a.game.at - b.game.at || a.name.localeCompare(b.name));
    const places: RecordPlace[] = [];
    for (const [i, row] of rows.slice(0, PLACES).entries()) {
      const before = places[i - 1];
      places.push({ ...row, place: before && before.value === row.value ? before.place : i + 1 });
    }
    return { ...category, places };
  });
}
