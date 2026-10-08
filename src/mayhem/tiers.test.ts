import { describe, expect, it } from 'vitest';
import { MOCK_TIERS } from './mock';
import {
  categoryName,
  championsWithAugment,
  filterItems,
  itemRoles,
  loadTiers,
  pointsChange,
  pulled,
  readTiers,
  signedPoints,
  teamProfile,
  usedCategories,
  withTiers,
} from './tiers';

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

// The rest of arammeta's list (08.10.2026): champion detail, augment detail, items, patch.
describe('arammeta pages', () => {
  const lists = readTiers(MOCK_TIERS)!;

  it('reads every part of the list Rust sends', () => {
    const alistar = lists.champions.find((c) => c.alias === 'Alistar')!;
    expect(alistar.top[0]).toMatchObject({ id: 1001, rarity: 'prismatic' });
    expect(alistar.pairs.length).toBe(9);
    expect(alistar.comp.front).toBe(3);
    const goliath = lists.augments.find((a) => a.name === 'Goliath')!;
    expect(goliath.champions.length).toBe(5);
    expect(goliath.pick).toBeCloseTo(0.05);
    expect(lists.items.find((i) => i.id === 3047)?.role).toBeNull();
    expect(lists.changes?.championAugments.risers[0]).toMatchObject({ id: 1005, champion: 105 });
    expect(lists.categories[0]).toEqual({ id: 'ad', label: 'AD' });
  });

  it('drops unsound parts and keeps missing values missing, never 0', () => {
    const odd = readTiers({
      patch: '16.20',
      augments: [],
      champions: [
        {
          id: 1,
          name: 'Annie',
          alias: 'Annie',
          tags: [],
          wr: 0.5,
          games: 10,
          top: [
            { id: 5, rarity: 'kRainbow', games: 5, wr: 0.5 },
            { id: 6, rarity: 'kGold', games: 5, wr: 0.5, lift: 4, pick: null },
          ],
          pairs: [{ id: 2, games: 0, wr: 0.5 }],
          comp: { phys: -1, magic: 40, cc: 'x' },
        },
      ],
      items: [
        { id: 1, name: '' },
        { id: 2, name: 'Boots', price: null, role: '', text: 'Go' },
      ],
      changes: { current: '16.20', baseline: '', champions: {} },
    })!;
    const annie = odd.champions[0];
    expect(annie.top).toEqual([
      { id: 6, rarity: 'gold', games: 5, winRate: 0.5, lift: null, pick: null },
    ]);
    expect(annie.pairs).toEqual([]);
    expect(annie.comp).toEqual({ magic: 40 });
    expect(odd.items).toEqual([{ id: 2, name: 'Boots', price: null, role: null, text: 'Go' }]);
    expect(odd.changes).toBeNull();
    expect(odd.categories).toEqual([]);
  });

  it('builds the team profile: damage as shares, scores against the highest champion', () => {
    const lux = lists.champions.find((c) => c.alias === 'Lux')!;
    const { damage, scores } = teamProfile(lux, lists.champions);
    expect(damage.map((d) => d.key)).toEqual(['phys', 'magic', 'true']);
    expect(damage.reduce((sum, d) => sum + d.share, 0)).toBeCloseTo(1);
    expect(scores.find((s) => s.key === 'poke')?.share).toBe(1);
    expect(scores.find((s) => s.key === 'front')?.share).toBeCloseTo(0.4 / 3);
    expect(teamProfile({ ...lux, comp: {} }, lists.champions)).toEqual({ damage: [], scores: [] });
  });

  it('filters items by role and search, dearest first', () => {
    expect(itemRoles(lists.items)).toEqual(['Fighter', 'Mage', 'Marksman', 'Support', 'Tank']);
    expect(filterItems(lists.items, 'all', '').map((i) => i.id)[0]).toBe(3089);
    expect(filterItems(lists.items, 'none', '').map((i) => i.name)).toEqual(['Plated Steelcaps']);
    expect(filterItems(lists.items, 'Tank', 'armor').map((i) => i.id)).toEqual([3075]);
  });

  it('writes changes in percentage points with one decimal', () => {
    expect(pointsChange({ currentWr: 0.4623, baselineWr: 0.4394 })).toBe('+2.3');
    expect(pointsChange({ currentWr: 0.378, baselineWr: 0.5231 })).toBe('−14.5');
    expect(signedPoints(0)).toBe('±0.0');
  });

  it('finds the champions an augment is among the best for, surest first', () => {
    const found = championsWithAugment(lists.champions, 1003);
    expect(found.length).toBe(lists.champions.length);
    const sure = (e: (typeof found)[number]) => pulled(e.entry.winRate, e.entry.games);
    expect(sure(found[0])).toBeGreaterThanOrEqual(sure(found[found.length - 1]));
    expect(championsWithAugment(lists.champions, 4242)).toEqual([]);
  });

  it("names categories with arammeta's English label and shows only those some augment has", () => {
    expect(categoryName(lists, 'tank')).toBe('Defense');
    expect(categoryName({ categories: [{ id: 'x', label: 'Fresh' }] }, 'x')).toBe('Fresh');
    expect(categoryName({ categories: [] }, 'odd')).toBe('odd');
    expect(usedCategories(lists).map((c) => c.id)).toEqual(lists.categories.map((c) => c.id));
    expect(usedCategories({ ...lists, augments: [] })).toEqual([]);
  });

  it('gives the browser preview the invented list, marked as mock', async () => {
    const loaded = await loadTiers();
    expect(loaded.mock).toBe(true);
    expect(loaded.champions.length).toBe(lists.champions.length);
  });
});
