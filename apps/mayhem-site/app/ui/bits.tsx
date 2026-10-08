'use client';
// Small parts used on every page (design "Arena", MAYHEM-DESIGN.md): grades, rank marks, images,
// tabs, the list with "Show more", the "Top" mark, the podium and the charts (plain SVG, no chart
// library).
import Link from 'next/link';
import { useState, type CSSProperties, type ReactNode } from 'react';
import type { Grade } from '../../src/features/aram/aramPerformance';
import { rankName, TIERS, type Rank } from '../../src/features/aram/aramRating';
import type { AugmentInfo } from '../../src/augments';
import { AXES } from '../../src/insights';
import { augmentImage, knownApiError } from './data';

/** The stagger of the soft glide-in (`.in`). */
export const step = (i: number) => ({ '--i': i }) as CSSProperties;

// ---- Grades and ranks ---------------------------------------------------------------------

/** A grade as a bold letter in its color (user, 08.10.2026: no grade icons, "nur dicke Buchstaben");
 * longer grades get a smaller letter so SSS and MAYHEM fit the same box. */
export function GradeMark({ grade, size = 46 }: { grade: Grade; size?: number }) {
  return (
    <span
      className="grade-mark"
      data-g={grade}
      data-len={Math.min(grade.length, 4)}
      style={{ '--size': `${size}px` } as CSSProperties}
      role="img"
      aria-label={`Grade ${grade}`}
      title={`Grade ${grade}`}
    >
      {grade}
    </span>
  );
}

/** A grade as text in its color; `gain` adds the points it brought (+18 / −12). */
export function GradeChip({ grade, gain, small }: { grade: Grade; gain?: number | null; small?: boolean }) {
  const label = `Grade ${grade}`;
  const title = gain === undefined || gain === null ? label : `${label}, ${gain > 0 ? '+' : ''}${gain} points`;
  return (
    <span className={small ? 'grade sm' : 'grade'} data-g={grade} title={title}>
      {grade}
      {gain !== undefined && gain !== null && (
        <em className={gain > 0 ? 'up' : 'down'}>
          {gain > 0 ? '+' : '−'}
          {Math.abs(gain)}
        </em>
      )}
    </span>
  );
}

/** The rank's mark: the user's rank frames (public/ranks, 256 px, transparent). The rank's name
 * always stands next to it as text, so the image itself is decoration. */
export function TierMark({ rank, size }: { rank: Rank | null; size?: number }) {
  const style = size ? ({ '--size': `${size}px` } as CSSProperties) : undefined;
  if (!rank)
    return (
      <span className="tier-mark none" style={style} aria-hidden>
        ?
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static artwork, fixed size
    <img
      className="tier-mark"
      data-tier={rank.tier.id}
      src={`/ranks/${rank.tier.id}.png`}
      width={size ?? 44}
      height={size ?? 44}
      style={style}
      alt=""
      draggable={false}
    />
  );
}

/** Share of the current division that is filled, 0–100 (always full from the apex line on). */
export const fillOf = (rank: Rank) => (rank.division === null ? 100 : rank.points);

/** "72 points" (plain words instead of "MP"). */
export const points = (n: number) => `${n} ${n === 1 ? 'point' : 'points'}`;

/** The rank in a row: emblem, name and the points bar; placement while there is no rank. */
export function RankCell({ rank, placed }: { rank: Rank | null; placed: number }) {
  return (
    <span className="rank-in-row" data-tier={rank?.tier.id}>
      <TierMark rank={rank} size={36} />
      <span className="rank-text">
        {rank ? (
          <>
            <b className="tier-text">{rankName(rank)}</b>
            <span className="bar tier" aria-hidden>
              <span style={{ width: `${fillOf(rank)}%` }} />
            </span>
            <small>{points(rank.points)}</small>
          </>
        ) : (
          <>
            <b className="muted">Placement</b>
            <span className="bar quiet" aria-hidden>
              <span style={{ width: `${placed * 20}%` }} />
            </span>
            <small>{placed} of 5 games</small>
          </>
        )}
      </span>
    </span>
  );
}

// ---- Problems ----------------------------------------------------------------------------------

/** What went wrong, in plain words: something that does not exist (a player, game or
 * champion) with ways on, or a failed load with a way to try again. A known German message of the
 * API is shown in English (useLive already translates its own errors). */
export function Problem({ message: raw, missing = false }: { message: string; missing?: boolean }) {
  const message = knownApiError(raw) ?? raw;
  if (missing)
    return (
      <section className="tile problem" data-tone="quiet" role="alert">
        <h1>{message}</h1>
        <p>The link may be wrong or outdated, or the data was deleted or hidden.</p>
        <p className="problem-links">
          <Link className="button primary" href="/">
            To the start page
          </Link>
          <Link className="button" href="/leaderboard">
            To the leaderboard
          </Link>
        </p>
      </section>
    );
  return (
    <div className="error" role="alert">
      {message}{' '}
      <button type="button" className="link-button" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}

// ---- Images ---------------------------------------------------------------------------------

export function Img({ src, className, alt = '', size }: { src?: string; className: string; alt?: string; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- images from Riot's CDN, no optimizer
    <img className={className} src={src} alt={alt} width={size} height={size} loading="lazy" />
  ) : (
    <span className={className} style={size ? ({ '--s': `${size}px` } as CSSProperties) : undefined} aria-hidden />
  );
}

/** An augment: its icon with a ring in the color of its rarity, the name as label. Unknown ones
 * (blank. has not sent them yet) show their number. */
export function Augment({ id, info, size = 22 }: { id: number; info: AugmentInfo | undefined; size?: number }) {
  const label = info?.name ?? `Augment ${id}`;
  return info?.icon ? (
    // eslint-disable-next-line @next/next/no-img-element -- small icon from our own API
    <img className="augment" data-rarity={info.rarity || undefined} src={augmentImage(id)} alt={label} title={label} width={size} height={size} loading="lazy" />
  ) : (
    <span className="augment none" data-rarity={info?.rarity || undefined} title={label} style={{ width: size, height: size }}>
      {info ? info.name.slice(0, 1) : '?'}
    </span>
  );
}

// ---- Tabs, lists, marks ---------------------------------------------------------------------

export function Tabs<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: ReactNode }[];
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={o.id === value}
          tabIndex={o.id === value ? 0 : -1}
          onClick={() => onChange(o.id)}
          onKeyDown={(e) => {
            const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (!step) return;
            const next = (i + step + options.length) % options.length;
            onChange(options[next].id);
            (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Rows shown before "Show more" (MAYHEM-DESIGN.md "Übersicht vor Vollständigkeit"). */
export const FIRST = 5;

/** A list that shows its first `first` entries and the rest behind "Show n more"; `keep` rows
 * (the visitor's own) always show. `all` shows everything (a search or filter is set). */
export function More<T>({
  list,
  render,
  className = 'rows',
  first = FIRST,
  keep,
  all = false,
  step: add,
  label,
}: {
  list: T[];
  render: (entry: T, index: number) => ReactNode;
  className?: string;
  first?: number;
  keep?: (entry: T) => boolean;
  all?: boolean;
  /** Add this many per click instead of all at once (long lists like the leaderboard). */
  step?: number;
  label?: string;
}) {
  const [shown, setShown] = useState(first);
  const limit = all ? list.length : shown;
  const rows = list.flatMap((entry, i) => (i < limit || keep?.(entry) ? [render(entry, i)] : []));
  const hidden = list.length - rows.length;
  const next = add ? Math.min(add, hidden) : hidden;
  const less = hidden === 0 && list.length > first && shown > first;
  return (
    <>
      <ul className={className} aria-label={label}>
        {rows}
      </ul>
      {/* One button that changes its words, so the keyboard focus stays on it. */}
      {!all && (hidden > 0 || less) && (
        <button type="button" className="more" aria-expanded={less} onClick={() => setShown((s) => (less ? first : add ? s + add : list.length))}>
          {less ? 'Show less' : next === hidden ? `Show ${hidden} more` : `Show ${next} more of ${hidden}`}
        </button>
      )}
    </>
  );
}

/** Marks the best entry of a list, so nobody has to compare (gold, "Top"). */
export const Top = () => <span className="top">Top</span>;

export type PodiumEntry = {
  key: string;
  href: string;
  name: ReactNode;
  /** The player's profile icon before the name (leaderboard). */
  avatar?: ReactNode;
  /** The emblem or grade on the right. */
  mark: ReactNode;
  /** The main value (rank name, grade …) and one small line. */
  main: ReactNode;
  small?: ReactNode;
  title?: string;
  /** The visitor's own entry ("Jump to me"). */
  mine?: boolean;
};

const TONES = ['gold', 'silver', 'bronze'] as const;

/** Places 1 to 3 as tiles lit in gold, silver and bronze. */
export function Podium({ entries, label }: { entries: PodiumEntry[]; label: string }) {
  if (!entries.length) return null;
  return (
    <ol className="podium" aria-label={label}>
      {entries.slice(0, 3).map((e, i) => (
        <li key={e.key}>
          <Link className="tile in" href={e.href} data-tone={TONES[i]} data-place={i + 1} data-me={e.mine || undefined} id={e.mine ? 'me-row' : undefined} style={step(i)} title={e.title}>
            <span className="place">#{i + 1}</span>
            <span className="who">
              {e.avatar}
              <b>{e.name}</b>
            </span>
            <span className="mark">{e.mark}</span>
            <span className="main">
              {e.main}
              {e.small && <small>{e.small}</small>}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

// ---- Charts ---------------------------------------------------------------------------------

/** How many players are in each tier. */
export function Histogram({ rows }: { rows: { tier: (typeof TIERS)[number]; players: number }[] }) {
  const most = Math.max(1, ...rows.map((r) => r.players));
  return (
    <div className="histogram" style={{ '--n': rows.length } as CSSProperties} role="img" aria-label={rows.map((r) => `${r.tier.name}: ${r.players}`).join(', ')}>
      {rows.map((r, i) => (
        <div key={r.tier.id} data-tier={r.tier.id}>
          <span className="count">{r.players || ''}</span>
          <div className="track">
            <div className="bar-y" style={{ height: `${(r.players / most) * 100}%`, animationDelay: `${i * 50}ms` }} />
          </div>
          <span className="label">
            {r.tier.name.length > 3 ? (
              <>
                <span className="long">{r.tier.name}</span>
                <span className="short">{r.tier.name[0]}</span>
              </>
            ) : (
              r.tier.name
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The soft gold fill under a line chart. */
const ChartFill = () => (
  <defs>
    <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stopColor="#f2c14e" stopOpacity="0.32" />
      <stop offset="1" stopColor="#f2c14e" stopOpacity="0" />
    </linearGradient>
  </defs>
);

/** The way through the season: the ladder after each game, tier lines, rise and fall marked. */
export function LadderChart({ points: list }: { points: { ladder: number; change: string | null }[] }) {
  const W = 380;
  const H = 180;
  if (list.length < 2) return <p className="empty">The chart appears after two rated games.</p>;
  const values = list.map((p) => p.ladder);
  const low = Math.max(0, Math.floor((Math.min(...values) - 60) / 100) * 100);
  const high = Math.ceil((Math.max(...values) + 60) / 100) * 100;
  const x = (i: number) => 34 + (i / (list.length - 1)) * (W - 44);
  const y = (v: number) => 10 + (1 - (v - low) / Math.max(1, high - low)) * (H - 30);
  const line = list.map((p, i) => `${x(i).toFixed(1)},${y(p.ladder).toFixed(1)}`).join(' ');
  const tierLines = TIERS.map((t, i) => ({ tier: t, at: i * 400 })).filter((t) => t.at > low && t.at < high);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Rank points over the season">
      <ChartFill />
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} className="grid-line" x1={34} x2={W - 10} y1={10 + f * (H - 30)} y2={10 + f * (H - 30)} />
      ))}
      {tierLines.map((t) => (
        <g key={t.tier.id} data-tier={t.tier.id}>
          <line className="tier-line" x1={34} x2={W - 10} y1={y(t.at)} y2={y(t.at)} />
          <text className="tier-label" x={0} y={y(t.at) + 4}>
            {t.tier.name}
          </text>
        </g>
      ))}
      <polygon className="area" points={`${x(0)},${H - 20} ${line} ${x(list.length - 1)},${H - 20}`} />
      <polyline className="line" points={line} />
      {list.map((p, i) =>
        p.change === 'promoted' || p.change === 'demoted' ? (
          <circle key={i} className={p.change === 'promoted' ? 'dot-up' : 'dot-down'} cx={x(i)} cy={y(p.ladder)} r={4.5}>
            <title>{p.change === 'promoted' ? 'Promotion' : 'Demotion'}</title>
          </circle>
        ) : null,
      )}
      <text x={34} y={H - 4}>
        Game 1
      </text>
      <text x={W - 10} y={H - 4} textAnchor="end">
        {`Game ${list.length}`}
      </text>
    </svg>
  );
}

/** A small line of values 0–1 (the form: percentiles of the last games). */
export function Sparkline({ values, height = 56 }: { values: number[]; height?: number }) {
  const W = 300;
  if (values.length < 2) return null;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => 4 + (1 - v) * (height - 8);
  const line = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Form over the last games">
      <ChartFill />
      <line className="grid-line" x1={0} x2={W} y1={y(0.5)} y2={y(0.5)} />
      <polygon className="area" points={`0,${height} ${line} ${W},${height}`} />
      <polyline className="line" points={line} />
    </svg>
  );
}

/** The five axes of the grade: outside = better than the champion usually is. */
export function Radar({ values }: { values: number[] }) {
  const S = 340;
  const c = S / 2;
  const R = 96;
  const labels = Object.values(AXES);
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / labels.length;
  // −2 … +2 spreads mapped to 0 … R (0 = the champion's usual game, the dashed ring).
  const r = (v: number) => ((Math.max(-2, Math.min(2, v)) + 2) / 4) * R;
  const pt = (i: number, radius: number) => `${(c + Math.cos(angle(i)) * radius).toFixed(1)},${(c + Math.sin(angle(i)) * radius).toFixed(1)}`;
  const ring = (radius: number) => labels.map((_, i) => pt(i, radius)).join(' ');
  return (
    <svg className="chart radar" viewBox={`0 ${c - R - 34} ${S} ${2 * R + 64}`} role="img" aria-label={labels.map((l, i) => `${l}: ${values[i] >= 0 ? '+' : ''}${values[i].toFixed(1)}`).join(', ')}>
      {[1, 0.75, 0.25].map((f) => (
        <polygon key={f} className="ring" points={ring(R * f)} />
      ))}
      <polygon className="zero" points={ring(R / 2)} />
      {labels.map((_, i) => (
        <line key={i} x1={c} y1={c} x2={c + Math.cos(angle(i)) * R} y2={c + Math.sin(angle(i)) * R} />
      ))}
      <polygon className="shape" points={values.map((v, i) => pt(i, r(v))).join(' ')} />
      {labels.map((l, i) => {
        const a = angle(i);
        const tx = c + Math.cos(a) * (R + 16);
        const ty = c + Math.sin(a) * (R + 16) + 4;
        return (
          <text key={l} x={tx} y={ty} textAnchor={Math.abs(Math.cos(a)) < 0.2 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end'}>
            {l}
          </text>
        );
      })}
    </svg>
  );
}
