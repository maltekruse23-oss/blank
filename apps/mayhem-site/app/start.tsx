'use client';
// The start page (taste-skill rework 06.10.2026): left the question and the search, right the top
// three of the ladder; a strip of head numbers; the games of the day (one large, two small); then
// places 4 to 10 beside the grades of the season and this week's new records (all from /api/start).
import Link from 'next/link';
import { useState } from 'react';
import type { Grade } from '../src/features/aram/aramPerformance';
import { rankName, seasonName, seasonOf } from '../src/features/aram/aramRating';
import { gradeShares } from '../src/explain';
import type { RecordView } from '../src/records';
import type { DayGame, StartView } from '../src/start';
import { GradeChip, GradeIcon, Problem, RankLine, TierMark } from './ui/bits';
import { PlayerRow } from './ui/player-row';
import { ME_TEXT, setMe, useMe, type Me } from './ui/me';
import type { Placement, PlacesView } from '../src/places';
import { Search } from './ui/header';
import {
  ago,
  championKey,
  championLabel,
  de,
  profileHref,
  splashImage,
  splitName,
  useDragon,
  useLive,
  useNow,
  type PlayerSummary,
} from './ui/data';

type Start = StartView & {
  trackedGames: number;
  top: PlayerSummary[];
  records: RecordView[];
};
type Dragon = ReturnType<typeof useDragon>;

/** Share of all games that get SSS or MAYHEM. */
const RARE = gradeShares()
  .filter((g) => g.grade === 'SSS' || g.grade === 'MAYHEM')
  .reduce((t, g) => t + g.share, 0);

export default function StartPage() {
  const { data, error } = useLive<Start>('/api/start');
  const dragon = useDragon();
  const now = useNow();
  const mayhem = data?.grades.find((g) => g.grade === 'MAYHEM')?.games;
  const me = useMe();

  return (
    <>
      <section className="start-hero" aria-label="Suche">
        <div className="start-ask">
          <h1>{ME_TEXT.findTitle}</h1>
          <p className="muted start-lead">{ME_TEXT.findLead}</p>
          <Search big />
          {!me && <p className="fine start-nudge">{ME_TEXT.markNudge}</p>}
        </div>
        <Podium top={data?.top.slice(0, 3)} season={seasonName(seasonOf(now))} />
      </section>

      <dl className="start-facts">
        <div>
          <dt>Spiele</dt>
          <dd className="num">{data ? de(data.trackedGames) : '–'}</dd>
        </div>
        <div>
          <dt>Spieler</dt>
          <dd className="num">{data ? de(data.players) : '–'}</dd>
        </div>
        <div data-g="MAYHEM">
          <dt>MAYHEM-Noten diese Saison</dt>
          <dd className="num">{mayhem !== undefined ? de(mayhem) : '–'}</dd>
        </div>
      </dl>

      {me && <MyPlaces me={me} />}

      {error && <Problem message={error} />}

      {data && <DayPick games={data.today} dragon={dragon} now={now} />}

      {data && (
        <div className="start-more">
          <section aria-labelledby="top">
            <div className="card-head">
              <h2 id="top" className="section-title">
                Plätze 4 bis 10
              </h2>
              <Link href="/rangliste" className="faint">
                Ganze Rangliste
              </Link>
            </div>
            {data.top.length > 3 ? (
              <div className="table-wrap flat">
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Spieler</th>
                      <th>Rang</th>
                      <th className="hide-sm">Leistung Ø</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top.slice(3).map((p, i) => (
                      <PlayerRow key={p.puuid} player={p} place={i + 4} dragon={dragon} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty">{data.top.length ? 'Noch nicht mehr als drei Spieler.' : 'Noch keine Spieler. Wer in blank. das Hochladen erlaubt, erscheint hier.'}</p>
            )}
          </section>

          <aside className="start-side">
            <section aria-labelledby="grades">
              <h2 id="grades" className="section-title">
                Noten diese Saison
              </h2>
              {data.seasonGames ? (
                <GradeHistogram rows={data.grades} />
              ) : (
                <p className="empty">Diese Saison noch keine Noten.</p>
              )}
              <p className="fine" style={{ marginTop: 12 }}>
                SSS und MAYHEM bekommen nur die besten {de(RARE * 100, 1)}&nbsp;% aller Spiele.{' '}
                <Link href="/wertung#note">So entsteht die Note</Link>
              </p>
            </section>

            <section aria-labelledby="fresh">
              <div className="card-head">
                <h2 id="fresh" className="section-title">
                  Neue Rekorde der Woche
                </h2>
                <Link href="/rekorde" className="faint">
                  Alle
                </Link>
              </div>
              {data.records.length ? (
                <ul className="start-records">
                  {data.records.map((c) => (
                    <FreshRecord key={c.id} category={c} />
                  ))}
                </ul>
              ) : (
                <p className="empty">Diese Woche noch kein neuer Rekord.</p>
              )}
            </section>
          </aside>
        </div>
      )}
    </>
  );
}

/** The top three of the ladder beside the search: first place large with its emblem, second and
    third below. Empty frames while loading, so nothing jumps. */
function Podium({ top, season }: { top: PlayerSummary[] | undefined; season: string }) {
  if (top && !top.length) return null;
  const [first, ...rest] = top ?? [];
  return (
    <ol className="podium" aria-label={`Spitze der Rangliste, ${season}`} aria-busy={!top}>
      <li className="podium-one">
        {first ? (
          <Link href={profileHref(first)}>
            <span className="podium-text">
              <small className="num">Platz 1, {season}</small>
              <b>{splitName(first.name).name}</b>
              <span className="num muted">
                {first.rank ? `${rankName(first.rank)}, ${first.rank.points} MP` : 'Einstufung'}, {first.games} Spiele
              </span>
            </span>
            <TierMark rank={first.rank} size={132} />
          </Link>
        ) : (
          <span className="podium-wait" />
        )}
      </li>
      {(top ? rest : [undefined, undefined]).map((p, i) => (
        <li key={p?.puuid ?? i} className="podium-two">
          {p ? (
            <Link href={profileHref(p)}>
              <TierMark rank={p.rank} size={52} />
              <span>
                <b>{splitName(p.name).name}</b>
                <small className="num muted">{p.rank ? `${rankName(p.rank)}, ${p.rank.points} MP` : 'Einstufung'}</small>
              </span>
              <i className="num">{i + 2}</i>
            </Link>
          ) : (
            <span className="podium-wait" />
          )}
        </li>
      ))}
    </ol>
  );
}

/** The best games of the last 24 hours, three at a time: the best one large with its splash art,
    the next two beside it. "Neu würfeln" shows the next three once, like the one reroll in the
    game. */
function DayPick({ games, dragon, now }: { games: DayGame[]; dragon: Dragon; now: number }) {
  const [rolled, setRolled] = useState(false);
  const canRoll = games.length > PICK;
  const shown = rolled && canRoll ? games.slice(PICK, PICK * 2) : games.slice(0, PICK);
  return (
    <section className="day-pick" aria-labelledby="today">
      <div className="card-head">
        <h2 id="today" className="section-title">
          Spiele des Tages
        </h2>
        {canRoll && (
          <button type="button" className="button" disabled={rolled} onClick={() => setRolled(true)}>
            Neu würfeln ({rolled ? 0 : 1})
          </button>
        )}
      </div>
      {shown.length ? (
        <ol className="day-games" data-n={shown.length}>
          {shown.map((g, i) => (
            <DayGameItem key={`${g.gameId}-${g.puuid}`} game={g} dragon={dragon} now={now} big={i === 0} />
          ))}
        </ol>
      ) : (
        <p className="empty">In den letzten 24 Stunden wurde noch kein Spiel gewertet.</p>
      )}
    </section>
  );
}

/** Games shown at a time. */
const PICK = 3;

function DayGameItem({ game: g, dragon, now, big }: { game: DayGame; dragon: Dragon; now: number; big: boolean }) {
  const key = championKey(dragon, g);
  const champion = championLabel(dragon, g);
  const { name, tag } = splitName(g.name);
  const style = big && key ? ({ '--splash': `url(${splashImage(key, g.skin ?? 0)}), url(${splashImage(key)})` } as React.CSSProperties) : undefined;
  return (
    <li className={big ? 'day-game big' : 'day-game'} data-g={g.grade} style={style}>
      <Link href={`/spiel/${g.gameId}?p=${encodeURIComponent(g.puuid)}`} aria-label={`Spiel von ${name} mit ${champion} ansehen`}>
        <GradeIcon grade={g.grade} size={big ? 96 : 56} />
        <span className="day-who">
          <b>
            {name}
            {tag && <span className="faint">#{tag}</span>}
          </b>
          <small className="num muted">
            {champion}, {g.kills}/{g.deaths}/{g.assists}, {ago(g.at, now)}
          </small>
        </span>
        <span className="day-value num">
          {de(g.damage)}
          <small>Schaden</small>
        </span>
      </Link>
    </li>
  );
}

/** How many games of the season got each grade. */
function GradeHistogram({ rows }: { rows: { grade: Grade; games: number }[] }) {
  const most = Math.max(1, ...rows.map((r) => r.games));
  return (
    <div
      className="histogram grades"
      style={{ '--n': rows.length } as React.CSSProperties}
      role="img"
      aria-label={rows.map((r) => `${r.grade}: ${r.games}`).join(', ')}
    >
      {rows.map((r, i) => (
        <div key={r.grade} data-g={r.grade}>
          <span className="num">{r.games || ''}</span>
          <div className="track">
            <div className="bar" style={{ height: `${(r.games / most) * 100}%`, animationDelay: `${i * 40}ms` }} />
          </div>
          <span className="label">{r.grade === 'MAYHEM' ? 'M' : r.grade}</span>
        </div>
      ))}
    </div>
  );
}

function FreshRecord({ category: c }: { category: RecordView }) {
  const top = c.places[0];
  const value = c.unit === 'seconds' ? `${de(top.value)} s` : de(top.value);
  return (
    <li data-hue={c.hue}>
      <Link href={`/spiel/${top.game.gameId}?p=${encodeURIComponent(top.puuid)}`}>
        <b>{c.title}</b>
        <span className="num">{value}</span>
        <small>
          {splitName(top.name).name}
          {c.places.length > 1 && ` und ${c.places.length - 1} weitere`}
        </small>
      </Link>
    </li>
  );
}

/** Places shown before "Alle zeigen". */
const MY_PLACES = 6;

/** The visitor's own places (app/ui/me.ts, /api/plaetze), best first. */
function MyPlaces({ me }: { me: Me }) {
  const { data, missing } = useLive<PlacesView & { id: string }>('/api/plaetze/' + encodeURIComponent(me.id));
  const [all, setAll] = useState(false);
  const { name, tag } = splitName(data?.name || me.name);
  const list = data?.placements ?? [];
  const shown = all ? list : list.slice(0, MY_PLACES);
  return (
    <section className="card my-places" aria-labelledby="my-places">
      <div className="card-head">
        <h2 id="my-places">
          {ME_TEXT.placesTitle}
          <span className="faint">
            {' '}
            · {name}
            {tag && `#${tag}`}
          </span>
        </h2>
        <span className="my-places-links">
          <Link href={profileHref({ puuid: me.id, name: data?.name || me.name })} className="faint">
            {ME_TEXT.profile}
          </Link>
          <button type="button" className="link-button faint" onClick={() => setMe(null)}>
            {ME_TEXT.change}
          </button>
        </span>
      </div>
      {data && (
        <div className="my-places-head">
          <RankLine rank={data.rank} placed={data.placed} />
          {data.average && <GradeChip grade={data.average.grade} />}
        </div>
      )}
      {!data && !missing && <p className="empty">Wird geladen …</p>}
      {(missing || (data && !list.length)) && <p className="empty">{ME_TEXT.placesEmpty}</p>}
      {shown.length > 0 && (
        <ol className="my-places-list">
          {shown.map((p) => (
            <PlaceItem key={p.id} place={p} id={me.id} />
          ))}
        </ol>
      )}
      {list.length > MY_PLACES && (
        <button type="button" className="button more" onClick={() => setAll((a) => !a)}>
          {all ? 'Weniger zeigen' : `Alle ${list.length} Plätze zeigen`}
        </button>
      )}
    </section>
  );
}

function PlaceItem({ place: p, id }: { place: Placement; id: string }) {
  const label = p.kind === 'rank' ? ME_TEXT.ladder : p.kind === 'performance' ? ME_TEXT.performance : p.title;
  const href =
    p.kind === 'record' && p.gameId !== null
      ? `/spiel/${p.gameId}?p=${encodeURIComponent(id)}`
      : p.kind === 'record'
        ? `/rekorde#${p.id}`
        : '/rangliste';
  const value = p.value === null ? null : p.unit === 'seconds' ? `${de(p.value)} s` : de(p.value);
  const top = Math.max(1, Math.round((p.place / p.of) * 100));
  return (
    <li data-hue={p.hue ?? undefined} data-place={p.place}>
      <Link href={href}>
        <span className="num my-place">#{p.place}</span>
        <span className="my-place-what">
          <b>{label}</b>
          <small className="faint num">
            {ME_TEXT.placesFrom} {de(p.of)}
            {p.of >= 10 ? ` · Top ${top} %` : ''}
          </small>
        </span>
        {value && <span className="num my-place-value">{value}</span>}
      </Link>
    </li>
  );
}
