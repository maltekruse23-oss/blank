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
import type { CSSProperties } from 'react';
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
import { categories, ranking, type Category, type CategoryId } from './aramCategories';
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

/**
 * One category of the leaderboard: the players as bars, best first (user's wish: bars instead of
 * bare numbers, categories instead of player cards). The bars grow in one after another; the
 * leader gets a glow and a crown. A missing value is "–" with an empty bar, never 0. Colours
 * (user's wish): the places in gold, silver and bronze, the card in a tint of its kind.
 */
function CategoryCard({
  category,
  players,
  games,
  meId,
  order,
}: {
  category: Category;
  players: AramPlayer[];
  games: AramEntry[];
  meId: string | null;
  /** Place of the card on the page, for the stagger. */
  order: number;
}) {
  const Icon = icons[category.id];
  const rows = ranking(category, players, games);
  const top = Math.max(0, ...rows.map((r) => r.value ?? 0));
  return (
    <section
      className="card aram-category"
      style={{ '--hue': `var(--game-${category.hue})` } as CSSProperties}
    >
      <header className="aram-category-head">
        <span className="aram-category-icon">
          <Icon size={15} />
        </span>
        <span>
          <h2>{category.title}</h2>
          <small>{category.note}</small>
        </span>
      </header>
      <ol className="aram-bars">
        {rows.map((row, i) => {
          const { name } = splitRiotId(row.player.name);
          // A tie shares the place.
          const place =
            row.value === null ? i + 1 : rows.findIndex((r) => r.value === row.value) + 1;
          const lead = place === 1 && row.value !== null && row.value > 0;
          const share = row.value !== null && top > 0 ? row.value / top : 0;
          const champion = row.game ? championSquare(row.game.champion) : null;
          return (
            <li
              key={row.player.puuid}
              className={[lead ? 'lead' : '', row.player.puuid === meId ? 'me' : '']
                .filter(Boolean)
                .join(' ')}
              style={
                {
                  // Medals only for something achieved: nothing or 0 stays neutral.
                  '--place':
                    row.value !== null && row.value > 0 ? placeColor(place) : 'var(--rank-rest)',
                } as CSSProperties
              }
            >
              <div className="aram-bar-line">
                <span className="aram-bar-place">
                  {lead ? <Crown size={12} aria-label="Platz 1" /> : place}
                </span>
                <ChannelAvatar login={name} imageUrl={profileIcon(row.player.icon)} />
                <span className="aram-bar-name">{name}</span>
                {champion && row.game && (
                  <img
                    className="aram-bar-champion"
                    src={champion}
                    alt=""
                    title={`${row.game.championName} · ${day(row.game.at)}`}
                    width={16}
                    height={16}
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.hidden = true;
                    }}
                  />
                )}
                <b className="aram-bar-value">
                  {row.value === null ? '–' : category.format(row.value)}
                </b>
              </div>
              <div className="aram-bar-track" aria-hidden>
                <motion.span
                  className="aram-bar-fill"
                  style={{ width: `${Math.round(share * 1000) / 10}%` }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ ...spring('default'), delay: order * 0.05 + i * 0.07 }}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
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
  const shown = categories.filter((c) => chosen.includes(c.id));
  return (
    <>
      <div className="aram-categories">
        {shown.map((category, i) => (
          <CategoryCard
            key={category.id}
            category={category}
            players={players}
            games={games}
            meId={meId}
            order={i}
          />
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
