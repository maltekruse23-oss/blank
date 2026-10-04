import { describe, expect, it } from 'vitest';
import type { AramEntry, AramSeat } from '../../adapters/aram';
import { gradeOf, performanceOf, phi } from './aramPerformance';
import {
  applyPoints,
  GAP_SCALE,
  INITIAL_MMR,
  ladderOfMu,
  muOf,
  PLACEMENT,
  PLACEMENT_CAP,
  placementLadder,
  pointsFor,
  rankName,
  rankOf,
  rankResult,
  seasonOf,
  SHIELD_GAMES,
  SKILL_SD,
  standings,
  TAU,
  updateMmr,
} from './aramRating';

// Champion IDs (championRoles.ts): 103 Ahri (Mage), 54 Malphite (Tank), 16 Soraka (Support).
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

const y = (you: Partial<AramSeat>, extra: Partial<AramEntry> = {}) =>
  performanceOf(game(you, extra))!.y;

const strong = { damage: 90_000, kills: 25, assists: 30, deaths: 3 };
const idle = { damage: 3_000, kills: 0, assists: 1, deaths: 10, healed: 0, taken: 5_000 };

describe('Spiel-Note: F bis MAYHEM, stufenlos und fair', () => {
  it('mehr Leistung = höhere Note, jede Stat zählt', () => {
    expect(y(strong)).toBeGreaterThan(y({}));
    expect(y({})).toBeGreaterThan(y(idle));
    expect(y({ damage: 60_000 })).toBeGreaterThan(y({ damage: 30_000 }));
    expect(y({ assists: 40 })).toBeGreaterThan(y({ assists: 20 }));
    expect(y({ deaths: 2 })).toBeGreaterThan(y({ deaths: 14 }));
  });

  it('starkes Spiel hoch, Nichtstun ganz unten', () => {
    expect(performanceOf(game(strong))!.pct).toBeGreaterThan(0.9);
    expect(performanceOf(game(idle))!.pct).toBeLessThan(0.1);
  });

  it('Sieg oder Niederlage ändern nichts', () => {
    expect(y(strong, { win: true })).toBe(y(strong, { win: false }));
  });

  it('die Länge des Spiels ändert nichts (alle Werte größer = gleiche Anteile)', () => {
    const doubled = game(strong, { seconds: 36 * 60 });
    doubled.lobby = doubled.lobby!.map((s) => ({
      ...s,
      kills: s.kills * 2,
      deaths: s.deaths * 2,
      assists: s.assists * 2,
      damage: s.damage * 2,
      taken: s.taken * 2,
      mitigated: s.mitigated * 2,
      healed: s.healed * 2,
      gold: s.gold * 2,
    }));
    expect(performanceOf(doubled)!.y).toBeCloseTo(y(strong), 6);
  });

  it('fast gleiche Spiele bekommen fast gleiche Noten (kein Abgrund wie bei Plätzen)', () => {
    for (const damage of [20_000, 45_000, 80_000])
      expect(Math.abs(y({ damage: damage * 1.01 }) - y({ damage }))).toBeLessThan(0.03);
  });

  it('ein Supporter mit Support-Werten wird nicht für wenig Schaden bestraft', () => {
    // Last place in damage, but the most healing and shielding, many assists, few deaths.
    const support = {
      championId: SUPPORT,
      damage: 2_000,
      kills: 3,
      assists: 38,
      deaths: 4,
      healed: 30_000,
      shielded: 5_000,
      taken: 30_000,
    };
    expect(performanceOf(game(support))!.pct).toBeGreaterThan(0.55);
    // More damage does not make a useless support game better than the support game above.
    const pointless = {
      championId: SUPPORT,
      damage: 30_000,
      kills: 5,
      assists: 8,
      deaths: 12,
      healed: 500,
      taken: 30_000,
    };
    expect(y(support)).toBeGreaterThan(y(pointless));
  });

  it('Noten aus dem Perzentil: F ganz unten, MAYHEM ganz oben', () => {
    expect(gradeOf(0.01)).toBe('F');
    expect(gradeOf(0.5)).toBe('B');
    expect(gradeOf(0.9)).toBe('S');
    expect(gradeOf(0.999)).toBe('MAYHEM');
    for (let p = 0; p < 1; p += 0.01) expect(gradeOf(p)).toBeTruthy();
    expect(phi(0)).toBeCloseTo(0.5, 6);
    expect(phi(1.96)).toBeCloseTo(0.975, 3);
  });

  it('Remake, fehlende Werte zählen nicht, abwesend ist F', () => {
    expect(performanceOf(game(strong, { seconds: 7 * 60 }))).toBeNull();
    expect(performanceOf(game(strong, { lobby: undefined }))).toBeNull();
    const away = performanceOf(game({ ...strong, gold: 2_000 }))!;
    expect(away.grade).toBe('F');
    expect(away.afk).toBe(true);
  });
});

describe('Versteckte Wertung (MMR)', () => {
  it('bewegt sich schon ab Spiel 1 und wird mit jedem Spiel sicherer', () => {
    const first = updateMmr(INITIAL_MMR, 1);
    expect(first.mu).toBeGreaterThan(0.2);
    expect(first.variance).toBeLessThan(INITIAL_MMR.variance);
    let m = first;
    let last = m.variance;
    for (let i = 0; i < 20; i++) {
      m = updateMmr(m, 1);
      expect(m.variance).toBeLessThan(last);
      last = m.variance;
    }
  });

  it('anfangs große Schritte, später kleine', () => {
    const step = (m: typeof INITIAL_MMR) => updateMmr(m, 1).mu - m.mu;
    let m = INITIAL_MMR;
    const early = step(m);
    for (let i = 0; i < 30; i++) m = updateMmr(m, 1);
    expect(early).toBeGreaterThan(step(m) * 3);
  });

  it('nähert sich der echten Leistung', () => {
    let m = INITIAL_MMR;
    for (let i = 0; i < 60; i++) m = updateMmr(m, 0.8);
    expect(m.mu).toBeGreaterThan(0.7);
    expect(m.mu).toBeLessThanOrEqual(0.8);
  });
});

describe('Rang: Stufen, Seltenheit, Punkte', () => {
  it('D bis SS mit Divisionen IV–I, danach offene MP', () => {
    expect(rankName(rankOf(0))).toBe('D IV');
    expect(rankName(rankOf(399))).toBe('D I');
    expect(rankName(rankOf(1750))).toBe('S III');
    expect(rankName(rankOf(2399))).toBe('SS I');
    expect(rankOf(2450)).toMatchObject({ division: null, points: 50 });
    expect(rankName(rankOf(2450))).toBe('SS');
    expect(rankName(rankOf(2800))).toBe('SSS');
    expect(rankName(rankOf(3300))).toBe('MAYHEM');
  });

  it('SSS und MAYHEM so selten wie Grandmaster und Challenger', () => {
    const above = (ladder: number) => 1 - phi(muOf(ladder) / SKILL_SD);
    expect(above(2800)).toBeCloseTo(0.0009, 4);
    expect(above(3200)).toBeCloseTo(0.0003, 4);
    expect(above(2000)).toBeCloseTo(0.0468, 3);
    // From the start of the ladder to the apex, each step is rarer.
    for (let l = 0; l < 3200; l += 100) expect(muOf(l + 100)).toBeGreaterThan(muOf(l));
    expect(ladderOfMu(muOf(1234))).toBeCloseTo(1234, 3);
  });

  it('SSS und MAYHEM nur mit passender, sicherer versteckter Wertung', () => {
    // 800 MP above the apex line, but the hidden rating is only average and uncertain: SS.
    const entries = Array.from({ length: 6 }, (_, i) =>
      game({ ...strong }, { gameId: 10 + i, at: 1_790_000_000_000 + i * 1e6 }),
    );
    const s = standings(entries)[0];
    expect(s.rank!.tier.id).not.toBe('sss');
    expect(s.rank!.tier.id).not.toBe('mayhem');
  });

  it('MP in LoL-Größen: ±25 bis A, ±20 in S/SS, ±30 im Apex', () => {
    const better = (ladder: number, up: boolean) =>
      pointsFor(muOf(ladder) + (up ? TAU : -TAU), ladder, muOf(ladder));
    expect(better(200, true)).toBe(25);
    expect(better(200, false)).toBe(-25);
    expect(better(1700, true)).toBe(20);
    expect(better(2100, false)).toBe(-20);
    expect(better(3000, true)).toBe(30);
  });

  it('versteckte Wertung über dem Rang: etwa +27/−13, darunter +13/−27', () => {
    const ladder = 1700;
    const over = muOf(ladder) + GAP_SCALE;
    const under = muOf(ladder) - GAP_SCALE;
    expect(pointsFor(muOf(ladder) + TAU, ladder, over)).toBe(27);
    expect(pointsFor(muOf(ladder) - TAU, ladder, over)).toBe(-13);
    expect(pointsFor(muOf(ladder) + TAU, ladder, under)).toBe(13);
    expect(pointsFor(muOf(ladder) - TAU, ladder, under)).toBe(-27);
  });

  it('Punkte sind stufenlos: fast gleiche Spiele, fast gleiche Punkte; nie 0', () => {
    const ladder = 1000;
    let last = pointsFor(-3, ladder, muOf(ladder));
    for (let g = -3; g <= 4; g += 0.01) {
      const p = pointsFor(g, ladder, muOf(ladder));
      // Only at the zero line the "never zero" rule jumps from −1 to +1.
      expect(Math.abs(p - last)).toBeLessThanOrEqual(2);
      expect(p).not.toBe(0);
      last = p;
    }
  });

  it('Aufstieg mit Übertrag, Abstieg mit Überlauf (10 − 25 → 85)', () => {
    expect(applyPoints(390, 25, 0, 0)).toBe(415);
    expect(applyPoints(510, -25, 0, 0)).toBe(485);
    expect(rankOf(485).points).toBe(85);
    expect(rankName(rankOf(485))).toBe('C IV');
    expect(applyPoints(0, -25, 0, 0)).toBe(0);
  });

  it('Stufen-Abstieg landet je nach Abstand bei 75, 50 oder 25; Schutz nach Aufstieg', () => {
    expect(applyPoints(810, -25, 0, 0.3)).toBe(775);
    expect(applyPoints(810, -25, 0, -0.3)).toBe(750);
    expect(applyPoints(810, -25, 0, -0.9)).toBe(725);
    expect(applyPoints(810, -25, SHIELD_GAMES, 0)).toBe(800);
    expect(applyPoints(910, -25, SHIELD_GAMES, 0)).toBe(885);
    // From the apex line on only open points count.
    expect(applyPoints(2810, -30, 0, 0)).toBe(2780);
  });
});

describe('Einstufung und Saisons', () => {
  const run = (n: number, you: Partial<AramSeat>, from = 1_790_000_000_000) =>
    Array.from({ length: n }, (_, i) => game(you, { gameId: 100 + i, at: from + i * 3_600_000 }));

  it('sichtbarer Rang erst nach 5 Spielen, die versteckte Wertung läuft ab Spiel 1', () => {
    for (let n = 1; n < PLACEMENT; n++) {
      const s = standings(run(n, strong))[0];
      expect(s.rank).toBeNull();
      expect(s.placed).toBe(n);
      expect(s.hidden.mu).toBeGreaterThan(0);
    }
    const s = standings(run(PLACEMENT, strong))[0];
    expect(s.rank).not.toBeNull();
    expect(s.history[PLACEMENT - 1].change).toBe('placed');
  });

  it('nie höher eingestuft als S I (Emerald I), auch mit Traum-Spielen', () => {
    const dream = { damage: 400_000, kills: 60, assists: 80, deaths: 0, healed: 200_000 };
    const s = standings(run(PLACEMENT, dream))[0];
    expect(s.rank!.ladder).toBeLessThanOrEqual(PLACEMENT_CAP);
    expect(rankName(s.rank!)).toBe('S I');
    expect(placementLadder({ mu: 3, variance: 0.1 })).toBe(PLACEMENT_CAP);
  });

  it('nach der Einstufung gibt es MP, ein starker Spieler klettert', () => {
    const s = standings(run(30, strong))[0];
    expect(s.history[PLACEMENT].gain).not.toBeNull();
    expect(s.rank!.ladder).toBeGreaterThan(s.history[PLACEMENT - 1].after!.ladder);
  });

  it('Sieg oder Niederlage ändern Rang und versteckte Wertung nicht', () => {
    const wins = run(12, strong).map((g) => ({ ...g, win: true }));
    const losses = run(12, strong).map((g) => ({ ...g, win: false }));
    const a = standings(wins)[0];
    const b = standings(losses)[0];
    expect(a.rank).toEqual(b.rank);
    expect(a.hidden).toEqual(b.hidden);
  });

  it('gleiche Spiele in anderer Reihenfolge ergeben bei allen dasselbe', () => {
    const games = Array.from({ length: 14 }, (_, i) =>
      game(
        { damage: 20_000 + ((i * 7) % 5) * 9_000, assists: 10 + ((i * 3) % 7) * 4 },
        { gameId: 10 + i, at: 1_790_000_000_000 + i * 1e6 },
      ),
    );
    expect(standings(games)).toEqual(standings([...games].reverse()));
  });

  it('Durchschnitt der Leistung (Leistungs-Wertung) unabhängig vom Rang', () => {
    const s = standings(run(30, strong))[0];
    expect(s.average!.games).toBe(20);
    expect(s.average!.pct).toBeGreaterThan(0.9);
    expect(standings(run(30, idle))[0].average!.pct).toBeLessThan(0.15);
  });

  it('drei Saisons pro Jahr wie LoL', () => {
    expect(seasonOf(Date.UTC(2026, 0, 7)).id).toBe('2025-3');
    expect(seasonOf(Date.UTC(2026, 0, 8)).id).toBe('2026-1');
    expect(seasonOf(Date.UTC(2026, 3, 29)).id).toBe('2026-2');
    expect(seasonOf(Date.UTC(2026, 8, 30)).id).toBe('2026-3');
  });

  it('Rang bleibt zwischen Saisons, zum neuen Jahr Soft-Reset und neue Einstufung', () => {
    const at = (y: number, m: number, d: number) => Date.UTC(y, m, d);
    const season2 = run(10, strong, at(2026, 4, 1));
    const season3 = run(1, strong, at(2026, 7, 1)).map((g) => ({ ...g, gameId: 500 }));
    const year = run(PLACEMENT, strong, at(2027, 1, 1)).map((g, i) => ({ ...g, gameId: 600 + i }));
    const mid = standings([...season2, ...season3])[0];
    expect(mid.seasons.map((s) => s.season.id)).toEqual(['2026-2']);
    expect(mid.history.at(-1)!.gain).not.toBeNull();
    const first = standings([...season2, ...season3, year[0]])[0];
    expect(first.rank).toBeNull();
    expect(first.placed).toBe(1);
    expect(first.hidden.variance).toBeGreaterThanOrEqual(0.25 - 0.1);
    const placed = standings([...season2, ...season3, ...year])[0];
    expect(placed.rank).not.toBeNull();
    expect(placed.rank!.ladder).toBeLessThanOrEqual(PLACEMENT_CAP);
    expect(placed.seasons[0].season.id).toBe('2026-3');
  });

  it('Schritt eines Spiels für die Karte: Einstufung, dann Punkte', () => {
    const games = run(7, strong);
    expect(rankResult(games, 'p1', 102)).toMatchObject({ gain: null, after: null, games: 3 });
    const fifth = rankResult(games, 'p1', 104)!;
    expect(fifth.change).toBe('placed');
    const sixth = rankResult(games, 'p1', 105)!;
    expect(sixth.gain).not.toBeNull();
    expect(sixth.before).toEqual(fifth.after);
    expect(rankResult(games, 'p1', 999)).toBeNull();
  });

  it('nur Spiele ab Start der Gruppe', () => {
    const games = [
      game({}, { at: 1_790_000_000_000 }),
      game({}, { gameId: 2, at: 1_790_000_100_000 }),
    ];
    expect(standings(games, 1_790_000_050_000)[0].games).toBe(1);
  });
});
