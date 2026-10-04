import { describe, expect, it } from 'vitest';
import type { AramEntry } from '../../adapters/aram';
import {
  augmentUploadSchema,
  decodeBase64,
  iconOf,
  MAX_ICON_BYTES,
  pngSize,
  rawAugments,
} from '../../../apps/mayhem-site/src/augments';
import { gameView, seatEntry, type RawGame } from '../../../apps/mayhem-site/src/game';

// Augment names and icons on the website (apps/mayhem-site/src/augments.ts): blank. sends them from
// the League client; the Site takes only small real PNGs and shows the augments of every seat.
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const DATA = 'data:image/png;base64,';

/** A PNG header claiming the given size (enough for the check, which reads only IHDR). */
function header(width: number, height: number, extra = 0) {
  const bytes = new Uint8Array(33 + extra);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return btoa(String.fromCharCode(...bytes));
}

const puuid = 'p'.repeat(40);

describe('Website-Augments', () => {
  it('Symbol: nur ein kleines echtes PNG als Data-URL', () => {
    expect(pngSize(decodeBase64(PNG_1X1)!)).toEqual({ width: 1, height: 1 });
    expect(iconOf(DATA + PNG_1X1)).toBe(PNG_1X1);
    expect(iconOf(DATA + header(64, 64))).not.toBeNull();
    expect(iconOf(DATA + header(257, 64))).toBeNull();
    expect(iconOf(DATA + header(0, 64))).toBeNull();
    expect(iconOf(DATA + header(64, 64, MAX_ICON_BYTES))).toBeNull();
    expect(iconOf('data:image/svg+xml;base64,' + btoa('<svg/>'))).toBeNull();
    expect(iconOf(DATA + btoa('GIF89a' + 'x'.repeat(40)))).toBeNull();
    expect(iconOf(DATA + 'kein base64!')).toBeNull();
  });

  it('Upload: strenge Prüfung, keine doppelten Augments', () => {
    const one = { id: 7, name: 'Goldrausch', rarity: 'gold', icon: DATA + PNG_1X1 };
    expect(augmentUploadSchema.safeParse({ puuid, augments: [one] }).success).toBe(true);
    expect(augmentUploadSchema.safeParse({ puuid, augments: [one, one] }).success).toBe(false);
    expect(
      augmentUploadSchema.safeParse({ puuid, augments: [{ ...one, name: '<b>x</b>' }] }).success,
    ).toBe(false);
    expect(
      augmentUploadSchema.safeParse({ puuid, augments: [{ ...one, name: '  ' }] }).success,
    ).toBe(false);
    expect(
      augmentUploadSchema.safeParse({ puuid, augments: [{ ...one, rarity: 'kGold' }] }).success,
    ).toBe(false);
    expect(augmentUploadSchema.safeParse({ puuid, augments: [{ ...one, extra: 1 }] }).success).toBe(
      false,
    );
    expect(augmentUploadSchema.safeParse({ puuid, augments: [] }).success).toBe(false);
    expect(augmentUploadSchema.safeParse({ puuid: 'kurz', augments: [one] }).success).toBe(false);
  });

  it('Rohdaten: playerAugment1–6 ohne leere Plätze', () => {
    expect(
      rawAugments({ playerAugment1: 7, playerAugment2: 0, playerAugment3: 9, playerAugment6: 11 }),
    ).toEqual([7, 9, 11]);
    expect(rawAugments({})).toEqual([]);
  });

  it('Spielseite: Augments aller zehn aus dem Archiv, sonst nur der Hochladenden', () => {
    const raw: RawGame = {
      gameId: 7,
      gameCreation: 1_790_000_000_000,
      gameDuration: 18 * 60,
      gameVersion: '16.19.1',
      participantIdentities: [
        { participantId: 1, player: { puuid: 'a', gameName: 'A', tagLine: 'EUW' } },
        { participantId: 2, player: { puuid: 'b', gameName: 'B', tagLine: 'EUW' } },
      ],
      participants: [
        {
          participantId: 1,
          teamId: 100,
          championId: 103,
          stats: { win: true, playerAugment1: 7, playerAugment2: 9 },
        },
        { participantId: 2, teamId: 200, championId: 54, stats: { win: false } },
      ],
    };
    const archived = gameView([], raw, new Set())!;
    expect(archived.players.map((p) => p.augments)).toEqual([[7, 9], []]);
    expect(seatEntry(archived, 0).augments).toEqual([7, 9]);

    const entry = {
      gameId: 7,
      at: 1_790_000_000_000,
      seconds: 1080,
      patch: '16.19',
      puuid: 'a',
      name: 'A#EUW',
      championId: 103,
      champion: 'Ahri',
      championName: 'Ahri',
      win: true,
      kills: 1,
      deaths: 1,
      assists: 1,
      damage: 1,
      taken: 1,
      healed: 1,
      shielded: 0,
      gold: 1,
      level: 18,
      items: [],
      augments: [11, 12],
      damageRank: 1,
      teamShare: 0.2,
      multikill: 0,
      pentas: 0,
      details: null,
      with: [],
      lobby: [
        {
          you: true,
          team: 100,
          championId: 103,
          kills: 1,
          deaths: 1,
          assists: 1,
          damage: 1,
          taken: 1,
          mitigated: 0,
          healed: 1,
          shielded: 0,
          gold: 1,
        },
        {
          team: 200,
          championId: 54,
          kills: 1,
          deaths: 1,
          assists: 1,
          damage: 1,
          taken: 1,
          mitigated: 0,
          healed: 1,
          shielded: 0,
          gold: 1,
        },
      ],
    } as AramEntry;
    const uploads = gameView([entry], null, new Set())!;
    expect(uploads.players.map((p) => p.augments)).toEqual([[11, 12], null]);
    expect(seatEntry(uploads, 1).augments).toEqual([]);
  });
});
