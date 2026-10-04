import type { Metadata } from 'next';
import './globals.css';
import { Nav, Search } from './ui/header';

export const metadata: Metadata = {
  title: 'blank. Mayhem · Rangliste für ARAM: Mayhem',
  description:
    'Ränge, Noten und Rekorde für ARAM: Mayhem. Jede Partie bekommt eine Note von F bis MAYHEM – egal ob Sieg oder Niederlage.',
  icons: { icon: '/favicon.svg' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <a className="sr" href="#inhalt">
          Zum Inhalt
        </a>
        <header className="site-head">
          <div className="wrap">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- plain link, no client router needed */}
            <a className="brand" href="/">
              <span>
                blank<b>.</b>
              </span>
              <small>MAYHEM</small>
            </a>
            <Nav />
            <Search />
          </div>
        </header>
        <main id="inhalt" className="wrap">
          {children}
        </main>
        <footer className="site-foot">
          <div className="wrap">
            <nav aria-label="Rechtliches">
              <a href="/datenschutz">Datenschutz</a>
              <a href="/api-guide">API</a>
              <a href="/api/export" download="blank-mayhem.json">
                Datenexport
              </a>
              <a href="https://github.com/maltekruse23-oss/blank">Quellcode</a>
            </nav>
            <p>
              blank. Mayhem ist ein inoffizielles Fanprojekt und wird von Riot Games weder unterstützt
              noch gesponsert; es gibt nicht die Ansichten von Riot Games oder von Personen wieder, die
              offiziell an Riot-Games-Produkten beteiligt sind. Riot Games, League of Legends und alle
              zugehörigen Marken sind Marken oder eingetragene Marken von Riot Games, Inc. Ränge und
              Noten hier sind eine eigene Wertung und haben nichts mit der offiziellen Rangliste zu
              tun.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
