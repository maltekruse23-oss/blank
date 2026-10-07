import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { LangSwitch, Nav, Search } from './ui/header';
import { href, text, type Lang } from './ui/lang';

/** The page's language, set by proxy.ts from the address. */
const pageLang = async (): Promise<Lang> => ((await headers()).get('x-site-lang') === 'de' ? 'de' : 'en');

export async function generateMetadata(): Promise<Metadata> {
  const t = text(await pageLang());
  return {
    title: t('blank. Mayhem · Leaderboard for ARAM: Mayhem', 'blank. Mayhem · Rangliste für ARAM: Mayhem'),
    description: t(
      'Ranks, grades and records for ARAM: Mayhem. Every game gets a grade from F to MAYHEM, win or lose.',
      'Ränge, Noten und Rekorde für ARAM: Mayhem. Jede Partie bekommt eine Note von F bis MAYHEM, egal ob Sieg oder Niederlage.',
    ),
    icons: { icon: '/favicon.svg' },
    alternates: { languages: { en: '/', de: '/de' } },
  };
}

export default async function Layout({ children }: { children: React.ReactNode }) {
  const lang = await pageLang();
  const t = text(lang);
  const to = (path: string) => href(lang, path);
  return (
    <html lang={lang}>
      <body>
        <a className="sr" href="#inhalt">
          {t('Skip to content', 'Zum Inhalt')}
        </a>
        <header className="site-head">
          <div className="wrap">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- plain link, no client router needed */}
            <a className="brand" href={to('/')}>
              <span>
                blank<b>.</b>
              </span>
              <small>MAYHEM</small>
            </a>
            <Nav />
            <Search />
            <LangSwitch />
          </div>
        </header>
        <main id="inhalt" className="wrap">
          {children}
        </main>
        <footer className="site-foot">
          <div className="wrap">
            <nav aria-label={t('More', 'Mehr')}>
              <a href={to('/scoring')}>{t('How it works', "So funktioniert's")}</a>
              <a href={to('/privacy')}>{t('Privacy', 'Datenschutz')}</a>
              <a href={to('/api-guide')}>API</a>
              <a href="/api/export" download="blank-mayhem.json">
                {t('Data export', 'Datenexport')}
              </a>
              <a href="https://github.com/maltekruse23-oss/blank">{t('Source code (AGPL-3.0)', 'Quellcode (AGPL-3.0)')}</a>
            </nav>
            <p>
              {t(
                "blank. Mayhem isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, League of Legends and all associated properties are trademarks or registered trademarks of Riot Games, Inc. Ranks and grades here are our own rating and have nothing to do with the official ranked ladder.",
                'blank. Mayhem ist ein inoffizielles Fanprojekt und wird von Riot Games weder unterstützt noch gesponsert; es gibt nicht die Ansichten von Riot Games oder von Personen wieder, die offiziell an Riot-Games-Produkten beteiligt sind. Riot Games, League of Legends und alle zugehörigen Marken sind Marken oder eingetragene Marken von Riot Games, Inc. Ränge und Noten hier sind eine eigene Wertung und haben nichts mit der offiziellen Rangliste zu tun.',
              )}
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
