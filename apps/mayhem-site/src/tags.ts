// Player tags: one word that describes how someone plays ("Schutzengel", "Skin-Sammler", …), each
// with how rare it is among all players. Most tags mark the top (or bottom) share of all players
// in one value, so the cut-offs follow the data: /api/tags computes them from everyone and the
// player page applies them to the player's own games. No names or ids leave the server.
// Pure, tested in the app's repo (src/features/aram/siteTags.test.ts).
import type { AramEntry } from './adapters/aram';
import { radarOf } from './insights';

/** Tags need this many counted games, so one lucky evening does not make a label. */
export const MIN_GAMES = 10;
/** Cut-offs need this many players, otherwise "top 10 %" means nothing. */
export const MIN_PLAYERS = 20;

/** One counted game of a player: the entry and its grade percentile (0–1). */
export type TagStep = { entry: AramEntry; pct: number };

export type StatKey =
  | 'dmg'
  | 'tank'
  | 'care'
  | 'part'
  | 'survive'
  | 'kills'
  | 'deaths'
  | 'assists'
  | 'teamShare'
  | 'goldShare'
  | 'ccPerMinute'
  | 'turrets'
  | 'crit'
  | 'trueShare'
  | 'minutes'
  | 'games'
  | 'variety'
  | 'steadiness'
  | 'swing'
  | 'average'
  | 'prismatic';

/** The values the tags look at; null where the games do not tell (older games without details). */
export type TagStats = Record<StatKey, number | null> & {
  /** Share of the games on the most played champion. */
  topChampion: number;
  wins: number;
  pentas: number;
  quadras: number;
  /** Share of games with a skin, null when fewer than five games know their skin. */
  skins: number | null;
  /** Share of AP / AD in the damage to champions, null without details. */
  ap: number | null;
  ad: number | null;
  /** Share of games with the player's most taken augment. */
  habit: number;
};

type Percentile = { stat: StatKey; side: 'top' | 'bottom'; share: number };
export type TagDef = {
  id: string;
  name: string;
  hint: string;
  /** English name and hint (name/hint stay German for the API and the tests). */
  nameEn: string;
  hintEn: string;
} & ({ rule: (s: TagStats) => boolean; cut?: undefined } | { cut: Percentile; rule?: undefined });

const top = (stat: StatKey, share = 0.1): Percentile => ({ stat, side: 'top', share });
const bottom = (stat: StatKey, share = 0.1): Percentile => ({ stat, side: 'bottom', share });
const atLeast = (value: number | null, limit: number) => value !== null && value >= limit;

export const TAGS: readonly TagDef[] = [
  // How the games went, compared with what the champion usually reaches (the grade's axes).
  {
    id: 'carry', name: 'Schadensmaschine', hint: 'Macht mehr Schaden, als sein Champion üblich schafft',
    nameEn: 'Damage machine', hintEn: 'Deals more damage than their champion usually does', cut: top('dmg'),
  },
  {
    id: 'wall', name: 'Bollwerk', hint: 'Steckt mehr ein, als sein Champion üblich schafft',
    nameEn: 'Bulwark', hintEn: 'Takes more damage than their champion usually does', cut: top('tank'),
  },
  {
    id: 'angel', name: 'Schutzengel', hint: 'Heilt und schützt mehr, als sein Champion üblich schafft',
    nameEn: 'Guardian angel', hintEn: 'Heals and shields more than their champion usually does', cut: top('care'),
  },
  {
    id: 'team', name: 'Teamplayer', hint: 'An mehr Kills beteiligt, als sein Champion üblich ist',
    nameEn: 'Team player', hintEn: 'In on more kills than their champion usually is', cut: top('part'),
  },
  {
    id: 'immortal', name: 'Unsterblich', hint: 'Stirbt viel seltener, als sein Champion üblich stirbt',
    nameEn: 'Immortal', hintEn: 'Dies far less often than their champion usually does', cut: top('survive'),
  },
  {
    id: 'glass', name: 'Glaskanone', hint: 'Viel mehr Schaden als üblich, stirbt aber auch viel öfter',
    nameEn: 'Glass cannon', hintEn: 'Far more damage than usual, but dies far more often too',
    rule: (s) => atLeast(s.dmg, 0.4) && s.survive !== null && s.survive <= -0.4,
  },
  // Raw numbers per game.
  { id: 'hunter', name: 'Kopfgeldjäger', hint: 'Die meisten Kills pro Spiel', nameEn: 'Bounty hunter', hintEn: 'Most kills per game', cut: top('kills') },
  { id: 'kamikaze', name: 'Kamikaze', hint: 'Die meisten Tode pro Spiel', nameEn: 'Kamikaze', hintEn: 'Most deaths per game', cut: top('deaths') },
  { id: 'wingman', name: 'Wingman', hint: 'Die meisten Assists pro Spiel', nameEn: 'Wingman', hintEn: 'Most assists per game', cut: top('assists') },
  {
    id: 'army', name: 'Ein-Mann-Armee', hint: 'Der größte Anteil am Schaden des eigenen Teams',
    nameEn: 'One-man army', hintEn: "Biggest share of their own team's damage", cut: top('teamShare', 0.05),
  },
  { id: 'gold', name: 'Goldesel', hint: 'Mehr Gold als der Rest der Lobby', nameEn: 'Gold hoarder', hintEn: 'More gold than the rest of the lobby', cut: top('goldShare') },
  {
    id: 'cc', name: 'Kontrollfreak', hint: 'Hält Gegner am längsten fest (CC pro Minute)',
    nameEn: 'Control freak', hintEn: 'Locks enemies down the longest (CC per minute)', cut: top('ccPerMinute'),
  },
  { id: 'wrecker', name: 'Abrissbirne', hint: 'Der meiste Schaden an Türmen', nameEn: 'Wrecking ball', hintEn: 'Most damage to turrets', cut: top('turrets') },
  { id: 'crit', name: 'Kritiker', hint: 'Die größten kritischen Treffer', nameEn: 'Crit king', hintEn: 'Biggest critical strikes', cut: top('crit') },
  { id: 'true', name: 'Gnadenlos', hint: 'Der größte Anteil an absolutem Schaden', nameEn: 'Merciless', hintEn: 'Biggest share of true damage', cut: top('trueShare') },
  // Damage type.
  { id: 'mage', name: 'Zauberer', hint: 'Mindestens 70 % magischer Schaden', nameEn: 'Sorcerer', hintEn: 'At least 70% magic damage', rule: (s) => atLeast(s.ap, 0.7) },
  { id: 'blade', name: 'Klingenmeister', hint: 'Mindestens 70 % normaler Schaden', nameEn: 'Blade master', hintEn: 'At least 70% physical damage', rule: (s) => atLeast(s.ad, 0.7) },
  {
    id: 'hybrid', name: 'Hybrid', hint: 'Magischer und normaler Schaden halbe-halbe',
    nameEn: 'Hybrid', hintEn: 'Magic and physical damage half and half', rule: (s) => atLeast(s.ap, 0.35) && atLeast(s.ad, 0.35),
  },
  // Champions.
  {
    id: 'onetrick', name: 'One-Trick', hint: 'Mindestens 40 % der Spiele auf einem Champion',
    nameEn: 'One-trick', hintEn: 'At least 40% of games on one champion', rule: (s) => s.topChampion >= 0.4,
  },
  { id: 'chameleon', name: 'Chamäleon', hint: 'Spielt die meisten verschiedenen Champions', nameEn: 'Chameleon', hintEn: 'Plays the most different champions', cut: top('variety') },
  { id: 'skins', name: 'Skin-Sammler', hint: 'Fast immer mit Skin unterwegs', nameEn: 'Skin collector', hintEn: 'Almost always plays with a skin', rule: (s) => atLeast(s.skins, 0.8) },
  { id: 'classic', name: 'Puristin', hint: 'Spielt fast nie mit Skin', nameEn: 'Purist', hintEn: 'Almost never plays with a skin', rule: (s) => s.skins !== null && s.skins <= 0.1 },
  // Augments.
  { id: 'prisma', name: 'Prisma-Jäger', hint: 'Der größte Anteil an Prisma-Augments', nameEn: 'Prismatic hunter', hintEn: 'Biggest share of prismatic augments', cut: top('prismatic') },
  {
    id: 'habit', name: 'Gewohnheitstier', hint: 'Nimmt in mindestens 30 % der Spiele dasselbe Augment',
    nameEn: 'Creature of habit', hintEn: 'Takes the same augment in at least 30% of games', rule: (s) => s.habit >= 0.3,
  },
  // Highlights.
  { id: 'penta', name: 'Pentakill-Legende', hint: 'Hat schon einen Pentakill geschafft', nameEn: 'Penta legend', hintEn: 'Has landed a pentakill', rule: (s) => s.pentas >= 1 },
  { id: 'multi', name: 'Multikill-Künstler', hint: 'Mindestens drei Quadrakills', nameEn: 'Multikill artist', hintEn: 'At least three quadrakills', rule: (s) => s.quadras >= 3 },
  // Grades and luck.
  { id: 'talent', name: 'Ausnahmetalent', hint: 'Die besten Noten im Schnitt', nameEn: 'Prodigy', hintEn: 'Best average grades', cut: top('average', 0.03) },
  { id: 'clockwork', name: 'Uhrwerk', hint: 'Die gleichmäßigsten Noten', nameEn: 'Clockwork', hintEn: 'Most consistent grades', cut: top('steadiness') },
  { id: 'rollercoaster', name: 'Achterbahn', hint: 'Die wechselhaftesten Noten', nameEn: 'Rollercoaster', hintEn: 'Most up-and-down grades', cut: top('swing') },
  {
    id: 'lucky', name: 'Glückspilz', hint: 'Gewinnt mindestens 60 %, obwohl die Noten unter dem Schnitt liegen',
    nameEn: 'Lucky charm', hintEn: 'Wins at least 60% despite below-average grades',
    rule: (s) => s.wins >= 0.6 && atLeast(0.45 - (s.average ?? 1), 0),
  },
  {
    id: 'unlucky', name: 'Pechvogel', hint: 'Gute Noten, gewinnt aber höchstens 40 %',
    nameEn: 'Cursed', hintEn: 'Good grades, but wins 40% at most',
    rule: (s) => s.wins <= 0.4 && atLeast(s.average, 0.6),
  },
  // Habits.
  { id: 'marathon', name: 'Marathonläufer', hint: 'Die längsten Spiele', nameEn: 'Marathoner', hintEn: 'Longest games', cut: top('minutes') },
  { id: 'blitz', name: 'Blitzkrieger', hint: 'Die kürzesten Spiele', nameEn: 'Speedrunner', hintEn: 'Shortest games', cut: bottom('minutes') },
  { id: 'grinder', name: 'Dauerzocker', hint: 'Die meisten Spiele', nameEn: 'Grinder', hintEn: 'Most games', cut: top('games', 0.05) },
];

const mean = (values: number[]) => (values.length ? values.reduce((t, v) => t + v, 0) / values.length : null);
const spread = (values: number[]) => {
  const m = mean(values);
  return m === null ? null : Math.sqrt(values.reduce((t, v) => t + (v - m) ** 2, 0) / values.length);
};

/** The values of one player's counted games; null below MIN_GAMES. `prismatic` tells which
 * augments are prismatic (from the augment list); without it that value stays null. */
export function statsOf(steps: TagStep[], prismatic?: ReadonlySet<number>): TagStats | null {
  if (steps.length < MIN_GAMES) return null;
  const entries = steps.map((s) => s.entry);
  const n = entries.length;
  const radar = radarOf(entries);
  const sum = (f: (e: AramEntry) => number) => entries.reduce((t, e) => t + f(e), 0);
  const detailed = entries.filter((e) => e.details);
  const damage = detailed.reduce((t, e) => t + e.damage, 0);
  const share = (f: (d: NonNullable<AramEntry['details']>) => number) =>
    detailed.length && damage > 0 ? detailed.reduce((t, e) => t + f(e.details!), 0) / damage : null;
  const goldShares = entries
    .filter((e) => e.lobby?.length)
    .map((e) => e.gold / (e.lobby!.reduce((t, s) => t + s.gold, 0) / e.lobby!.length || 1));
  const champions = new Map<number, number>();
  for (const e of entries) champions.set(e.championId, (champions.get(e.championId) ?? 0) + 1);
  const augments = new Map<number, number>();
  for (const e of entries) for (const id of new Set(e.augments.filter((a) => a > 0))) augments.set(id, (augments.get(id) ?? 0) + 1);
  const taken = entries.flatMap((e) => e.augments.filter((a) => a > 0));
  const withSkin = entries.filter((e) => e.skin !== undefined);
  const pcts = steps.map((s) => s.pct);
  const steadiness = spread(pcts);
  return {
    dmg: radar?.[0] ?? null,
    tank: radar?.[1] ?? null,
    care: radar?.[2] ?? null,
    part: radar?.[3] ?? null,
    survive: radar?.[4] ?? null,
    kills: sum((e) => e.kills) / n,
    deaths: sum((e) => e.deaths) / n,
    assists: sum((e) => e.assists) / n,
    teamShare: sum((e) => e.teamShare) / n,
    goldShare: mean(goldShares),
    ccPerMinute: detailed.length ? detailed.reduce((t, e) => t + e.details!.ccSeconds / Math.max(1, e.seconds / 60), 0) / detailed.length : null,
    turrets: detailed.length ? detailed.reduce((t, e) => t + e.details!.turretDamage, 0) / detailed.length : null,
    crit: detailed.length ? Math.max(...detailed.map((e) => e.details!.largestCrit)) : null,
    trueShare: share((d) => d.trueDamage),
    minutes: sum((e) => e.seconds) / n / 60,
    games: n,
    variety: champions.size / n,
    steadiness: steadiness === null ? null : -steadiness,
    swing: steadiness,
    average: mean(pcts),
    prismatic: prismatic?.size && taken.length ? taken.filter((a) => prismatic.has(a)).length / taken.length : null,
    topChampion: Math.max(...champions.values()) / n,
    wins: entries.filter((e) => e.win).length / n,
    pentas: sum((e) => e.pentas),
    quadras: detailed.reduce((t, e) => t + e.details!.quadras, 0),
    skins: withSkin.length >= 5 ? withSkin.filter((e) => (e.skin ?? 0) > 0).length / withSkin.length : null,
    ap: share((d) => d.magic),
    ad: share((d) => d.physical),
    habit: augments.size ? Math.max(...augments.values()) / n : 0,
  };
}

/** Value of a percentile tag's stat at its cut, per tag id; a tag without enough values has none. */
export type Cutoffs = Record<string, number>;

/** The cut-offs from all players' values (none below MIN_PLAYERS). */
export function cutoffsOf(all: TagStats[]): Cutoffs {
  const cuts: Cutoffs = {};
  if (all.length < MIN_PLAYERS) return cuts;
  for (const tag of TAGS) {
    if (!tag.cut) continue;
    const { stat, side, share } = tag.cut;
    const values = all.map((s) => s[stat]).filter((v): v is number => v !== null);
    if (values.length < MIN_PLAYERS) continue;
    values.sort((a, b) => (side === 'top' ? b - a : a - b));
    // The value of the last player inside the share: everyone at least as good gets the tag.
    const cut = values[Math.max(0, Math.ceil(values.length * share) - 1)];
    // Many equal values (everyone 0 prismatic augments, the same number of games): no tag, it
    // would not single anyone out.
    const reaching = values.filter((v) => (side === 'top' ? v >= cut : v <= cut)).length;
    if (reaching <= Math.max(1, values.length * share * 2)) cuts[tag.id] = cut;
  }
  return cuts;
}

/** The ids of the tags a player has. */
export function tagsOf(stats: TagStats, cuts: Cutoffs): string[] {
  return TAGS.filter((tag) => {
    if (tag.rule) return tag.rule(stats);
    const cut = cuts[tag.id];
    const value = stats[tag.cut.stat];
    if (cut === undefined || value === null) return false;
    return tag.cut.side === 'top' ? value >= cut : value <= cut;
  }).map((tag) => tag.id);
}

/** What /api/tags sends: the cut-offs and how many of the players have each tag. */
export type TagCensus = { players: number; cutoffs: Cutoffs; counts: Record<string, number> };

export function censusOf(all: TagStats[]): TagCensus {
  const cutoffs = cutoffsOf(all);
  const counts: Record<string, number> = {};
  for (const stats of all) for (const id of tagsOf(stats, cutoffs)) counts[id] = (counts[id] ?? 0) + 1;
  return { players: all.length, cutoffs, counts };
}

/** A player's tags with their rarity, rarest first; only with enough players to compare. Names
 * and hints in `lang` (German by default, as the API sends them). */
export function rankedTags(stats: TagStats, census: TagCensus, lang: 'en' | 'de' = 'de') {
  if (census.players < MIN_PLAYERS) return [];
  return tagsOf(stats, census.cutoffs)
    .map((id) => {
      const tag = TAGS.find((t) => t.id === id)!;
      // The player has it, so it counts at least once (the census may be a few minutes older).
      const share = Math.max(1, census.counts[id] ?? 0) / census.players;
      return lang === 'de'
        ? { id, name: tag.name, hint: tag.hint, share }
        : { id, name: tag.nameEn, hint: tag.hintEn, share };
    })
    .sort((a, b) => a.share - b.share || a.name.localeCompare(b.name, lang));
}

/** What someone likes to play, for the "Vorlieben" card: champions, classes (from Data Dragon's
 * first tag of each champion), damage types and augments, each as a share of the games. */
export function preferencesOf(entries: AramEntry[], classOf: (championId: number) => string | undefined) {
  const n = entries.length;
  const count = <K,>(keys: K[]) => {
    const m = new Map<K, number>();
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m].map(([key, games]) => ({ key, games, share: n ? games / n : 0 })).sort((a, b) => b.games - a.games);
  };
  const champions = count(entries.map((e) => e.championId)).slice(0, 3);
  const classes = count(entries.map((e) => classOf(e.championId)).filter((c): c is string => !!c));
  const augments = count(entries.flatMap((e) => [...new Set(e.augments.filter((a) => a > 0))])).slice(0, 4);
  const detailed = entries.filter((e) => e.details);
  const total = detailed.reduce((t, e) => t + e.details!.magic + e.details!.physical + e.details!.trueDamage, 0);
  const part = (f: (d: NonNullable<AramEntry['details']>) => number) => detailed.reduce((t, e) => t + f(e.details!), 0) / total;
  const damage = total > 0 ? { ap: part((d) => d.magic), ad: part((d) => d.physical), true: part((d) => d.trueDamage) } : null;
  return { champions, classes, augments, damage };
}
