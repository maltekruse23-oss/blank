import { describe, expect, it } from 'vitest';
import type { AramEntry, AramSeat } from '../../adapters/aram';
import { standings } from './aramRating';
import {
  BEST_OF_DAY,
  DAY_MS,
  FRESH_RECORDS,
  freshRecords,
  startView,
} from '../../../apps/mayhem-site/src/start';
import { recordsView } from '../../../apps/mayhem-site/src/records';

// The website's start page (apps/mayhem-site/src/start.ts): head numbers, the games of the day,
// the grades of the season and this week's new records, all from the leaderboard's standings.
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
const HOUR = 60 * 60 * 1000;
const strong = { damage: 90_000, kills: 25, assists: 30, deaths: 3 };
const weak = { damage: 8_000, kills: 1, assists: 4, deaths: 14 };
const play = (id: number, puuid: string, at: number, you: Partial<AramSeat>) =>
  game(you, { gameId: id, puuid, name: puuid.toUpperCase() + '#EUW', at });

describe('website start page', () => {
  const all = [
    play(1, 'anna', NOW - 2 * DAY_MS, strong),
    play(2, 'anna', NOW - 3 * HOUR, weak),
    play(3, 'bert', NOW - 2 * HOUR, strong),
    play(4, 'bert', NOW - 1 * HOUR, {}),
    play(5, 'carl', NOW - 30 * 60 * 1000, { ...strong, damage: 60_000 }),
    play(6, 'carl', NOW - 20 * 60 * 1000, weak),
  ];
  all[5].seconds = 5 * 60; // a remake: no grade
  const list = standings(all);

  it('counts players and the graded games of the season, every grade from F to MAYHEM', () => {
    const view = startView(list, NOW, NOW - 2.5 * DAY_MS);
    expect(view.players).toBe(3);
    expect(view.seasonGames).toBe(5);
    expect(view.grades.map((g) => g.grade)).toEqual([
      'F',
      'E',
      'D',
      'C',
      'B',
      'A',
      'S',
      'SS',
      'SSS',
      'MAYHEM',
    ]);
    expect(view.grades.reduce((t, g) => t + g.games, 0)).toBe(5);
    // Games before the season do not count.
    expect(startView(list, NOW, NOW - DAY_MS).seasonGames).toBe(4);
  });

  it('shows the best grades of the last 24 hours, best first, never a remake', () => {
    const { today } = startView(list, NOW, 0);
    // all four counted games of the last 24 hours; BEST_OF_DAY (6, two rounds of augment cards) is the cap
    expect(today).toHaveLength(Math.min(4, BEST_OF_DAY));
    expect(today.map((g) => g.gameId)).not.toContain(1);
    expect(today.map((g) => g.gameId)).not.toContain(6);
    expect(today[0].gameId).toBe(3);
    const pcts = today.map(
      (g) => list.flatMap((s) => s.history).find((h) => h.entry.gameId === g.gameId)!.mark.pct,
    );
    expect([...pcts].sort((a, b) => b - a)).toEqual(pcts);
    expect(today[0]).toMatchObject({ puuid: 'bert', name: 'BERT#EUW', kills: 25, damage: 90_000 });
    expect(startView([], NOW, 0)).toEqual({
      players: 0,
      seasonGames: 0,
      grades: expect.any(Array),
      today: [],
    });
  });

  it('keeps only records first set this week, with only their first place', () => {
    const records = freshRecords(recordsView(all, NOW));
    expect(records.length).toBeLessThanOrEqual(FRESH_RECORDS);
    expect(records.length).toBeGreaterThan(0);
    for (const c of records) expect(c.places.every((p) => p.place === 1 && p.fresh)).toBe(true);
    // Only a week later nothing is new any more.
    expect(freshRecords(recordsView(all, NOW + 8 * DAY_MS))).toEqual([]);
  });
});
