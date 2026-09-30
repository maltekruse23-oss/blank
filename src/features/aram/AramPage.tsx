import { useState } from 'react';
import { Swords } from 'lucide-react';
import {
  splitRiotId,
  type AramAdapter,
  type AramAugment,
  type AramEntry,
  type AramPlayer,
} from '../../adapters/aram';
import { TabContent, TabPill } from '../../components/TabMotion';
import { RefreshButton } from '../twitch/RefreshButton';
import { AramGameCard } from './AramGameCard';
import type { AramPlayerView } from './AramPlayerDialog';
import { AramPlayers } from './AramPlayers';
import { AramRank } from './AramRank';
import { AramRanking } from './AramRanking';
import { bestGames, countedGames, sinceGames } from './aramStats';
import { day } from './format';
import type { AramHook } from './useAram';
import type { AramGroupHook } from './useAramGroup';
import { resultView, type AramResultView } from './useAramResult';

type Tab = 'rank' | 'ranking' | 'best' | 'players';
const tabs: { id: Tab; name: string }[] = [
  { id: 'rank', name: 'Rang' },
  { id: 'ranking', name: 'Rangliste' },
  { id: 'best', name: 'Beste Spiele' },
  { id: 'players', name: 'Spieler' },
];

/** ARAM Mayhem leaderboard of the user and up to three friends (user's wish), with their best games. */
export function AramPage({
  aram,
  adapter,
  friends,
  setFriends,
  onShow,
  onPlayer,
  group,
}: {
  aram: AramHook;
  /** The group: its members and start instead of the own list (the same for everyone). */
  group: AramGroupHook;
  adapter: AramAdapter;
  friends: AramPlayer[];
  setFriends: (friends: AramPlayer[]) => void;
  /** Shows a game as the card after a game (dialog in the app). */
  onShow: (view: AramResultView) => void;
  /** Opens a player's overview (dialog in the app). */
  onPlayer: (view: AramPlayerView) => void;
}) {
  const { state } = aram;
  const data = state.status === 'ready' ? state.data : null;
  const me = data?.me ?? null;
  const players = group.view
    ? group.view.members
    : [...(me ? [me] : []), ...friends.filter((f) => f.puuid !== me?.puuid)];
  const since = group.view ? group.view.since : (data?.since ?? null);
  const games = data ? countedGames(sinceGames(data.games, since), players) : [];
  const [view, setView] = useState<{ tab: Tab; dir: number }>({
    tab: friends.length === 0 && !group.view ? 'players' : 'rank',
    dir: 1,
  });
  const index = (tab: Tab) => tabs.findIndex((t) => t.id === tab);
  const choose = (tab: Tab) => setView((v) => ({ tab, dir: index(tab) >= index(v.tab) ? 1 : -1 }));
  const showGame = (entry: AramEntry) =>
    data && onShow(resultView(entry, { ...data, since }, players));
  const showPlayer = (player: AramPlayer) =>
    onPlayer({ player, players, games, meId: me?.puuid ?? null, showGame });
  const missing = data
    ? players.filter((p) => data.missing.includes(p.puuid)).map((p) => splitRiotId(p.name).name)
    : [];

  return (
    <div className="aram-layout">
      <div className="toolbar aram-toolbar">
        <div className="aram-tabs" role="tablist" aria-label="Bereiche von ARAM">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={view.tab === t.id}
              className={`filter-button ${view.tab === t.id ? 'selected' : ''}`}
              onClick={() => choose(t.id)}
            >
              {view.tab === t.id && <TabPill group="aram-tab" />}
              <span className="tab-label">{t.name}</span>
            </button>
          ))}
        </div>
        {data && (
          <span className="toolbar-count" title="ARAM-Mayhem-Spiele der Spieler auf der Liste">
            <b>{games.length}</b> {games.length === 1 ? 'Spiel' : 'Spiele'}
            {since && ` · seit ${day(since)}`}
          </span>
        )}
        <RefreshButton data={aram} result={state} />
      </div>
      {state.status === 'ready' && state.staleBecause && (
        <div className="notice" role="status">
          Aktualisierung fehlgeschlagen: {state.staleBecause}
        </div>
      )}
      {data && !data.client && (
        <p className="aram-note" role="status">
          League-Client geschlossen
          {data.syncedAt && ` · Stand ${day(data.syncedAt)}`} · neue Spiele kommen, sobald er offen
          ist.
        </p>
      )}
      {missing.length > 0 && (
        <p className="aram-note" role="status">
          Spielverlauf nicht lesbar: {missing.join(', ')}
        </p>
      )}
      {state.status === 'loading' && (
        <p className="section-note" role="status">
          Lädt …
        </p>
      )}
      {state.status === 'error' && (
        <div className="notice" role="status">
          {state.message}
        </div>
      )}
      {data && (
        <TabContent id={view.tab} dir={view.dir} className="aram-tab">
          {view.tab === 'rank' &&
            (players.length === 0 ? (
              <Empty client={data.client} />
            ) : (
              <AramRank
                players={players}
                games={games}
                meId={me?.puuid ?? null}
                onPlayer={showPlayer}
              />
            ))}
          {view.tab === 'ranking' && (
            <Ranking
              players={players}
              games={games}
              meId={me?.puuid ?? null}
              client={data.client}
              onPlayers={() => choose('players')}
              onPlayer={showPlayer}
            />
          )}
          {view.tab === 'best' && (
            <BestGames games={games} players={players} augments={data.augments} onShow={showGame} />
          )}
          {view.tab === 'players' && (
            <AramPlayers
              adapter={adapter}
              client={data.client}
              me={me}
              friends={friends}
              setFriends={setFriends}
              since={data.since}
              onReset={aram.reset}
              group={group}
            />
          )}
        </TabContent>
      )}
    </div>
  );
}

function Empty({ client }: { client: boolean }) {
  return (
    <div className="empty-state">
      <Swords size={28} />
      <h2>{client ? 'Noch keine ARAM-Mayhem-Spiele' : 'League-Client öffnen'}</h2>
      {!client && <p>Dann holt blank. eure ARAM-Mayhem-Spiele.</p>}
    </div>
  );
}

function Ranking({
  players,
  games,
  meId,
  client,
  onPlayers,
  onPlayer,
}: {
  players: AramPlayer[];
  games: AramEntry[];
  meId: string | null;
  client: boolean;
  onPlayers: () => void;
  onPlayer: (player: AramPlayer) => void;
}) {
  if (players.length === 0 || games.length === 0) return <Empty client={client} />;
  return (
    <>
      {players.length < 2 && (
        <p className="aram-note">
          Allein ist die Rangliste langweilig –{' '}
          <button className="text-link" onClick={onPlayers}>
            Freunde hinzufügen
          </button>
        </p>
      )}
      <AramRanking players={players} games={games} meId={meId} onPlayer={onPlayer} />
    </>
  );
}

function BestGames({
  games,
  players,
  augments,
  onShow,
}: {
  games: AramEntry[];
  players: AramPlayer[];
  augments: Record<string, AramAugment>;
  onShow: (entry: AramEntry) => void;
}) {
  const best = bestGames(games, players);
  if (best.length === 0) return <Empty client />;
  return (
    <ol className="aram-best">
      {best.map((entry, i) => (
        <li key={`${entry.gameId}:${entry.puuid}`}>
          <AramGameCard
            entry={entry}
            place={i + 1}
            augments={augments}
            onShow={() => onShow(entry)}
          />
        </li>
      ))}
    </ol>
  );
}
