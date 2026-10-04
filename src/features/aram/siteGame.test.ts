import { describe, expect, it } from 'vitest';
import type { AramEntry, AramSeat } from '../../adapters/aram';
import { gameView, riotId, seatEntry, type RawGame } from '../../../apps/mayhem-site/src/game';
import { lobbyPerformances } from '../../../apps/mayhem-site/src/insights';
import { performanceOf } from './aramPerformance';

// The website's game page (apps/mayhem-site/src/game.ts): all ten with Riot ID from the archive,
// PUUIDs only of registered players, the same grade for every seat as for one's own.
const CHAMPS = [103, 54, 16, 22, 1, 2, 3, 4, 5, 6];
const pid = (i: number) => `puuid-${String(i).padStart(30, '0')}`;

function raw(duration = 18 * 60): RawGame {
  return {
    gameId: 7,
    gameCreation: 1_790_000_000_000,
    gameDuration: duration,
    gameVersion: '16.19.712.1234',
    participantIdentities: CHAMPS.map((_, i) => ({
      participantId: i + 1,
      player: i === 9 ? { puuid: pid(i), gameName: '', tagLine: '', summonerName: 'Alt' } : { puuid: pid(i), gameName: `Spieler ${i}`, tagLine: 'EUW' },
    })),
    // Red side first: the page still shows blue first.
    participants: CHAMPS.map((championId, i) => ({
      participantId: i + 1,
      teamId: i < 5 ? 200 : 100,
      championId,
      stats: {
        win: i >= 5,
        kills: 5 + i,
        deaths: 6,
        assists: 10 + i,
        totalDamageDealtToChampions: 20_000 + i * 2_000,
        totalDamageTaken: 25_000,
        damageSelfMitigated: 10_000,
        totalHeal: 3_000,
        totalDamageShieldedOnTeammates: 0,
        goldEarned: 13_000 + i * 100,
        champLevel: 18,
        item0: 3089,
        item1: 0,
        item6: 2052,
      },
    })),
  };
}

const seats = (r: RawGame): AramSeat[] =>
  r.participants.map((p, i) => ({
    you: i === 0,
    team: p.teamId,
    championId: p.championId,
    kills: p.stats.kills as number,
    deaths: p.stats.deaths as number,
    assists: p.stats.assists as number,
    damage: p.stats.totalDamageDealtToChampions as number,
    taken: p.stats.totalDamageTaken as number,
    mitigated: p.stats.damageSelfMitigated as number,
    healed: p.stats.totalHeal as number,
    shielded: 0,
    gold: p.stats.goldEarned as number,
  }));

function entry(r: RawGame): AramEntry {
  const lobby = seats(r);
  const me = lobby[0];
  return {
    gameId: r.gameId,
    at: r.gameCreation,
    seconds: r.gameDuration,
    patch: '16.19',
    puuid: pid(0),
    name: 'Spieler 0#EUW',
    championId: me.championId,
    champion: 'Ryze',
    championName: 'Ryze',
    win: false,
    kills: me.kills,
    deaths: me.deaths,
    assists: me.assists,
    damage: me.damage,
    taken: me.taken,
    healed: me.healed,
    shielded: me.shielded,
    gold: me.gold,
    level: 18,
    items: [3089],
    augments: [],
    damageRank: 5,
    teamShare: 0.2,
    multikill: 1,
    pentas: 0,
    details: null,
    with: [
      { puuid: pid(1), name: 'Spieler 1#EUW', champion: 'Malphite', championName: 'Malphite', damage: 22_000, kills: 6, deaths: 6, assists: 11, sameTeam: true },
    ],
    lobby,
  };
}

describe('Website-Spielseite', () => {
  it('Archiv: alle zehn mit Riot-ID, PUUID nur von Registrierten, blaue Seite zuerst', () => {
    const view = gameView([entry(raw())], raw(), new Set([pid(0)]))!;
    expect(view.source).toBe('archive');
    expect(view.players).toHaveLength(10);
    expect(view.players.every((p) => p.name)).toBe(true);
    expect(view.players.map((p) => p.team)).toEqual([100, 100, 100, 100, 100, 200, 200, 200, 200, 200]);
    expect(view.players.filter((p) => p.puuid).map((p) => p.puuid)).toEqual([pid(0)]);
    expect(JSON.stringify(view)).not.toContain(pid(5));
    // The friend has no profile: named, but without PUUID.
    expect(view.named.find((n) => n.champion === 'Malphite')).toEqual({ champion: 'Malphite', name: 'Spieler 1#EUW', puuid: null });
    expect(view.patch).toBe('16.19');
    expect(view.players[0].items).toEqual([3089, 0, 0, 0, 0, 0, 2052]);
  });

  it('Riot-ID: Name#TAG, sonst alter Beschwörername, sonst null', () => {
    expect(riotId({ puuid: 'x', gameName: 'A', tagLine: 'B' })).toBe('A#B');
    expect(riotId({ puuid: 'x', gameName: '', summonerName: 'Alt' })).toBe('Alt');
    expect(riotId({ puuid: 'x' })).toBeNull();
  });

  it('Ältere Antworten mit Millisekunden', () => {
    expect(gameView([], raw(18 * 60 * 1000), new Set())!.seconds).toBe(18 * 60);
  });

  it('Ohne Archiv: Werte aller zehn aus dem Upload, Namen nur von Hochladenden; fehlende Werte null', () => {
    const view = gameView([entry(raw())], null, new Set([pid(0)]))!;
    expect(view.source).toBe('uploads');
    expect(view.players).toHaveLength(10);
    expect(view.players.filter((p) => p.name).map((p) => p.name)).toEqual(['Spieler 0#EUW']);
    const other = view.players.find((p) => !p.name)!;
    expect(other.items).toBeNull();
    expect(other.level).toBeNull();
    expect(gameView([], null, new Set())).toBeNull();
  });

  it('Jeder Sitz bekommt dieselbe Note wie in der Lobby-Ansicht des Profils', () => {
    const e = entry(raw());
    const fromProfile = lobbyPerformances(e);
    const view = gameView([e], null, new Set())!;
    const fromPage = view.players.map((_, i) => performanceOf(seatEntry(view, i)));
    for (const seat of e.lobby!) {
      const a = fromProfile[e.lobby!.indexOf(seat)];
      const b = fromPage[view.players.findIndex((p) => p.championId === seat.championId)];
      expect(b?.grade).toBe(a?.grade);
      expect(b?.pct).toBeCloseTo(a!.pct, 10);
    }
    // And the same through the archive.
    const archived = gameView([e], raw(), new Set())!;
    expect(archived.players.map((_, i) => performanceOf(seatEntry(archived, i))?.grade)).toEqual(
      view.players.map((_, i) => performanceOf(seatEntry(view, i))?.grade),
    );
  });
});
