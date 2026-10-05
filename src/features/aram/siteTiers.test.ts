import { describe, expect, it } from 'vitest';
import { PRIOR, TIERS, scoreOf, tiersOf } from '../../../apps/mayhem-site/src/tiers';

// The website's tier list (apps/mayhem-site/src/tiers.ts): by win rate pulled towards 50 %, cut by
// place into 10/20/40/20/10 %.
const row = (id: number, winRate: number | null, games = 100) => ({ id, games, winRate });

describe('Website-Tier-Liste', () => {
  it('teilt nach Platz in 10/20/40/20/10 %', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(i, 0.3 + i * 0.02));
    const tiers = tiersOf(rows);
    const count = (t: string) => tiers.filter((x) => x.tier === t).length;
    expect(TIERS.map(count)).toEqual([2, 4, 8, 4, 2]);
    expect(tiers[0].row.id).toBe(19);
    expect(tiers[0].tier).toBe('S');
    expect(tiers.at(-1)!.tier).toBe('D');
  });

  it('wenige Spiele ziehen zu 50 %, ohne Siegquote nicht dabei', () => {
    expect(scoreOf(row(1, 1, PRIOR))).toBeCloseTo(0.75, 10);
    expect(scoreOf(row(1, null))).toBeNull();
    // 5 of 5 won ranks below 70 of 100.
    const tiers = tiersOf([row(1, 1, 5), row(2, 0.7, 100), row(3, null)]);
    expect(tiers.map((t) => t.row.id)).toEqual([2, 1]);
  });

  it('gleiche Werte, gleiche Stufe', () => {
    const tiers = tiersOf(Array.from({ length: 10 }, (_, i) => row(i, 0.5)));
    expect(new Set(tiers.map((t) => t.tier))).toEqual(new Set(['S']));
  });
});
