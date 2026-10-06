'use client';
// The pages of augments and items: the lists (/augments, /items) with games, pick rate, win rate and
// average grade, sortable, with a search and one filter (rarity or kind of item), and the page of one
// (/augments/<id>, /items/<id>) with the champions it was taken on and what was taken with it.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { seasonName } from '../../src/features/aram/aramRating';
import type { MetaChampion, MetaDetail, MetaRow } from '../../src/meta';
import { MIN_GAMES } from '../../src/meta';
import { GradeIcon, Img, Problem } from './bits';
import { Filters, useFilters, type Scope } from './filters';
import { championImage, championKey, championLabel, de, useDragon, useLive } from './data';
import { MetaCells, MetaFacts, MetaHeads, useMetaSort } from './meta';

export type MetaList = {
  scope: Scope;
  season: { id: string; year: number; number: number; start: number };
  games: number;
  /** Counted player-games: what the pick rate is a share of. */
  entries: number;
  rows: MetaRow[];
};

export function MetaListPage<F extends string>({
  kind,
  title,
  noun,
  label,
  cell,
  filter,
  filters: choices,
  initialFilter,
  note,
}: {
  kind: 'augments' | 'items';
  title: string;
  /** "Augment" / "Item", for the search, the column and the empty states. */
  noun: string;
  label: (id: number) => string;
  cell: (id: number) => ReactNode;
  filter: (id: number, value: F) => boolean;
  filters: { id: F; label: string }[];
  initialFilter: F;
  note: string;
}) {
  const filters = useFilters();
  const { data, error, live } = useLive<MetaList>(`/api/stats/${kind}?` + filters.query);
  const [find, setFind] = useState('');
  const [only, setOnly] = useState<F>(initialFilter);

  const q = find.trim().toLowerCase();
  const shown = (data?.rows ?? []).filter((r) => filter(r.id, only) && (!q || label(r.id).toLowerCase().includes(q)));
  const { sorted, head } = useMetaSort(shown, (r) => label(r.id));

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">
            ARAM: Mayhem · {data && filters.scope === 'season' ? seasonName(data.season) : 'Alle Zeiten'}
          </span>
          <h1>{title}</h1>
        </div>
        <div className="side">
          <span className="live" data-on={live}>
            {live ? 'Live' : 'Aktualisiert alle 5 s'}
          </span>
          <Filters {...filters} />
        </div>
      </div>

      {error && <Problem message={error} />}

      <section className="card">
        <div className="card-head champ-tools">
          <form className="field" onSubmit={(e) => e.preventDefault()}>
            <input aria-label={`${noun} suchen`} placeholder={`${noun} suchen`} value={find} onChange={(e) => setFind(e.target.value)} />
          </form>
          <label className="field">
            <select aria-label="Auswahl" value={only} onChange={(e) => setOnly(e.target.value as F)}>
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="hide-sm">#</th>
                {head('name', noun)}
                <MetaHeads head={head} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.id}>
                  <td className="place num hide-sm">{i + 1}</td>
                  <td>{cell(r.id)}</td>
                  <MetaCells stat={r} />
                </tr>
              ))}
            </tbody>
          </table>
          {!data && !error && <p className="empty">{title} werden geladen …</p>}
          {data && !data.rows.length && (
            <p className="empty">
              {filters.scope === 'season'
                ? 'In dieser Saison gibt es noch keine Spiele.'
                : <>Noch keine Spiele. {title} erscheinen, sobald jemand Spiele hochlädt. <a href="/mitmachen">Mitmachen</a></>}
            </p>
          )}
          {data && data.rows.length > 0 && !sorted.length && <p className="empty">Nichts passt zur Auswahl.</p>}
        </div>
        {data && data.rows.length > 0 && (
          <p className="fine" style={{ marginTop: 12 }}>
            {de(data.games)} Spiele, {de(data.entries)} Spieler-Spiele ab 8 Minuten. Die Pickrate ist der Anteil der
            Spieler-Spiele, in denen das {noun} genommen wurde. {note} Siegquote und Note erscheinen ab {MIN_GAMES} Spielen
            (wenige Daten). Die Note vergleicht mit dem, was der Champion üblicherweise schafft. Mehr Spiele machen die
            Zahlen genauer: <a href="/mitmachen">Mitmachen</a>.
          </p>
        )}
      </section>
    </>
  );
}

type Detail = Omit<MetaList, 'games' | 'entries' | 'rows'> & { detail: MetaDetail };
type Dragon = ReturnType<typeof useDragon>;

/** One augment or item: its facts, the champions it was taken on and what was taken with it. */
export function MetaDetailPage({
  kind,
  id,
  back,
  name,
  icon,
  facts,
  paired,
}: {
  kind: 'augments' | 'items';
  id: number | null;
  back: { href: string; label: string };
  name: string;
  icon: ReactNode;
  facts: ReactNode;
  paired: { title: string; noun: string; label: (id: number) => string; cell: (id: number) => ReactNode };
}) {
  const filters = useFilters();
  const { data, error, missing } = useLive<Detail>(id ? `/api/stats/${kind}/${id}?${filters.query}` : null);
  const dragon = useDragon();
  if (!id) return <Problem message={kind === 'augments' ? 'Unbekanntes Augment' : 'Unbekanntes Item'} missing />;
  const d = data?.detail;
  const noun = kind === 'augments' ? 'Augment' : 'Item';

  return (
    <>
      <Link className="back" href={back.href}>
        ← {back.label}
      </Link>

      <section className="game-hero champ-hero meta-hero">
        <div className="champ-title">
          {icon}
          <div>
            <span className="eyebrow">
              ARAM: Mayhem · {data && filters.scope === 'season' ? seasonName(data.season) : 'Alle Zeiten'}
            </span>
            <h1>{name}</h1>
            {facts && <div className="facts">{facts}</div>}
          </div>
          {d?.grade && <GradeIcon grade={d.grade} size={72} />}
        </div>
        <div className="side champ-filters">
          <Filters {...filters} />
        </div>
      </section>

      {error && <Problem message={error} missing={missing} />}
      {!data && !error && <p className="empty">{noun} wird geladen …</p>}

      {d && (
        <>
          <MetaFacts stat={d} />
          <div className="grid cols-main">
            <MetaChampions rows={d.champions} dragon={dragon} noun={noun} />
            <Paired rows={d.paired} {...paired} />
          </div>
          <p className="fine" style={{ marginTop: 'var(--gap)' }}>
            Es zählt jedes Spiel ab 8 Minuten, in dem jemand das {noun} hatte. „Anteil“ bei den Champions: wie oft der
            Champion es genommen hat, gemessen an allen seinen Spielen. Siegquote und Note erscheinen ab {MIN_GAMES}{' '}
            Spielen.
          </p>
        </>
      )}
    </>
  );
}

function MetaChampions({ rows, dragon, noun }: { rows: MetaChampion[]; dragon: Dragon; noun: string }) {
  const { sorted, head } = useMetaSort(rows, (c) => championLabel(dragon, c));
  return (
    <section className="card">
      <div className="card-head">
        <h2>Champions</h2>
      </div>
      <div className="table-wrap flat">
        <table className="table">
          <thead>
            <tr>
              {head('name', 'Champion')}
              <MetaHeads head={head} pickLabel="Anteil" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.championId}>
                <td>
                  <Link className="who" href={'/champions/' + (c.champion || c.championId)}>
                    <Img className="champ" src={championImage(dragon, championKey(dragon, c) || undefined)} size={28} />
                    <b>{championLabel(dragon, c)}</b>
                  </Link>
                </td>
                <MetaCells stat={c} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="empty">Kein Champion mit diesem {noun}.</p>}
    </section>
  );
}

function Paired({ rows, title, noun, label, cell }: { rows: MetaRow[]; title: string; noun: string; label: (id: number) => string; cell: (id: number) => ReactNode }) {
  const { sorted, head } = useMetaSort(rows, (r) => label(r.id));
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
      </div>
      {rows.length ? (
        <table className="table augment-table">
          <thead>
            <tr>
              {head('name', noun)}
              <MetaHeads head={head} pickLabel="Anteil" compact />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                <td>{cell(r.id)}</td>
                <MetaCells stat={r} compact />
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty">Noch nichts.</p>
      )}
    </section>
  );
}
