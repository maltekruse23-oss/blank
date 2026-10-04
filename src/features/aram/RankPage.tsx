import type { AramAdapter, AramPlayer } from '../../adapters/aram';
import { SubTabs, useSubTab } from '../../components/SubTabs';
import { TabContent } from '../../components/TabMotion';
import type { AramPlayerView } from './AramPlayerDialog';
import { AramPlayers } from './AramPlayers';
import { AramRank } from './AramRank';
import { AloneNote, AramEmpty, AramNotes, AramToolbar, aramView } from './AramShared';
import type { AramHook } from './useAram';
import type { AramGroupHook } from './useAramGroup';
import { RankHistory } from './RankHistory';
import type { AramResultView } from './useAramResult';
import { resultView } from './useAramResult';
import { boardOf, useSiteRanks, type SiteRanks } from './useSiteRanks';

export type RankTab = 'ladder' | 'mine' | 'group';
const tabs = [
  { id: 'ladder', name: 'Rangliste' },
  { id: 'mine', name: 'Mein Verlauf' },
  { id: 'group', name: 'Gruppe' },
] as const;

/**
 * The Mayhem ladder as its own page (user's wish: Rang not under the ARAM tabs): the ladder of the
 * group, the user's ranked profile with the match history, and the group with the friends.
 */
export function RankPage({
  aram,
  adapter,
  friends,
  setFriends,
  onPlayer,
  onShow,
  group,
}: {
  aram: AramHook;
  adapter: AramAdapter;
  friends: AramPlayer[];
  setFriends: (friends: AramPlayer[]) => void;
  onPlayer: (view: AramPlayerView) => void;
  onShow: (view: AramResultView) => void;
  group: AramGroupHook;
}) {
  const view = aramView(aram, group, friends);
  const ranks = useSiteRanks();
  const site = boardOf(ranks);
  const { data, me, players, games, since } = view;
  // Nobody to compare with yet: the group first.
  const alone = friends.length === 0 && !group.view;
  const { tab, dir, choose } = useSubTab<RankTab>('rank', tabs, alone ? 'group' : 'ladder');
  const showGame = (entry: (typeof games)[number]) =>
    data && onShow(resultView(entry, { ...data, since }, players));
  const showPlayer = (player: AramPlayer) =>
    onPlayer({ player, players, games, meId: me?.puuid ?? null, showGame });

  return (
    <div className="aram-layout">
      <AramToolbar aram={aram} view={view}>
        <SubTabs
          tabs={tabs}
          value={tab}
          onChange={choose}
          label="Bereiche von Rang"
          group="rank-tab"
        />
      </AramToolbar>
      <AramNotes aram={aram} view={view} />
      {data && (
        <TabContent id={tab} dir={dir} className="aram-tab">
          {tab === 'ladder' &&
            (players.length === 0 ? (
              <AramEmpty client={data.client} />
            ) : (
              <>
                <AloneNote players={players} onGroup={() => choose('group')} />
                <SiteNote ranks={ranks} />
                <AramRank
                  players={players}
                  games={games}
                  meId={me?.puuid ?? null}
                  site={site}
                  onPlayer={showPlayer}
                />
              </>
            ))}
          {tab === 'mine' &&
            (me && games.some((g) => g.puuid === me.puuid) ? (
              <RankHistory games={games} puuid={me.puuid} site={site} />
            ) : (
              <AramEmpty client={data.client} />
            ))}
          {tab === 'group' && (
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

/** Where the ranks come from: the website (one truth for everyone) or, without it, this PC. */
function SiteNote({ ranks }: { ranks: SiteRanks }) {
  if (ranks.status === 'ready')
    return (
      <p className="aram-note" role="status">
        Ränge von der Website · Stand{' '}
        {new Date(ranks.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
      </p>
    );
  if (ranks.status === 'error')
    return (
      <p className="aram-note" role="status">
        {ranks.message} Die Ränge sind aus den Spielen auf diesem PC berechnet.
      </p>
    );
  return null;
}
