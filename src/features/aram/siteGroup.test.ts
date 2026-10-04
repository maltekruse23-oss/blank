import { describe, expect, it } from 'vitest';
import type { AramEntry, AramSeat } from '../../adapters/aram';
import { standings } from './aramRating';
import { duelOf, membersOf, SESSION_GAP, sessionsOf } from '../../../apps/mayhem-site/src/group';

// The website's group page (apps/mayhem-site/src/group.ts): what the duel needs of every member,
// the duel of two and the group's game nights.
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

// Two nights: anna and bert play games 1–3 together (bert better in two), later anna alone.
const night1 = NOW - 2 * 24 * HOUR;
const all = [
  play(1, 'anna', night1, weak),
  play(1, 'bert', night1, strong),
  play(2, 'anna', night1 + HOUR, strong),
  play(2, 'bert', night1 + HOUR, weak),
  play(3, 'anna', night1 + 2 * HOUR, weak),
  play(3, 'bert', night1 + 2 * HOUR, strong),
  ...Array.from({ length: 6 }, (_, i) =>
    play(10 + i, 'anna', NOW - (6 - i) * 0.5 * HOUR, i % 2 ? strong : {}),
  ),
];
const list = standings(all);

describe('website group page', () => {
  it('gives every member radar, best values and graded games', () => {
    const members = membersOf(list);
    const anna = members.find((m) => m.puuid === 'anna')!;
    expect(anna.games).toHaveLength(9);
    expect(anna.radar).toHaveLength(5);
    expect(anna.bests.damage).toBe(90_000);
    expect(anna.bests.kills).toBe(25);
    // Missing details never count as 0.
    expect(anna.bests.ap).toBeUndefined();
  });

  it('compares two members only in the games they played together', () => {
    const members = membersOf(list);
    const anna = members.find((m) => m.puuid === 'anna')!;
    const bert = members.find((m) => m.puuid === 'bert')!;
    const duel = duelOf(anna, bert);
    expect(duel.together).toBe(3);
    expect(duel.aAhead).toBe(1);
    expect(duel.bAhead).toBe(2);
    expect(duelOf(bert, anna)).toMatchObject({
      together: 3,
      aAhead: 2,
      bAhead: 1,
      a: duel.b,
      b: duel.a,
    });
    expect(duelOf(anna, { ...bert, games: [] })).toEqual({
      together: 0,
      a: null,
      b: null,
      aAhead: 0,
      bAhead: 0,
    });
  });

  it('splits game nights at long pauses, newest first, with games, MP and best grade', () => {
    const nights = sessionsOf(list);
    expect(nights).toHaveLength(2);
    expect(nights[0].start).toBeGreaterThan(nights[1].end + SESSION_GAP);
    expect(nights[1].games).toBe(3);
    expect(nights[1].players.map((p) => p.puuid).sort()).toEqual(['anna', 'bert']);
    expect(nights[0].games).toBe(6);
    const anna = nights[0].players[0];
    expect(anna).toMatchObject({ puuid: 'anna', games: 6 });
    // The first five games of a player are placements: no MP.
    expect(nights[1].players.every((p) => p.placements === 3 && p.gain === 0)).toBe(true);
    expect(anna.placements).toBe(2);
    const gains = list[0].history
      .concat(list[1].history)
      .filter((h) => h.entry.at >= nights[0].start);
    expect(anna.gain).toBe(gains.reduce((t, h) => t + (h.gain ?? 0), 0));
    expect(sessionsOf(list, 1)).toHaveLength(1);
    expect(sessionsOf([])).toEqual([]);
  });
});
