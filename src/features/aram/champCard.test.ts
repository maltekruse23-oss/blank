import { describe, expect, it } from 'vitest';
import type { AramEntry, AramSeat } from '../../adapters/aram';
import type { ChampItem } from '../../adapters/aramChamp';
import { championView } from '../../../apps/mayhem-site/src/champions';
import {
  AUGMENTS_SHOWN,
  MANA_PENALTY,
  bestAugments,
  bestBuilds,
  champView,
  parseAugments,
  parseChampion,
  shrunk,
} from './champCard';

// Champ-Karte (champCard.ts): best augments and item cores of a champion from the website's games,
// several choices with numbers, mana items count against a build.
const item = (name: string, done = true, mana = false): ChampItem => ({ name, done, mana });
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
      games: 0,
      augments: [],
      builds: [],
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
  });
});

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
