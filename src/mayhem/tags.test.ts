import { describe, expect, it } from 'vitest';
import type { AramEntry } from '../adapters/aram';
import type { Grade } from '../features/aram/aramPerformance';
import type { Step } from '../features/aram/aramRating';
import { RULES, SHOWN, tagsOf } from './tags';

// Fun tags (tags.ts): only from real values, the strongest few, one per group.
const DAY = 86_400_000;
const NOON = new Date(2026, 9, 7, 14).getTime(); // a Wednesday afternoon

function step(i: number, over: Partial<AramEntry> = {}, grade: Grade = 'B', pct = 0.5): Step {
  const entry = {
    gameId: i + 1,
    at: NOON - i * DAY,
    seconds: 18 * 60,
    championName: ['Lux', 'Ahri', 'Annie', 'Brand', 'Jinx', 'Garen'][i % 6]!,
    championId: 1,
    win: i % 2 === 0,
    kills: 8,
    deaths: 7,
    assists: 18,
    damage: 40_000,
    taken: 30_000,
    healed: 4_000,
    shielded: 0,
    damageRank: 4,
    teamShare: 0.2,
    multikill: 2,
    pentas: 0,
    ...over,
  } as AramEntry;
  return {
    entry,
    mark: { y: 0, pct, grade, role: 'Mage', win: entry.win, afk: false },
    gain: 10,
    before: null,
    after: null,
    change: null,
    season: '2026-3',
  };
}

const history = (n: number, f: (i: number) => Step = (i) => step(i)) =>
  Array.from({ length: n }, (_, i) => f(i));
const labels = (h: Step[]) => tagsOf(h).map((t) => t.label);

describe('tagsOf', () => {
  it('says nothing without games and "Fresh Meat" below five', () => {
    expect(tagsOf([])).toEqual([]);
    expect(labels(history(3))).toEqual(['Fresh Meat']);
  });

  it('finds what stands out and explains it', () => {
    const h = history(30, (i) =>
      step(i, { pentas: i < 4 ? 1 : 0, damageRank: i % 2 ? 1 : 3, championName: 'Jinx' }),
    );
    const tags = tagsOf(h);
    expect(tags.map((t) => t.label)).toContain('Penta Addict');
    expect(tags.map((t) => t.label)).toContain('Jinx Enjoyer');
    expect(tags.find((t) => t.label === 'Penta Addict')?.why).toBe('4 pentakills');
    expect(tags.length).toBeLessThanOrEqual(SHOWN);
  });

  it('shows one tag per group, the strongest', () => {
    const h = history(20, (i) => step(i, { pentas: 1 }));
    expect(labels(h)).toContain('Penta Addict');
    expect(labels(h)).not.toContain('Penta Enjoyer');
  });

  it('gives no tag for values the website left out, never treats them as 0', () => {
    const h = history(20, (i) =>
      step(i, { teamShare: undefined, damageRank: undefined, healed: undefined } as never),
    );
    expect(labels(h)).not.toContain('Emotional Support');
    expect(labels(h)).not.toContain('Damage Goblin');
  });

  it('reads streaks from the newest game', () => {
    const h = history(12, (i) => step(i, { win: i >= 6 }));
    expect(labels(h)).toContain('On Fire');
  });

  it('has many tags, each with a group and a unique label', () => {
    expect(RULES.length).toBeGreaterThanOrEqual(40);
    const fixed = RULES.flatMap((r) => (typeof r.label === 'string' ? [r.label] : []));
    expect(new Set(fixed).size).toBe(fixed.length);
  });
});
