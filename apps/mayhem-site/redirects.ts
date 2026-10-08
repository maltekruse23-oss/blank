// Old German addresses move permanently (308, query kept) to the English pages. The site is English
// only since 08.10.2026 (user decision); before, German was under /de (07.10.2026) and, before that,
// at the root with these page names. The item pages (/items, /items/<id>) went on 08.10.2026 and
// lead to the tier list. Checked by src/features/aram/siteRedirects.test.ts and
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
  // The item pages went (user, 08.10.2026: "Item-Tab entfernen"); items stay on the tier list.
  ...['/items', '/de/items'].flatMap((from) => [
    { source: from, destination: '/tier-list' },
    { source: `${from}/:rest*`, destination: '/tier-list' },
  ]),
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
