import { describe, expect, it } from 'vitest';
import { CONSENT, found, findView } from './findRank';

// "Find my Mayhem rank" (findRank.ts): what the click's answer shows and what the button says.
const board = JSON.stringify({ players: [] });
const profile = JSON.stringify({
  puuid: 'a7',
  id: 'a7',
  name: 'Me#EUW',
  icon: 1,
  rank: null,
  games: 0,
  wins: 0,
  placed: 0,
  climbing: false,
  average: null,
  seasons: [],
  history: [],
});

describe('Find my Mayhem rank', () => {
  it('shows the player once the site lists them', () => {
    const next = found({ games: 3, sent: 3, ranks: { name: 'Me#EUW', board, me: profile } });
    expect(next.find).toEqual({ state: 'idle' });
    expect(next.me).toMatchObject({ state: 'ready', name: 'Me#EUW', me: { placed: 0 } });
  });

  it('says why the player is still not listed', () => {
    const none = { name: 'Me#EUW', board, me: null };
    expect(found({ games: 0, sent: 0, ranks: none }).find).toEqual({ state: 'empty' });
    // Games went up (or were there already), but the site does not list the player (renamed, hidden).
    expect(found({ games: 4, sent: 0, ranks: none }).find).toEqual({ state: 'unlisted' });
    expect(found({ games: 4, sent: 0, ranks: none }).me).toMatchObject({ me: null });
  });

  it('leaves a closed client to the pages and turns odd answers into an error', () => {
    expect(found(null)).toEqual({ find: { state: 'idle' }, me: { state: 'closed' } });
    const odd = found({ games: 1, sent: 1, ranks: { name: 'x', board: '<html>', me: null } });
    expect(odd.find.state).toBe('failed');
  });

  it('offers the button with the consent, and again after a failure', () => {
    expect(findView({ state: 'idle' }, true)).toMatchObject({ action: 'find', busy: false });
    expect(CONSENT).toContain('mayhemstats.lol/privacy/remove');
    // The click starts lasting uploads: the line says so.
    expect(CONSENT).toContain('each new Mayhem game uploads by itself');
    expect(findView({ state: 'empty' }, true).action).toBe('retry');
    expect(findView({ state: 'failed', message: 'HTTP 500' }, true)).toMatchObject({
      text: 'HTTP 500',
      action: 'retry',
    });
    // Not found under the current Riot ID: the app cannot tell a new name from a hidden one.
    expect(findView({ state: 'unlisted' }, true)).toMatchObject({ action: 'retry' });
    expect(findView({ state: 'unlisted' }, true).text).toContain('current Riot ID');
  });

  it('counts the games while uploading and says when it is offline', () => {
    expect(findView({ state: 'uploading', done: 0, total: 0 }, true)).toMatchObject({
      text: 'Reading your Mayhem games …',
      busy: true,
      action: null,
    });
    expect(findView({ state: 'uploading', done: 3, total: 12 }, true).text).toBe(
      '3 of 12 Mayhem games …',
    );
    expect(findView({ state: 'failed', message: 'x' }, false).title).toBe("You're offline");
  });
});
