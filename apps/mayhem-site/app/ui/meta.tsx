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
import { numberIn, useLang, type Lang } from './i18n';
import type { AugmentInfo } from '../../src/augments';

export type MetaSort = 'games' | 'pick' | 'win' | 'grade' | 'name';

const VALUE: Record<Exclude<MetaSort, 'name'>, (s: MetaStat) => number | null> = {
  games: (s) => s.games,
  pick: (s) => s.pick,
  win: (s) => s.winRate ?? null,
  grade: (s) => s.pct,
};

/** Percent with one decimal in a language ("12.3%" / "12,3 %"), "–" when there is no value (also
 * for snapshots from before). */
export const percentIn = (lang: Lang) => (x: number | null | undefined) =>
  x == null ? '–' : `${numberIn(lang)(x * 100, 1)}${lang === 'de' ? ' %' : '%'}`;

/** Percent with one decimal, German unless `lang` says otherwise. */
export const percent = (x: number | null | undefined, lang: Lang = 'de') => percentIn(lang)(x);

/** Sorted rows; `name` gives the label for sorting by name and as the last tie-break. */
export function useMetaSort<T extends MetaStat>(rows: T[], name: (row: T) => string, initial: MetaSort = 'games') {
  const { lang } = useLang();
  const [sort, setSort] = useState<MetaSort>(initial);
  const sorted = [...rows].sort((a, b) => {
    if (sort === 'name') return name(a).localeCompare(name(b), lang);
    const of = VALUE[sort];
    return (of(b) ?? -1) - (of(a) ?? -1) || b.games - a.games || name(a).localeCompare(name(b), lang);
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
  const { t } = useLang();
  const pick = pickLabel ?? t('Pick rate', 'Pickrate');
  if (compact)
    return (
      <>
        {head('pick', pick, 'right')}
        {head('grade', t('Avg grade', 'Note Ø'))}
      </>
    );
  return (
    <>
      {head('games', t('Games', 'Spiele'), 'right')}
      {head('pick', pick, 'right')}
      {head('win', t('Win rate', 'Siegquote'), 'right hide-sm')}
      {head('grade', t('Avg grade', 'Note Ø'))}
    </>
  );
}

export function MetaCells({ stat, compact = false }: { stat: MetaStat; compact?: boolean }) {
  const { lang, t, num } = useLang();
  const percent = percentIn(lang);
  const few = t(`Fewer than ${MIN_GAMES} rated games`, `Weniger als ${MIN_GAMES} gewertete Spiele`);
  if (compact)
    return (
      <>
        <td className="right num nowrap" title={t(`${num(stat.games)} games · Win rate ${percent(stat.winRate)}`, `${num(stat.games)} Spiele · Siegquote ${percent(stat.winRate)}`)}>
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
            {t('little data', 'wenige Daten')}
          </span>
        )}
      </td>
    </>
  );
}

export const augmentLabel = (known: Map<number, AugmentInfo>, id: number) => known.get(id)?.name ?? `Augment ${id}`;
export const itemLabel = (known: Map<number, ItemInfo>, id: number) => known.get(id)?.name ?? `Item ${id}`;

export function AugmentLink({ id, known, size = 26 }: { id: number; known: Map<number, AugmentInfo>; size?: number }) {
  const { href } = useLang();
  return (
    <Link className="augment-name" href={href(`/augments/${id}`)}>
      <Augment id={id} info={known.get(id)} size={size} />
      {known.get(id)?.name ?? <span className="num muted">#{id}</span>}
    </Link>
  );
}

export function ItemLink({ id, known, dragon, size = 26 }: { id: number; known: Map<number, ItemInfo>; dragon: ReturnType<typeof useDragon>; size?: number }) {
  const { href } = useLang();
  return (
    <Link className="augment-name" href={href(`/items/${id}`)}>
      <Img className="item" src={itemImage(dragon, id)} size={size} />
      {known.get(id)?.name ?? <span className="num muted">#{id}</span>}
    </Link>
  );
}

/** The facts of one augment or item (or champion) above its tables. */
export function MetaFacts({ stat, pickLabel }: { stat: MetaStat; pickLabel?: string }) {
  const { lang, t, num } = useLang();
  const percent = percentIn(lang);
  return (
    <div className="stat-row" style={{ marginBottom: 'var(--gap)' }}>
      <div className="stat">
        <small>{t('Games', 'Spiele')}</small>
        <strong className="num">{num(stat.games)}</strong>
      </div>
      <div className="stat">
        <small>{pickLabel ?? t('Pick rate', 'Pickrate')}</small>
        <strong className="num">{percent(stat.pick)}</strong>
      </div>
      <div className="stat">
        <small>{t('Win rate', 'Siegquote')}</small>
        <strong className="num">{percent(stat.winRate)}</strong>
      </div>
      <div className="stat">
        <small>{t('Avg grade', 'Note Ø')}</small>
        <strong>{stat.grade ?? '–'}</strong>
      </div>
    </div>
  );
}
