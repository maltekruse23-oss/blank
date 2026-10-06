'use client';
// The start page: the search, head numbers, the games of the day, the top ten of the ladder, the
// grades of the season and this week's new records (all from /api/start).
import Link from 'next/link';
import { useState } from 'react';
import type { Grade } from '../src/features/aram/aramPerformance';
import { seasonName, seasonOf } from '../src/features/aram/aramRating';
import { gradeShares } from '../src/explain';
import type { RecordView } from '../src/records';
import type { DayGame, StartView } from '../src/start';
import { GradeChip, GradeIcon, Problem, RankLine } from './ui/bits';
import { PlayerRow } from './ui/player-row';
import { ME_TEXT, setMe, useMe, type Me } from './ui/me';
import type { Placement, PlacesView } from '../src/places';
import { Search } from './ui/header';
import {
  ago,
  championKey,
  championLabel,
  de,
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
        <span className="eyebrow">ARAM: Mayhem · {seasonName(seasonOf(now))}</span>
        <h1>{ME_TEXT.findTitle}</h1>
        <p className="muted start-lead">{ME_TEXT.findLead}</p>
        <Search big />
        {!me && <p className="fine start-nudge">{ME_TEXT.markNudge}</p>}
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
      </section>

      {me && <MyPlaces me={me} />}

      {error && <Problem message={error} />}
      {!data && !error && <p className="empty">Wird geladen …</p>}

      {data && (
        <div className="grid cols-main">
          <div className="stack">
            <section className="card" aria-labelledby="today">
              <div className="card-head">
                <h2 id="today">Spiele des Tages</h2>
                <span className="faint">beste Noten der letzten 24 h</span>
              </div>
              {data.today.length ? (
                <ol className="day-games">
                  {data.today.map((g, i) => (
                    <DayCard key={`${g.gameId}-${g.puuid}`} game={g} place={i + 1} dragon={dragon} now={now} />
                  ))}
                </ol>
              ) : (
                <p className="empty">In den letzten 24 Stunden wurde noch kein Spiel gewertet.</p>
              )}
            </section>

            <section className="card" aria-labelledby="top">
              <div className="card-head">
                <h2 id="top">Top 10</h2>
                <Link href="/rangliste" className="faint">
                  Ganze Rangliste
                </Link>
              </div>
              {data.top.length ? (
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
                      {data.top.map((p, i) => (
                        <PlayerRow key={p.puuid} player={p} place={i + 1} dragon={dragon} />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty">Noch keine Spieler. Wer in blank. das Hochladen erlaubt, erscheint hier.</p>
              )}
            </section>
          </div>

          <aside className="stack">
            <section className="card" aria-labelledby="grades">
              <h2 id="grades">Noten diese Saison</h2>
              {data.seasonGames ? (
                <GradeHistogram rows={data.grades} />
              ) : (
                <p className="empty">Diese Saison noch keine Noten.</p>
              )}
              <p className="fine" style={{ marginTop: 12 }}>
                {de(data.seasonGames)} gewertete Spiele. SSS und MAYHEM bekommen nur die besten {de(RARE * 100, 1)}&nbsp;% aller Spiele.{' '}
                <Link href="/wertung#note">So entsteht die Note</Link>
              </p>
            </section>

            <section className="card" aria-labelledby="fresh">
              <div className="card-head">
                <h2 id="fresh">Neue Rekorde der Woche</h2>
                <Link href="/rekorde" className="faint">
                  Alle Rekorde
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

function DayCard({ game: g, place, dragon, now }: { game: DayGame; place: number; dragon: Dragon; now: number }) {
  const key = championKey(dragon, g);
  const champion = championLabel(dragon, g);
  const { name, tag } = splitName(g.name);
  const style = key ? ({ '--splash': `url(${splashImage(key, g.skin ?? 0)}), url(${splashImage(key)})` } as React.CSSProperties) : undefined;
  return (
    <li className="day-game" data-g={g.grade} style={style}>
      <Link className="day-link" href={`/spiel/${g.gameId}?p=${encodeURIComponent(g.puuid)}`} aria-label={`Spiel von ${name} mit ${champion} ansehen`}>
        <span className="day-place num">{place}</span>
        <GradeIcon grade={g.grade} size={56} />
        <div className="day-who">
          <b>
            {name}
            {tag && <span className="faint">#{tag}</span>}
          </b>
          <span className="muted">
            {champion} · <span className="num">{g.kills}/{g.deaths}/{g.assists}</span> ·{' '}
            <span className="num">{de(g.damage)}</span> Schaden
          </span>
          <small className="faint">{ago(g.at, now)}</small>
        </div>
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
          <Link href={'/players/' + encodeURIComponent(me.id)} className="faint">
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
