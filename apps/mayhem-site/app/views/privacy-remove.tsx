'use client';
// Not being named: a Riot ID from one game disappears from every page and the API (POST
// /api/ausblenden). The game comes prefilled from the link on a game page (?game=<id>, older
// links ?spiel=<id>).
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { MAX_RIOT_ID } from '../../src/hidden';
import { apiError } from '../ui/data';

/** "https://…/game/123?p=…", "…/de/spiel/123" or "123" → 123; null when no game ID is in it. */
function gameIdOf(value: string): number | null {
  const match = value.match(/\/(?:game|spiel)\/(\d{1,13})(?:[/?#]|$)/) ?? value.trim().match(/^(\d{1,13})$/);
  return match ? Number(match[1]) : null;
}

export default function HidePage() {
  const params = useSearchParams();
  const [game, setGame] = useState(params.get('game') ?? params.get('spiel') ?? '');
  const [name, setName] = useState('');
  const [state, setState] = useState<{ busy: boolean; done: boolean; error: string }>({ busy: false, done: false, error: '' });

  const submit = async () => {
    const gameId = gameIdOf(game);
    if (!gameId)
      return setState({
        busy: false,
        done: false,
        error: 'Please enter the link or the number of a game.',
      });
    setState({ busy: true, done: false, error: '' });
    try {
      const response = await fetch('/api/ausblenden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, name: name.trim() }),
      });
      const result = (await response.json()) as { error?: string };
      setState({
        busy: false,
        done: response.ok,
        error: response.ok ? '' : result.error ? apiError(result.error) : "That didn't work.",
      });
    } catch {
      setState({ busy: false, done: false, error: 'No connection. Please try again.' });
    }
  };

  return (
    <article className="prose">
      <h1>Hide name.</h1>
      <p>
        Enter a game you played in and your Riot ID. After that your name and your player page no longer appear on any page or in any API response, not in the leaderboard or search either, in all games, including future ones. Your values stay anonymous in the games, where the champion is shown instead of your name.
      </p>
      {state.done ? (
        <div className="notice" role="status">
          Done. Your name is hidden.{' '}
          <Link href="/leaderboard">To the leaderboard</Link>
        </div>
      ) : (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label>
            Game (link or number)
            <input value={game} onChange={(e) => setGame(e.target.value)} required maxLength={200} inputMode="url" />
          </label>
          <label>
            Riot ID
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
          <button className="button primary" disabled={state.busy}>
            {state.busy ? 'One moment …' : 'Hide name'}
          </button>
        </form>
      )}
      <h2>Good to know</h2>
      <ul>
        <li>
          Only the PUUID from the game is stored, not your name. That way it stays hidden even after you rename.
        </li>
        <li>
          Anyone who uploads with blank. has a profile and deletes it in blank. with their own key. If you upload with blank. later, you will be named again.
        </li>
        <li>
          Once hidden, the Mayhem app no longer uploads your games by itself, and uploading with it does not unhide you.
        </li>
        <li>
          {'Unhiding is only possible through the operator, via an issue in the '}
          <a href="https://github.com/maltekruse23-oss/blank/issues">repository</a>.
        </li>
      </ul>
      <p>
        <Link href="/privacy">Back to privacy</Link>
      </p>
    </article>
  );
}
