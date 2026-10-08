// Number and date formats of the site. English only (user decision 08.10.2026, before: English and
// German under /de); old German addresses move to the English ones (redirects.ts).
export const LOCALE = 'en-US';

/** A number with exactly `digits` decimals (12,345.6). */
export const num = (n: number, digits = 0) =>
  n.toLocaleString(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** A short date (10/07/26). */
export const date = (at: number) => new Date(at).toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: '2-digit' });

/** "Season 3 · 2026" (seasonName in the rating core is the German one the API keeps). */
export const season = (s: { year: number; number: number }) => `Season ${s.number} · ${s.year}`;

/** "5 min ago", older than a month as a date. */
export const ago = (at: number, now: number) => {
  const minutes = Math.round((now - at) / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days >= 30) return date(at);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
};
