// Categories of the ARAM leaderboard (user's wish: one ranking per category with bars, no player
// cards; the main ones set, more to choose). Each one ranks the players by one value of their
// games: the best single game, a total, or an average. Missing values never count as 0.
import type { AramDetails, AramEntry, AramPlayer } from '../../adapters/aram';
import { countedGames, kda } from './aramStats';
import { decimal, number, percent } from './format';

export type CategoryId =
  | 'damage'
  | 'pentas'
  | 'ap'
  | 'ad'
  | 'kills'
  | 'tank'
  | 'avgDamage'
  | 'wins'
  | 'kda'
  | 'heal'
  | 'true'
  | 'mitigated'
  | 'quadras'
  | 'crit'
  | 'cc'
  | 'spree'
  | 'gold'
  | 'share'
  | 'topDamage'
  | 'turrets'
  | 'games';

type Value = number | null | undefined;
/** Colour of a category (tokens --game-*): damage like fire, magic, physical, gold, protection. */
export type CategoryHue = 'fire' | 'magic' | 'physical' | 'gold' | 'guard';

export type Category = {
  id: CategoryId;
  hue: CategoryHue;
  title: string;
  /** How it counts, in a few words. */
  note: string;
  /** best: highest single game (with that game); total: summed up; average: per game. */
  kind: 'best' | 'total' | 'average' | 'rate';
  value: (game: AramEntry) => Value;
  format: (value: number) => string;
};

const detail = (pick: (d: AramDetails) => number) => (g: AramEntry) =>
  g.details ? pick(g.details) : null;
const count = (value: number) => String(Math.round(value));

export const categories: Category[] = [
  {
    id: 'damage',
    hue: 'fire',
    title: 'Höchster Schaden',
    note: 'an Champions · bestes Spiel',
    kind: 'best',
    value: (g) => g.damage,
    format: number,
  },
  {
    id: 'pentas',
    hue: 'gold',
    title: 'Pentakills',
    note: 'insgesamt',
    kind: 'total',
    value: (g) => g.pentas,
    format: count,
  },
  {
    id: 'ap',
    hue: 'magic',
    title: 'AP-Schaden',
    note: 'Magieschaden · bestes Spiel',
    kind: 'best',
    value: detail((d) => d.magic),
    format: number,
  },
  {
    id: 'ad',
    hue: 'physical',
    title: 'AD-Schaden',
    note: 'Physisch · bestes Spiel',
    kind: 'best',
    value: detail((d) => d.physical),
    format: number,
  },
  {
    id: 'kills',
    hue: 'physical',
    title: 'Meiste Kills',
    note: 'bestes Spiel',
    kind: 'best',
    value: (g) => g.kills,
    format: count,
  },
  {
    id: 'tank',
    hue: 'guard',
    title: 'Größter Tank',
    note: 'Eingesteckt · bestes Spiel',
    kind: 'best',
    value: (g) => g.taken,
    format: number,
  },
  {
    id: 'avgDamage',
    hue: 'fire',
    title: 'Ø Schaden',
    note: 'an Champions · pro Spiel',
    kind: 'average',
    value: (g) => g.damage,
    format: number,
  },
  {
    id: 'wins',
    hue: 'gold',
    title: 'Siege',
    note: 'gewonnene Spiele',
    kind: 'rate',
    value: (g) => (g.win ? 1 : 0),
    format: percent,
  },
  {
    id: 'kda',
    hue: 'magic',
    title: 'KDA',
    note: '(K + A) / Tode, alle Spiele',
    kind: 'rate',
    value: (g) => kda(g),
    format: decimal,
  },
  {
    id: 'heal',
    hue: 'guard',
    title: 'Meiste Heilung',
    note: 'bestes Spiel',
    kind: 'best',
    value: (g) => g.healed,
    format: number,
  },
  {
    id: 'true',
    hue: 'fire',
    title: 'True-Schaden',
    note: 'bestes Spiel',
    kind: 'best',
    value: detail((d) => d.trueDamage),
    format: number,
  },
  {
    id: 'mitigated',
    hue: 'guard',
    title: 'Abgewehrt',
    note: 'durch Rüstung · bestes Spiel',
    kind: 'best',
    value: detail((d) => d.mitigated),
    format: number,
  },
  {
    id: 'quadras',
    hue: 'gold',
    title: 'Quadrakills',
    note: 'insgesamt',
    kind: 'total',
    value: detail((d) => d.quadras),
    format: count,
  },
  {
    id: 'crit',
    hue: 'physical',
    title: 'Größter Krit',
    note: 'ein Treffer',
    kind: 'best',
    value: detail((d) => d.largestCrit),
    format: number,
  },
  {
    id: 'cc',
    hue: 'magic',
    title: 'Meiste Kontrolle',
    note: 'Sekunden CC · bestes Spiel',
    kind: 'best',
    value: detail((d) => d.ccSeconds),
    format: (v) => `${Math.round(v)} s`,
  },
  {
    id: 'spree',
    hue: 'physical',
    title: 'Längste Serie',
    note: 'Kills ohne Tod',
    kind: 'best',
    value: detail((d) => d.largestSpree),
    format: count,
  },
  {
    id: 'gold',
    hue: 'gold',
    title: 'Meistes Gold',
    note: 'bestes Spiel',
    kind: 'best',
    value: (g) => g.gold,
    format: number,
  },
  {
    id: 'share',
    hue: 'fire',
    title: 'Team-Anteil',
    note: 'Ø am Schaden des Teams',
    kind: 'average',
    value: (g) => g.teamShare,
    format: percent,
  },
  {
    id: 'topDamage',
    hue: 'gold',
    title: 'Top-Schaden',
    note: 'Spiele mit meistem Schaden',
    kind: 'total',
    value: (g) => (g.damageRank === 1 ? 1 : 0),
    format: count,
  },
  {
    id: 'turrets',
    hue: 'fire',
    title: 'Turm-Schaden',
    note: 'bestes Spiel',
    kind: 'best',
    value: detail((d) => d.turretDamage),
    format: number,
  },
  {
    id: 'games',
    hue: 'guard',
    title: 'Spiele',
    note: 'gespielt',
    kind: 'total',
    value: () => 1,
    format: count,
  },
];

/** The main categories (user's choice), shown until others are chosen. */
export const defaultCategories: CategoryId[] = ['damage', 'pentas', 'ap', 'ad', 'kills', 'tank'];

const known = new Set<string>(categories.map((c) => c.id));

/** Chosen categories from stored or imported settings: known ids, each once, at least one. */
export function readAramCategories(raw: unknown): CategoryId[] {
  if (!Array.isArray(raw)) return defaultCategories;
  const chosen = [
    ...new Set(raw.filter((id): id is CategoryId => typeof id === 'string' && known.has(id))),
  ];
  return chosen.length > 0 ? chosen : defaultCategories;
}

export type Placing = {
  player: AramPlayer;
  /** null: no games with this value (never shown as 0). */
  value: number | null;
  /** For "best" categories: the game of the value. */
  game: AramEntry | null;
};

/** One category: the players, best first; players without a value last. */
export function ranking(category: Category, players: AramPlayer[], games: AramEntry[]) {
  const counted = countedGames(games, players);
  const placings = players.map((player): Placing => {
    const own = counted
      .filter((g) => g.puuid === player.puuid)
      .map((game) => ({ game, value: category.value(game) }))
      .filter((v): v is { game: AramEntry; value: number } => typeof v.value === 'number');
    if (own.length === 0) return { player, value: null, game: null };
    if (category.kind === 'best') {
      // The earlier game keeps a tie.
      const top = own.reduce((a, b) =>
        b.value > a.value || (b.value === a.value && b.game.at < a.game.at) ? b : a,
      );
      return { player, value: top.value, game: top.game };
    }
    if (category.id === 'kda') {
      const sum = (pick: (g: AramEntry) => number) => own.reduce((t, v) => t + pick(v.game), 0);
      return {
        player,
        value:
          (sum((g) => g.kills) + sum((g) => g.assists)) /
          Math.max(
            1,
            sum((g) => g.deaths),
          ),
        game: null,
      };
    }
    const total = own.reduce((t, v) => t + v.value, 0);
    return { player, value: category.kind === 'total' ? total : total / own.length, game: null };
  });
  return placings.sort(
    (a, b) => (b.value ?? -1) - (a.value ?? -1) || a.player.name.localeCompare(b.player.name),
  );
}
