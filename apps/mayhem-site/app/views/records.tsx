'use client';
// The records as a ledger: one row per category, its name left, place 1 large in the middle (the
// first category with the splash of the game), the next places right. Records from the last seven
// days are marked "New" and listed once above as links.
import Link from 'next/link';
import { recordText, type RecordPlace, type RecordView } from '../../src/records';
import { Img, Problem } from '../ui/bits';
import { Filters, useFilters, type Scope } from '../ui/filters';
import { championImage, profileHref, profileImage, splashImage, splitName, useDragon, useLive } from '../ui/data';
import { useLang } from '../ui/i18n';
import { meText, useMe } from '../ui/me';

type Records = {
  scope: Scope;
  season: { id: string; year: number; number: number; start: number };
  games: number;
  players: number;
  categories: RecordView[];
};
type Dragon = ReturnType<typeof useDragon>;
type Lang = ReturnType<typeof useLang>;

const valueText = (num: Lang['num'], category: RecordView, value: number) =>
  category.unit === 'seconds' ? `${num(value)} s` : num(value);
const gameLink = (p: RecordPlace) => `/game/${p.game.gameId}?p=${encodeURIComponent(p.puuid)}`;
const profileLink = (p: RecordPlace) => profileHref(p);
const keyOf = (dragon: Dragon, p: RecordPlace) => p.game.champion || dragon?.champions.get(p.game.championId)?.id || '';
const championOf = (dragon: Dragon, p: RecordPlace) =>
  dragon?.champions.get(p.game.championId)?.name ?? (p.game.championName || p.game.champion || 'Champion');

export default function RecordsPage() {
  const { lang, t, href, num, season } = useLang();
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
          <h1>{t('Records', 'Rekorde')}</h1>
          <p className="page-sub">{data && scope === 'season' ? season(data.season) : t('All time', 'Alle Zeiten')}</p>
        </div>
        <div className="side">
          <span className="live" data-on={live}>
            {live ? 'Live' : t('Updates every 5 s', 'Aktualisiert alle 5 s')}
          </span>
          <Filters {...filters} />
        </div>
      </div>

      {error && <Problem message={error} />}
      {!data && !error && <p className="empty">{t('Loading records …', 'Rekorde werden geladen …')}</p>}

      {data && !shown.length && (
        <div className="card empty">
          {scope === 'season'
            ? t('No records this season yet.', 'In dieser Saison gibt es noch keine Rekorde.')
            : <>{t('No records yet. They appear as soon as someone uploads games.', 'Noch keine Rekorde. Sie erscheinen, sobald jemand Spiele hochlädt.')} <a href={href('/join')}>{t('Join', 'Mitmachen')}</a></>}
        </div>
      )}

      {fresh.length > 0 && (
        <p className="fresh-line">
          <b>{t('New this week:', 'Neu diese Woche:')}</b>{' '}
          {fresh.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ', '}
              <a href={'#' + c.id}>{recordText(c, lang).title}</a>
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
          {t(
            `${num(data.games)} games from ${num(data.players)} players. Only uploaded games count, disputed ones don't. Missing values of older games never count as 0. Records from the last seven days are marked "New".`,
            `${num(data.games)} Spiele von ${num(data.players)} Spielern. Es zählen nur hochgeladene Spiele, umstrittene nicht. Fehlende Werte älterer Spiele zählen nie als 0. Rekorde der letzten sieben Tage sind als „Neu“ markiert.`,
          )}
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
  const { lang, t, href, num, date } = useLang();
  const words = meText(t);
  const label = recordText(category, lang);
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
            <Link href={href(profileLink(top))} title={top.name}>
              <b>{name}</b>
            </Link>
            {tag && <small className="faint">#{tag}</small>}
            {top.puuid === me?.id && <span className="me-tag">{words.you}</span>}
          </span>
        </div>
        <div className="record-value">
          <strong className="num">{valueText(num, category, top.value)}</strong>
          {category.places[1]?.place === 1 && <span className="badge">{t('Tie', 'Gleichstand')}</span>}
          {top.fresh && <span className="badge">{t('New', 'Neu')}</span>}
        </div>
        <div className="record-game">
          <Img className="champ" src={championImage(dragon, key || undefined)} alt="" size={24} />
          <span>
            {total ? t('last with ', 'zuletzt mit ') : ''}
            {championOf(dragon, top)}, {date(top.game.at)}
          </span>
          <Link className="record-link" href={href(gameLink(top))}>
            {t('View game', 'Spiel ansehen')}
          </Link>
        </div>
      </div>

      {rest.length > 0 && (
        <ol className="record-list">
          {rest.map((p) => (
            <li key={p.puuid} data-place={p.place} data-me={p.puuid === me?.id || undefined}>
              <span className="place num">{p.place}</span>
              <Img className="champ" src={championImage(dragon, keyOf(dragon, p) || undefined)} alt={championOf(dragon, p)} size={22} />
              <Link className="label" href={href(profileLink(p))} title={p.name}>
                {splitName(p.name).name}
              </Link>
              {p.fresh && <span className="badge">{t('New', 'Neu')}</span>}
              <Link
                className="num value"
                href={href(gameLink(p))}
                title={`${t('View game', 'Spiel ansehen')}: ${championOf(dragon, p)}, ${date(p.game.at)}`}
              >
                {valueText(num, category, p.value)}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
