import type { CSSProperties } from 'react';
import { TrendingUp } from 'lucide-react';
import type { AramEntry } from '../../adapters/aram';
import {
  CLIMBING,
  PLACEMENT,
  rankName,
  seasonName,
  seasonOf,
  standings,
  type Standing,
} from './aramRating';
import { TierEmblem } from './TierEmblem';

const mark = (value: number) => value.toFixed(1).replace('.', ',');
const signed = (value: number) => (value > 0 ? `+${value}` : `−${Math.abs(value)}`);
const HISTORY = 20;
/** Ranked players from which the top share is shown. */
const TOP_FROM = 10;

/** Wins and losses as on op.gg: "12S 8N · 60 %". */
export const record = (s: Pick<Standing, 'games' | 'wins'>) =>
  s.games === 0
    ? ''
    : `${s.wins}S ${s.games - s.wins}N · ${Math.round((s.wins / s.games) * 100)} %`;

/** Place on the ladder and top share, as on third-party sites ("Platz 2 · Top 20 %"). */
export function ladderPlace(all: Standing[], puuid: string) {
  const ranked = all.filter((s) => s.rank);
  const index = ranked.findIndex((s) => s.puuid === puuid);
  if (index < 0) return null;
  return {
    place: index + 1,
    // A share only means something with enough players (a group of friends: the place is enough).
    top:
      ranked.length >= TOP_FROM
        ? Math.max(1, Math.round(((index + 1) / ranked.length) * 100))
        : null,
  };
}

/**
 * A player's ranked profile (user's reference: the LoL client and op.gg): the rank card with
 * emblem, rank and points, wins/losses, place, the climb hint, earlier seasons, and the match
 * history with the points of each game and the rank after it.
 */
export function RankHistory({ games, puuid }: { games: AramEntry[]; puuid: string }) {
  const all = standings(games);
  const standing = all.find((s) => s.puuid === puuid);
  if (!standing || standing.history.length === 0) return null;
  const { rank } = standing;
  const at = ladderPlace(all, puuid);
  const steps = standing.history.slice(-HISTORY).reverse();
  const scored = steps.filter((s) => s.gain !== null);
  const plus = scored.filter((s) => s.gain! > 0).map((s) => s.gain!);
  const minus = scored.filter((s) => s.gain! < 0).map((s) => s.gain!);
  const mean = (values: number[]) =>
    values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
  const total = scored.reduce((sum, s) => sum + s.gain!, 0);
  const season = seasonOf(standing.history[standing.history.length - 1].entry.at);
  return (
    <section className="rank-profile">
      <div className="rank-card">
        {rank ? (
          <TierEmblem tier={rank.tier} size={72} />
        ) : (
          <span className="rank-placing" aria-hidden="true">
            ?
          </span>
        )}
        <div className="rank-card-main">
          <span className="rank-card-season">{seasonName(season)}</span>
          {rank ? (
            <>
              <b>
                {rankName(rank)} · {rank.points} MP
              </b>
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
            <b>
              Ohne Rang · Einstufung {standing.placed}/{PLACEMENT}
            </b>
          )}
          <span className="rank-card-meta">
            {record(standing)}
            {at && ` · Platz ${at.place}`}
            {at?.top != null && ` · Top ${at.top} %`}
          </span>
        </div>
        {rank && standing.form >= CLIMBING && (
          <span
            className="rank-climb"
            title="Deine Form liegt über deinem Rang – du steigst schneller"
          >
            <TrendingUp size={14} aria-hidden /> Form über dem Rang
          </span>
        )}
      </div>
      {standing.seasons.length > 0 && (
        <ul className="rank-seasons" aria-label="Frühere Saisons">
          {standing.seasons.map(({ season: s, rank: r }) => (
            <li key={s.id} title={seasonName(s)}>
              <TierEmblem tier={r.tier} size={22} />
              <span>
                {seasonName(s)}: <b>{rankName(r)}</b>
              </span>
            </li>
          ))}
        </ul>
      )}
      <table className="rank-matches">
        <thead>
          <tr>
            <th>Ergebnis</th>
            <th>Champion</th>
            <th>K / D / A</th>
            <th>Note</th>
            <th>MP</th>
            <th>Stand danach</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step) => (
            <tr key={step.entry.gameId} className={step.entry.win ? 'win' : 'loss'}>
              <td>{step.entry.win ? 'Sieg' : 'Niederlage'}</td>
              <td>{step.entry.championName || '–'}</td>
              <td>
                {step.entry.kills}/{step.entry.deaths}/{step.entry.assists}
              </td>
              <td>{mark(step.mark.value)}</td>
              <td className={step.gain === null ? '' : step.gain > 0 ? 'plus' : 'minus'}>
                {step.gain === null ? 'Einstufung' : signed(step.gain)}
              </td>
              <td>
                {step.after ? `${rankName(step.after)} · ${step.after.points} MP` : '–'}
                {step.change === 'promoted' && <em className="up"> Aufstieg</em>}
                {step.change === 'demoted' && <em className="down"> Abstieg</em>}
                {step.change === 'placed' && <em className="up"> Eingestuft</em>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {scored.length > 0 && (
        <p className="rank-matches-sum">
          Summe: {signed(total)} MP · {scored.filter((s) => s.entry.win).length}S/
          {scored.filter((s) => !s.entry.win).length}N · Ø Plus{' '}
          {plus.length ? signed(mean(plus)) : '–'} / Ø Minus{' '}
          {minus.length ? signed(mean(minus)) : '–'}
        </p>
      )}
    </section>
  );
}
