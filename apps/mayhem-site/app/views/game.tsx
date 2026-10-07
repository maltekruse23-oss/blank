'use client';
// One game: both teams with all ten Riot IDs, grade and MVP, K/D/A, items and augments, comparison
// bars for everyone and why a player got their grade (the five axes against the champion's usual game).
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { MIN_SECONDS, performanceOf } from '../../src/features/aram/aramPerformance';
import { seatEntry, type GamePlayer, type GameView } from '../../src/game';
import { axesIn, axesOf, mvpOf } from '../../src/insights';
import { Augment, GradeChip, GradeIcon, Img, Problem, Tabs } from '../ui/bits';
import { locale, useLang } from '../ui/i18n';
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
type T = (en: string, de: string) => string;

const MEASURES: { id: Measure; label: [en: string, de: string]; of: (p: GamePlayer) => number }[] = [
  { id: 'damage', label: ['Damage', 'Schaden'], of: (p) => p.damage },
  { id: 'tank', label: ['Damage taken', 'Eingesteckt'], of: (p) => p.taken + p.mitigated },
  { id: 'care', label: ['Healing & shields', 'Heilen & Schilde'], of: (p) => p.healed + p.shielded },
  { id: 'gold', label: ['Gold', 'Gold'], of: (p) => p.gold },
];

const sideName = (team: number, t: T) =>
  team === 100 ? t('Blue side', 'Blaue Seite') : team === 200 ? t('Red side', 'Rote Seite') : `Team ${team}`;

export default function GamePage() {
  const params = useParams<{ id: string }>();
  const focus = useSearchParams().get('p');
  const { data, error, missing } = useLive<GameView>(/^\d{1,13}$/.test(params.id) ? '/api/spiel/' + params.id : null);
  const dragon = useDragon();
  const [picked, setPicked] = useState<number | null>(null);
  const [measure, setMeasure] = useState<Measure>('damage');
  const { lang, t, href } = useLang();

  const marks = useMemo(() => (data ? data.players.map((_, i) => performanceOf(seatEntry(data, i))) : []), [data]);

  if (!/^\d{1,13}$/.test(params.id)) return <Problem message={t('Game not found', 'Spiel nicht gefunden')} missing />;
  if (error) return <Problem message={error} missing={missing} />;
  if (!data) return <p className="empty">{t('Loading game …', 'Spiel wird geladen …')}</p>;

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
      <Link className="back" href={href(focus ? '/players/' + encodeURIComponent(focus) : '/')}>
        ← {focus ? t('Profile', 'Profil') : t('Leaderboard', 'Rangliste')}
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
                  <small className={won ? 'up' : 'down'}>{won ? t('Win', 'Sieg') : t('Loss', 'Niederlage')}</small>
                </span>
              );
            })}
          </h1>
          <div className="facts num">
            <span>
              {when.toLocaleDateString(locale(lang), { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })},{' '}
              {when.toLocaleTimeString(locale(lang), { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span>{duration(data.seconds)} min</span>
            {data.patch && <span>Patch {data.patch}</span>}
          </div>
        </div>
      </section>

      {data.disputed && (
        <div className="notice" role="note">
          {t(
            "The uploads of this game contradict each other, so it doesn't count for the rating.",
            'Die Uploads zu diesem Spiel widersprechen sich. Es zählt deshalb nicht für die Wertung.',
          )}
        </div>
      )}
      {data.source === 'uploads' && (
        <div className="notice" role="note">
          {t(
            "This game isn't in the raw data archive yet. Names only come from players who upload themselves and from their friends in the game.",
            'Dieses Spiel liegt noch nicht im Rohdatenarchiv. Namen gibt es deshalb nur von Spielern, die selbst hochladen, und von ihren Freunden im Spiel.',
          )}
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
        {t("You're in this game and don't want to be named?", 'Du stehst hier und möchtest nicht genannt werden?')}{' '}
        <Link href={href(`/privacy/remove?game=${data.gameId}`)}>{t('Hide name', 'Namen ausblenden')}</Link>
      </p>

      <div className="grid cols-main">
        <div className="card">
          <div className="card-head">
            <h2>{t('Comparison', 'Vergleich')}</h2>
            <Tabs<Measure>
              label={t('Stat', 'Wert')}
              value={measure}
              onChange={setMeasure}
              options={MEASURES.map((m) => ({ id: m.id, label: t(...m.label) }))}
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
  const { t, num, href } = useLang();
  const rows = view.players.map((p, i) => ({ p, i })).filter(({ p }) => p.team === team);
  const won = rows.some(({ p }) => p.win);
  return (
    <section className="card team-card" data-side={team} aria-label={sideName(team, t)}>
      <h2>
        {sideName(team, t)} ·{' '}
        <span className={won ? 'up' : 'down'}>{won ? t('Win', 'Sieg') : t('Loss', 'Niederlage')}</span>
      </h2>
      <div className="table-wrap flat">
        <table className="table">
          <thead>
            <tr>
              <th>{t('Player', 'Spieler')}</th>
              <th>{t('Grade', 'Note')}</th>
              <th className="right">K / D / A</th>
              <th className="right hide-sm">{t('Damage', 'Schaden')}</th>
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
                            <Link href={href(profileHref({ puuid: link, name }))} title={name}>
                              <b>{riot}</b>
                            </Link>
                          ) : (
                            <b title={name}>{riot}</b>
                          )
                        ) : (
                          <b className="faint">{t('No name', 'Ohne Namen')}</b>
                        )}
                        <small>
                          {champ?.name ?? p.champion ?? 'Champion'}
                          {tag && <span className="hide-sm"> · #{tag}</span>}
                          {p.level !== null && (
                            <span className="hide-sm">
                              {' '}
                              · {t('Level', 'Stufe')} {p.level}
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
                      title={t('Explain grade', 'Note erklären')}
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
  const { num } = useLang();
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
  const { lang, t } = useLang();
  return (
    <aside className="card explain" aria-live="polite">
      <h2>{t('Why this grade', 'Warum diese Note')}</h2>
      <div className="who">
        {mark ? <GradeIcon grade={mark.grade} size={56} /> : <Img className="champ lg" src={championImage(dragon, champ?.id)} size={44} />}
        <span style={{ minWidth: 0 }}>
          <b>{name ? splitName(name).name : champ?.name ?? p.champion ?? '–'}</b>
          <small>
            {champ?.name ?? p.champion ?? 'Champion'}
            {mark &&
              t(
                ` · better than ${Math.round(mark.pct * 100)} % of all games`,
                ` · besser als ${Math.round(mark.pct * 100)} % aller Spiele`,
              )}
          </small>
        </span>
      </div>
      {!mark || !axes ? (
        <p className="fine" style={{ marginTop: 12 }}>
          {view.seconds < MIN_SECONDS
            ? t('Games under 8 minutes (remakes) get no grade.', 'Spiele unter 8 Minuten (Remakes) bekommen keine Note.')
            : t('This game lacks stats the grade needs.', 'Für dieses Spiel fehlen Werte, die die Note braucht.')}
        </p>
      ) : (
        <>
          {mark.afk && (
            <p className="fine" style={{ marginTop: 12 }}>
              {t('Barely earned any gold: rated as AFK, grade F.', 'Kaum Gold verdient: als abwesend gewertet, Note F.')}
            </p>
          )}
          <ul className="axes">
            {axes.map((value, i) => {
              const label = Object.values(axesIn(lang))[i];
              const word =
                value > 0.25
                  ? t('above average', 'über dem Schnitt')
                  : value < -0.25
                    ? t('below average', 'unter dem Schnitt')
                    : t('as usual', 'wie üblich');
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
            {t(
              `Each axis is the share of the lobby, compared with what ${champ?.name ?? 'this champion'} usually reaches. Win or loss doesn't count. Another grade: tap a player's grade.`,
              `Jede Achse ist der Anteil an der Lobby, verglichen mit dem, was ${champ?.name ?? 'dieser Champion'} üblicherweise schafft. Sieg oder Niederlage zählt nicht. Andere Note: auf die Note eines Spielers tippen.`,
            )}
          </p>
        </>
      )}
    </aside>
  );
}
