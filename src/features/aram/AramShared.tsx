import type { ReactNode } from 'react';
import { Swords } from 'lucide-react';
import { splitRiotId, type AramData, type AramEntry, type AramPlayer } from '../../adapters/aram';
import { RefreshButton } from '../twitch/RefreshButton';
import { countedGames, sinceGames } from './aramStats';
import { day } from './format';
import type { AramHook } from './useAram';
import type { AramGroupHook } from './useAramGroup';
import { AramWebsite } from './AramWebsite';

/** What both ARAM pages (Rang, Rekorde) show: the players on the list and the games that count. */
export type AramView = {
  data: AramData | null;
  me: AramPlayer | null;
  /** The group's members, else the user and the chosen friends. */
  players: AramPlayer[];
  /** Start of the counting (group start or "Neu starten"). */
  since: number | null;
  /** The games that count: of the players on the list, since the start. */
  games: AramEntry[];
};

export function aramView(aram: AramHook, group: AramGroupHook, friends: AramPlayer[]): AramView {
  const data = aram.state.status === 'ready' ? aram.state.data : null;
  const me = data?.me ?? null;
  const players = group.view
    ? group.view.members
    : [...(me ? [me] : []), ...friends.filter((f) => f.puuid !== me?.puuid)];
  const since = group.view ? group.view.since : (data?.since ?? null);
  const games = data ? countedGames(sinceGames(data.games, since), players) : [];
  return { data, me, players, since, games };
}

/** The page's row: its sub-tabs, then how many games count since when, and "Aktualisieren". */
export function AramToolbar({
  aram,
  view,
  children,
}: {
  aram: AramHook;
  view: AramView;
  /** The sub-tabs of the page. */
  children: ReactNode;
}) {
  const { data, games, since } = view;
  return (
    <div className="toolbar aram-toolbar">
      {children}
      {data && (
        <span className="toolbar-count" title="ARAM-Mayhem-Spiele der Spieler auf der Liste">
          <b>{games.length}</b> {games.length === 1 ? 'Spiel' : 'Spiele'}
          {since && ` · seit ${day(since)}`}
        </span>
      )}
      <RefreshButton data={aram} result={aram.state} />
    </div>
  );
}

/** State of the League client and the last sync, the same on both pages. */
export function AramNotes({ aram, view }: { aram: AramHook; view: AramView }) {
  const { state } = aram;
  const { data, players } = view;
  const missing = data
    ? players.filter((p) => data.missing.includes(p.puuid)).map((p) => splitRiotId(p.name).name)
    : [];
  return (
    <>
      <AramWebsite />
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
    </>
  );
}

export function AramEmpty({ client }: { client: boolean }) {
  return (
    <div className="empty-state">
      <Swords size={28} />
      <h2>{client ? 'Noch keine ARAM-Mayhem-Spiele' : 'League-Client öffnen'}</h2>
      {!client && <p>Dann holt blank. eure ARAM-Mayhem-Spiele.</p>}
    </div>
  );
}

/** Alone on the list: a hint with the way to the group (Rang → Gruppe). */
export function AloneNote({ players, onGroup }: { players: AramPlayer[]; onGroup: () => void }) {
  if (players.length >= 2) return null;
  return (
    <p className="aram-note">
      Allein ist es langweilig –{' '}
      <button className="text-link" onClick={onGroup}>
        Freunde hinzufügen
      </button>
    </p>
  );
}
