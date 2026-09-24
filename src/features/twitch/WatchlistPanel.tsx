import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { GameRef, TwitchAdapter } from '../../adapters/twitch';
import { Badge, Card, ChannelAvatar } from '../../components/ui';
import type { ChannelStatus, TwitchData } from './useTwitch';

function GamePicker({
  adapter,
  channelName,
  exclude,
  onPick,
  onClose,
}: {
  adapter: TwitchAdapter;
  channelName: string;
  exclude: GameRef[];
  onPick: (game: GameRef) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GameRef[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const needle = query.trim();
    if (!needle) {
      setResults(null);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      adapter.searchCategories(needle).then(
        (found) => {
          if (!active) return;
          setResults(found);
          setFailed(false);
        },
        () => active && setFailed(true),
      );
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [adapter, query]);

  const shown = (results ?? []).filter((game) => !exclude.some((e) => e.id === game.id));
  return (
    <div className="game-picker">
      <div className="watchlist-add">
        <label className="search">
          <input
            autoFocus
            aria-label={`Spiel für ${channelName} suchen`}
            placeholder="Spiel suchen …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
          />
        </label>
        <button className="icon-button" aria-label="Spielsuche schließen" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      <div className="game-results">
        {shown.map((game) => (
          <button key={game.id} className="game-option" onClick={() => onPick(game)}>
            <Plus size={12} /> {game.name}
          </button>
        ))}
        {results && shown.length === 0 && <small>Keine Treffer</small>}
        {failed && <small>Suche nicht verfügbar</small>}
      </div>
    </div>
  );
}

function statusText(status: ChannelStatus) {
  switch (status.kind) {
    case 'live':
      return `Live · ${status.stream.game.name}`;
    case 'other-game':
      return `Live · ${status.stream.game.name} · ausgeblendet`;
    case 'offline':
      return 'Offline';
    case 'unknown':
      return 'Status unbekannt';
  }
}

export function WatchlistPanel({ twitch }: { twitch: TwitchData }) {
  const { adapter, entries, update, saveFailed } = twitch;
  const watchlist = entries.map((e) => e.channel);
  const [login, setLogin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    const name = login.trim().toLowerCase();
    if (!name) return;
    if (watchlist.some((c) => c.login === name)) {
      setMessage(`${name} ist bereits ausgewählt.`);
      return;
    }
    if (watchlist.length >= 100) {
      setMessage('Maximal 100 Kanäle.');
      return;
    }
    const found = await adapter.findChannel(name).catch(() => undefined);
    if (found === undefined) setMessage('Kanalsuche gerade nicht verfügbar.');
    else if (found === null)
      setMessage(
        `Kanal „${name}“ nicht gefunden${adapter.source === 'mock' ? ' (Mock-Daten)' : ''}.`,
      );
    else {
      update([...watchlist, { ...found, games: [] }]);
      setLogin('');
      setMessage(null);
    }
  }

  return (
    <div id="watchlist" className="watchlist">
      <Card title="Kanäle">
        <form className="watchlist-add" onSubmit={add}>
          <label className="search">
            <input
              aria-label="Kanalname"
              placeholder="Kanalname, z. B. emberline"
              value={login}
              onChange={(e) => {
                setLogin(e.target.value);
                setMessage(null);
              }}
            />
          </label>
          <button className="filter-button" type="submit" disabled={!login.trim()}>
            <Plus size={16} /> Hinzufügen
          </button>
        </form>
        {message && (
          <p className="form-message" role="status">
            {message}
          </p>
        )}
        {saveFailed && (
          <p className="form-message" role="status">
            Speichern nicht verfügbar.
          </p>
        )}
        {entries.map(({ channel, status }) => {
          const setGames = (games: GameRef[]) =>
            update(watchlist.map((c) => (c.login === channel.login ? { ...c, games } : c)));
          return (
            <div className="watch-row" key={channel.login}>
              <ChannelAvatar
                login={channel.login}
                imageUrl={channel.profileImageUrl}
                muted={status.kind !== 'live'}
              />
              <div className="row-copy">
                <b>{channel.displayName}</b>
                <small>{statusText(status)}</small>
              </div>
              <div className="watch-rule">
                {channel.games.length === 0 ? (
                  <Badge>Alle Spiele</Badge>
                ) : (
                  channel.games.map((game) => (
                    <span className="chip" key={game.id}>
                      {game.name}
                      <button
                        aria-label={`${game.name} bei ${channel.displayName} entfernen`}
                        title="Entfernen"
                        onClick={() => setGames(channel.games.filter((g) => g.id !== game.id))}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))
                )}
                <button
                  className="game-add"
                  aria-label={`Spiel für ${channel.displayName} hinzufügen`}
                  aria-expanded={picking === channel.login}
                  onClick={() => setPicking(picking === channel.login ? null : channel.login)}
                >
                  <Plus size={12} /> Spiel
                </button>
              </div>
              <button
                className="icon-button"
                aria-label={`${channel.displayName} entfernen`}
                title="Entfernen"
                onClick={() => update(watchlist.filter((c) => c.login !== channel.login))}
              >
                <Trash2 size={15} />
              </button>
              {picking === channel.login && (
                <GamePicker
                  adapter={adapter}
                  channelName={channel.displayName}
                  exclude={channel.games}
                  onPick={(game) => setGames([...channel.games, game])}
                  onClose={() => setPicking(null)}
                />
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
