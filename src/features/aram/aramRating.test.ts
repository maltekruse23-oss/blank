import { describe, expect, it } from 'vitest';
import type { AramEntry, AramSeat } from '../../adapters/aram';
import {
  applyPoints,
  expectedMark,
  markGame,
  PLACEMENT,
  PLACEMENT_CAP,
  placementLadder,
  pointsFor,
  rankName,
  rankOf,
  rankResult,
  seasonOf,
  SHIELD_GAMES,
  standings,
  WIN_BONUS,
} from './aramRating';

// Champion IDs by role (championRoles.ts): 103 Ahri (Mage), 54 Malphite (Tank), 16 Soraka (Support).
const MAGE = 103;
const TANK = 54;
const SUPPORT = 16;

const seat = (values: Partial<AramSeat> = {}): AramSeat => ({
  team: 100,
  championId: MAGE,
  kills: 8,
  deaths: 8,
  assists: 20,
  damage: 30_000,
  taken: 30_000,
  mitigated: 20_000,
  healed: 5_000,
  shielded: 0,
  gold: 14_000,
  ...values,
});

/** A game of ten: `you` in team 100, the others with ordinary values around yours. */
function game(you: Partial<AramSeat>, extra: Partial<AramEntry> = {}): AramEntry {
  const others = Array.from({ length: 9 }, (_, i) =>
    seat({
      team: i < 4 ? 100 : 200,
      championId: [MAGE, TANK, SUPPORT][i % 3],
      damage: 20_000 + i * 3_000,
      kills: 5 + i,
      deaths: 6 + (i % 4),
      assists: 15 + i,
      taken: 25_000 + i * 2_000,
    }),
  );
  const lobby = [seat({ ...you, you: true }), ...others];
  return {
    gameId: 1,
    at: 1_790_000_000_000,
    seconds: 18 * 60,
    patch: '16.19',
    puuid: 'p1',
    name: 'Eins',
    championId: lobby[0].championId,
    champion: '',
    championName: '',
    win: false,
    kills: lobby[0].kills,
    deaths: lobby[0].deaths,
    assists: lobby[0].assists,
    damage: lobby[0].damage,
    taken: lobby[0].taken,
    healed: lobby[0].healed,
    shielded: lobby[0].shielded,
    gold: lobby[0].gold,
    level: 18,
    items: [],
    augments: [],
    damageRank: 1,
    teamShare: 0.3,
    multikill: 1,
    pentas: 0,
    details: null,
    with: [],
    lobby,
    ...extra,
  };
}

/** Everyone's values times a factor (a longer or shorter game); counts only by whole factors. */
const scaled = (entry: AramEntry, factor: number, seconds: number): AramEntry => ({
  ...entry,
  seconds,
  lobby: entry.lobby!.map((s) => ({
    ...s,
    kills: Number.isInteger(factor) ? s.kills * factor : s.kills,
    deaths: Number.isInteger(factor) ? s.deaths * factor : s.deaths,
    assists: Number.isInteger(factor) ? s.assists * factor : s.assists,
    damage: s.damage * factor,
    taken: s.taken * factor,
    mitigated: s.mitigated * factor,
    healed: s.healed * factor,
    gold: s.gold * factor,
  })),
});

describe('Mayhem-Wertung: Note je Spiel', () => {
  const strong = game({ damage: 60_000, kills: 20, assists: 30, deaths: 5 });

  it('Spiel strecken oder schnell beenden ändert nichts', () => {
    const base = markGame(strong)!.value;
    expect(markGame(scaled(strong, 2, 36 * 60))!.value).toBe(base);
    expect(markGame(scaled(strong, 0.5, 9 * 60))!.value).toBe(base);
  });

  it('Nichtstun lohnt sich nicht, auch ohne Tode', () => {
    const idle = markGame(game({ damage: 4_000, kills: 0, assists: 1, deaths: 0 }))!;
    expect(idle.value).toBeLessThan(2.5);
    expect(markGame(strong)!.value).toBeGreaterThan(7);
  });

  it('nur Schaden farmen trägt höchstens sein Gewicht', () => {
    const farmer = markGame(game({ damage: 200_000, kills: 0, assists: 2, deaths: 25 }))!;
    expect(farmer.value).toBeLessThan(6);
  });

  it('Sieg oder Niederlage ändern die Note nur wenig', () => {
    const lost = markGame(strong)!.value;
    const won = markGame({ ...strong, win: true })!.value;
    expect(Math.round((won - lost) * 10) / 10).toBe(2 * WIN_BONUS);
  });

  it('ein Tank zählt, was er einsteckt, ein Supporter, was er heilt', () => {
    const front = { damage: 12_000, taken: 90_000, mitigated: 80_000, assists: 30, kills: 3 };
    expect(markGame(game({ ...front, championId: TANK }))!.value).toBeGreaterThan(
      markGame(game({ ...front, championId: MAGE }))!.value,
    );
    const care = { damage: 8_000, healed: 60_000, shielded: 20_000, assists: 35, kills: 1 };
    expect(markGame(game({ ...care, championId: SUPPORT }))!.value).toBeGreaterThan(
      markGame(game({ ...care, championId: MAGE }))!.value,
    );
  });

  it('Remake, Abwesenheit und Spiele ohne Werte aller zehn zählen nicht', () => {
    expect(markGame({ ...strong, seconds: 4 * 60 })).toBeNull();
    expect(markGame(game({ gold: 2_000 }))).toBeNull();
    expect(markGame({ ...strong, lobby: undefined })).toBeNull();
  });

  it('die Note liegt immer zwischen 0 und 10', () => {
    for (const you of [
      { damage: 0, kills: 0, assists: 0, deaths: 40 },
      { damage: 1e6, kills: 90, assists: 90, deaths: 0 },
    ]) {
      const mark = markGame(game(you))!;
      expect(mark.value).toBeGreaterThanOrEqual(0);
      expect(mark.value).toBeLessThanOrEqual(10);
    }
  });
});

describe('Mayhem-Wertung: Ladder wie LoL-Ranked 2026', () => {
  it('Stufen mit Divisionen IV–I, oben nur Punkte', () => {
    expect(rankName(rankOf(0))).toBe('D IV');
    expect(rankName(rankOf(399))).toBe('D I');
    expect(rankOf(399).points).toBe(99);
    expect(rankName(rankOf(1650))).toBe('S IV');
    expect(rankName(rankOf(1750))).toBe('S III');
    expect(rankName(rankOf(2800))).toBe('MAYHEM');
    expect(rankOf(3050)).toMatchObject({ division: null, points: 250 });
  });

  it('höherer Rang erwartet mehr', () => {
    for (let l = 0; l < 3600; l += 50)
      expect(expectedMark(l + 50)).toBeGreaterThan(expectedMark(l));
  });

  it('MP in LoL-Größen: etwa ±25 bis S, ±20 in SS/SSS, ±30 in MAYHEM', () => {
    const at = (l: number, above: boolean) =>
      pointsFor(expectedMark(l) + (above ? 0.5 : -0.5), l, 0);
    expect(at(800, true)).toBe(25);
    expect(at(800, false)).toBe(-25);
    expect(at(2100, true)).toBe(20);
    expect(at(2500, false)).toBe(-20);
    expect(at(2900, true)).toBe(30);
  });

  it('Form über dem Rang: mehr Plus, weniger Minus (etwa +27/−13), darunter umgekehrt', () => {
    const l = 2100;
    const good = 1.4;
    expect(pointsFor(expectedMark(l) + 0.2, l, good)).toBe(27);
    expect(pointsFor(expectedMark(l) - 0.2, l, good)).toBe(-13);
    expect(pointsFor(expectedMark(l) + 0.2, l, -good)).toBe(13);
    expect(pointsFor(expectedMark(l) - 0.2, l, -good)).toBe(-27);
    // Never zero, never out of range.
    for (let m = 0; m <= 10; m += 0.5)
      for (const f of [-2, 0, 2]) {
        const p = pointsFor(m, 800, f);
        expect(Math.abs(p)).toBeGreaterThanOrEqual(5);
        expect(Math.abs(p)).toBeLessThanOrEqual(37);
      }
  });

  it('Aufstieg mit Übertrag, Abstieg mit Überlauf (10 − 25 → 85)', () => {
    expect(applyPoints(390, 25, 0, 0)).toBe(415);
    expect(applyPoints(510, -25, 0, 0)).toBe(485);
    expect(rankName(rankOf(485))).toBe('C IV');
    expect(rankOf(485).points).toBe(85);
    expect(applyPoints(0, -25, 0, 0)).toBe(0);
  });

  it('Stufen-Abstieg landet je nach Form bei 75, 50 oder 25', () => {
    expect(applyPoints(810, -25, 0, 0.3)).toBe(775);
    expect(applyPoints(810, -25, 0, -0.5)).toBe(750);
    expect(applyPoints(810, -25, 0, -1.5)).toBe(725);
    expect(applyPoints(2810, -30, 0, 0)).toBe(2775);
  });

  it('nach einem Stufen-Aufstieg Schutz vor dem Stufen-Abstieg', () => {
    expect(applyPoints(810, -25, SHIELD_GAMES, 0)).toBe(800);
    // Inside the tier the overflow still happens.
    expect(applyPoints(910, -25, SHIELD_GAMES, 0)).toBe(885);
  });

  it('Einstufung nach 5 Spielen, höchstens SSS III 80', () => {
    expect(placementLadder([3, 3, 3, 3, 3])).toBe(0);
    const top = rankOf(placementLadder([10, 10, 10, 10, 10]));
    expect(rankName(top)).toBe('SSS III');
    expect(top.points).toBe(80);
  });

  it('drei Saisons pro Jahr wie LoL', () => {
    expect(seasonOf(Date.UTC(2026, 0, 7)).id).toBe('2025-3');
    expect(seasonOf(Date.UTC(2026, 0, 8)).id).toBe('2026-1');
    expect(seasonOf(Date.UTC(2026, 3, 29)).id).toBe('2026-2');
    expect(seasonOf(Date.UTC(2026, 8, 30)).id).toBe('2026-3');
  });

  it('Rang bleibt zwischen Saisons, Soft-Reset und neue Einstufung zum neuen Jahr', () => {
    const at = (y: number, m: number, d: number, i: number) => Date.UTC(y, m, d) + i * 3_600_000;
    const strong = { damage: 90_000, kills: 25, assists: 30, deaths: 3 };
    const season2 = Array.from({ length: 8 }, (_, i) =>
      game(strong, { gameId: 100 + i, at: at(2026, 4, 1, i) }),
    );
    const season3 = [game(strong, { gameId: 200, at: at(2026, 7, 1, 0) })];
    const nextYear = Array.from({ length: 5 }, (_, i) =>
      game(strong, { gameId: 300 + i, at: at(2027, 1, 1, i) }),
    );
    const s3 = standings([...season2, ...season3])[0];
    expect(s3.seasons.map((s) => s.season.id)).toEqual(['2026-2']);
    expect(s3.history.at(-1)!.gain).not.toBeNull();
    const firstOfYear = standings([...season2, ...season3, ...nextYear.slice(0, 1)])[0];
    expect(firstOfYear.rank).toBeNull();
    expect(firstOfYear.placed).toBe(1);
    const placed = standings([...season2, ...season3, ...nextYear])[0];
    expect(placed.rank).not.toBeNull();
    expect(placed.rank!.ladder).toBeLessThanOrEqual(PLACEMENT_CAP);
    expect(placed.seasons[0].season.id).toBe('2026-3');
  });

  it('Siege, Niederlagen und Form', () => {
    const games = Array.from({ length: 8 }, (_, i) =>
      game(
        { damage: 60_000 },
        { gameId: 10 + i, at: 1_790_000_000_000 + i * 1e6, win: i % 2 === 0 },
      ),
    );
    const s = standings(games)[0];
    expect(s.games).toBe(8);
    expect(s.wins).toBe(4);
    expect(s.form).toBeGreaterThanOrEqual(-2);
    expect(s.form).toBeLessThanOrEqual(2);
  });

  it('gleiche Spiele in anderer Reihenfolge ergeben bei allen dasselbe', () => {
    const games = Array.from({ length: 12 }, (_, i) =>
      game(
        { damage: 20_000 + ((i * 7) % 5) * 9_000 },
        { gameId: 10 + i, at: 1_790_000_000_000 + i * 1e6 },
      ),
    );
    const a = standings(games);
    const b = standings([...games].reverse());
    expect(a).toEqual(b);
    expect(a[0].history[PLACEMENT - 1].change).toBe('placed');
    expect(a[0].history[PLACEMENT].gain).not.toBeNull();
    expect(standings(games.slice(0, PLACEMENT - 1))[0].rank).toBeNull();
  });

  it('Schritt eines Spiels für die Karte: Einstufung, dann Punkte', () => {
    const games = Array.from({ length: 7 }, (_, i) =>
      game({ damage: 30_000 + i * 4_000 }, { gameId: 50 + i, at: 1_790_000_000_000 + i * 1e6 }),
    );
    expect(rankResult(games, 'p1', 52)).toMatchObject({ gain: null, after: null, games: 3 });
    const fifth = rankResult(games, 'p1', 54)!;
    expect(fifth.change).toBe('placed');
    const sixth = rankResult(games, 'p1', 55)!;
    expect(sixth.gain).not.toBeNull();
    expect(sixth.before).toEqual(fifth.after);
    expect(rankResult(games, 'p1', 999)).toBeNull();
  });

  it('nur Spiele ab Saisonstart der Gruppe', () => {
    const games = [
      game({}, { at: 1_790_000_000_000 }),
      game({}, { gameId: 2, at: 1_790_000_100_000 }),
    ];
    expect(standings(games, 1_790_000_050_000)[0].games).toBe(1);
  });
});
