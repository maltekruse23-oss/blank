'use client';
// The join page (/join, /de/mitmachen): why more games make the numbers better, the collector
// download with what it does, the app as the other way, and a link to pass on. All numbers come
// from the archive (/api/archive/stats); nothing is collected here.
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLang } from '../ui/i18n';
import { APP, COLLECTOR, COLLECTOR_INFO } from '../ui/join';
import { meText } from '../ui/me';

type Archive = { matches: number; players: number };

export default function JoinPage() {
  const { t, href, num } = useLang();
  const me = meText(t);
  const [archive, setArchive] = useState<Archive | null>(null);
  // Sent here by a search without a hit (app/ui/header.tsx).
  const searched = useSearchParams().get('name')?.trim().slice(0, 40) ?? '';
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/archive/stats', { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Archive>) : null))
      .then(
        (a) =>
          a && Number.isSafeInteger(a.matches) && Number.isSafeInteger(a.players) && setArchive(a),
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return (
    <>
      {searched && (
        <section className="card join-missing" role="status">
          <b>{me.notFound(searched)}</b>
          <p className="muted">{me.notFoundLead}</p>
          <a className="button primary" href={COLLECTOR} download>
            {t('Get the Collector for Windows', 'Collector für Windows laden')}
          </a>
        </section>
      )}

      <section className="start-hero join-hero">
        <div className="start-ask">
          <h1>{t('More games, better numbers', 'Mehr Spiele, bessere Zahlen')}</h1>
          <p className="muted start-lead">
            {t(
              'Every win rate, tier list and build comes from real Mayhem games. The more people join, the more accurate it all gets.',
              'Jede Siegquote, Tier-Liste und jeder Build kommt aus echten Mayhem-Spielen. Je mehr mitmachen, desto genauer wird alles.',
            )}
          </p>
          <p className="join-actions">
            <a className="button primary" href={COLLECTOR} download>
              {t('Get the Collector', 'Collector laden')}
            </a>
          </p>
        </div>
        <dl className="join-facts">
          <div>
            <dt>{t('Games in the archive', 'Spiele im Archiv')}</dt>
            <dd className="num">{archive ? num(archive.matches) : '–'}</dd>
          </div>
          <div>
            <dt>{t('Players', 'Spieler')}</dt>
            <dd className="num">{archive ? num(archive.players) : '–'}</dd>
          </div>
        </dl>
      </section>

      <div className="grid cols-main">
        <div className="stack">
          <section className="card">
            <h2>{t('How it works', "So geht's")}</h2>
            <ol className="join-steps">
              <li>
                <b>{t('Get the Collector and start it.', 'Collector laden und starten.')}</b>{' '}
                {t(
                  'Windows warns on the first start because the file is not signed: click "More info", then "Run anyway".',
                  'Windows warnt beim ersten Start, weil die Datei nicht signiert ist: „Weitere Informationen“ und dann „Trotzdem ausführen“.',
                )}
              </li>
              <li>
                <b>{t('Open the League client and sign in.', 'League-Client öffnen und anmelden.')}</b>{' '}
                {t(
                  'The Collector finds your Mayhem games among your last 100 games and uploads them.',
                  'Der Collector findet deine Mayhem-Spiele unter den letzten 100 Spielen und lädt sie hoch.',
                )}
              </li>
              <li>
                <b>{t('Done.', 'Fertig.')}</b>{' '}
                {t(
                  'From now on every new Mayhem game is added by itself. A game counts with all ten players, so it counts for your teammates too.',
                  'Ab jetzt kommt jedes neue Mayhem-Spiel von selbst dazu. Ein Spiel zählt mit allen zehn Spielern, also auch für deine Mitspieler.',
                )}
              </li>
            </ol>
          </section>
          <section className="card">
            <h2>{t('What the Collector does', 'Was der Collector macht')}</h2>
            <ul className="join-list">
              <li>
                {t(
                  'It only reads your own match history from the League client on your PC, nothing in the game itself.',
                  'Er liest nur deinen eigenen Spielverlauf aus dem League-Client auf deinem PC, nichts im Spiel selbst.',
                )}
              </li>
              <li>
                {t(
                  'It only takes ARAM: Mayhem and leaves all other games alone.',
                  'Er nimmt nur ARAM: Mayhem. Alle anderen Spiele lässt er liegen.',
                )}
              </li>
              <li>
                {t(
                  "It uploads the full game data as the client shows it. The Riot IDs of all ten players are then public on this site. If you don't want that, you can ",
                  'Hochgeladen werden die vollständigen Spieldaten, wie der Client sie zeigt. Die Riot-IDs aller zehn Spieler stehen danach öffentlich auf dieser Seite. Wer das nicht will, kann sich ',
                )}
                <a href={href('/privacy/remove')}>{t('hide your name', 'ausblenden')}</a>.
              </li>
              <li>
                {t(
                  'It starts with Windows and can be turned off there. Closing it moves it to the system tray.',
                  'Er startet mit Windows und lässt sich dort abschalten. Schließen legt ihn in den Infobereich.',
                )}
              </li>
            </ul>
            <p className="fine">
              <a href={COLLECTOR_INFO}>{t('Data & usage', 'Daten & Nutzung')}</a> ·{' '}
              <a href={href('/privacy')}>{t('Privacy', 'Datenschutz')}</a> ·{' '}
              <a href="https://github.com/maltekruse23-oss/blank/tree/main/apps/mayhem-collector">
                {t('Source code', 'Quellcode')}
              </a>
            </p>
          </section>
        </div>
        <aside className="stack">
          <section className="card">
            <h2>{t('Already using blank.?', 'Schon blank.?')}</h2>
            <p className="fine">
              {t(
                'The blank. app uploads your Mayhem games too, once you click "Hochladen erlauben" (allow uploads) on its ARAM page. Then you don\'t need the Collector.',
                'Die App blank. lädt deine Mayhem-Spiele auch hoch, sobald du auf der ARAM-Seite „Hochladen erlauben“ klickst. Dann brauchst du den Collector nicht.',
              )}
            </p>
            <p>
              <a className="button" href={APP}>
                {t('Get blank.', 'blank. laden')}
              </a>
            </p>
          </section>
          <section className="card">
            <h2>{t('Invite friends', 'Freunde einladen')}</h2>
            <p className="fine">
              {t(
                "It helps most when your friends join. Everyone brings their own games, including the ones you didn't play together.",
                'Am meisten bringt es, wenn deine Freunde mitmachen. Jeder bringt seine eigenen Spiele mit, auch die, in denen ihr nicht zusammen gespielt habt.',
              )}
            </p>
            <p>
              <Share />
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}

/** Shares the link of this page (the system's share sheet when there is one), otherwise copies it. */
function Share() {
  const { t, href } = useLang();
  const [done, setDone] = useState(false);
  const share = async () => {
    const url = location.origin + href('/join');
    const text = t(
      'Get the Mayhem Collector and your ARAM Mayhem games count too:',
      'Lad dir den Mayhem-Collector, dann zählen deine ARAM-Mayhem-Spiele mit:',
    );
    try {
      if (navigator.share) await navigator.share({ title: 'blank. Mayhem', text, url });
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
      {done ? t('Link copied', 'Link kopiert') : t('Share link', 'Link teilen')}
    </button>
  );
}
