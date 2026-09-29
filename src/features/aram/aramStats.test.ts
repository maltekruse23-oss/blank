import { describe, expect, it } from 'vitest';
import {
  readAramFriends,
  type AramDetails,
  type AramEntry,
  type AramPlayer,
} from '../../adapters/aram';
import { categories, ranking, recordCategories } from './aramCategories';
import { aramHighlight } from './aramHighlight';
import { bestGames, kda } from './aramStats';
import { playerOverview } from './aramPlayer';

const player = (name: string): AramPlayer => ({
  puuid: `${name}-${'0'.repeat(40)}`,
  name: `${name}#EUW`,
  icon: 1,
});
const [a, b, c, gone] = ['anna', 'bert', 'cleo', 'weg'].map(player) as [
  AramPlayer,
  AramPlayer,
  AramPlayer,
  AramPlayer,
];
const category = (id: string) => categories.find((x) => x.id === id)!;

let id = 0;
const game = (who: AramPlayer, change: Partial<AramEntry>): AramEntry => ({
  gameId: ++id,
  at: id * 1000,
  seconds: 1200,
  patch: '16.19',
  puuid: who.puuid,
  name: who.name,
  championId: 10,
  champion: 'Kayle',
  championName: 'Kayle',
  win: false,
  kills: 5,
  deaths: 5,
  assists: 5,
  damage: 10_000,
  taken: 10_000,
  healed: 0,
  shielded: 0,
  gold: 10_000,
  level: 18,
  items: [],
  augments: [],
  damageRank: 5,
  teamShare: 0.2,
  multikill: 1,
  pentas: 0,
  details: null,
  with: [],
  ...change,
});
const details = (magic: number, physical: number): AramDetails => ({
  magic,
  physical,
  trueDamage: 0,
  mitigated: 0,
  doubles: 0,
  triples: 0,
  quadras: 0,
  largestCrit: 0,
  ccSeconds: 0,
  largestSpree: 0,
  turretDamage: 0,
});

const games = [
  game(a, { damage: 60_000, win: true, kills: 20, deaths: 2, assists: 10, pentas: 1 }),
  game(a, { damage: 20_000, details: details(15_000, 4_000) }),
  game(b, { damage: 50_000, win: true, taken: 90_000, details: details(2_000, 45_000) }),
  game(b, { damage: 50_000, win: true, pentas: 2 }),
  game(gone, { damage: 999_999, kills: 99 }),
];

describe('ARAM-Kategorien', () => {
  it('Bestwert je Spieler mit dem Spiel dazu, nur Spieler der Liste', () => {
    const rows = ranking(category('damage'), [a, b, c], games);
    expect(rows.map((r) => [r.player.name, r.value])).toEqual([
      ['anna#EUW', 60_000],
      ['bert#EUW', 50_000],
      ['cleo#EUW', null],
    ]);
    expect(rows[0]!.game?.kills).toBe(20);
  });

  it('Summen, Schnitte und Quoten; fehlende Werte nie als 0', () => {
    expect(ranking(category('pentas'), [a, b], games).map((r) => r.value)).toEqual([2, 1]);
    expect(ranking(category('wins'), [a, b], games).map((r) => r.value)).toEqual([1, 0.5]);
    expect(ranking(category('avgDamage'), [a, b], games)[0]!.value).toBe(50_000);
    expect(ranking(category('kda'), [a], games)[0]!.value).toBeCloseTo((25 + 15) / 7);
    // AP/AD only from games with details; the others do not count as 0.
    const ap = ranking(category('ap'), [a, b, c], games);
    expect(ap.map((r) => r.value)).toEqual([15_000, 2_000, null]);
    expect(ranking(category('ad'), [a, b], games).map((r) => r.value)).toEqual([45_000, 4_000]);
    expect(ranking(category('tank'), [a, b], games)[0]!.player).toBe(b);
  });

  it('Rangliste: immer die Rekorde und Pentakills, fest in dieser Reihenfolge', () => {
    expect(recordCategories.slice(0, 7).map((x) => x.id)).toEqual([
      'damage',
      'dpm',
      'pentas',
      'ap',
      'ad',
      'kills',
      'tank',
    ]);
    expect(recordCategories.every((x) => x.kind === 'best' || x.id === 'pentas')).toBe(true);
    expect(new Set(categories.map((x) => x.id)).size).toBe(categories.length);
  });

  it('Schaden pro Minute: bestes Spiel, kurze Spiele ohne Wert', () => {
    const quick = game(a, { damage: 30_000, seconds: 600 });
    const long = game(a, { damage: 45_000, seconds: 1800 });
    const [row] = ranking(category('dpm'), [a], [quick, long]);
    expect(row!.value).toBe(3_000);
    expect(row!.game).toBe(quick);
    expect(category('dpm').value(game(a, { seconds: 30 }))).toBeNull();
  });

  it('beste Spiele und KDA', () => {
    expect(bestGames(games, [a, b], 3).map((g) => g.damage)).toEqual([60_000, 50_000, 50_000]);
    expect(kda({ kills: 3, deaths: 0, assists: 4 })).toBe(7);
  });

  it('prüft die gespeicherten Freunde streng', () => {
    const ok = { puuid: 'x'.repeat(78), name: 'Freund#EUW', icon: 7 };
    expect(readAramFriends([ok])).toEqual([ok]);
    expect(readAramFriends('kaputt')).toEqual([]);
    expect(
      readAramFriends([
        ok,
        ok,
        { ...ok, puuid: '../../x' },
        { ...ok, puuid: 'y'.repeat(78), name: 'A\u0000' },
        { ...ok, puuid: 'z'.repeat(78), icon: -1 },
      ]),
    ).toEqual([ok]);
    // Up to nine friends: with the user ten players, as in one game.
    const many = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 5].map((n, i) => ({
      ...ok,
      puuid: String(n).repeat(70) + String(i).padStart(8, 'x'),
    }));
    expect(readAramFriends(many)).toHaveLength(9);
  });
});

describe('ARAM-Karte nach dem Spiel', () => {
  const at = (who: AramPlayer, time: number, change: Partial<AramEntry>) =>
    game(who, { at: time, ...change });

  it('neuer Rekord der Gruppe: legendär, mit dem Grund', () => {
    const history = [at(b, 1, { damage: 50_000 }), at(a, 3, { damage: 30_000, kills: 30 })];
    const now = at(a, 4, { damage: 90_000, damageRank: 1 });
    const result = aramHighlight(now, [...history, now], [a, b]);
    expect(result.tier).toBe('legend');
    expect(result.badge).toBe('Neuer Rekord');
    expect(result.lines).toContain('Neuer Rekord: Höchster Schaden');
    expect(result.records.slice(0, 2)).toEqual(['damage', 'dpm']);
  });

  it('ein Pentakill ist immer legendär', () => {
    const history = [at(b, 1, { damage: 80_000 })];
    const now = at(a, 2, { damage: 20_000, pentas: 1 });
    const result = aramHighlight(now, [...history, now], [a, b]);
    expect(result).toMatchObject({ tier: 'legend', badge: 'Pentakill' });
    expect(result.lines[0]).toBe('Pentakill!');
  });

  it('Rekord in einer anderen Kategorie oder Top-Schaden: besonders', () => {
    const history = [at(b, 1, { damage: 80_000, kills: 10 }), at(a, 2, { damage: 70_000 })];
    const now = at(a, 3, { damage: 20_000, kills: 25 });
    const result = aramHighlight(now, [...history, now], [a, b]);
    expect(result).toMatchObject({ tier: 'top', badge: 'Rekord' });
    expect(result.lines).toContain('Neuer Rekord: Meiste Kills');
    const top = at(a, 5, { damage: 20_000, damageRank: 1 });
    expect(aramHighlight(top, [...history, top], [a, b])).toMatchObject({
      tier: 'top',
      badge: 'Top-Schaden',
    });
  });

  it('erstes Spiel: kein erfundener Rekord; ein normales Spiel bleibt normal', () => {
    const first = at(a, 1, { damage: 10_000 });
    expect(aramHighlight(first, [first], [a])).toEqual({
      tier: 'normal',
      badge: null,
      lines: [],
      records: [],
    });
    const history = [at(a, 1, { damage: 60_000 }), at(a, 2, { damage: 50_000, kills: 30 })];
    const now = at(a, 3, { damage: 20_000, kills: 5, taken: 1_000 });
    expect(aramHighlight(now, [...history, now], [a]).tier).toBe('normal');
  });

  it('eigene Bestleistung und Platz unter den besten Spielen', () => {
    const history = [
      at(b, 1, { damage: 90_000 }),
      at(b, 2, { damage: 10_000 }),
      at(a, 3, { damage: 20_000 }),
    ];
    const now = at(a, 4, { damage: 40_000, taken: 1_000 });
    const result = aramHighlight(now, [...history, now], [a, b]);
    expect(result).toMatchObject({ tier: 'top', badge: 'Bestleistung' });
    expect(result.lines).toEqual(['Deine neue Bestleistung', 'Platz 2 der besten Spiele']);
  });
});

describe('Spieler-Übersicht', () => {
  it('Plätze mit Gleichstand, Medaillen nur für Werte über 0, beste Spiele und Champions', () => {
    const games = [
      game(a, { damage: 50_000, win: true, champion: 'Ahri', championName: 'Ahri' }),
      game(a, { damage: 30_000, win: false, champion: 'Ahri', championName: 'Ahri', pentas: 0 }),
      game(a, { damage: 40_000, win: true, champion: 'Lux', championName: 'Lux' }),
      game(b, { damage: 60_000, win: true, kills: 5 }),
    ];
    const view = playerOverview(a, [a, b], games);
    expect(view.games).toBe(3);
    expect(view.records.find((s) => s.category.id === 'damage')).toMatchObject({
      value: 50_000,
      place: 2,
    });
    // Pentakills: nobody has one, so no place and no medal.
    expect(view.records.some((s) => s.category.id === 'pentas')).toBe(false);
    expect(view.medals.reduce((t, n) => t + n, 0)).toBe(
      view.records.filter((s) => s.place! <= 3).length,
    );
    expect(view.overall.find((s) => s.category.id === 'wins')).toMatchObject({ place: 2 });
    expect(view.overall.find((s) => s.category.id === 'games')).toMatchObject({
      value: 3,
      place: 1,
    });
    expect(view.best.map((g) => g.damage)).toEqual([50_000, 40_000, 30_000]);
    expect(view.champions[0]).toMatchObject({ championName: 'Ahri', games: 2, wins: 1 });
    // Alone: places, but no medals.
    expect(playerOverview(a, [a], games).medals).toEqual([0, 0, 0]);
    // Without games: nothing made up.
    const none = playerOverview(c, [a, c], games);
    expect(none.games).toBe(0);
    expect(none.records).toEqual([]);
    expect(none.overall.every((s) => s.value === null && s.place === null)).toBe(true);
  });
});
