import { describe, expect, it } from 'vitest';
import type { AramEntry, AramSeat } from '../../adapters/aram';
import { performanceOf } from './aramPerformance';
import {
  BEST_GAMES,
  championView,
  championsView,
  MIN_GAMES,
} from '../../../apps/mayhem-site/src/champions';
import { gradeOfPct, lobbyPerformances } from '../../../apps/mayhem-site/src/insights';

// The website's champions pages (apps/mayhem-site/src/champions.ts): every seat of a game once,
// grades by the same rule as everywhere, no averages below MIN_GAMES, and only players with a
// profile (uploaders) by name.
const pid = (i: number) => `puuid-${String(i).padStart(30, '0')}`;
const AHRI = 103;
const CHAMPS = [AHRI, 54, 16, 22, 1, 2, 3, 4, 5, 6];

const lobbyOf = (game: number, you: number): AramSeat[] =>
  CHAMPS.map((championId, i) => ({
    you: i === you,
    team: i < 5 ? 100 : 200,
    championId,
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
  const seat = extra.lobby === undefined ? 0 : (extra.lobby ?? []).findIndex((s) => s.you);
  const lobby = extra.lobby === undefined ? lobbyOf(gameId, 0) : extra.lobby;
  const me = lobby?.[Math.max(0, seat)];
  return {
    gameId,
    at: 1_790_000_000_000 + gameId * 60_000,
    seconds: 18 * 60,
    patch: '16.19',
    puuid: pid(player),
    name: `Spieler ${player}#EUW`,
    championId: me?.championId ?? AHRI,
    champion: me?.championId === AHRI || !me ? 'Ahri' : '',
    championName: me?.championId === AHRI || !me ? 'Ahri' : '',
    win: true,
    kills: me?.kills ?? 10,
    deaths: me?.deaths ?? 5,
    assists: me?.assists ?? 20,
    damage: me?.damage ?? 30_000,
    taken: me?.taken ?? 25_000,
    healed: me?.healed ?? 4_000,
    shielded: 0,
    gold: me?.gold ?? 14_000,
    level: 18,
    items: [],
    augments: [1000 + (gameId % 2), 2000],
    damageRank: 1,
    teamShare: 0.3,
    multikill: 1,
    pentas: 0,
    details: null,
    with: [
      {
        puuid: pid(99),
        name: 'Fremd#EUW',
        champion: 'Lux',
        championName: 'Lux',
        damage: 1,
        kills: 0,
        deaths: 0,
        assists: 0,
        sameTeam: true,
      },
    ],
    lobby,
    ...extra,
  };
}

describe('Website-Champions', () => {
  it('zählt jeden Platz eines Spiels einmal, auch bei zwei Uploads', () => {
    const games = [
      entry(1, 1),
      // Player 2 uploaded the same game from seat 1.
      entry(2, 1, { lobby: lobbyOf(1, 0).map((s, i) => ({ ...s, you: i === 1 })) }),
      entry(1, 2),
    ];
    const table = championsView(games);
    expect(table).toHaveLength(CHAMPS.length);
    for (const row of table) expect(row.games).toBe(2);
    // Champions nobody uploaded have no key (the page maps the ID).
    expect(table.find((c) => c.championId === AHRI)!.champion).toBe('Ahri');
    expect(table.find((c) => c.championId === 54)!.champion).toBe('');
  });

  it(`zeigt unter ${MIN_GAMES} gewerteten Spielen keine Werte`, () => {
    const few = championsView(Array.from({ length: MIN_GAMES - 1 }, (_, i) => entry(1, i + 1)));
    for (const row of few) {
      expect(row.pct).toBeNull();
      expect(row.grade).toBeNull();
      expect(row.top).toBeNull();
      expect(row.damagePerMinute).toBeNull();
    }
  });

  it('Note Ø = Mittel der Noten aller Plätze nach derselben Regel', () => {
    const games = Array.from({ length: MIN_GAMES + 2 }, (_, i) => entry(1, i + 1));
    const ahri = championsView(games).find((c) => c.championId === AHRI)!;
    const pcts = games.map((g) => lobbyPerformances(g)[0]!.pct);
    const mean = pcts.reduce((t, v) => t + v, 0) / pcts.length;
    expect(ahri.graded).toBe(games.length);
    expect(ahri.pct).toBeCloseTo(mean, 10);
    expect(ahri.grade).toBe(gradeOfPct(mean));
    expect(ahri.role).toBe('Mage');
    const top = games.filter((g) =>
      ['SSS', 'MAYHEM'].includes(lobbyPerformances(g)[0]!.grade),
    ).length;
    expect(ahri.top).toBeCloseTo(top / games.length, 10);
  });

  it('Remakes zählen nicht, Spiele ohne Lobby zählen ohne Note', () => {
    const table = championsView([entry(1, 1, { seconds: 5 * 60 }), entry(1, 2, { lobby: [] })]);
    expect(table).toHaveLength(1);
    expect(table[0]).toMatchObject({ championId: AHRI, games: 1, graded: 0, pct: null });
  });

  it('Champion-Seite: nur Spieler mit Profil, beste Spiele und Augments', () => {
    const games = [
      ...Array.from({ length: 6 }, (_, i) => entry(1, i + 1)),
      entry(2, 20),
      // Player 3 plays another champion: not on Ahri's page.
      entry(3, 21, { lobby: lobbyOf(21, 3) }),
    ];
    const names = new Map([[pid(1), { name: 'Neu#EUW', icon: 7 }]]);
    const view = championView(games, AHRI, names)!;
    expect(view.players.map((p) => p.puuid).sort()).toEqual([pid(1), pid(2)]);
    expect(view.players.find((p) => p.puuid === pid(1))).toMatchObject({
      name: 'Neu#EUW',
      icon: 7,
      games: 6,
    });
    expect(view.players.find((p) => p.puuid === pid(2))).toMatchObject({
      name: 'Spieler 2#EUW',
      icon: null,
      games: 1,
    });
    expect(JSON.stringify(view)).not.toContain(pid(99));
    expect(JSON.stringify(view)).not.toContain(pid(3));

    // Best games: by grade, at most BEST_GAMES.
    expect(view.best).toHaveLength(BEST_GAMES);
    const pcts = view.best.map((g) => g.pct);
    expect([...pcts].sort((a, b) => b - a)).toEqual(pcts);
    expect(view.best[0].pct).toBe(
      Math.max(...games.filter((g) => g.championId === AHRI).map((g) => performanceOf(g)!.pct)),
    );

    // Augment 2000 in all 7 Ahri games, 1000/1001 in fewer than MIN_GAMES each.
    const always = view.augments.find((a) => a.id === 2000)!;
    expect(always.games).toBe(7);
    expect(always.grade).not.toBeNull();
    for (const a of view.augments.filter((x) => x.id !== 2000)) {
      expect(a.games).toBeLessThan(MIN_GAMES);
      expect(a.pct).toBeNull();
    }
    expect(view.augments[0].id).toBe(2000);
  });

  it('kein Spiel mit dem Champion → null', () => {
    expect(championView([entry(1, 1)], 999)).toBeNull();
  });
});
