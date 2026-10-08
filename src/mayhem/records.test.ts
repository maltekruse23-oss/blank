import { describe, expect, it } from 'vitest';
import type { AramEntry } from '../adapters/aram';
import { RECORDS, recordsView } from '../../apps/mayhem-site/src/records';
import { recordCategories } from '../features/aram/aramCategories';
import { mockRecords } from './mock';
import { crowns, parseRecords, recordValue } from './records';

// The Mayhem app's records (records.ts): the website's answer to GET /api/rekorde, made here by the
// website's own code (apps/mayhem-site/src/records.ts), becomes one card per category.
const NOW = 1_790_000_000_000;

function game(
  puuid: string,
  gameId: number,
  damage: number,
  extra: Partial<AramEntry> = {},
): AramEntry {
  return {
    gameId,
    at: NOW - gameId * 60_000,
    seconds: 20 * 60,
    patch: '16.19',
    puuid,
    name: `${puuid.toUpperCase()}#EUW`,
    championId: 103,
    champion: 'Ahri',
    championName: 'Ahri',
    win: true,
    kills: 10,
    deaths: 5,
    assists: 20,
    damage,
    taken: 25_000,
    healed: 4_000,
    shielded: 0,
    gold: 14_000,
    level: 18,
    items: [],
    augments: [],
    damageRank: 1,
    teamShare: 0.3,
    multikill: 1,
    pentas: 0,
    details: null,
    with: [],
    ...extra,
  };
}

const answer = (games: AramEntry[]) =>
  JSON.stringify({
    scope: 'all',
    season: { id: '2026-3', year: 2026, number: 3, start: 0 },
    games: games.length,
    players: 2,
    categories: recordsView(games, NOW),
  });

describe('Mayhem app records', () => {
  it('keeps the categories of blank. and the website, in their order, in English', () => {
    expect(RECORDS.map((c) => c.id)).toEqual(recordCategories.map((c) => c.id));
    const records = parseRecords(answer([game('a1', 1, 50_000)]));
    expect(records.cards.map((c) => c.id)).toEqual(RECORDS.map((c) => c.id));
    expect(records.cards[0]).toMatchObject({ title: 'Highest damage', hue: 'fire', total: false });
    expect(records.season).toBe('Season 3 · 2026');
  });

  it('reads the places: ties share one, missing values never count as 0', () => {
    const records = parseRecords(
      answer([
        game('a1', 1, 50_000, { pentas: 1 }),
        game('a2', 2, 50_000, { pentas: 2, kills: 12 }),
      ]),
    );
    const card = (id: string) => records.cards.find((c) => c.id === id)!;
    expect(card('damage').places.map((p) => [p.place, p.id])).toEqual([
      [1, 'a2'],
      [1, 'a1'],
    ]);
    expect(card('pentas')).toMatchObject({ total: true });
    expect(card('pentas').places.map((p) => [p.place, p.id, p.value])).toEqual([
      [1, 'a2', 2],
      [2, 'a1', 1],
    ]);
    expect(card('damage').places[0]).toMatchObject({
      name: 'A2#EUW',
      championId: 103,
      champion: 'Ahri',
      at: NOW - 2 * 60_000,
    });
    // No game has the details: AP damage has no places, never a 0.
    expect(card('ap').places).toEqual([]);
  });

  it('takes the order and names from its own list, not from the answer', () => {
    const text = JSON.parse(answer([game('a1', 1, 50_000)]));
    text.categories.reverse();
    text.categories.find((c: { id: string }) => c.id === 'damage').titleEn = '<b>x</b>';
    text.categories.push({ id: 'unknown', places: [] });
    const records = parseRecords(JSON.stringify(text));
    expect(records.cards.map((c) => c.id)).toEqual(RECORDS.map((c) => c.id));
    expect(records.cards[0]!.title).toBe('Highest damage');
    // A category the answer leaves out stays empty.
    text.categories = text.categories.filter((c: { id: string }) => c.id !== 'kills');
    const kills = parseRecords(JSON.stringify(text)).cards.find((c) => c.id === 'kills')!;
    expect(kills.places).toEqual([]);
  });

  it('turns answers it cannot trust into an error', () => {
    const good = JSON.parse(answer([game('a1', 1, 50_000)]));
    const broken = (change: (t: typeof good) => void) => {
      const t = structuredClone(good);
      change(t);
      return () => parseRecords(JSON.stringify(t));
    };
    expect(() => parseRecords('<html>')).toThrow();
    expect(broken((t) => (t.categories[0].places[0].value = 0))).toThrow();
    expect(broken((t) => (t.categories[0].places[0].value = '5'))).toThrow();
    expect(broken((t) => (t.categories[0].places[0].place = 0))).toThrow();
    expect(broken((t) => delete t.categories[0].places[0].game)).toThrow();
    expect(broken((t) => (t.season.number = 9))).toThrow();
    expect(broken((t) => (t.games = -1))).toThrow();
    // A champion name that is no Data Dragon alias is not used for a picture.
    const odd = structuredClone(good);
    odd.categories[0].places[0].game.champion = '../x';
    expect(parseRecords(JSON.stringify(odd)).cards[0]!.places[0]!.champion).toBeNull();
  });

  it('counts who holds the most records, ties for each', () => {
    const records = parseRecords(JSON.stringify(mockRecords(false)));
    const most = crowns(records.cards);
    expect(most.reduce((t, p) => t + p.crowns, 0)).toBe(
      records.cards.reduce((t, c) => t + c.places.filter((p) => p.place === 1).length, 0),
    );
    expect(most.map((p) => p.crowns)).toEqual([...most.map((p) => p.crowns)].sort((a, b) => b - a));
    const tie = parseRecords(answer([game('a1', 1, 50_000), game('a2', 2, 50_000)]));
    const damage = crowns(tie.cards.filter((c) => c.id === 'damage'));
    expect(damage.map((p) => [p.id, p.crowns])).toEqual([
      ['a1', 1],
      ['a2', 1],
    ]);
  });

  it('reads the browser preview like the real answer, with categories left empty', () => {
    for (const season of [false, true]) {
      const records = parseRecords(JSON.stringify(mockRecords(season)));
      expect(records.cards.find((c) => c.id === 'turrets')!.places).toEqual([]);
      expect(records.cards.some((c) => c.places.some((p) => p.id === 'a1' && p.place > 3))).toBe(
        true,
      );
    }
  });

  it('writes values in English, seconds for crowd control', () => {
    expect(recordValue({ seconds: false }, 8744.79)).toBe('8,745');
    expect(recordValue({ seconds: true }, 231)).toBe('231 s');
  });
});
