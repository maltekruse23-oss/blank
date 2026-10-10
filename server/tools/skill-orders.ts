// Writes src/features/aram/skillOrders.ts: which ability ARAM Mayhem players max first, second and
// third per champion, read from aramkit.com's champion pages (user's choice 10.10.2026, the one
// exception to "kein Scraping": only here, never in the app at runtime). One pass, one page every
// 2-3 s, stops at once when aramkit refuses (403/429/503 or a Cloudflare challenge; never bypassed)
// and keeps the old file when more than 10 % of the pages fail. Run again each patch:
//   node server/tools/skill-orders.ts
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

type Key = 'Q' | 'W' | 'E';
export type Row = { order: `${Key}>${Key}>${Key}`; pick: number; win: number };
export type Page = { patch: string; date: string; orders: Row[] };

const SITE = 'https://aramkit.com';
const AGENT = 'blank-mayhem-skill-orders/1.0 (+https://github.com/maltekruse23-oss/blank)';
/** Orders fewer players take are noise for a three-icon hint. */
const MIN_PICK = 0.05;
const KEEP = 3;
const MAX_FAILED = 0.1;

const ORDER = /^([QWE])>([QWE])>([QWE])$/;
const share = (percent: string) => Math.round(Number(percent) * 10) / 1000;

/** One champion page: the data version and the max orders (at least 5 % pick, top 3 by pick rate),
 * or null when the page does not have them (changed layout, error page). */
export function parsePage(html: string): Page | null {
  const patch = /aramKitDataVersions:\{latest:"(\d+\.\d+)"/.exec(html)?.[1];
  const date =
    patch &&
    new RegExp(
      `version:"${patch.replace('.', '\\.')}"[^}]*?dataDate:"(\\d{4}-\\d{2}-\\d{2})"`,
    ).exec(html)?.[1];
  if (!patch || !date) return null;
  const starts = [...html.matchAll(/<strong class="skill-order( [^"]*)?" aria-label="([^"]*)"/g)];
  const rows: Row[] = [];
  // Pick share of every listed row, max order or not: aramkit lists only 5 orders per champion.
  const listed = new Map<string, number>();
  for (const [i, m] of starts.entries()) {
    if (m[1]?.includes('summary-skill-order')) continue; // the "Best skill order" box repeats a row
    // The row's own numbers come before the next row (or the next list on the page).
    const from = m.index + m[0].length;
    const nextRow = html.indexOf('detail-list-row', from);
    const end = Math.min(
      starts[i + 1]?.index ?? Infinity,
      nextRow < 0 ? Infinity : nextRow,
      from + 6000,
    );
    const text = html
      .slice(from, end)
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ');
    const stats = /([\d.]+)% Win rate ([\d.]+)% Pick rate/.exec(text);
    const keys = ORDER.exec(m[2].replace(/&gt;/g, '>'));
    if (!stats) continue;
    listed.set(m[2], share(stats[2]));
    if (!keys || new Set(keys.slice(1)).size !== 3) continue; // R or a repeated key: not a max order
    const order = keys[0] as Row['order'];
    if (rows.some((r) => r.order === order)) continue;
    rows.push({ order, pick: share(stats[2]), win: share(stats[1]) });
  }
  if (rows.length === 0) return null;
  const orders = rows
    .filter((r) => r.pick >= MIN_PICK)
    .sort((a, b) => b.pick - a.pick)
    .slice(0, KEEP);
  // The players in orders the page does not list: as many as the top one → the most picked order
  // may be missing, so no orders at all (never promote a minority order to "Max …").
  const unlisted = 1 - [...listed.values()].reduce((sum, pick) => sum + pick, 0);
  if (orders.length > 0 && unlisted >= orders[0].pick) return { patch, date, orders: [] };
  return { patch, date, orders };
}

async function get(url: string): Promise<Response> {
  const response = await fetch(url, {
    headers: { 'User-Agent': AGENT },
    signal: AbortSignal.timeout(20_000),
  });
  if (
    [403, 429, 503].includes(response.status) ||
    response.headers.get('cf-mitigated') === 'challenge'
  )
    throw new Blocked(`${url}: ${response.status}`);
  return response;
}
class Blocked extends Error {}

async function main() {
  const sitemap = await (await get(`${SITE}/sitemap.xml`)).text();
  const slugs = [
    ...new Set(
      [
        ...sitemap.matchAll(/<loc>https:\/\/aramkit\.com\/en-US\/champions\/([a-z0-9]+)<\/loc>/g),
      ].map((m) => m[1]),
    ),
  ];
  const versions = (await (
    await fetch('https://ddragon.leagueoflegends.com/api/versions.json')
  ).json()) as string[];
  const { data } = (await (
    await fetch(`https://ddragon.leagueoflegends.com/cdn/${versions[0]}/data/en_US/champion.json`)
  ).json()) as { data: Record<string, { id: string; key: string }> };
  const champions = new Map(Object.values(data).map((c) => [c.id.toLowerCase(), c]));
  if (slugs.length < 100) throw new Error(`only ${slugs.length} champions in the sitemap`);

  const found: { id: number; name: string; page: Page }[] = [];
  const failed: string[] = [];
  for (const [i, slug] of slugs.entries()) {
    if (i > 0) await new Promise((done) => setTimeout(done, 2000 + Math.random() * 1000));
    const champion = champions.get(slug);
    try {
      if (!champion) throw new Error('not in Data Dragon');
      const response = await get(`${SITE}/en-US/champions/${slug}`);
      if (!response.ok) throw new Error(`${response.status}`);
      const page = parsePage(await response.text());
      if (!page) throw new Error('no Q/W/E max orders on the page');
      found.push({ id: Number(champion.key), name: champion.id, page });
      console.log(
        `${i + 1}/${slugs.length} ${champion.id}: ${page.orders.map((o) => `${o.order} ${Math.round(o.pick * 100)}%`).join(', ') || '-'}`,
      );
    } catch (error) {
      if (error instanceof Blocked) throw error;
      failed.push(`${slug} (${(error as Error).message})`);
      console.warn(`${i + 1}/${slugs.length} ${slug}: ${(error as Error).message}`);
    }
  }
  if (failed.length > slugs.length * MAX_FAILED)
    throw new Error(`${failed.length} of ${slugs.length} pages failed, old file kept`);
  const [{ patch, date }] = found.map((f) => f.page);
  const other = found.find((f) => f.page.patch !== patch || f.page.date !== date);
  if (other)
    throw new Error(`aramkit changed its data during the run (${other.name}), old file kept`);

  const row = (r: Row) => `{ order: '${r.order}', pick: ${r.pick}, win: ${r.win} }`;
  const entry = ({ id, name, page: { orders } }: (typeof found)[number]) =>
    orders.length === 1
      ? `  ${id}: [${row(orders[0])}], // ${name}`
      : `  ${id}: [\n${orders.map((r) => `    ${row(r)},\n`).join('')}  ], // ${name}`;
  writeFileSync(
    new URL('../../src/features/aram/skillOrders.ts', import.meta.url),
    `// Generated by server/tools/skill-orders.ts from aramkit.com (ARAM Mayhem ${patch}, data of
// ${date}); do not edit by hand.

export type SkillKey = 'Q' | 'W' | 'E';
/** Which ability is maxed first, second and third, e.g. 'E>Q>W'. */
export type SkillOrder = \`\${SkillKey}>\${SkillKey}>\${SkillKey}\`;
/** pick: share of the champion's players who max in this order; win: their win rate (both 0-1). */
export type SkillOrderRow = { order: SkillOrder; pick: number; win: number };
export type SkillOrders = { patch: string; date: string; orders: readonly SkillOrderRow[] };

const PATCH = '${patch}';
const DATE = '${date}';
/** Per champion ID: the orders at least ${MIN_PICK * 100} % of players take, most picked first (at most ${KEEP}). */
const ORDERS: Readonly<Record<number, readonly SkillOrderRow[]>> = {
${found
  .filter((f) => f.page.orders.length > 0)
  .sort((a, b) => a.id - b.id)
  .map(entry)
  .join('\n')}
};

/** The champion's ability max orders on aramkit.com, or undefined without data (then show none). */
export const skillOrderOf = (championId: number): SkillOrders | undefined =>
  ORDERS[championId] && { patch: PATCH, date: DATE, orders: ORDERS[championId] };
`,
  );
  console.log(
    `${found.length} champions from aramkit ${patch} (${date}), ${failed.length} failed${failed.length ? ': ' + failed.join(', ') : ''}; skillOrders.ts written`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error((error as Error).message, '- nothing written');
    process.exitCode = 1;
  });
}
