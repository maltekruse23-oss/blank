import { describe, expect, it } from 'vitest';
import type { AramEntry, AramMate } from '../../adapters/aram';
import { gameView, type RawGame } from '../../../apps/mayhem-site/src/game';
import { findPlayer, riotKey, withoutHidden } from '../../../apps/mayhem-site/src/hidden';

// The website's "Namen ausblenden" (apps/mayhem-site/src/hidden.ts): a Riot ID from one game is
// found by its PUUID and then disappears from game pages and entries; registered players stay named.
const pid = (i: number) => `puuid-${String(i).padStart(30, '0')}`;

const raw: RawGame = {
  gameId: 7,
  gameCreation: 1_790_000_000_000,
  gameDuration: 18 * 60,
  gameVersion: '16.19.712.1234',
  participantIdentities: [0, 1, 2].map((i) => ({
    participantId: i + 1,
    player:
      i === 2
        ? { puuid: pid(i), summonerName: 'Alt Name' }
        : { puuid: pid(i), gameName: `Spieler ${i}`, tagLine: 'EUW' },
  })),
  participants: [0, 1, 2].map((i) => ({
    participantId: i + 1,
    teamId: 100,
    championId: 10 + i,
    stats: { win: true },
  })),
};

const mate = (i: number): AramMate => ({
  puuid: pid(i),
  name: `Freund ${i}#EUW`,
  champion: `Champ${i}`,
  championName: `Champ${i}`,
  damage: 1,
  kills: 0,
  deaths: 0,
  assists: 0,
  sameTeam: true,
});

const entry = (friends: number[]): AramEntry => ({
  gameId: 7,
  at: raw.gameCreation,
  seconds: 1080,
  patch: '16.19',
  puuid: pid(0),
  name: 'Spieler 0#EUW',
  championId: 10,
  champion: 'Champ0',
  championName: 'Champ0',
  win: true,
  kills: 0,
  deaths: 0,
  assists: 0,
  damage: 0,
  taken: 0,
  healed: 0,
  shielded: 0,
  gold: 0,
  level: 18,
  items: [],
  augments: [],
  damageRank: 1,
  teamShare: 0,
  multikill: 0,
  pentas: 0,
  details: null,
  with: friends.map(mate),
});

describe('Website: Namen ausblenden', () => {
  it('Riot-IDs vergleichen ohne Groß-/Kleinschreibung und äußere Leerzeichen', () => {
    expect(riotKey('  Spieler  1 #euw ')).toBe('spieler 1#euw');
    expect(riotKey('Spieler 1#EUW')).toBe(riotKey('spieler 1#euw'));
    expect(riotKey('Alt Name')).toBe('alt name');
    for (const bad of ['', '  ', '#EUW', 'Name#', 'a#b#c', 'x'.repeat(41), 'Na\u0000me#EUW'])
      expect(riotKey(bad)).toBeNull();
  });

  it('findet die PUUID im Archiv, bei Hochladenden und ihren Freunden; der Tag muss stimmen', () => {
    expect(findPlayer('spieler 1#euw', [], raw)).toBe(pid(1));
    expect(findPlayer('Alt Name', [], raw)).toBe(pid(2));
    expect(findPlayer('Freund 5#EUW', [entry([5])], null)).toBe(pid(5));
    expect(findPlayer('Spieler 0#EUW', [entry([])], null)).toBe(pid(0));
    expect(findPlayer('Spieler 1', [], raw)).toBeNull();
    expect(findPlayer('Spieler 1#EUW2', [], raw)).toBeNull();
    expect(findPlayer('Niemand#EUW', [entry([5])], raw)).toBeNull();
  });

  it('entfernt ausgeblendete Freunde aus Einträgen, sonst bleibt der Eintrag gleich', () => {
    const e = entry([5, 6]);
    expect(withoutHidden(e, new Set())).toBe(e);
    expect(withoutHidden(e, new Set([pid(9)]))).toBe(e);
    const out = withoutHidden(e, new Set([pid(5)]));
    expect(out.with.map((m) => m.puuid)).toEqual([pid(6)]);
    expect(e.with).toHaveLength(2);
  });

  it('Spiel-Seite: ausgeblendete Namen fehlen, Registrierte bleiben genannt', () => {
    const view = gameView([entry([1])], raw, new Set([pid(0)]), false, new Set([pid(0), pid(1)]))!;
    expect(view.players.map((p) => p.name)).toEqual(['Spieler 0#EUW', null, 'Alt Name']);
    expect(view.named.map((n) => n.name)).toEqual(['Spieler 0#EUW']);
    expect(JSON.stringify(view)).not.toContain('Spieler 1');
    expect(JSON.stringify(view)).not.toContain(pid(1));
  });
});
