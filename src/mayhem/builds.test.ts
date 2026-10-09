import { describe, expect, it } from 'vitest';
import type { BuildPick, BuildPlan, ChampView, MetaItemPick } from '../features/aram/champCard';
import type { Combo } from '../features/aram/combos';
import { buildList, itemSetFor, SET_NAME, type BuildEntry } from './builds';
import { MOCK_TIERS, mockChampView, mockOffer } from './mock';

// Build list of the Mayhem app's Champ page (user's decisions 09.10.2026).
const KIND: Record<number, 'ap' | 'ad' | 'tank' | 'other'> = {
  1: 'tank',
  2: 'tank',
  3: 'tank',
  4: 'tank',
  5: 'tank',
  6: 'tank',
  10: 'ap',
  11: 'ap',
  12: 'ap',
  13: 'ap',
  20: 'ad',
  21: 'ad',
  30: 'tank',
  31: 'tank',
};
const it_ = (id: number, mana = false) => ({ id, name: `Item ${id}`, mana });
const build = (ids: number[], winRate: number, more: Partial<BuildPick> = {}): BuildPick => ({
  items: ids.map((id) => it_(id)),
  games: 500,
  winRate,
  grade: null,
  mana: 0,
  ...more,
});
const plan = (
  direction: BuildPlan['direction'],
  builds: BuildPick[],
  more: Partial<BuildPlan> = {},
) =>
  ({
    direction,
    games: 100,
    share: 0.5,
    source: 'arammeta',
    builds,
    augments: [],
    ...more,
  }) as BuildPlan;
/** A combo whose augment wins `winRate` over `games` (what the offmeta order goes by). */
const combo = (
  theme: string,
  meta: boolean,
  winRate: number,
  ids: number[],
  games = 500,
): Combo => ({
  theme,
  meta,
  augments: [{ id: 900, name: 'Aug', rarity: 'gold', image: null, games, winRate }],
  items: ids.map((id) => ({ ...it_(id), games: 60, winRate: 0.52 })),
});
const single = (id: number, games = 100): MetaItemPick => ({
  items: [{ ...it_(id), kind: KIND[id] ?? 'other' }],
  games,
  winRate: 0.53,
  pick: 0.2,
});
const view = (more: Partial<ChampView>): ChampView => ({
  championId: 12,
  alias: 'Alistar',
  name: 'Alistar',
  games: 4000,
  source: 'arammeta',
  patch: '16.20',
  augments: [],
  builds: [],
  plans: [],
  ...more,
});

const assembled = build([10, 11, 12], 0.5, {
  label: 'Offmeta',
  assembled: [
    { games: 500, winRate: 0.53 },
    { games: 500, winRate: 0.55 },
    { games: 500, winRate: 0.54 },
  ],
  later: [it_(13)],
});
const ALISTAR = view({
  plans: [
    plan('tank', [
      build([1, 2, 3], 0.56, { label: 'Tank / Heartsteel', later: [it_(30)] }),
      build([1, 2, 4], 0.55, { label: 'Tank / Heartsteel' }),
    ]),
    // A second meta direction with a bare label: never named "AD".
    plan('ad', [build([20, 21, 5], 0.51, { label: 'AD' })]),
    plan('ap', [assembled], { games: 0, share: 0 }),
  ],
  combos: [
    combo('armor', true, 0.53, [3, 4, 5, 6]),
    combo('heal', false, 0.56, [5, 6, 30]),
    combo('cc', false, 0.52, [2, 6, 31]),
  ],
  extra: {
    boots: [single(40), single(41), single(42), single(43)],
    items: [single(31), single(10), single(20)],
    weak: [],
    pairs: [],
    spells: [],
    avoid: [],
    augTypes: [],
    weakTypes: [],
  },
});

const shape = (list: BuildEntry[]) => list.map((e) => [e.kind, e.meta, e.name]);

describe('buildList', () => {
  it('meta cores of every direction, then meta combos, then offmeta best first', () => {
    expect(shape(buildList(ALISTAR))).toEqual([
      ['core', true, 'Tank / Heartsteel · Item 3'],
      ['core', true, 'Tank / Heartsteel · Item 4'],
      ['core', true, 'Item 20 + Item 21 + Item 5'],
      ['combo', true, 'Thorn Fortress'],
      // One scale, each pulled towards 50 % over 500 games: heal 0.543 > Ø 0.529 > cc 0.514.
      ['combo', false, 'Maximum Heal'],
      ['assembled', false, 'Item 10 build'],
      ['combo', false, 'Control Freak'],
    ]);
  });

  it('unique names and keys, never a bare direction', () => {
    const list = buildList(ALISTAR);
    expect(new Set(list.map((e) => e.name)).size).toBe(list.length);
    expect(new Set(list.map((e) => e.key)).size).toBe(list.length);
    for (const e of list) expect(['AP', 'AD', 'Tank']).not.toContain(e.name);
    // Twins without an item of their own are numbered.
    const L = { label: 'Tank / Mix' };
    const twins = buildList(
      view({
        plans: [
          plan('tank', [build([1, 2], 0.5, L), build([1, 3], 0.5, L), build([2, 3], 0.5, L)]),
        ],
      }),
    );
    expect(twins.map((e) => e.name)).toEqual(['Tank / Mix', 'Tank / Mix (2)', 'Tank / Mix (3)']);
  });

  it('a direction with its own combo shows only the combo, named by its first item', () => {
    const list = buildList({
      ...ALISTAR,
      combos: [...ALISTAR.combos!, combo('ap', false, 0.5, [10, 11, 12, 13])],
    });
    expect(list.some((e) => e.kind === 'assembled')).toBe(false);
    expect(list.find((e) => e.key === 'combo:ap')?.name).toBe('Item 10 build');
  });

  it('the same core twice: the first one stays', () => {
    const list = buildList({ ...ALISTAR, combos: [combo('armor', true, 0.6, [3, 2, 1, 6])] });
    expect(list.filter((e) => e.kind === 'combo')).toHaveLength(0);
    expect(list).toHaveLength(4);
  });

  it('a website core beside arammeta’s is offmeta and named by its items', () => {
    const site = build([10, 12, 13], 0.7, { games: 3 });
    const list = buildList(
      view({ plans: [plan('ap', [site, assembled], { source: 'mayhemstats' })] }),
    );
    const entry = list.find((e) => e.kind === 'site')!;
    expect(entry).toMatchObject({ meta: false, name: 'Item 10 + Item 12 + Item 13', winRate: 0.7 });
    // 3 games at 70 % rank below an assembled build of Ø 54 %.
    expect(list.map((e) => e.kind)).toEqual(['assembled', 'site']);
    // Also without an assembled build: arammeta has no core in that direction.
    const alone = buildList(view({ plans: [plan('ap', [site], { source: 'mayhemstats' })] }));
    expect(alone.map((e) => [e.kind, e.meta])).toEqual([['site', false]]);
  });

  it('a card from the website alone: meta only where the champion goes in ≥ 20 % of games', () => {
    const site = { source: 'mayhemstats' } as const;
    const list = buildList(
      view({
        ...site,
        plans: [
          plan('tank', [build([1, 2, 3], 0.55)], { ...site, share: 0.9 }),
          plan('ap', [build([10, 11, 12], 0.6, { games: 3 })], { ...site, share: 0.05 }),
        ],
      }),
    );
    expect(list.map((e) => [e.items[0].id, e.meta])).toEqual([
      [1, true],
      [10, false],
    ]);
  });

  it('a weak champion: every sort key pulled towards its own win rate', () => {
    // 5 games at 40 % against augments winning 47 % over 1000 games, the champion at 45 %:
    // towards 50 % the 5 games would come first (0.498 > 0.475).
    const list = buildList(
      view({
        plans: [plan('ap', [build([10, 12, 13], 0.4, { games: 5 })], { source: 'mayhemstats' })],
        combos: [combo('heal', false, 0.47, [5, 6, 30], 1000)],
      }),
      0.45,
    );
    expect(list.map((e) => e.kind)).toEqual(['combo', 'site']);
  });

  it('no directions: the card’s builds stand in as meta cores', () => {
    const list = buildList(
      view({ source: 'mayhemstats', builds: [build([1, 2, 3], 0.6), build([10, 11, 12], 0.5)] }),
    );
    expect(list.map((e) => [e.kind, e.meta, e.kind === 'core' && e.plan])).toEqual([
      ['core', true, null],
      ['core', true, null],
    ]);
    expect(buildList(view({}))).toEqual([]);
  });

  it('honest: only measured builds carry a win rate', () => {
    for (const e of buildList(ALISTAR)) {
      if (e.kind === 'combo' || e.kind === 'assembled')
        expect([e.winRate, e.games]).toEqual([null, null]);
      else expect(e.winRate).toBe(e.build.winRate);
    }
  });

  it('never AP and AD items in one entry or its set', () => {
    for (const e of buildList(ALISTAR)) {
      const set = itemSetFor(e, ALISTAR);
      const kinds = new Set([...set.core, ...set.more].map((id) => KIND[id]));
      expect(kinds.has('ap') && kinds.has('ad')).toBe(false);
    }
  });
});

describe('itemSetFor', () => {
  const list = buildList(ALISTAR);
  const byKey = (key: string) => list.find((e) => e.key === key)!;

  it('a core: its core, the best boots, its later items first, then the direction', () => {
    expect(itemSetFor(byKey('core:1,2,3'), ALISTAR)).toEqual({
      name: 'Tank / Heartsteel · Item 3',
      core: [1, 2, 3],
      boots: [40, 41, 42],
      more: [30, 4, 31],
    });
  });

  it('an assembled build: its items, later ones, the direction’s singles', () => {
    expect(itemSetFor(byKey('assembled:10,11,12'), ALISTAR)).toMatchObject({
      core: [10, 11, 12],
      more: [13],
    });
  });

  it('a combo: first three as core, the rest after, no singles; no boots when it has some', () => {
    expect(itemSetFor(byKey('combo:armor'), ALISTAR)).toEqual({
      name: 'Thorn Fortress',
      core: [3, 4, 5],
      boots: [40, 41, 42],
      more: [6],
    });
    const booted = buildList({ ...ALISTAR, combos: [combo('armor', true, 0.6, [3, 41, 5, 6])] });
    expect(
      itemSetFor(
        booted.find((e) => e.kind === 'combo')!,
        ALISTAR,
      ),
    ).toMatchObject({
      core: [3, 41, 5],
      boots: [],
    });
  });

  it('mana after the core only when the core has mana', () => {
    const c = combo('mana', false, 0.5, [3, 4, 5, 6]);
    c.items[3].mana = true;
    expect(itemSetFor(buildList(view({ combos: [c] }))[0], ALISTAR).more).toEqual([]);
    c.items[0].mana = true;
    expect(itemSetFor(buildList(view({ combos: [c] }))[0], ALISTAR).more).toEqual([6]);
  });

  it('a name the client takes: at most 60 characters, no control characters', () => {
    const long = buildList(
      view({
        plans: [plan('tank', [build([1, 2, 3], 0.5, { label: `A\u0007${'b'.repeat(80)}` })])],
      }),
    );
    const { name } = itemSetFor(long[0], ALISTAR);
    expect([...name]).toHaveLength(SET_NAME);
    expect(name).not.toMatch(/\p{Cc}/u);
  });
});

describe('preview mocks', () => {
  it('the Champ card is a MOCK_TIERS champion with every kind of entry', () => {
    const champs = MOCK_TIERS.champions.map((c) => c.id);
    const mock = mockChampView();
    expect(champs).toContain(mock.championId);
    const list = buildList(mock);
    expect(new Set(list.map((e) => e.kind))).toEqual(new Set(['core', 'combo', 'assembled']));
    expect(list.filter((e) => e.name.startsWith('Tank / Heartsteel · '))).toHaveLength(2);
    expect(new Set(list.map((e) => e.name)).size).toBe(list.length);
    for (const e of list) expect(itemSetFor(e, mock).core.length).toBeGreaterThan(0);
  });

  it('three dealt champions, all in MOCK_TIERS', () => {
    const champs = MOCK_TIERS.champions.map((c) => c.id);
    expect(mockOffer()).toHaveLength(3);
    for (const c of mockOffer()) expect(champs).toContain(c.championId);
  });
});
