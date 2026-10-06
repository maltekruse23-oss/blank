'use client';
// The records: one card per category in the colour of its kind, place 1 large with the splash of
// the game and a link to it, places 2–10 below. Records from the last seven days are marked "Neu".
import Link from 'next/link';
import { seasonName } from '../../src/features/aram/aramRating';
import type { RecordPlace, RecordView } from '../../src/records';
import { Img, Problem } from '../ui/bits';
import { Filters, useFilters, type Scope } from '../ui/filters';
import { championImage, date, de, profileImage, splashImage, splitName, useDragon, useLive } from '../ui/data';
import { ME_TEXT, useMe } from '../ui/me';

type Records = {
  scope: Scope;
  season: { id: string; year: number; number: number; start: number };
  games: number;
  players: number;
  categories: RecordView[];
};
type Dragon = ReturnType<typeof useDragon>;

const valueText = (category: RecordView, value: number) =>
  category.unit === 'seconds' ? `${de(value)} s` : de(value);
const gameLink = (p: RecordPlace) => `/spiel/${p.game.gameId}?p=${encodeURIComponent(p.puuid)}`;
const profileLink = (p: RecordPlace) => '/players/' + encodeURIComponent(p.puuid);
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
          <span className="eyebrow">
            ARAM: Mayhem · {data && scope === 'season' ? seasonName(data.season) : 'Alle Zeiten'}
          </span>
          <h1>Rekorde</h1>
        </div>
        <div className="side">
          <span className="live" data-on={live}>
            {live ? 'Live' : 'Aktualisiert alle 5 s'}
          </span>
          <Filters {...filters} />
        </div>
      </div>

      {error && <Problem message={error} />}
      {!data && !error && <p className="empty">Rekorde werden geladen …</p>}

      {data && !shown.length && (
        <div className="card empty">
          {scope === 'season'
            ? 'In dieser Saison gibt es noch keine Rekorde.'
            : <>Noch keine Rekorde. Sie erscheinen, sobald jemand Spiele hochlädt. <a href="/mitmachen">Mitmachen</a></>}
        </div>
      )}

      {fresh.length > 0 && (
        <section className="card fresh-strip" aria-label="Neu diese Woche">
          <h2>Neu diese Woche</h2>
          <ul>
            {fresh.map((c) => (
              <li key={c.id} data-hue={c.hue}>
                <a href={'#' + c.id}>
                  <b>{c.title}</b>
                  <span className="num">{valueText(c, c.places[0].value)}</span>
                  <small>{splitName(c.places[0].name).name}</small>
                </a>
              </li>
            ))}
          </ul>
        </section>
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
          {de(data.games)} Spiele von {de(data.players)} Spielern. Es zählen nur hochgeladene Spiele, umstrittene nicht.
          Fehlende Werte älterer Spiele zählen nie als 0. Rekorde der letzten sieben Tage sind als „Neu“ markiert.
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
  const me = useMe();
  const total = category.kind === 'total';
  return (
    <article className="card record" id={category.id} data-hue={category.hue} aria-labelledby={category.id + '-title'}>
      <header>
        <h2 id={category.id + '-title'}>{category.title}</h2>
        <small>{category.note}</small>
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
            {top.puuid === me?.id && <span className="me-tag">{ME_TEXT.you}</span>}
          </span>
        </div>
        <div className="record-value">
          <strong className="num">{valueText(category, top.value)}</strong>
          {category.places[1]?.place === 1 && <span className="badge">Gleichstand</span>}
          {top.fresh && <span className="badge">Neu</span>}
        </div>
        <div className="record-game">
          <Img className="champ" src={championImage(dragon, key || undefined)} alt="" size={24} />
          <span>
            {total ? 'zuletzt mit ' : ''}
            {championOf(dragon, top)} · {date(top.game.at)}
          </span>
          <Link className="record-link" href={gameLink(top)}>
            Spiel ansehen
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
              {p.fresh && <span className="badge">Neu</span>}
              <Link className="num value" href={gameLink(p)} title={`Spiel ansehen: ${championOf(dragon, p)}, ${date(p.game.at)}`}>
                {valueText(category, p.value)}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
