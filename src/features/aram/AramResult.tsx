import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { animate } from 'motion';
import { motion, type Transition } from 'motion/react';
import { Crown, Swords, X } from 'lucide-react';
import {
  championSplash,
  championSquare,
  itemIcon,
  splitRiotId,
  type AramAugment,
  type AramEntry,
} from '../../adapters/aram';
import { spring } from '../../design/motion';
import type { AramHighlight } from './aramHighlight';
import { duration, number, percent } from './format';

/**
 * "play": the card builds up now; "wait": everything waits hidden (a popout not on screen yet);
 * "off": no animation, all values at once (Animationen off).
 */
export type ResultMotion = 'play' | 'wait' | 'off';

/** When each part comes, in seconds from the start (user's wish: all stats load in animated). */
const T = {
  head: 0.12,
  who: 0.2,
  damage: 0.3,
  count: 1.3,
  stats: 0.55,
  statStep: 0.07,
  augments: 1.0,
  augmentStep: 0.08,
  items: 1.25,
  itemStep: 0.05,
  /** The special part for a top game: badge, shine, glow; for a record also the burst. */
  special: 1.65,
  lines: 1.9,
};
const EASE_OUT: Transition['ease'] = [0.16, 1, 0.3, 1];

/** A number counting up from 0, written straight into the element (no re-render per frame). */
function Count({
  value,
  format,
  delay,
  seconds = 0.9,
  run,
}: {
  value: number;
  format: (value: number) => string;
  delay: number;
  seconds?: number;
  run: ResultMotion;
}) {
  const element = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const target = element.current;
    if (!target) return;
    if (run === 'off') {
      target.textContent = format(value);
      return;
    }
    target.textContent = format(0);
    if (run === 'wait') return;
    const controls = animate(0, value, {
      duration: seconds,
      delay,
      ease: EASE_OUT,
      onUpdate: (v) => {
        target.textContent = format(v);
      },
    });
    return () => controls.stop();
  }, [value, run]);
  return <span ref={element}>{format(value)}</span>;
}

/** A burst of sparks out of the damage number, once (a new record or first place). */
function Burst({ delay }: { delay: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const { width, height } = element.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    element.width = Math.round(width * ratio);
    element.height = Math.round(height * ratio);
    context.scale(ratio, ratio);
    // Colours of the scheme (tokens), never fixed ones.
    const style = getComputedStyle(element);
    const colors = ['--accent', '--text', '--accent-line', '--accent']
      .map((name) => style.getPropertyValue(name).trim())
      .filter(Boolean);
    const scale = width / 560;
    const origin = { x: width * 0.2, y: height * 0.5 };
    const sparks = Array.from({ length: 90 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = (1.5 + Math.random() * 5.5) * scale;
      return {
        x: origin.x + (Math.random() - 0.5) * 60 * scale,
        y: origin.y + (Math.random() - 0.5) * 16 * scale,
        vx: Math.cos(angle) * speed * 1.4,
        vy: Math.sin(angle) * speed - 2 * scale,
        size: (1.5 + Math.random() * 2.5) * scale,
        spin: Math.random() * Math.PI,
        life: 55 + Math.random() * 55,
        color: colors[Math.floor(Math.random() * colors.length)] ?? 'currentColor',
      };
    });
    const start = performance.now() + delay * 1000;
    let frame = 0;
    let last = start;
    const step = (now: number) => {
      if (now < start) {
        frame = requestAnimationFrame(step);
        return;
      }
      const dt = Math.min(3, (now - last) / 16.7);
      last = now;
      context.clearRect(0, 0, width, height);
      let alive = 0;
      for (const s of sparks) {
        if (s.life <= 0) continue;
        alive += 1;
        s.life -= dt;
        s.vy += 0.09 * scale * dt;
        s.vx *= 0.985;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.spin += 0.2 * dt;
        context.globalAlpha = Math.min(1, s.life / 30);
        context.fillStyle = s.color;
        context.save();
        context.translate(s.x, s.y);
        context.rotate(s.spin);
        context.fillRect(-s.size, -s.size / 2, s.size * 2, s.size);
        context.restore();
      }
      if (alive > 0) frame = requestAnimationFrame(step);
      else context.clearRect(0, 0, width, height);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <canvas ref={canvas} className="aram-result-burst" aria-hidden />;
}

/** One part of the card: hidden, then in with its delay (or at once without motion). */
function Part({
  run,
  delay,
  className,
  children,
  from = { opacity: 0, y: 10 },
  transition,
}: {
  run: ResultMotion;
  delay: number;
  className?: string;
  children: ReactNode;
  from?: Record<string, number | string>;
  transition?: Transition;
}) {
  return (
    <motion.div
      className={className}
      initial={run === 'off' ? false : from}
      animate={run === 'wait' ? from : { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }}
      // A value's own transition replaces the shared one: it needs the delay too.
      transition={{
        ...spring('default'),
        ...transition,
        delay,
        opacity: { duration: 0.25, delay },
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * The card after an ARAM Mayhem game (user's wish, after the example of a post-game card): the
 * champion's splash art from the side, the damage counting up, then stats, augments and items one
 * after another. A special game (most damage, a record, first place) gets a badge stamped on, a
 * shine and a glow; a record or first place also a burst of sparks. Everything happens once.
 */
/** Height of the card (CSS px): the result, plus the friends in the game below it. */
const BASE_HEIGHT = 232;
const MATES_HEAD = 34;
const MATE_ROW = 27;
const MAX_MATES = 4;
export const resultHeight = (entry: AramEntry) =>
  BASE_HEIGHT +
  (entry.with.length > 0
    ? MATES_HEAD + MATE_ROW * (1 + Math.min(MAX_MATES, entry.with.length))
    : 0);

/**
 * The friends of the user in the same game next to the user (user's wish: compare with the friends
 * from the lobby): damage as bars in the classic colours, K/D/A; the bars grow after the card.
 */
function Mates({ entry, run }: { entry: AramEntry; run: ResultMotion }) {
  const rows = [
    {
      key: entry.puuid,
      name: 'Du',
      champion: entry.champion,
      championName: entry.championName,
      damage: entry.damage,
      kda: `${entry.kills} / ${entry.deaths} / ${entry.assists}`,
      me: true,
      foe: false,
    },
    ...[...entry.with]
      .sort((a, b) => b.damage - a.damage)
      .slice(0, MAX_MATES)
      .map((m) => ({
        key: m.puuid,
        name: splitRiotId(m.name).name,
        champion: m.champion,
        championName: m.championName,
        damage: m.damage,
        kda: `${m.kills} / ${m.deaths} / ${m.assists}`,
        me: false,
        foe: !m.sameTeam,
      })),
  ].sort((a, b) => b.damage - a.damage);
  const top = Math.max(1, ...rows.map((row) => row.damage));
  const best = rows[0]?.me && rows.length > 1;
  return (
    <div className="aram-result-mates">
      <p className="aram-result-mates-head">
        <span>Mit Freunden im Spiel</span>
        {best && <b>Du hattest den meisten Schaden</b>}
      </p>
      <ol>
        {rows.map((row, i) => {
          const icon = championSquare(row.champion);
          return (
            <li
              key={row.key}
              className={row.me ? 'me' : ''}
              style={
                { '--place': i < 3 ? `var(--rank-${i + 1})` : 'var(--rank-rest)' } as CSSProperties
              }
            >
              <span className="aram-bar-place">{i + 1}</span>
              {icon ? (
                <img src={icon} alt="" width={18} height={18} title={row.championName} />
              ) : (
                <span className="aram-mate-icon" aria-hidden />
              )}
              <span className="aram-mate-name">
                {row.name}
                {row.foe && <small>Gegner</small>}
              </span>
              <span className="aram-mate-track" aria-hidden>
                <motion.span
                  className="aram-mate-fill"
                  style={{ width: `${(row.damage / top) * 100}%` }}
                  initial={run === 'off' ? false : { scaleX: 0 }}
                  animate={run === 'wait' ? { scaleX: 0 } : { scaleX: 1 }}
                  transition={{ ...spring('default'), delay: T.lines + 0.1 + i * 0.08 }}
                />
              </span>
              <b className="aram-mate-damage">{number(row.damage)}</b>
              <small className="aram-mate-kda">{row.kda}</small>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function AramResultCard({
  entry,
  augments,
  highlight,
  run,
  onClose,
  onOpen,
}: {
  entry: AramEntry;
  augments: Record<string, AramAugment>;
  highlight: AramHighlight;
  run: ResultMotion;
  onClose?: () => void;
  /** A click on the card (not on its close button): opens the ranking. */
  onOpen?: () => void;
}) {
  const splash = championSplash(entry.champion);
  const { name, tag } = splitRiotId(entry.name);
  const special = highlight.tier !== 'normal';
  const legend = highlight.tier === 'legend';
  const moving = run !== 'off';
  const stats: [string, number, (v: number) => string][] = [
    ['Kills', entry.kills, (v) => String(Math.round(v))],
    [
      'K / D / A',
      1,
      (v) =>
        `${Math.round(entry.kills * v)} / ${Math.round(entry.deaths * v)} / ${Math.round(entry.assists * v)}`,
    ],
    ['Anteil Team', entry.teamShare, percent],
    ['Eingesteckt', entry.taken, number],
    ['Geheilt', entry.healed, number],
  ];
  return (
    <article
      className={`aram-result tier-${highlight.tier} ${entry.win ? 'win' : 'loss'} ${onOpen ? 'clickable' : ''} ${entry.with.length > 0 ? 'with-mates' : ''}`}
      style={{ height: resultHeight(entry) }}
      title={onOpen ? 'Rangliste in blank. öffnen' : undefined}
      onClick={onOpen}
      aria-label={`ARAM Mayhem: ${entry.win ? 'Sieg' : 'Niederlage'}, ${number(entry.damage)} Schaden an Champions`}
    >
      {splash && (
        <motion.img
          className="aram-result-splash"
          src={splash}
          alt=""
          initial={moving ? { opacity: 0, x: 60, scale: 1.12 } : false}
          animate={
            run === 'wait' ? { opacity: 0, x: 60, scale: 1.12 } : { opacity: 1, x: 0, scale: 1 }
          }
          transition={{ duration: 1.1, ease: EASE_OUT }}
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      )}
      {special && moving && run === 'play' && (
        <motion.span
          className="aram-result-shine"
          aria-hidden
          initial={{ x: '-120%' }}
          animate={{ x: '120%' }}
          transition={{ duration: 0.9, delay: T.special, ease: 'easeOut' }}
        />
      )}
      {special && (
        <motion.span
          className="aram-result-glow"
          aria-hidden
          initial={moving ? { opacity: 0 } : false}
          animate={
            run === 'wait'
              ? { opacity: 0 }
              : { opacity: moving ? [0, 1, legend ? 0.75 : 0.45] : legend ? 0.75 : 0.45 }
          }
          transition={{ duration: 1.2, delay: T.special, times: [0, 0.3, 1] }}
        />
      )}
      {legend && run === 'play' && <Burst delay={T.special} />}
      <div className="aram-result-body">
        <Part run={run} delay={T.head} className="aram-result-head">
          <Swords size={14} aria-hidden />
          <span>ARAM Mayhem</span>
          <i aria-hidden>·</i>
          <b className="aram-result-outcome">{entry.win ? 'Sieg' : 'Niederlage'}</b>
          <i aria-hidden>·</i>
          <span className="aram-result-time">{duration(entry.seconds)}</span>
        </Part>
        <Part run={run} delay={T.who} className="aram-result-who">
          <b>{name}</b>
          {tag && <small>#{tag}</small>}
          <span>{entry.championName || 'Champion'}</span>
        </Part>
        <Part
          run={run}
          delay={T.damage}
          className="aram-result-damage"
          from={{ opacity: 0, x: -24 }}
        >
          <motion.strong
            animate={
              special && run === 'play'
                ? { scale: [1, 1.09, 1], transition: { delay: T.special, duration: 0.5 } }
                : undefined
            }
          >
            <Count
              value={entry.damage}
              format={number}
              delay={T.damage}
              seconds={T.count}
              run={run}
            />
          </motion.strong>
          <span>Schaden an Champions</span>
        </Part>
        <dl className="aram-result-stats">
          {stats.map(([label, value, format], i) => (
            <Part
              key={label}
              run={run}
              delay={T.stats + i * T.statStep}
              className="aram-result-stat"
            >
              <dd>
                <Count value={value} format={format} delay={T.stats + i * T.statStep} run={run} />
              </dd>
              <dt>{label}</dt>
            </Part>
          ))}
        </dl>
        <div className="aram-result-loadout">
          {entry.augments.length > 0 && (
            <ul className="aram-augments" aria-label="Augments">
              {entry.augments.map((id, i) => {
                const augment = augments[String(id)];
                return (
                  <motion.li
                    key={`${id}-${i}`}
                    className={augment?.rarity ?? ''}
                    title={augment?.name ?? 'Augment'}
                    initial={moving ? { opacity: 0, scale: 0, rotate: -90 } : false}
                    animate={
                      run === 'wait'
                        ? { opacity: 0, scale: 0, rotate: -90 }
                        : { opacity: 1, scale: 1, rotate: 0 }
                    }
                    transition={{ ...spring('bouncy'), delay: T.augments + i * T.augmentStep }}
                  >
                    {augment?.icon ? (
                      <img src={augment.icon} alt={augment.name} width={24} height={24} />
                    ) : (
                      <span>{(augment?.name ?? '?').slice(0, 2)}</span>
                    )}
                  </motion.li>
                );
              })}
            </ul>
          )}
          {entry.items.length > 0 && (
            <div className="aram-items" aria-label="Items">
              {entry.items.map((item, i) => (
                <motion.img
                  key={`${item}-${i}`}
                  src={itemIcon(item, entry.patch)}
                  alt=""
                  width={26}
                  height={26}
                  initial={moving ? { opacity: 0, y: 12, scale: 0.6 } : false}
                  animate={
                    run === 'wait'
                      ? { opacity: 0, y: 12, scale: 0.6 }
                      : { opacity: 1, y: 0, scale: 1 }
                  }
                  transition={{ ...spring('snappy'), delay: T.items + i * T.itemStep }}
                  onError={(event) => {
                    event.currentTarget.hidden = true;
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      {highlight.badge && (
        <motion.span
          className="aram-result-badge"
          initial={moving ? { opacity: 0, scale: 2.4, rotate: -14 } : false}
          animate={
            run === 'wait'
              ? { opacity: 0, scale: 2.4, rotate: -14 }
              : { opacity: 1, scale: 1, rotate: 0 }
          }
          transition={{
            ...spring('bouncy'),
            delay: T.special,
            opacity: { duration: 0.15, delay: T.special },
          }}
        >
          {legend && (
            <motion.span
              className="aram-result-crown"
              initial={moving ? { y: -22, rotate: -30, opacity: 0 } : false}
              animate={
                run === 'wait'
                  ? { y: -22, rotate: -30, opacity: 0 }
                  : { y: 0, rotate: 0, opacity: 1 }
              }
              transition={{ ...spring('bouncy'), delay: T.special + 0.25 }}
            >
              <Crown size={13} />
            </motion.span>
          )}
          {highlight.badge}
        </motion.span>
      )}
      {highlight.lines.length > 0 && (
        <Part run={run} delay={T.lines} className="aram-result-lines" from={{ opacity: 0, y: 8 }}>
          {highlight.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </Part>
      )}
      {entry.with.length > 0 && <Mates entry={entry} run={run} />}
      {onClose && (
        <button
          className="aram-result-close"
          aria-label="Schließen"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          <X size={15} />
        </button>
      )}
    </article>
  );
}
