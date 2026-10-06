'use client';
// The join page (/mitmachen): why more games make the numbers better, the collector download with
// what it does, the app as the other way, and a link to pass on. All numbers come from the
// archive (/api/archive/stats); nothing is collected here.
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { de } from '../ui/data';
import { APP, COLLECTOR, COLLECTOR_INFO } from '../ui/join';
import { ME_TEXT } from '../ui/me';

type Archive = { matches: number; players: number };

export default function JoinPage() {
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
          <b>{ME_TEXT.notFound(searched)}</b>
          <p className="muted">{ME_TEXT.notFoundLead}</p>
          <a className="button primary" href={COLLECTOR} download>
            Collector für Windows laden
          </a>
        </section>
      )}

      <section className="start-hero join-hero">
        <span className="eyebrow">ARAM: Mayhem · Mitmachen</span>
        <h1>Mehr Spiele, bessere Zahlen</h1>
        <p className="muted join-lead">
          Jede Siegquote, jede Tier-Liste und jeder Build hier kommt aus echten Mayhem-Spielen. Je
          mehr Leute ihre Spiele beitragen, desto genauer wird alles, auch dein eigener Rang.
        </p>
        <dl className="start-facts">
          <div>
            <dt>Spiele im Archiv</dt>
            <dd className="num">{archive ? de(archive.matches) : '–'}</dd>
          </div>
          <div>
            <dt>Spieler</dt>
            <dd className="num">{archive ? de(archive.players) : '–'}</dd>
          </div>
        </dl>
        <p className="join-actions">
          <a className="button primary" href={COLLECTOR} download>
            Collector für Windows laden
          </a>
          <Share />
        </p>
      </section>

      <div className="grid cols-main">
        <div className="stack">
          <section className="card">
            <h2>So geht&apos;s</h2>
            <ol className="join-steps">
              <li>
                <b>Collector laden und starten.</b> Windows warnt beim ersten Start, weil die Datei
                nicht signiert ist: „Weitere Informationen“ und dann „Trotzdem ausführen“.
              </li>
              <li>
                <b>League-Client öffnen und anmelden.</b> Der Collector findet deine Mayhem-Spiele
                unter den letzten 100 Spielen und lädt sie hoch.
              </li>
              <li>
                <b>Fertig.</b> Ab jetzt kommt jedes neue Mayhem-Spiel von selbst dazu. Ein Spiel
                zählt mit allen zehn Spielern, also auch für deine Mitspieler.
              </li>
            </ol>
          </section>
          <section className="card">
            <h2>Was der Collector macht</h2>
            <ul className="join-list">
              <li>
                Er liest nur deinen eigenen Spielverlauf aus dem League-Client auf deinem PC, nichts
                im Spiel selbst.
              </li>
              <li>Er nimmt nur ARAM: Mayhem. Alle anderen Spiele lässt er liegen.</li>
              <li>
                Hochgeladen werden die vollständigen Spieldaten, wie der Client sie zeigt. Die
                Riot-IDs aller zehn Spieler stehen danach öffentlich auf dieser Seite. Wer das nicht
                will, kann sich <a href="/datenschutz/entfernen">ausblenden</a>.
              </li>
              <li>
                Er startet mit Windows und lässt sich dort abschalten. Schließen legt ihn in den
                Infobereich.
              </li>
            </ul>
            <p className="fine">
              <a href={COLLECTOR_INFO}>Daten &amp; Nutzung</a> ·{' '}
              <a href="/datenschutz">Datenschutz</a> ·{' '}
              <a href="https://github.com/maltekruse23-oss/blank/tree/main/apps/mayhem-collector">
                Quellcode
              </a>
            </p>
          </section>
        </div>
        <aside className="stack">
          <section className="card">
            <h2>Schon blank.?</h2>
            <p className="fine">
              Die App blank. lädt deine Mayhem-Spiele auch hoch, sobald du auf der ARAM-Seite
              „Hochladen erlauben“ klickst. Dann brauchst du den Collector nicht.
            </p>
            <p>
              <a className="button" href={APP}>
                blank. laden
              </a>
            </p>
          </section>
          <section className="card">
            <h2>Freunde einladen</h2>
            <p className="fine">
              Am meisten bringt es, wenn deine Freunde mitmachen. Jeder bringt seine eigenen Spiele
              mit, auch die, in denen ihr nicht zusammen gespielt habt.
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
  const [done, setDone] = useState(false);
  const share = async () => {
    const url = location.origin + '/mitmachen';
    const text = 'Lad dir den Mayhem-Collector, dann zählen deine ARAM-Mayhem-Spiele mit:';
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
      {done ? 'Link kopiert' : 'Link teilen'}
    </button>
  );
}
