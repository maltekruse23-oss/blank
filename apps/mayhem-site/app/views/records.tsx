'use client';
// The records as a ledger: one row per category, its name left, place 1 large in the middle (the
// first category with the splash of the game), the next places right. Records from the last seven
// days are marked "New" and listed once above as links.
import Link from 'next/link';
import { recordText, type RecordPlace, type RecordView } from '../../src/records';
import { Img, Problem } from '../ui/bits';
import { Filters, useFilters, type Scope } from '../ui/filters';
import { championImage, profileHref, profileImage, splashImage, splitName, useDragon, useLive } from '../ui/data';
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

const valueText = (category: RecordView, value: number) =>
  category.unit === 'seconds' ? `${num(value)} s` : num(value);
const gameLink = (p: RecordPlace) => `/game/${p.game.gameId}?p=${encodeURIComponent(p.puuid)}`;
const profileLink = (p: RecordPlace) => profileHref(p);
const keyOf = (dragon: Dragon, p: RecordPlace) => p.game.champion || dragon?.champions.get(p.game.championId)?.id || '';
const championOf = (dragon: Dragon, p: RecordPlace) =>
  dragon?.champions.get(p.game.championId)?.name ?? (p.game.championName || p.game.champion || 'Champion');

export default function RecordsPage() {
  const filters = useFilters();
  const { scope } = filters;
  const { data, error, live } = useLive<Records>('/api/rekorde?' + filters.query);
  const dragon = useDragon();

  const shown = data?.categories.filter((c) => c.places.length) ?? [];
  const fresh = shown.filter((c) => c.places[0].fresh);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Records</h1>
          <p className="page-sub">{data && scope === 'season' ? season(data.season) : 'All time'}</p>
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
        <div className="card empty">
          {scope === 'season'
            ? 'No records this season yet.'
            : <>No records yet. They appear as soon as someone uploads games. <a href="/join">Join</a></>}
        </div>
      )}

      {fresh.length > 0 && (
        <p className="fresh-line">
          <b>New this week:</b>{' '}
          {fresh.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ', '}
              <a href={'#' + c.id}>{recordText(c).title}</a>
            </span>
          ))}
        </p>
      )}

      {shown.length > 0 && (
        <div className="records">
          {shown.map((c) => (
            <RecordCard key={c.id} category={c} dragon={dragon} />
          ))}
        </div>
      )}

      {data && shown.length > 0 && (
        <p className="fine" style={{ marginTop: 'var(--gap)' }}>
          {`${num(data.games)} games from ${num(data.players)} players. Only uploaded games count, disputed ones don't. Missing values of older games never count as 0. Records from the last seven days are marked "New".`}
        </p>
      )}
    </>
  );
}

function RecordCard({ category, dragon }: { category: RecordView; dragon: Dragon }) {
  const [top, ...rest] = category.places;
  const key = keyOf(dragon, top);
  const splash = key
    ? [top.game.skin ? `url(${splashImage(key, top.game.skin)})` : '', `url(${splashImage(key)})`].filter(Boolean).join(', ')
    : null;
  const { name, tag } = splitName(top.name);
  const words = meText;
  const label = recordText(category);
  const me = useMe();
  const total = category.kind === 'total';
  return (
    <article className="card record" id={category.id} data-hue={category.hue} aria-labelledby={category.id + '-title'}>
      <header>
        <h2 id={category.id + '-title'}>{label.title}</h2>
        <small>{label.note}</small>
      </header>

      <div className="record-top" data-me={top.puuid === me?.id || undefined} style={splash ? ({ '--splash': splash } as React.CSSProperties) : undefined}>
        <div className="record-holder">
          <svg className="crown" width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path d="M3 18h18l-1.6-10-4.9 4.2L12 5l-2.5 7.2L4.6 8z" fill="currentColor" />
          </svg>
          <Img className="avatar" src={profileImage(dragon, top.icon)} size={34} />
          <span style={{ minWidth: 0 }}>
            <Link href={profileLink(top)} title={top.name}>
              <b>{name}</b>
            </Link>
            {tag && <small className="faint">#{tag}</small>}
            {top.puuid === me?.id && <span className="me-tag">{words.you}</span>}
          </span>
        </div>
        <div className="record-value">
          <strong className="num">{valueText(category, top.value)}</strong>
          {category.places[1]?.place === 1 && <span className="badge">Tie</span>}
          {top.fresh && <span className="badge">New</span>}
        </div>
        <div className="record-game">
          <Img className="champ" src={championImage(dragon, key || undefined)} alt="" size={24} />
          <span>
            {total ? 'last with ' : ''}
            {championOf(dragon, top)}, {date(top.game.at)}
          </span>
          <Link className="record-link" href={gameLink(top)}>
            View game
          </Link>
        </div>
      </div>

      {rest.length > 0 && (
        <ol className="record-list">
          {rest.map((p) => (
            <li key={p.puuid} data-place={p.place} data-me={p.puuid === me?.id || undefined}>
              <span className="place num">{p.place}</span>
              <Img className="champ" src={championImage(dragon, keyOf(dragon, p) || undefined)} alt={championOf(dragon, p)} size={22} />
              <Link className="label" href={profileLink(p)} title={p.name}>
                {splitName(p.name).name}
              </Link>
              {p.fresh && <span className="badge">New</span>}
              <Link
                className="num value"
                href={gameLink(p)}
                title={`${'View game'}: ${championOf(dragon, p)}, ${date(p.game.at)}`}
              >
                {valueText(category, p.value)}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
