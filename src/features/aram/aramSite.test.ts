import { describe, expect, it } from 'vitest';
import type { AramEntry, AramSeat } from '../../adapters/aram';
import { rankResult, standings } from './aramRating';
import { combine, fromLocal, parseBoard, parseProfile, rankGames, siteEntry } from './aramSite';
import { ladderPlace } from './RankHistory';
import { open, summary } from '../../../apps/mayhem-site/src/summary';
import { withPublicIds } from '../../../apps/mayhem-site/src/public-ids';

// The app reads the website's ranks (PLAN.md Etappe 6): exactly the form the website sends
// (apps/mayhem-site/src/summary.ts) gives the same ranks as the same games computed on this PC.
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

function game(id: number, puuid: string, at: number, you: Partial<AramSeat>): AramEntry {
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
    gameId: id,
    at,
    seconds: 18 * 60,
    patch: '16.19',
    puuid,
    name: puuid.toUpperCase() + '#EUW',
    championId: me.championId,
    champion: 'Ahri',
    championName: 'Ahri',
    win: id % 2 === 0,
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
  };
}

const NOW = 1_790_000_000_000;
const HOUR = 60 * 60 * 1000;
const games: AramEntry[] = [];
for (let i = 0; i < 9; i++) {
  games.push(game(100 + i, 'strong', NOW + i * HOUR, { damage: 60_000 + i * 2_000, kills: 20 }));
  games.push(game(200 + i, 'weak', NOW + i * HOUR, { damage: 12_000, kills: 2, deaths: 13 }));
}
games.push(game(300, 'new', NOW, {}));
const all = standings(games);
/** The website's answers for these games, through JSON as on the wire. */
const boardText = JSON.stringify({ players: all.map((s) => summary(s, 7)) });
const profileText = (puuid: string) => {
  const s = all.find((x) => x.puuid === puuid)!;
  return JSON.stringify({ icon: 7, ...open(s), history: s.history });
};

describe('ranks from the website', () => {
  it('reads the same ranks as computed on this PC', () => {
    const board = parseBoard(boardText);
    expect(board.map((p) => p.puuid)).toEqual(all.map((s) => s.puuid));
    for (const p of board) {
      const local = fromLocal(all.find((s) => s.puuid === p.puuid)!);
      expect(p.rank).toEqual(local.rank);
      expect([p.games, p.wins, p.placed, p.climbing]).toEqual([
        local.games,
        local.wins,
        local.placed,
        local.climbing,
      ]);
      expect(p.average).toEqual(local.average);
      expect(
        p.last.map(({ gameId, gain, grade, change }) => [gameId, gain, grade, change]),
      ).toEqual(local.last.map(({ gameId, gain, grade, change }) => [gameId, gain, grade, change]));
      expect(p.history).toEqual([]);
      expect(p.source).toBe('site');
    }
    expect(board.find((p) => p.puuid === 'strong')!.rank).not.toBeNull();
    expect(board.find((p) => p.puuid === 'new')!.rank).toBeNull();
  });

  it('reads a full profile with every game', () => {
    const me = parseProfile(profileText('strong'));
    const local = fromLocal(all.find((s) => s.puuid === 'strong')!);
    expect(me.rank).toEqual(local.rank);
    expect(me.history.map((s) => [s.entry.gameId, s.gain, s.after, s.change])).toEqual(
      local.history.map((s) => [s.entry.gameId, s.gain, s.after, s.change]),
    );
  });

  it('prefers the website and keeps players it does not know', () => {
    const site = { players: parseBoard(boardText), me: parseProfile(profileText('strong')) };
    const local = standings([...games, game(400, 'friend', NOW, {})]);
    const ranked = combine(local, site);
    expect(ranked.find((p) => p.puuid === 'strong')!.history.length).toBe(9);
    expect(ranked.find((p) => p.puuid === 'weak')!.source).toBe('site');
    expect(ranked.find((p) => p.puuid === 'friend')!.source).toBe('local');
    expect(combine(local, null).every((p) => p.source === 'local')).toBe(true);
  });

  it('places by ladder, whatever the order', () => {
    const ranked = combine(all, null).reverse();
    expect(ladderPlace(ranked, 'strong')!.place).toBe(1);
  });

  it('rejects answers it cannot trust', () => {
    const bad = (change: (p: Record<string, unknown>) => void) => {
      const board = JSON.parse(boardText);
      change(board.players[0]);
      return () => parseBoard(JSON.stringify(board));
    };
    expect(bad((p) => (p.games = -1))).toThrow();
    expect(bad((p) => (p.wins = 999))).toThrow();
    expect(
      bad((p) => (p.rank = { tier: { id: 'gold' }, division: 1, points: 5, ladder: 5 })),
    ).toThrow();
    expect(
      bad((p) => (p.rank = { tier: { id: 'sss' }, division: 2, points: 5, ladder: 5 })),
    ).toThrow();
    expect(bad((p) => (p.climbing = 'ja'))).toThrow();
    expect(bad((p) => (p.last6 = [{ gameId: 1, gain: 5, grade: 'Z', change: null }]))).toThrow();
    expect(() => parseBoard('<html>')).toThrow();
    expect(() =>
      parseProfile(JSON.stringify({ ...JSON.parse(profileText('strong')), history: [{}] })),
    ).toThrow();
  });

  it('shows on the card after a game the step the website will show', () => {
    // The website has all but the newest game; the newest is only on this PC (not uploaded yet).
    const mine = games.filter((g) => g.puuid === 'strong');
    const newest = mine[mine.length - 1];
    const before = standings(mine.slice(0, -1))[0];
    const site = {
      players: parseBoard(boardText),
      me: parseProfile(JSON.stringify({ icon: 7, ...open(before), history: before.history })),
    };
    const entries = rankGames(site, 'strong', games)!;
    expect(entries.filter((e) => e.gameId === newest.gameId)).toHaveLength(1);
    expect(rankResult(entries, 'strong', newest.gameId)).toEqual(
      rankResult(mine, 'strong', newest.gameId),
    );
    // Another player's game, or no profile on the website: computed locally.
    expect(rankGames(site, 'weak', games)).toBeNull();
    expect(rankGames(null, 'strong', games)).toBeNull();
  });

  it('finds the players of this PC although the website names nobody by PUUID', () => {
    // As the website answers now: everyone under a public id; the user's own profile keeps the
    // PUUID it was asked for and names its public id.
    const long = (id: string) => id.padEnd(36, '0');
    const ids = new Map(all.map((s, i) => [long(s.puuid), `a${i + 1}`]));
    const wire = (text: string) =>
      JSON.parse(text.replace(/"puuid":"(\w+)"/g, (_, id: string) => `"puuid":"${long(id)}"`));
    const board = JSON.stringify(withPublicIds(wire(boardText), ids));
    expect(board).not.toContain(long('strong'));
    const strong = long('strong');
    const me = JSON.stringify({
      ...withPublicIds(wire(profileText('strong')), ids, strong),
      id: ids.get(strong),
    });
    const site = { players: parseBoard(board), me: parseProfile(me) };
    const local = standings(games.map((g) => ({ ...g, puuid: long(g.puuid) })));
    const ranked = combine(local, site);
    expect(ranked).toHaveLength(all.length);
    expect(ranked.find((p) => p.puuid === strong)!.history.length).toBe(9);
    // A friend by Riot ID, whatever its case.
    const weak = ranked.find((p) => p.puuid === long('weak'))!;
    expect([weak.source, weak.siteId]).toEqual(['site', ids.get(long('weak'))]);
    expect(siteEntry(site, { puuid: long('weak'), name: 'weak#euw' })!.siteId).toBe(
      ids.get(long('weak')),
    );
    // Someone only the website knows keeps the public id.
    const other = { players: site.players, me: null };
    expect(combine([], other).every((p) => /^a\d+$/.test(p.puuid))).toBe(true);
  });
});
