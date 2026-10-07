'use client';
// One champion: the facts of the table, the players with a profile on it by average grade, the
// augments and items with pick rate, win rate and average grade, and the best games.
// Below five graded games it says "little data" and shows no averages.
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { MIN_GAMES, roleName, type ChampionDetail, type ChampionGame } from '../../src/champions';
import { Augment, GradeChip, GradeIcon, Img, Problem } from '../ui/bits';
import { AugmentLink, ItemLink, MetaCells, MetaHeads, augmentLabel, itemLabel, percentIn, useMetaSort } from '../ui/meta';
import { useLang } from '../ui/i18n';
import { useState } from 'react';
import { combosOf, MIN_COMBO_GAMES, type Combo } from '../../src/builds';
import { Filters, useFilters, type Scope } from '../ui/filters';
import {
  championImage,
  championKey,
  championLabel,
  duration,
  itemImage,
  profileImage,
  splashImage,
  splitName,
  useAugments,
  useDragon,
  useItems,
  useLive,
  profileHref,
} from '../ui/data';

type Detail = {
  scope: Scope;
  season: { id: string; year: number; number: number; start: number };
  champion: ChampionDetail;
};
type Dragon = ReturnType<typeof useDragon>;

const VALID = /^([1-9][0-9]{0,4}|[A-Za-z][A-Za-z0-9]{0,29})$/;
const profileLink = (puuid: string, name: string) => profileHref({ puuid, name });
const gameLink = (g: ChampionGame) => `/game/${g.gameId}?p=${encodeURIComponent(g.puuid)}`;

export default function ChampionPage() {
  const { lang, t, href, num, season } = useLang();
  const percent = percentIn(lang);
  const params = useParams<{ name: string }>();
  const name = params.name;
  const filters = useFilters();
  const { data, error, missing } = useLive<Detail>(VALID.test(name) ? `/api/champions/${name}?${filters.query}` : null);
  const dragon = useDragon();

  if (!VALID.test(name)) return <Problem message={t('Unknown champion', 'Unbekannter Champion')} missing />;

  const c = data?.champion;
  const key = c ? championKey(dragon, c) : /^[0-9]+$/.test(name) ? '' : name;
  const title = c ? championLabel(dragon, c) : key;

  return (
    <>
      <Link className="back" href={href('/champions')}>
        ← Champions
      </Link>

      <section
        className="game-hero champ-hero"
        style={key ? ({ '--splash': `url(${splashImage(key)})` } as React.CSSProperties) : undefined}
      >
        <div className="champ-title">
          <Img className="champ" src={championImage(dragon, key || undefined)} alt="" size={64} />
          <div>
            <h1>{title || 'Champion'}</h1>
            <p className="page-sub">{data && filters.scope === 'season' ? season(data.season) : t('All time', 'Alle Zeiten')}</p>
            {c && <div className="facts">{roleName(c.role, lang)}</div>}
          </div>
          {c?.grade && <GradeIcon grade={c.grade} size={72} />}
        </div>
        <div className="side champ-filters">
          <Filters {...filters} />
        </div>
      </section>

      {error && <Problem message={error} missing={missing} />}
      {!data && !error && <p className="empty">{t('Loading champion …', 'Champion wird geladen …')}</p>}

      {c && (
        <>
          {c.pct === null && (
            <div className="notice" role="note">
              {t(
                `Little data: only ${c.graded} of ${MIN_GAMES} rated games. Averages show from ${MIN_GAMES} on.`,
                `Wenige Daten: erst ${c.graded} von ${MIN_GAMES} gewerteten Spielen. Durchschnitte erscheinen ab ${MIN_GAMES}.`,
              )}
            </div>
          )}

          <div className="stat-row" style={{ marginBottom: 'var(--gap)' }}>
            <div className="stat">
              <small>{t('Games', 'Spiele')}</small>
              <strong className="num">{num(c.games)}</strong>
            </div>
            <div className="stat">
              <small>{t('Avg grade', 'Note Ø')}</small>
              <strong>{c.grade ?? '–'}</strong>
            </div>
            <div className="stat">
              <small>{t('Pick rate', 'Pickrate')}</small>
              <strong className="num">{percent(c.pick)}</strong>
            </div>
            <div className="stat">
              <small>{t('Win rate', 'Siegquote')}</small>
              <strong className="num">{percent(c.winRate)}</strong>
            </div>
            <div className="stat">
              <small>{t('SSS or MAYHEM', 'SSS oder MAYHEM')}</small>
              <strong className="num">{percent(c.top)}</strong>
            </div>
            <div className="stat">
              <small>{t('Avg damage/min', 'Schaden/Min Ø')}</small>
              <strong className="num">{c.damagePerMinute === null ? '–' : num(c.damagePerMinute)}</strong>
            </div>
          </div>

          <div className="grid cols-main">
            <div className="stack">
              <Builds detail={c} dragon={dragon} />
              <Players detail={c} dragon={dragon} />
              <BestGames detail={c} dragon={dragon} champion={key} />
            </div>
            <div className="stack">
              <Augments detail={c} />
              <Items detail={c} dragon={dragon} />
            </div>
          </div>

          <p className="fine" style={{ marginTop: 'var(--gap)' }}>
            {t(
              'Games, pick rate, win rate, grade and damage count every seat of a game with the values of all ten. Top players, augments, items and best games come from the games with names (uploaded or archived). Win or loss does not count for the grade.',
              'Spiele, Pickrate, Siegquote, Note und Schaden zählen jeden Platz eines Spiels mit den Werten aller zehn. Bestenliste, Augments, Items und beste Spiele kommen aus den Spielen mit Namen (hochgeladen oder archiviert). Für die Note zählen Sieg oder Niederlage nicht.',
            )}
          </p>
        </>
      )}
    </>
  );
}

function Players({ detail, dragon }: { detail: ChampionDetail; dragon: Dragon }) {
  const { t, href, num } = useLang();
  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('Top players', 'Bestenliste')}</h2>
      </div>
      {detail.players.length ? (
        <div className="table-wrap flat">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('Player', 'Spieler')}</th>
                <th className="right">{t('Games', 'Spiele')}</th>
                <th>{t('Avg grade', 'Note Ø')}</th>
                <th className="right hide-sm">K / D / A</th>
                <th className="right hide-sm">{t('Damage/min', 'Schaden/Min')}</th>
                <th className="hide-sm">{t('Best game', 'Bestes Spiel')}</th>
              </tr>
            </thead>
            <tbody>
              {detail.players.map((p, i) => {
                const { name, tag } = splitName(p.name);
                return (
                  <tr key={p.puuid} data-place={p.pct === null ? undefined : i + 1}>
                    <td className="place num">{i + 1}</td>
                    <td>
                      <Link className="who" href={href(profileLink(p.puuid, p.name))} title={p.name}>
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
                      {num(p.kills, 1)} / {num(p.deaths, 1)} / {num(p.assists, 1)}
                    </td>
                    <td className="right num hide-sm">{num(p.damagePerMinute)}</td>
                    <td className="hide-sm">
                      {p.best ? (
                        <Link href={href(`/game/${p.best.gameId}?p=${encodeURIComponent(p.puuid)}`)} title={t('View game', 'Spiel ansehen')}>
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
        <p className="empty">{t('Nobody with a profile has played this champion yet.', 'Noch niemand mit Profil hat diesen Champion gespielt.')}</p>
      )}
    </section>
  );
}

function BestGames({ detail, dragon, champion }: { detail: ChampionDetail; dragon: Dragon; champion: string }) {
  const { t, href, num, date } = useLang();
  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('Best games', 'Beste Spiele')}</h2>
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
                <Link className="who" href={href(profileLink(g.puuid, g.name))} title={g.name}>
                  <Img className="avatar" src={profileImage(dragon, g.icon)} size={26} />
                  <b>{splitName(g.name).name}</b>
                </Link>
                <span className="num muted">
                  {g.kills} / {g.deaths} / {g.assists} · {num(g.damage)} {t('damage', 'Schaden')}
                </span>
                <span className="num faint hide-sm">
                  {date(g.at)} · {duration(g.seconds)} min
                </span>
                <Link className="record-link" href={href(gameLink(g))}>
                  {t('View game', 'Spiel ansehen')}
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="empty">{t('No rated game from players with a profile yet.', 'Noch kein gewertetes Spiel von Spielern mit Profil.')}</p>
      )}
    </section>
  );
}

function Augments({ detail }: { detail: ChampionDetail }) {
  const { t } = useLang();
  const known = useAugments();
  const { sorted, head } = useMetaSort(detail.augments, (a) => augmentLabel(known, a.id), 'grade');
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
                {head('name', 'Augment')}
                <MetaHeads head={head} pickLabel={t('Share', 'Anteil')} compact />
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.id}>
                  <td>
                    <AugmentLink id={a.id} known={known} />
                  </td>
                  <MetaCells stat={a} compact />
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fine" style={{ marginTop: 10 }}>
            {t(
              'Share: in how many of this champion\'s games the augment was taken (hover the value for games and win rate). Names and icons are sent by blank.; an augment nobody has sent yet is shown with its number.',
              'Anteil: in wie vielen Spielen dieses Champions das Augment genommen wurde (Spiele und Siegquote beim Zeigen auf den Wert). Namen und Symbole schickt blank. mit; ein Augment, das noch niemand geschickt hat, steht mit seiner Nummer da.',
            )}
          </p>
        </>
      ) : (
        <p className="empty">{t('No augments in uploaded games.', 'Keine Augments in hochgeladenen Spielen.')}</p>
      )}
    </section>
  );
}

const ITEMS_SHOWN = 12;

/** The items in the final builds on this champion, by default only finished ones. */
function Items({ detail, dragon }: { detail: ChampionDetail; dragon: Dragon }) {
  const { t } = useLang();
  const known = useItems();
  const [all, setAll] = useState(false);
  const rows = (detail.items ?? []).filter((i) => !known.size || known.get(i.id)?.kind !== 'other');
  const { sorted, head } = useMetaSort(rows, (i) => itemLabel(known, i.id));
  const shown = all ? sorted : sorted.slice(0, ITEMS_SHOWN);
  return (
    <section className="card">
      <div className="card-head">
        <h2>Items</h2>
      </div>
      {rows.length ? (
        <>
          <table className="table augment-table">
            <thead>
              <tr>
                {head('name', 'Item')}
                <MetaHeads head={head} pickLabel={t('Share', 'Anteil')} compact />
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id}>
                  <td>
                    <ItemLink id={i.id} known={known} dragon={dragon} />
                  </td>
                  <MetaCells stat={i} compact />
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length > ITEMS_SHOWN && (
            <button type="button" className="button" style={{ marginTop: 10 }} onClick={() => setAll(!all)}>
              {all ? t('Show less', 'Weniger anzeigen') : t(`Show all ${sorted.length}`, `Alle ${sorted.length} anzeigen`)}
            </button>
          )}
          <p className="fine" style={{ marginTop: 10 }}>
            {t(
              "Finished items and boots at the end of the game; share: in how many of this champion's games the item was there.",
              'Fertige Items und Stiefel am Spielende; Anteil: in wie vielen Spielen dieses Champions das Item dabei war.',
            )}
          </p>
        </>
      ) : (
        <p className="empty">{t('No items in games with names.', 'Keine Items in Spielen mit Namen.')}</p>
      )}
    </section>
  );
}

/** The most common augment pairs and cores of three finished items on this champion. */
function Builds({ detail, dragon }: { detail: ChampionDetail; dragon: Dragon }) {
  const { t, href } = useLang();
  const augments = useAugments();
  const items = useItems();
  const games = detail.builds ?? [];
  const pairs = combosOf(games, (g) => g.augments, 2);
  // Without Data Dragon there is no telling finished items apart: no cores then.
  const cores = items.size ? combosOf(games, (g) => g.items.filter((id) => items.get(id)?.kind === 'done'), 3) : [];
  return (
    <section className="card">
      <div className="card-head">
        <h2>Builds</h2>
      </div>
      <div className="builds">
        <BuildTable
          title={t('Augment combos', 'Augment-Kombis')}
          rows={pairs}
          cell={(id) => (
            <Link key={id} href={href(`/augments/${id}`)} title={augmentLabel(augments, id)}>
              <Augment id={id} info={augments.get(id)} size={30} />
            </Link>
          )}
          label={(ids) => ids.map((id) => augmentLabel(augments, id)).join(' + ')}
        />
        <BuildTable
          title={t('Item core (3 finished items)', 'Item-Kern (3 fertige Items)')}
          rows={cores}
          cell={(id) => (
            <Link key={id} href={href(`/items/${id}`)} title={itemLabel(items, id)}>
              <Img className="item" src={itemImage(dragon, id)} size={30} />
            </Link>
          )}
          label={(ids) => ids.map((id) => itemLabel(items, id)).join(' + ')}
        />
      </div>
      <p className="fine" style={{ marginTop: 10 }}>
        {t(
          `Most common combos in this champion's games, from ${MIN_COMBO_GAMES} games on. Items: what was in the inventory when the game ended; the buy order is not stored.`,
          `Häufigste Kombinationen in den Spielen dieses Champions, ab ${MIN_COMBO_GAMES} Spielen. Items: was am Spielende im Inventar war; die Kauf-Reihenfolge ist nicht gespeichert.`,
        )}
      </p>
    </section>
  );
}

function BuildTable({
  title,
  rows,
  cell,
  label,
}: {
  title: string;
  rows: Combo[];
  cell: (id: number) => React.ReactNode;
  label: (ids: number[]) => string;
}) {
  const { lang, t, num } = useLang();
  const percent = percentIn(lang);
  return (
    <div>
      <h3 className="build-title">{title}</h3>
      {rows.length ? (
        <table className="table augment-table">
          <thead>
            <tr>
              <th>{t('Combo', 'Kombination')}</th>
              <th className="right">{t('Share', 'Anteil')}</th>
              <th className="right hide-sm">{t('Win rate', 'Siegquote')}</th>
              <th>{t('Avg grade', 'Note Ø')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ids.join()}>
                <td>
                  <span className="build-icons" aria-label={label(r.ids)}>
                    {r.ids.map(cell)}
                  </span>
                </td>
                <td className="right num nowrap" title={t(`${num(r.games)} games`, `${num(r.games)} Spiele`)}>
                  {percent(r.pick)}
                </td>
                <td className="right num nowrap hide-sm">{percent(r.winRate)}</td>
                <td>{r.grade ? <GradeChip grade={r.grade} small /> : <span className="faint">–</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty">
          {t(`No combo in at least ${MIN_COMBO_GAMES} games yet.`, `Noch keine Kombination in mindestens ${MIN_COMBO_GAMES} Spielen.`)}
        </p>
      )}
    </div>
  );
}
