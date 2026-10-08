// Offmeta-System and Mayhem-Combos (user's wishes 08.10.2026: "Offmeta-Builds, z. B. AP-Alistar",
// "für jeden Champ coole Mayhem-Combos, z. B. Illaoi Maximum Heal, Warwick Krit", "ich will nichts
// von Hand pflegen", "ein System für Offmeta-Builds"): one engine that finds, per champion, builds
// around a theme from the champion's own arammeta numbers. A theme is a rule over the data, never a
// list of ids: items by their Data Dragon tags and arammeta's English item text, augments by
// arammeta's categories and English text. Each patch's new items and augments land in their themes
// by themselves. The build directions AP, AD and Tank are themes of the same engine (the card's
// offmeta build, `offmetaBuild`). A combo is put together from single numbers (each augment and
// item measured on its own on the champion); the combination itself was never measured, the card
// says so. Always several combos with their numbers, never one prescription. Pure, tested in
// combos.test.ts.
import type { ChampItem, MetaAugment } from '../../adapters/aramChamp';
import type { BuildPick, Direction } from './champCard';

/**
 * Items whose main effect does nothing in ARAM Mayhem (user's wish "Items, die komplett useless
 * sind, wie Umbral"): never part of a suggested build, whatever their numbers. By Data Dragon id;
 * the reason is for the next person who edits the list.
 */
export const USELESS_ITEMS: Readonly<Record<number, string>> = {
  3179: 'Umbral Glaive: der Effekt deckt Wards auf und zerstört sie, in ARAM gibt es keine',
  1101: 'Jungle-Begleiter: nur für Monster im Dschungel, den es in ARAM nicht gibt',
  1102: 'Jungle-Begleiter: nur für Monster im Dschungel, den es in ARAM nicht gibt',
  1103: 'Jungle-Begleiter: nur für Monster im Dschungel, den es in ARAM nicht gibt',
  3865: 'Support-Questitem: lebt von Gold aus Vasallen einer Lane mit Partner und von Wards',
  3866: 'Support-Questitem: lebt von Gold aus Vasallen einer Lane mit Partner und von Wards',
  3867: 'Support-Questitem: lebt von Gold aus Vasallen einer Lane mit Partner und von Wards',
  3869: 'Support-Questitem (Ausbaustufe): Quest und Ward-Effekt greifen in ARAM nicht',
  3870: 'Support-Questitem (Ausbaustufe): Quest und Ward-Effekt greifen in ARAM nicht',
  3871: 'Support-Questitem (Ausbaustufe): Quest und Ward-Effekt greifen in ARAM nicht',
  3876: 'Support-Questitem (Ausbaustufe): Quest und Ward-Effekt greifen in ARAM nicht',
  3877: 'Support-Questitem (Ausbaustufe): Quest und Ward-Effekt greifen in ARAM nicht',
};

/** Each mana item lowers a build's score by this much (user's rule: mana is useless in ARAM). */
export const MANA_PENALTY = 0.08;
/** Items in a build core. */
export const CORE_SIZE = 3;
/** Win rates from few games are pulled towards 50 % as if this many average games were added. */
export const META_PRIOR = 200;
/** A win rate pulled towards `base` (50 %, or the champion's own for combos) when few games. */
export const pulled = (wr: number, g: number, base = 0.5) =>
  (wr * g + base * META_PRIOR) / (g + META_PRIOR);

/** What a rule sees of an item: its direction, Data Dragon tags and arammeta's English text. */
export type ItemFacts = { kind: ChampItem['kind']; tags: readonly string[]; text: string };
/** What a rule sees of an augment: arammeta's categories, its English name and text. */
export type AugmentFacts = { cats: readonly string[]; name: string; text: string };

export type Theme = {
  id: string;
  /** German name and one line of what it does, as the card shows them. */
  name: string;
  line: string;
  /** Whether an item belongs to it; 'own': the champion's own best items (augments make it). */
  item: ((i: ItemFacts) => boolean) | 'own';
  augment: (a: AugmentFacts) => boolean;
  /** The theme lives on mana (Overflow, healers): its mana items are not held against it. */
  mana?: true;
  /** A build direction (AP/AD/Tank): its usual one is the card's build, only an offmeta one is a combo. */
  direction?: Direction;
};

const has = (list: readonly string[], ...want: string[]) => list.some((x) => want.includes(x));
const ALLY = /\ball(?:y|ies|ied)\b/i;
const HEAL = /\bheal(?:s|ing|ed)?\b|omnivamp|life ?steal|restores? health/i;
const SHIELD = /(?:grant|gain|convert)[^.]{0,60}shield|stasis|invulnerab/i;
const BIG_HEALTH = /\b(?:[5-9]\d\d|\d{4,}) health\b/i;
const first = (text: string) => text.split(/\.\s/)[0];

/** Build directions as themes (the card's direction tabs; `offmetaBuild`). */
export const DIRECTION_THEMES: Readonly<Record<Direction, Theme>> = {
  ap: {
    id: 'ap',
    name: 'AP',
    line: 'Alles auf Fähigkeitsstärke statt der üblichen Richtung.',
    direction: 'ap',
    item: (i) => i.kind === 'ap',
    augment: (a) => a.cats.includes('ap'),
  },
  ad: {
    id: 'ad',
    name: 'AD',
    line: 'Alles auf Angriffsschaden statt der üblichen Richtung.',
    direction: 'ad',
    item: (i) => i.kind === 'ad',
    augment: (a) => a.cats.includes('ad'),
  },
  tank: {
    id: 'tank',
    name: 'Tank',
    line: 'Alles auf Leben und Resistenzen statt der üblichen Richtung.',
    direction: 'tank',
    item: (i) => i.kind === 'tank',
    augment: (a) => a.cats.includes('tank'),
  },
};

/**
 * The themes: rules, no ids. An item fits by its Data Dragon tags or words of its English text, an
 * augment by arammeta's categories (ad, ap, crit, amp, tank, support, cd, gold, mechanic) or words
 * of its English name and text. A new rule needs a test with real-shaped items and augments.
 */
export const THEMES: readonly Theme[] = [
  {
    id: 'heal',
    name: 'Maximum Heal',
    line: 'Omnivamp, Lebensraub und Heilung: jede Wunde schließt sich.',
    item: (i) => (has(i.tags, 'LifeSteal', 'SpellVamp') || HEAL.test(i.text)) && !ALLY.test(i.text),
    augment: (a) => HEAL.test(a.text) && !ALLY.test(a.text),
  },
  {
    id: 'crit',
    name: 'Full Crit',
    line: 'Nur Krit-Items, dazu die Krit-Augments.',
    item: (i) => has(i.tags, 'CriticalStrike'),
    augment: (a) => a.cats.includes('crit') || /\bcrit(?:ical)?\b/i.test(a.text),
  },
  {
    id: 'giant',
    name: 'Riesen-Tank',
    line: 'Riesig werden: Leben, Größe, Herzstahl-Stapel.',
    item: (i) => BIG_HEALTH.test(i.text),
    augment: (a) =>
      a.cats.includes('tank') &&
      /size|large|grow|max(?:imum)? health|bonus health|heartsteel|gain \S* ?health\b/i.test(
        a.text,
      ) &&
      !/tiny|smaller|shrink/i.test(a.text),
  },
  {
    id: 'onhit',
    name: 'On-Hit',
    line: 'Jeder Treffer löst Effekte aus, so schnell wie möglich.',
    item: (i) => has(i.tags, 'OnHit'),
    augment: (a) => /on-?hit/i.test(a.text),
  },
  {
    id: 'burn',
    name: 'Feuerteufel',
    line: 'Brennen und Dauerschaden, der sich stapelt.',
    item: (i) => /\bburn|immolate|damage per second/i.test(i.text),
    augment: (a) => /\bburn|damage over time|immolat|sunfire/i.test(a.text),
  },
  {
    id: 'shield',
    name: 'Unkaputtbar',
    line: 'Schilde, Stasis und Unverwundbarkeit statt Sterben.',
    item: (i) => SHIELD.test(i.text) && !ALLY.test(i.text),
    augment: (a) => SHIELD.test(a.text) && !a.cats.includes('support'),
  },
  {
    id: 'haste',
    name: 'Fähigkeiten-Spam',
    line: 'So viel Fähigkeitstempo, dass alles ständig bereit ist.',
    item: (i) => /\b[2-9]\d ability haste/i.test(i.text),
    augment: (a) => a.cats.includes('cd') && !/ultimate|snowball/i.test(a.text),
  },
  {
    id: 'ult',
    name: 'Ult-Spam',
    line: 'Die Ultimative so oft wie möglich.',
    item: (i) => /ultimate/i.test(i.text),
    augment: (a) =>
      /ultimate/i.test(a.text) && !/cannot use your ultimate|non-ultimate/i.test(a.text),
  },
  {
    id: 'speed',
    name: 'Speed-Dämon',
    line: 'Schneller als alle anderen, Tempo wird zu Schaden.',
    item: (i) => has(i.tags, 'NonbootsMovement'),
    augment: (a) =>
      /move(?:ment)? speed/i.test(first(a.text)) &&
      !/slowing|reduce movement speed/i.test(a.text) &&
      !ALLY.test(a.text),
  },
  {
    id: 'armor',
    name: 'Dornen-Festung',
    line: 'Rüstung und Resistenzen stapeln, wer zuschlägt, zahlt.',
    item: (i) => i.kind === 'tank' && has(i.tags, 'Armor', 'SpellBlock'),
    augment: (a) =>
      a.cats.includes('tank') &&
      /armor|magic resist|taking damage|damage reduction|reduce damage/i.test(a.text) &&
      !/shred/i.test(a.text),
  },
  {
    id: 'glass',
    name: 'Glaskanone',
    line: 'Durchschlag und Bonusschaden: ein Combo, ein Kill.',
    item: (i) =>
      has(i.tags, 'MagicPenetration', 'ArmorPenetration') ||
      /increases your total ability power/i.test(i.text),
    augment: (a) =>
      /penetration|lethality|true damage|deal (?:an )?extra|more damage|bonus damage/i.test(
        a.text,
      ) && !has(a.cats, 'tank', 'support'),
  },
  {
    id: 'execute',
    name: 'Henker',
    line: 'Angeschlagene Gegner sofort erledigen.',
    item: (i) => /execut|(?:their|target's) missing health|enemies below \d+% health/i.test(i.text),
    augment: (a) => /execut|enemies at low health/i.test(a.text) && !ALLY.test(a.text),
  },
  {
    id: 'cc',
    name: 'Kontrollfreak',
    line: 'Betäuben, verlangsamen, festhalten und dafür belohnt werden.',
    item: (i) => has(i.tags, 'Slow') || /immobiliz/i.test(i.text),
    augment: (a) =>
      /immobiliz|stun|taunt|fear|charm|polymorph|knock(?:s|ing)? (?:up|back)/i.test(a.text),
  },
  {
    id: 'hybrid',
    name: 'Hybrid',
    line: 'Fähigkeitsstärke und Angriffsschaden zugleich.',
    item: (i) => has(i.tags, 'SpellDamage') && has(i.tags, 'Damage'),
    augment: (a) =>
      /ability power[^.]*attack damage|attack damage[^.]*ability power|attacks deal[^.]*ability power|armor penetration and magic|lethality and magic/i.test(
        a.text,
      ),
  },
  {
    id: 'hydra',
    name: 'Hydra-Wirbel',
    line: 'Rundumschläge, die alles um dich treffen.',
    item: (i) => /cleave/i.test(i.text),
    augment: (a) => /hydra|cleave|spin abilities/i.test(a.text),
  },
  {
    id: 'snowball',
    name: 'Schneeball-Kanone',
    line: 'Markieren, reinfliegen, alles umwerfen.',
    item: (i) => has(i.tags, 'NonbootsMovement'),
    augment: (a) => /snowball/i.test(a.text),
  },
  {
    id: 'kamikaze',
    name: 'Kamikaze',
    line: 'Sterben gehört zum Plan: Explosionen und Rückkehr nach dem Tod.',
    item: (i) => BIG_HEALTH.test(i.text),
    augment: (a) => /when you die|^on death|after death|\brevive/i.test(a.text),
  },
  {
    id: 'mana',
    name: 'Mana-Monster',
    line: 'Overflow und Co.: Mana wird zu Leben, Schild und Schaden.',
    mana: true,
    item: (i) => has(i.tags, 'Mana'),
    augment: (a) => /\bmana\b/i.test(a.text) && !/mana regen/i.test(a.text),
  },
  {
    id: 'support',
    name: 'Heil-Engel',
    line: 'Verbündete heilen und schützen, mit voller Heil- und Schildstärke.',
    mana: true,
    item: (i) => /heal and shield power/i.test(i.text),
    augment: (a) =>
      (ALLY.test(a.text) && /\bheal|shield/i.test(a.text)) ||
      /heal and shield power|healing and shielding/i.test(a.text),
  },
  {
    id: 'souls',
    name: 'Drachenseelen',
    line: 'Seelen aller Drachen sammeln, ohne einen Drachen.',
    item: 'own',
    augment: (a) =>
      /(?:infernal|hextech|ocean|mountain|omni|dragon) souls?\b/i.test(`${a.name} ${a.text}`),
  },
  {
    id: 'summon',
    name: 'Beschwörer',
    line: 'Begleiter und Vasallen werden zur Armee.',
    item: 'own',
    augment: (a) => /your summons|tibbers|minions are (?:greatly )?empowered/i.test(a.text),
  },
  {
    id: 'gamble',
    name: 'Zocker',
    line: 'Zufalls-Augments und Ambosse: alles auf eine Karte.',
    item: 'own',
    augment: (a) => /random (?:\w+ )?augments?|anvil/i.test(a.text),
  },
  DIRECTION_THEMES.ap,
  DIRECTION_THEMES.ad,
  DIRECTION_THEMES.tank,
];

export const themeOf = (id: string) => THEMES.find((t) => t.id === id);
/** Every item of the champion (its own damage, `combosFor`). */
const OWN: Theme = { id: 'own', name: '', line: '', item: 'own', augment: () => false };
type Damage = 'ap' | 'ad' | null;
/** The damage (AP or AD) of the first damage item in the list. */
const damageOf = (list: { item: ChampItem }[]): Damage =>
  list.map((r) => r.item.kind).find((k): k is 'ap' | 'ad' => k === 'ap' || k === 'ad') ?? null;

/** arammeta's Mayhem items: English text and price (Rust `meta_info`, from its item list). */
export type ItemTexts = Record<string, { text: string; price: number | null }>;
type Row = { ids: number[]; g: number; wr: number; pick?: number | null };
type Measured = { id: number; g: number; wr: number; pick: number | null; item: ChampItem };

const factsOf = (id: number, item: ChampItem, texts: ItemTexts | undefined): ItemFacts => ({
  kind: item.kind,
  tags: item.tags ?? [],
  text: texts?.[String(id)]?.text ?? '',
});
const fits = (theme: Theme, id: number, item: ChampItem, texts?: ItemTexts) =>
  theme.item === 'own' || theme.item(factsOf(id, item, texts));

/**
 * The champion's measured single items of a theme (arammeta's best, popular-but-weak and weakest
 * single items), best first: win rate pulled towards `base` when few, minus MANA_PENALTY for a
 * mana item unless the theme lives on mana; finished ones only, never useless ones.
 */
export function measuredItems(
  theme: Theme,
  rows: Row[],
  items: Record<string, ChampItem>,
  texts?: ItemTexts,
  base = 0.5,
) {
  const seen = new Set<number>();
  return rows
    .filter((r) => r.ids.length === 1 && !seen.has(r.ids[0]) && !!seen.add(r.ids[0]))
    .map((r) => ({
      id: r.ids[0],
      g: r.g,
      wr: r.wr,
      pick: r.pick ?? null,
      item: items[String(r.ids[0])],
    }))
    .filter((r): r is Measured => !!r.item?.done && !(r.id in USELESS_ITEMS))
    .filter((r) => fits(theme, r.id, r.item, texts))
    .map((r) => ({
      ...r,
      score: pulled(r.wr, r.g, base) - (r.item.mana && !theme.mana ? MANA_PENALTY : 0),
    }))
    .sort((a, b) => b.score - a.score || b.g - a.g || a.id - b.id);
}

const mean = (list: number[]) => list.reduce((t, v) => t + v, 0) / list.length;

/** Offmeta: an item of the direction needs this many games on the champion. */
export const OFFMETA_MIN_GAMES = 40;
/** It may win this much less often than the champion's usual builds and still count as playable. */
export const OFFMETA_MARGIN = 0.015;

/**
 * Offmeta build of a direction (user's wish 08.10.2026, e.g. AP-Alistar): a direction arammeta has
 * no item core for, put together by the engine from the champion's single items of that direction
 * theme (`measuredItems`). The best three with enough games each, the next three as later items.
 * Null without three such items or when they play clearly worse than the champion's usual builds
 * (`mainRate`, null: unknown).
 */
export function offmetaBuild(
  d: Direction,
  rows: Row[],
  items: Record<string, ChampItem>,
  mainRate: number | null,
): BuildPick | null {
  const pool = measuredItems(DIRECTION_THEMES[d], rows, items).filter(
    (r) => r.g >= OFFMETA_MIN_GAMES,
  );
  const core = pool.slice(0, CORE_SIZE);
  if (core.length < CORE_SIZE) return null;
  const winRate = mean(core.map((r) => r.wr));
  if (mainRate !== null && winRate < mainRate - OFFMETA_MARGIN) return null;
  const shown = (r: (typeof pool)[number]) => ({ id: r.id, name: r.item.name, mana: r.item.mana });
  return {
    items: core.map(shown),
    games: Math.min(...core.map((r) => r.g)),
    winRate,
    grade: null,
    mana: core.filter((r) => r.item.mana).length,
    label: 'Offmeta',
    later: pool.slice(CORE_SIZE, CORE_SIZE * 2).map(shown),
    assembled: core.map((r) => ({ games: r.g, winRate: r.wr })),
  };
}

/** A combo needs this many of the theme's augments in the champion's pool. */
export const COMBO_MIN_AUGMENTS = 2;
/** Augments and items shown per combo (a Mayhem game has four augments, a build five items). */
export const COMBO_AUGMENTS = 4;
export const COMBO_ITEMS = 5;
/** Combos kept per champion: the cards show every one as a chip (not overloaded: one combo open at
 * a time); the popout gets them all (flyout.rs takes ≤ 128 KB, measured in VALIDATION). */
export const COMBOS_MAX = 16;
/**
 * Meta: at least two of the three core items are ones the champion buys in this share of its
 * games, and at least one of the augments is taken in this share of them (arammeta's pick rates;
 * an augment is taken in 2–3 % of a champion's games in the middle). Otherwise Offmeta.
 */
export const META_ITEM_PICK = 0.2;
export const META_AUGMENT_PICK = 0.05;

export type ComboAugment = {
  id: number;
  name: string;
  rarity: string;
  image: string | null;
  games: number;
  winRate: number;
};
/** An item of a combo; without numbers (null) the champion has none with it at arammeta. */
export type ComboItem = {
  id: number;
  name: string;
  mana: boolean;
  games: number | null;
  winRate: number | null;
};
export type Combo = {
  theme: string;
  meta: boolean;
  augments: ComboAugment[];
  items: ComboItem[];
};

/**
 * The champion's combos: per theme, its augments the champion gets (arammeta's pool) and a build
 * of its items (measured on the champion first, then arammeta's other Mayhem items of the theme,
 * dearest first, without numbers; never AP and AD items together – the first damage item decides;
 * unmeasured mana items only in a mana theme). Win rates are pulled towards the champion's own
 * average (the Ø of its pool) when few games: towards 50 %, a weak champion's rare augments would
 * rank above its proven ones. Needs COMBO_MIN_AUGMENTS augments and CORE_SIZE items. A direction
 * theme only for a direction the card calls offmeta (`offmeta`). Ranked by the Ø of the augments'
 * pulled win rates; Meta and Offmeta take turns, the better first.
 */
export function combosFor(input: {
  pool: { id: number; g: number; wr: number; pick: number | null }[];
  rows: Row[];
  items: Record<string, ChampItem>;
  texts: ItemTexts;
  augments: Record<string, MetaAugment>;
  info: (id: number) => { name: string; rarity: string; image: string | null };
  /** Directions whose build on the card is an offmeta one (`offmetaBuild`). */
  offmeta: Direction[];
}): Combo[] {
  const { pool, rows, items, texts, augments, info, offmeta } = input;
  const games = pool.reduce((t, a) => t + a.g, 0);
  const base = games ? pool.reduce((t, a) => t + a.wr * a.g, 0) / games : 0.5;
  // The champion's own damage (AP or AD, by the games of its measured items): a theme without a
  // measured damage item builds that way when it has enough items for it.
  const dealt = { ap: 0, ad: 0 };
  for (const r of measuredItems(OWN, rows, items))
    if (r.item.kind === 'ap' || r.item.kind === 'ad') dealt[r.item.kind] += r.g;
  const usual: Damage = dealt.ap > dealt.ad ? 'ap' : dealt.ad > dealt.ap ? 'ad' : null;
  const found: (Combo & { score: number })[] = [];
  for (const theme of THEMES) {
    if (theme.direction && !offmeta.includes(theme.direction)) continue;
    const augs = pool
      .filter((a) => {
        const m = augments[String(a.id)];
        return !!m && theme.augment({ cats: m.cats, name: m.name, text: m.text ?? '' });
      })
      .map((a) => ({ ...a, score: pulled(a.wr, a.g, base) }))
      .sort((a, b) => b.score - a.score || b.g - a.g || a.id - b.id)
      .slice(0, COMBO_AUGMENTS);
    if (augs.length < COMBO_MIN_AUGMENTS) continue;
    // A direction as the card's offmeta build ranks it (towards 50 %), the rest towards the champion.
    const measured = measuredItems(theme, rows, items, texts, theme.direction ? 0.5 : base);
    const general =
      theme.item === 'own'
        ? []
        : Object.keys(texts)
            .map(Number)
            .filter((id) => !measured.some((m) => m.id === id) && !(id in USELESS_ITEMS))
            .map((id) => ({ id, item: items[String(id)], g: null, wr: null, pick: null }))
            .filter((r) => !!r.item?.done && (theme.mana || !r.item.mana))
            .filter((r) => fits(theme, r.id, r.item, texts))
            .sort(
              (a, b) =>
                (texts[String(b.id)].price ?? 0) - (texts[String(a.id)].price ?? 0) || a.id - b.id,
            );
    const all = [...measured, ...general];
    const without = (kind: Damage) =>
      all.filter((r) => r.item.kind !== (kind === 'ap' ? 'ad' : kind === 'ad' ? 'ap' : null));
    const damage =
      damageOf(measured) ??
      (without(usual).length >= CORE_SIZE ? usual : null) ??
      damageOf(general);
    const build = without(damage).slice(0, COMBO_ITEMS);
    if (build.length < CORE_SIZE) continue;
    const bought = build.slice(0, CORE_SIZE).filter((r) => (r.pick ?? 0) >= META_ITEM_PICK);
    const meta = bought.length >= 2 && augs.some((a) => (a.pick ?? 0) >= META_AUGMENT_PICK);
    // The usual direction is the card's build, not a combo.
    if (theme.direction && meta) continue;
    found.push({
      theme: theme.id,
      meta,
      score: mean(augs.map((a) => a.score)),
      augments: augs.map((a) => {
        const { name, rarity, image } = info(a.id);
        return { id: a.id, name, rarity, image, games: a.g, winRate: a.wr };
      }),
      items: build.map((r) => ({
        id: r.id,
        name: r.item.name,
        mana: r.item.mana,
        games: r.g,
        winRate: r.wr,
      })),
    });
  }
  const best = (list: typeof found) =>
    list.sort((a, b) => b.score - a.score || a.theme.localeCompare(b.theme));
  const metas = best(found.filter((c) => c.meta));
  const offs = best(found.filter((c) => !c.meta));
  const out: Combo[] = [];
  let [next, then] =
    (metas[0]?.score ?? -1) >= (offs[0]?.score ?? -1) ? [metas, offs] : [offs, metas];
  while (out.length < COMBOS_MAX && (next.length || then.length)) {
    const c = next.shift();
    if (c) out.push({ theme: c.theme, meta: c.meta, augments: c.augments, items: c.items });
    [next, then] = [then, next];
  }
  return out;
}

/** The line under a combo's items: whether they have numbers on the champion. */
export function comboNote(combo: Combo, champion: string) {
  const without = combo.items.filter((i) => i.games === null).length;
  if (!without) return null;
  return without === combo.items.length
    ? `Keins der Items hat Zahlen mit ${champion}: nach Thema gewählt, teuerste zuerst.`
    : `${without} ${without === 1 ? 'Item ohne' : 'Items ohne'} Zahlen mit ${champion}: nach Thema gewählt.`;
}

/** Said once over the combos: what the numbers are (user's rule: honest about assembled builds). */
export const COMBO_HONESTY =
  'Zusammengesetzt: jedes Augment und Item ist einzeln auf dem Champion gemessen, die Combo als Ganzes nie.';
