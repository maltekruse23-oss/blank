'use client';
// The shared parts of the augment, item and champion statistics: sortable columns for games, pick
// rate, win rate and average grade, the cells of one row, and the names and pictures of augments
// and items with links to their pages.
import Link from 'next/link';
import { useState } from 'react';
import type { MetaStat } from '../../src/meta';
import { MIN_GAMES } from '../../src/meta';
import { Augment, GradeChip, Img } from './bits';
import { de, itemImage, type ItemInfo, type useDragon } from './data';
import type { AugmentInfo } from '../../src/augments';

export type MetaSort = 'games' | 'pick' | 'win' | 'grade' | 'name';

const VALUE: Record<Exclude<MetaSort, 'name'>, (s: MetaStat) => number | null> = {
  games: (s) => s.games,
  pick: (s) => s.pick,
  win: (s) => s.winRate ?? null,
  grade: (s) => s.pct,
};

/** Percent with one decimal, "–" when there is no value (also for snapshots from before). */
export const percent = (x: number | null | undefined) => (x == null ? '–' : `${de(x * 100, 1)} %`);

/** Sorted rows; `name` gives the label for sorting by name and as the last tie-break. */
export function useMetaSort<T extends MetaStat>(rows: T[], name: (row: T) => string, initial: MetaSort = 'games') {
  const [sort, setSort] = useState<MetaSort>(initial);
  const sorted = [...rows].sort((a, b) => {
    if (sort === 'name') return name(a).localeCompare(name(b), 'de');
    const of = VALUE[sort];
    return (of(b) ?? -1) - (of(a) ?? -1) || b.games - a.games || name(a).localeCompare(name(b), 'de');
  });
  const head = (id: MetaSort, label: string, className = '') => (
    <th className={className} aria-sort={sort === id ? (id === 'name' ? 'ascending' : 'descending') : undefined}>
      <button type="button" className="sort" data-on={sort === id} onClick={() => setSort(id)}>
        {label}
      </button>
    </th>
  );
  return { sorted, head };
}

/** The column heads after the name: Spiele, Pickrate (or `pickLabel`), Siegquote, Note Ø. */
/** `compact`: only pick rate and grade, for the narrow side column (games and win rate in the
 * cell's tooltip). */
export function MetaHeads({ head, pickLabel = 'Pickrate', compact = false }: { head: ReturnType<typeof useMetaSort>['head']; pickLabel?: string; compact?: boolean }) {
  if (compact)
    return (
      <>
        {head('pick', pickLabel, 'right')}
        {head('grade', 'Note Ø')}
      </>
    );
  return (
    <>
      {head('games', 'Spiele', 'right')}
      {head('pick', pickLabel, 'right')}
      {head('win', 'Siegquote', 'right hide-sm')}
      {head('grade', 'Note Ø')}
    </>
  );
}

export function MetaCells({ stat, compact = false }: { stat: MetaStat; compact?: boolean }) {
  if (compact)
    return (
      <>
        <td className="right num nowrap" title={`${de(stat.games)} Spiele · Siegquote ${percent(stat.winRate)}`}>
          {percent(stat.pick)}
        </td>
        <td>
          {stat.grade ? (
            <GradeChip grade={stat.grade} small />
          ) : (
            <span className="faint" title={`Weniger als ${MIN_GAMES} gewertete Spiele`}>
              –
            </span>
          )}
        </td>
      </>
    );
  return (
    <>
      <td className="right num">{de(stat.games)}</td>
      <td className="right num nowrap">{percent(stat.pick)}</td>
      <td className="right num nowrap hide-sm">{percent(stat.winRate)}</td>
      <td>
        {stat.grade ? (
          <GradeChip grade={stat.grade} small />
        ) : (
          <span className="faint nowrap" title={`Weniger als ${MIN_GAMES} gewertete Spiele`}>
            wenige Daten
          </span>
        )}
      </td>
    </>
  );
}

export const augmentLabel = (known: Map<number, AugmentInfo>, id: number) => known.get(id)?.name ?? `Augment ${id}`;
export const itemLabel = (known: Map<number, ItemInfo>, id: number) => known.get(id)?.name ?? `Item ${id}`;

export function AugmentLink({ id, known, size = 26 }: { id: number; known: Map<number, AugmentInfo>; size?: number }) {
  return (
    <Link className="augment-name" href={`/augments/${id}`}>
      <Augment id={id} info={known.get(id)} size={size} />
      {known.get(id)?.name ?? <span className="num muted">#{id}</span>}
    </Link>
  );
}

export function ItemLink({ id, known, dragon, size = 26 }: { id: number; known: Map<number, ItemInfo>; dragon: ReturnType<typeof useDragon>; size?: number }) {
  return (
    <Link className="augment-name" href={`/items/${id}`}>
      <Img className="item" src={itemImage(dragon, id)} size={size} />
      {known.get(id)?.name ?? <span className="num muted">#{id}</span>}
    </Link>
  );
}

/** The facts of one augment or item (or champion) above its tables. */
export function MetaFacts({ stat, pickLabel = 'Pickrate' }: { stat: MetaStat; pickLabel?: string }) {
  return (
    <div className="stat-row" style={{ marginBottom: 'var(--gap)' }}>
      <div className="stat">
        <small>Spiele</small>
        <strong className="num">{de(stat.games)}</strong>
      </div>
      <div className="stat">
        <small>{pickLabel}</small>
        <strong className="num">{percent(stat.pick)}</strong>
      </div>
      <div className="stat">
        <small>Siegquote</small>
        <strong className="num">{percent(stat.winRate)}</strong>
      </div>
      <div className="stat">
        <small>Note Ø</small>
        <strong>{stat.grade ?? '–'}</strong>
      </div>
    </div>
  );
}
