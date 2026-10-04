import { describe, expect, it } from 'vitest';
import {
  climbing,
  gradeShares,
  RULES,
  seasonStarts,
  tiers,
  weights,
} from '../../../apps/mayhem-site/src/explain';

// The website's "So funktioniert's" (apps/mayhem-site/src/explain.ts): every number on the page
// comes from the rating core, so it says what the calculation does.
describe('website explanation', () => {
  it('lists the ten grades with shares that add up to all games', () => {
    const grades = gradeShares();
    expect(grades.map((g) => g.grade)).toEqual([
      'F',
      'E',
      'D',
      'C',
      'B',
      'A',
      'S',
      'SS',
      'SSS',
      'MAYHEM',
    ]);
    expect(grades.reduce((t, g) => t + g.share, 0)).toBeCloseTo(1, 9);
    expect(grades[0].share).toBeCloseTo(0.03, 9);
    expect(grades[9].share).toBeCloseTo(0.003, 9);
  });

  it('weights the five axes as the grade does, taking part most', () => {
    const w = weights();
    expect(w.reduce((t, x) => t + x.weight, 0)).toBeCloseTo(1, 9);
    expect([...w].sort((a, b) => b.weight - a.weight)[0].label).toBe('Kill-Beteiligung');
  });

  it('cuts the tiers like LoL: four divisions up to SS, SSS at 400 and MAYHEM at 800 MP', () => {
    const t = tiers();
    expect(t.map((x) => x.tier.name)).toEqual(['D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'MAYHEM']);
    expect(t.map((x) => x.divisions)).toEqual([true, true, true, true, true, true, false, false]);
    expect(t.map((x) => x.apexPoints)).toEqual([null, null, null, null, null, null, 400, 800]);
    expect(t[0].top).toBe(1);
    expect(t.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 9);
    // Rarer and rarer, MAYHEM as rare as Challenger (0.03 %).
    for (let i = 1; i < t.length; i++) expect(t[i].top).toBeLessThan(t[i - 1].top);
    expect(t[7].top).toBeCloseTo(0.0003, 4);
  });

  it('names the rules of the ladder', () => {
    expect(RULES).toEqual({
      placement: 5,
      placementCap: 'S I',
      shield: 3,
      maxSwing: 30,
      averageGames: 20,
      remakeMinutes: 8,
    });
    // S: usual ±20; a hidden rating well above the rank gives more and takes less.
    expect(climbing(4)).toEqual({ up: 27, down: -13 });
    expect(seasonStarts(2026)).toEqual(['8. Januar', '29. April', '29. Juli']);
  });
});
