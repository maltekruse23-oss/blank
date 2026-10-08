// Invented values for the browser preview only (no League client, no Tauri there): the player and
// the leaderboard that the app reads from mayhemstats.lol (me.ts). The pages say "Mock" with them;
// nothing here is sent anywhere.
import { TIERS, type Rank } from '../features/aram/aramRating';
import type { MeState } from './me';

const rank = (tier: number, division: number | null, points: number): Rank => ({
  tier: TIERS[tier]!,
  division,
  points,
  ladder: tier * 400 + (division === null ? 0 : (4 - division) * 100) + points,
});

const HOUR = 3_600_000;
const at = (hours: number) => Date.now() - hours * HOUR;

export const MOCK_STATE: MeState = {
  state: 'ready',
  name: 'Beispiel#EUW',
  mock: true,
  me: {
    rank: rank(5, 1, 88),
    placed: 5,
    games: 63,
    wins: 41,
    average: 'S',
    place: 1,
    top: null,
    main: { alias: 'Alistar', name: 'Alistar', games: 28, wins: 19, grade: 'SS' },
    best: { damage: 112_000, kills: 31 },
    curve: [2010, 2032, 2025, 2051, 2070, 2064, 2091, 2110, 2132, 2160, 2188],
    recent: [
      {
        gameId: 3,
        alias: 'Alistar',
        name: 'Alistar',
        win: true,
        kda: '8/2/31',
        at: at(2),
        grade: 'SSS',
        gain: 28,
      },
      {
        gameId: 2,
        alias: 'Soraka',
        name: 'Soraka',
        win: true,
        kda: '2/4/38',
        at: at(20),
        grade: 'SS',
        gain: 19,
      },
      {
        gameId: 1,
        alias: 'Brand',
        name: 'Brand',
        win: false,
        kda: '11/7/14',
        at: at(26),
        grade: 'S',
        gain: 6,
      },
    ],
  },
  ladder: [
    { place: 1, name: 'Beispiel#EUW', rank: rank(5, 1, 88), me: true },
    { place: 2, name: 'Second Pick#NA1', rank: rank(5, 2, 41), me: false },
    { place: 3, name: 'Third Wheel#KR1', rank: rank(4, 1, 97), me: false },
    { place: 4, name: 'Bridge Troll#EUNE', rank: rank(4, 2, 30), me: false },
  ],
};
