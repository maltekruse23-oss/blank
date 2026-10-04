'use client';
// Not being named: a Riot ID from one game disappears from every page and the API (POST
// /api/ausblenden). The game comes prefilled from the link on a game page (?spiel=<id>).
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { MAX_RIOT_ID } from '../../../src/hidden';

/** "https://…/spiel/123?p=…" or "123" → 123; null when no game ID is in it. */
function gameIdOf(value: string): number | null {
  const match = value.match(/\/spiel\/(\d{1,13})(?:[/?#]|$)/) ?? value.trim().match(/^(\d{1,13})$/);
  return match ? Number(match[1]) : null;
}

export default function HidePage() {
  const [game, setGame] = useState(useSearchParams().get('spiel') ?? '');
  const [name, setName] = useState('');
  const [state, setState] = useState<{ busy: boolean; done: boolean; error: string }>({ busy: false, done: false, error: '' });

  const submit = async () => {
    const gameId = gameIdOf(game);
    if (!gameId) return setState({ busy: false, done: false, error: 'Bitte den Link oder die Nummer eines Spiels angeben.' });
    setState({ busy: true, done: false, error: '' });
    try {
      const response = await fetch('/api/ausblenden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, name: name.trim() }),
      });
      const result = (await response.json()) as { error?: string };
      setState({ busy: false, done: response.ok, error: response.ok ? '' : result.error ?? 'Das hat nicht geklappt.' });
    } catch {
      setState({ busy: false, done: false, error: 'Keine Verbindung. Bitte erneut versuchen.' });
    }
  };

  return (
    <article className="prose">
      <span className="eyebrow">BLANK. / DATENSCHUTZ</span>
      <h1>Namen ausblenden.</h1>
      <p>
        Gib ein Spiel an, in dem du mitgespielt hast, und deine Riot-ID. Danach erscheint dein Name auf keiner Seite und
        in keiner Antwort der API mehr, in allen Spielen, auch in künftigen. Deine Werte bleiben anonym in den Spielen,
        dort steht dann der Champion statt deines Namens.
      </p>
      {state.done ? (
        <div className="notice" role="status">
          Erledigt. Dein Name ist ausgeblendet. <Link href="/">Zur Rangliste</Link>
        </div>
      ) : (
        <form
          className="hide-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label>
            Spiel (Link oder Nummer)
            <input value={game} onChange={(e) => setGame(e.target.value)} required maxLength={200} inputMode="url" />
          </label>
          <label>
            Riot-ID
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={MAX_RIOT_ID}
              placeholder="Name#TAG"
              autoComplete="off"
            />
          </label>
          {state.error && (
            <div className="error" role="alert">
              {state.error}
            </div>
          )}
          <button className="button" disabled={state.busy}>
            {state.busy ? 'Einen Moment …' : 'Namen ausblenden'}
          </button>
        </form>
      )}
      <h2>Gut zu wissen</h2>
      <ul>
        <li>Gespeichert wird nur die PUUID aus dem Spiel, nicht dein Name. So bleibt er auch nach einer Umbenennung ausgeblendet.</li>
        <li>
          Wer selbst mit blank. hochlädt, hat ein Profil und löscht es in blank. mit dem eigenen Schlüssel. Lädst du
          später selbst hoch, wirst du wieder genannt.
        </li>
        <li>
          Wieder einblenden geht nur über den Betreiber, per Issue im{' '}
          <a href="https://github.com/maltekruse23-oss/blank/issues">Repository</a>.
        </li>
      </ul>
      <p>
        <Link href="/datenschutz">Zurück zum Datenschutz</Link>
      </p>
    </article>
  );
}
