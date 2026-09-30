import type { CSSProperties } from 'react';
import { splitRiotId, type AramEntry, type AramPlayer } from '../../adapters/aram';
import {
  PLACEMENT,
  placementLadder,
  rankName,
  rankOf,
  standings,
  type Rank,
  type Standing,
  type Step,
} from './aramRating';
import { TierEmblem } from './TierEmblem';

const mark = (value: number) => value.toFixed(1).replace('.', ',');
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
  const byPuuid = new Map(standings(games).map((s) => [s.puuid, s]));
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
  player,
  standing,
  me,
  onClick,
}: {
  place: number | null;
  player: AramPlayer;
  standing: Standing | null;
  me: boolean;
  onClick: () => void;
}) {
  const { name } = splitRiotId(player.name);
  const games = standing?.games ?? 0;
  const rank = standing?.rank ?? null;
  const history = standing?.history ?? [];
  const soFar: Rank | null =
    !rank && games > 0 ? rankOf(placementLadder(history.map((h) => h.mark.value))) : null;
  const last = history.slice(-LAST).reverse();
  return (
    <button className={`rank-row ${me ? 'me' : ''}`} onClick={onClick}>
      <span className="rank-place">{place ?? ''}</span>
      <span className="rank-emblem-box">
        {rank ? (
          <TierEmblem tier={rank.tier} size={64} />
        ) : soFar ? (
          <TierEmblem tier={soFar.tier} size={64} provisional />
        ) : (
          <span className="rank-placing" aria-hidden="true">
            ?
          </span>
        )}
      </span>
      <span className="rank-main">
        <span className="rank-name">{name}</span>
        {rank ? (
          <>
            <span className="rank-tier">
              <b>{rankName(rank)}</b>
              <span className="rank-value">{rank.points} MP</span>
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
            Einstufung {Math.min(games, PLACEMENT)}/{PLACEMENT}
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

/** A game's points (or, in the placement games, its mark), with the mark in the tooltip. */
function GameChip({ step }: { step: Step }) {
  const tone =
    step.gain === null
      ? step.mark.value >= 7
        ? 'high'
        : step.mark.value < 4
          ? 'low'
          : ''
      : step.gain > 0
        ? 'high'
        : 'low';
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
      title={`${step.entry.championName || 'Spiel'} · Note ${mark(step.mark.value)} · ${
        step.mark.win ? 'Sieg' : 'Niederlage'
      }${change}`}
    >
      {step.gain === null ? mark(step.mark.value) : signed(step.gain)}
    </span>
  );
}
