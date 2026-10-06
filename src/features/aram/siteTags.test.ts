import { describe, expect, it } from 'vitest';
import type { AramDetails, AramEntry } from '../../adapters/aram';
import {
  censusOf,
  cutoffsOf,
  MIN_GAMES,
  MIN_PLAYERS,
  preferencesOf,
  rankedTags,
  statsOf,
  tagsOf,
  type TagStats,
  type TagStep,
} from '../../../apps/mayhem-site/src/tags';

// Player tags of the website (apps/mayhem-site/src/tags.ts).
const details = (values: Partial<AramDetails> = {}): AramDetails => ({
  magic: 20_000,
  physical: 8_000,
  trueDamage: 2_000,
  mitigated: 10_000,
  doubles: 1,
  triples: 0,
  quadras: 0,
  largestCrit: 0,
  ccSeconds: 30,
  largestSpree: 3,
  turretDamage: 1_000,
  ...values,
});

function entry(values: Partial<AramEntry> = {}): AramEntry {
  return {
    gameId: 1,
    at: 1_790_000_000_000,
    seconds: 18 * 60,
    patch: '16.19',
    puuid: 'p1',
    name: 'Eins',
    championId: 103,
    champion: 'Ahri',
    championName: 'Ahri',
    win: true,
    kills: 10,
    deaths: 8,
    assists: 20,
    damage: 30_000,
    taken: 30_000,
    healed: 5_000,
    shielded: 0,
    gold: 14_000,
    level: 18,
    items: [],
    augments: [1, 2, 3, 4],
    damageRank: 3,
    teamShare: 0.22,
    multikill: 2,
    pentas: 0,
    details: details(),
    with: [],
    ...values,
  };
}

const steps = (
  n: number,
  f: (i: number) => Partial<AramEntry> = () => ({}),
  pct = (_i: number) => 0.5,
): TagStep[] =>
  Array.from({ length: n }, (_, i) => ({ entry: entry({ gameId: i + 1, ...f(i) }), pct: pct(i) }));

describe('statsOf', () => {
  it('needs enough games', () => {
    expect(statsOf(steps(MIN_GAMES - 1))).toBeNull();
    expect(statsOf(steps(MIN_GAMES))).not.toBeNull();
  });

  it('reads champions, skins, damage types and augments', () => {
    const s = statsOf(
      steps(10, (i) => ({
        championId: i < 5 ? 103 : 54 + i,
        skin: i < 9 ? 2 : 0,
        augments: [7, 100 + i],
      })),
      new Set([7]),
    )!;
    expect(s.topChampion).toBe(0.5);
    expect(s.variety).toBe(0.6);
    expect(s.skins).toBe(0.9);
    expect(s.ap).toBeCloseTo(20 / 30);
    expect(s.ad).toBeCloseTo(8 / 30);
    expect(s.trueShare).toBeCloseTo(2 / 30);
    expect(s.habit).toBe(1);
    expect(s.prismatic).toBe(0.5);
  });

  it('leaves values open that the games do not tell', () => {
    const s = statsOf(steps(10, () => ({ details: null })))!;
    expect(s.ap).toBeNull();
    expect(s.ccPerMinute).toBeNull();
    expect(s.skins).toBeNull();
    expect(s.prismatic).toBeNull();
    expect(s.dmg).toBeNull(); // no lobby, no grade axes
  });
});

describe('tags', () => {
  const players = (n: number) =>
    Array.from({ length: n }, (_, p) =>
      statsOf(
        steps(
          10,
          () => ({ kills: p }),
          () => p / n,
        ),
      )!,
    );

  it('finds no percentile tags without enough players', () => {
    expect(cutoffsOf(players(MIN_PLAYERS - 1))).toEqual({});
  });

  it('gives a percentile tag to the top share only', () => {
    const all = players(40);
    const cuts = cutoffsOf(all);
    const hunters = all.filter((s) => tagsOf(s, cuts).includes('hunter'));
    expect(hunters.length).toBe(4); // top 10 % of 40
    expect(Math.min(...hunters.map((s) => s.kills!))).toBe(36);
  });

  it('applies rules and ranks the rarest first', () => {
    const all = players(40);
    const census = censusOf(all);
    expect(census.players).toBe(40);
    const best = all[39];
    const ranked = rankedTags(best, census);
    expect(ranked.map((t) => t.id)).toContain('hunter');
    expect(ranked.map((t) => t.id)).toContain('onetrick'); // always the same champion
    for (let i = 1; i < ranked.length; i++)
      expect(ranked[i].share).toBeGreaterThanOrEqual(ranked[i - 1].share);
    expect(rankedTags(best, { ...census, players: 5 })).toEqual([]);
  });

  it('knows luck from grades', () => {
    const base = statsOf(steps(10))!;
    const lucky: TagStats = { ...base, wins: 0.7, average: 0.4 };
    const unlucky: TagStats = { ...base, wins: 0.3, average: 0.7 };
    expect(tagsOf(lucky, {})).toContain('lucky');
    expect(tagsOf(unlucky, {})).toContain('unlucky');
    expect(tagsOf(base, {})).not.toContain('lucky');
  });
});

describe('preferencesOf', () => {
  it('counts champions, classes, augments and damage types', () => {
    const entries = steps(4, (i) => ({ championId: i < 3 ? 103 : 54, augments: [9, 9, i] })).map(
      (s) => s.entry,
    );
    const prefs = preferencesOf(entries, (id) => (id === 103 ? 'Mage' : 'Tank'));
    expect(prefs.champions[0]).toEqual({ key: 103, games: 3, share: 0.75 });
    expect(prefs.classes.map((c) => c.key)).toEqual(['Mage', 'Tank']);
    expect(prefs.augments[0]).toEqual({ key: 9, games: 4, share: 1 });
    expect(prefs.damage!.ap).toBeCloseTo(20 / 30);
  });
});

describe('cut-offs', () => {
  it('singles nobody out when many players share the value', () => {
    const same = Array.from({ length: 30 }, () => statsOf(steps(10))!);
    const cuts = cutoffsOf(same);
    expect(cuts.grinder).toBeUndefined();
    expect(cuts.hunter).toBeUndefined();
  });

  it('has no prismatic value without the augment list', () => {
    expect(statsOf(steps(10), new Set())!.prismatic).toBeNull();
  });
});
