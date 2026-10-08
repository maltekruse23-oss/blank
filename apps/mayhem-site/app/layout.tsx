import type { Metadata } from 'next';
import './globals.css';
import { Nav, Search } from './ui/header';

export const metadata: Metadata = {
  title: 'blank. Mayhem · Leaderboard for ARAM: Mayhem',
  description: 'Ranks, grades and records for ARAM: Mayhem. Every game gets a grade from F to MAYHEM, win or lose.',
  icons: { icon: '/favicon.svg' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="sr" href="#content">
          Skip to content
        </a>
        <header className="site-head">
          <div className="wrap">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- plain link, no client router needed */}
            <a className="brand" href="/" aria-label="mayhemstats, start page">
              <span className="brand-mark" aria-hidden>
                m
              </span>
              <span aria-hidden>
                mayhem<b>stats</b>
              </span>
            </a>
            <Nav />
            <Search />
          </div>
        </header>
        <main id="content" className="wrap">
          {children}
        </main>
        <footer className="site-foot">
          <div className="wrap">
            <nav aria-label="More">
              <a href="/scoring">How it works</a>
              <a href="/privacy">Privacy</a>
              <a href="/api-guide">API</a>
              <a href="/api/export" download="blank-mayhem.json">
                Data export
              </a>
              <a href="https://github.com/maltekruse23-oss/blank">Source code (AGPL-3.0)</a>
            </nav>
            <p>
              {"blank. Mayhem isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, League of Legends and all associated properties are trademarks or registered trademarks of Riot Games, Inc. Ranks and grades here are our own rating and have nothing to do with the official ranked ladder."}
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
