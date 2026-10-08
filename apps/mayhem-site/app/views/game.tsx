'use client';
// One game: both teams with all ten Riot IDs, grade and MVP, K/D/A, items and augments, comparison
// bars for everyone and why a player got their grade (the five axes against the champion's usual game).
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { MIN_SECONDS, performanceOf } from '../../src/features/aram/aramPerformance';
import { seatEntry, type GamePlayer, type GameView } from '../../src/game';
import { AXES, axesOf, mvpOf } from '../../src/insights';
import { Augment, GradeChip, GradeIcon, Img, Problem, Tabs } from '../ui/bits';
import { LOCALE, num } from '../ui/format';
import {
  championImage,
  duration,
  itemImage,
  splashImage,
  splitName,
  useAugments,
  useDragon,
  useLive,
  profileHref,
} from '../ui/data';

type Dragon = ReturnType<typeof useDragon>;
type Measure = 'damage' | 'tank' | 'care' | 'gold';

const MEASURES: { id: Measure; label: string; of: (p: GamePlayer) => number }[] = [
  { id: 'damage', label: 'Damage', of: (p) => p.damage },
  { id: 'tank', label: 'Damage taken', of: (p) => p.taken + p.mitigated },
  { id: 'care', label: 'Healing & shields', of: (p) => p.healed + p.shielded },
  { id: 'gold', label: 'Gold', of: (p) => p.gold },
];

const sideName = (team: number) =>
  team === 100 ? 'Blue side' : team === 200 ? 'Red side' : `Team ${team}`;

export default function GamePage() {
  const params = useParams<{ id: string }>();
  const focus = useSearchParams().get('p');
  const { data, error, missing } = useLive<GameView>(/^\d{1,13}$/.test(params.id) ? '/api/spiel/' + params.id : null);
  const dragon = useDragon();
  const [picked, setPicked] = useState<number | null>(null);
  const [measure, setMeasure] = useState<Measure>('damage');

  const marks = useMemo(() => (data ? data.players.map((_, i) => performanceOf(seatEntry(data, i))) : []), [data]);

  if (!/^\d{1,13}$/.test(params.id)) return <Problem message="Game not found" missing />;
  if (error) return <Problem message={error} missing={missing} />;
  if (!data) return <p className="empty">Loading game …</p>;

  const mvp = mvpOf(marks);
  const focused = focus ? data.players.findIndex((p) => p.puuid === focus) : -1;
  const shown = picked ?? (focused >= 0 ? focused : Math.max(0, mvp));
  const nameOf = (p: GamePlayer) => {
    if (p.name) return p.name;
    const key = p.champion ?? dragon?.champions.get(p.championId)?.id;
    return data.named.find((n) => n.champion === key)?.name ?? null;
  };
  const linkOf = (p: GamePlayer) => {
    if (p.puuid) return p.puuid;
    const key = p.champion ?? dragon?.champions.get(p.championId)?.id;
    return data.named.find((n) => n.champion === key)?.puuid ?? null;
  };
  const teams = [...new Set(data.players.map((p) => p.team))].sort((a, b) => a - b);
  const star = data.players[Math.max(0, mvp)];
  const starKey = star && (star.champion ?? dragon?.champions.get(star.championId)?.id);
  const when = new Date(data.at);

  return (
    <>
      <Link className="back" href={focus ? '/players/' + encodeURIComponent(focus) : '/'}>
        ← {focus ? 'Profile' : 'Leaderboard'}
      </Link>

      <section
        className="game-hero"
        style={starKey ? ({ '--splash': `url(${splashImage(starKey)})` } as React.CSSProperties) : undefined}
      >
        <div>
          <h1 className="num">
            {teams.map((team, i) => {
              const won = data.players.some((p) => p.team === team && p.win);
              return (
                <span key={team} className="side-score" data-side={team}>
                  {i > 0 && <span className="faint vs">:</span>}
                  {data.players.filter((p) => p.team === team).reduce((n, p) => n + p.kills, 0)}
                  <small className={won ? 'up' : 'down'}>{won ? 'Win' : 'Loss'}</small>
                </span>
              );
            })}
          </h1>
          <div className="facts num">
            <span>
              {when.toLocaleDateString(LOCALE, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })},{' '}
              {when.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span>{duration(data.seconds)} min</span>
            {data.patch && <span>Patch {data.patch}</span>}
          </div>
        </div>
      </section>

      {data.disputed && (
        <div className="notice" role="note">
          {"The uploads of this game contradict each other, so it doesn't count for the rating."}
        </div>
      )}
      {data.source === 'uploads' && (
        <div className="notice" role="note">
          {"This game isn't in the raw data archive yet. Names only come from players who upload themselves and from their friends in the game."}
        </div>
      )}

      <div className="game-teams">
        {teams.map((team) => (
          <Team
            key={team}
            team={team}
            view={data}
            marks={marks}
            mvp={mvp}
            shown={shown}
            onPick={setPicked}
            nameOf={nameOf}
            linkOf={linkOf}
            dragon={dragon}
          />
        ))}
      </div>
      <p className="fine game-hide">
        {"You're in this game and don't want to be named?"}{' '}
        <Link href={`/privacy/remove?game=${data.gameId}`}>Hide name</Link>
      </p>

      <div className="grid cols-main">
        <div className="card">
          <div className="card-head">
            <h2>Comparison</h2>
            <Tabs<Measure>
              label="Stat"
              value={measure}
              onChange={setMeasure}
              options={MEASURES.map((m) => ({ id: m.id, label: m.label }))}
            />
          </div>
          <Compare view={data} measure={measure} nameOf={nameOf} dragon={dragon} />
        </div>
        <Explain view={data} index={shown} mark={marks[shown] ?? null} name={nameOf(data.players[shown])} dragon={dragon} />
      </div>
    </>
  );
}

// ---- Teams ----------------------------------------------------------------------------------

function Team(props: {
  team: number;
  view: GameView;
  marks: ReturnType<typeof performanceOf>[];
  mvp: number;
  shown: number;
  onPick: (i: number) => void;
  nameOf: (p: GamePlayer) => string | null;
  linkOf: (p: GamePlayer) => string | null;
  dragon: Dragon;
}) {
  const { team, view, marks, mvp, shown, onPick, nameOf, linkOf, dragon } = props;
  const augments = useAugments();
  const rows = view.players.map((p, i) => ({ p, i })).filter(({ p }) => p.team === team);
  const won = rows.some(({ p }) => p.win);
  return (
    <section className="card team-card" data-side={team} aria-label={sideName(team)}>
      <h2>
        {sideName(team)} ·{' '}
        <span className={won ? 'up' : 'down'}>{won ? 'Win' : 'Loss'}</span>
      </h2>
      <div className="table-wrap flat">
        <table className="table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Grade</th>
              <th className="right">K / D / A</th>
              <th className="right hide-sm">Damage</th>
              <th className="right hide-sm">Gold</th>
              <th className="hide-sm">Items &amp; Augments</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, i }) => {
              const champ = dragon?.champions.get(p.championId);
              const name = nameOf(p);
              const link = linkOf(p);
              const { name: riot, tag } = name ? splitName(name) : { name: '', tag: '' };
              const mark = marks[i];
              return (
                <tr key={i} data-picked={i === shown}>
                  <td>
                    <span className="who">
                      <Img className="champ" src={championImage(dragon, champ?.id ?? p.champion ?? undefined)} alt={champ?.name ?? ''} size={28} />
                      <span style={{ minWidth: 0 }}>
                        {name ? (
                          link ? (
                            <Link href={profileHref({ puuid: link, name })} title={name}>
                              <b>{riot}</b>
                            </Link>
                          ) : (
                            <b title={name}>{riot}</b>
                          )
                        ) : (
                          <b className="faint">No name</b>
                        )}
                        <small>
                          {champ?.name ?? p.champion ?? 'Champion'}
                          {tag && <span className="hide-sm"> · #{tag}</span>}
                          {p.level !== null && (
                            <span className="hide-sm">
                              {' '}
                              · Level {p.level}
                            </span>
                          )}
                        </small>
                      </span>
                    </span>
                  </td>
                  <td>
                    <button
                      className="grade-pick"
                      aria-pressed={i === shown}
                      title="Explain grade"
                      onClick={() => onPick(i)}
                    >
                      {mark ? <GradeChip grade={mark.grade} /> : <span className="faint">–</span>}
                      {i === mvp && <span className="mvp">MVP</span>}
                    </button>
                  </td>
                  <td className="right num nowrap">
                    {p.kills} / <span className="down">{p.deaths}</span> / {p.assists}
                  </td>
                  <td className="right num hide-sm">{num(p.damage)}</td>
                  <td className="right num hide-sm">{num(p.gold)}</td>
                  <td className="hide-sm">
                    {p.items ? (
                      <span className="items">
                        {p.items.filter((n) => n > 0).map((n, k) => (
                          <Img key={k} className="item" src={itemImage(dragon, n)} size={22} />
                        ))}
                      </span>
                    ) : (
                      <span className="faint">–</span>
                    )}
                    {p.augments && p.augments.length > 0 && (
                      <span className="augments" style={{ marginTop: 5 }}>
                        {p.augments.map((id) => (
                          <Augment key={id} id={id} info={augments.get(id)} />
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---- Comparison -----------------------------------------------------------------------------

function Compare(props: { view: GameView; measure: Measure; nameOf: (p: GamePlayer) => string | null; dragon: Dragon }) {
  const { view, measure, nameOf, dragon } = props;
  const of =MEASURES.find((m) => m.id === measure)!.of;
  const max = Math.max(1, ...view.players.map(of));
  const rows = view.players.map((p, i) => ({ p, i, value: of(p) })).sort((a, b) => b.value - a.value || a.i - b.i);
  return (
    <ol className="compare">
      {rows.map(({ p, i, value }) => {
        const champ = dragon?.champions.get(p.championId);
        const name = nameOf(p);
        return (
          <li key={i} data-side={p.team}>
            <Img className="champ" src={championImage(dragon, champ?.id ?? p.champion ?? undefined)} alt="" size={24} />
            <span className="label">{name ? splitName(name).name : champ?.name ?? p.champion ?? '–'}</span>
            <span className="bar" aria-hidden>
              <span style={{ width: `${(value / max) * 100}%` }} />
            </span>
            <span className="num value">{num(value)}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ---- Why this grade -------------------------------------------------------------------------

function Explain(props: {
  view: GameView;
  index: number;
  mark: ReturnType<typeof performanceOf>;
  name: string | null;
  dragon: Dragon;
}) {
  const { view, index, mark, name, dragon } = props;
  const p = view.players[index];
  const champ = dragon?.champions.get(p.championId);
  const axes = axesOf(seatEntry(view, index));
  return (
    <aside className="card explain" aria-live="polite">
      <h2>Why this grade</h2>
      <div className="who">
        {mark ? <GradeIcon grade={mark.grade} size={56} /> : <Img className="champ lg" src={championImage(dragon, champ?.id)} size={44} />}
        <span style={{ minWidth: 0 }}>
          <b>{name ? splitName(name).name : champ?.name ?? p.champion ?? '–'}</b>
          <small>
            {champ?.name ?? p.champion ?? 'Champion'}
            {mark &&
              ` · better than ${Math.round(mark.pct * 100)}% of all games`}
          </small>
        </span>
      </div>
      {!mark || !axes ? (
        <p className="fine" style={{ marginTop: 12 }}>
          {view.seconds < MIN_SECONDS
            ? 'Games under 8 minutes (remakes) get no grade.'
            : 'This game lacks stats the grade needs.'}
        </p>
      ) : (
        <>
          {mark.afk && (
            <p className="fine" style={{ marginTop: 12 }}>
              Barely earned any gold: rated as AFK, grade F.
            </p>
          )}
          <ul className="axes">
            {axes.map((value, i) => {
              const label = Object.values(AXES)[i];
              const word =
                value > 0.25
                  ? 'above average'
                  : value < -0.25
                    ? 'below average'
                    : 'as usual';
              return (
                <li key={label} title={`${label}: ${word}`}>
                  <span className="label">{label}</span>
                  <span className="axis" aria-hidden>
                    <span
                      className={value >= 0 ? 'plus' : 'minus'}
                      style={{
                        left: value >= 0 ? '50%' : `${50 + (value / 2.5) * 50}%`,
                        width: `${(Math.abs(value) / 2.5) * 50}%`,
                      }}
                    />
                  </span>
                  <span className={'word ' + (value > 0.25 ? 'up' : value < -0.25 ? 'down' : 'faint')}>{word}</span>
                </li>
              );
            })}
          </ul>
          <p className="fine">
            {`Each axis is the share of the lobby, compared with what ${champ?.name ?? 'this champion'} usually reaches. Win or loss doesn't count. Another grade: tap a player's grade.`}
          </p>
        </>
      )}
    </aside>
  );
}
