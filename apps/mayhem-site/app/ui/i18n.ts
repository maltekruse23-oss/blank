// The language of the page being shown, for client components (pure helpers in ./lang).
import { usePathname } from 'next/navigation';
import { agoIn, dateIn, href, langOf, numberIn, seasonIn, text } from './lang';

export * from './lang';

/** Language, text picker, link helper and formats of the page being shown (client components). */
export function useLang() {
  const lang = langOf(usePathname() ?? '/');
  return {
    lang,
    t: text(lang),
    href: (path: string) => href(lang, path),
    num: numberIn(lang),
    date: dateIn(lang),
    ago: agoIn(lang),
    season: seasonIn(lang),
  };
}
