import { describe, expect, it } from 'vitest';
import type { ChampItem, MetaAugment } from '../../adapters/aramChamp';
import { champView } from './champCard';
import {
  COMBO_HONESTY,
  comboNote,
  combosFor,
  COMBOS_MAX,
  THEMES,
  themeOf,
  type AugmentFacts,
  type Combo,
  type ItemFacts,
  type ItemTexts,
} from './combos';

// Offmeta-System (combos.ts): themes are rules over the data, never id lists. Texts, tags and
// categories below as arammeta and Data Dragon have them (08.10.2026).
const themesOfAugment = (a: AugmentFacts) =>
  THEMES.filter((t) => t.augment(a) && !t.direction).map((t) => t.id);
const themesOfItem = (i: ItemFacts) =>
  THEMES.filter((t) => t.item !== 'own' && !t.direction && t.item(i)).map((t) => t.id);

const AUGMENTS: Record<string, MetaAugment> = {
  1138: {
    name: 'Goredrink',
    rarity: 'kSilver',
    cats: ['tank'],
    icon: 'assets/icons/g.png',
    text: 'Gain [數值] Omnivamp.',
  },
  2132: {
    name: 'Warlock Juicebox',
    rarity: 'kGold',
    cats: ['tank'],
    icon: 'assets/icons/w.png',
    text: 'Gain [數值] Omnivamp.',
  },
  1077: {
    name: 'Soul Siphon',
    rarity: 'kGold',
    cats: ['crit', 'tank'],
    icon: 'assets/icons/s.png',
    text: 'Heal for [數值] of damage done by Critical Strikes. Gain [數值] Crit chance.',
  },
  1328: {
    name: 'Critical Rhythm',
    rarity: 'kGold',
    cats: ['ad', 'crit'],
    icon: 'assets/icons/c.png',
    text: 'Your basic Attack stacks Attack Speed on Critical Strikes. Gain [數值] Crit chance.',
  },
  1041: {
    name: 'Goliath',
    rarity: 'kPrismatic',
    cats: ['amp', 'tank'],
    icon: 'assets/icons/l.png',
    text: 'Become large, gaining [數值] Health and [數值] Adaptive Force.',
  },
  1015: {
    name: 'Circle of Death',
    rarity: 'kPrismatic',
    cats: ['amp', 'support'],
    icon: 'assets/icons/d.png',
    text: 'Healing and Health Regen also deals magic damage to the nearest enemy champion.',
  },
  1311: {
    name: 'Overflow',
    rarity: 'kGold',
    cats: ['ad', 'ap', 'amp', 'tank'],
    icon: 'assets/icons/o.png',
    text: 'Your Mana costs are doubled. Your Ability Heals, Shields, and damage are increased based on your max Mana.',
  },
  1097: {
    name: 'Witchful Thinking',
    rarity: 'kSilver',
    cats: ['ap'],
    icon: 'assets/icons/a.png',
    text: 'Gain [數值] Ability Power.',
  },
  1030: {
    name: 'Eureka',
    rarity: 'kPrismatic',
    cats: ['ap', 'cd'],
    icon: 'assets/icons/e.png',
    text: 'Gain Ability Haste equal to [數值] Ability Power.',
  },
};
const facts = (id: number): AugmentFacts => ({
  cats: AUGMENTS[id].cats,
  name: AUGMENTS[id].name,
  text: AUGMENTS[id].text ?? '',
});

const TEXTS: ItemTexts = {
  3031: {
    text: '75 Attack Damage\n25% Critical Strike Chance\n30% Critical Strike Damage',
    price: 3500,
  },
  6675: {
    text: '40% Attack Speed\n25% Critical Strike Chance\n4% Move Speed\n\nTranscendence\nAttacks reduce Basic Ability cooldowns by 15% of their remaining cooldown.',
    price: 2650,
  },
  6676: {
    text: '50 Attack Damage\n10 Lethality\n25% Critical Strike Chance\n\nDeath\nYour damage executes champions that are below 5% Health.',
    price: 3000,
  },
  3065: {
    text: '400 Health\n50 Magic Resist\n10 Ability Haste\n100% Base Health Regen\n\nBoundless Vitality\nHeals and Shields on you are increased by 25%.',
    price: 2700,
  },
  6333: {
    text: "60 Attack Damage\n50 Armor\n15 Ability Haste\n\nIgnore Pain\nA percentage of damage taken is dealt to you over 3 seconds instead.\n\nDefy\nWhen a champion that you damaged within 3 seconds dies, cleanse Ignore Pain's remaining damage and restore Health over 2 seconds.",
    price: 3300,
  },
  3083: {
    text: "1000 Health\n100% Base Health Regen\n\nWarmog's Heart\nIf you have 2000 bonus Health and have not taken damage within 8 seconds, restore Health per second.",
    price: 3100,
  },
  3153: {
    text: "40 Attack Damage\n25% Attack Speed\n10% Life Steal\n\nMist's Edge\nAttacks deal a percentage of enemy's current Health as bonus physical damage On-Hit.",
    price: 3200,
  },
  3107: {
    text: '30 Ability Power\n15 Ability Haste\n100% Base Mana Regen\n10% Heal and Shield Power\n\nIntervention\nRestore 150 - 350 Health to allied units and deal 10% max Health true damage to enemy champions after 2.5 seconds.',
    price: 2300,
  },
  3089: {
    text: '130 Ability Power\n\nMagical Opus\nIncreases your total Ability Power by 30%.',
    price: 3500,
  },
  4633: {
    text: '70 Ability Power\n350 Health\n15 Ability Haste\n\nVoid Corruption\nFor each second in combat with enemy champions, deal 2% bonus damage, up to 8%. At maximum strength, gain Omnivamp.',
    price: 3100,
  },
  3179: { text: '60 Attack Damage\n18 Lethality\n15 Ability Haste', price: 2800 },
  6655: { text: '100 Ability Power\n600 Mana\n10 Ability Haste', price: 2750 },
};
const ITEMS: Record<string, ChampItem> = {
  3031: {
    name: 'Klinge der Unendlichkeit',
    done: true,
    mana: false,
    kind: 'ad',
    tags: ['CriticalStrike', 'Damage'],
  },
  6675: {
    name: 'Flimmerklinge der Navori',
    done: true,
    mana: false,
    kind: 'ad',
    tags: ['CriticalStrike', 'AttackSpeed', 'NonbootsMovement'],
  },
  6676: {
    name: 'Der Sammler',
    done: true,
    mana: false,
    kind: 'ad',
    tags: ['Damage', 'CriticalStrike', 'ArmorPenetration'],
  },
  3065: {
    name: 'Geistessicht',
    done: true,
    mana: false,
    kind: 'tank',
    tags: ['Health', 'SpellBlock', 'HealthRegen', 'CooldownReduction', 'AbilityHaste'],
  },
  6333: {
    name: 'Tanz des Todes',
    done: true,
    mana: false,
    kind: 'ad',
    tags: ['Armor', 'Damage', 'AbilityHaste'],
  },
  3083: {
    name: 'Warmogs Rüstung',
    done: true,
    mana: false,
    kind: 'tank',
    tags: ['Health', 'HealthRegen'],
  },
  3153: {
    name: 'Klinge des gestürzten Königs',
    done: true,
    mana: false,
    kind: 'ad',
    tags: ['Damage', 'AttackSpeed', 'LifeSteal', 'Slow', 'OnHit'],
  },
  3107: {
    name: 'Befreiungsschlag',
    done: true,
    mana: true,
    kind: 'ap',
    tags: ['SpellDamage', 'ManaRegen', 'CooldownReduction', 'AbilityHaste'],
  },
  3089: { name: 'Rabadons Todeshaube', done: true, mana: false, kind: 'ap', tags: ['SpellDamage'] },
  4633: {
    name: 'Kluftformer',
    done: true,
    mana: false,
    kind: 'ap',
    tags: ['Health', 'SpellDamage', 'CooldownReduction', 'SpellVamp'],
  },
  3179: {
    name: 'Umbral Glaive',
    done: true,
    mana: false,
    kind: 'ad',
    tags: ['Damage', 'ArmorPenetration'],
  },
  6655: { name: 'Ludens Echo', done: true, mana: true, kind: 'ap', tags: ['SpellDamage', 'Mana'] },
};
const itemFacts = (id: number): ItemFacts => ({
  kind: ITEMS[id].kind,
  tags: ITEMS[id].tags ?? [],
  text: TEXTS[id].text,
});
const info = (id: number) => ({ name: AUGMENTS[id].name, rarity: 'gold', image: null });

describe('Themen-Regeln', () => {
  it('ordnet echte Augments nach Kategorie und Text ein', () => {
    expect(themesOfAugment(facts(1138))).toEqual(['heal']);
    expect(themesOfAugment(facts(1077))).toEqual(expect.arrayContaining(['heal', 'crit']));
    expect(themesOfAugment(facts(1328))).toEqual(['crit']);
    expect(themesOfAugment(facts(1041))).toContain('giant');
    // "Health" is no healing: Goliath is not Maximum Heal.
    expect(themesOfAugment(facts(1041))).not.toContain('heal');
    expect(themesOfAugment(facts(1015))).toContain('heal');
    expect(themesOfAugment(facts(1311))).toContain('mana');
  });

  it('ordnet echte Items nach Data-Dragon-Tags und Text ein', () => {
    expect(themesOfItem(itemFacts(3031))).toContain('crit');
    expect(themesOfItem(itemFacts(3031))).not.toContain('heal');
    expect(themesOfItem(itemFacts(3065))).toContain('heal');
    // 400 Health is no giant item, 1000 is.
    expect(themesOfItem(itemFacts(3065))).not.toContain('giant');
    expect(themesOfItem(itemFacts(3083))).toEqual(expect.arrayContaining(['heal', 'giant']));
    expect(themesOfItem(itemFacts(6333))).toContain('heal');
    expect(themesOfItem(itemFacts(3153))).toEqual(expect.arrayContaining(['heal', 'onhit']));
    expect(themesOfItem(itemFacts(6676))).toEqual(expect.arrayContaining(['crit', 'execute']));
    // Healing allies is the healer's theme, not one's own sustain.
    expect(themesOfItem(itemFacts(3107))).toContain('support');
    expect(themesOfItem(itemFacts(3107))).not.toContain('heal');
  });

  it('nimmt ein neues Augment mit Heil-Text von selbst auf', () => {
    const fresh = {
      cats: ['new'],
      name: 'Fresh Blood',
      text: 'Your Abilities heal you for 8% of damage dealt.',
    };
    expect(themesOfAugment(fresh)).toContain('heal');
    const crit = { cats: ['new'], name: 'Sharper', text: 'Gain [數值] Crit chance.' };
    expect(themesOfAugment(crit)).toContain('crit');
  });

  it('jedes Thema hat Namen, Zeile und eindeutige ID', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of THEMES) {
      expect(t.name.length).toBeGreaterThan(1);
      expect(t.line.length).toBeGreaterThan(10);
      expect(themeOf(t.id)).toBe(t);
    }
  });
});

describe('Combos je Champion', () => {
  // Warwick as on arammeta 08.10.2026: no crit item bought, two crit augments in his pool.
  const warwick = {
    pool: [
      { id: 1328, g: 15, wr: 0.5139, pick: 0.0289 },
      { id: 1077, g: 47, wr: 0.5024, pick: 0.0711 },
      { id: 1138, g: 52, wr: 0.517, pick: 0.074 },
      { id: 2132, g: 43, wr: 0.514, pick: 0.06 },
    ],
    rows: [
      { ids: [6333], g: 185, wr: 0.5199, pick: 0.3229 },
      { ids: [3153], g: 323, wr: 0.5124, pick: 0.5637 },
      { ids: [3065], g: 303, wr: 0.5034, pick: 0.5288 },
      { ids: [3179], g: 500, wr: 0.6, pick: 0.5 },
    ],
    items: ITEMS,
    texts: TEXTS,
    augments: AUGMENTS,
    info,
    offmeta: [],
  };

  it('Warwick Krit: komplettes Krit-Build mit seinen Krit-Augments, Offmeta, ehrlich ohne Zahlen', () => {
    const combos = combosFor(warwick);
    const crit = combos.find((c) => c.theme === 'crit')!;
    expect(crit.meta).toBe(false);
    expect(crit.augments.map((a) => a.id).sort()).toEqual([1077, 1328]);
    expect(crit.augments.find((a) => a.id === 1328)).toMatchObject({ games: 15, winRate: 0.5139 });
    // Only crit items, dearest first, none measured on him.
    expect(crit.items.map((i) => i.id)).toEqual([3031, 6676, 6675]);
    expect(crit.items.every((i) => i.games === null)).toBe(true);
    expect(comboNote(crit, 'Warwick')).toMatch(/Keins der Items hat Zahlen mit Warwick/);
    expect(COMBO_HONESTY).toMatch(/Zusammengesetzt/);
  });

  it('Maximum Heal: seine gekauften Heil-Items zuerst, Meta, nutzlose Items nie', () => {
    const combos = combosFor(warwick);
    const heal = combos.find((c) => c.theme === 'heal')!;
    expect(heal.meta).toBe(true);
    expect(heal.items.slice(0, 3).map((i) => i.id)).toEqual([6333, 3153, 3065]);
    expect(heal.items[0]).toMatchObject({ games: 185, winRate: 0.5199 });
    expect(combos.flatMap((c) => c.items.map((i) => i.id))).not.toContain(3179);
    expect(comboNote(heal, 'Warwick')).toMatch(/1 Item ohne Zahlen/);
  });

  it('nie AP- und AD-Items zusammen, Mana nur in einem Mana-Thema', () => {
    for (const c of combosFor(warwick)) {
      const kinds = new Set(c.items.map((i) => ITEMS[i.id].kind));
      expect(kinds.has('ap') && kinds.has('ad')).toBe(false);
      if (!themeOf(c.theme)!.mana) expect(c.items.some((i) => i.mana)).toBe(false);
    }
  });

  it('braucht zwei Augments des Themas im Pool', () => {
    const one = combosFor({ ...warwick, pool: warwick.pool.filter((a) => a.id !== 1328) });
    expect(one.find((c) => c.theme === 'crit')).toBeUndefined();
  });

  it('AP als Combo nur, wenn die Karte AP offmeta nennt, mit den Items der Richtung', () => {
    const alistar = {
      ...warwick,
      pool: [
        { id: 1097, g: 80, wr: 0.55, pick: 0.02 },
        { id: 1030, g: 60, wr: 0.54, pick: 0.02 },
      ],
      rows: [
        { ids: [3089], g: 136, wr: 0.5352, pick: 0.084 },
        { ids: [4633], g: 64, wr: 0.5468, pick: 0.0395 },
        { ids: [6655], g: 81, wr: 0.5325, pick: 0.05 },
      ],
    };
    expect(combosFor(alistar).find((c) => c.theme === 'ap')).toBeUndefined();
    const ap = combosFor({ ...alistar, offmeta: ['ap'] }).find((c) => c.theme === 'ap')!;
    expect(ap.meta).toBe(false);
    // As the card's offmeta build: Rabadon before Riftmaker (few games), the mana item last.
    expect(ap.items.slice(0, 3).map((i) => i.id)).toEqual([3089, 4633, 6655]);
    expect(ap.items[2].mana).toBe(true);
  });

  it('Meta und Offmeta wechseln sich ab, höchstens COMBOS_MAX', () => {
    const combos = combosFor(warwick);
    expect(combos.length).toBeLessThanOrEqual(COMBOS_MAX);
    expect(combos.length).toBeGreaterThan(1);
    const tags = combos.map((c) => c.meta);
    const metas = tags.filter(Boolean).length;
    const turns = Math.min(metas, tags.length - metas);
    for (let i = 1; i < turns * 2; i++) expect(tags[i]).not.toBe(tags[i - 1]);
  });

  it('kommt mit der Karte: Pool mit Pick-Rate aus arammetas Champion-Datei, klein genug', () => {
    const file = {
      poolAugments: warwick.pool,
      singleItems: {
        top: warwick.rows.map((r) => ({
          g: r.g,
          wr: r.wr,
          pick: r.pick,
          items: [{ id: r.ids[0] }],
        })),
      },
      itemClusters: { groups: [] },
    };
    const view = champView(
      { championId: 19, alias: 'Warwick', name: 'Warwick' },
      {
        champion: null,
        augments: null,
        items: ITEMS,
        meta: {
          patch: '16.20',
          games: 571,
          champion: JSON.stringify(file),
          augments: AUGMENTS,
          items: TEXTS,
        },
      },
    )!;
    const shape = (list: Combo[]) =>
      list.map((c) => [c.theme, c.meta, c.items.map((i) => i.id), c.augments.map((a) => a.id)]);
    expect(shape(view.combos!)).toEqual(shape(combosFor(warwick)));
    expect(view.combos![0].augments[0].image).toMatch(/^https:\/\/arammeta\.com\/assets\/icons\//);
    expect(view.combos!.find((c) => c.theme === 'heal')!.meta).toBe(true);
    // Only what the cards show goes to the popout.
    expect(Object.keys(view.combos![0].augments[0]).sort()).toEqual([
      'games',
      'id',
      'image',
      'name',
      'rarity',
      'winRate',
    ]);
  });
});
