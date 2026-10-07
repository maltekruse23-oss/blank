// Languages of the site (user's choice 07.10.2026): English at the root, German under /de with
// German page names (/de/rangliste). Every page exists in both; the language comes from the
// address alone, so a link always shows the same language. Texts sit where they are used, as
// pairs t('English', 'Deutsch'); links are written as English addresses and go through href().
export type Lang = 'en' | 'de';
export const LANGS: readonly Lang[] = ['en', 'de'];

/** First path segments whose name differs: English → German. */
const PAGES: Record<string, string> = {
  leaderboard: 'rangliste',
  records: 'rekorde',
  'tier-list': 'tierliste',
  join: 'mitmachen',
  game: 'spiel',
  scoring: 'wertung',
  privacy: 'datenschutz',
};
/** Second segments, only below the page named first. */
const SUBPAGES: Record<string, Record<string, string>> = { privacy: { remove: 'entfernen' } };
const flip = (map: Record<string, string>) => Object.fromEntries(Object.entries(map).map(([en, de]) => [de, en]));
const PAGES_DE = flip(PAGES);
const SUBPAGES_DE: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(SUBPAGES).map(([en, map]) => [PAGES[en] ?? en, flip(map)]),
);

/** The language of an address ("/de", "/de/rangliste?x" → de; everything else en). */
export const langOf = (path: string): Lang => (/^\/de(?=$|[/?#])/.test(path) ? 'de' : 'en');

const split = (path: string) => {
  const at = path.search(/[?#]/);
  return at < 0 ? [path, ''] : [path.slice(0, at), path.slice(at)];
};

/** Renames the first (and for some pages the second) segment of a path without language prefix. */
const rename = (path: string, pages: Record<string, string>, subpages: Record<string, Record<string, string>>) => {
  const parts = path.split('/');
  const first = parts[1] ?? '';
  if (parts[2] !== undefined && subpages[first]?.[parts[2]]) parts[2] = subpages[first][parts[2]];
  if (pages[first]) parts[1] = pages[first];
  return parts.join('/');
};

/** An English address in `lang`: href('de', '/leaderboard?season=x') → '/de/rangliste?season=x'. */
export function href(lang: Lang, path: string): string {
  if (lang === 'en' || !path.startsWith('/') || path.startsWith('/api/')) return path;
  const [base, rest] = split(path);
  return (base === '/' ? '/de' : '/de' + rename(base, PAGES, SUBPAGES)) + rest;
}

/** The English address of any address of the site ("/de/spiel/5?p=a1" → "/game/5?p=a1"). */
export function english(path: string): string {
  if (langOf(path) === 'en') return path;
  const [base, rest] = split(path);
  const plain = base.slice(3) || '/';
  return rename(plain, PAGES_DE, SUBPAGES_DE) + rest;
}

/** The same page in another language (the switch in the header). */
export const switchTo = (path: string, lang: Lang) => href(lang, english(path));

/** Picks the text of a language: t('Leaderboard', 'Rangliste'). */
export const text = (lang: Lang) => (en: string, de: string) => (lang === 'de' ? de : en);

/** Number and date formats of a language. */
export const locale = (lang: Lang) => (lang === 'de' ? 'de-DE' : 'en-US');

/** A number in the language's format, with exactly `digits` decimals. */
export const numberIn = (lang: Lang) => (n: number, digits = 0) =>
  n.toLocaleString(locale(lang), { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** A short date (07.10.26 / 10/07/26). */
export const dateIn = (lang: Lang) => (at: number) =>
  new Date(at).toLocaleDateString(locale(lang), { day: '2-digit', month: '2-digit', year: '2-digit' });

/** "Season 3 · 2026" / "Saison 3 · 2026" (seasonName in the rating core is the German one). */
export const seasonIn = (lang: Lang) => (season: { year: number; number: number }) =>
  `${lang === 'de' ? 'Saison' : 'Season'} ${season.number} · ${season.year}`;

/** "5 min ago" / "vor 5 min", older than a month as a date. */
export const agoIn = (lang: Lang) => (at: number, now: number) => {
  const t = text(lang);
  const minutes = Math.round((now - at) / 60000);
  if (minutes < 60) return t(`${Math.max(1, minutes)} min ago`, `vor ${Math.max(1, minutes)} min`);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t(`${hours} h ago`, `vor ${hours} h`);
  const days = Math.round(hours / 24);
  if (days >= 30) return dateIn(lang)(at);
  return t(`${days} ${days === 1 ? 'day' : 'days'} ago`, `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`);
};
