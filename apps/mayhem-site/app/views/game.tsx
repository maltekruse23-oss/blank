'use client';
// One game: who played best? The answer on top (score, result and the best grade over the splash
// art), then both teams with one grade per player and K/D/A below; a click on a player shows the
// build and values and explains the grade. "Compare" puts all ten side by side in one stat.
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { MIN_SECONDS, performanceOf } from '../../src/features/aram/aramPerformance';
import { seatEntry, type GamePlayer, type GameView } from '../../src/game';
import { AXES, axesOf, mvpOf } from '../../src/insights';
import { Augment, GradeChip, GradeIcon, Img, Problem, Tabs, step } from '../ui/bits';
import { LOCALE, num } from '../ui/format';
import { championImage, duration, itemImage, profileHref, splashImage, splitName, useAugments, useDragon, useLive } from '../ui/data';

type Dragon = ReturnType<typeof useDragon>;
type Measure = 'damage' | 'tank' | 'care' | 'gold';
type Part = 'why' | 'compare';
type Mark = ReturnType<typeof performanceOf>;

const MEASURES: { id: Measure; label: string; of: (p: GamePlayer) => number }[] = [
  { id: 'damage', label: 'Damage', of: (p) => p.damage },
  { id: 'tank', label: 'Damage taken', of: (p) => p.taken + p.mitigated },
  { id: 'care', label: 'Healing & shields', of: (p) => p.healed + p.shielded },
  { id: 'gold', label: 'Gold', of: (p) => p.gold },
];

const sideName = (team: number) => (team === 100 ? 'Blue side' : team === 200 ? 'Red side' : `Team ${team}`);

export default function GamePage() {
  const params = useParams<{ id: string }>();
  const focus = useSearchParams().get('p');
  const { data, error, missing } = useLive<GameView>(/^\d{1,13}$/.test(params.id) ? '/api/spiel/' + params.id : null);
  const dragon = useDragon();
  const [picked, setPicked] = useState<number | null>(null);
  const [part, setPart] = useState<Part>('why');
  const [measure, setMeasure] = useState<Measure>('damage');

  const marks = useMemo(() => (data ? data.players.map((_, i) => performanceOf(seatEntry(data, i))) : []), [data]);

  if (!/^\d{1,13}$/.test(params.id)) return <Problem message="Game not found" missing />;
  if (error) return <Problem message={error} missing={missing} />;
  if (!data) return <p className="empty">Loading game …</p>;

  const mvp = mvpOf(marks);
  const focused = focus ? data.players.findIndex((p) => p.puuid === focus) : -1;
  const shown = picked ?? (focused >= 0 ? focused : Math.max(0, mvp));
  const keyOf = (p: GamePlayer) => p.champion ?? dragon?.champions.get(p.championId)?.id;
  const nameOf = (p: GamePlayer) => p.name ?? data.named.find((n) => n.champion === keyOf(p))?.name ?? null;
  const linkOf = (p: GamePlayer) => p.puuid ?? data.named.find((n) => n.champion === keyOf(p))?.puuid ?? null;
  const teams = [...new Set(data.players.map((p) => p.team))].sort((a, b) => a - b);
  const star = data.players[Math.max(0, mvp)];
  const starKey = star && keyOf(star);
  const starName = star && (nameOf(star) ? splitName(nameOf(star)!).name : (dragon?.champions.get(star.championId)?.name ?? star.champion));
  const when = new Date(data.at);

  return (
    <>
      <Link className="back" href={focus ? '/players/' + encodeURIComponent(focus) : '/leaderboard'}>
        ← {focus ? 'Profile' : 'Leaderboard'}
      </Link>

      <section
        className="hero in"
        aria-label="Game"
        style={starKey ? ({ '--splash': `url(${splashImage(starKey)})` } as React.CSSProperties) : undefined}
      >
        <div className="glass hero-glass">
          <div className="title">
            <div>
              <h1 className="score mono">
                {teams.map((team, i) => {
                  const won = data.players.some((p) => p.team === team && p.win);
                  return (
                    <span key={team}>
                      {i > 0 && <span className="vs">:</span>}{' '}
                      {data.players.filter((p) => p.team === team).reduce((n, p) => n + p.kills, 0)}
                      <small className={won ? 'up' : 'down'}>{won ? 'Win' : 'Loss'}</small>
                    </span>
                  );
                })}
              </h1>
              <div className="pills">
                <span className="pill">
                  {when.toLocaleDateString(LOCALE, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })},{' '}
                  {when.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="pill">{duration(data.seconds)} min</span>
                {data.patch && <span className="pill">Patch {data.patch}</span>}
              </div>
            </div>
          </div>
          {mvp >= 0 && marks[mvp] && (
            <span className="answer best" title="The best grade of the game, win or lose">
              <GradeIcon grade={marks[mvp]!.grade} size={56} />
              <span>
                <small>Best grade</small>
                <b className="plain">{starName}</b>
              </span>
            </span>
          )}
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

      <div className="teams">
        {teams.map((team, t) => (
          <Team key={team} team={team} index={t} view={data} marks={marks} mvp={mvp} shown={shown} onPick={setPicked} nameOf={nameOf} linkOf={linkOf} dragon={dragon} />
        ))}
      </div>

      <section className="section in" style={step(3)} aria-label="Grade and comparison">
        <div className="tools">
          <Tabs<Part>
            label="Show"
            value={part}
            onChange={setPart}
            options={[
              { id: 'why', label: 'Why this grade' },
              { id: 'compare', label: 'Compare all ten' },
            ]}
          />
          {part === 'compare' && (
            <div className="chips" role="group" aria-label="Stat">
              {MEASURES.map((m) => (
                <button key={m.id} type="button" aria-pressed={measure === m.id} onClick={() => setMeasure(m.id)}>
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          {part === 'why' ? (
            <Explain view={data} index={shown} mark={marks[shown] ?? null} name={nameOf(data.players[shown])} dragon={dragon} />
          ) : (
            <Compare view={data} measure={measure} nameOf={nameOf} dragon={dragon} />
          )}
        </div>
        <p className="fine">
          {"You're in this game and don't want to be named?"} <Link href={`/privacy/remove?game=${data.gameId}`}>Hide name</Link>
        </p>
      </section>
    </>
  );
}

// ---- Teams ----------------------------------------------------------------------------------

function Team(props: {
  team: number;
  index: number;
  view: GameView;
  marks: Mark[];
  mvp: number;
  shown: number;
  onPick: (i: number) => void;
  nameOf: (p: GamePlayer) => string | null;
  linkOf: (p: GamePlayer) => string | null;
  dragon: Dragon;
}) {
  const { team, index, view, marks, mvp, shown, onPick, nameOf, linkOf, dragon } = props;
  const rows = view.players.map((p, i) => ({ p, i })).filter(({ p }) => p.team === team);
  const won = rows.some(({ p }) => p.win);
  return (
    <section className="section team in" style={step(index + 1)} aria-label={sideName(team)}>
      <h2>
        {sideName(team)} <small className={won ? 'up' : 'down'}>{won ? 'Win' : 'Loss'}</small>
      </h2>
      <ul className="rows">
        {rows.map(({ p, i }) => (
          <Seat key={i} player={p} index={i} mark={marks[i]} mvp={i === mvp} picked={i === shown} onPick={onPick} name={nameOf(p)} link={linkOf(p)} dragon={dragon} />
        ))}
      </ul>
    </section>
  );
}

function Seat({
  player: p,
  index,
  mark,
  mvp,
  picked,
  onPick,
  name,
  link,
  dragon,
}: {
  player: GamePlayer;
  index: number;
  mark: Mark;
  mvp: boolean;
  picked: boolean;
  onPick: (i: number) => void;
  name: string | null;
  link: string | null;
  dragon: Dragon;
}) {
  const augments = useAugments();
  const champ = dragon?.champions.get(p.championId);
  const champion = champ?.name ?? p.champion ?? 'Champion';
  const riot = name ? splitName(name).name : null;
  const id = `seat-${index}`;
  return (
    <li className="seat-row" data-picked={picked}>
      <div className="row" data-top={mvp || undefined}>
        <Img className="champ" src={championImage(dragon, champ?.id ?? p.champion ?? undefined)} alt="" size={40} />
        <span className="who">
          <b>
            {riot ? (
              link ? (
                <Link href={profileHref({ puuid: link, name: name! })} title={name!}>
                  {riot}
                </Link>
              ) : (
                <span title={name!}>{riot}</span>
              )
            ) : (
              <span className="faint">{champion}</span>
            )}
            {mvp && <span className="mvp" title="Best grade in the game">MVP</span>}
          </b>
          <small className="mono">
            {riot ? `${champion} · ` : ''}
            {p.kills} / {p.deaths} / {p.assists}
          </small>
        </span>
        <button type="button" className="grade-pick" aria-expanded={picked} aria-controls={id} title="Why this grade, build and values" onClick={() => onPick(index)}>
          {mark ? <GradeChip grade={mark.grade} /> : <span className="faint">–</span>}
          <svg className="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
      {picked && (
        <div className="seat-more" id={id}>
          <dl className="match-facts">
            <div>
              <dt>Damage</dt>
              <dd>{num(p.damage)}</dd>
            </div>
            <div>
              <dt>Taken</dt>
              <dd>{num(p.taken + p.mitigated)}</dd>
            </div>
            <div>
              <dt>{'Healing & shields'}</dt>
              <dd>{num(p.healed + p.shielded)}</dd>
            </div>
            <div>
              <dt>Gold</dt>
              <dd>{num(p.gold)}</dd>
            </div>
            {p.level !== null && (
              <div>
                <dt>Level</dt>
                <dd>{p.level}</dd>
              </div>
            )}
          </dl>
          <div className="items" aria-label="Items and augments">
            {p.items ? p.items.filter((n) => n > 0).map((n, k) => <Img key={k} className="item" src={itemImage(dragon, n)} size={28} />) : <span className="faint">No items known</span>}
            {(p.augments ?? []).map((a) => (
              <Augment key={a} id={a} info={augments.get(a)} size={28} />
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

// ---- Comparison -----------------------------------------------------------------------------

function Compare(props: { view: GameView; measure: Measure; nameOf: (p: GamePlayer) => string | null; dragon: Dragon }) {
  const { view, measure, nameOf, dragon } = props;
  const of = MEASURES.find((m) => m.id === measure)!.of;
  const max = Math.max(1, ...view.players.map(of));
  const rows = view.players.map((p, i) => ({ p, i, value: of(p) })).sort((a, b) => b.value - a.value || a.i - b.i);
  return (
    <ol className="compare" aria-label={MEASURES.find((m) => m.id === measure)!.label}>
      {rows.map(({ p, i, value }) => {
        const champ = dragon?.champions.get(p.championId);
        const name = nameOf(p);
        return (
          <li key={i} data-side={p.team}>
            <Img className="champ" src={championImage(dragon, champ?.id ?? p.champion ?? undefined)} alt="" size={26} />
            <span className="label">{name ? splitName(name).name : (champ?.name ?? p.champion ?? '–')}</span>
            <span className="bar" aria-hidden>
              <span style={{ width: `${(value / max) * 100}%` }} />
            </span>
            <span className="value mono">{num(value)}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ---- Why this grade -------------------------------------------------------------------------

function Explain(props: { view: GameView; index: number; mark: Mark; name: string | null; dragon: Dragon }) {
  const { view, index, mark, name, dragon } = props;
  const p = view.players[index];
  const champ = dragon?.champions.get(p.championId);
  const axes = axesOf(seatEntry(view, index));
  return (
    <div className="section" aria-live="polite">
      <div className="record-holder">
        {mark ? <GradeIcon grade={mark.grade} size={56} /> : <Img className="champ" src={championImage(dragon, champ?.id)} size={44} />}
        <span className="who">
          <b>
            <span>{name ? splitName(name).name : (champ?.name ?? p.champion ?? '–')}</span>
          </b>
          <small>
            {champ?.name ?? p.champion ?? 'Champion'}
            {mark && ` · better than ${Math.round(mark.pct * 100)}% of all games`}
          </small>
        </span>
      </div>
      {!mark || !axes ? (
        <p className="fine">{view.seconds < MIN_SECONDS ? 'Games under 8 minutes (remakes) get no grade.' : 'This game lacks stats the grade needs.'}</p>
      ) : (
        <>
          {mark.afk && <p className="fine">Barely earned any gold: rated as AFK, grade F.</p>}
          <ul className="axes">
            {axes.map((value, i) => {
              const label = Object.values(AXES)[i];
              const word = value > 0.25 ? 'above usual' : value < -0.25 ? 'below usual' : 'as usual';
              return (
                <li key={label}>
                  <span>{label}</span>
                  <span className="axis" aria-hidden>
                    <span
                      className={value >= 0 ? 'plus' : 'minus'}
                      style={{
                        left: value >= 0 ? '50%' : `${50 + (Math.max(-2.5, value) / 2.5) * 50}%`,
                        width: `${(Math.min(2.5, Math.abs(value)) / 2.5) * 50}%`,
                      }}
                    />
                  </span>
                  <span className={'word ' + (value > 0.25 ? 'up' : value < -0.25 ? 'down' : 'faint')}>{word}</span>
                </li>
              );
            })}
          </ul>
          <p className="fine">
            {`Each value is the share of the lobby, compared with what ${champ?.name ?? 'this champion'} usually reaches. Win or loss doesn't count. Click another player's grade to see theirs.`}
          </p>
        </>
      )}
    </div>
  );
}
