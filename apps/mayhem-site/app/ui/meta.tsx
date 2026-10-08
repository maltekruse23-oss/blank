'use client';
// The shared parts of the augment, item and champion statistics (rule "Übersicht vor
// Vollständigkeit"): a row shows one main number (the win rate) and one small extra (games);
// pick rate and average grade stay in the row's tooltip. Lists are sorted by strength: the win
// rate pulled towards 50 % for few games (src/tiers.ts), so three lucky wins do not lead.
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { MetaStat } from '../../src/meta';
import { MIN_GAMES } from '../../src/meta';
import { scoreOf } from '../../src/tiers';
import type { AugmentInfo } from '../../src/augments';
import { Augment, Img, Top, step } from './bits';
import { itemImage, type ItemInfo, type useDragon } from './data';
import { num } from './format';

/** Percent with one decimal ("12.3%"), "–" when there is no value (also for snapshots from before). */
export const percent = (x: number | null | undefined) => (x == null ? '–' : `${num(x * 100, 1)}%`);
/** Whole percent for the big numbers ("57%"). */
export const wholePercent = (x: number | null | undefined) => (x == null ? '–' : `${Math.round(x * 100)}%`);
export const gamesText = (n: number) => `${num(n)} ${n === 1 ? 'game' : 'games'}`;

type Rated = Pick<MetaStat, 'games' | 'winRate'>;

/** Strongest first: win rate pulled towards 50 % for few games; rows without one last. */
export function strongest<T extends Rated>(rows: T[], name: (row: T) => string): T[] {
  return [...rows].sort(
    (a, b) => (scoreOf(b) ?? -1) - (scoreOf(a) ?? -1) || b.games - a.games || name(a).localeCompare(name(b), 'en'),
  );
}

export type Sort = 'strong' | 'games' | 'name';

/** Sorts by `sort` (strongest, most played or by name). */
export function sortRows<T extends Rated>(rows: T[], sort: Sort, name: (row: T) => string): T[] {
  if (sort === 'strong') return strongest(rows, name);
  if (sort === 'games') return [...rows].sort((a, b) => b.games - a.games || name(a).localeCompare(name(b), 'en'));
  return [...rows].sort((a, b) => name(a).localeCompare(name(b), 'en'));
}

export function SortSelect({ value, onChange }: { value: Sort; onChange: (sort: Sort) => void }) {
  return (
    <label className="field">
      <span>Sort</span>
      <select value={value} onChange={(e) => onChange(e.target.value as Sort)}>
        <option value="strong">Strongest</option>
        <option value="games">Most played</option>
        <option value="name">Name</option>
      </select>
    </label>
  );
}

/** The tooltip of a row: everything that is not shown (games stay reachable, MAYHEM-DESIGN.md). */
export function statTitle(stat: MetaStat, pickLabel = 'Picked in') {
  const parts = [
    stat.winRate === null ? `Win rate from ${MIN_GAMES} games on` : `Win rate ${percent(stat.winRate)}`,
    gamesText(stat.games),
    `${pickLabel} ${percent(stat.pick)} of games`,
    stat.grade ? `Average grade ${stat.grade}` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

/** One main number (win rate) and one small extra (games). */
export function WinValue({ stat }: { stat: Rated }) {
  return (
    <span className="value" title={stat.winRate === null ? `Win rate from ${MIN_GAMES} games on` : undefined}>
      <b className={stat.winRate === null ? undefined : 'up'}>{wholePercent(stat.winRate)}</b>
      <small>{gamesText(stat.games)}</small>
    </span>
  );
}

/** A row of a meta list: picture and name (the link), the win rate on the right. */
export function MetaRow({
  href,
  picture,
  name,
  sub,
  stat,
  top,
  index,
  pickLabel,
  title,
}: {
  href: string;
  picture: ReactNode;
  name: ReactNode;
  sub?: ReactNode;
  stat: MetaStat;
  top?: boolean;
  index: number;
  pickLabel?: string;
  /** The tooltip, when it should say more than the stat (champions: damage, SSS share). */
  title?: string;
}) {
  return (
    <li className="row in" data-top={top || undefined} style={step(index)}>
      {picture}
      <span className="who">
        <Link className="stretch name" href={href} title={title ?? statTitle(stat, pickLabel)}>
          <span>{name}</span>
          {top && <Top />}
        </Link>
        {sub && <small>{sub}</small>}
      </span>
      <WinValue stat={stat} />
    </li>
  );
}

export const augmentLabel = (known: Map<number, AugmentInfo>, id: number) => known.get(id)?.name ?? `Augment ${id}`;
export const itemLabel = (known: Map<number, ItemInfo>, id: number) => known.get(id)?.name ?? `Item ${id}`;

/** The picture of an augment or item for a row. */
export const augmentPicture = (known: Map<number, AugmentInfo>, id: number, size = 36) => <Augment id={id} info={known.get(id)} size={size} />;
export const itemPicture = (dragon: ReturnType<typeof useDragon>, id: number, size = 36) => <Img className="item" src={itemImage(dragon, id)} size={size} />;

/** The answer of a detail page: the win rate big, the games below; the rest in the tooltip. */
export function Answer({ stat, pickLabel }: { stat: MetaStat; pickLabel?: string }) {
  return (
    <span className="answer" title={statTitle(stat, pickLabel)}>
      <b className={stat.winRate === null ? 'plain' : undefined}>{wholePercent(stat.winRate)}</b>
      <small>{stat.winRate === null ? `wins from ${MIN_GAMES} games on · ${gamesText(stat.games)}` : `wins · ${gamesText(stat.games)}`}</small>
    </span>
  );
}

/** The best row of a list (the first by strength), when it has a win rate. */
export const isTop = (rows: Rated[], index: number) => index === 0 && rows[0]?.winRate != null && rows.length > 1;
