'use client';
// Who holds the records? One tile per category, lit in the color of its kind: the holder and the
// value (the one number), the champion and day below. Places 2 to 10 open on click. Records from the
// last seven days are marked "New"; the three newest are listed once above, the newest in gold.
import Link from 'next/link';
import { useState } from 'react';
import { recordText, type RecordPlace, type RecordView } from '../../src/records';
import { Img, More, Problem, step } from '../ui/bits';
import { Filters, useFilters, type Scope } from '../ui/filters';
import { championImage, profileHref, profileImage, splitName, useDragon, useLive } from '../ui/data';
import { meText, useMe } from '../ui/me';
import { num, season, date } from '../ui/format';

type Records = {
  scope: Scope;
  season: { id: string; year: number; number: number; start: number };
  games: number;
  players: number;
  categories: RecordView[];
};
type Dragon = ReturnType<typeof useDragon>;

const valueText = (category: RecordView, value: number) => (category.unit === 'seconds' ? `${num(value)} s` : num(value));
const gameLink = (p: RecordPlace) => `/game/${p.game.gameId}?p=${encodeURIComponent(p.puuid)}`;
const keyOf = (dragon: Dragon, p: RecordPlace) => p.game.champion || dragon?.champions.get(p.game.championId)?.id || '';
const championOf = (dragon: Dragon, p: RecordPlace) =>
  dragon?.champions.get(p.game.championId)?.name ?? (p.game.championName || p.game.champion || 'Champion');

export default function RecordsPage() {
  const filters = useFilters();
  const { scope } = filters;
  const { data, error, live } = useLive<Records>('/api/rekorde?' + filters.query);
  const dragon = useDragon();

  const shown = data?.categories.filter((c) => c.places.length) ?? [];
  const fresh = shown.filter((c) => c.places[0].fresh).sort((a, b) => b.places[0].game.at - a.places[0].game.at);
  const linked = fresh.slice(0, 3);

  return (
    <>
      <div className="page-head in">
        <div>
          <h1>Records</h1>
          <p className="page-sub">
            Who holds the records? {data && scope === 'season' ? season(data.season) : 'All time'}
            {data ? ` · ${num(data.games)} games from ${num(data.players)} players` : ''}
          </p>
        </div>
        <div className="side">
          <span className="live" data-on={live}>
            {live ? 'Live' : 'Updates every 5 s'}
          </span>
          <Filters {...filters} />
        </div>
      </div>

      {error && <Problem message={error} />}
      {!data && !error && <p className="empty">Loading records …</p>}

      {data && !shown.length && (
        <p className="empty">
          {scope === 'season' ? (
            'No records this season yet.'
          ) : (
            <>
              No records yet. They appear as soon as someone uploads games. <a href="/join">Join</a>
            </>
          )}
        </p>
      )}

      {fresh.length > 0 && (
        <nav className="pills in" aria-label="New this week" style={step(1)}>
          <span className="kicker">New this week:</span>
          {linked.map((c, i) => (
            <a key={c.id} className={i === 0 ? 'pill gold' : 'pill'} href={'#' + c.id}>
              {recordText(c).title}
            </a>
          ))}
          {fresh.length > linked.length && (
            <span className="pill" title={fresh.slice(linked.length).map((c) => recordText(c).title).join(', ')}>
              +{fresh.length - linked.length}
            </span>
          )}
        </nav>
      )}

      {shown.length > 0 && (
        <More
          list={shown}
          className="records"
          first={12}
          keep={(c) => linked.includes(c)}
          label="Records"
          render={(c, i) => <RecordCard key={c.id} category={c} dragon={dragon} index={i} />}
        />
      )}

      {data && shown.length > 0 && (
        <p className="fine">
          Only uploaded games count, disputed ones don&apos;t. Missing values of older games never count as 0. Records from the last
          seven days are marked &quot;New&quot;.
        </p>
      )}
    </>
  );
}

function RecordCard({ category, dragon, index }: { category: RecordView; dragon: Dragon; index: number }) {
  const [open, setOpen] = useState(false);
  const [top, ...rest] = category.places;
  const { name, tag } = splitName(top.name);
  const label = recordText(category);
  const me = useMe();
  const total = category.kind === 'total';
  const list = `${category.id}-places`;
  return (
    <li className="record" id={category.id} data-hue={category.hue}>
      <article className="tile in" style={step(index)} aria-labelledby={category.id + '-title'}>
        <div className="record-head">
          <div>
            <h2 id={category.id + '-title'}>{label.title}</h2>
            <small>{label.note}</small>
          </div>
          <span className="pills">
            {category.places[1]?.place === 1 && <span className="pill">Tie</span>}
            {top.fresh && <span className="pill">New</span>}
          </span>
        </div>
        <div className="record-holder" data-me={top.puuid === me?.id || undefined}>
          <svg className="crown" width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path d="M3 18h18l-1.6-10-4.9 4.2L12 5l-2.5 7.2L4.6 8z" fill="currentColor" />
          </svg>
          <Img className="avatar" src={profileImage(dragon, top.icon)} size={38} />
          <span className="who">
            <Link className="name" href={profileHref(top)} title={top.name}>
              <span>{name}</span>
              {tag && <span className="tag">#{tag}</span>}
              {top.puuid === me?.id && <span className="you">{meText.you}</span>}
            </Link>
            <small>
              {total ? 'last with ' : ''}
              {championOf(dragon, top)}, {date(top.game.at)}
            </small>
          </span>
          <Link className="value" href={gameLink(top)} title={`View game: ${championOf(dragon, top)}, ${date(top.game.at)}`}>
            <b>{valueText(category, top.value)}</b>
          </Link>
        </div>
        {rest.length > 0 && (
          <button type="button" className="more" aria-expanded={open} aria-controls={list} onClick={() => setOpen(!open)}>
            {open ? 'Hide the others' : `Show ${rest.length} more ${rest.length === 1 ? 'player' : 'players'}`}
          </button>
        )}
        {open && (
          <ol className="rows" id={list}>
            {rest.map((p) => (
              <li key={p.puuid} className="row" data-place={p.place} data-me={p.puuid === me?.id || undefined}>
                <span className="place">{p.place}</span>
                <Img className="champ" src={championImage(dragon, keyOf(dragon, p) || undefined)} alt={championOf(dragon, p)} size={26} />
                <span className="who">
                  <Link className="name" href={profileHref(p)} title={p.name}>
                    <span>{splitName(p.name).name}</span>
                    {p.fresh && <span className="top">New</span>}
                  </Link>
                </span>
                <Link className="value" href={gameLink(p)} title={`View game: ${championOf(dragon, p)}, ${date(p.game.at)}`}>
                  <b>{valueText(category, p.value)}</b>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </article>
    </li>
  );
}
