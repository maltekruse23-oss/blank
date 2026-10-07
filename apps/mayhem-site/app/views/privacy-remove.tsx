'use client';
// Not being named: a Riot ID from one game disappears from every page and the API (POST
// /api/ausblenden). The game comes prefilled from the link on a game page (?game=<id>, older
// links ?spiel=<id>).
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { MAX_RIOT_ID } from '../../src/hidden';
import { apiError } from '../ui/data';
import { useLang } from '../ui/i18n';

/** "https://…/game/123?p=…", "…/de/spiel/123" or "123" → 123; null when no game ID is in it. */
function gameIdOf(value: string): number | null {
  const match = value.match(/\/(?:game|spiel)\/(\d{1,13})(?:[/?#]|$)/) ?? value.trim().match(/^(\d{1,13})$/);
  return match ? Number(match[1]) : null;
}

export default function HidePage() {
  const { t, href } = useLang();
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
        error: t('Please enter the link or the number of a game.', 'Bitte den Link oder die Nummer eines Spiels angeben.'),
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
        error: response.ok ? '' : result.error ? apiError(result.error, t) : t("That didn't work.", 'Das hat nicht geklappt.'),
      });
    } catch {
      setState({ busy: false, done: false, error: t('No connection. Please try again.', 'Keine Verbindung. Bitte erneut versuchen.') });
    }
  };

  return (
    <article className="prose">
      <h1>{t('Hide name.', 'Namen ausblenden.')}</h1>
      <p>
        {t(
          'Enter a game you played in and your Riot ID. After that your name and your player page no longer appear on any page or in any API response, not in the leaderboard or search either, in all games, including future ones. Your values stay anonymous in the games, where the champion is shown instead of your name.',
          'Gib ein Spiel an, in dem du mitgespielt hast, und deine Riot-ID. Danach erscheinen dein Name und deine Spielerseite auf keiner Seite und in keiner Antwort der API mehr, auch nicht in Rangliste und Suche, in allen Spielen, auch in künftigen. Deine Werte bleiben anonym in den Spielen, dort steht dann der Champion statt deines Namens.',
        )}
      </p>
      {state.done ? (
        <div className="notice" role="status">
          {t('Done. Your name is hidden.', 'Erledigt. Dein Name ist ausgeblendet.')}{' '}
          <Link href={href('/leaderboard')}>{t('To the leaderboard', 'Zur Rangliste')}</Link>
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
            {t('Game (link or number)', 'Spiel (Link oder Nummer)')}
            <input value={game} onChange={(e) => setGame(e.target.value)} required maxLength={200} inputMode="url" />
          </label>
          <label>
            {t('Riot ID', 'Riot-ID')}
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
            {state.busy ? t('One moment …', 'Einen Moment …') : t('Hide name', 'Namen ausblenden')}
          </button>
        </form>
      )}
      <h2>{t('Good to know', 'Gut zu wissen')}</h2>
      <ul>
        <li>
          {t(
            'Only the PUUID from the game is stored, not your name. That way it stays hidden even after you rename.',
            'Gespeichert wird nur die PUUID aus dem Spiel, nicht dein Name. So bleibt er auch nach einer Umbenennung ausgeblendet.',
          )}
        </li>
        <li>
          {t(
            'Anyone who uploads with blank. has a profile and deletes it in blank. with their own key. If you upload yourself later, you will be named again.',
            'Wer selbst mit blank. hochlädt, hat ein Profil und löscht es in blank. mit dem eigenen Schlüssel. Lädst du später selbst hoch, wirst du wieder genannt.',
          )}
        </li>
        <li>
          {t('Unhiding is only possible through the operator, via an issue in the ', 'Wieder einblenden geht nur über den Betreiber, per Issue im ')}
          <a href="https://github.com/maltekruse23-oss/blank/issues">{t('repository', 'Repository')}</a>.
        </li>
      </ul>
      <p>
        <Link href={href('/privacy')}>{t('Back to privacy', 'Zurück zum Datenschutz')}</Link>
      </p>
    </article>
  );
}
