import { describe, expect, it } from 'vitest';
import type { AramDetails, AramEntry } from '../../adapters/aram';
import { FRESH_MS, PLACES, RECORDS, recordsView } from '../../../apps/mayhem-site/src/records';
import { ranking, recordCategories } from './aramCategories';

// The website's records page (apps/mayhem-site/src/records.ts): the same categories, order and
// values as the app's leaderboard, ties share a place, missing values never count as 0.
const pid = (i: number) => `puuid-${String(i).padStart(30, '0')}`;
const NOW = 1_790_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const details = (scale: number): AramDetails => ({
  magic: 10_000 * scale,
  physical: 8_000 * scale,
  trueDamage: 1_000 * scale,
  mitigated: 20_000 * scale,
  doubles: 1,
  triples: 0,
  quadras: 0,
  largestCrit: 900 * scale,
  ccSeconds: 30 * scale,
  largestSpree: 4 * scale,
  turretDamage: 2_000 * scale,
});

function entry(
  player: number,
  gameId: number,
  scale: number,
  extra: Partial<AramEntry> = {},
): AramEntry {
  return {
    gameId,
    at: NOW - 30 * DAY + gameId * 1000,
    seconds: 18 * 60,
    patch: '16.19',
    puuid: pid(player),
    name: `Spieler ${player}#EUW`,
    championId: 103,
    champion: 'Ahri',
    championName: 'Ahri',
    win: true,
    kills: Math.round(10 * scale),
    deaths: 5,
    assists: 20,
    damage: 30_000 * scale,
    taken: 25_000 * scale,
    healed: 4_000 * scale,
    shielded: 0,
    gold: 14_000 * scale,
    level: 18,
    items: [],
    augments: [],
    damageRank: 1,
    teamShare: 0.3,
    multikill: 1,
    pentas: 0,
    details: details(scale),
    with: [
      {
        puuid: pid(99),
        name: 'Fremd#EUW',
        champion: 'Lux',
        championName: 'Lux',
        damage: 1,
        kills: 0,
        deaths: 0,
        assists: 0,
        sameTeam: true,
      },
    ],
    ...extra,
  };
}

describe('Website-Rekorde', () => {
  const games = [
    entry(1, 1, 1),
    entry(1, 2, 2, { pentas: 1 }),
    entry(2, 3, 1.5, { pentas: 2, details: null }),
    entry(3, 4, 0.5),
    entry(3, 4, 0.5), // the same game twice counts once
  ];

  it('gleiche Kategorien und Reihenfolge wie die App', () => {
    expect(RECORDS.map((c) => [c.id, c.title, c.note, c.hue, c.kind])).toEqual(
      recordCategories.map((c) => [c.id, c.title, c.note, c.hue, c.kind]),
    );
  });

  it('gleiche Werte je Spieler wie die Rangliste der App', () => {
    const view = recordsView(games, NOW);
    const players = [1, 2, 3].map((i) => ({ puuid: pid(i), name: `Spieler ${i}#EUW`, icon: 1 }));
    for (const category of recordCategories) {
      const app = ranking(category, players, games).filter((p) => p.value !== null && p.value > 0);
      const site = view.find((c) => c.id === category.id)!;
      expect(site.places.map((p) => [p.puuid, p.value])).toEqual(
        app.map((p) => [p.player.puuid, p.value]),
      );
      if (category.kind === 'best')
        expect(site.places.map((p) => p.game.gameId)).toEqual(app.map((p) => p.game!.gameId));
    }
  });

  it('fehlende Details zählen nicht als 0, Summen zeigen das letzte beitragende Spiel', () => {
    const view = recordsView(games, NOW);
    const ap = view.find((c) => c.id === 'ap')!;
    expect(ap.places.map((p) => p.puuid)).toEqual([pid(1), pid(3)]);
    const pentas = view.find((c) => c.id === 'pentas')!;
    expect(pentas.places.map((p) => [p.puuid, p.value, p.game.gameId])).toEqual([
      [pid(2), 2, 3],
      [pid(1), 1, 2],
    ]);
  });

  it('Gleichstand teilt den Platz, höchstens zehn Plätze', () => {
    const many = Array.from({ length: 14 }, (_, i) => entry(i, 100 + i, i < 2 ? 3 : 1 + i / 100));
    const damage = recordsView(many, NOW).find((c) => c.id === 'damage')!;
    expect(damage.places).toHaveLength(PLACES);
    expect(damage.places.map((p) => p.place).slice(0, 4)).toEqual([1, 1, 3, 4]);
    // The earlier game first in a tie.
    expect(damage.places[0].game.gameId).toBe(100);
  });

  it('neu: Spiel der letzten sieben Tage', () => {
    const fresh = entry(4, 9, 5, { at: NOW - FRESH_MS + 1000 });
    const old = entry(5, 10, 6, { at: NOW - FRESH_MS - 1000 });
    const damage = recordsView([fresh, old], NOW).find((c) => c.id === 'damage')!;
    expect(damage.places.map((p) => [p.puuid, p.fresh])).toEqual([
      [pid(5), false],
      [pid(4), true],
    ]);
  });

  it('nur Werte, die Seite braucht: kein PUUID fremder Mitspieler, Name aus dem Profil', () => {
    const view = recordsView(games, NOW, new Map([[pid(1), { name: 'Neu#EUW', icon: 7 }]]));
    const text = JSON.stringify(view);
    expect(text).not.toContain(pid(99));
    const top = view.find((c) => c.id === 'damage')!.places[0];
    expect(top).toMatchObject({ puuid: pid(1), name: 'Neu#EUW', icon: 7 });
    expect(Object.keys(top.game).sort()).toEqual([
      'at',
      'champion',
      'championId',
      'championName',
      'gameId',
      'seconds',
      'skin',
    ]);
  });

  it('ohne Spiele keine Plätze', () => {
    expect(recordsView([], NOW).every((c) => c.places.length === 0)).toBe(true);
  });
});
