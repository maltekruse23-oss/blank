// Invented values for the one part of the Mayhem app without real data yet: the rank page
// (planned: the user's own rank and the leaderboard from mayhemstats.lol, the player known from
// the League client). The page says "Mock" in its header; nothing here is sent anywhere.

export type MockPlayer = {
  place: number;
  name: string;
  server: string;
  rank: string;
  mp: number;
  alias: string;
};

export const MOCK_LADDER: MockPlayer[] = [
  { place: 1, name: 'Player One', server: 'EUW', rank: 'SS I', mp: 88, alias: 'Alistar' },
  { place: 2, name: 'Second Pick', server: 'NA', rank: 'SS II', mp: 41, alias: 'Brand' },
  { place: 3, name: 'Third Wheel', server: 'KR', rank: 'S I', mp: 97, alias: 'Jinx' },
  { place: 4, name: 'Bridge Troll', server: 'EUNE', rank: 'S II', mp: 30, alias: 'Soraka' },
];

export type MockGame = {
  alias: string;
  win: boolean;
  kda: string;
  grade: 'sss' | 'ss' | 's';
  mp: number;
  ago: string;
};

export const MOCK_ME = {
  /** The most played champion this season (home's hero). */
  main: { alias: 'Alistar', name: 'Alistar', games: 28, grade: 'SS', winRate: '68 %' },
  played: 63,
  average: 's' as const,
  records: [
    { value: '112k', label: 'Eingesteckt', best: true },
    { value: '31', label: 'Kill-Beteiligung', best: false },
  ],
  goal: { title: 'Hol dir eine SSS-Note', line: 'Noch 2 S-Noten bis zum Aufstieg.', done: 0.66 },
  rank: 'SS I',
  mp: 88,
  wins: 41,
  losses: 22,
  top: 'Top 1 %',
  games: [
    { alias: 'Alistar', win: true, kda: '8/2/31', grade: 'sss', mp: 28, ago: 'vor 2 h' },
    { alias: 'Soraka', win: true, kda: '2/4/38', grade: 'ss', mp: 19, ago: 'gestern' },
    { alias: 'Brand', win: false, kda: '11/7/14', grade: 's', mp: 6, ago: 'gestern' },
  ] as MockGame[],
};
