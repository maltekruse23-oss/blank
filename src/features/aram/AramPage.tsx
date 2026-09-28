import { useState } from 'react';
import { SlidersHorizontal, Swords } from 'lucide-react';
import {
  splitRiotId,
  type AramAdapter,
  type AramAugment,
  type AramEntry,
  type AramPlayer,
} from '../../adapters/aram';
import { Reveal } from '../../components/Reveal';
import { TabContent, TabPill } from '../../components/TabMotion';
import { RefreshButton } from '../twitch/RefreshButton';
import { AramGameCard } from './AramGameCard';
import { AramPlayers } from './AramPlayers';
import { AramRanking, CategoryChoice } from './AramRanking';
import { defaultCategories, type CategoryId } from './aramCategories';
import { bestGames, countedGames } from './aramStats';
import { day } from './format';
import type { AramHook } from './useAram';
import { resultView, type AramResultView } from './useAramResult';

type Tab = 'ranking' | 'best' | 'players';
const tabs: { id: Tab; name: string }[] = [
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
  chosen,
  setChosen,
  onShow,
}: {
  aram: AramHook;
  adapter: AramAdapter;
  friends: AramPlayer[];
  setFriends: (friends: AramPlayer[]) => void;
  /** Categories of the leaderboard (settings). */
  chosen: CategoryId[];
  setChosen: (chosen: CategoryId[]) => void;
  /** Shows a game as the card after a game (dialog in the app). */
  onShow: (view: AramResultView) => void;
}) {
  const [choosing, setChoosing] = useState(false);
  const { state } = aram;
  const data = state.status === 'ready' ? state.data : null;
  const me = data?.me ?? null;
  const players = [...(me ? [me] : []), ...friends.filter((f) => f.puuid !== me?.puuid)];
  const games = data ? countedGames(data.games, players) : [];
  const [view, setView] = useState<{ tab: Tab; dir: number }>({
    tab: friends.length === 0 ? 'players' : 'ranking',
    dir: 1,
  });
  const index = (tab: Tab) => tabs.findIndex((t) => t.id === tab);
  const choose = (tab: Tab) => setView((v) => ({ tab, dir: index(tab) >= index(v.tab) ? 1 : -1 }));
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
            {data.since && ` · seit ${day(data.since)}`}
          </span>
        )}
        {view.tab === 'ranking' && (
          <button
            className={`filter-button icon-only ${choosing ? 'selected' : ''}`}
            aria-label="Kategorien wählen"
            title="Kategorien wählen"
            aria-expanded={choosing}
            onClick={() => setChoosing(!choosing)}
          >
            <SlidersHorizontal size={16} />
          </button>
        )}
        <RefreshButton data={aram} result={state} />
      </div>
      <Reveal show={choosing && view.tab === 'ranking'}>
        <div className="aram-choice-panel">
          <CategoryChoice chosen={chosen} onChange={setChosen} />
          <button className="text-link" onClick={() => setChosen(defaultCategories)}>
            Standard
          </button>
        </div>
      </Reveal>
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
          {view.tab === 'ranking' && (
            <Ranking
              players={players}
              games={games}
              meId={me?.puuid ?? null}
              client={data.client}
              chosen={chosen}
              onPlayers={() => choose('players')}
            />
          )}
          {view.tab === 'best' && (
            <BestGames
              games={games}
              players={players}
              augments={data.augments}
              onShow={(entry) => onShow(resultView(entry, data, friends))}
            />
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
  chosen,
  onPlayers,
}: {
  players: AramPlayer[];
  games: AramEntry[];
  meId: string | null;
  client: boolean;
  chosen: CategoryId[];
  onPlayers: () => void;
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
      <AramRanking chosen={chosen} players={players} games={games} meId={meId} />
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
