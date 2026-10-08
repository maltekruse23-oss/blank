// Invented values for the browser preview only (no League client, no Tauri there): the player, the
// leaderboard and the records that the app reads from mayhemstats.lol (me.ts, records.ts),
// arammeta's list in the shape Rust's `mayhem_tiers` sends (tiers.ts) and the card after a game
// (afterGame.ts). The pages say "Mock" with them; nothing here is sent anywhere.
import type { AramEntry } from '../adapters/aram';
import type { GameCard } from '../adapters/aramSite';
import { RECORDS } from '../../apps/mayhem-site/src/records';
import { TIERS, type Rank } from '../features/aram/aramRating';
import type { CardRank } from './afterGame';
import type { MeState } from './me';
import type { RecordCard } from './records';

const rank = (tier: number, division: number | null, points: number): Rank => ({
  tier: TIERS[tier]!,
  division,
  points,
  ladder: tier * 400 + (division === null ? 0 : (4 - division) * 100) + points,
});

const HOUR = 3_600_000;
const at = (hours: number) => Date.now() - hours * HOUR;

/** Older invented games of the player (Match history shows ten, the rest behind "Show more"). */
const OLDER = (
  [
    [99, 'Lux', true, '9/5/22', 'A', 14],
    [12, 'Alistar', false, '2/9/30', 'C', -12],
    [22, 'Ashe', true, '14/6/19', 'S', 21],
    [86, 'Garen', false, '7/11/9', 'D', -19],
    [37, 'Sona', true, '3/6/41', 'SS', 18],
    [1, 'Annie', true, '18/4/16', 'MAYHEM', 30],
    [412, 'Thresh', false, '1/8/27', 'B', -6],
    [105, 'Fizz', true, '16/9/12', 'A', 11],
    [63, 'Brand', false, '12/10/15', 'E', -24],
  ] as const
).map(([championId, name, win, kda, grade, gain], i) => ({
  gameId: 100 - i,
  championId,
  alias: name,
  name,
  win,
  kda,
  at: at(30 + i * 9),
  grade,
  gain,
}));

const NAMES = [
  'Poro Prophet#EUW',
  'Snowball King#NA1',
  'Bridge Troll#EUNE',
  'Second Pick#NA1',
  'Third Wheel#KR1',
  'Howling Abyss#EUW',
  'Mayhem Mage#OCE',
  'Kite Runner#EUW',
  'Tower Hugger#BR1',
  'Mark Dash#NA1',
  'Quiet Support#EUW',
  'Lane Gremlin#KR1',
  'Late Blink#EUNE',
  'Heal Bot#NA1',
  'Gold Fever#EUW',
  'Last Hit#LAN',
  'Big Shield#EUW',
  'Ult Saver#NA1',
  'One Trick#EUW',
  'Stack Lord#KR1',
  'Long Range#EUNE',
  'Flash Forward#NA1',
  'Dive Day#EUW',
  'Poke Tax#TR1',
  'Frost Bite#EUW',
  'Tank Shell#NA1',
  'Sudden Death#EUW',
  'Augment Fan#JP1',
  'Bot Diff#EUW',
  'Ranged Hug#NA1',
  'Penta Hope#EUNE',
];

/** An invented leaderboard: 32 players, the player seventh (the Rank page shows 25 first). */
const LADDER = NAMES.map((name, i) => {
  const r =
    i < 2
      ? rank(7, null, 640 - i * 90)
      : i < 6
        ? rank(6, null, 420 - i * 40)
        : rank(5 - Math.floor((i - 6) / 8), 1 + Math.floor(((i - 6) % 8) / 2), 80 - (i % 2) * 35);
  return { name, rank: r, icon: 500 + i * 37 };
});
LADDER.splice(6, 0, { name: 'Example#EUW', rank: rank(5, 1, 88), icon: 29 });

export const MOCK_STATE: MeState = {
  state: 'ready',
  name: 'Example#EUW',
  siteId: 'a1',
  mock: true,
  me: {
    rank: rank(5, 1, 88),
    placed: 5,
    games: 63,
    wins: 41,
    average: 'S',
    place: 7,
    top: null,
    main: { championId: 12, alias: 'Alistar', name: 'Alistar', games: 28, wins: 19, grade: 'SS' },
    best: { damage: 112_000, kills: 31 },
    curve: [2010, 2032, 2025, 2051, 2070, 2064, 2091, 2110, 2132, 2160, 2188],
    recent: [
      {
        gameId: 3,
        championId: 12,
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
        championId: 16,
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
        championId: 63,
        alias: 'Brand',
        name: 'Brand',
        win: false,
        kda: '11/7/14',
        at: at(26),
        grade: 'S',
        gain: 6,
      },
      ...OLDER,
    ],
    history: [],
  },
  ladder: LADDER.map((p, i) => ({ place: i + 1, ...p, me: p.name === 'Example#EUW' })),
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
};

/** The card after a game in the browser preview: "Preview card" on the Rank page, or the address
 * `mayhem.html?card=legend` (also `top`, `loss`, `unlisted`, `waiting`). */
export const CARD_PREVIEWS = ['legend', 'top', 'loss', 'unlisted', 'waiting'] as const;
export type CardPreview = (typeof CARD_PREVIEWS)[number];

const mate = (name: string, champion: string, damage: number, sameTeam: boolean) => ({
  puuid: name,
  name,
  champion,
  championName: champion,
  damage,
  kills: Math.round(damage / 6000),
  deaths: 5,
  assists: 18,
  sameTeam,
});

const CARD_ENTRY: AramEntry = {
  gameId: 9_000_000_001,
  at: Date.now() - 23 * 60_000,
  seconds: 21 * 60 + 34,
  patch: '16.20',
  puuid: 'example',
  name: 'Example#EUW',
  championId: 63,
  champion: 'Brand',
  championName: 'Brand',
  win: true,
  kills: 24,
  deaths: 3,
  assists: 31,
  damage: 96_480,
  taken: 31_200,
  healed: 4_100,
  shielded: 0,
  gold: 19_850,
  level: 18,
  items: [],
  augments: [1002, 1004, 1005, 1001],
  damageRank: 1,
  teamShare: 0.34,
  multikill: 5,
  pentas: 1,
  details: {
    magic: 88_900,
    physical: 4_100,
    trueDamage: 3_480,
    mitigated: 18_000,
    doubles: 4,
    triples: 2,
    quadras: 1,
    largestCrit: 0,
    ccSeconds: 41,
    largestSpree: 14,
    turretDamage: 2_300,
  },
  with: [
    mate('Second Pick#NA1', 'Lux', 71_300, true),
    mate('Sona Main#EUW', 'Sona', 28_900, true),
    mate('Bridge Troll#EUNE', 'Garen', 44_700, false),
  ],
  provisional: true,
  skin: 1,
};

const CARD_AUGMENTS: GameCard['augments'] = {
  '1001': { name: 'Goliath', rarity: 'prismatic', icon: null },
  '1002': { name: 'Archmage', rarity: 'prismatic', icon: null },
  '1004': { name: 'Dive Bomber', rarity: 'silver', icon: null },
  '1005': { name: 'Bread And Butter', rarity: 'gold', icon: null },
};

/** A record list as records.ts reads it, held by others than the mock player (`a1`). */
const best = (id: string, first: number, step: number): RecordCard => {
  const c = RECORDS.find((r) => r.id === id)!;
  return {
    id,
    title: c.titleEn,
    note: c.noteEn,
    total: false,
    seconds: false,
    places: Array.from({ length: 10 }, (_, i) => ({
      place: i + 1,
      id: `r${i + 1}`,
      name: `Rival ${i + 1}#EUW`,
      value: Math.round(first - i * step),
      championId: CHAMPS[i % CHAMPS.length]![0],
      champion: null,
      championName: null,
      at: at(i * 9),
      gameId: 8_000_000_000 + i,
    })),
  };
};

const CARD_RECORDS: RecordCard[] = [
  best('damage', 90_210, 2_400),
  best('dpm', 5_200, 160),
  best('ap', 92_000, 2_000),
  best('kills', 31, 1),
  best('heal', 41_000, 2_500),
];

/** One preview of the card: the game, the records it is compared with and the rank line. */
export function mockCard(kind: CardPreview): {
  card: GameCard;
  records: RecordCard[];
  rank: CardRank;
} {
  const card = (entry: Partial<AramEntry>) => ({
    card: { entry: { ...CARD_ENTRY, ...entry }, augments: CARD_AUGMENTS },
    records: CARD_RECORDS,
  });
  const result = (before: Rank, after: Rank, gain: number, grade: 'SSS' | 'S' | 'D'): CardRank => ({
    state: 'ready',
    rank: {
      grade,
      pct: 0.5,
      gain,
      before,
      after,
      change: after.tier !== before.tier ? (gain > 0 ? 'promoted' : 'demoted') : null,
      games: 0,
    },
  });
  const less = (damage: number) => ({
    pentas: 0,
    multikill: 2,
    damage,
    details: { ...CARD_ENTRY.details!, magic: Math.round(damage * 0.9) },
  });
  // No Pentakill, less damage: the most of all ten and a new #1 in healing only.
  const topGame = { ...less(74_200), kills: 14, healed: 44_800 };
  switch (kind) {
    case 'legend':
      return { ...card({}), rank: result(rank(3, 1, 88), rank(4, 4, 12), 24, 'SSS') };
    case 'top':
      return { ...card(topGame), rank: result(rank(4, 4, 12), rank(4, 4, 31), 19, 'S') };
    case 'loss':
      return {
        ...card({
          ...less(23_400),
          win: false,
          kills: 4,
          deaths: 9,
          damageRank: 6,
          teamShare: 0.16,
        }),
        rank: result(rank(4, 4, 8), rank(3, 1, 84), -24, 'D'),
      };
    case 'unlisted':
      return { ...card(topGame), rank: { state: 'unlisted' } };
    case 'waiting':
      return { ...card(topGame), rank: { state: 'waiting' } };
  }
}

const RECORD_PLAYERS = [
  'Example#EUW',
  'Second Pick#NA1',
  'Third Wheel#KR1',
  'Bridge Troll#EUNE',
  'Snowball King#EUW',
  'Poro Snack#NA1',
  'Late Flash#KR1',
  'Mid Or Feed#EUW',
  'Shield Bot#OCE',
  'Last Hit#BR1',
];
/** An invented place 1 per category (the others follow below it); turret damage has none yet. */
const RECORD_TOP: Record<string, number> = {
  damage: 190_000,
  dpm: 8_700,
  pentas: 4,
  ap: 150_000,
  ad: 130_000,
  kills: 41,
  tank: 300_000,
  heal: 130_000,
  true: 70_000,
  mitigated: 560_000,
  crit: 2_900,
  cc: 230,
  spree: 10,
  gold: 48_000,
};

/** The records as the website answers GET /api/rekorde (records.ts reads them like the real one).
 * The mock player (`a1`, Example#EUW) holds some and is further down in others. */
export const mockRecords = (season: boolean) => ({
  scope: season ? 'season' : 'all',
  season: { id: '2026-3', year: 2026, number: 3, start: 0 },
  games: season ? 412 : 1_380,
  players: season ? 96 : 241,
  categories: RECORDS.map((c, n) => {
    const top = RECORD_TOP[c.id] ?? 0;
    const values = RECORD_PLAYERS.map((_, i) =>
      Math.max(1, Math.round(top * (1 - i * 0.07) * (season ? 0.85 : 1))),
    );
    return {
      id: c.id,
      places: top
        ? values.map((value, i) => {
            const who = (i + n * 3) % RECORD_PLAYERS.length;
            return {
              place: values.filter((v) => v > value).length + 1,
              puuid: `a${who + 1}`,
              name: RECORD_PLAYERS[who],
              icon: 1,
              value,
              fresh: false,
              game: {
                gameId: 7_000_000_000 + n * 10 + i,
                at: at((i + n) * 7),
                seconds: 1_260,
                championId: CHAMPS[(i + n) % CHAMPS.length]![0],
                champion: '',
                championName: '',
                skin: null,
              },
            };
          })
        : [],
    };
  }),
});
