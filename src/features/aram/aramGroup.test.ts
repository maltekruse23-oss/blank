import { describe, expect, it } from 'vitest';
import type { AramEntry, AramPlayer } from '../../adapters/aram';
import {
  byName,
  formatGroupCode,
  gameQuality,
  isGroupCode,
  readGroupMessage,
} from '../../adapters/aramGroup';
import { categories, ranking } from './aramCategories';
import { between, ease } from './aramRace';
import { sinceGames } from './aramStats';

const NOW = Date.UTC(2026, 8, 29, 18);
const player = (n: number, name: string): AramPlayer => ({
  puuid: `${n}`.padStart(36, 'p'),
  name: `${name}#EUW`,
  icon: n,
});
const game = (p: AramPlayer, gameId: number, damage: number, at = NOW - 3_600_000): AramEntry => ({
  gameId,
  at,
  seconds: 1200,
  patch: '16.19',
  puuid: p.puuid,
  name: p.name,
  championId: 10,
  champion: 'Kayle',
  championName: 'Kayle',
  win: true,
  kills: 10,
  deaths: 5,
  assists: 20,
  damage,
  taken: 20_000,
  healed: 5_000,
  shielded: 0,
  gold: 12_000,
  level: 18,
  items: [],
  augments: [],
  damageRank: 1,
  teamShare: 0.3,
  multikill: 2,
  pentas: 0,
  details: null,
  with: [],
});

describe('ARAM-Gruppe', () => {
  it('Code: nur exakt formatiert und mit passenden Prüfzeichen', () => {
    const code = formatGroupCode('7F3K9QDXWD');
    expect(isGroupCode(code)).toBe(true);
    expect(isGroupCode(code.toLowerCase())).toBe(false);
    expect(isGroupCode(code.slice(0, -1) + (code.endsWith('0') ? '1' : '0'))).toBe(false);
    expect(isGroupCode('')).toBe(false);
  });

  it('Nachrichten nur passend zu ihrem Platz und mit echten Zeiten', () => {
    const me = player(1, 'Nova');
    expect(readGroupMessage('r', { v: 1, t: 'reset', since: NOW, at: NOW }, NOW)).toEqual({
      t: 'reset',
      since: NOW,
      at: NOW,
    });
    // Wrong place, wrong version, times far off.
    expect(
      readGroupMessage('m/0123456789abcdef', { v: 1, t: 'reset', since: NOW, at: NOW }, NOW),
    ).toBeNull();
    expect(readGroupMessage('r', { v: 2, t: 'reset', since: NOW, at: NOW }, NOW)).toBeNull();
    expect(readGroupMessage('r', { v: 1, t: 'reset', since: 5, at: NOW }, NOW)).toBeNull();
    expect(
      readGroupMessage('r', { v: 1, t: 'reset', since: NOW + 2 * 86_400_000, at: NOW }, NOW),
    ).toBeNull();
    // Members are checked like the friends in the settings.
    expect(
      readGroupMessage('m/0123456789abcdef', { v: 1, t: 'member', player: me, at: NOW }, NOW),
    ).toEqual({
      t: 'member',
      player: me,
      at: NOW,
    });
    expect(
      readGroupMessage(
        'm/0123456789abcdef',
        { v: 1, t: 'member', player: { ...me, puuid: '../x' }, at: NOW },
        NOW,
      ),
    ).toBeNull();
    // A game only under its own id.
    const entry = game(me, 4242, 50_000);
    expect(readGroupMessage('g/4242-0123456789abcdef', { v: 1, t: 'game', entry }, NOW)).toEqual({
      t: 'game',
      entry,
    });
    expect(readGroupMessage('g/4243-0123456789abcdef', { v: 1, t: 'game', entry }, NOW)).toBeNull();
    expect(readGroupMessage('r', 'Unsinn', NOW)).toBeNull();
  });

  it('die bessere Fassung eines Spiels zählt höher', () => {
    const exact = { ...game(player(1, 'A'), 1, 1), details: { magic: 1 } as AramEntry['details'] };
    expect(gameQuality(exact)).toBe(6);
    expect(gameQuality({ ...exact, details: null })).toBe(4);
    expect(gameQuality({ ...exact, provisional: true })).toBe(2);
    expect(gameQuality({ ...exact, skin: 3 })).toBe(7);
    expect(gameQuality({ ...exact, provisional: true, skin: 3 })).toBeLessThan(gameQuality(exact));
    const lobby = [{ team: 100, championId: 1 } as NonNullable<AramEntry['lobby']>[number]];
    expect(gameQuality({ ...exact, lobby })).toBe(8);
    expect(gameQuality({ ...exact, lobby: [] })).toBe(6);
  });

  it('bei allen dieselbe Rangliste, egal in welcher Reihenfolge die Daten kamen', () => {
    const [a, b, c] = [player(1, 'kiro'), player(2, 'Lumen'), player(3, 'Nova')];
    const games = [game(a, 1, 40_000), game(b, 1, 40_000), game(c, 2, 70_000)];
    const damage = categories.find((cat) => cat.id === 'damage')!;
    const here = ranking(damage, [c, a, b].sort(byName), games);
    const there = ranking(damage, [b, c, a].sort(byName), [...games].reverse());
    expect(here.map((r) => [r.player.puuid, r.value])).toEqual(
      there.map((r) => [r.player.puuid, r.value]),
    );
    // A tie keeps the same order everywhere (by name, not "me first").
    expect([b, a].sort(byName).map((p) => p.name)).toEqual(['kiro#EUW', 'Lumen#EUW']);
  });

  it('nur Spiele ab dem Start der Gruppe zählen', () => {
    const a = player(1, 'A');
    const games = [game(a, 1, 1, NOW - 10), game(a, 2, 1, NOW + 10)];
    expect(sinceGames(games, NOW).map((g) => g.gameId)).toEqual([2]);
    expect(sinceGames(games, null)).toHaveLength(2);
  });
});

describe('Hochzählen nach einem Spiel', () => {
  it('vom zuletzt gesehenen Wert zum neuen, am Ende genau', () => {
    expect(between(1000, 2000, 0)).toBe(1000);
    expect(between(1000, 2000, 1)).toBe(2000);
    expect(between(null, 2000, 0)).toBe(0);
    const middle = between(1000, 2000, 0.5)!;
    // Fast at first, slow at the end.
    expect(middle).toBeGreaterThan(1500);
    expect(middle).toBeLessThan(2000);
    expect(Number.isInteger(middle)).toBe(true);
    expect(between(1.5, 2.25, 0.5)).not.toBe(Math.round(between(1.5, 2.25, 0.5)!));
    // No value stays no value.
    expect(between(5, null, 0.5)).toBeNull();
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });
});
