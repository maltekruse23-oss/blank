'use client';
// The start page: are you in, and who is on top? The search and the top three in one glass hero
// with three head numbers, then the games of the day (one large, two small); below the fold the
// places 4 to 10 beside this week's new records. "Your places" appear for a visitor who marked
// themselves ("That's me"). All from /api/start.
import Link from 'next/link';
import { useState } from 'react';
import { rankName, seasonOf } from '../../src/features/aram/aramRating';
import { gradeShares } from '../../src/explain';
import { recordText, type RecordView } from '../../src/records';
import type { DayGame, StartView } from '../../src/start';
import type { Placement, PlacesView } from '../../src/places';
import { GradeChip, GradeIcon, Img, More, Problem, RankCell, TierMark, points, step } from '../ui/bits';
import { meText, setMe, useMe, type Me } from '../ui/me';
import { num, season, ago } from '../ui/format';
import { Search } from '../ui/header';
import {
  championImage,
  championKey,
  championLabel,
  profileHref,
  profileImage,
  splashImage,
  splitName,
  useDragon,
  useLive,
  useNow,
  type PlayerSummary,
} from '../ui/data';

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
      <section className="glass start-hero in" aria-label="Search">
        <div className="start-ask">
          <span className="kicker">ARAM: Mayhem leaderboard</span>
          <h1>{meText.findTitle}</h1>
          <p className="lead">{meText.findLead}</p>
          <Search big />
          {!me && <p className="fine">{meText.markNudge}</p>}
          <dl className="facts">
            <div>
              <dt>Games</dt>
              <dd>{data ? num(data.trackedGames) : '–'}</dd>
            </div>
            <div>
              <dt>Players</dt>
              <dd>{data ? num(data.players) : '–'}</dd>
            </div>
            <div data-g="MAYHEM" title={`Only the best ${num(RARE * 100, 1)}% of all games get SSS or MAYHEM.`}>
              <dt>MAYHEM grades this season</dt>
              <dd>{mayhem !== undefined ? num(mayhem) : '–'}</dd>
            </div>
          </dl>
        </div>
        <TopThree top={data?.top.slice(0, 3)} season={season(seasonOf(now))} dragon={dragon} />
      </section>

      {me && <MyPlaces me={me} />}

      {error && <Problem message={error} />}

      {data && <DayPick games={data.today} dragon={dragon} now={now} />}

      {data && (
        <div className="start-more">
          <section className="section" aria-labelledby="top">
            <div className="section-head">
              <h2 id="top">Places 4 to 10</h2>
              <Link href="/leaderboard">Full leaderboard</Link>
            </div>
            {data.top.length > 3 ? (
              <More
                list={data.top.slice(3)}
                label="Places 4 to 10"
                render={(p, i) => <PlayerRow key={p.puuid} player={p} place={i + 4} dragon={dragon} index={i} />}
              />
            ) : (
              <p className="empty">
                {data.top.length ? 'No more than three players yet.' : 'No players yet. Anyone who allows uploads in blank. shows up here.'}
              </p>
            )}
          </section>

          <section className="section" aria-labelledby="fresh">
            <div className="section-head">
              <h2 id="fresh">{"This week's new records"}</h2>
              <Link href="/records">All records</Link>
            </div>
            {data.records.length ? (
              <ul className="rows">
                {data.records.map((c, i) => (
                  <FreshRecord key={c.id} category={c} dragon={dragon} index={i} />
                ))}
              </ul>
            ) : (
              <p className="empty">No new record this week yet.</p>
            )}
          </section>
        </div>
      )}
    </>
  );
}

/** The top three of the ladder beside the search: first place large with its emblem. Empty
 * frames while loading, so nothing jumps. */
function TopThree({ top, season, dragon }: { top: PlayerSummary[] | undefined; season: string; dragon: Dragon }) {
  if (top && !top.length)
    return (
      <div className="tile" data-tone="quiet">
        <h2>Nobody on top yet</h2>
        <p className="fine">
          The first uploaded games put the first players here. <Link href="/join">Join</Link>
        </p>
      </div>
    );
  return (
    <section className="start-top" aria-label={`Top of the leaderboard, ${season}`} aria-busy={!top}>
      <div className="section-head">
        <h2>Top of the leaderboard</h2>
        <span className="fine">{season}</span>
      </div>
      <ol className="rows">
        {(top ?? [undefined, undefined, undefined]).map((p, i) =>
          p ? (
            <li key={p.puuid} className="row in" data-place={i + 1} style={step(i + 1)}>
              <span className="place">{i + 1}</span>
              <Img className="avatar" src={profileImage(dragon, p.icon)} size={i === 0 ? 44 : 36} />
              <span className="who">
                <Link className="stretch name" href={profileHref(p)} title={`${p.games} games`}>
                  <span>{splitName(p.name).name}</span>
                </Link>
                <small data-tier={p.rank?.tier.id}>
                  {p.rank ? (
                    <>
                      <span className="tier-text">{rankName(p.rank)}</span> · {points(p.rank.points)}
                    </>
                  ) : (
                    'Placement'
                  )}
                </small>
              </span>
              <TierMark rank={p.rank} size={i === 0 ? 64 : 44} />
            </li>
          ) : (
            <li key={i} className="row" aria-hidden />
          ),
        )}
      </ol>
    </section>
  );
}

/** One compact row of the ladder: place, player, rank. */
function PlayerRow({ player: p, place, dragon, index }: { player: PlayerSummary; place: number; dragon: Dragon; index: number }) {
  const me = useMe();
  const mine = me?.id === p.puuid;
  const { name, tag } = splitName(p.name);
  return (
    <li className="row in" data-place={place} data-me={mine || undefined} style={step(index)}>
      <span className="place">{place}</span>
      <Img className="avatar" src={profileImage(dragon, p.icon)} size={34} />
      <span className="who">
        <Link className="stretch name" href={profileHref(p)} title={`${p.games} games${p.average ? ` · average grade ${p.average.grade}` : ''}`}>
          <span>{name}</span>
          {tag && <span className="tag hide-sm">#{tag}</span>}
          {mine && <span className="you">{meText.you}</span>}
        </Link>
      </span>
      <RankCell rank={p.rank} placed={p.placed} />
    </li>
  );
}

/** Games shown at a time. */
const PICK = 3;

/** The best games of the last 24 hours, three at a time: the best one large with its splash art,
    the next two beside it. "Reroll" shows the next three once, like the one reroll in the game. */
function DayPick({ games, dragon, now }: { games: DayGame[]; dragon: Dragon; now: number }) {
  const [rolled, setRolled] = useState(false);
  const canRoll = games.length > PICK;
  const shown = rolled && canRoll ? games.slice(PICK, PICK * 2) : games.slice(0, PICK);
  return (
    <section className="section" aria-labelledby="today">
      <div className="section-head">
        <h2 id="today">Games of the day</h2>
        {canRoll && (
          <button type="button" className="button small" disabled={rolled} onClick={() => setRolled(true)}>
            Reroll ({rolled ? 0 : 1})
          </button>
        )}
      </div>
      {shown.length ? (
        <ol className="day-games">
          {shown.map((g, i) => (
            <DayGameItem key={`${g.gameId}-${g.puuid}`} game={g} dragon={dragon} now={now} big={i === 0} index={i} />
          ))}
        </ol>
      ) : (
        <p className="empty">No game was rated in the last 24 hours.</p>
      )}
    </section>
  );
}

function DayGameItem({ game: g, dragon, now, big, index }: { game: DayGame; dragon: Dragon; now: number; big: boolean; index: number }) {
  const key = championKey(dragon, g);
  const champion = championLabel(dragon, g);
  const { name } = splitName(g.name);
  const style = {
    ...step(index + 2),
    ...(key ? { '--splash': `url(${splashImage(key, g.skin ?? 0)}), url(${splashImage(key)})` } : {}),
  } as React.CSSProperties;
  return (
    <li className={big ? 'day-game big in' : 'day-game in'} data-g={g.grade} style={style}>
      <Link href={`/game/${g.gameId}?p=${encodeURIComponent(g.puuid)}`} aria-label={`${name}'s game with ${champion}, grade ${g.grade}`} title={`${num(g.damage)} damage`}>
        <GradeIcon grade={g.grade} size={big ? 84 : 56} />
        <span className="who">
          <b>
            <span>{name}</span>
          </b>
          <small className="mono">
            {champion}, {g.kills} / {g.deaths} / {g.assists} · {ago(g.at, now)}
          </small>
        </span>
      </Link>
    </li>
  );
}

function FreshRecord({ category: c, dragon, index }: { category: RecordView; dragon: Dragon; index: number }) {
  const top = c.places[0];
  const value = c.unit === 'seconds' ? `${num(top.value)} s` : num(top.value);
  const key = top.game.champion || dragon?.champions.get(top.game.championId)?.id;
  return (
    <li className="row in" data-hue={c.hue} style={step(index)}>
      <Img className="champ" src={championImage(dragon, key || undefined)} size={36} />
      <span className="who">
        <Link className="stretch name" href={`/game/${top.game.gameId}?p=${encodeURIComponent(top.puuid)}`}>
          <span>{recordText(c).title}</span>
        </Link>
        <small>
          {splitName(top.name).name}
          {c.places.length > 1 && ` and ${c.places.length - 1} more`}
        </small>
      </span>
      <span className="value">
        <b>{value}</b>
      </span>
    </li>
  );
}

/** The visitor's own places (app/ui/me.ts, /api/plaetze), best first. */
function MyPlaces({ me }: { me: Me }) {
  const { data, missing } = useLive<PlacesView & { id: string }>('/api/plaetze/' + encodeURIComponent(me.id));
  const { name, tag } = splitName(data?.name || me.name);
  const list = data?.placements ?? [];
  return (
    <section className="section in" style={step(1)} aria-labelledby="my-places">
      <div className="section-head">
        <h2 id="my-places">
          {meText.placesTitle}
          <span className="faint">
            {' '}
            · {name}
            {tag && `#${tag}`}
          </span>
        </h2>
        <span className="tools">
          <Link className="link-button" href={profileHref({ puuid: me.id, name: data?.name || me.name })}>
            {meText.profile}
          </Link>
          <button type="button" className="link-button" onClick={() => setMe(null)}>
            {meText.change}
          </button>
        </span>
      </div>
      {data && (
        <div className="tools">
          <RankCell rank={data.rank} placed={data.placed} />
          {data.average && <GradeChip grade={data.average.grade} />}
        </div>
      )}
      {!data && !missing && <p className="empty">Loading …</p>}
      {(missing || (data && !list.length)) && <p className="empty">{meText.placesEmpty}</p>}
      {list.length > 0 && (
        <More list={list} className="rows grid" label={meText.placesTitle} render={(p, i) => <PlaceItem key={p.id} place={p} id={me.id} index={i} />} />
      )}
    </section>
  );
}

function PlaceItem({ place: p, id, index }: { place: Placement; id: string; index: number }) {
  const label =
    p.kind === 'rank' ? meText.ladder : p.kind === 'performance' ? meText.performance : recordText({ id: p.id, title: p.title ?? '' }).title;
  const href =
    p.kind === 'record' && p.gameId !== null ? `/game/${p.gameId}?p=${encodeURIComponent(id)}` : p.kind === 'record' ? `/records#${p.id}` : '/leaderboard';
  const value = p.value === null ? null : p.unit === 'seconds' ? `${num(p.value)} s` : num(p.value);
  const top = Math.max(1, Math.round((p.place / p.of) * 100));
  return (
    <li className="row in" data-place={p.place} style={step(index)}>
      <span className="place">#{p.place}</span>
      <span className="who">
        <Link className="stretch name" href={href} title={value ? `Your value: ${value}` : undefined}>
          <span>{label}</span>
        </Link>
        <small className="mono">
          {meText.placesFrom} {num(p.of)}
          {p.of >= 10 ? ` · Top ${top}%` : ''}
        </small>
      </span>
    </li>
  );
}
