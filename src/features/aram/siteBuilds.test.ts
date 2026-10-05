import { describe, expect, it } from 'vitest';
import {
  COMBOS,
  MIN_COMBO_GAMES,
  combosOf,
  type BuildGame,
} from '../../../apps/mayhem-site/src/builds';
import { MIN_GAMES } from '../../../apps/mayhem-site/src/meta';
import { gradeOfPct } from '../../../apps/mayhem-site/src/insights';

// Builds on a champion's page (apps/mayhem-site/src/builds.ts): the most common combos of augments
// or finished items, share of the champion's games, win rate and grade from MIN_GAMES games.
const game = (
  augments: number[],
  items: number[],
  win = true,
  pct: number | null = 0.5,
): BuildGame => ({
  augments,
  items,
  win,
  pct,
});

describe('Website-Builds', () => {
  it('Paare unabhängig von der Reihenfolge, ab MIN_COMBO_GAMES Spielen', () => {
    const games = [game([1, 2, 3], []), game([2, 1], []), game([3, 4], []), game([5, 6], [])];
    const pairs = combosOf(games, (g) => g.augments, 2);
    expect(pairs.map((p) => p.ids)).toEqual([[1, 2]]);
    expect(pairs[0]).toMatchObject({ games: 2, pick: 0.5, winRate: null, grade: null });
    expect(MIN_COMBO_GAMES).toBe(2);
  });

  it('Item-Kerne aus den übergebenen Items, Siegquote und Note ab MIN_GAMES', () => {
    const games = Array.from({ length: MIN_GAMES + 1 }, (_, i) =>
      game([], [3089, 3157, 3020, 2003], i < 3, i === 0 ? null : 0.6),
    );
    const finished = new Set([3089, 3157, 3020]);
    const [core] = combosOf(games, (g) => g.items.filter((id) => finished.has(id)), 3);
    expect(core.ids).toEqual([3020, 3089, 3157]);
    expect(core).toMatchObject({ games: games.length, pick: 1, graded: MIN_GAMES });
    expect(core.winRate).toBeCloseTo(3 / games.length, 10);
    expect(core.pct).toBeCloseTo(0.6, 10);
    expect(core.grade).toBe(gradeOfPct(0.6));
  });

  it(`höchstens ${COMBOS}, häufigste zuerst, bei Gleichstand die höhere Siegquote`, () => {
    const games = Array.from({ length: 60 }, (_, i) => game([i % 10, 100], [], i % 2 === 0));
    const pairs = combosOf(games, (g) => g.augments, 2);
    expect(pairs).toHaveLength(COMBOS);
    expect(pairs.every((p) => p.games === 6)).toBe(true);
    expect(pairs[0].winRate).toBe(1);
  });
});
