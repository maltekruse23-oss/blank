import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animate } from 'motion';
import { motion } from 'motion/react';
import { spring } from '../../design/motion';
import type { ResultMotion } from './AramResult';
import { PLACEMENT, rankName, type Rank, type RankResult } from './aramRating';
import { TierEmblem } from './TierEmblem';

/** Height of the strip on the card (CSS px). */
export const RANK_STRIP = 54;
/** How long the bar runs (s); a promotion or demotion lands halfway. */
const RUN = 1.3;

const fill = (rank: Rank | null) => (!rank ? 0 : rank.division === null ? 1 : rank.points / 100);
const mark = (value: number) => value.toFixed(1).replace('.', ',');

/**
 * The game on the ladder, on the card after the game (user's wish: MP gain and promotion with an
 * animation): the emblem, rank and points, the bar running from before to after, the points of
 * the game counting up. A promotion fills the bar, the new emblem lands with a ring; a demotion
 * drains it. Everything once; without motion at once the end.
 */
export function RankStrip({
  rank,
  run,
  delay,
}: {
  rank: RankResult;
  run: ResultMotion;
  delay: number;
}) {
  const [landed, setLanded] = useState(run === 'off');
  useEffect(() => {
    if (run === 'off') return setLanded(true);
    setLanded(false);
    if (run === 'wait') return;
    const timer = window.setTimeout(() => setLanded(true), (delay + RUN / 2) * 1000);
    return () => window.clearTimeout(timer);
  }, [run, delay]);

  const placing = rank.after === null;
  const shown = landed ? (rank.after ?? rank.before) : (rank.before ?? null);
  const up = rank.change === 'promoted' || rank.change === 'placed';
  const down = rank.change === 'demoted';
  const from = fill(rank.before);
  const to = fill(rank.after);
  const widths = up && rank.before ? [from, 1, 0, to] : down ? [from, 0, 1, to] : [from, to];
  const times = widths.length === 4 ? [0, 0.5, 0.501, 1] : [0, 1];
  const label =
    rank.change === 'promoted'
      ? 'Aufstieg!'
      : rank.change === 'demoted'
        ? 'Abstieg'
        : rank.change === 'placed'
          ? 'Eingestuft!'
          : null;

  return (
    <motion.div
      className={`rank-strip ${landed && up ? 'up' : ''} ${landed && down ? 'down' : ''}`}
      initial={run === 'off' ? false : { opacity: 0, y: 8 }}
      animate={run === 'wait' ? { opacity: 0, y: 8 } : { opacity: 1, y: 0 }}
      transition={{ ...spring('default'), delay, opacity: { duration: 0.25, delay } }}
    >
      <span className="rank-strip-emblem">
        {shown ? (
          <motion.span
            key={shown.tier.id}
            initial={run === 'play' && landed && up ? { scale: 0.3, rotate: -20 } : false}
            animate={{ scale: 1, rotate: 0 }}
            transition={spring('bouncy')}
          >
            <TierEmblem tier={shown.tier} size={46} provisional={placing} />
          </motion.span>
        ) : (
          <span className="rank-placing small" aria-hidden="true">
            ?
          </span>
        )}
        {run === 'play' && landed && up && (
          <motion.span
            className="rank-strip-ring"
            aria-hidden
            initial={{ scale: 0.5, opacity: 0.9 }}
            animate={{ scale: 1.9, opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        )}
      </span>
      <span className="rank-strip-main">
        <span className="rank-strip-name">
          {placing ? (
            <>
              Einstufung {rank.games}/{PLACEMENT}
            </>
          ) : shown ? (
            <>
              <b>{rankName(shown)}</b> {shown.points} MP
            </>
          ) : null}
        </span>
        {placing ? (
          <span className="rank-strip-note">Note {mark(rank.mark)}</span>
        ) : (
          <span className="rank-progress rank-strip-bar">
            <motion.span
              initial={run === 'off' ? false : { width: `${from * 100}%` }}
              animate={
                run === 'wait'
                  ? { width: `${from * 100}%` }
                  : { width: widths.map((w) => `${w * 100}%`) }
              }
              transition={{ duration: run === 'off' ? 0 : RUN, delay, times, ease: 'easeInOut' }}
            />
          </span>
        )}
      </span>
      {rank.gain !== null && (
        <span className={`rank-strip-gain ${rank.gain > 0 ? 'plus' : 'minus'}`}>
          <Points value={rank.gain} run={run} delay={delay} />
          <small>MP</small>
        </span>
      )}
      {label && landed && (
        <motion.span
          className={`rank-strip-label ${down ? 'down' : ''}`}
          initial={run === 'play' ? { opacity: 0, scale: 1.8 } : false}
          animate={{ opacity: 1, scale: 1 }}
          transition={spring('bouncy')}
        >
          {label}
        </motion.span>
      )}
    </motion.div>
  );
}

/** "+22" counting up from 0 (written straight into the element). */
function Points({ value, run, delay }: { value: number; run: ResultMotion; delay: number }) {
  const element = useRef<HTMLSpanElement>(null);
  const format = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}`;
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
      duration: RUN,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        target.textContent = format(v);
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- counts again only for a new value or run
  }, [value, run]);
  return <b ref={element}>{format(value)}</b>;
}
