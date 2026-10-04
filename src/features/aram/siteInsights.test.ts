import { describe, expect, it } from 'vitest';
import type { AramEntry, AramSeat } from '../../adapters/aram';
import { performanceOf } from './aramPerformance';
import { rankOf, TIERS } from './aramRating';
import {
  apexLines,
  axesOf,
  badgesOf,
  championsOf,
  distributionOf,
  formLine,
  lobbyPerformances,
  mvpOf,
  radarOf,
  streaksOf,
  topShare,
} from '../../../apps/mayhem-site/src/insights';

// Views of the website (apps/mayhem-site/src/insights.ts): they only read the rating's results.
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

const strong = { damage: 90_000, kills: 25, assists: 30, deaths: 3 };

describe('Website-Ansichten der Wertung', () => {
  it('Radar: starke Werte zeigen nach außen, schwache nach innen; ohne Wertung null', () => {
    const good = axesOf(game(strong))!;
    const weak = axesOf(game({ damage: 5_000, kills: 1, assists: 2, deaths: 15 }))!;
    expect(good[0]).toBeGreaterThan(0);
    expect(good[4]).toBeGreaterThan(weak[4]);
    expect(weak[0]).toBeLessThan(0);
    expect(good.every((v) => v >= -2.5 && v <= 2.5)).toBe(true);
    expect(axesOf(game(strong, { seconds: 5 * 60 }))).toBeNull();
    expect(radarOf([])).toBeNull();
  });

  it('Spielstil-Abzeichen erst ab 5 Spielen, höchstens drei, stärkstes zuerst', () => {
    expect(badgesOf([1, 1, 1, 1, 1], 4)).toEqual([]);
    const badges = badgesOf([1.2, 0, 0, 0.6, -0.8], 10);
    expect(badges.map((b) => b.id)).toEqual(['carry', 'glass', 'team']);
    expect(badgesOf([0, 0, 0, 0, 0], 20)).toEqual([]);
  });

  it('jede Note der Lobby folgt derselben Regel wie die eigene', () => {
    const entry = game(strong);
    const all = lobbyPerformances(entry);
    expect(all).toHaveLength(10);
    expect(all[0]!.y).toBeCloseTo(performanceOf(entry)!.y, 10);
    expect(mvpOf(all)).toBe(0);
    expect(mvpOf([null, null])).toBe(-1);
  });

  it('Champion-Tabelle: meistgespielt zuerst, bestes Spiel je Champion', () => {
    const a = game(strong, { gameId: 1 });
    const b = game({}, { gameId: 2 });
    const c = game({ championId: TANK }, { gameId: 3, championId: TANK, champion: 'Malphite' });
    const rows = championsOf([a, b, c].map((entry) => ({ entry, mark: performanceOf(entry)! })));
    expect(rows.map((r) => r.championId)).toEqual([MAGE, TANK]);
    expect(rows[0].games).toBe(2);
    expect(rows[0].best.gameId).toBe(1);
  });

  it('Serien von S oder besser, Formlinie als gleitender Schnitt', () => {
    expect(streaksOf(['S', 'SS', 'A', 'S', 'MAYHEM', 'SSS'])).toEqual({ best: 3, current: 3 });
    expect(streaksOf(['F', 'A'])).toEqual({ best: 0, current: 0 });
    expect(formLine([0, 1, 0.5], 2)).toEqual([0, 0.5, 0.75]);
  });

  it('Verteilung, Apex-Grenzen und Top-Anteil ab 10 Eingestuften', () => {
    const ranks = [
      rankOf(150),
      rankOf(150),
      rankOf(1250),
      null,
      rankOf(2900, { sss: true, mayhem: false }),
    ];
    const dist = distributionOf(ranks);
    expect(dist.map((d) => d.players)).toEqual([2, 0, 0, 1, 0, 0, 1, 0]);
    expect(dist.map((d) => d.tier)).toEqual([...TIERS]);
    const apex = apexLines(ranks);
    expect(apex[0]).toMatchObject({ players: 0, lowest: null });
    expect(apex[1].players).toBe(1);
    expect(topShare(rankOf(150), ranks)).toBeNull();
    const ten = Array.from({ length: 10 }, (_, i) => rankOf(i * 100));
    expect(topShare(ten[9], ten)).toBe(0);
    expect(topShare(ten[0], ten)).toBe(0.9);
  });
});
