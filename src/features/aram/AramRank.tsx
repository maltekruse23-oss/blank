import type { CSSProperties } from 'react';
import { splitRiotId, type AramEntry, type AramPlayer } from '../../adapters/aram';
import { BEST, PLACEMENT, standings, tierOf, type Standing, type Tier } from './aramRating';
import d from './emblems/d.png';
import c from './emblems/c.png';
import b from './emblems/b.png';
import a from './emblems/a.png';
import s from './emblems/s.png';
import ss from './emblems/ss.png';
import sss from './emblems/sss.png';
import mayhem from './emblems/mayhem.png';

/** The emblem of each tier (the user's pictures; D is a stand-in until its picture comes). */
const EMBLEMS: Record<Tier['id'], string> = { d, c, b, a, s, ss, sss, mayhem };

const mark = (value: number) => value.toFixed(1).replace('.', ',');
const LAST = 6;

export function TierEmblem({
  tier,
  size,
  provisional = false,
}: {
  tier: Tier;
  size: number;
  /** Still in the placement games: the tier so far, pale. */
  provisional?: boolean;
}) {
  return (
    <img
      className={`rank-emblem ${provisional ? 'provisional' : ''}`}
      src={EMBLEMS[tier.id]}
      alt={`Stufe ${tier.name}`}
      width={size}
      height={size}
      draggable={false}
    />
  );
}

/** The Mayhem rating of everyone on the list (aramRating.ts): tier, season value, the way to the
 * next tier and the latest marks. */
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
        (y.standing?.value ?? 0) - (x.standing?.value ?? 0) ||
        (x.player.name < y.player.name ? -1 : x.player.name > y.player.name ? 1 : 0),
    );
  const rated = rows.some((r) => r.standing && r.standing.games > 0);
  return (
    <div className="rank-view">
      {!rated && (
        <p className="aram-note" role="status">
          Noch keine Spiele mit den Werten aller zehn – ab dem nächsten ARAM-Mayhem-Spiel zählt die
          Note.
        </p>
      )}
      <ol className="rank-list">
        {rows.map(({ player, standing }) => (
          <li key={player.puuid}>
            <RankRow
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
  player,
  standing,
  me,
  onClick,
}: {
  player: AramPlayer;
  standing: Standing | null;
  me: boolean;
  onClick: () => void;
}) {
  const { name } = splitRiotId(player.name);
  const games = standing?.games ?? 0;
  const tier = standing?.tier ?? null;
  const last = (standing?.history ?? []).slice(-LAST).reverse();
  return (
    <button className={`rank-row ${me ? 'me' : ''} ${tier ? '' : 'placing'}`} onClick={onClick}>
      <span className="rank-emblem-box">
        {tier ? (
          <TierEmblem tier={tier.tier} size={64} />
        ) : games > 0 ? (
          <TierEmblem tier={tierOf(standing!.value).tier} size={64} provisional />
        ) : (
          <span className="rank-placing" aria-hidden="true">
            ?
          </span>
        )}
      </span>
      <span className="rank-main">
        <span className="rank-name">{name}</span>
        {tier ? (
          <>
            <span className="rank-tier">
              <b>{tier.tier.name}</b>
              <span className="rank-value" title={`Schnitt der besten ${BEST} Noten`}>
                {mark(standing!.value)}
              </span>
            </span>
            <span
              className="rank-progress"
              style={{ '--progress': tier.progress } as CSSProperties}
              title={
                tier.next
                  ? `Noch ${mark(Math.max(0, tier.next.from - standing!.value))} bis ${tier.next.name}`
                  : 'Höchste Stufe'
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
      <span className="rank-marks" aria-label="Letzte Noten">
        {last.map((h) => (
          <span
            key={`${h.entry.gameId}`}
            className={`rank-mark ${h.mark.value >= 7 ? 'high' : h.mark.value < 4 ? 'low' : ''}`}
            title={`${h.entry.championName || 'Spiel'} · ${h.mark.win ? 'Sieg' : 'Niederlage'}`}
          >
            {mark(h.mark.value)}
          </span>
        ))}
      </span>
    </button>
  );
}
