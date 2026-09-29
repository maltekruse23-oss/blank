import {
  BarChart3,
  Coins,
  Crosshair,
  Crown,
  Flame,
  Gamepad2,
  HeartPulse,
  Medal,
  PieChart,
  Shield,
  ShieldCheck,
  Skull,
  Snowflake,
  Sparkles,
  Swords,
  Target,
  TowerControl,
  TrendingUp,
  Trophy,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import {
  championSquare,
  profileIcon,
  splitRiotId,
  type AramEntry,
  type AramPlayer,
} from '../../adapters/aram';
import { ChannelAvatar } from '../../components/ui';
import { spring } from '../../design/motion';
import { useMotion } from '../../design/useDesign';
import {
  categories,
  ranking,
  type Category,
  type CategoryId,
  type Placing,
} from './aramCategories';
import {
  AFTER_MS,
  between,
  loadSeen,
  RACE_MS,
  saveSeen,
  slot,
  STAGGER_MS,
  type Seen,
} from './aramRace';
import { day } from './format';

/** Classic colours of a place (user's wish): 1 gold, 2 silver, 3 bronze, then neutral. */
export const placeColor = (place: number) =>
  place >= 1 && place <= 3 ? `var(--rank-${place})` : 'var(--rank-rest)';

const icons: Record<CategoryId, LucideIcon> = {
  damage: Flame,
  pentas: Crown,
  ap: Sparkles,
  ad: Swords,
  kills: Skull,
  tank: Shield,
  avgDamage: BarChart3,
  wins: Trophy,
  kda: Target,
  heal: HeartPulse,
  true: Zap,
  mitigated: ShieldCheck,
  quadras: Medal,
  crit: Crosshair,
  cc: Snowflake,
  spree: TrendingUp,
  gold: Coins,
  share: PieChart,
  topDamage: Medal,
  turrets: TowerControl,
  games: Gamepad2,
};

/** A row as shown right now (while counting up: the value on its way). */
type Shown = Placing & { now: number | null; from: number | null; index: number };

/** Places by the values shown: best first, a tie shares the place, no value last. */
function standings(rows: Shown[]) {
  const sorted = [...rows].sort((a, b) => {
    if (a.now === null || b.now === null)
      return a.now === null ? (b.now === null ? a.index - b.index : 1) : -1;
    return b.now - a.now || a.index - b.index;
  });
  return sorted.map((row) => ({
    row,
    place:
      row.now === null ? sorted.indexOf(row) + 1 : sorted.findIndex((r) => r.now === row.now) + 1,
  }));
}

/** The leader by these values (none when nobody has more than 0 or several share it). */
function leaderOf(values: (number | null)[]) {
  const best = Math.max(0, ...values.map((v) => v ?? 0));
  const at = values.flatMap((v, i) => (v !== null && v === best && best > 0 ? [i] : []));
  return at.length === 1 ? at[0]! : null;
}

/**
 * One category (user's wish: bars instead of bare numbers, categories instead of player cards):
 * the number one large with crown and champion, the others as bars below. While a new game
 * counts up, the places overtake each other live and the gain shows; at the end the crown lands,
 * and a new number one is announced.
 */
function CategoryCard({
  category,
  rows,
  progress,
  racing,
  meId,
}: {
  category: Category;
  rows: Shown[];
  /** 0–1 of this category's count-up; 1 when it is not counting. */
  progress: number;
  /** Counted up in this race (gains and a new leader are shown). */
  racing: boolean;
  meId: string | null;
}) {
  const Icon = icons[category.id];
  const done = progress >= 1;
  const placed = standings(rows);
  const top = Math.max(0, ...rows.map((r) => Math.max(r.value ?? 0, r.now ?? 0)));
  const before = leaderOf(rows.map((r) => r.from));
  const after = leaderOf(rows.map((r) => r.value));
  const newLeader = racing && done && after !== null && after !== before;
  return (
    <section
      className={`card aram-category ${racing && !done ? 'counting' : ''}`}
      style={{ '--hue': `var(--game-${category.hue})` } as CSSProperties}
    >
      <header className="aram-category-head">
        <span className="aram-category-icon">
          <Icon size={15} />
        </span>
        <span className="aram-category-title">
          <h2>{category.title}</h2>
          <small>{category.note}</small>
        </span>
        {newLeader && (
          <span className="aram-new-leader">
            <Crown size={11} /> Neue Nr. 1
          </span>
        )}
      </header>
      <ol className="aram-bars">
        {placed.map(({ row, place }) => {
          const { name } = splitRiotId(row.player.name);
          const lead = done && place === 1 && row.now !== null && row.now > 0;
          const share = row.now !== null && top > 0 ? Math.min(1, row.now / top) : 0;
          const champion = row.game ? championSquare(row.game.champion) : null;
          const gain = racing && row.value !== null ? row.value - (row.from ?? 0) : 0;
          return (
            <motion.li
              key={row.player.puuid}
              layout="position"
              transition={spring('snappy')}
              className={[
                lead ? 'lead' : '',
                row.player.puuid === meId ? 'me' : '',
                // A best that went up lights up while it counts (no "+" for a best game).
                gain > 0 && !done ? 'rising' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={
                {
                  // Medals only for something achieved: nothing or 0 stays neutral.
                  '--place':
                    row.now !== null && row.now > 0 ? placeColor(place) : 'var(--rank-rest)',
                } as CSSProperties
              }
            >
              <div className="aram-bar-line">
                <span className="aram-bar-place">
                  {lead ? <Crown size={lead ? 13 : 12} aria-label="Platz 1" /> : place}
                </span>
                <ChannelAvatar login={name} imageUrl={profileIcon(row.player.icon)} />
                <span className="aram-bar-name">
                  {name}
                  {lead && row.game && <small>{row.game.championName}</small>}
                </span>
                {champion && row.game && (
                  <img
                    className="aram-bar-champion"
                    src={champion}
                    alt=""
                    title={`${row.game.championName} · ${day(row.game.at)}`}
                    width={lead ? 22 : 16}
                    height={lead ? 22 : 16}
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.hidden = true;
                    }}
                  />
                )}
                {gain > 0 && category.kind !== 'best' && (
                  <span className="aram-gain">+{category.format(gain)}</span>
                )}
                <b className="aram-bar-value">
                  {row.now === null ? '–' : category.format(row.now)}
                </b>
              </div>
              <div className="aram-bar-track" aria-hidden>
                <span
                  className="aram-bar-fill"
                  style={{ width: `${Math.round(share * 1000) / 10}%` }}
                />
              </div>
            </motion.li>
          );
        })}
      </ol>
    </section>
  );
}

/** Who holds the most number ones (crowns), across the shown categories – live while counting. */
function Crowns({
  players,
  crowns,
  meId,
}: {
  players: AramPlayer[];
  crowns: Map<string, number>;
  meId: string | null;
}) {
  const order = players
    .map((player, index) => ({ player, index, count: crowns.get(player.puuid) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.index - b.index);
  const most = order[0]?.count ?? 0;
  return (
    <ol className="aram-crowns" aria-label="Kronen: Platz 1 in den Kategorien">
      {order.map(({ player, count }) => {
        const { name } = splitRiotId(player.name);
        const top = count > 0 && count === most;
        return (
          <motion.li
            key={player.puuid}
            layout="position"
            transition={spring('snappy')}
            className={`${top ? 'top' : ''} ${player.puuid === meId ? 'me' : ''}`}
          >
            <ChannelAvatar login={name} imageUrl={profileIcon(player.icon)} />
            <span className="aram-crowns-name">{name}</span>
            <span className="aram-crowns-count" key={count}>
              <Crown size={12} /> {count}
            </span>
          </motion.li>
        );
      })}
    </ol>
  );
}

export function AramRanking({
  chosen,
  players,
  games,
  meId,
}: {
  chosen: CategoryId[];
  players: AramPlayer[];
  games: AramEntry[];
  meId: string | null;
}) {
  const { enabled: moving } = useMotion();
  const shown = useMemo(() => categories.filter((c) => chosen.includes(c.id)), [chosen]);
  const results = useMemo(
    () => shown.map((category) => ({ category, rows: ranking(category, players, games) })),
    [shown, players, games],
  );
  const target = useMemo(() => {
    const values: Seen = {};
    for (const { category, rows } of results)
      for (const row of rows) values[slot(category.id, row.player.puuid)] = row.value;
    return values;
  }, [results]);
  const targetKey = JSON.stringify(target);

  // A race when something changed since the last look: the changed categories one by one.
  const [race, setRace] = useState<{ from: Seen; order: CategoryId[] } | null>(null);
  // The race starts with its first frame on screen: a window in the background (no frames) keeps
  // it for when the user looks.
  const [start, setStart] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [counting, setCounting] = useState(false);
  useEffect(() => {
    const seen = loadSeen();
    const changed = shown
      .filter((c) =>
        players.some((p) => (seen?.[slot(c.id, p.puuid)] ?? null) !== target[slot(c.id, p.puuid)]),
      )
      .map((c) => c.id);
    if (!moving || changed.length === 0) {
      saveSeen({ ...seen, ...target });
      setRace(null);
      return;
    }
    setRace({ from: seen ?? {}, order: changed });
    setStart(null);
    setCounting(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a race only when the values change (by content, not identity)
  }, [targetKey, moving]);

  // Frames only while counting; afterwards the gains fade on their own (CSS), nothing runs.
  useEffect(() => {
    if (!race || !counting) return;
    let begin: number | null = null;
    let frame = 0;
    const tick = (time: number) => {
      if (begin === null) {
        begin = time + 350;
        setStart(begin);
      }
      setNow(time);
      if (time < begin + (race.order.length - 1) * STAGGER_MS + RACE_MS)
        frame = requestAnimationFrame(tick);
      else {
        saveSeen({ ...race.from, ...target });
        setCounting(false);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the race reads the values it started with
  }, [race, counting]);
  useEffect(() => {
    if (!race || counting) return;
    const timer = window.setTimeout(() => setRace(null), AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [race, counting]);

  const progressOf = (id: CategoryId) => {
    const index = race?.order.indexOf(id) ?? -1;
    if (!race || index < 0 || !counting) return 1;
    if (start === null) return 0;
    return Math.min(1, Math.max(0, (now - start - index * STAGGER_MS) / RACE_MS));
  };
  const cards = results.map(({ category, rows }) => {
    const progress = progressOf(category.id);
    const shownRows: Shown[] = rows.map((row, index) => {
      const from = race ? (race.from[slot(category.id, row.player.puuid)] ?? null) : row.value;
      return { ...row, index, from, now: between(from, row.value, progress) };
    });
    return { category, rows: shownRows, progress, racing: !!race?.order.includes(category.id) };
  });
  // Crowns only for categories whose count-up is over.
  const crowns = new Map<string, number>();
  for (const card of cards) {
    if (card.progress < 1) continue;
    const leader = leaderOf(card.rows.map((r) => r.now));
    if (leader !== null) {
      const puuid = card.rows[leader]!.player.puuid;
      crowns.set(puuid, (crowns.get(puuid) ?? 0) + 1);
    }
  }

  return (
    <>
      {players.length > 1 && <Crowns players={players} crowns={crowns} meId={meId} />}
      <div className="aram-categories">
        {cards.map((card) => (
          <CategoryCard key={card.category.id} meId={meId} {...card} />
        ))}
      </div>
    </>
  );
}

/** Which categories the leaderboard shows (user's wish: the main ones, more to choose). */
export function CategoryChoice({
  chosen,
  onChange,
}: {
  chosen: CategoryId[];
  onChange: (chosen: CategoryId[]) => void;
}) {
  return (
    <div className="aram-choice" role="group" aria-label="Kategorien der Rangliste">
      {categories.map((category) => {
        const on = chosen.includes(category.id);
        const Icon = icons[category.id];
        return (
          <button
            key={category.id}
            className={`filter-button ${on ? 'selected' : ''}`}
            aria-pressed={on}
            title={category.note}
            // The last one stays: an empty leaderboard shows nothing.
            disabled={on && chosen.length === 1}
            onClick={() =>
              onChange(
                on
                  ? chosen.filter((id) => id !== category.id)
                  : categories
                      .filter((c) => c.id === category.id || chosen.includes(c.id))
                      .map((c) => c.id),
              )
            }
          >
            <Icon size={13} />
            <span>{category.title}</span>
          </button>
        );
      })}
    </div>
  );
}
