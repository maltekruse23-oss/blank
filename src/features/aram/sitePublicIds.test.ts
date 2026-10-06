import { describe, expect, it } from 'vitest';
import { puuidsIn, withPublicIds } from '../../../apps/mayhem-site/src/public-ids';

// No PUUID leaves the website (apps/mayhem-site/src/public-ids.ts): every one becomes the
// player's public id, wherever it stands in an answer.
const A = 'a'.repeat(36);
const B = 'b'.repeat(36);
const C = 'c'.repeat(36);

describe('public ids on the website', () => {
  const answer = {
    players: [{ puuid: A, name: 'A#1' }, { puuid: 'a7' }],
    game: { puuid: B, with: [{ puuid: C, name: 'C#1' }], named: [{ puuid: null }] },
    sourceHash: 'f'.repeat(64),
    copy: A,
  };

  it('finds every PUUID under a key puuid', () => {
    expect([...puuidsIn(answer)].sort()).toEqual([A, B, C]);
    expect([...puuidsIn(answer, A)].sort()).toEqual([B, C]);
  });

  it('replaces them everywhere, never leaving one without an id', () => {
    const out = withPublicIds(
      answer,
      new Map([
        [A, 'a1'],
        [B, 'a2'],
      ]),
    );
    expect(out.players).toEqual([{ puuid: 'a1', name: 'A#1' }, { puuid: 'a7' }]);
    expect(out.game.puuid).toBe('a2');
    expect(out.game.with[0]).toEqual({ puuid: null, name: 'C#1' });
    expect(out.copy).toBe('a1');
    expect(out.sourceHash).toBe('f'.repeat(64));
    expect(JSON.stringify(out)).not.toMatch(/a{36}|b{36}|c{36}/);
  });

  it('keeps only the PUUID the request named', () => {
    const out = withPublicIds(answer, new Map([[B, 'a2']]), A);
    expect(out.players[0].puuid).toBe(A);
    expect(out.game.puuid).toBe('a2');
  });
});
