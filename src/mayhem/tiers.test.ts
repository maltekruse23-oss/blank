import { describe, expect, it } from 'vitest';
import { pulled, readTiers, withTiers } from './tiers';

// The Mayhem app's tier lists (tiers.ts): strict reading of Rust's answer and S–D by place.
describe('Mayhem tier lists', () => {
  it('pulls small samples towards 50 %', () => {
    expect(pulled(0.7, 0)).toBe(0.5);
    expect(pulled(0.6, 200)).toBeCloseTo(0.55);
    expect(pulled(0.6, 100000)).toBeCloseTo(0.6, 2);
  });

  it('cuts S–D like the website: 10 / 20 / 40 / 20 / 10 %', () => {
    const list = Array.from({ length: 10 }, (_, i) => ({ winRate: 0.6 - i * 0.01, games: 100000 }));
    expect(
      withTiers(list)
        .map((e) => e.tier)
        .join(''),
    ).toBe('SAABBBBCCD');
  });

  it('ranks a lucky small sample below a solid large one', () => {
    const [first] = withTiers([
      { winRate: 0.7, games: 20 },
      { winRate: 0.56, games: 50000 },
    ]);
    expect(first.games).toBe(50000);
  });

  it('reads only sound entries and builds icon addresses on arammeta.com', () => {
    const lists = readTiers({
      patch: '16.19',
      augments: [
        {
          id: 1001,
          name: 'Goliath',
          rarity: 'kPrismatic',
          icon: 'assets/icons/g_large.png',
          text: 'Grow [數值] times.',
          cats: ['tank'],
          wr: 0.58,
          games: 8210,
        },
        {
          id: 1002,
          name: 'Bad icon',
          rarity: 'kGold',
          icon: 'https://evil.example/x.png',
          text: '',
          cats: [],
          wr: 0.5,
          games: 10,
        },
        {
          id: 1003,
          name: 'Odd',
          rarity: 'kRainbow',
          icon: '',
          text: '',
          cats: [],
          wr: 0.5,
          games: 10,
        },
        {
          id: 1004,
          name: 'Too good',
          rarity: 'kGold',
          icon: '',
          text: '',
          cats: [],
          wr: 1.5,
          games: 10,
        },
      ],
      champions: [
        { id: 12, name: 'Alistar', alias: 'Alistar', tags: ['Tank'], wr: 0.56, games: 3912 },
        { id: 13, name: 'Bad', alias: '../x', tags: [], wr: 0.5, games: 10 },
      ],
    });
    expect(lists?.patch).toBe('16.19');
    expect(lists?.augments.map((a) => a.name)).toEqual(['Goliath', 'Bad icon']);
    expect(lists?.augments[0].image).toBe('https://arammeta.com/assets/icons/g_large.png');
    expect(lists?.augments[1].image).toBeNull();
    expect(lists?.augments[0].text).toBe('Grow ? times.');
    expect(lists?.champions.map((c) => c.alias)).toEqual(['Alistar']);
  });

  it('rejects answers that are not lists', () => {
    expect(readTiers(null)).toBeNull();
    expect(readTiers({ augments: 'x', champions: [] })).toBeNull();
    expect(readTiers({ augments: [], champions: [] })).toBeNull();
  });
});
