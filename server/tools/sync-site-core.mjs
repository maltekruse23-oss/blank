// Copies the rating core of the app into the website (apps/mayhem-site), so both compute ranks with
// the same code. The site is deployed from its own folder, so it gets a copy, not an import;
// src/features/aram/siteCore.test.ts fails when the copy is out of date.
// node server/tools/sync-site-core.mjs
import { copyFileSync, rmSync } from 'node:fs';

export const CORE = ['aramRating.ts', 'aramPerformance.ts', 'aramBase.ts', 'championRoles.ts'];
for (const file of CORE) {
  copyFileSync(`src/features/aram/${file}`, `apps/mayhem-site/src/features/aram/${file}`);
}
rmSync('apps/mayhem-site/src/features/aram/aramBias.ts', { force: true });
console.log(`Rechenkern kopiert: ${CORE.join(', ')}`);
