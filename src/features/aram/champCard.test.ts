import { describe, expect, it } from 'vitest';
import type { AramEntry, AramSeat } from '../../adapters/aram';
import type { ChampItem } from '../../adapters/aramChamp';
import { championView } from '../../../apps/mayhem-site/src/champions';
import {
  AUGMENTS_SHOWN,
  MANA_PENALTY,
  bestAugments,
  bestBuilds,
  buildPlans,
  champView,
  directionOf,
  fitOf,
  metaImage,
  parseAugments,
  parseChampion,
  parseMeta,
  planNote,
  shrunk,
  sourceLabel,
  USELESS_ITEMS,
} from './champCard';

// Champ-Karte (champCard.ts): best augments and item cores of a champion from the website's games,
// several choices with numbers, mana items count against a build.
const item = (
  name: string,
  done = true,
  mana = false,
  kind: ChampItem['kind'] = 'ap',
): ChampItem => ({ name, done, mana, kind });
const ITEMS: Record<string, ChampItem> = {
  '1': item('Sturmflut'),
  '2': item('Zhonyas'),
  '3': item('Rabadons'),
  '4': item('Seraphs', true, true),
  '5': item('Riesiger Stab', false),
};
const game = (items: number[], pct: number | null = 0.5, win = true) => ({
  augments: [],
  items,
  win,
  pct,
});

describe('Champ-Karte', () => {
  it('Augments nach Note, erst ab genug Spielen, wenige Spiele zur Mitte gezogen', () => {
    const names = new Map([[7, { name: 'Hexenhut', rarity: 'gold', icon: true }]]);
    const rows = [
      { id: 7, games: 40, graded: 40, winRate: 0.6, pct: 0.8 },
      // Few games with a perfect value: pulled down below the steady one.
      { id: 8, games: 5, graded: 5, winRate: 1, pct: 0.95 },
      { id: 9, games: 4, graded: 4, winRate: null, pct: 0.99 },
      { id: 10, games: 30, graded: 30, winRate: 0.4, pct: null },
    ];
    const picks = bestAugments(rows, names);
    expect(picks.map((p) => p.id)).toEqual([7, 8]);
    expect(picks[0]).toMatchObject({ name: 'Hexenhut', icon: true, grade: 'A' });
    expect(picks[1].name).toBe('Augment 8');
    expect(shrunk(0.95, 5)).toBeLessThan(shrunk(0.8, 40));
    const many = Array.from({ length: 9 }, (_, i) => ({
      id: i + 1,
      games: 9,
      graded: 9,
      winRate: 0.5,
      pct: 0.5,
    }));
    expect(bestAugments(many, new Map())).toHaveLength(AUGMENTS_SHOWN);
  });

  it('Builds aus drei fertigen Items, Mana zählt dagegen', () => {
    const games = [
      game([1, 2, 3, 5], 0.6),
      game([3, 2, 1], 0.6),
      // Seraph's core a little better by grade, but mana costs more than the difference.
      game([1, 2, 4], 0.64),
      game([4, 2, 1], 0.64),
      // Once only: not a build.
      game([1, 3, 4], 0.99),
    ];
    const builds = bestBuilds(games, ITEMS);
    expect(builds.map((b) => b.items.map((i) => i.id))).toEqual([
      [1, 2, 3],
      [1, 2, 4],
    ]);
    expect(builds[1]).toMatchObject({ mana: 1, games: 2, winRate: 1 });
    expect(builds[1].items[2]).toMatchObject({ name: 'Seraphs', mana: true });
    // Without the penalty the mana core would lead.
    expect(shrunk(0.64, 2) - MANA_PENALTY).toBeLessThan(shrunk(0.6, 2));
    expect(shrunk(0.64, 2)).toBeGreaterThan(shrunk(0.6, 2));
  });

  it('nutzlose Items wie Umbral Glaive kommen nie in einen Build', () => {
    const items = { ...ITEMS, '3179': item('Umbral Glaive') };
    const games = [
      game([1, 2, 3179], 0.99),
      game([3179, 2, 1], 0.99),
      game([1, 2, 3], 0.4),
      game([1, 2, 3], 0.4),
    ];
    expect(bestBuilds(games, items).map((b) => b.items.map((i) => i.id))).toEqual([[1, 2, 3]]);
    expect(USELESS_ITEMS[3179]).toMatch(/Ward/);
  });

  it('ohne Noten zählt die Siegquote, ohne Item-Liste gibt es keine Builds', () => {
    const games = [game([1, 2, 3], null, true), game([1, 2, 3], null, false)];
    expect(bestBuilds(games, ITEMS)[0]).toMatchObject({ games: 2, winRate: 0.5, grade: null });
    expect(bestBuilds(games, {})).toEqual([]);
  });

  it('prüft die Antworten der Website streng', () => {
    expect(parseChampion(null)).toBeNull();
    expect(parseChampion('kein json')).toBeNull();
    expect(
      parseChampion(
        JSON.stringify({ champion: { games: 1, augments: [], builds: [{ items: [1] }] } }),
      ),
    ).toBeNull();
    expect(
      parseChampion(JSON.stringify({ champion: { games: -1, augments: [], builds: [] } })),
    ).toBeNull();
    const augments = parseAugments(
      JSON.stringify({
        augments: { '12': { name: 'Blitz', rarity: 'prismatic', icon: true }, x: { name: 'y' } },
      }),
    );
    expect([...augments.keys()]).toEqual([12]);
    expect(parseAugments('{')).toEqual(new Map());
  });

  it('ein Champion ohne Spiele auf der Website bekommt eine leere Karte', () => {
    const champ = { championId: 12, alias: 'Alistar', name: 'Alistar' };
    expect(champView(champ, { champion: null, augments: null, items: {} })).toEqual({
      ...champ,
      source: 'mayhemstats',
      patch: null,
      games: 0,
      augments: [],
      builds: [],
      plans: [],
    });
    expect(champView(champ, { champion: '[]', augments: null, items: {} })).toBeNull();
  });

  it('liest genau die Form, die die Website schickt', () => {
    const view = championView(
      Array.from({ length: 6 }, (_, i) => entry(i + 1, i + 1)),
      AHRI,
    );
    const card = champView(
      { championId: AHRI, alias: 'Ahri', name: 'Ahri' },
      { champion: JSON.stringify({ scope: 'all', champion: view }), augments: null, items: ITEMS },
    );
    expect(card).not.toBeNull();
    expect(card!.games).toBe(view!.games);
    expect(card!.augments.map((a) => a.id)).toContain(2000);
    expect(card!.builds[0].items.map((i) => i.id)).toEqual([1, 2, 3]);
    // Sturmflut, Zhonyas, Rabadons: an AP build, all six games.
    expect(card!.plans.map((p) => [p.direction, p.games])).toEqual([['ap', 6]]);
    expect(card!.plans[0].augments.map((a) => a.id)).toContain(2000);
  });

  it('Richtung eines Spiels: die meisten fertigen Items, mindestens zwei, kein Gleichstand', () => {
    expect(directionOf([1, 2, 21], DIRECTED)).toBe('ap');
    expect(directionOf([21, 22, 1], DIRECTED)).toBe('ad');
    expect(directionOf([1, 21], DIRECTED)).toBeNull();
    expect(directionOf([1, 2, 21, 22], DIRECTED)).toBeNull();
    // Unfinished, useless and other items do not count.
    expect(
      directionOf([1, 5, 3179], { ...DIRECTED, '3179': item('Umbral', true, false, 'ad') }),
    ).toBeNull();
  });

  it('Build vor dem Spiel: AP-Alistar bekommt AP-Augments als S, Umwandler werden erkannt', () => {
    // Alistar mostly goes tank; with augment 7 (AP) he goes AP and does very well.
    const games = [
      ...Array.from({ length: 12 }, (_, i) => ({
        ...game([31, 32, 2], 0.5),
        augments: [8, 9 + (i % 3)],
      })),
      ...Array.from({ length: 5 }, () => ({ ...game([1, 2, 31], 0.85), augments: [7, 8] })),
    ];
    const plans = buildPlans(games, DIRECTED, new Map());
    expect(plans.map((p) => p.direction)).toEqual(['tank', 'ap']);
    const ap = plans[1];
    expect(ap.augments[0]).toMatchObject({
      id: 7,
      tier: 'S',
      games: 5,
      general: false,
      turns: 'ap',
    });
    expect(ap.builds[0].items.map((i) => i.id)).toEqual([1, 2, 31]);
    // In the tank build, the AP augment has no tank games: its general value stands in.
    const tank = plans[0];
    expect(tank.augments.find((a) => a.id === 7)).toMatchObject({ general: true, games: 0 });
    expect(tank.augments.find((a) => a.id === 8)!.turns).toBeNull();
    // Too few games in a direction: not offered.
    expect(buildPlans(games.slice(0, 2), DIRECTED, new Map())).toEqual([]);
  });

  it('Stufen wie auf der Tierliste: nach Platz, Gleichstand teilt die Stufe', () => {
    const games = Array.from({ length: 10 }, (_, i) => ({
      ...game([1, 2, 3], i / 10),
      augments: [100 + i],
    }));
    const [plan] = buildPlans(games, DIRECTED, new Map());
    expect(plan.augments.map((a) => a.tier)).toEqual([
      'S',
      'A',
      'A',
      'B',
      'B',
      'B',
      'B',
      'C',
      'C',
      'D',
    ]);
    const same = buildPlans(
      games.map((g) => ({ ...g, pct: 0.5 })),
      DIRECTED,
      new Map(),
    )[0];
    expect(new Set(same.augments.map((a) => a.tier))).toEqual(new Set(['S']));
  });

  it('S höchstens 5, S und A zusammen höchstens 15 (lange Listen)', () => {
    const games = Array.from({ length: 60 }, (_, i) => ({
      ...game([1, 2, 3], 1 - i / 60),
      augments: [100 + i],
    }));
    const [plan] = buildPlans(games, DIRECTED, new Map());
    const count = (t: string) => plan.augments.filter((a) => a.tier === t).length;
    expect([count('S'), count('A'), count('B')]).toEqual([5, 10, 27]);
    expect(plan.augments[0].tier).toBe('S');
  });
});

const DIRECTED: Record<string, ChampItem> = {
  ...ITEMS,
  '21': item('Klinge', true, false, 'ad'),
  '22': item('Hydra', true, false, 'ad'),
  '31': item('Dornenpanzer', true, false, 'tank'),
  '32': item('Sonnenfeuer', true, false, 'tank'),
};

// A game of Ahri, as uploaded (same form as in siteChampions.test.ts).
const AHRI = 103;
const CHAMPS = [AHRI, 54, 16, 22, 1, 2, 3, 4, 5, 6];
const pid = (i: number) => `puuid-${String(i).padStart(30, '0')}`;
const lobbyOf = (game: number): AramSeat[] =>
  CHAMPS.map((championId, i) => ({
    you: i === 0,
    team: i < 5 ? 100 : 200,
    championId,
    kills: 4 + ((i + game) % 7),
    deaths: 4 + ((i * 3 + game) % 5),
    assists: 12 + ((i * 5 + game) % 11),
    damage: 18_000 + ((i * 7 + game * 3) % 10) * 2_500,
    taken: 22_000 + ((i * 5 + game) % 9) * 2_000,
    mitigated: 15_000 + i * 1_000,
    healed: 3_000 + ((i + game) % 4) * 1_500,
    shielded: 0,
    gold: 12_000 + i * 300,
  }));
function entry(player: number, gameId: number): AramEntry {
  const lobby = lobbyOf(gameId);
  const me = lobby[0];
  return {
    gameId,
    at: 1_790_000_000_000 + gameId * 60_000,
    seconds: 18 * 60,
    patch: '16.19',
    puuid: pid(player),
    name: `Spieler ${player}#EUW`,
    championId: AHRI,
    champion: 'Ahri',
    championName: 'Ahri',
    win: gameId % 2 === 0,
    kills: me.kills,
    deaths: me.deaths,
    assists: me.assists,
    damage: me.damage,
    taken: me.taken,
    healed: me.healed,
    shielded: 0,
    gold: me.gold,
    level: 18,
    items: [1, 2, 3, 5, 0, 0],
    augments: [1000 + (gameId % 2), 2000],
    damageRank: 1,
    teamShare: 0.3,
    multikill: 1,
    pentas: 0,
    details: null,
    with: [],
    lobby,
  };
}

describe('Champ-Karte mit arammeta', () => {
  const champ = { championId: 12, alias: 'Alistar', name: 'Alistar' };
  const tank = (name: string): ChampItem => item(name, true, false, 'tank');
  const MetaItems: Record<string, ChampItem> = {
    '3084': tank('Heartsteel'),
    '3083': tank('Warmog'),
    '3075': tank('Thornmail'),
    '2502': tank('Unending Despair'),
    '3040': item('Seraphs', true, true),
    '3179': item('Umbral', true, false, 'ad'),
  };
  // The shape of arammeta's /api/champions/<id>.json (only the parts the card reads).
  const file = {
    poolAugments: [
      { id: 1, g: 2000, wr: 0.56, pick: 0.03 },
      { id: 2, g: 2000, wr: 0.55, pick: 0.03 },
      { id: 3, g: 2000, wr: 0.54, pick: 0.03 },
      { id: 4, g: 10, wr: 0.9, pick: 0.001 },
    ],
    itemClusters: {
      groups: [
        {
          core: [{ id: 3084 }, { id: 3083 }],
          g: 20000,
          wr: 0.54,
          options: [
            { id: 2502, g: 9000, wr: 0.53 },
            { id: 3075, g: 8000, wr: 0.5 },
            { id: 3179, g: 5000, wr: 0.6 },
            { id: 3040, g: 5000, wr: 0.55 },
          ],
        },
      ],
    },
    bot: {},
  };
  const meta = {
    patch: '16.19',
    games: 60574,
    champion: JSON.stringify(file),
    augments: {
      '1': {
        name: 'Tank Engine',
        rarity: 'kPrismatic',
        cats: ['tank'],
        icon: 'assets/icons/a.png',
      },
      '2': { name: 'Mystic Punch', rarity: 'kGold', cats: ['ap'], icon: 'assets/icons/b.png' },
      '3': { name: 'Blade Waltz', rarity: 'kSilver', cats: ['ad'], icon: '../evil.png' },
    },
  };

  it('nimmt arammeta zuerst und nennt die Quelle mit Patch', () => {
    const view = champView(champ, { champion: null, augments: null, items: MetaItems, meta })!;
    expect(view.source).toBe('arammeta');
    expect(view.patch).toBe('16.19');
    expect(view.games).toBe(60574);
    expect(sourceLabel(view)).toBe('arammeta.com, Patch 16.19');
    // Without arammeta the website's numbers, never mixed.
    const site = champView(champ, {
      champion: null,
      augments: null,
      items: MetaItems,
      meta: null,
    })!;
    expect(site.source).toBe('mayhemstats');
  });

  it('Build-Richtungen: der meistgespielte Kern zuerst, nutzlose Items nie, Mana zählt dagegen', () => {
    const view = champView(champ, { champion: null, augments: null, items: MetaItems, meta })!;
    expect(view.plans.map((p) => p.direction)).toEqual(['tank', 'ap', 'ad']);
    expect(view.plans[0].share).toBe(1);
    const builds = view.plans[0].builds;
    expect(builds[0].items.map((i) => i.id)).toEqual([3084, 3083, 2502]);
    expect(builds.flatMap((b) => b.items.map((i) => i.id))).not.toContain(3179);
    const seraphs = view.builds.find((b) => b.items.some((i) => i.id === 3040));
    expect(seraphs?.mana ?? 1).toBe(1);
    // A direction without its own core still ranks the augments for it.
    expect(view.plans[1].builds).toEqual([]);
  });

  it('AP-Richtung hebt AP-Augments, wenige Spiele zählen nicht, nur eigene Symbole', () => {
    const view = champView(champ, { champion: null, augments: null, items: MetaItems, meta })!;
    const ap = view.plans.find((p) => p.direction === 'ap')!;
    expect(ap.augments[0]).toMatchObject({ id: 2, tier: 'S', rarity: 'gold' });
    expect(ap.augments.at(-1)!.id).toBe(3);
    const tankPlan = view.plans.find((p) => p.direction === 'tank')!;
    expect(tankPlan.augments[0]).toMatchObject({ id: 1, rarity: 'prismatic' });
    expect(tankPlan.augments.map((a) => a.id)).not.toContain(4);
    expect(tankPlan.augments[0].image).toBe('https://arammeta.com/assets/icons/a.png');
    expect(ap.augments.find((a) => a.id === 3)!.image).toBeNull();
    expect(metaImage('assets/icons/x.png')).toBe('https://arammeta.com/assets/icons/x.png');
    expect(metaImage('https://evil.example/x.png')).toBeNull();
  });

  it('Kategorien: eigene Richtung zählt mehr, jede andere Richtung weniger, neutrale bleiben', () => {
    expect(fitOf(['ap'], 'ap')).toBe(1);
    expect(fitOf(['tank', 'new'], 'ap')).toBe(-1);
    expect(fitOf(['ad'], 'ap')).toBe(-1);
    expect(fitOf(['cd'], 'ap')).toBe(0);
    expect(fitOf(['tank', 'cd'], 'tank')).toBe(1);
    expect(fitOf(['ap'], 'tank')).toBe(-1);
    // Tank Engine (tank) is the best augment overall, but not for AP.
    const view = champView(champ, { champion: null, augments: null, items: MetaItems, meta })!;
    const ap = view.plans.find((p) => p.direction === 'ap')!;
    expect(ap.augments.map((a) => a.id)).toEqual([2, 1, 3]);
  });

  it('Richtung ohne arammeta-Kern: Zahlen der Website, Quelle steht dabei', () => {
    const site = championView(
      Array.from({ length: 6 }, (_, i) => entry(i + 1, i + 1)),
      AHRI,
    );
    const ahri = { championId: AHRI, alias: 'Ahri', name: 'Ahri' };
    const view = champView(ahri, {
      champion: JSON.stringify({ scope: 'all', champion: site }),
      augments: null,
      items: { ...ITEMS, ...MetaItems },
      meta,
    })!;
    expect(view.source).toBe('arammeta');
    const ap = view.plans.find((p) => p.direction === 'ap')!;
    expect(ap).toMatchObject({ source: 'mayhemstats', games: 6, share: 0 });
    expect(ap.builds[0].items.map((i) => i.id)).toEqual([1, 2, 3]);
    expect(planNote(view, ap)).toBe(
      'Für AP hat arammeta.com kaum Spiele. Kern und Augments kommen von mayhemstats.lol (6 Spiele).',
    );
    const tankPlan = view.plans.find((p) => p.direction === 'tank')!;
    expect(tankPlan.source).toBe('arammeta');
    expect(planNote(view, tankPlan)).toBeNull();
    // No AD games anywhere: arammeta's ranking stays, the card says so.
    const ad = view.plans.find((p) => p.direction === 'ad')!;
    expect(ad).toMatchObject({ source: 'arammeta', builds: [] });
    expect(planNote(view, ad)).toBe(
      'arammeta.com hat kaum AD-Spiele mit Ahri. Die Stufen beruhen auf allen Spielen, passende Augments stehen höher.',
    );
    // The tab order stays arammeta's.
    expect(view.plans.map((p) => p.direction)).toEqual(['tank', 'ap', 'ad']);
  });

  it('prüft arammetas Datei streng', () => {
    expect(parseMeta(null)).toBeNull();
    expect(parseMeta('{')).toBeNull();
    expect(parseMeta(JSON.stringify({ poolAugments: [{ id: 1, g: -1, wr: 0.5 }] }))).toBeNull();
    expect(parseMeta(JSON.stringify({ poolAugments: [{ id: 1, g: 5, wr: 1.5 }] }))).toBeNull();
    expect(parseMeta(JSON.stringify({ poolAugments: [] }))).toEqual({ pool: [], groups: [] });
    // Unreadable file: back to the website.
    const broken = { ...meta, champion: '[]' };
    const view = champView(champ, {
      champion: null,
      augments: null,
      items: MetaItems,
      meta: broken,
    })!;
    expect(view.source).toBe('mayhemstats');
  });
});
