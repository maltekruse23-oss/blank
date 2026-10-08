// Invented values for the browser preview only (no League client, no Tauri there): the player and
// the leaderboard that the app reads from mayhemstats.lol (me.ts) and arammeta's list in the shape
// Rust's `mayhem_tiers` sends (tiers.ts). The pages say "Mock" with them; nothing here is sent
// anywhere.
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
  name: 'Example#EUW',
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
    { place: 1, name: 'Example#EUW', rank: rank(5, 1, 88), me: true },
    { place: 2, name: 'Second Pick#NA1', rank: rank(5, 2, 41), me: false },
    { place: 3, name: 'Third Wheel#KR1', rank: rank(4, 1, 97), me: false },
    { place: 4, name: 'Bridge Troll#EUNE', rank: rank(4, 2, 30), me: false },
  ],
};

const CHAMPS: [number, string, string, number, number][] = [
  [12, 'Alistar', 'Tank', 0.556, 3912],
  [1, 'Annie', 'Mage', 0.513, 858],
  [63, 'Brand', 'Mage', 0.538, 2410],
  [16, 'Soraka', 'Support', 0.547, 1980],
  [412, 'Thresh', 'Support', 0.462, 1466],
  [105, 'Fizz', 'Assassin', 0.494, 1210],
  [22, 'Ashe', 'Marksman', 0.521, 2875],
  [86, 'Garen', 'Fighter', 0.505, 1620],
  [99, 'Lux', 'Mage', 0.529, 3104],
  [37, 'Sona', 'Support', 0.527, 1228],
];

const AUGS: [number, string, string, string, string[], number, number][] = [
  [1001, 'Goliath', 'kPrismatic', 'Grow bigger, gain health and force.', ['tank'], 0.58, 8210],
  [
    1002,
    'Archmage',
    'kPrismatic',
    'Abilities hit harder and come back faster.',
    ['ap'],
    0.55,
    6120,
  ],
  [
    1003,
    'Back To Basics',
    'kPrismatic',
    'No ultimate, stronger basics.',
    ['amp', 'cd'],
    0.51,
    2950,
  ],
  [1004, 'Dive Bomber', 'kSilver', 'Die and explode for [數值] damage.', ['amp'], 0.49, 4402],
  [1005, 'Bread And Butter', 'kGold', 'Your Q gains ability haste.', ['cd'], 0.53, 5233],
  [1006, 'Donation', 'kGold', 'Gain gold now.', ['gold'], 0.47, 3301],
  [1007, 'First-Aid Kit', 'kSilver', 'Heals and shields are stronger.', ['support'], 0.52, 2780],
  [1008, 'Giant Slayer', 'kGold', 'More damage to bigger champions.', ['ad', 'amp'], 0.5, 3990],
];

/** An invented rate around `base`, different per index. */
const vary = (base: number, i: number) => Math.round((base + ((i * 7) % 9) / 300) * 1000) / 1000;

const moved = (
  id: number,
  name: string,
  champion: number | null,
  [currentWr, baselineWr]: [number, number],
  [currentGames, baselineGames]: [number, number],
  [currentTier, baselineTier]: [string | null, string | null] = [null, null],
) => ({
  id,
  name,
  champion,
  currentWr,
  baselineWr,
  currentGames,
  baselineGames,
  currentTier,
  baselineTier,
});

/** arammeta's list as Rust's `mayhem_tiers` sends it (tiers.ts reads it like the real one). */
export const MOCK_TIERS = {
  patch: '16.20',
  champions: CHAMPS.map(([id, alias, tag, wr, games], c) => ({
    id,
    name: alias,
    alias,
    tags: [tag],
    wr,
    games,
    top: AUGS.map(([aug, , rarity], i) => ({
      id: aug,
      rarity,
      games: 40 + (((i + c) * 37) % 300),
      wr: vary(0.5, i + c),
      lift: vary(-0.012, i + c),
      pick: 0.02 + i / 100,
    })),
    pairs: CHAMPS.filter(([other]) => other !== id).map(([other], i) => ({
      id: other,
      games: 20 + (((i + c) * 13) % 90),
      wr: vary(0.48, i + c),
      expected: 0.5,
      lift: vary(-0.01, i),
    })),
    comp: {
      phys: tag === 'Marksman' || tag === 'Fighter' ? 1500 : 120,
      magic: tag === 'Mage' ? 1700 : 260,
      true: 90,
      front: tag === 'Tank' ? 3 : 0.4,
      damage: tag === 'Mage' ? 2.6 : 1,
      engage: tag === 'Tank' ? 2 : 0.5,
      wave: 0.9,
      poke: tag === 'Mage' ? 2.4 : 0.6,
      sustain: tag === 'Support' ? 3 : 0.2,
      cc: (c % 4) * 0.8,
    },
  })),
  augments: AUGS.map(([id, name, rarity, text, cats, wr, games], i) => ({
    id,
    name,
    rarity,
    icon: '',
    text,
    cats,
    wr,
    games,
    lift: vary(-0.012, i),
    pick: 0.05 + i / 50,
    champions: CHAMPS.slice(i % 3, (i % 3) + 5).map(([champ]) => champ),
  })),
  categories: [
    { id: 'ad', label: 'AD' },
    { id: 'ap', label: 'AP' },
    { id: 'amp', label: 'Damage amp' },
    { id: 'tank', label: 'Defense' },
    { id: 'support', label: 'Support' },
    { id: 'cd', label: 'Cooldown' },
    { id: 'gold', label: 'Economy' },
  ],
  items: [
    { id: 3089, name: "Rabadon's Deathcap", price: 3600, role: 'Mage', text: '130 Ability Power' },
    { id: 3075, name: 'Thornmail', price: 2450, role: 'Tank', text: '150 Health\n75 Armor' },
    { id: 3031, name: 'Infinity Edge', price: 3450, role: 'Marksman', text: '65 Attack Damage' },
    { id: 3071, name: 'Black Cleaver', price: 3000, role: 'Fighter', text: '40 Attack Damage' },
    { id: 3504, name: 'Ardent Censer', price: 2200, role: 'Support', text: '45 Ability Power' },
    { id: 3047, name: 'Plated Steelcaps', price: 1200, role: null, text: '25 Armor' },
  ],
  changes: {
    current: '16.20',
    baseline: '16.19',
    currentGames: 21259,
    baselineGames: 869021,
    champions: {
      risers: [
        moved(412, 'Thresh', null, [0.462, 0.439], [1466, 64104], ['T4', 'T5']),
        moved(105, 'Fizz', null, [0.494, 0.479], [1210, 50211], ['T3', 'T4']),
      ],
      fallers: [moved(37, 'Sona', null, [0.527, 0.541], [1228, 48159], ['T1', 'T1'])],
    },
    items: {
      risers: [moved(3031, 'Infinity Edge', null, [0.49, 0.476], [5730, 227525])],
      fallers: [moved(3504, 'Ardent Censer', null, [0.489, 0.529], [3009, 129595])],
    },
    augments: {
      risers: [moved(1004, 'Dive Bomber', null, [0.479, 0.443], [663, 28079])],
      fallers: [moved(1006, 'Donation', null, [0.378, 0.523], [590, 44424])],
    },
    championItems: {
      risers: [moved(3071, 'Black Cleaver', 86, [0.625, 0.489], [130, 7841])],
      fallers: [],
    },
    championAugments: {
      risers: [moved(1005, 'Bread And Butter', 105, [0.604, 0.49], [144, 6027])],
      fallers: [moved(1002, 'Archmage', 99, [0.418, 0.571], [82, 3349])],
    },
  },
};
