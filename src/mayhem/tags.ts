// Fun tags on the player card (user's wish 09.10.2026: "lustige Sachen, angepasst an Mayhem, wirklich
// viele, damit jeder sich unique fühlt"). Every tag comes from the player's real games on
// mayhemstats.lol, never invented; the tooltip says why. A rule scores how strongly it fits, the card
// shows the strongest few and only the best of each group (no "Unkillable" next to "Respawn Expert").
// The website checks only K/D/A, win and time strictly: other values are read carefully, and a
// missing one gives no tag.
import type { Grade } from '../features/aram/aramPerformance';
import type { Step } from '../features/aram/aramRating';
import { percent } from './format';

export type TagTone = 'gold' | 'green' | 'red' | 'blue' | 'purple' | 'pink';
export type Tag = { label: string; tone: TagTone; why: string };

/** Tags the card shows at most. */
export const SHOWN = 5;
/** Below this many games only "Fresh Meat": too few to say anything. */
const MIN_GAMES = 5;

type Stats = {
  n: number;
  wr: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  /** null when the website gave the value for fewer than half the games. */
  share: number | null;
  topDamage: number | null;
  healPerMin: number | null;
  takenPerMin: number | null;
  minutes: number | null;
  bestDamage: number | null;
  pentas: number;
  quadraGames: number;
  zeroDeaths: number;
  feeds: number;
  afk: number;
  pct: number;
  spread: number;
  recentPct: number;
  top: number;
  fails: number;
  roles: Record<string, number>;
  main: { name: string; share: number };
  champs: number;
  night: number;
  morning: number;
  weekend: number;
  busiestDay: number;
  /** Positive: wins in a row up to the newest game; negative: losses. */
  streak: number;
};

const value = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const avg = (xs: number[]) => xs.reduce((t, x) => t + x, 0) / Math.max(1, xs.length);

/** The average of a value the website may leave out; null when most games lack it. */
function known(history: Step[], of: (s: Step) => number | null) {
  const xs = history.map(of).filter((x): x is number => x !== null);
  return xs.length * 2 >= history.length ? avg(xs) : null;
}

const HIGH: Grade[] = ['SSS', 'MAYHEM'];

export function statsOf(history: Step[]): Stats {
  const n = history.length;
  const e = history.map((s) => s.entry);
  const minutesOf = (s: Step) => {
    const sec = value(s.entry.seconds);
    return sec && sec >= 60 ? sec / 60 : null;
  };
  const perMin = (s: Step, v: number | null) => {
    const m = minutesOf(s);
    return v !== null && m ? v / m : null;
  };
  const kills = avg(e.map((x) => x.kills));
  const deaths = avg(e.map((x) => x.deaths));
  const assists = avg(e.map((x) => x.assists));
  const pcts = history.map((s) => s.mark.pct);
  const pct = avg(pcts);
  const byChamp = new Map<string, number>();
  for (const x of e) byChamp.set(x.championName, (byChamp.get(x.championName) ?? 0) + 1);
  const [mainName, mainGames] = [...byChamp].reduce((b, c) => (c[1] > b[1] ? c : b), ['', 0]);
  const roles: Record<string, number> = {};
  for (const s of history) roles[s.mark.role] = (roles[s.mark.role] ?? 0) + 1 / n;
  const hours = e.map((x) => new Date(x.at).getHours());
  const days = new Map<string, number>();
  for (const x of e) {
    const day = new Date(x.at).toDateString();
    days.set(day, (days.get(day) ?? 0) + 1);
  }
  let streak = 0;
  for (let i = n - 1; i >= 0; i--) {
    const win = e[i]!.win;
    if (streak === 0) streak = win ? 1 : -1;
    else if (win === streak > 0) streak += win ? 1 : -1;
    else break;
  }
  const damages = e.map((x) => value(x.damage)).filter((x): x is number => x !== null);
  return {
    n,
    wr: e.filter((x) => x.win).length / n,
    kills,
    deaths,
    assists,
    kda: (kills + assists) / Math.max(1, deaths),
    share: known(history, (s) => {
      const v = value(s.entry.teamShare);
      return v !== null && v <= 1 ? v : null;
    }),
    topDamage: known(history, (s) => {
      const r = value(s.entry.damageRank);
      return r === null || r < 1 ? null : r === 1 ? 1 : 0;
    }),
    healPerMin: known(history, (s) =>
      perMin(s, (value(s.entry.healed) ?? 0) + (value(s.entry.shielded) ?? 0) || null),
    ),
    takenPerMin: known(history, (s) => perMin(s, value(s.entry.taken))),
    minutes: known(history, minutesOf),
    bestDamage: damages.length ? Math.max(...damages) : null,
    pentas: e.reduce((t, x) => t + (value(x.pentas) ?? 0), 0),
    quadraGames: e.filter((x) => value(x.multikill) === 4).length,
    zeroDeaths: e.filter((x) => x.deaths === 0).length,
    feeds: e.filter((x) => x.deaths >= 12).length,
    afk: history.filter((s) => s.mark.afk).length,
    pct,
    spread: Math.sqrt(avg(pcts.map((p) => (p - pct) ** 2))),
    recentPct: avg(pcts.slice(-10)),
    top: history.filter((s) => HIGH.includes(s.mark.grade)).length,
    fails: history.filter((s) => s.mark.grade === 'F').length,
    roles,
    main: { name: mainName, share: mainGames / n },
    champs: byChamp.size,
    night: hours.filter((h) => h < 5).length / n,
    morning: hours.filter((h) => h >= 5 && h < 9).length / n,
    weekend: e.filter((x) => [0, 6].includes(new Date(x.at).getDay())).length / n,
    busiestDay: Math.max(...days.values()),
    streak,
  };
}

/** How far a value is past `at` towards `full`: null below `at`, 1 at it, 2 at `full` and beyond. */
const past = (v: number | null, at: number, full: number) =>
  v === null || (full > at ? v < at : v > at)
    ? null
    : 1 + Math.min(1, Math.max(0, (v - at) / (full - at)));

type Rule = {
  /** Only the strongest tag of a group shows. */
  group: string;
  tone: TagTone;
  /** How rare the tag is: rarer ones win over common ones. */
  weight: number;
  label: string | ((s: Stats) => string);
  fit: (s: Stats) => number | null;
  why: (s: Stats) => string;
};

const pct = (x: number) => percent(x);
const one = (x: number) => x.toFixed(1);
const k = (x: number) => `${Math.round(x / 1000)}k`;
const roleRule = (role: string, label: string, at: number, tone: TagTone, noun: string): Rule => ({
  group: 'role',
  tone,
  weight: 1,
  label,
  fit: (s) => past(s.roles[role] ?? 0, at, at + 0.3),
  why: (s) => `${pct(s.roles[role] ?? 0)} of games on ${noun}`,
});

/** Every tag there is; add new ones here (with a test in tags.test.ts). */
export const RULES: Rule[] = [
  // Multikills
  {
    group: 'penta',
    tone: 'pink',
    weight: 5,
    label: 'Penta Addict',
    fit: (s) => past(s.pentas, 3, 10),
    why: (s) => `${s.pentas} pentakills`,
  },
  {
    group: 'penta',
    tone: 'gold',
    weight: 4,
    label: 'Penta Enjoyer',
    fit: (s) => (s.pentas < 3 ? past(s.pentas, 1, 2) : null),
    why: (s) => `${s.pentas} pentakill${s.pentas > 1 ? 's' : ''}`,
  },
  {
    group: 'penta',
    tone: 'purple',
    weight: 2.5,
    label: 'So Close (Quadra)',
    fit: (s) => (s.pentas ? null : past(s.quadraGames, 2, 6)),
    why: (s) => `${s.quadraGames} quadrakills, still no penta`,
  },
  // Damage
  {
    group: 'damage',
    tone: 'red',
    weight: 3,
    label: 'Damage Goblin',
    fit: (s) => past(s.topDamage, 0.35, 0.6),
    why: (s) => `Most damage of all ten in ${pct(s.topDamage!)} of games`,
  },
  {
    group: 'damage',
    tone: 'red',
    weight: 2,
    label: 'Carries the Team',
    fit: (s) => past(s.share, 0.28, 0.36),
    why: (s) => `${pct(s.share!)} of the team's damage on average`,
  },
  {
    group: 'damage',
    tone: 'blue',
    weight: 1.5,
    label: 'Emotional Support',
    fit: (s) => past(s.share, 0.14, 0.08),
    why: (s) => `${pct(s.share!)} of the team's damage on average`,
  },
  {
    group: 'bigGame',
    tone: 'gold',
    weight: 3,
    label: 'Six Figures',
    fit: (s) => past(s.bestDamage, 100_000, 150_000),
    why: (s) => `${k(s.bestDamage!)} damage in one game`,
  },
  // Deaths
  {
    group: 'deaths',
    tone: 'green',
    weight: 2.5,
    label: 'Unkillable',
    fit: (s) => past(s.deaths, 4, 2),
    why: (s) => `${one(s.deaths)} deaths per game`,
  },
  {
    group: 'deaths',
    tone: 'red',
    weight: 1.5,
    label: 'Respawn Timer Expert',
    fit: (s) => past(s.deaths, 9, 12),
    why: (s) => `${one(s.deaths)} deaths per game`,
  },
  {
    group: 'deaths2',
    tone: 'red',
    weight: 2,
    label: 'Grey Screen Tourist',
    fit: (s) => past(s.feeds / s.n, 0.2, 0.4),
    why: (s) => `12+ deaths in ${pct(s.feeds / s.n)} of games`,
  },
  {
    group: 'deaths2',
    tone: 'green',
    weight: 3,
    label: 'Untouchable',
    fit: (s) => past(s.zeroDeaths / s.n, 0.08, 0.2),
    why: (s) => `${s.zeroDeaths} games without dying`,
  },
  {
    group: 'deaths3',
    tone: 'red',
    weight: 2,
    label: 'Glass Cannon',
    fit: (s) => (s.deaths >= 8 && (s.share ?? 0) >= 0.26 ? past(s.share, 0.26, 0.34) : null),
    why: (s) => `${pct(s.share!)} of the damage, ${one(s.deaths)} deaths a game`,
  },
  // Kills and assists
  {
    group: 'fight',
    tone: 'gold',
    weight: 1.5,
    label: 'Ready to Rumble',
    fit: (s) => past(s.kills + s.assists, 32, 45),
    why: (s) => `${one(s.kills + s.assists)} kills + assists per game`,
  },
  {
    group: 'ka',
    tone: 'blue',
    weight: 1.5,
    label: 'Assist Merchant',
    fit: (s) => past(s.assists / Math.max(1, s.kills), 2.6, 4),
    why: (s) => `${one(s.assists / Math.max(1, s.kills))} assists for every kill`,
  },
  {
    group: 'ka',
    tone: 'red',
    weight: 1.5,
    label: 'Kill Stealer',
    fit: (s) => past(s.kills / Math.max(1, s.assists), 0.9, 1.4),
    why: (s) => `${one(s.kills)} kills, ${one(s.assists)} assists per game`,
  },
  {
    group: 'kda',
    tone: 'green',
    weight: 2,
    label: 'KDA Player',
    fit: (s) => past(s.kda, 5, 8),
    why: (s) => `KDA ${one(s.kda)}`,
  },
  {
    group: 'kda',
    tone: 'pink',
    weight: 1,
    label: 'Fearless',
    fit: (s) => past(s.kda, 1.8, 1.2),
    why: (s) => `KDA ${one(s.kda)}`,
  },
  // Healing and tanking
  {
    group: 'heal',
    tone: 'green',
    weight: 2,
    label: 'Band-Aid Dispenser',
    fit: (s) => past(s.healPerMin, 900, 1600),
    why: (s) => `${Math.round(s.healPerMin!)} healing and shields per minute`,
  },
  {
    group: 'taken',
    tone: 'blue',
    weight: 1.5,
    label: 'Human Shield',
    fit: (s) => past(s.takenPerMin, 2600, 3600),
    why: (s) => `${Math.round(s.takenPerMin!)} damage taken per minute`,
  },
  // Roles
  roleRule('Tank', 'Tank Mode: On', 0.35, 'blue', 'tanks'),
  roleRule('Mage', 'Spell Slinger', 0.45, 'purple', 'mages'),
  roleRule('Marksman', 'Pew Pew', 0.3, 'gold', 'marksmen'),
  roleRule('Assassin', 'Shadow Stepper', 0.25, 'purple', 'assassins'),
  roleRule('Fighter', 'Bruiser Brain', 0.45, 'red', 'fighters'),
  roleRule('Support', 'Enchanter Energy', 0.3, 'green', 'supports'),
  // Champions
  {
    group: 'champ',
    tone: 'gold',
    weight: 3,
    label: (s) => `${s.main.name} Enjoyer`,
    fit: (s) => (s.n >= 10 ? past(s.main.share, 0.25, 0.5) : null),
    why: (s) => `${s.main.name} in ${pct(s.main.share)} of games`,
  },
  {
    group: 'champ',
    tone: 'blue',
    weight: 1.5,
    label: 'Seen It All',
    fit: (s) => past(s.champs, 40, 100),
    why: (s) => `${s.champs} different champions`,
  },
  // Winning
  {
    group: 'wr',
    tone: 'gold',
    weight: 2,
    label: "Winner's Aura",
    fit: (s) => (s.n >= 10 ? past(s.wr, 0.6, 0.72) : null),
    why: (s) => `${pct(s.wr)} wins`,
  },
  {
    group: 'wr',
    tone: 'pink',
    weight: 1.5,
    label: 'Character Development',
    fit: (s) => (s.n >= 10 ? past(s.wr, 0.4, 0.3) : null),
    why: (s) => `${pct(s.wr)} wins`,
  },
  {
    group: 'wr',
    tone: 'purple',
    weight: 2,
    label: 'Perfectly Balanced',
    fit: (s) => (s.n >= 20 && Math.abs(s.wr - 0.5) < 0.015 ? 1.5 : null),
    why: (s) => `${pct(s.wr)} wins, as all things should be`,
  },
  {
    group: 'streak',
    tone: 'gold',
    weight: 2.5,
    label: 'On Fire',
    fit: (s) => past(s.streak, 4, 8),
    why: (s) => `${s.streak} wins in a row`,
  },
  {
    group: 'streak',
    tone: 'red',
    weight: 2,
    label: 'Tilted (Allegedly)',
    fit: (s) => past(-s.streak, 4, 8),
    why: (s) => `${-s.streak} losses in a row`,
  },
  // Grades
  {
    group: 'grade',
    tone: 'pink',
    weight: 4,
    label: 'Certified Mayhem',
    fit: (s) => past(s.top / s.n, 0.1, 0.25),
    why: (s) => `SSS or MAYHEM in ${pct(s.top / s.n)} of games`,
  },
  {
    group: 'grade',
    tone: 'purple',
    weight: 2.5,
    label: 'Built Different',
    fit: (s) => past(s.pct, 0.7, 0.85),
    why: (s) => `Better than ${pct(s.pct)} of all games on average`,
  },
  {
    group: 'grade',
    tone: 'red',
    weight: 1.5,
    label: 'F in the Chat',
    fit: (s) => past(s.fails / s.n, 0.15, 0.3),
    why: (s) => `Grade F in ${pct(s.fails / s.n)} of games`,
  },
  {
    group: 'luck',
    tone: 'blue',
    weight: 2.5,
    label: 'Team Diff',
    fit: (s) => (s.n >= 10 && s.wr <= 0.45 ? past(s.pct, 0.6, 0.75) : null),
    why: (s) => `Plays well (better than ${pct(s.pct)}), wins ${pct(s.wr)}`,
  },
  {
    group: 'luck',
    tone: 'green',
    weight: 2.5,
    label: 'Carried (Respectfully)',
    fit: (s) => (s.n >= 10 && s.wr >= 0.55 ? past(s.pct, 0.4, 0.25) : null),
    why: (s) => `${pct(s.wr)} wins with average grades`,
  },
  {
    group: 'form',
    tone: 'green',
    weight: 2,
    label: 'Heating Up',
    fit: (s) => (s.n >= 20 ? past(s.recentPct - s.pct, 0.12, 0.25) : null),
    why: () => 'The last 10 games are well above the usual',
  },
  {
    group: 'form',
    tone: 'blue',
    weight: 1.5,
    label: 'Cooling Down',
    fit: (s) => (s.n >= 20 ? past(s.pct - s.recentPct, 0.12, 0.25) : null),
    why: () => 'The last 10 games are below the usual',
  },
  {
    group: 'spread',
    tone: 'blue',
    weight: 1,
    label: 'Metronome',
    fit: (s) => (s.n >= 15 ? past(s.spread, 0.2, 0.12) : null),
    why: () => 'Almost the same grade every game',
  },
  {
    group: 'spread',
    tone: 'pink',
    weight: 1,
    label: 'Coin Flip',
    fit: (s) => (s.n >= 15 ? past(s.spread, 0.32, 0.4) : null),
    why: () => 'Either MAYHEM or F, nothing between',
  },
  {
    group: 'afk',
    tone: 'red',
    weight: 2,
    label: 'Went to Get Snacks',
    fit: (s) => past(s.afk, 2, 6),
    why: (s) => `Away in ${s.afk} games`,
  },
  // Habits
  {
    group: 'time',
    tone: 'purple',
    weight: 2,
    label: 'Night Owl',
    fit: (s) => past(s.night, 0.25, 0.5),
    why: (s) => `${pct(s.night)} of games between midnight and 5`,
  },
  {
    group: 'time',
    tone: 'gold',
    weight: 2,
    label: 'Breakfast Brawler',
    fit: (s) => past(s.morning, 0.2, 0.4),
    why: (s) => `${pct(s.morning)} of games before 9 in the morning`,
  },
  {
    group: 'time',
    tone: 'blue',
    weight: 1,
    label: 'Weekend Warrior',
    fit: (s) => past(s.weekend, 0.55, 0.8),
    why: (s) => `${pct(s.weekend)} of games on weekends`,
  },
  {
    group: 'grind',
    tone: 'pink',
    weight: 2,
    label: 'Touch Grass Pending',
    fit: (s) => past(s.busiestDay, 12, 25),
    why: (s) => `${s.busiestDay} games in one day`,
  },
  {
    group: 'games',
    tone: 'gold',
    weight: 2,
    label: 'Howling Abyss Resident',
    fit: (s) => past(s.n, 200, 600),
    why: (s) => `${s.n} rated games`,
  },
  {
    group: 'length',
    tone: 'green',
    weight: 1,
    label: 'Speedrunner',
    fit: (s) => past(s.minutes, 15, 12),
    why: (s) => `Games last ${one(s.minutes!)} min on average`,
  },
  {
    group: 'length',
    tone: 'blue',
    weight: 1,
    label: 'Marathon Enjoyer',
    fit: (s) => past(s.minutes, 21, 26),
    why: (s) => `Games last ${one(s.minutes!)} min on average`,
  },
];

const labelOf = (r: Rule, s: Stats) => (typeof r.label === 'string' ? r.label : r.label(s));

/** The card's tags, strongest first; one per group, at most SHOWN. */
export function tagsOf(history: Step[]): Tag[] {
  if (!history.length) return [];
  if (history.length < MIN_GAMES)
    return [
      { label: 'Fresh Meat', tone: 'green', why: `Only ${history.length} rated games so far` },
    ];
  const s = statsOf(history);
  const best = new Map<string, { score: number; tag: Tag }>();
  for (const r of RULES) {
    const fit = r.fit(s);
    if (fit === null || !Number.isFinite(fit)) continue;
    const score = fit * r.weight;
    if ((best.get(r.group)?.score ?? 0) >= score) continue;
    best.set(r.group, { score, tag: { label: labelOf(r, s), tone: r.tone, why: r.why(s) } });
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, SHOWN)
    .map((b) => b.tag);
}
