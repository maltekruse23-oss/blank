import { describe, expect, it } from 'vitest';
import type { AramEntry, AramSeat } from '../../adapters/aram';
import { standings } from './aramRating';
import { PLACES, recordRanking, recordsView } from '../../../apps/mayhem-site/src/records';
import { placesOf } from '../../../apps/mayhem-site/src/places';

// A player's own places on the website (apps/mayhem-site/src/places.ts, "Deine Plätze"): ladder,
// Leistung Ø and every record category, best first, from the same standings and record rankings
// as the leaderboard and /rekorde.
const MAGE = 103;
const TANK = 54;
const SUPPORT = 16;

const seat = (values: Partial<AramSeat> = {}): AramSeat => ({
  team: 100,
  championId: MAGE,
  kills: 8,
  deaths: 8,
  assists: 20,
  damage: 30_000,
  taken: 30_000,
  mitigated: 20_000,
  healed: 5_000,
  shielded: 0,
  gold: 14_000,
  ...values,
});

function game(you: Partial<AramSeat>, extra: Partial<AramEntry> = {}): AramEntry {
  const others = Array.from({ length: 9 }, (_, i) =>
    seat({
      team: i < 4 ? 100 : 200,
      championId: [MAGE, TANK, SUPPORT][i % 3],
      damage: 20_000 + i * 3_000,
      kills: 5 + i,
      deaths: 6 + (i % 4),
      assists: 15 + i,
      taken: 25_000 + i * 2_000,
    }),
  );
  const lobby = [seat({ ...you, you: true }), ...others];
  const me = lobby[0];
  return {
    gameId: 1,
    at: 1_790_000_000_000,
    seconds: 18 * 60,
    patch: '16.19',
    puuid: 'p1',
    name: 'Eins',
    championId: me.championId,
    champion: 'Ahri',
    championName: 'Ahri',
    win: false,
    kills: me.kills,
    deaths: me.deaths,
    assists: me.assists,
    damage: me.damage,
    taken: me.taken,
    healed: me.healed,
    shielded: me.shielded,
    gold: me.gold,
    level: 18,
    items: [],
    augments: [],
    damageRank: 1,
    teamShare: 0.3,
    multikill: 1,
    pentas: 0,
    details: null,
    with: [],
    lobby,
    ...extra,
  };
}

const NOW = 1_790_000_000_000;
const MIN = 60 * 1000;

/** `games` games of player `puuid`, each with these values. */
const series = (puuid: string, first: number, games: number, you: Partial<AramSeat>) =>
  Array.from({ length: games }, (_, i) =>
    game(you, {
      gameId: first + i,
      puuid,
      name: puuid.toUpperCase() + '#EUW',
      at: NOW - (first + i) * MIN,
    }),
  );

describe('website: own places', () => {
  const all = [
    ...series('anna', 100, 6, { damage: 90_000, kills: 25, assists: 30, deaths: 3 }),
    ...series('bert', 200, 6, {
      damage: 40_000,
      kills: 10,
      assists: 20,
      deaths: 8,
      healed: 60_000,
    }),
    ...series('carl', 300, 6, { damage: 10_000, kills: 2, assists: 5, deaths: 14 }),
    // Not ranked yet: two games.
    ...series('dora', 400, 2, { damage: 50_000, kills: 30, assists: 10, deaths: 6 }),
  ];
  const list = standings(all);
  const records = recordRanking(all, NOW);

  it('knows nobody without a counted game', () => {
    expect(placesOf(list, records, 'nobody')).toBeNull();
  });

  it('gives the place on the ladder among the ranked players, the same as the leaderboard order', () => {
    const ranked = list.filter((s) => s.rank);
    expect(ranked.length).toBe(3);
    ranked.forEach((s, i) => {
      const rank = placesOf(list, records, s.puuid)!.placements.find((p) => p.kind === 'rank')!;
      expect(rank.of).toBe(3);
      expect(rank.place).toBeLessThanOrEqual(i + 1);
    });
    // In the placement: no ladder place, but records still count.
    const dora = placesOf(list, records, 'dora')!;
    expect(dora.rank).toBeNull();
    expect(dora.placed).toBe(2);
    expect(dora.placements.some((p) => p.kind === 'rank')).toBe(false);
    expect(dora.placements.find((p) => p.id === 'kills')).toMatchObject({
      place: 1,
      value: 30,
      kind: 'record',
    });
  });

  it('matches /rekorde: same place and value, the game of the value', () => {
    const shown = recordsView(all, NOW);
    for (const s of list) {
      for (const p of placesOf(list, records, s.puuid)!.placements.filter(
        (x) => x.kind === 'record',
      )) {
        const row = shown.find((c) => c.id === p.id)!.places.find((x) => x.puuid === s.puuid)!;
        expect(p).toMatchObject({
          place: row.place,
          value: row.value,
          gameId: row.game.gameId,
          title: shown.find((c) => c.id === p.id)!.title,
        });
      }
    }
  });

  it('puts the best place first, the ladder before the rest on the same place', () => {
    const order = (p: { kind: string }) =>
      p.kind === 'rank' ? 0 : p.kind === 'performance' ? 1 : 2;
    for (const s of list) {
      const places = placesOf(list, records, s.puuid)!.placements;
      for (let i = 1; i < places.length; i++) {
        const a = places[i - 1];
        const b = places[i];
        expect(
          a.place < b.place ||
            (a.place === b.place &&
              (order(a) < order(b) || (order(a) === order(b) && a.place / a.of <= b.place / b.of))),
        ).toBe(true);
      }
    }
    expect(placesOf(list, records, 'anna')!.placements[0].place).toBe(1);
  });

  it('ranks every player in a record, not only the ten shown on /rekorde', () => {
    const many = Array.from({ length: PLACES + 3 }, (_, i) =>
      game(
        { kills: 40 - i },
        { gameId: 1000 + i, puuid: `p${i}`, name: `P${i}#EUW`, at: NOW - i * MIN },
      ),
    );
    const last = `p${PLACES + 2}`;
    const kills = placesOf(standings(many), recordRanking(many, NOW), last)!.placements.find(
      (p) => p.id === 'kills',
    )!;
    expect(kills).toMatchObject({ place: PLACES + 3, of: PLACES + 3 });
    expect(recordsView(many, NOW).find((c) => c.id === 'kills')!.places).toHaveLength(PLACES);
  });

  it('lets ties share a place', () => {
    const tied = [
      game({ kills: 20 }, { gameId: 1, puuid: 'x', name: 'X#EUW', at: NOW - MIN }),
      game({ kills: 20 }, { gameId: 2, puuid: 'y', name: 'Y#EUW', at: NOW - 2 * MIN }),
      game({ kills: 10 }, { gameId: 3, puuid: 'z', name: 'Z#EUW', at: NOW - 3 * MIN }),
    ];
    const at = (id: string) =>
      placesOf(standings(tied), recordRanking(tied, NOW), id)!.placements.find(
        (p) => p.id === 'kills',
      )!.place;
    expect([at('x'), at('y'), at('z')]).toEqual([1, 1, 3]);
  });
});
