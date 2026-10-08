import { describe, expect, it } from 'vitest';
import { ago, num, season } from '../../../apps/mayhem-site/app/ui/format';
import { REDIRECTS } from '../../../apps/mayhem-site/redirects';

/** The site's pages (not loaded, only their paths). */
const PAGES = Object.keys(import.meta.glob('../../../apps/mayhem-site/app/**/page.tsx'));
const APP = '../../../apps/mayhem-site/app/';

/** Where an address goes: first matching rule, like Next (`:rest*` = zero or more segments). */
function follow(path: string): string | null {
  for (const { source, destination } of REDIRECTS) {
    const prefix = source.endsWith('/:rest*') ? source.slice(0, -'/:rest*'.length) : null;
    if (prefix === null) {
      if (path === source) return destination;
    } else if (path.startsWith(prefix + '/')) {
      return destination.replace(':rest*', path.slice(prefix.length + 1));
    }
  }
  return null;
}

describe('website: English only, old German addresses', () => {
  it('moves every German address to its English page', () => {
    expect(follow('/de')).toBe('/');
    expect(follow('/de/rangliste')).toBe('/leaderboard');
    expect(follow('/de/rekorde')).toBe('/records');
    expect(follow('/de/tierliste')).toBe('/tier-list');
    expect(follow('/de/mitmachen')).toBe('/join');
    expect(follow('/de/wertung')).toBe('/scoring');
    expect(follow('/de/datenschutz')).toBe('/privacy');
    expect(follow('/de/datenschutz/entfernen')).toBe('/privacy/remove');
    expect(follow('/de/spiel/8100000000')).toBe('/game/8100000000');
    expect(follow('/de/players/Name-EUW')).toBe('/players/Name-EUW');
    expect(follow('/de/champions/Ashe')).toBe('/champions/Ashe');
    expect(follow('/de/augments/1')).toBe('/augments/1');
    expect(follow('/de/items/3006')).toBe('/items/3006');
    expect(follow('/de/api-guide')).toBe('/api-guide');
    // The German names at the root (before 07.10.2026) go straight to English, not via /de.
    expect(follow('/rangliste')).toBe('/leaderboard');
    expect(follow('/spiel/5')).toBe('/game/5');
    expect(follow('/datenschutz/entfernen')).toBe('/privacy/remove');
  });

  it('leaves English addresses alone', () => {
    for (const path of [
      '/',
      '/leaderboard',
      '/players/de-EUW',
      '/demo',
      '/game/5',
      '/privacy/remove',
      '/api/leaderboard',
    ])
      expect(follow(path)).toBeNull();
  });

  it('only points at pages that exist', () => {
    for (const { destination } of REDIRECTS) {
      const page = destination.replace('/:rest*', '').replace(/^\//, '');
      if (page.startsWith(':')) continue; // the /de catch-all keeps the path
      // A page or pages below it (/game → app/game/[id]/page.tsx; /de/spiel was no page either).
      const dir = `${APP}${page ? page + '/' : ''}`;
      expect(
        PAGES.some((p) => (page ? p.startsWith(dir) : p === dir + 'page.tsx')),
        destination,
      ).toBe(true);
    }
    expect(REDIRECTS.every((r) => r.permanent)).toBe(true);
  });

  it('formats in English', () => {
    expect(num(12345.6, 1)).toBe('12,345.6');
    expect(season({ year: 2026, number: 3 })).toBe('Season 3 · 2026');
    expect(ago(0, 5 * 60000)).toBe('5 min ago');
    expect(ago(0, 2 * 86400000)).toBe('2 days ago');
  });
});
