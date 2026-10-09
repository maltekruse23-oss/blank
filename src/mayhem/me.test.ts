import { describe, expect, it } from 'vitest';
import type { AramEntry } from '../adapters/aram';
import { standings } from '../features/aram/aramRating';
import { parseBoard } from '../features/aram/aramSite';
import { open, summary } from '../../apps/mayhem-site/src/summary';
import {
  ago,
  aroundOf,
  curvePath,
  distributionOf,
  ladderOf,
  ownState,
  playerState,
  rankChart,
  versusOf,
  withChampions,
} from './me';

// The Mayhem app's player (me.ts): the website's answers, in the form it sends them
// (apps/mayhem-site/src/summary.ts), become what Home and Rang show.
const NOW = 1_790_000_000_000;
const HOUR = 3_600_000;
const CHAMPION_IDS: Record<string, number> = { Annie: 1, Brand: 63, Lux: 99, Ahri: 103 };

function game(id: number, puuid: string, at: number, champion: string, damage: number): AramEntry {
  const seat = { team: 100, championId: 1, kills: 8, deaths: 6, assists: 20, damage: 25_000 };
  const values = {
    taken: 30_000,
    mitigated: 20_000,
    healed: 5_000,
    shielded: 0,
    gold: 14_000,
  };
  const lobby = Array.from({ length: 10 }, (_, i) => ({
    ...seat,
    ...values,
    team: i < 5 ? 100 : 200,
    damage: i === 0 ? damage : 20_000 + i * 2_000,
    ...(i === 0 ? { you: true } : {}),
  }));
  return {
    gameId: id,
    at,
    seconds: 18 * 60,
    patch: '16.19',
    puuid,
    name: `${puuid}#EUW`,
    championId: CHAMPION_IDS[champion]!,
    champion,
    championName: champion,
    win: id % 2 === 0,
    kills: 8,
    deaths: 6,
    assists: 20,
    damage,
    ...values,
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

const games: AramEntry[] = [];
for (let i = 0; i < 8; i++) {
  games.push(game(100 + i, 'me', NOW + i * HOUR, i < 5 ? 'Ahri' : 'Brand', 30_000 + i * 1_000));
  games.push(game(200 + i, 'other', NOW + i * HOUR, 'Annie', 60_000));
}
games.push(game(300, 'new', NOW, 'Lux', 20_000));
const all = standings(games);
const board = JSON.stringify({ players: all.map((s) => ({ ...summary(s, 7), puuid: s.puuid })) });
const profile = (puuid: string) => {
  const s = all.find((x) => x.puuid === puuid)!;
  return JSON.stringify({ icon: 7, ...open(s), id: puuid, history: s.history });
};

describe('Mayhem app player', () => {
  it('shows the client closed or nobody signed in', () => {
    expect(ownState(null)).toEqual({ state: 'closed' });
  });

  it('shows a player the website does not know, with the leaderboard', () => {
    const state = ownState({ name: 'Neu#EUW', board, me: null });
    expect(state).toMatchObject({
      state: 'ready',
      name: 'Neu#EUW',
      siteId: null,
      me: null,
      mock: false,
    });
    expect(state.state === 'ready' && state.ladder.every((r) => !r.me)).toBe(true);
  });

  it('reads rank, main champion, records and last games from the profile', () => {
    const state = ownState({ name: 'Me#EUW', board, me: profile('me') });
    if (state.state !== 'ready' || !state.me) throw new Error(state.state);
    const me = state.me;
    // The public id the records name the player by (records.ts, "You: #7").
    expect(state.siteId).toBe('me');
    const local = all.find((s) => s.puuid === 'me')!;
    expect(me.rank).toEqual(local.rank);
    expect([me.games, me.wins]).toEqual([8, local.wins]);
    expect(me.main).toMatchObject({ name: 'Ahri', alias: 'Ahri', games: 5 });
    // The best performance is the game with the highest grade, with its damage.
    const top = local.history.reduce((b, s) => (s.mark.pct > b.mark.pct ? s : b));
    expect(me.best).toEqual({
      damage: 37_000,
      kills: 8,
      game: expect.objectContaining({
        gameId: top.entry.gameId,
        grade: top.mark.grade,
        damage: top.entry.damage,
      }),
    });
    expect(me.recent.map((g) => g.gameId)).toEqual([107, 106, 105, 104, 103, 102, 101, 100]);
    expect(me.recent[0]).toMatchObject({ name: 'Brand', kda: '8/6/20' });
    expect(me.curve.length).toBeGreaterThan(0);
    expect(state.ladder.find((r) => r.me)).toMatchObject({ name: 'me#EUW', icon: 7 });
    // Ladder rank out of every ranked player, the peak never below the current rank.
    expect(me.ranked).toBe(state.board.filter((p) => p.rank).length);
    expect(me.peak!.ladder).toBeGreaterThanOrEqual(me.rank!.ladder);
    // The distribution counts every ranked player once.
    const counts = distributionOf(state.board);
    expect(counts.map((c) => c.tier.id)).toEqual(['d', 'c', 'b', 'a', 's', 'ss', 'sss', 'mayhem']);
    expect(counts.reduce((t, c) => t + c.players, 0)).toBe(me.ranked);
  });

  it('ranks the player’s champions and compares them with everyone in their games', () => {
    const state = ownState({ name: 'Me#EUW', board, me: profile('me') });
    if (state.state !== 'ready' || !state.me) throw new Error(state.state);
    const me = state.me;
    expect(me.champions.map((c) => [c.name, c.games]).sort()).toEqual([
      ['Ahri', 5],
      ['Brand', 3],
    ]);
    // Brand's games dealt more damage (higher grades), so he leads.
    expect(me.champions[0]!.name).toBe('Brand');
    expect(me.versus).toMatchObject({ damagePlace: 1, topDamage: 8, counted: 8, share: 0.3 });
    expect(me.versus.better).toBeGreaterThan(0);
    // A value out of range counts as unknown, never as 0.
    const odd = all
      .find((s) => s.puuid === 'me')!
      .history.map((s, i) => ({
        ...s,
        entry: { ...s.entry, damageRank: i ? 11 : 2, teamShare: i ? -1 : 0.5 },
      }));
    expect(versusOf(odd)).toMatchObject({ damagePlace: 2, counted: 1, topDamage: 0, share: 0.5 });
    expect(versusOf([])).toEqual({
      better: null,
      damagePlace: null,
      topDamage: 0,
      counted: 0,
      share: null,
    });
  });

  it('opens any player card from their profile, not listed and broken as own states', () => {
    const card = playerState(profile('other'), [], []);
    if (card.state !== 'ready') throw new Error(card.state);
    expect(card).toMatchObject({ name: 'other#EUW', mock: false });
    expect(card.me.main).toMatchObject({ name: 'Annie', games: 8 });
    expect(card.me.recent).toHaveLength(8);
    expect(playerState(null, [], [])).toEqual({ state: 'missing' });
    expect(playerState('{"nope":1}', [], [])).toEqual({ state: 'failed' });
    // Ladder rows carry the public id the card opens with.
    expect(ladderOf(parseBoard(board), undefined)[0]!.siteId).toBeTruthy();
  });

  it('names the champions of archive games by id', () => {
    // The archive sends games without champion names (apps/mayhem-site/src/archive-entries.ts).
    const text = JSON.parse(profile('me'));
    for (const s of text.history) Object.assign(s.entry, { champion: '', championName: '' });
    const state = ownState({ name: 'Me#EUW', board, me: JSON.stringify(text) });
    if (state.state !== 'ready' || !state.me) throw new Error(state.state);
    // Still grouped by champion: five games of Ahri, not eight of "".
    expect(state.me.main).toMatchObject({ championId: 103, name: '', games: 5 });
    const list = [
      { id: 103, name: 'Ahri', alias: 'Ahri' },
      { id: 63, name: 'Brand', alias: 'Brand' },
    ];
    const named = withChampions(state, list);
    if (named.state !== 'ready' || !named.me) throw new Error(named.state);
    expect(named.me.main).toMatchObject({ name: 'Ahri', alias: 'Ahri', games: 5 });
    expect(named.me.recent[0]).toMatchObject({ name: 'Brand', alias: 'Brand' });
    // Without the list (not loaded yet): "–", never an empty heading.
    const bare = withChampions(state, []);
    expect(bare.state === 'ready' && bare.me?.main).toMatchObject({ name: '–', alias: null });
    // Games with names stay as the website named them.
    const own = ownState({ name: 'Me#EUW', board, me: profile('me') });
    expect(withChampions(own, [])).toEqual(own);
  });

  it('leaves values the website does not give empty, never 0', () => {
    const text = JSON.parse(profile('me'));
    for (const s of text.history) delete s.entry.damage;
    const state = ownState({ name: 'Me#EUW', board: null, me: JSON.stringify(text) });
    expect(state.state === 'ready' && state.me?.best.damage).toBeNull();
    // Without the leaderboard there is no place.
    expect(state.state === 'ready' && state.me?.place).toBeNull();
    expect(state.state === 'ready' && state.me?.ranked).toBeNull();
  });

  it('turns answers it cannot trust into an error', () => {
    expect(ownState({ name: 'x', board: '<html>', me: null }).state).toBe('failed');
    const text = JSON.parse(profile('me'));
    text.games = -1;
    expect(ownState({ name: 'x', board, me: JSON.stringify(text) }).state).toBe('failed');
  });

  it('lists the top hundred and the player below them', () => {
    const many = Array.from({ length: 140 }, (_, i) => ({
      ...parseBoard(board)[0]!,
      siteId: `a${i + 1}`,
      name: `P${i + 1}`,
      last: [],
      history: [],
      source: 'site' as const,
    }));
    const rows = ladderOf(many, 'a130');
    expect(rows.map((r) => r.place)).toEqual([
      ...Array.from({ length: 100 }, (_, i) => i + 1),
      130,
    ]);
    expect(rows.at(-1)).toMatchObject({ name: 'P130', me: true });
    expect(ladderOf(many, 'a2').filter((r) => r.me)).toHaveLength(1);
    // Home: two places above and below, cut at both ends, nothing when not listed.
    expect(aroundOf(many, 'a13').map((r) => r.place)).toEqual([11, 12, 13, 14, 15]);
    expect(aroundOf(many, 'a1').map((r) => r.place)).toEqual([1, 2, 3]);
    expect(aroundOf(many, 'a13').find((r) => r.me)?.name).toBe('P13');
    expect(aroundOf(many, 'x9')).toEqual([]);
    expect(aroundOf(many, undefined)).toEqual([]);
  });

  it('draws the MP curve from two games on', () => {
    expect(curvePath([100])).toBeNull();
    const curve = curvePath([100, 200, 150])!;
    expect(curve.line).toBe('M0 64 L150 6 L300 35');
    expect(curve.end).toEqual([300, 35]);
    expect(curvePath([100, 100])!.line).toBe('M0 64 L300 64');
  });

  it('says how long ago a game was', () => {
    expect(ago(NOW - 5 * 60_000, NOW)).toBe('5 min ago');
    expect(ago(NOW - 3 * HOUR, NOW)).toBe('3 h ago');
    expect(ago(NOW - 30 * HOUR, NOW)).toBe('yesterday');
    expect(ago(NOW - 72 * HOUR, NOW)).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });
});

describe('Rank card chart', () => {
  it('zooms to the last games and shows the tiers visible there, lowest first', () => {
    const chart = rankChart([1550, 1650, 1700])!;
    // Room of a quarter of the range: 1512.5 to 1737.5; S begins at 1600.
    expect(chart.bands.map((b) => b.tier.id)).toEqual(['a', 's']);
    expect(chart.bands[0]!.from).toBe(0);
    expect(chart.bands[0]!.to).toBeCloseTo(87.5 / 225);
    expect(chart.bands[1]!.to).toBe(1);
    expect(chart.points.map(([, y]) => y)).toEqual([37.5 / 225, 137.5 / 225, 187.5 / 225]);
    // Inside one tier: one band; at least 25 MP of room; never below 0.
    expect(rankChart([2100, 2100])!.bands.map((b) => b.tier.id)).toEqual(['ss']);
    expect(rankChart([2100, 2100])!.points).toEqual([
      [0, 0.5],
      [1, 0.5],
    ]);
    expect(rankChart([0, 10])!.points[0]).toEqual([0, 0]);
    expect(rankChart([3300, 3700])!.bands.map((b) => b.tier.id)).toEqual(['mayhem']);
    expect(rankChart([1200])).toBeNull();
  });
});
