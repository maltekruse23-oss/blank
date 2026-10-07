// The records page (/records, /de/rekorde): one ranking per category, the best ten players, each with the game
// of their value. The same categories, order and counting as the app's leaderboard
// (src/features/aram/aramCategories.ts, recordCategories; src/features/aram/siteRecords.test.ts
// checks both). Only games someone uploaded, so every player here has a profile.
import type { AramDetails, AramEntry } from './adapters/aram';

export type RecordHue = 'fire' | 'magic' | 'physical' | 'gold' | 'guard';

export type RecordCategory = {
  id: string;
  hue: RecordHue;
  /** German title and note (the app's wording, checked by siteRecords.test.ts). */
  title: string;
  note: string;
  /** The same in English (the site's default language). */
  titleEn: string;
  noteEn: string;
  /** best: highest single game (with that game); total: summed up. */
  kind: 'best' | 'total';
  /** How the value reads: whole number, or seconds. */
  unit: 'number' | 'seconds';
  value: (game: AramEntry) => number | null;
};

const detail = (pick: (d: AramDetails) => number) => (g: AramEntry) => (g.details ? pick(g.details) : null);
const perMinute = (g: AramEntry) => (g.seconds >= 60 ? g.damage / (g.seconds / 60) : null);

export const RECORDS: RecordCategory[] = [
  { id: 'damage', hue: 'fire', title: 'Höchster Schaden', note: 'an Champions · bestes Spiel', titleEn: 'Highest damage', noteEn: 'to champions · best game', kind: 'best', unit: 'number', value: (g) => g.damage },
  { id: 'dpm', hue: 'fire', title: 'Schaden pro Minute', note: 'an Champions · bestes Spiel', titleEn: 'Damage per minute', noteEn: 'to champions · best game', kind: 'best', unit: 'number', value: perMinute },
  { id: 'pentas', hue: 'gold', title: 'Pentakills', note: 'insgesamt', titleEn: 'Pentakills', noteEn: 'total', kind: 'total', unit: 'number', value: (g) => g.pentas },
  { id: 'ap', hue: 'magic', title: 'AP-Schaden', note: 'Magieschaden · bestes Spiel', titleEn: 'AP damage', noteEn: 'magic damage · best game', kind: 'best', unit: 'number', value: detail((d) => d.magic) },
  { id: 'ad', hue: 'physical', title: 'AD-Schaden', note: 'Physisch · bestes Spiel', titleEn: 'AD damage', noteEn: 'physical · best game', kind: 'best', unit: 'number', value: detail((d) => d.physical) },
  { id: 'kills', hue: 'physical', title: 'Meiste Kills', note: 'bestes Spiel', titleEn: 'Most kills', noteEn: 'best game', kind: 'best', unit: 'number', value: (g) => g.kills },
  { id: 'tank', hue: 'guard', title: 'Größter Tank', note: 'Eingesteckt · bestes Spiel', titleEn: 'Biggest tank', noteEn: 'damage taken · best game', kind: 'best', unit: 'number', value: (g) => g.taken },
  { id: 'heal', hue: 'guard', title: 'Meiste Heilung', note: 'bestes Spiel', titleEn: 'Most healing', noteEn: 'best game', kind: 'best', unit: 'number', value: (g) => g.healed },
  { id: 'true', hue: 'fire', title: 'True-Schaden', note: 'bestes Spiel', titleEn: 'True damage', noteEn: 'best game', kind: 'best', unit: 'number', value: detail((d) => d.trueDamage) },
  { id: 'mitigated', hue: 'guard', title: 'Abgewehrt', note: 'durch Rüstung · bestes Spiel', titleEn: 'Mitigated', noteEn: 'by armor · best game', kind: 'best', unit: 'number', value: detail((d) => d.mitigated) },
  { id: 'crit', hue: 'physical', title: 'Größter Krit', note: 'ein Treffer', titleEn: 'Biggest crit', noteEn: 'one hit', kind: 'best', unit: 'number', value: detail((d) => d.largestCrit) },
  { id: 'cc', hue: 'magic', title: 'Meiste Kontrolle', note: 'Sekunden CC · bestes Spiel', titleEn: 'Most crowd control', noteEn: 'seconds of CC · best game', kind: 'best', unit: 'seconds', value: detail((d) => d.ccSeconds) },
  { id: 'spree', hue: 'physical', title: 'Längste Serie', note: 'Kills ohne Tod', titleEn: 'Longest spree', noteEn: 'kills without dying', kind: 'best', unit: 'number', value: detail((d) => d.largestSpree) },
  { id: 'gold', hue: 'gold', title: 'Meistes Gold', note: 'bestes Spiel', titleEn: 'Most gold', noteEn: 'best game', kind: 'best', unit: 'number', value: (g) => g.gold },
  { id: 'turrets', hue: 'fire', title: 'Turm-Schaden', note: 'bestes Spiel', titleEn: 'Turret damage', noteEn: 'best game', kind: 'best', unit: 'number', value: detail((d) => d.turretDamage) },
];

/** Title and note of a category in a language. Takes a category (or anything with its id or German
 * title, e.g. from an older API answer or src/places.ts) and finds the English by id. */
export function recordText(
  category: { id?: string; title: string; note?: string; titleEn?: string; noteEn?: string },
  lang: 'en' | 'de',
): { title: string; note: string } {
  const known = RECORDS.find((c) => c.id === category.id || c.title === category.title);
  if (lang === 'de') return { title: category.title, note: category.note ?? known?.note ?? '' };
  return {
    title: category.titleEn ?? known?.titleEn ?? category.title,
    note: category.noteEn ?? known?.noteEn ?? category.note ?? '',
  };
}

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
  return recordRanking(games, now, players).map((c) => ({ ...c, places: c.places.slice(0, PLACES) }));
}

/** Like recordsView, but with every player who has a value (for a player's own places, src/places.ts). */
export function recordRanking(
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
    for (const [i, row] of rows.entries()) {
      const before = places[i - 1];
      places.push({ ...row, place: before && before.value === row.value ? before.place : i + 1 });
    }
    return { ...category, places };
  });
}
