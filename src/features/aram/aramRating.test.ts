import { describe, expect, it } from 'vitest';
import type { AramEntry, AramSeat } from '../../adapters/aram';
import {
  applyPoints,
  expectedMark,
  markGame,
  MAX_GAIN,
  MAX_LOSS,
  PLACEMENT,
  placementLadder,
  pointsFor,
  rankName,
  rankOf,
  rankResult,
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

describe('Mayhem-Wertung: Ladder wie in LoL', () => {
  it('Stufen mit Divisionen IV–I, oben nur Punkte', () => {
    expect(rankName(rankOf(0))).toBe('D IV');
    expect(rankOf(0).points).toBe(0);
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

  it('Punkte aus Note gegen Erwartung, gedeckelt, nie 0', () => {
    expect(pointsFor(expectedMark(800) + 1, 800)).toBeGreaterThan(0);
    expect(pointsFor(expectedMark(800) - 1, 800)).toBeLessThan(0);
    expect(pointsFor(10, 0)).toBe(MAX_GAIN);
    expect(pointsFor(0, 2800)).toBe(-MAX_LOSS);
    expect(pointsFor(expectedMark(800), 800)).toBe(1);
  });

  it('Aufstieg mit Übertrag, erst auf 0, dann Abstieg auf 75', () => {
    expect(applyPoints(390, 25, 0)).toBe(415);
    expect(applyPoints(510, -20, 0)).toBe(500);
    expect(applyPoints(500, -20, 0)).toBe(475);
    expect(applyPoints(0, -20, 0)).toBe(0);
    expect(applyPoints(2810, -30, 0)).toBe(2800);
    expect(applyPoints(2800, -30, 0)).toBe(2775);
  });

  it('nach einem Stufen-Aufstieg Schutz vor dem Abstieg', () => {
    expect(applyPoints(800, -20, SHIELD_GAMES)).toBe(800);
    expect(applyPoints(800, -20, 0)).toBe(775);
    // Only the tier is shielded, a division inside it is not.
    expect(applyPoints(900, -20, SHIELD_GAMES)).toBe(875);
  });

  it('Einstufung nach 5 Spielen, gedeckelt', () => {
    expect(placementLadder([3, 3, 3, 3, 3])).toBe(0);
    const mid = placementLadder([5, 5, 5, 5, 5]);
    expect(expectedMark(mid)).toBeLessThanOrEqual(5);
    expect(rankOf(placementLadder([10, 10, 10, 10, 10])).tier.id).toBe('s');
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
    expect(a[0].games).toBe(12);
    expect(a[0].rank).not.toBeNull();
    expect(a[0].history[PLACEMENT - 1].change).toBe('placed');
    expect(a[0].history[PLACEMENT].gain).not.toBeNull();
    expect(standings(games.slice(0, PLACEMENT - 1))[0].rank).toBeNull();
  });

  it('Schritt eines Spiels für die Karte: Einstufung, dann Punkte', () => {
    const games = Array.from({ length: 7 }, (_, i) =>
      game({ damage: 30_000 + i * 4_000 }, { gameId: 50 + i, at: 1_790_000_000_000 + i * 1e6 }),
    );
    const third = rankResult(games, 'p1', 52)!;
    expect(third).toMatchObject({ gain: null, after: null, games: 3 });
    const fifth = rankResult(games, 'p1', 54)!;
    expect(fifth.change).toBe('placed');
    expect(fifth.after).not.toBeNull();
    const sixth = rankResult(games, 'p1', 55)!;
    expect(sixth.gain).not.toBeNull();
    expect(sixth.before).toEqual(fifth.after);
    expect(rankResult(games, 'p1', 999)).toBeNull();
    expect(rankResult(games, 'someone else', 55)).toBeNull();
  });

  it('nur Spiele ab Saisonstart', () => {
    const games = [game({}, { at: 100 }), game({}, { gameId: 2, at: 300 })];
    expect(standings(games, 200)[0].games).toBe(1);
  });
});
