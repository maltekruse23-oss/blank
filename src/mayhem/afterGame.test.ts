import { describe, expect, it } from 'vitest';
import type { AramEntry } from '../adapters/aram';
import { rankResult, standings, TIERS, type Rank } from '../features/aram/aramRating';
import { rankRun } from '../features/aram/rankRun';
import { open, summary } from '../../apps/mayhem-site/src/summary';
import {
  cardLevel,
  cardRank,
  chipText,
  gameRank,
  inEnglish,
  parseRecords,
  recordChips,
  type SiteRecord,
} from './afterGame';
import { ownState, type MeState } from './me';
import { mockCard } from './mock';

// The card after a game in the Mayhem app (afterGame.ts): records against the site's, how special
// the game is, and its step on the site's ladder – only from real values.
const NOW = 1_790_000_000_000;

function game(id: number, damage: number, extra: Partial<AramEntry> = {}): AramEntry {
  const lobby = Array.from({ length: 10 }, (_, i) => ({
    team: i < 5 ? 100 : 200,
    championId: 1,
    kills: 8,
    deaths: 6,
    assists: 20,
    damage: i === 0 ? damage : 20_000 + i * 2_000,
    taken: 30_000,
    mitigated: 20_000,
    healed: 5_000,
    shielded: 0,
    gold: 14_000,
    ...(i === 0 ? { you: true } : {}),
  }));
  return {
    gameId: id,
    at: NOW + id * 3_600_000,
    seconds: 20 * 60,
    patch: '16.20',
    puuid: 'me',
    name: 'Me#EUW',
    championId: 63,
    champion: 'Brand',
    championName: 'Brand',
    win: id % 2 === 0,
    kills: 8,
    deaths: 6,
    assists: 20,
    damage,
    taken: 30_000,
    healed: 5_000,
    shielded: 0,
    gold: 14_000,
    level: 18,
    items: [],
    augments: [],
    damageRank: 2,
    teamShare: 0.3,
    multikill: 1,
    pentas: 0,
    details: null,
    with: [],
    lobby,
    ...extra,
  };
}

const places = (values: number[], first = 1) =>
  values.map((value, i) => ({ siteId: `a${first + i}`, value, gameId: 500 + first + i }));
const record = (id: string, values: number[]): SiteRecord => ({
  id,
  title: id,
  hue: 'fire',
  places: places(values),
});
const TEN = [100_000, 95_000, 90_000, 85_000, 80_000, 75_000, 70_000, 65_000, 60_000, 55_000];

describe('records on the card', () => {
  it('reads the best-game categories of the site and leaves out what does not fit', () => {
    const answer = {
      categories: [
        {
          id: 'damage',
          hue: 'fire',
          title: 'Höchster Schaden',
          titleEn: 'Highest damage',
          kind: 'best',
          places: [{ puuid: 'a1', value: 90_000, game: { gameId: 7 } }],
        },
        // A sum (Pentakills) never makes a chip.
        { id: 'pentas', hue: 'gold', titleEn: 'Pentakills', kind: 'total', places: [] },
        // A broken row: the whole category is left out, never a wrong chip.
        {
          id: 'kills',
          hue: 'physical',
          titleEn: 'Most kills',
          kind: 'best',
          places: [{ puuid: 'a1', value: '30', game: { gameId: 7 } }],
        },
        // An unknown colour falls back to gold; an old answer without English takes `title`.
        { id: 'heal', hue: 'pink', title: 'Meiste Heilung', kind: 'best', places: [] },
      ],
    };
    expect(parseRecords(JSON.stringify(answer))).toEqual([
      {
        id: 'damage',
        title: 'Highest damage',
        hue: 'fire',
        places: [{ siteId: 'a1', value: 90_000, gameId: 7 }],
      },
      { id: 'heal', title: 'Meiste Heilung', hue: 'gold', places: [] },
    ]);
    expect(parseRecords('<html>')).toEqual([]);
    expect(parseRecords('{"categories":7}')).toEqual([]);
  });

  it('a new #1 beats the current one, a tie does not', () => {
    const records = [record('damage', TEN)];
    expect(recordChips(game(1, 100_001), records, null)).toEqual([
      { id: 'damage', title: 'damage', hue: 'fire', place: 1, record: true },
    ]);
    // A tie shares the place as on the site (records.ts), but is no new record.
    const tie = recordChips(game(1, 100_000), records, null);
    expect(tie).toMatchObject([{ place: 1, record: false }]);
    expect(tie.map(chipText)).toEqual(['Ties the record: damage']);
    expect(cardLevel(game(1, 100_000), tie).level).toBe('normal');
  });

  it('counts places like the site: ties share one, the tenth row is the last', () => {
    // "Most kills" on the site: 41, 37, 36, 35, …: 35 is fourth there, not fifth.
    const kills = [record('kills', [41, 37, 36, 35, 30])];
    expect(recordChips(game(1, 1, { kills: 35 }), kills, null)).toMatchObject([
      { place: 4, record: false },
    ]);
    // Equal to the tenth row: the site puts it eleventh (the earlier game first), no chip.
    expect(recordChips(game(1, 55_000), [record('damage', TEN)], null)).toEqual([]);
  });

  it('enters the top ten only past the tenth place and never with less than the own row', () => {
    const records = [record('damage', TEN)];
    expect(recordChips(game(1, 72_000), records, null)).toMatchObject([{ place: 7 }]);
    expect(recordChips(game(1, 50_000), records, null)).toEqual([]);
    // The player's own row (a5, 80,000) is better: this game enters nothing.
    expect(recordChips(game(1, 72_000), records, 'a5')).toEqual([]);
    // Better than the own row: the place among the others.
    expect(recordChips(game(1, 88_000), records, 'a5')).toMatchObject([{ place: 4 }]);
    // Fewer than ten on the list: any value above 0 enters.
    expect(recordChips(game(1, 1), [record('damage', [5, 3])], null)).toMatchObject([{ place: 3 }]);
  });

  it('leaves out the site row of this very game (a lobby mate uploaded it first)', () => {
    const records = [record('damage', TEN)];
    records[0]!.places[0]!.gameId = 1;
    expect(recordChips(game(1, 100_000), records, null)).toMatchObject([
      { place: 1, record: true },
    ]);
  });

  it('only the own row of this game goes, a better lobby mate in it still counts', () => {
    // The site lists every player of the game: the mate (a1, 120,000) and the player (a2).
    const mate = { siteId: 'a1', value: 120_000, gameId: 1 };
    const self = { siteId: 'a2', value: 100_000, gameId: 1 };
    const records = [{ ...record('damage', []), places: [mate, self, ...places(TEN, 3)] }];
    expect(recordChips(game(1, 100_000), records, 'a2')).toMatchObject([
      { place: 2, record: false },
    ]);
    // Not listed: the row of this game with exactly the value is the own one.
    expect(recordChips(game(1, 100_000), records, null)).toMatchObject([
      { place: 2, record: false },
    ]);
    const chips = recordChips(game(1, 100_000), records, null);
    expect(cardLevel(game(1, 100_000), chips)).toEqual({ level: 'normal', badge: null });
  });

  it('missing values and 0 make no chip; new #1s come first', () => {
    const records = [record('ap', [10]), record('kills', [20, 5]), record('damage', TEN)];
    // AP needs the details the game does not have (never 0).
    const chips = recordChips(game(1, 101_000, { kills: 9 }), records, null);
    expect(chips.map((c) => [c.id, c.place])).toEqual([
      ['damage', 1],
      ['kills', 2],
    ]);
    expect(recordChips(game(1, 101_000, { kills: 0 }), [record('kills', [3])], null)).toEqual([]);
    expect(chips.map(chipText)).toEqual(['New record: damage', 'Top 10: kills']);
  });
});

describe('names on the card', () => {
  it('takes the English names of the lists, the client language only where they have none', () => {
    const mate = {
      puuid: 'm',
      name: 'Mate#EUW',
      champion: 'MonkeyKing',
      championName: 'Wukong (de)',
      damage: 1,
      kills: 0,
      deaths: 0,
      assists: 0,
      sameTeam: true,
    };
    const card = {
      entry: game(1, 1, {
        championName: 'Brand (de)',
        with: [mate, { ...mate, champion: 'Nobody' }],
      }),
      augments: {
        '1001': { name: 'Riese', rarity: 'prismatic' as const, icon: null },
        '1003': { name: 'Unbekannt', rarity: 'gold' as const, icon: null },
      },
    };
    const lists = {
      champions: [
        { id: 63, name: 'Brand', alias: 'Brand' },
        { id: 62, name: 'Wukong', alias: 'MonkeyKing' },
      ],
      augments: [{ id: 1001, name: 'Goliath' }],
    };
    const named = inEnglish(card, lists);
    expect(named.entry.championName).toBe('Brand');
    expect(named.entry.with.map((m) => m.championName)).toEqual(['Wukong', 'Wukong (de)']);
    expect(named.augments['1001']).toEqual({ name: 'Goliath', rarity: 'prismatic', icon: null });
    expect(named.augments['1003']!.name).toBe('Unbekannt');
    // Without the lists (arammeta did not answer) the client's names stay.
    expect(inEnglish(card, null)).toBe(card);
  });
});

describe('how special the game is', () => {
  const chip = (id: string, place: number) => ({
    id,
    title: id,
    hue: 'fire' as const,
    place,
    record: place === 1,
  });

  it('legend: a Pentakill or a new #1 in Highest damage', () => {
    expect(cardLevel(game(1, 1, { pentas: 1 }), [])).toEqual({
      level: 'legend',
      badge: 'Pentakill',
    });
    expect(cardLevel(game(1, 1, { pentas: 2 }), []).badge).toBe('2 Pentakills');
    expect(cardLevel(game(1, 1), [chip('damage', 1)])).toEqual({
      level: 'legend',
      badge: 'New record',
    });
  });

  it('top: the most damage of all ten or a new #1 elsewhere; the top ten alone is not', () => {
    expect(cardLevel(game(1, 1, { damageRank: 1 }), [])).toEqual({
      level: 'top',
      badge: 'Top damage',
    });
    expect(cardLevel(game(1, 1), [chip('heal', 1)])).toEqual({ level: 'top', badge: 'Record' });
    expect(cardLevel(game(1, 1), [chip('damage', 2)])).toEqual({ level: 'normal', badge: null });
  });

  it('the browser preview shows each level', () => {
    const level = (kind: Parameters<typeof mockCard>[0]) => {
      const { card, records } = mockCard(kind);
      return cardLevel(card.entry, recordChips(card.entry, records, null)).level;
    };
    expect([level('legend'), level('top'), level('loss')]).toEqual(['legend', 'top', 'normal']);
  });
});

describe('the game on the ladder', () => {
  const games = Array.from({ length: 8 }, (_, i) => game(100 + i, 30_000 + i * 4_000));
  const [own] = standings(games);
  const profile = JSON.stringify({ icon: 7, ...open(own!), id: 'a9', history: own!.history });
  const board = JSON.stringify({ players: [{ ...summary(own!, 7), puuid: 'a9' }] });
  const me = ownState({ name: 'Me#EUW', board, me: profile });

  it('takes the step of the game from the site as the rating computes it', () => {
    for (const g of games)
      expect(gameRank(own!.history, g.gameId)).toEqual(rankResult(games, 'me', g.gameId));
    expect(gameRank(own!.history, 999)).toBeNull();
    expect(me.state === 'ready' && me.me?.siteId).toBe('a9');
  });

  it('waits for the game while listed, then says it came late', () => {
    const fresh = game(999, 40_000);
    expect(cardRank(me, games[7]!, false)).toEqual({
      state: 'ready',
      rank: rankResult(games, 'me', games[7]!.gameId),
    });
    expect(cardRank(me, fresh, false)).toEqual({ state: 'waiting' });
    expect(cardRank(me, fresh, true)).toEqual({ state: 'late' });
    // A remake never comes.
    expect(cardRank(me, { ...fresh, seconds: 7 * 60 }, false)).toEqual({ state: 'remake' });
  });

  it('not listed: the way onto the leaderboard; nobody known: nothing', () => {
    const unlisted: MeState = {
      state: 'ready',
      name: 'New#EUW',
      me: null,
      ladder: [],
      mock: false,
    };
    expect(cardRank(unlisted, games[0]!, false)).toEqual({ state: 'unlisted' });
    expect(cardRank({ state: 'closed' }, games[0]!, false)).toEqual({ state: 'none' });
    expect(cardRank({ state: 'loading' }, games[0]!, false)).toEqual({ state: 'none' });
  });

  it('no answer from the site: says so (with "Try again"), the line does not just go', () => {
    const failed: MeState = { state: 'failed', message: 'mayhemstats.lol did not answer.' };
    expect(cardRank(failed, games[0]!, false)).toEqual({
      state: 'failed',
      message: 'mayhemstats.lol did not answer.',
    });
  });

  it('runs the bar from before to after, through a promotion or a demotion', () => {
    const rank = (tier: number, division: number, points: number): Rank => ({
      tier: TIERS[tier]!,
      division,
      points,
      ladder: tier * 400 + (4 - division) * 100 + points,
    });
    const step = { grade: 'S' as const, pct: 0.5, games: 0 };
    expect(
      rankRun({
        ...step,
        gain: 20,
        before: rank(3, 1, 90),
        after: rank(4, 4, 10),
        change: 'promoted',
      }),
    ).toMatchObject({ up: true, widths: [0.9, 1, 0, 0.1], times: [0, 0.5, 0.501, 1] });
    expect(
      rankRun({
        ...step,
        gain: -20,
        before: rank(4, 4, 10),
        after: rank(3, 1, 90),
        change: 'demoted',
      }),
    ).toMatchObject({ down: true, widths: [0.1, 0, 1, 0.9] });
    expect(
      rankRun({ ...step, gain: 18, before: rank(4, 4, 10), after: rank(4, 4, 28), change: null }),
    ).toMatchObject({ up: false, down: false, widths: [0.1, 0.28] });
  });
});
