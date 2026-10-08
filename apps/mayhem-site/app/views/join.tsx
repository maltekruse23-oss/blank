'use client';
// The join page (/join): how do I get in? The answer on top (one button, the Collector) with the
// archive's two numbers, then three steps, then what the Collector does and the other ways (blank.,
// inviting friends). All numbers come from the archive (/api/archive/stats); nothing is collected here.
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { step } from '../ui/bits';
import { num } from '../ui/format';
import { APP, COLLECTOR, COLLECTOR_INFO } from '../ui/join';
import { meText } from '../ui/me';

type Archive = { matches: number; players: number };

export default function JoinPage() {
  const [archive, setArchive] = useState<Archive | null>(null);
  // Sent here by a search without a hit (app/ui/header.tsx).
  const searched = useSearchParams().get('name')?.trim().slice(0, 40) ?? '';
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/archive/stats', { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Archive>) : null))
      .then((a) => a && Number.isSafeInteger(a.matches) && Number.isSafeInteger(a.players) && setArchive(a))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return (
    <>
      {searched && (
        <section className="notice" role="status">
          <b>{meText.notFound(searched)}</b> {meText.notFoundLead}
        </section>
      )}

      <section className="tile join-hero in" aria-label="Join">
        <div className="stack">
          <span className="kicker">Join</span>
          <h1>More games, better numbers</h1>
          <p className="lead">
            Every win rate, tier list and build comes from real Mayhem games. The more people join, the more accurate it all gets.
          </p>
          <p>
            <a className="button primary" href={COLLECTOR} download>
              Get the Collector for Windows
            </a>
          </p>
        </div>
        <dl className="facts">
          <div>
            <dt>Games in the archive</dt>
            <dd>{archive ? num(archive.matches) : '–'}</dd>
          </div>
          <div>
            <dt>Players</dt>
            <dd>{archive ? num(archive.players) : '–'}</dd>
          </div>
        </dl>
      </section>

      <section className="section" aria-labelledby="steps">
        <h2 id="steps">How it works</h2>
        <ol className="steps">
          <li>
            <div className="tile in" data-tone="quiet" style={step(1)}>
              <h3>Get the Collector and start it</h3>
              <p>{'Windows warns on the first start because the file is not signed: click "More info", then "Run anyway".'}</p>
            </div>
          </li>
          <li>
            <div className="tile in" data-tone="quiet" style={step(2)}>
              <h3>Open the League client and sign in</h3>
              <p>The Collector finds your Mayhem games among your last 100 games and uploads them.</p>
            </div>
          </li>
          <li>
            <div className="tile in" data-tone="win" style={step(3)}>
              <h3>Done</h3>
              <p>Every new Mayhem game is added by itself. A game counts with all ten players, so it counts for your teammates too.</p>
            </div>
          </li>
        </ol>
      </section>

      <div className="cards">
        <section className="card" aria-labelledby="does">
          <h2 id="does">What the Collector does</h2>
          <ul className="checks">
            <li>It only reads your own match history from the League client on your PC, nothing in the game itself.</li>
            <li>It only takes ARAM: Mayhem and leaves all other games alone.</li>
            <li>
              {"It uploads the full game data as the client shows it. The Riot IDs of all ten players are then public on this site. If you don't want that, you can "}
              <a href="/privacy/remove">hide your name</a>.
            </li>
            <li>It starts with Windows and can be turned off there. Closing it moves it to the system tray.</li>
          </ul>
          <p className="fine">
            <a href={COLLECTOR_INFO}>{'Data & usage'}</a> · <a href="/privacy">Privacy</a> ·{' '}
            <a href="https://github.com/maltekruse23-oss/blank/tree/main/apps/mayhem-collector">Source code</a>
          </p>
        </section>
        <section className="card" aria-labelledby="other">
          <h2 id="other">Already using blank.?</h2>
          <p className="fine">
            {'The blank. app uploads your Mayhem games too, once you click "Hochladen erlauben" (allow uploads) on its ARAM page. Then you don\'t need the Collector.'}
          </p>
          <p>
            <a className="button" href={APP}>
              Get blank.
            </a>
          </p>
          <h2>Invite friends</h2>
          <p className="fine">{"It helps most when your friends join. Everyone brings their own games, including the ones you didn't play together."}</p>
          <p>
            <Share />
          </p>
        </section>
      </div>
    </>
  );
}

/** Shares the link of this page (the system's share sheet when there is one), otherwise copies it. */
function Share() {
  const [done, setDone] = useState(false);
  const share = async () => {
    const url = location.origin + '/join';
    const text = 'Get the Mayhem Collector and your ARAM Mayhem games count too:';
    try {
      if (navigator.share) await navigator.share({ title: 'mayhemstats', text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }
    } catch {
      // Closed share sheet or no clipboard: nothing to do.
    }
  };
  return (
    <button type="button" className="button" onClick={() => void share()}>
      {done ? 'Link copied' : 'Share link'}
    </button>
  );
}
