'use client';
// One champion: the facts of the table, the players with a profile on it by average grade, the
// augments by average grade (not by win rate: a win does not count here) and the best games.
// Below five graded games it says "wenige Daten" and shows no averages.
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { seasonName } from '../../../src/features/aram/aramRating';
import { MIN_GAMES, ROLES, type ChampionDetail, type ChampionGame } from '../../../src/champions';
import { Augment, GradeChip, GradeIcon, Img } from '../../ui/bits';
import { Filters, useFilters, type Scope } from '../../ui/filters';
import {
  championImage,
  championKey,
  championLabel,
  date,
  de,
  duration,
  profileImage,
  splashImage,
  splitName,
  useAugments,
  useDragon,
  useLive,
} from '../../ui/data';

type Detail = {
  scope: Scope;
  season: { id: string; year: number; number: number; start: number };
  group: { code: string; name: string } | null;
  champion: ChampionDetail;
};
type Dragon = ReturnType<typeof useDragon>;

const VALID = /^([1-9][0-9]{0,4}|[A-Za-z][A-Za-z0-9]{0,29})$/;
const profileLink = (puuid: string) => '/players/' + encodeURIComponent(puuid);
const gameLink = (g: ChampionGame) => `/spiel/${g.gameId}?p=${encodeURIComponent(g.puuid)}`;

export default function ChampionPage() {
  const params = useParams<{ name: string }>();
  const name = params.name;
  const filters = useFilters();
  const { data, error } = useLive<Detail>(VALID.test(name) ? `/api/champions/${name}?${filters.query}` : null);
  const dragon = useDragon();

  if (!VALID.test(name)) return <div className="error" role="alert">Unbekannter Champion.</div>;

  const c = data?.champion;
  const key = c ? championKey(dragon, c) : /^[0-9]+$/.test(name) ? '' : name;
  const title = c ? championLabel(dragon, c) : key;

  return (
    <>
      <Link className="back" href="/champions">
        ← Champions
      </Link>

      <section
        className="game-hero champ-hero"
        style={key ? ({ '--splash': `url(${splashImage(key)})` } as React.CSSProperties) : undefined}
      >
        <div className="champ-title">
          <Img className="champ" src={championImage(dragon, key || undefined)} alt="" size={64} />
          <div>
            <span className="eyebrow">
              ARAM: Mayhem · {data && filters.scope === 'season' ? seasonName(data.season) : 'Alle Zeiten'}
              {data?.group ? ` · ${data.group.name}` : ''}
            </span>
            <h1>{title || 'Champion'}</h1>
            {c && <div className="facts">{ROLES[c.role]}</div>}
          </div>
          {c?.grade && <GradeIcon grade={c.grade} size={72} />}
        </div>
        <div className="side champ-filters">
          <Filters {...filters} />
        </div>
      </section>

      {error && <div className="error" role="alert">{error}</div>}
      {!data && !error && <p className="empty">Champion wird geladen …</p>}

      {c && (
        <>
          {c.pct === null && (
            <div className="notice" role="note">
              Wenige Daten: erst {c.graded} von {MIN_GAMES} gewerteten Spielen. Durchschnitte erscheinen ab {MIN_GAMES}.
            </div>
          )}

          <div className="stat-row" style={{ marginBottom: 'var(--gap)' }}>
            <div className="stat">
              <small>Spiele</small>
              <strong className="num">{de(c.games)}</strong>
            </div>
            <div className="stat">
              <small>Note Ø</small>
              <strong>{c.grade ?? '–'}</strong>
            </div>
            <div className="stat">
              <small>SSS oder MAYHEM</small>
              <strong className="num">{c.top === null ? '–' : `${de(c.top * 100, 1)} %`}</strong>
            </div>
            <div className="stat">
              <small>Schaden/Min Ø</small>
              <strong className="num">{c.damagePerMinute === null ? '–' : de(c.damagePerMinute)}</strong>
            </div>
          </div>

          <div className="grid cols-main">
            <div className="stack">
              <Players detail={c} dragon={dragon} />
              <BestGames detail={c} dragon={dragon} champion={key} />
            </div>
            <Augments detail={c} />
          </div>

          <p className="fine" style={{ marginTop: 'var(--gap)' }}>
            Spiele, Note und Schaden zählen jeden Platz eines Spiels mit den Werten aller zehn. Bestenliste, Augments und
            beste Spiele kommen nur aus hochgeladenen Spielen, also nur von Spielern mit Profil. Sieg oder Niederlage
            zählen nicht.
          </p>
        </>
      )}
    </>
  );
}

function Players({ detail, dragon }: { detail: ChampionDetail; dragon: Dragon }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Bestenliste</h2>
      </div>
      {detail.players.length ? (
        <div className="table-wrap flat">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Spieler</th>
                <th className="right">Spiele</th>
                <th>Note Ø</th>
                <th className="right hide-sm">K / D / A</th>
                <th className="right hide-sm">Schaden/Min</th>
                <th className="hide-sm">Bestes Spiel</th>
              </tr>
            </thead>
            <tbody>
              {detail.players.map((p, i) => {
                const { name, tag } = splitName(p.name);
                return (
                  <tr key={p.puuid} data-place={p.pct === null ? undefined : i + 1}>
                    <td className="place num">{i + 1}</td>
                    <td>
                      <Link className="who" href={profileLink(p.puuid)} title={p.name}>
                        <Img className="avatar" src={profileImage(dragon, p.icon)} size={28} />
                        <span style={{ minWidth: 0 }}>
                          <b>{name}</b>
                          {tag && <small>#{tag}</small>}
                        </span>
                      </Link>
                    </td>
                    <td className="right num">{p.games}</td>
                    <td>{p.grade ? <GradeChip grade={p.grade} /> : '–'}</td>
                    <td className="right num hide-sm">
                      {de(p.kills, 1)} / {de(p.deaths, 1)} / {de(p.assists, 1)}
                    </td>
                    <td className="right num hide-sm">{de(p.damagePerMinute)}</td>
                    <td className="hide-sm">
                      {p.best ? (
                        <Link href={`/spiel/${p.best.gameId}?p=${encodeURIComponent(p.puuid)}`} title="Spiel ansehen">
                          <GradeChip grade={p.best.grade} />
                        </Link>
                      ) : (
                        '–'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">Noch niemand mit Profil hat diesen Champion gespielt.</p>
      )}
    </section>
  );
}

function BestGames({ detail, dragon, champion }: { detail: ChampionDetail; dragon: Dragon; champion: string }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Beste Spiele</h2>
      </div>
      {detail.best.length ? (
        <ol className="champ-games">
          {detail.best.map((g) => {
            const splash = champion
              ? [g.skin ? `url(${splashImage(champion, g.skin)})` : '', `url(${splashImage(champion)})`].filter(Boolean).join(', ')
              : null;
            return (
              <li key={`${g.gameId}:${g.puuid}`} style={splash ? ({ '--splash': splash } as React.CSSProperties) : undefined}>
                <GradeIcon grade={g.grade} size={40} />
                <Link className="who" href={profileLink(g.puuid)} title={g.name}>
                  <Img className="avatar" src={profileImage(dragon, g.icon)} size={26} />
                  <b>{splitName(g.name).name}</b>
                </Link>
                <span className="num muted">
                  {g.kills} / {g.deaths} / {g.assists} · {de(g.damage)} Schaden
                </span>
                <span className="num faint hide-sm">
                  {date(g.at)} · {duration(g.seconds)} min
                </span>
                <Link className="record-link" href={gameLink(g)}>
                  Spiel ansehen
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="empty">Noch kein gewertetes Spiel von Spielern mit Profil.</p>
      )}
    </section>
  );
}

function Augments({ detail }: { detail: ChampionDetail }) {
  const known = useAugments();
  return (
    <section className="card">
      <div className="card-head">
        <h2>Augments</h2>
      </div>
      {detail.augments.length ? (
        <>
          <table className="table augment-table">
            <thead>
              <tr>
                <th>Augment</th>
                <th className="right">Spiele</th>
                <th>Note Ø</th>
              </tr>
            </thead>
            <tbody>
              {detail.augments.map((a) => (
                <tr key={a.id}>
                  <td>
                    <span className="augment-name">
                      <Augment id={a.id} info={known.get(a.id)} size={26} />
                      {known.get(a.id)?.name ?? <span className="num muted">#{a.id}</span>}
                    </span>
                  </td>
                  <td className="right num">{a.games}</td>
                  <td>
                    {a.grade ? (
                      <GradeChip grade={a.grade} small />
                    ) : (
                      <span className="faint" title={`Weniger als ${MIN_GAMES} gewertete Spiele`}>
                        wenige Daten
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fine" style={{ marginTop: 10 }}>
            Ø Note statt Siegquote, weil der Sieg nicht zählt. Namen und Symbole schickt blank. mit; ein Augment, das
            noch niemand geschickt hat, steht mit seiner Nummer da.
          </p>
        </>
      ) : (
        <p className="empty">Keine Augments in hochgeladenen Spielen.</p>
      )}
    </section>
  );
}
