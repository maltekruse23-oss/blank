import type { CSSProperties } from 'react';
import { splitRiotId, type AramEntry, type AramPlayer } from '../../adapters/aram';
import { PLACEMENT, rankName, standings } from './aramRating';
import { combine, type Last, type Ranked, type SiteBoard } from './aramSite';
import { TrendingUp } from 'lucide-react';
import { ladderPlace, record } from './RankHistory';
import { GradeBadge } from './GradeBadge';
import { TierEmblem } from './TierEmblem';

const signed = (value: number) => (value > 0 ? `+${value}` : `−${Math.abs(value)}`);

/** The Mayhem ladder of everyone on the list (aramRating.ts), close to LoL ranked: tier with
 * division, points (MP), the way to the next division and the points of the latest games. With
 * the website upload allowed, the ranks come from the website (aramSite.ts). */
export function AramRank({
  players,
  games,
  meId,
  site,
  onPlayer,
}: {
  players: AramPlayer[];
  games: AramEntry[];
  meId: string | null;
  site: SiteBoard | null;
  onPlayer: (player: AramPlayer) => void;
}) {
  const all = combine(standings(games), site);
  const byPuuid = new Map(all.map((s) => [s.puuid, s]));
  const rows = players
    .map((player) => ({ player, standing: byPuuid.get(player.puuid) ?? null }))
    .sort(
      (x, y) =>
        (y.standing?.rank?.ladder ?? -1) - (x.standing?.rank?.ladder ?? -1) ||
        (y.standing?.games ?? 0) - (x.standing?.games ?? 0) ||
        (x.player.name < y.player.name ? -1 : x.player.name > y.player.name ? 1 : 0),
    );
  const rated = rows.some((r) => r.standing && r.standing.games > 0);
  return (
    <div className="rank-view">
      {!rated && (
        <p className="aram-note" role="status">
          Noch keine Spiele mit den Werten aller zehn – ab dem nächsten ARAM-Mayhem-Spiel zählt es.
        </p>
      )}
      <ol className="rank-list">
        {rows.map(({ player, standing }, i) => (
          <li key={player.puuid}>
            <RankRow
              place={standing?.rank ? i + 1 : null}
              top={ladderPlace(all, player.puuid)?.top ?? null}
              player={player}
              standing={standing}
              me={player.puuid === meId}
              onClick={() => onPlayer(player)}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function RankRow({
  place,
  top,
  player,
  standing,
  me,
  onClick,
}: {
  place: number | null;
  top: number | null;
  player: AramPlayer;
  standing: Ranked | null;
  me: boolean;
  onClick: () => void;
}) {
  const { name } = splitRiotId(player.name);
  const rank = standing?.rank ?? null;
  const last = [...(standing?.last ?? [])].reverse();
  return (
    <button className={`rank-row ${me ? 'me' : ''}`} onClick={onClick}>
      <span className="rank-place">{place ?? ''}</span>
      <span className="rank-emblem-box">
        {rank ? (
          <TierEmblem tier={rank.tier} size={64} />
        ) : (
          <span className="rank-placing" aria-hidden="true">
            ?
          </span>
        )}
      </span>
      <span className="rank-main">
        <span className="rank-name">
          {name}
          {standing && standing.games > 0 && (
            <span className="rank-record"> · {record(standing)}</span>
          )}
          {top !== null && <span className="rank-record"> · Top {top} %</span>}
          {standing?.average && (
            <span className="rank-record">
              {' '}
              · Leistung Ø{' '}
              <GradeBadge
                grade={standing.average.grade}
                title={`Durchschnitt der letzten ${standing.average.games} Spiele`}
              />
            </span>
          )}
        </span>
        {rank ? (
          <>
            <span className="rank-tier">
              <b>{rankName(rank)}</b>
              <span className="rank-value">{rank.points} MP</span>
              {standing!.climbing && (
                <span
                  className="rank-climb small"
                  title="Form über dem Rang – du steigst schneller"
                >
                  <TrendingUp size={12} aria-hidden />
                </span>
              )}
            </span>
            <span
              className="rank-progress"
              style={
                { '--progress': rank.division === null ? 1 : rank.points / 100 } as CSSProperties
              }
            >
              <span />
            </span>
          </>
        ) : (
          <span className="rank-tier placing-text">
            Einstufung {standing?.placed ?? 0}/{PLACEMENT}
          </span>
        )}
      </span>
      <span className="rank-marks" aria-label="Letzte Spiele">
        {last.map((game) => (
          <GameChip key={game.gameId} game={game} />
        ))}
      </span>
    </button>
  );
}

/** A game: its grade, and the points once the player has a rank. */
function GameChip({ game }: { game: Last }) {
  const tone = game.gain === null ? '' : game.gain > 0 ? 'high' : 'low';
  const change =
    game.change === 'promoted'
      ? ' · Aufstieg'
      : game.change === 'demoted'
        ? ' · Abstieg'
        : game.change === 'placed'
          ? ' · eingestuft'
          : '';
  const result = game.win === undefined ? '' : game.win ? ' · Sieg' : ' · Niederlage';
  return (
    <span
      className={`rank-mark ${tone} ${game.change ?? ''}`}
      title={`${game.champion || 'Spiel'} · Note ${game.grade}${result}${change}`}
    >
      <GradeBadge grade={game.grade} />
      {game.gain !== null && <span>{signed(game.gain)}</span>}
    </span>
  );
}
