import { describe, expect, it } from 'vitest';
import adapter from '../../adapters/aram.ts?raw';
import siteAdapter from '../../../apps/mayhem-site/src/adapters/aram.ts?raw';

// The website (apps/mayhem-site) must rank with exactly the app's code (user's wish: ranks are the
// same for everyone). After a change here: node server/tools/sync-site-core.mjs
const CORE = ['aramRating.ts', 'aramPerformance.ts', 'aramBase.ts', 'championRoles.ts'];
const app: Record<string, string> = import.meta.glob('./*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const site: Record<string, string> = import.meta.glob(
  '../../../apps/mayhem-site/src/features/aram/*.ts',
  { query: '?raw', import: 'default', eager: true },
);
const text = (s: string | undefined) => (s ?? '').replace(/\r\n/g, '\n');
const siteFile = (file: string) => site[`../../../apps/mayhem-site/src/features/aram/${file}`];

describe('Rechenkern der Website', () => {
  it.each(CORE)('%s ist identisch mit der App', (file) => {
    expect(siteFile(file)).toBeDefined();
    expect(text(siteFile(file))).toBe(text(app[`./${file}`]));
  });

  it('keine alte Rechenkopie mehr', () => {
    expect(Object.keys(site).map((k) => k.split('/').pop())).toEqual(
      expect.not.arrayContaining(['aramBias.ts']),
    );
  });

  it('die Spiel-Typen der Website sind ein Ausschnitt der App', () => {
    expect(text(adapter)).toContain(text(siteAdapter).trim());
  });
});
