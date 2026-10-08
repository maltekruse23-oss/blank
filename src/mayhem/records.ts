// The Mayhem app's records (user's wish 08.10.2026: "die Rekorde von der Website und der blank. App
// auch noch als Tab in der Mayhem-App"): mayhemstats.lol's records, every category's best ten, all
// time or this season (GET /api/rekorde, read in Rust by `mayhem_records`). Categories, their order,
// English names and units come from the website's own list (apps/mayhem-site/src/records.ts, the
// same as blank.'s recordCategories, siteRecords.test.ts); from the answer only the places are
// taken, each value checked. Nothing estimated: a category without places stays empty. The kinds
// of records get no color of their own (MAYHEM-DESIGN.md: one accent).
import { invoke, isTauri } from '@tauri-apps/api/core';
import { PLACES, RECORDS } from '../../apps/mayhem-site/src/records';
import { number } from './format';
import { mockRecords } from './mock';

export type RecordPlace = {
  /** 1 = best; ties share the place. */
  place: number;
  /** The website's public id (`a123`), the same as the player's own `siteId` (me.ts). */
  id: string;
  /** Riot ID. */
  name: string;
  value: number;
  championId: number;
  /** Data Dragon alias when the website gives one (else the champion list knows it). */
  champion: string | null;
  championName: string | null;
  /** When the game of the value began (for a total, the last game that added to it). */
  at: number;
  /** That game (the card after a game leaves out the player's own row of it, afterGame.ts). */
  gameId: number;
};

export type RecordCard = {
  id: string;
  title: string;
  note: string;
  /** Summed up over all games (Pentakills), not one best game. */
  total: boolean;
  seconds: boolean;
  places: RecordPlace[];
};

export type Records = { season: string; games: number; cards: RecordCard[] };

export type RecordsState =
  | { state: 'loading' }
  | { state: 'failed'; offline: boolean }
  | { state: 'ready'; records: Records; mock: boolean };

const ALIAS = /^[A-Za-z0-9]{1,40}$/;

const fail = (what: string): never => {
  throw new Error(`Records: ${what}`);
};
type Obj = Record<string, unknown>;
const obj = (v: unknown, what: string): Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : fail(what);
const list = (v: unknown, what: string): unknown[] => (Array.isArray(v) ? v : fail(what));
const int = (v: unknown, what: string, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
  Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max
    ? (v as number)
    : fail(what);
const text = (v: unknown, what: string, max: number): string =>
  typeof v === 'string' && v.length <= max ? v : fail(what);

function place(v: unknown): RecordPlace {
  const p = obj(v, 'place');
  const game = obj(p.game, 'game');
  // Only values above 0 are records (the website's rule); anything else is a broken answer.
  const value =
    typeof p.value === 'number' && Number.isFinite(p.value) && p.value > 0
      ? p.value
      : fail('value');
  const champion = text(game.champion, 'champion', 40);
  return {
    place: int(p.place, 'place', 1, 1000),
    id: text(p.puuid, 'id', 100),
    name: text(p.name, 'name', 100) || '–',
    value,
    championId: int(game.championId, 'champion', 0, 100_000),
    champion: ALIAS.test(champion) ? champion : null,
    championName: text(game.championName, 'champion', 40) || null,
    at: int(game.at, 'time'),
    gameId: int(game.gameId, 'game'),
  };
}

/** GET /api/rekorde as text: the cards in the website's order, at most its ten places each. */
export function parseRecords(answerText: string): Records {
  const answer = obj(JSON.parse(answerText), 'answer');
  const season = obj(answer.season, 'season');
  const given = new Map(
    list(answer.categories, 'categories').map((v) => {
      const c = obj(v, 'category');
      return [c.id, c] as const;
    }),
  );
  return {
    season: `Season ${int(season.number, 'season', 1, 3)} · ${int(season.year, 'season', 2000, 9999)}`,
    games: int(answer.games, 'games'),
    cards: RECORDS.map((c) => {
      const found = given.get(c.id);
      return {
        id: c.id,
        title: c.titleEn,
        note: c.noteEn,
        total: c.kind === 'total',
        seconds: c.unit === 'seconds',
        places: found ? list(found.places, 'places').slice(0, PLACES).map(place) : [],
      };
    }),
  };
}

/** Who holds the most records: everyone with a place 1 (a tie counts for each), most first; the
 * same number of records shares the place. */
export function crowns(cards: RecordCard[]) {
  const held = new Map<string, { id: string; name: string; crowns: number }>();
  for (const card of cards)
    for (const p of card.places.filter((x) => x.place === 1)) {
      const own = held.get(p.id) ?? { id: p.id, name: p.name, crowns: 0 };
      own.crowns += 1;
      held.set(p.id, own);
    }
  const most = [...held.values()].sort(
    (a, b) => b.crowns - a.crowns || a.name.localeCompare(b.name),
  );
  return most.map((p) => ({ ...p, place: most.filter((x) => x.crowns > p.crowns).length + 1 }));
}

/** "190,928" or "231 s" (crowd control). */
export const recordValue = (card: Pick<RecordCard, 'seconds'>, value: number) =>
  card.seconds ? `${number(value)} s` : number(value);

/** The records from mayhemstats.lol; the browser preview shows invented ones (mock.ts, "Mock").
 * Rust's reasons are German (blank.'s), so the page says it in its own words. */
export async function loadRecords(season: boolean): Promise<RecordsState> {
  try {
    const answer = isTauri()
      ? await invoke<string | null>('mayhem_records', { season })
      : JSON.stringify(mockRecords(season));
    return { state: 'ready', records: parseRecords(answer ?? fail('answer')), mock: !isTauri() };
  } catch {
    return { state: 'failed', offline: !navigator.onLine };
  }
}
