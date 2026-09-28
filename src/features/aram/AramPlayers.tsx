import { useEffect, useState, type ReactNode } from 'react';
import { RotateCcw, Search, UserMinus, UserPlus } from 'lucide-react';
import { day } from './format';
import {
  MAX_ARAM_FRIENDS,
  profileIcon,
  splitRiotId,
  type AramAdapter,
  type AramPlayer,
} from '../../adapters/aram';
import { ChannelAvatar } from '../../components/ui';

type FriendList =
  | { status: 'loading' }
  | { status: 'ready'; list: AramPlayer[] }
  | { status: 'error'; message: string };

function Person({ player, children }: { player: AramPlayer; children?: ReactNode }) {
  const { name, tag } = splitRiotId(player.name);
  return (
    <li className="aram-person">
      <ChannelAvatar login={name} imageUrl={profileIcon(player.icon)} />
      <span className="aram-person-name">
        <b>{name}</b>
        {tag && <small>#{tag}</small>}
      </span>
      {children}
    </li>
  );
}

/** Who is in the leaderboard: the user (from the League client) and up to three friends. */
export function AramPlayers({
  adapter,
  client,
  me,
  friends,
  setFriends,
  since,
  onReset,
}: {
  adapter: AramAdapter;
  client: boolean;
  me: AramPlayer | null;
  friends: AramPlayer[];
  setFriends: (friends: AramPlayer[]) => void;
  /** The leaderboard counts from this moment (ms), if it was started anew. */
  since: number | null;
  onReset: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [list, setList] = useState<FriendList>({ status: 'loading' });
  const [query, setQuery] = useState('');
  const full = friends.length >= MAX_ARAM_FRIENDS;

  // The friend list only while choosing, and only from an open client.
  useEffect(() => {
    if (!client || full) return;
    let active = true;
    setList({ status: 'loading' });
    void adapter.friends().then(
      (found) => active && setList({ status: 'ready', list: found }),
      (error: unknown) =>
        active &&
        setList({
          status: 'error',
          message: typeof error === 'string' ? error : 'Freundesliste nicht verfügbar.',
        }),
    );
    return () => {
      active = false;
    };
  }, [adapter, client, full]);

  const chosen = new Set([me?.puuid, ...friends.map((f) => f.puuid)]);
  const needle = query.trim().toLowerCase();
  const offered =
    list.status === 'ready'
      ? list.list.filter((f) => !chosen.has(f.puuid) && f.name.toLowerCase().includes(needle))
      : [];

  return (
    <div className={`aram-players ${full ? 'full' : ''}`}>
      <section className="card">
        <header className="card-header">
          <h2>In der Rangliste</h2>
          <span className="card-note">
            {friends.length} von {MAX_ARAM_FRIENDS} Freunden
          </span>
        </header>
        <ul className="aram-people">
          {me ? (
            <Person player={me}>
              <span className="aram-you">Du</span>
            </Person>
          ) : (
            <li className="aram-person muted">
              Du – erscheint, sobald der League-Client offen ist
            </li>
          )}
          {friends.map((friend) => (
            <Person key={friend.puuid} player={friend}>
              <button
                className="secondary-button"
                onClick={() => setFriends(friends.filter((f) => f.puuid !== friend.puuid))}
              >
                <UserMinus size={14} />
                Entfernen
              </button>
            </Person>
          ))}
        </ul>
        <div className="aram-reset">
          {confirming ? (
            <>
              <p>Alle bisherigen Spiele löschen und ab jetzt neu zählen?</p>
              <button
                className="secondary-button danger"
                onClick={() => {
                  setResetError(null);
                  void onReset().then(
                    () => setConfirming(false),
                    (error: unknown) =>
                      setResetError(typeof error === 'string' ? error : 'Neustart fehlgeschlagen.'),
                  );
                }}
              >
                <RotateCcw size={14} />
                Neu starten
              </button>
              <button className="text-link" onClick={() => setConfirming(false)}>
                Abbrechen
              </button>
            </>
          ) : (
            <>
              <span>{since ? `Zählt seit ${day(since)}` : 'Zählt alle gefundenen Spiele'}</span>
              <button className="text-link" onClick={() => setConfirming(true)}>
                Rangliste neu starten
              </button>
            </>
          )}
          {resetError && (
            <p className="aram-note" role="status">
              {resetError}
            </p>
          )}
        </div>
      </section>
      {!full && (
        <section className="card aram-choose">
          <header className="card-header">
            <h2>Aus deiner Freundesliste</h2>
          </header>
          {!client ? (
            <p className="aram-note">
              Öffne den League-Client, dann erscheint hier deine Freundesliste.
            </p>
          ) : list.status === 'loading' ? (
            <p className="aram-note" role="status">
              Lädt …
            </p>
          ) : list.status === 'error' ? (
            <p className="aram-note" role="status">
              {list.message}
            </p>
          ) : (
            <>
              <label className="search">
                <Search size={15} />
                <input
                  type="search"
                  value={query}
                  placeholder="Freund suchen"
                  aria-label="Freund suchen"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <ul className="aram-people aram-friend-list">
                {offered.map((friend) => (
                  <Person key={friend.puuid} player={friend}>
                    <button
                      className="secondary-button"
                      onClick={() => setFriends([...friends, friend].slice(0, MAX_ARAM_FRIENDS))}
                    >
                      <UserPlus size={14} />
                      Hinzufügen
                    </button>
                  </Person>
                ))}
                {offered.length === 0 && (
                  <li className="aram-person muted">
                    {needle ? 'Kein Freund passt zur Suche.' : 'Keine weiteren Freunde.'}
                  </li>
                )}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
