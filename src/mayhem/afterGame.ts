// The card after an ARAM Mayhem game in the Mayhem app (ROADMAP "Als Nächstes 0", user's wish
// 08.10.2026 "eine After-Game-Card auch mit einbauen wie bei blank"; Rust aram/game_card.rs sends
// the game). What the card says besides the game itself, only from real values (as blank.'s
// aramHighlight.ts, nothing made up): new records against mayhemstats.lol's, how special the game
// is, and the game on the site's ladder. English only.
import type { AramEntry } from '../adapters/aram';
import type { GameCard } from '../adapters/aramSite';
import { categories } from '../features/aram/aramCategories';
import { MIN_SECONDS } from '../features/aram/aramPerformance';
import type { RankResult, Step } from '../features/aram/aramRating';
import type { MeState } from './me';

/** A record category's color (mayhem.css `--hue-*`): damage like fire, magic, physical, gold, guard. */
export type Hue = 'fire' | 'magic' | 'physical' | 'gold' | 'guard';
const HUES: readonly string[] = ['fire', 'magic', 'physical', 'gold', 'guard'];

/** One "best game" category of the site's records: its places (best ten) by public id. */
export type SiteRecord = {
  id: string;
  title: string;
  hue: Hue;
  places: { siteId: string; value: number; gameId: number }[];
};

type Raw = Record<string, unknown>;
const raw = (v: unknown): Raw | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Raw) : null;

/** GET /api/rekorde → its best-game categories. A category that does not fit is left out: then no
 * chip, never a wrong one. */
export function parseRecords(text: string): SiteRecord[] {
  let answer: Raw | null;
  try {
    answer = raw(JSON.parse(text));
  } catch {
    return [];
  }
  const list = answer?.categories;
  if (!Array.isArray(list)) return [];
  return list.flatMap((value): SiteRecord[] => {
    const c = raw(value);
    const title = c?.titleEn ?? c?.title;
    if (!c || c.kind !== 'best' || typeof c.id !== 'string' || !Array.isArray(c.places)) return [];
    if (typeof title !== 'string' || !title || title.length > 60) return [];
    const places = c.places.flatMap((p) => {
      const place = raw(p);
      const gameId = raw(place?.game)?.gameId;
      return place &&
        typeof place.puuid === 'string' &&
        typeof place.value === 'number' &&
        Number.isFinite(place.value) &&
        Number.isSafeInteger(gameId)
        ? [{ siteId: place.puuid, value: place.value, gameId: gameId as number }]
        : [];
    });
    if (places.length !== c.places.length) return [];
    const hue = (HUES.includes(c.hue as string) ? c.hue : 'gold') as Hue;
    return [{ id: c.id, title, hue, places }];
  });
}

/** A chip on the card: a new #1 of the site (`record`) or a game that enters the top ten; `place`
 * as the site would show it (ties share a place, its records.ts). */
export type Chip = { id: string; title: string; hue: Hue; place: number; record: boolean };

/** Places a record list shows (the site's records page). */
const TOP = 10;

/**
 * The player's game against the site's records: a new #1 when it beats the current one, else a
 * place in the top ten when it enters it (not when the player's own row there is better). The site
 * may have this very game already (uploaded right after it): only the player's own row of it is left
 * out, the others of the game still count. New #1s first in the site's order, then by place.
 * `siteId`: the player's public id, null when not listed (then the row of this game with the value).
 */
export function recordChips(
  entry: AramEntry,
  records: SiteRecord[],
  siteId: string | null,
): Chip[] {
  const chips = records.flatMap((record): Chip[] => {
    const value = categories.find((c) => c.id === record.id)?.value(entry);
    if (typeof value !== 'number' || !(value > 0)) return [];
    const self = record.places.find(
      (p) =>
        p.gameId === entry.gameId && (siteId === null ? p.value === value : p.siteId === siteId),
    );
    const rows = record.places.filter((p) => p !== self);
    const own = siteId === null ? undefined : rows.find((p) => p.siteId === siteId);
    if (own && own.value >= value) return [];
    const others = rows.filter((p) => p !== own);
    // The site lists ten rows, a tie behind the earlier game, and gives a tie the same place.
    const ahead = others.filter((p) => p.value >= value).length;
    if (ahead >= TOP) return [];
    const place = 1 + others.filter((p) => p.value > value).length;
    return [{ id: record.id, title: record.title, hue: record.hue, place, record: ahead === 0 }];
  });
  return chips.sort((a, b) => (a.record ? 0 : a.place) - (b.record ? 0 : b.place));
}

export const chipText = (chip: Chip) =>
  chip.record
    ? `New record: ${chip.title}`
    : chip.place === 1
      ? `Ties the record: ${chip.title}`
      : `Top 10: ${chip.title}`;

/**
 * "legend": a Pentakill or a new #1 in Highest damage; "top": the most damage of all ten players or
 * a new #1 in another category (as blank.'s aramHighlight, with the site's records as the group).
 */
export type Level = 'normal' | 'top' | 'legend';

export function cardLevel(entry: AramEntry, chips: Chip[]): { level: Level; badge: string | null } {
  const records = chips.filter((c) => c.record);
  const damage = records.some((c) => c.id === 'damage');
  const topDamage = entry.damageRank === 1;
  const level: Level =
    entry.pentas > 0 || damage ? 'legend' : topDamage || records.length > 0 ? 'top' : 'normal';
  const badge =
    entry.pentas > 1
      ? `${entry.pentas} Pentakills`
      : entry.pentas === 1
        ? 'Pentakill'
        : damage
          ? 'New record'
          : topDamage
            ? 'Top damage'
            : records.length > 0
              ? 'Record'
              : null;
  return { level, badge };
}

/** The game's step on the site's ladder (as aramRating's rankResult); null while the site does not
 * have it. */
export function gameRank(history: Step[], gameId: number): RankResult | null {
  const index = history.findIndex((s) => s.entry.gameId === gameId);
  if (index < 0) return null;
  const step = history[index]!;
  let placing = 0;
  for (let i = index; i >= 0 && history[i]!.gain === null; i--) placing += 1;
  return {
    grade: step.mark.grade,
    pct: step.mark.pct,
    gain: step.gain,
    before: step.before,
    after: step.after,
    change: step.change,
    games: step.gain === null ? placing : 0,
  };
}

export type CardRank =
  | { state: 'ready'; rank: RankResult }
  /** Listed: until mayhemstats.lol has the game (the app asks again a few times). */
  | { state: 'waiting' }
  /** Listed, but the game did not arrive while the card waited. */
  | { state: 'late' }
  /** Shorter than eight minutes: never counts. */
  | { state: 'remake' }
  /** Not on mayhemstats.lol: the way onto it. */
  | { state: 'unlisted' }
  /** mayhemstats.lol did not answer (or not usably): says so, with "Try again". */
  | { state: 'failed'; message: string }
  /** The player is not known (client closed, still asking): nothing. */
  | { state: 'none' };

/** The rank line of the card from the player as the app knows them (me.ts). */
export function cardRank(me: MeState, entry: AramEntry, gaveUp: boolean): CardRank {
  if (me.state === 'failed') return { state: 'failed', message: me.message };
  if (me.state !== 'ready') return { state: 'none' };
  if (!me.me) return { state: 'unlisted' };
  const rank = gameRank(me.me.history, entry.gameId);
  if (rank) return { state: 'ready', rank };
  if (entry.seconds < MIN_SECONDS) return { state: 'remake' };
  return { state: gaveUp ? 'late' : 'waiting' };
}

/** The client names champions and augments in its own language: the card takes the English names of
 * arammeta's lists (tiers.ts, the same ids and Data Dragon aliases), the client's only where the
 * lists have none (or are not there). */
export function inEnglish(
  card: GameCard,
  lists: {
    champions: readonly { id: number; name: string; alias: string }[];
    augments: readonly { id: number; name: string }[];
  } | null,
): GameCard {
  if (!lists) return card;
  const { entry, augments } = card;
  const named = (found: { name: string } | undefined, name: string) => found?.name || name;
  return {
    entry: {
      ...entry,
      championName: named(
        lists.champions.find((c) => c.id === entry.championId),
        entry.championName,
      ),
      with: entry.with.map((m) => ({
        ...m,
        championName: named(
          lists.champions.find((c) => c.alias === m.champion),
          m.championName,
        ),
      })),
    },
    augments: Object.fromEntries(
      Object.entries(augments).map(([id, a]) => [
        id,
        {
          ...a,
          name: named(
            lists.augments.find((x) => String(x.id) === id),
            a.name,
          ),
        },
      ]),
    ),
  };
}

/** While a card waits for its game on mayhemstats.lol, the player is asked again at these times
 * after the card came (ms, about two minutes in all; the upload after a game starts after 10 s). */
export const RANK_ASKS = [15_000, 30_000, 50_000, 80_000, 115_000];
/** Then the card stops waiting. */
export const RANK_GIVE_UP = 125_000;
