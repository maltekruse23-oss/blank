import { describe, expect, it } from 'vitest';
import { isFresh, snapshotKey, SNAPSHOT_TTL } from '../../../apps/mayhem-site/src/snapshot';

// Stored results of the website's reading pages (apps/mayhem-site/src/snapshot.ts).
describe('website snapshots', () => {
  it('keys a page by its path and only the parameters it reads, in a fixed order', () => {
    expect(snapshotKey('/api/start', new URLSearchParams())).toBe('/api/start');
    expect(
      snapshotKey('/api/rekorde', new URLSearchParams('scope=season&group=ABCDEFGHIJKL')),
    ).toBe('/api/rekorde?group=ABCDEFGHIJKL&scope=season');
    expect(
      snapshotKey('/api/rekorde', new URLSearchParams('group=ABCDEFGHIJKL&scope=season')),
    ).toBe('/api/rekorde?group=ABCDEFGHIJKL&scope=season');
    // A cache-busting parameter does not create new rows.
    expect(snapshotKey('/api/leaderboard', new URLSearchParams('x=1&season=v3'))).toBe(
      '/api/leaderboard?season=v3',
    );
  });

  it('serves a snapshot only while nothing was written, the version matches and it is young', () => {
    const s = { version: 3, cursor: 10, at: 1_000 };
    expect(isFresh(s, 1_000, 3, 10)).toBe(true);
    expect(isFresh(s, 1_000 + SNAPSHOT_TTL - 1, 3, 10)).toBe(true);
    expect(isFresh(s, 1_000 + SNAPSHOT_TTL, 3, 10)).toBe(false);
    expect(isFresh(s, 1_000, 3, 11)).toBe(false);
    expect(isFresh(s, 1_000, 4, 10)).toBe(false);
    expect(isFresh(s, 999, 3, 10)).toBe(false);
    expect(isFresh(undefined, 1_000, 3, 10)).toBe(false);
  });
});
