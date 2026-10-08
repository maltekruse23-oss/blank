'use client';
// The shared parts of the augment, item and champion statistics: sortable columns for games, pick
// rate, win rate and average grade, the cells of one row, and the names and pictures of augments
// and items with links to their pages.
import Link from 'next/link';
import { useState } from 'react';
import type { MetaStat } from '../../src/meta';
import { MIN_GAMES } from '../../src/meta';
import { Augment, GradeChip, Img } from './bits';
import { itemImage, type ItemInfo, type useDragon } from './data';
import { num } from './format';
import type { AugmentInfo } from '../../src/augments';

export type MetaSort = 'games' | 'pick' | 'win' | 'grade' | 'name';

const VALUE: Record<Exclude<MetaSort, 'name'>, (s: MetaStat) => number | null> = {
  games: (s) => s.games,
  pick: (s) => s.pick,
  win: (s) => s.winRate ?? null,
  grade: (s) => s.pct,
};

/** Percent with one decimal ("12.3%"), "–" when there is no value (also for snapshots from before). */
export const percent = (x: number | null | undefined) => (x == null ? '–' : `${num(x * 100, 1)}%`);

/** Sorted rows; `name` gives the label for sorting by name and as the last tie-break. */
export function useMetaSort<T extends MetaStat>(rows: T[], name: (row: T) => string, initial: MetaSort = 'games') {
  const [sort, setSort] = useState<MetaSort>(initial);
  const sorted = [...rows].sort((a, b) => {
    if (sort === 'name') return name(a).localeCompare(name(b), 'en');
    const of = VALUE[sort];
    return (of(b) ?? -1) - (of(a) ?? -1) || b.games - a.games || name(a).localeCompare(name(b), 'en');
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

/** The column heads after the name: games, pick rate (or `pickLabel`), win rate, avg grade. */
/** `compact`: only pick rate and grade, for the narrow side column (games and win rate in the
 * cell's tooltip). */
export function MetaHeads({ head, pickLabel, compact = false }: { head: ReturnType<typeof useMetaSort>['head']; pickLabel?: string; compact?: boolean }) {
  const pick = pickLabel ?? 'Pick rate';
  if (compact)
    return (
      <>
        {head('pick', pick, 'right')}
        {head('grade', 'Avg grade')}
      </>
    );
  return (
    <>
      {head('games', 'Games', 'right')}
      {head('pick', pick, 'right')}
      {head('win', 'Win rate', 'right hide-sm')}
      {head('grade', 'Avg grade')}
    </>
  );
}

export function MetaCells({ stat, compact = false }: { stat: MetaStat; compact?: boolean }) {
  const few = `Fewer than ${MIN_GAMES} rated games`;
  if (compact)
    return (
      <>
        <td className="right num nowrap" title={`${num(stat.games)} games · Win rate ${percent(stat.winRate)}`}>
          {percent(stat.pick)}
        </td>
        <td>
          {stat.grade ? (
            <GradeChip grade={stat.grade} small />
          ) : (
            <span className="faint" title={few}>
              –
            </span>
          )}
        </td>
      </>
    );
  return (
    <>
      <td className="right num">{num(stat.games)}</td>
      <td className="right num nowrap">{percent(stat.pick)}</td>
      <td className="right num nowrap hide-sm">{percent(stat.winRate)}</td>
      <td>
        {stat.grade ? (
          <GradeChip grade={stat.grade} small />
        ) : (
          <span className="faint nowrap" title={few}>
            little data
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
export function MetaFacts({ stat, pickLabel }: { stat: MetaStat; pickLabel?: string }) {
  return (
    <div className="stat-row" style={{ marginBottom: 'var(--gap)' }}>
      <div className="stat">
        <small>Games</small>
        <strong className="num">{num(stat.games)}</strong>
      </div>
      <div className="stat">
        <small>{pickLabel ?? 'Pick rate'}</small>
        <strong className="num">{percent(stat.pick)}</strong>
      </div>
      <div className="stat">
        <small>Win rate</small>
        <strong className="num">{percent(stat.winRate)}</strong>
      </div>
      <div className="stat">
        <small>Avg grade</small>
        <strong>{stat.grade ?? '–'}</strong>
      </div>
    </div>
  );
}
