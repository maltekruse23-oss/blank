// The card after an ARAM Mayhem game in the Mayhem app (ROADMAP "Als Nächstes 0", user's wish
// 08.10.2026 "eine After-Game-Card auch mit einbauen wie bei blank"): blank.'s AramResult in the
// look "Arena" (MAYHEM-DESIGN.md), a dialog in the window, never a popout. One line with the
// result, champion and length; the damage big and counting up; up to two record chips; three
// values and the augments; the game on mayhemstats.lol's ladder; the friends and listed players of
// the game as bars. Everything moves once, soft and without bounce; while the window is minimized
// it waits and plays on return, with reduced motion everything is simply there. English only.
// (Not AfterGame.tsx: Windows does not tell the name apart from afterGame.ts, the logic.)
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Crown, X } from 'lucide-react';
import { championSplash, championSquare, splashFallback } from '../adapters/aram';
import { openGame, type GameCard } from '../adapters/aramSite';
import { PLACEMENT, rankName, type RankResult } from '../features/aram/aramRating';
import { damagePerMinute } from '../features/aram/aramStats';
import { duration } from '../features/aram/format';
import { rankRun } from '../features/aram/rankRun';
import { cardLevel, chipText, recordChips, type CardRank } from './afterGame';
import { number, percent } from './format';
import { rankImage, step } from './pages';
import type { RecordCard } from './records';
import { GradeMark, Overlay } from './ui';

/** "play": moves now; "wait": not seen yet (minimized), everything holds at its start; "off": no
 * motion, everything at its end. */
type Run = 'play' | 'wait' | 'off';

/** When the counting parts start (ms), in step with the parts gliding in (mayhem.css, --i). */
const T = { damage: 150, stats: 300, rank: 700 };
/** How long the damage counts and the rank bar runs (ms); a promotion lands halfway. */
const COUNT = 1300;
const RUN = 1300;
/** Record chips on the card; more are counted ("+1"). */
const CHIPS = 2;
/** Others of the game next to the player. */
const MATES = 4;
const SOFT = 'cubic-bezier(0.22, 1, 0.36, 1)';

function useRun(): Run {
  const [reduced] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  const [seen, setSeen] = useState(() => !document.hidden);
  useEffect(() => {
    if (seen) return;
    const look = () => {
      if (!document.hidden) setSeen(true);
    };
    document.addEventListener('visibilitychange', look);
    return () => document.removeEventListener('visibilitychange', look);
  }, [seen]);
  return reduced ? 'off' : seen ? 'play' : 'wait';
}

/** A number counting up from 0, written straight into the element (no render per frame). */
function Count({
  value,
  format,
  delay,
  ms = 900,
  run,
}: {
  value: number;
  format: (value: number) => string;
  delay: number;
  ms?: number;
  run: Run;
}) {
  const element = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const target = element.current;
    if (!target) return;
    if (run !== 'play') {
      target.textContent = format(run === 'off' ? value : 0);
      return;
    }
    const start = performance.now() + delay;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / ms));
      target.textContent = format(value * (1 - (1 - t) ** 4));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- counts again only for a new value or run
  }, [value, run]);
  return <span ref={element} />;
}

const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}`;

/** The game on the ladder (blank.'s RankStrip): emblem, rank and MP, the bar running from before to
 * after, the game's points counting. A promotion fills the bar and the new emblem comes out of a
 * blooming light; a demotion drains it. */
function Strip({ rank, run }: { rank: RankResult; run: Run }) {
  const bar = useRef<HTMLSpanElement>(null);
  const [landed, setLanded] = useState(run === 'off');
  const { up, down, to, widths, times } = rankRun(rank);
  useLayoutEffect(() => {
    if (run !== 'play' || !bar.current) return;
    const motion = bar.current.animate(
      widths.map((w, i) => ({ width: `${w * 100}%`, offset: times[i], easing: SOFT })),
      { duration: RUN, delay: T.rank, fill: 'backwards' },
    );
    const timer = window.setTimeout(() => setLanded(true), T.rank + RUN / 2);
    return () => {
      motion.cancel();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per game (and on return)
  }, [run]);
  const placing = rank.after === null;
  const shown = landed ? (rank.after ?? rank.before) : rank.before;
  const label =
    rank.change === 'promoted'
      ? 'Promoted!'
      : rank.change === 'demoted'
        ? 'Demoted'
        : rank.change === 'placed'
          ? 'Placed!'
          : null;
  return (
    <div className="mayhem-result-rank">
      <span className="mayhem-result-emblem" data-bloom={run === 'play' && landed && up}>
        {shown ? (
          <img key={shown.tier.id} src={rankImage(shown)} alt="" width={58} height={58} />
        ) : (
          <span aria-hidden>?</span>
        )}
      </span>
      <span className="mayhem-result-rank-main">
        {placing ? (
          <>
            <b>
              Placement {rank.games}/{PLACEMENT}
            </b>
            <small>Your rank comes after {PLACEMENT} games</small>
          </>
        ) : (
          <>
            <span>
              <b>{shown ? rankName(shown) : '–'}</b> {shown ? `${shown.points} MP` : ''}
              {label && landed && (
                <span className="mayhem-result-change" data-down={down}>
                  {label}
                </span>
              )}
            </span>
            <span className="mayhem-bar">
              <span ref={bar} style={{ width: `${to * 100}%` }} />
            </span>
          </>
        )}
      </span>
      {rank.gain !== null && (
        <span className="mayhem-mp" data-down={rank.gain < 0}>
          <Count value={rank.gain} format={signed} delay={T.rank} ms={RUN} run={run} /> MP
        </span>
      )}
      <GradeMark grade={rank.grade} size={46} />
    </div>
  );
}

/** The rank line: the strip, or why there is none yet. */
function RankLine({
  rank,
  run,
  onFindRank,
  onRetry,
}: {
  rank: CardRank;
  run: Run;
  onFindRank: () => void;
  onRetry: () => void;
}) {
  if (rank.state === 'none') return null;
  if (rank.state === 'ready') return <Strip rank={rank.rank} run={run} />;
  if (rank.state === 'failed')
    return (
      <div className="mayhem-result-hint" role="status">
        <span>{rank.message}</span>
        <button type="button" className="mayhem-button small" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  if (rank.state === 'unlisted')
    return (
      <div className="mayhem-result-hint">
        <span>Not on the leaderboard yet.</span>
        <button type="button" className="mayhem-button small primary" onClick={onFindRank}>
          Find my Mayhem rank
        </button>
      </div>
    );
  const line = {
    waiting: 'Your rank updates once mayhemstats.lol has this game …',
    late: 'mayhemstats.lol does not have this game yet. The Rank page shows it later.',
    remake: 'Remake: shorter than 8 minutes, does not count for your rank.',
  }[rank.state];
  return (
    <p className="mayhem-result-hint mayhem-note" role="status">
      {line}
    </p>
  );
}

/** The player and the others of the game (League friends, listed players) as damage bars. */
function Mates({ card }: { card: GameCard }) {
  const { entry } = card;
  const rows = [
    { ...entry, key: 'you', name: 'You', foe: false, me: true },
    ...[...entry.with]
      .sort((a, b) => b.damage - a.damage)
      .slice(0, MATES)
      .map((m) => ({
        ...m,
        key: m.puuid,
        name: m.name.split('#')[0]!,
        foe: !m.sameTeam,
        me: false,
      })),
  ].sort((a, b) => b.damage - a.damage);
  const top = Math.max(1, ...rows.map((r) => r.damage));
  return (
    <section className="mayhem-result-mates mayhem-in" style={step(7)}>
      <h3>In this game</h3>
      <ol>
        {rows.map((row, i) => (
          <li key={row.key} data-me={row.me} data-place={i + 1}>
            <span className="mayhem-place">{i + 1}</span>
            <img
              src={championSquare(row.champion) ?? undefined}
              alt=""
              title={row.championName}
              width={24}
              height={24}
            />
            <span className="mayhem-result-mate">
              {row.name}
              {row.foe && <small>Enemy</small>}
            </span>
            <span className="mayhem-result-track" aria-hidden>
              <span style={{ width: `${(row.damage / top) * 100}%`, ...step(i) }} />
            </span>
            <b title={`K/D/A ${row.kills}/${row.deaths}/${row.assists}`}>{number(row.damage)}</b>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function AfterGame({
  card,
  records,
  siteId,
  rank,
  mock,
  onClose,
  onFindRank,
  onRetry,
}: {
  card: GameCard;
  /** mayhemstats.lol's all-time records (records.ts; empty until they came, or without them: no
   * chips). */
  records: RecordCard[];
  /** The player's public id on mayhemstats.lol, null when not listed. */
  siteId: string | null;
  rank: CardRank;
  /** Invented values of the browser preview. */
  mock: boolean;
  onClose: () => void;
  onFindRank: () => void;
  /** Asks mayhemstats.lol for the player again. */
  onRetry: () => void;
}) {
  const run = useRun();
  const { entry, augments } = card;
  const chips = recordChips(entry, records, siteId);
  const { level, badge } = cardLevel(entry, chips);
  const splash = championSplash(entry.champion, entry.skin);
  const perMinute = damagePerMinute(entry);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);
  const kda = (v: number) =>
    `${Math.round(entry.kills * v)} / ${Math.round(entry.deaths * v)} / ${Math.round(entry.assists * v)}`;
  type Stat = [string, number, (v: number) => string];
  const stats: Stat[] = [
    ['K / D / A', 1, kda],
    ...(perMinute === null ? [] : [['Damage / min', perMinute, number] as Stat]),
    ['Team share', entry.teamShare, percent],
  ];
  const more = chips.slice(CHIPS);
  return (
    <Overlay onClose={onClose}>
      <article
        className="mayhem-result"
        data-level={level}
        data-win={entry.win}
        data-run={run}
        role="dialog"
        aria-modal="true"
        aria-label={`ARAM Mayhem: ${entry.win ? 'Victory' : 'Defeat'}, ${number(entry.damage)} damage to champions`}
      >
        {splash && (
          <img
            className="mayhem-result-splash"
            src={splash}
            alt=""
            onError={(event) => splashFallback(event, entry.champion, entry.skin)}
          />
        )}
        <div className="mayhem-result-body">
          <header className="mayhem-result-head mayhem-in" style={step(0)}>
            <b className="mayhem-result-outcome">{entry.win ? 'Victory' : 'Defeat'}</b>
            <span>{entry.championName || 'Champion'}</span>
            <span className="mono">{duration(entry.seconds)}</span>
            {mock && <span className="mayhem-pill mock">Mock</span>}
          </header>
          {badge && (
            <span className="mayhem-result-badge mayhem-in" style={step(4)}>
              {level === 'legend' && <Crown size={14} aria-hidden />}
              {badge}
            </span>
          )}
          <div className="mayhem-result-damage mayhem-in" style={step(1)}>
            <strong>
              <Count value={entry.damage} format={number} delay={T.damage} ms={COUNT} run={run} />
            </strong>
            <span>damage to champions</span>
          </div>
          {chips.length > 0 && (
            <p className="mayhem-result-chips mayhem-in" style={step(2)}>
              {chips.slice(0, CHIPS).map((chip) => (
                <span
                  key={chip.id}
                  data-top={chip.place === 1 || undefined}
                  title={
                    chip.record
                      ? 'Beats the #1 on mayhemstats.lol'
                      : `#${chip.place} on mayhemstats.lol`
                  }
                >
                  {chipText(chip)}
                </span>
              ))}
              {more.length > 0 && (
                <span className="more" title={more.map(chipText).join('\n')}>
                  +{more.length}
                </span>
              )}
            </p>
          )}
          <dl className="mayhem-result-stats">
            {stats.map(([label, value, format], i) => (
              <div key={label} className="mayhem-in" style={step(2 + i)}>
                <dd>
                  <Count value={value} format={format} delay={T.stats + i * 80} run={run} />
                </dd>
                <dt>{label}</dt>
              </div>
            ))}
          </dl>
          {entry.augments.length > 0 && (
            <ul className="mayhem-result-augments mayhem-in" style={step(5)} aria-label="Augments">
              {entry.augments.map((id, i) => {
                const augment = augments[String(id)];
                return (
                  <li key={`${id}-${i}`} title={augment?.name ?? 'Augment'}>
                    <span className="mayhem-aug-icon" data-rarity={augment?.rarity ?? ''}>
                      {augment?.icon ? (
                        <img src={augment.icon} alt={augment.name} width={32} height={32} />
                      ) : (
                        <span aria-hidden>{(augment?.name ?? '?').slice(0, 2)}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mayhem-in" style={step(6)}>
            <RankLine rank={rank} run={run} onFindRank={onFindRank} onRetry={onRetry} />
          </div>
        </div>
        {entry.with.length > 0 && <Mates card={card} />}
        {rank.state === 'ready' && (
          <footer className="mayhem-result-foot">
            <button
              type="button"
              className="mayhem-button small"
              disabled={mock}
              title={mock ? 'Opens the game in the app' : undefined}
              onClick={() => void openGame(entry.gameId)}
            >
              View on mayhemstats.lol
            </button>
          </footer>
        )}
        <button
          ref={close}
          type="button"
          className="mayhem-result-close"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={18} aria-hidden />
        </button>
      </article>
    </Overlay>
  );
}
