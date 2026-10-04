import type { CSSProperties } from 'react';
import { splitRiotId, type AramEntry, type AramPlayer } from '../../adapters/aram';
import { CLIMBING, PLACEMENT, rankName, standings, type Standing, type Step } from './aramRating';
import { TrendingUp } from 'lucide-react';
import { ladderPlace, record } from './RankHistory';
import { GradeBadge } from './GradeBadge';
import { TierEmblem } from './TierEmblem';

const signed = (value: number) => (value > 0 ? `+${value}` : `−${Math.abs(value)}`);
const LAST = 6;

/** The Mayhem ladder of everyone on the list (aramRating.ts), close to LoL ranked: tier with
 * division, points (MP), the way to the next division and the points of the latest games. */
export function AramRank({
  players,
  games,
  meId,
  onPlayer,
}: {
  players: AramPlayer[];
  games: AramEntry[];
  meId: string | null;
  onPlayer: (player: AramPlayer) => void;
}) {
  const all = standings(games);
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
  standing: Standing | null;
  me: boolean;
  onClick: () => void;
}) {
  const { name } = splitRiotId(player.name);
  const rank = standing?.rank ?? null;
  const history = standing?.history ?? [];
  const last = history.slice(-LAST).reverse();
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
              {standing!.form >= CLIMBING && (
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
        {last.map((step) => (
          <GameChip key={step.entry.gameId} step={step} />
        ))}
      </span>
    </button>
  );
}

/** A game: its grade, and the points once the player has a rank. */
function GameChip({ step }: { step: Step }) {
  const tone = step.gain === null ? '' : step.gain > 0 ? 'high' : 'low';
  const change =
    step.change === 'promoted'
      ? ' · Aufstieg'
      : step.change === 'demoted'
        ? ' · Abstieg'
        : step.change === 'placed'
          ? ' · eingestuft'
          : '';
  return (
    <span
      className={`rank-mark ${tone} ${step.change ?? ''}`}
      title={`${step.entry.championName || 'Spiel'} · Note ${step.mark.grade} · ${
        step.mark.win ? 'Sieg' : 'Niederlage'
      }${change}`}
    >
      <GradeBadge grade={step.mark.grade} />
      {step.gain !== null && <span>{signed(step.gain)}</span>}
    </span>
  );
}
