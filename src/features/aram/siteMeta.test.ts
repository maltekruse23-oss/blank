import { describe, expect, it } from 'vitest';
import type { AramEntry, AramSeat } from '../../adapters/aram';
import { performanceOf } from './aramPerformance';
import { MIN_GAMES, PAIRED, metaDetail, metaView } from '../../../apps/mayhem-site/src/meta';
import { gradeOfPct } from '../../../apps/mayhem-site/src/insights';

// The website's augment and item statistics (apps/mayhem-site/src/meta.ts): every counted player
// and game once, pick rate as share of those, win rate and grade only from MIN_GAMES games on.
const pid = (i: number) => `puuid-${String(i).padStart(30, '0')}`;
const AHRI = 103;
const LUX = 99;
const CHAMPS = [AHRI, 54, 16, 22, 1, 2, 3, 4, 5, 6];

const lobbyOf = (game: number, you: number, championId: number): AramSeat[] =>
  CHAMPS.map((id, i) => ({
    you: i === you,
    team: i < 5 ? 100 : 200,
    championId: i === you ? championId : id === championId ? 900 + i : id,
    kills: 4 + ((i + game) % 7),
    deaths: 4 + ((i * 3 + game) % 5),
    assists: 12 + ((i * 5 + game) % 11),
    damage: 18_000 + ((i * 7 + game * 3) % 10) * 2_500,
    taken: 22_000 + ((i * 5 + game) % 9) * 2_000,
    mitigated: 15_000 + i * 1_000,
    healed: 3_000 + ((i + game) % 4) * 1_500,
    shielded: 0,
    gold: 12_000 + i * 300,
  }));

function entry(player: number, gameId: number, extra: Partial<AramEntry> = {}): AramEntry {
  const championId = extra.championId ?? AHRI;
  const lobby = lobbyOf(gameId, player % 10, championId);
  const me = lobby[player % 10];
  return {
    gameId,
    at: 1_790_000_000_000 + gameId * 60_000,
    seconds: 18 * 60,
    patch: '16.19',
    puuid: pid(player),
    name: `Spieler ${player}#EUW`,
    championId,
    champion: championId === AHRI ? 'Ahri' : championId === LUX ? 'Lux' : '',
    championName: championId === AHRI ? 'Ahri' : championId === LUX ? 'Lux' : '',
    win: true,
    kills: me.kills,
    deaths: me.deaths,
    assists: me.assists,
    damage: me.damage,
    taken: me.taken,
    healed: me.healed,
    shielded: 0,
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

describe('Website-Augments und -Items', () => {
  it('zählt jeden Spieler je Spiel einmal, Pickrate als Anteil aller Spieler-Spiele', () => {
    const games = [
      entry(1, 1, { augments: [7, 7, 8] }),
      // The same upload twice counts once.
      entry(1, 1, { augments: [7, 7, 8] }),
      entry(2, 1, { augments: [7] }),
      entry(1, 2, { augments: [9] }),
      // A remake does not count.
      entry(1, 3, { augments: [7], seconds: 5 * 60 }),
    ];
    const rows = metaView(games, 'augments');
    expect(rows.map((r) => r.id)).toEqual([7, 8, 9]);
    expect(rows[0]).toMatchObject({ games: 2, pick: 2 / 3, winRate: null, pct: null, grade: null });
    expect(rows[1]).toMatchObject({ games: 1, pick: 1 / 3 });
  });

  it(`Siegquote und Note ab ${MIN_GAMES} Spielen, Note nach derselben Regel`, () => {
    const games = Array.from({ length: MIN_GAMES + 1 }, (_, i) =>
      entry(1, i + 1, { items: [3089, 0, 3089], win: i < 2 }),
    );
    const [row] = metaView(games, 'items');
    expect(row).toMatchObject({ id: 3089, games: games.length, pick: 1, graded: games.length });
    expect(row.winRate).toBeCloseTo(2 / games.length, 10);
    const pcts = games.map((g) => performanceOf(g)!.pct);
    const mean = pcts.reduce((t, v) => t + v, 0) / pcts.length;
    expect(row.pct).toBeCloseTo(mean, 10);
    expect(row.grade).toBe(gradeOfPct(mean));
    // Without the values of all ten: no grade, but a win rate.
    const [plain] = metaView(
      games.map((g) => ({ ...g, lobby: [] })),
      'items',
    );
    expect(plain).toMatchObject({ graded: 0, pct: null });
    expect(plain.winRate).not.toBeNull();
  });

  it('Detail: Champions mit Anteil an ihren Spielen, dazu genommene Items', () => {
    const games = [
      ...Array.from({ length: 4 }, (_, i) =>
        entry(1, i + 1, { augments: [7], items: [3089, 3020] }),
      ),
      entry(1, 5, { augments: [8], items: [3089] }),
      entry(2, 6, { championId: LUX, augments: [7], items: [3157] }),
    ];
    const augment = metaDetail(games, 'augments', 7)!;
    expect(augment).toMatchObject({ id: 7, games: 5, pick: 5 / 6 });
    expect(augment.champions.map((c) => [c.championId, c.champion, c.games, c.pick])).toEqual([
      [AHRI, 'Ahri', 4, 4 / 5],
      [LUX, 'Lux', 1, 1],
    ]);
    expect(augment.paired.map((r) => [r.id, r.games, r.pick])).toEqual([
      [3020, 4, 4 / 5],
      [3089, 4, 4 / 5],
      [3157, 1, 1 / 5],
    ]);
    const item = metaDetail(games, 'items', 3089)!;
    expect(item.games).toBe(5);
    // The item itself is not paired with itself; its augments are.
    expect(item.paired.map((r) => r.id)).toEqual([7, 8]);
    expect(metaDetail(games, 'items', 1)).toBeNull();
  });

  it(`höchstens ${PAIRED} dazu genommene, keine Namen oder PUUIDs`, () => {
    const many = Array.from({ length: PAIRED + 5 }, (_, i) => 4000 + i);
    const view = metaDetail([entry(1, 1, { augments: many, items: [3089] })], 'items', 3089)!;
    expect(view.paired).toHaveLength(PAIRED);
    expect(JSON.stringify(view)).not.toContain(pid(1));
    expect(JSON.stringify(view)).not.toContain('Spieler');
  });
});
