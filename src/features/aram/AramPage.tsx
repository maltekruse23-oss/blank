import type { AramAugment, AramEntry, AramPlayer } from '../../adapters/aram';
import { SubTabs, useSubTab } from '../../components/SubTabs';
import { TabContent } from '../../components/TabMotion';
import { AramGameCard } from './AramGameCard';
import type { AramPlayerView } from './AramPlayerDialog';
import { AramRanking } from './AramRanking';
import { AloneNote, AramEmpty, AramNotes, AramToolbar, aramView } from './AramShared';
import { bestGames } from './aramStats';
import type { AramHook } from './useAram';
import type { AramGroupHook } from './useAramGroup';
import { resultView, type AramResultView } from './useAramResult';
import { boardOf, useSiteRanks } from './useSiteRanks';

export type RecordsTab = 'records' | 'best';
const tabs = [
  { id: 'records', name: 'Rekorde' },
  { id: 'best', name: 'Beste Spiele' },
] as const;

/**
 * The records of ARAM Mayhem (the page "Rekorde"): the records by category with the live count-up
 * after new games, and the collection of the best games. The ladder is its own page (Rang).
 */
export function AramPage({
  aram,
  friends,
  onShow,
  onPlayer,
  onGroup,
  group,
}: {
  aram: AramHook;
  /** The group: its members and start instead of the own list (the same for everyone). */
  group: AramGroupHook;
  friends: AramPlayer[];
  /** Shows a game as the card after a game (dialog in the app). */
  onShow: (view: AramResultView) => void;
  /** Opens a player's overview (dialog in the app). */
  onPlayer: (view: AramPlayerView) => void;
  /** Opens the group (Rang → Gruppe), to add friends. */
  onGroup: () => void;
}) {
  const view = aramView(aram, group, friends);
  const site = boardOf(useSiteRanks());
  const { data, me, players, games, since } = view;
  const { tab, dir, choose } = useSubTab<RecordsTab>('aram', tabs, 'records');
  const showGame = (entry: AramEntry) =>
    data && onShow(resultView(entry, { ...data, since }, players, site));
  const showPlayer = (player: AramPlayer) =>
    onPlayer({ player, players, games, meId: me?.puuid ?? null, showGame });

  return (
    <div className="aram-layout">
      <AramToolbar aram={aram} view={view}>
        <SubTabs
          tabs={tabs}
          value={tab}
          onChange={choose}
          label="Bereiche von Rekorde"
          group="records-tab"
        />
      </AramToolbar>
      <AramNotes aram={aram} view={view} />
      {data && (
        <TabContent id={tab} dir={dir} className="aram-tab">
          {tab === 'records' &&
            (players.length === 0 || games.length === 0 ? (
              <AramEmpty client={data.client} />
            ) : (
              <>
                <AloneNote players={players} onGroup={onGroup} />
                <AramRanking
                  players={players}
                  games={games}
                  meId={me?.puuid ?? null}
                  onPlayer={showPlayer}
                />
              </>
            ))}
          {tab === 'best' && (
            <BestGames games={games} players={players} augments={data.augments} onShow={showGame} />
          )}
        </TabContent>
      )}
    </div>
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
  if (best.length === 0) return <AramEmpty client />;
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
