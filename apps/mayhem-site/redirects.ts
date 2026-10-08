// Old German addresses move permanently (308, query kept) to the English pages. The site is English
// only since 08.10.2026 (user decision); before, German was under /de (07.10.2026) and, before that,
// at the root with these page names. Checked by src/features/aram/siteRedirects.test.ts and
// tests/smoke.mjs.

/** German page names → English ones (the other pages had the same name in both languages). */
export const GERMAN_PAGES: Record<string, string> = {
  rangliste: 'leaderboard',
  rekorde: 'records',
  tierliste: 'tier-list',
  mitmachen: 'join',
  spiel: 'game',
  wertung: 'scoring',
  datenschutz: 'privacy',
};

const MOVES: { source: string; destination: string }[] = [
  { source: '/de', destination: '/' },
  // The one German subpage, before its page.
  { source: '/de/datenschutz/entfernen', destination: '/privacy/remove' },
  { source: '/datenschutz/entfernen', destination: '/privacy/remove' },
  ...Object.entries(GERMAN_PAGES).flatMap(([de, en]) =>
    [`/de/${de}`, `/${de}`].flatMap((from) => [
      { source: from, destination: `/${en}` },
      { source: `${from}/:rest*`, destination: `/${en}/:rest*` },
    ]),
  ),
  // Everything else under /de had the English name already (/de/players/…, /de/champions/…).
  { source: '/de/:rest*', destination: '/:rest*' },
];

/** For next.config.ts: first match wins. */
export const REDIRECTS = MOVES.map((move) => ({ ...move, permanent: true }));
