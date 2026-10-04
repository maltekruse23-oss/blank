import { describe, expect, it } from 'vitest';
import type { AramEntry } from '../../adapters/aram';
import { archiveEntries, archiveIdOf, mergeEntries, publicId } from '../../../apps/mayhem-site/src/archive-entries';
import { gameView, seatEntry, type RawGame } from '../../../apps/mayhem-site/src/game';
import { standings } from './aramRating';
import { performanceOf } from './aramPerformance';

// Everyone from the archive on the website (apps/mayhem-site/src/archive-entries.ts): every player
// of an archived game as an entry, graded exactly like an upload, linked by a public id, never by
// the PUUID.
const CHAMPS = [103, 54, 16, 22, 1, 2, 3, 4, 5, 6];
const pid = (i: number) => `puuid-${String(i).padStart(30, '0')}`;

function raw(gameId = 7, at = 1_790_000_000_000): RawGame {
  return {
    gameId,
    gameCreation: at,
    gameDuration: 18 * 60,
    gameVersion: '16.19.712.1234',
    participantIdentities: CHAMPS.map((_, i) => ({
      participantId: i + 1,
      player: { puuid: pid(i), gameName: `Spieler ${i}`, tagLine: 'EUW', profileIcon: 4000 + i },
    })),
    participants: CHAMPS.map((championId, i) => ({
      participantId: i + 1,
      teamId: i < 5 ? 100 : 200,
      championId,
      stats: {
        win: i < 5,
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
        item6: 2052,
        pentaKills: i === 9 ? 1 : 0,
        largestMultiKill: i === 9 ? 5 : 2,
        magicDamageDealtToChampions: 12_000,
        playerAugment1: 1001,
        playerAugment2: 1002,
      },
    })),
  };
}

describe('archiveEntries', () => {
  it('gives all ten players their Riot ID, icon and values', () => {
    const list = archiveEntries(raw());
    expect(list).toHaveLength(10);
    expect(list.map((a) => a.puuid)).toEqual(CHAMPS.map((_, i) => pid(i)));
    expect(list[3].name).toBe('Spieler 3#EUW');
    expect(list[3].icon).toBe(4003);
    const e = list[3].entry;
    expect(e.puuid).toBe(pid(3));
    expect(e.win).toBe(true);
    expect(e.kills).toBe(8);
    expect(e.augments).toEqual([1001, 1002]);
    expect(e.items).toEqual([3089, 0, 0, 0, 0, 0, 2052]);
    expect(e.details?.magic).toBe(12_000);
    expect(list[9].entry.pentas).toBe(1);
    expect(list[9].entry.multikill).toBe(5);
  });

  it('ranks the damage among all ten and shares it within the team', () => {
    const list = archiveEntries(raw());
    expect(list[9].entry.damageRank).toBe(1);
    expect(list[0].entry.damageRank).toBe(10);
    const team = [0, 1, 2, 3, 4].reduce((s, i) => s + 20_000 + i * 2_000, 0);
    expect(list[0].entry.teamShare).toBeCloseTo(20_000 / team, 9);
  });

  it('grades every seat exactly like the game page does', () => {
    const list = archiveEntries(raw());
    const view = gameView([], raw(), new Set())!;
    for (const [i, a] of list.entries()) {
      const seat = view.players.findIndex((p) => p.championId === a.entry.championId);
      expect(performanceOf(a.entry)?.pct).toBeCloseTo(performanceOf(seatEntry(view, seat))!.pct, 9);
      expect(a.entry.lobby?.filter((s) => s.you)).toHaveLength(1);
      expect(a.entry.lobby?.[i].you).toBe(true);
    }
  });

  it('builds nothing from an incomplete answer', () => {
    const r = raw();
    r.participants = r.participants.slice(0, 9);
    expect(archiveEntries(r)).toEqual([]);
  });

  it('gives a player without a profile a rank after five archived games', () => {
    const games = [1, 2, 3, 4, 5].map((n) => archiveEntries(raw(n, 1_790_000_000_000 + n * 3_600_000))[2].entry);
    const s = standings(games)[0];
    expect(s.puuid).toBe(pid(2));
    expect(s.games).toBe(5);
    expect(s.rank).not.toBeNull();
  });
});

describe('public ids', () => {
  it('turn an archive number into an id and back', () => {
    expect(publicId(42)).toBe('a42');
    expect(archiveIdOf('a42')).toBe(42);
  });

  it('never read a PUUID or a broken id as one', () => {
    expect(archiveIdOf(pid(1))).toBeNull();
    expect(archiveIdOf('a0')).toBeNull();
    expect(archiveIdOf('a01')).toBeNull();
    expect(archiveIdOf('a')).toBeNull();
    expect(archiveIdOf('a12345678901')).toBeNull();
  });

  it('link everyone on the game page, registered players by PUUID, others by public id', () => {
    const view = gameView([], raw(), new Set([pid(0)]), false, new Set([pid(1)]), new Map(CHAMPS.map((_, i) => [pid(i), publicId(i + 1)])))!;
    const by = (i: number) => view.players.find((p) => p.championId === CHAMPS[i])!;
    expect(by(0).puuid).toBe(pid(0));
    expect(by(1).puuid).toBeNull(); // asked not to be named
    expect(by(1).name).toBeNull();
    expect(by(2).puuid).toBe('a3');
    expect(view.players.every((p) => p.puuid === null || p.puuid === pid(0) || p.puuid.startsWith('a'))).toBe(true);
  });
});

describe('mergeEntries', () => {
  const archived = archiveEntries(raw())[0].entry;

  it('keeps the upload of the same player and game', () => {
    const upload: AramEntry = { ...archived, skin: 3 };
    expect(mergeEntries([upload], [archived])).toEqual([upload]);
  });

  it('takes the archive when only it has the values of all ten', () => {
    const upload: AramEntry = { ...archived, lobby: undefined };
    expect(mergeEntries([upload], [archived])).toEqual([archived]);
  });

  it('adds the other players and sorts like the uploads', () => {
    const others = archiveEntries(raw()).slice(1).map((a) => a.entry);
    const later = archiveEntries(raw(8, 1_790_000_100_000))[0].entry;
    const merged = mergeEntries([later, archived], others);
    expect(merged).toHaveLength(11);
    expect(merged[merged.length - 1]).toBe(later);
  });
});
