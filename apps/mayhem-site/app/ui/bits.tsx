'use client';
// Small parts used on every page: grades, rank marks, images, tabs and the charts (plain SVG,
// no chart library).
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Grade } from '../../src/features/aram/aramPerformance';
import { rankName, TIERS, type Rank } from '../../src/features/aram/aramRating';
import type { AugmentInfo } from '../../src/augments';
import { AXES } from '../../src/insights';
import { augmentImage } from './data';

// ---- Grades and ranks ---------------------------------------------------------------------

export function GradeIcon({ grade, size = 46 }: { grade: Grade; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static artwork, fixed size
    <img
      className="grade-icon"
      src={`/grades/${grade.toLowerCase()}.png`}
      width={size}
      height={size}
      alt={`Note ${grade}`}
    />
  );
}

export function GradeChip({ grade, gain, small }: { grade: Grade; gain?: number | null; small?: boolean }) {
  const title = gain === undefined || gain === null ? `Note ${grade}` : `Note ${grade}, ${gain > 0 ? '+' : ''}${gain} MP`;
  return (
    <span className={'grade' + (gain !== undefined ? ' gain' : '') + (small ? ' sm' : '')} data-g={grade} title={title}>
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
  const style = size ? ({ '--size': `${size}px` } as React.CSSProperties) : undefined;
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

export function RankLine({ rank, placed }: { rank: Rank | null; placed: number }) {
  return (
    <div className="rank-cell" data-tier={rank?.tier.id}>
      <TierMark rank={rank} />
      <div>
        {rank ? (
          <>
            <b className="tier-text">{rankName(rank)}</b>{' '}
            <span className="muted num">{rank.points} MP</span>
            <div className="mp-bar" aria-hidden>
              <span style={{ width: `${fillOf(rank)}%` }} />
            </div>
          </>
        ) : (
          <>
            <b className="muted">Einstufung</b> <span className="faint num">{placed}/5</span>
            <div className="mp-bar" aria-hidden>
              <span style={{ width: `${placed * 20}%`, background: 'var(--faint)' }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- Problems ----------------------------------------------------------------------------------

/** What went wrong, in plain words: something that does not exist (a player, game or
 * champion) with ways on, or a failed load with a way to try again. */
export function Problem({ message, missing = false }: { message: string; missing?: boolean }) {
  if (missing)
    return (
      <section className="card problem" role="alert">
        <h1>{message}</h1>
        <p className="muted">Der Link ist vielleicht falsch oder veraltet, oder die Daten wurden gelöscht oder ausgeblendet.</p>
        <p className="problem-links">
          <Link href="/">Zur Startseite</Link>
          <Link href="/rangliste">Zur Rangliste</Link>
        </p>
      </section>
    );
  return (
    <div className="error" role="alert">
      {message}{' '}
      <button type="button" className="link-button" onClick={() => window.location.reload()}>
        Neu laden
      </button>
    </div>
  );
}

// ---- Images ---------------------------------------------------------------------------------

export function Img({ src, className, alt = '', size }: { src?: string; className: string; alt?: string; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- images from Riot's CDN, no optimizer
  return src ? <img className={className} src={src} alt={alt} width={size} height={size} loading="lazy" /> : <span className={className} aria-hidden />;
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

// ---- Tabs -----------------------------------------------------------------------------------

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
          role="tab"
          aria-selected={o.id === value}
          tabIndex={o.id === value ? 0 : -1}
          onClick={() => onChange(o.id)}
          onKeyDown={(e) => {
            const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (!step) return;
            const next = options[(i + step + options.length) % options.length];
            onChange(next.id);
            (e.currentTarget.parentElement?.children[(i + step + options.length) % options.length] as HTMLElement)?.focus();
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- Charts ---------------------------------------------------------------------------------

/** How many players are in each tier. */
export function Histogram({ rows }: { rows: { tier: (typeof TIERS)[number]; players: number }[] }) {
  const most = Math.max(1, ...rows.map((r) => r.players));
  return (
    <div className="histogram" style={{ '--n': rows.length } as React.CSSProperties} role="img" aria-label={rows.map((r) => `${r.tier.name}: ${r.players}`).join(', ')}>
      {rows.map((r, i) => (
        <div key={r.tier.id} data-tier={r.tier.id}>
          <span className="num">{r.players || ''}</span>
          <div className="track">
            <div className="bar" style={{ height: `${(r.players / most) * 100}%`, animationDelay: `${i * 40}ms` }} />
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

/** The way through the season: the ladder after each game, tier lines, rise and fall marked. */
export function LadderChart({ points }: { points: { ladder: number; change: string | null }[] }) {
  const W = 640;
  const H = 200;
  if (points.length < 2) return <p className="empty">Der Verlauf erscheint ab zwei gewerteten Spielen.</p>;
  const values = points.map((p) => p.ladder);
  const low = Math.max(0, Math.floor((Math.min(...values) - 60) / 100) * 100);
  const high = Math.ceil((Math.max(...values) + 60) / 100) * 100;
  const x = (i: number) => 30 + (i / (points.length - 1)) * (W - 40);
  const y = (v: number) => 10 + (1 - (v - low) / Math.max(1, high - low)) * (H - 30);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.ladder).toFixed(1)}`).join(' ');
  const tierLines = TIERS.map((t, i) => ({ tier: t, at: i * 400 })).filter((t) => t.at > low && t.at < high);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="MP-Verlauf der Saison">
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} className="grid-line" x1={30} x2={W - 10} y1={10 + f * (H - 30)} y2={10 + f * (H - 30)} />
      ))}
      {tierLines.map((t) => (
        <g key={t.tier.id} data-tier={t.tier.id}>
          <line className="grid-line tier" x1={30} x2={W - 10} y1={y(t.at)} y2={y(t.at)} />
          <text className="tier-label" x={0} y={y(t.at) + 4}>
            {t.tier.name}
          </text>
        </g>
      ))}
      <polygon className="area" points={`${x(0)},${H - 20} ${line} ${x(points.length - 1)},${H - 20}`} />
      <polyline className="line" points={line} />
      {points.map((p, i) =>
        p.change === 'promoted' || p.change === 'demoted' ? (
          <circle key={i} className={p.change === 'promoted' ? 'dot-up' : 'dot-down'} cx={x(i)} cy={y(p.ladder)} r={4.5}>
            <title>{p.change === 'promoted' ? 'Aufstieg' : 'Abstieg'}</title>
          </circle>
        ) : null,
      )}
      <text x={30} y={H - 4}>
        Spiel 1
      </text>
      <text x={W - 10} y={H - 4} textAnchor="end">
        Spiel {points.length}
      </text>
    </svg>
  );
}

/** A small line of values 0–1 (the form: percentiles of the last games). */
export function Sparkline({ values, height = 46 }: { values: number[]; height?: number }) {
  const W = 300;
  if (values.length < 2) return null;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => 4 + (1 - v) * (height - 8);
  const line = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Form der letzten Spiele">
      <line className="grid-line" x1={0} x2={W} y1={y(0.5)} y2={y(0.5)} />
      <polygon className="area" points={`0,${height} ${line} ${W},${height}`} />
      <polyline className="line" points={line} />
    </svg>
  );
}

/** The five axes of the grade: outside = better than the champion usually is. `compare` draws a
 * second player (the duel). */
export function Radar({ values, compare }: { values: number[]; compare?: number[] | null }) {
  const S = 320;
  const c = S / 2;
  const R = 92;
  const labels = Object.values(AXES);
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / labels.length;
  // −2 … +2 spreads mapped to 0 … R (0 = the champion's usual game, the dashed ring).
  const r = (v: number) => (Math.max(-2, Math.min(2, v)) + 2) / 4 * R;
  const pt = (i: number, radius: number) => `${(c + Math.cos(angle(i)) * radius).toFixed(1)},${(c + Math.sin(angle(i)) * radius).toFixed(1)}`;
  const ring = (radius: number) => labels.map((_, i) => pt(i, radius)).join(' ');
  return (
    <svg className="chart radar" viewBox={`0 0 ${S} ${S}`} role="img" aria-label={labels.map((l, i) => `${l}: ${values[i] >= 0 ? '+' : ''}${values[i].toFixed(1)}`).join(', ')}>
      {[1, 0.75, 0.25].map((f) => (
        <polygon key={f} className="ring" points={ring(R * f)} />
      ))}
      <polygon className="zero" points={ring(R / 2)} />
      {labels.map((_, i) => (
        <line key={i} x1={c} y1={c} x2={c + Math.cos(angle(i)) * R} y2={c + Math.sin(angle(i)) * R} />
      ))}
      {compare && <polygon className="shape second" points={compare.map((v, i) => pt(i, r(v))).join(' ')} />}
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
