import { Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { championSplash } from '../adapters/aram';
import { NOT_SELECTING, openGuide, pushItemSet, pushSpells } from '../adapters/aramChamp';
import { tellOverlay } from '../adapters/overlay';
import { Guard } from '../components/Guard';
import { DDRAGON_VERSION } from '../data/proStreamers';
import {
  assembledFacts,
  itemTitle,
  sourceLabel,
  spellName,
  type ChampExtra,
  type BuildPlan,
  type ChampView,
  type Offer,
  type Tier,
} from '../features/aram/champCard';
import {
  COMBO_HONESTY_EN,
  comboNote,
  themeOf,
  themeText,
  type Combo,
} from '../features/aram/combos';
import { skillOrderOf, type SkillKey, type SkillOrders } from '../features/aram/skillOrders';
import {
  buildList,
  chosenEntry,
  comboName,
  fitFor,
  itemSetFor,
  takenMatches,
  type BuildEntry,
  type BuildGroup,
  type TakenAugment,
} from './builds';
import { games, number, percent, winsIn } from './format';
import { MOCK_SKILL_ORDER } from './mock';
import { teamProfile, type TierAugment, type TierChampion } from './tiers';
import { AugmentPicture, FIRST, More, Tabs } from './ui';

export const itemImage = (id: number) =>
  `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/item/${id}.png`;
/** Staggers a row's soft entrance (mayhem.css, .mayhem-in). */
const step = (i: number) => ({ ['--i' as string]: Math.min(i, 16) }) as CSSProperties;

/** The augment's rarity as the frame of its picture (silver, gold, prismatic like in the game). */
function AugmentIcon({ rarity, image }: { rarity: string; image: string | null }) {
  return (
    <span className="mayhem-aug-icon" data-rarity={rarity}>
      <AugmentPicture image={image} size={32} />
    </span>
  );
}

const MANA = ' (mana, weak in ARAM)';
/** Win rate and games on the row; the pick rate only in its tooltip. */
const picked = (p: { games: number; winRate: number; pick: number | null }) =>
  `${winsIn(p.winRate, p.games)}${p.pick !== null ? `\nPicked in ${percent(p.pick)} of games` : ''}`;

const spellImage = (key: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/spell/${key}.png`;

/**
 * Mayhem-Combos (combos.ts): every combo of the champion as a chip, Meta and Offmeta apart, the
 * chosen one with its augments and items and their numbers on the champion.
 */
export function ComboSection({ combos, champion }: { combos: Combo[]; champion: string }) {
  const [chosen, setChosen] = useState(0);
  const [allChips, setAllChips] = useState(false);
  const combo = combos[chosen] ?? combos[0];
  if (!combo) return null;
  const known = themeOf(combo.theme);
  const theme = known && themeText(known, 'en');
  const note = comboNote(combo, champion, 'en');
  const tag = (meta: boolean) => (
    <span className="mayhem-combo-tag" data-meta={meta}>
      {meta ? 'Meta' : 'Offmeta'}
    </span>
  );
  return (
    <div className="mayhem-section">
      {[true, false].map((meta) => {
        // Five chips per group first (the chosen one always), the rest behind "+n".
        const group = combos.flatMap((c, i) => (c.meta === meta ? [{ c, i }] : []));
        const shown = group.filter(({ c }, n) => allChips || n < FIRST || c === combo);
        return (
          group.length > 0 && (
            <div
              key={String(meta)}
              className="mayhem-chips mayhem-combo-picks"
              role="group"
              aria-label={meta ? 'Meta combos' : 'Offmeta combos'}
            >
              {tag(meta)}
              {shown.map(({ c, i }) => (
                <button
                  key={c.theme}
                  type="button"
                  aria-pressed={c === combo}
                  onClick={() => setChosen(i)}
                >
                  {comboName(c)}
                </button>
              ))}
              {shown.length < group.length && (
                <button
                  type="button"
                  className="mayhem-chip-more"
                  aria-label={`Show ${group.length - shown.length} more combos`}
                  onClick={() => setAllChips(true)}
                >
                  +{group.length - shown.length}
                </button>
              )}
            </div>
          )
        );
      })}
      <div className="mayhem-combo">
        <h3>
          {comboName(combo)} {tag(combo.meta)}
        </h3>
        {theme && <p className="mayhem-note">{theme.line}</p>}
        <ul className="mayhem-best">
          {combo.augments.map((a) => (
            <li key={a.id} title={winsIn(a.winRate, a.games)}>
              <AugmentIcon rarity={a.rarity} image={a.image} />
              <span className="mayhem-aug-name">{a.name}</span>
              <span className="mayhem-facts">
                <b>{percent(a.winRate)}</b>
                <span>{games(a.games)}</span>
              </span>
            </li>
          ))}
        </ul>
        <ul className="mayhem-grid">
          {combo.items.map((i) => (
            <li
              key={i.id}
              title={`${i.name}${i.mana ? MANA : ''}${i.games === null ? `: no numbers on ${champion}` : ''}`}
            >
              <span className="mayhem-items">
                <img
                  data-mana={i.mana || undefined}
                  src={itemImage(i.id)}
                  alt={i.name}
                  width={30}
                  height={30}
                />
              </span>
              <span className="mayhem-facts">
                {i.winRate === null || i.games === null ? (
                  <span>by theme</span>
                ) : (
                  <>
                    <b>{percent(i.winRate)}</b>
                    <span>{games(i.games)}</span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
        {note && <p className="mayhem-note">{note}</p>}
      </div>
      <p className="mayhem-note">{COMBO_HONESTY_EN}</p>
    </div>
  );
}

/** An augment taken this game as the highlight's rules read it, with name and picture from
 * arammeta's list (unknown there: the client's name, no picture). */
type Took = TakenAugment & { image: string | null; rarity: string };

const GROUP_LABEL: Record<BuildGroup, string> = {
  meta: 'Meta',
  offmeta: 'Offmeta',
  troll: 'Troll',
};
const GROUPS = Object.keys(GROUP_LABEL) as BuildGroup[];

/**
 * The Champ-Karte in the Mayhem app. Its question: what do I build on this champion? The champion
 * as a banner; in the game the augment offer under it; left the builds in three tabs Meta | Offmeta
 * | Troll (builds.ts, user's decision 10.10.2026, like Blitz), right the chosen build: core and
 * later items, its augments instead of a build order, spells, max order, boots and damage, "Push
 * build". Augments taken in the game light up the builds they fit, and the first of them is chosen
 * until the user chooses one by hand. Everything else in the tabs below.
 */
export function MayhemCard({
  view,
  sample,
  champion,
  augments,
  offer,
  selecting,
  chosen,
  onChoose,
  onTake,
  onClose,
}: {
  view: ChampView;
  sample: boolean;
  /** The champion in arammeta's champion list (its win rate and damage split), null when not there. */
  champion: TierChampion | null;
  /** arammeta's augment list: English names, pictures and what the highlight's rules read. */
  augments: TierAugment[];
  /** In the game (offers.rs): the offer open now, or the last one (`open` false), and what was taken. */
  offer: (Offer & { open?: boolean }) | null;
  /** A champion select runs: "Auto push" writes only then, never in the game. */
  selecting: boolean;
  /** The build chosen by hand this game (it wins over the highlight), null: none yet. */
  chosen: string | null;
  onChoose: (key: string) => void;
  /** A click on an offered card: taken (or no longer). */
  onTake: (id: number) => void;
  onClose?: () => void;
}) {
  const label = view.name || view.alias || `Champion ${view.championId}`;
  const splash = championSplash(view.alias);
  const base = champion?.winRate;
  const entries = useMemo(() => buildList(view, base), [view, base]);
  const taken = useMemo(
    () =>
      (offer?.taken ?? []).map((t): Took => {
        const a = augments.find((x) => x.id === t.id);
        return a
          ? { id: a.id, name: a.name, cats: a.cats, text: a.text, image: a.image, rarity: a.rarity }
          : { ...t, cats: [], text: '', image: null, rarity: '' };
      }),
    [offer, augments],
  );
  const fits = useMemo(() => takenMatches(entries, taken), [entries, taken]);
  const entry = chosenEntry(entries, chosen, fits);
  const plan = planOf(view, entry);
  // The overlay over the game (overlay.rs): per offered card its tier for this build and the first
  // two items of the build it fits; Rust draws it only while those cards are on screen.
  useEffect(() => {
    if (sample || !offer?.open || !offer.augments.length) return;
    const cards = offer.augments.map((o) => {
      const a = augments.find((x) => x.id === o.id);
      const facts = a ? { name: a.name, cats: a.cats, text: a.text } : { ...o, cats: [], text: '' };
      const fit = fitFor(entries, entry, { ...facts, id: o.id });
      return {
        id: o.id,
        tier: plan?.augments.find((x) => x.id === o.id)?.tier ?? null,
        items: (fit?.items ?? []).slice(0, 2).map((i) => i.id),
      };
    });
    // arammeta's tiers are the champion's in every direction (cardOf), and a combo of no direction
    // takes another direction's tiers: then the header names the champion, not the build.
    const own =
      view.source !== 'arammeta' &&
      (entry?.kind === 'combo'
        ? plan?.direction === entry.combo.theme
        : !!plan && entry?.plan === plan);
    void tellOverlay(view.championId, own && entry ? entry.name : label, cards);
  }, [sample, offer, augments, entries, entry, plan, view.championId, view.source, label]);
  const skills = sample ? MOCK_SKILL_ORDER : skillOrderOf(view.championId);
  const hero = (
    <header
      className="mayhem-hero mayhem-card-hero mayhem-in"
      style={splash ? { ['--splash' as string]: `url("${splash}")` } : undefined}
    >
      <div className="mayhem-hero-glass">
        <h1>{label}</h1>
        <div className="mayhem-pills">
          <span className="mayhem-pill gold">
            {view.games ? games(view.games) : 'No games yet'}
          </span>
          <span className="mayhem-pill">{sourceLabel(view)}</span>
          {sample && <span className="mayhem-pill mock">Mock</span>}
        </div>
      </div>
      {onClose && (
        <button type="button" className="mayhem-button small" onClick={onClose}>
          Back
        </button>
      )}
    </header>
  );
  const facts = (
    <ForChampion
      extra={view.extra}
      champion={champion}
      label={label}
      skills={skills}
      abilities={view.abilities}
    />
  );
  return (
    <article className="mayhem-card">
      {hero}
      {offer && (offer.augments.length > 0 || taken.length > 0) && (
        <Guard name="Augment offer" fallback={() => null}>
          <OfferPanel
            offer={offer}
            plan={plan}
            augments={augments}
            taken={taken}
            label={label}
            onTake={onTake}
          />
        </Guard>
      )}
      <aside className="mayhem-card-side mayhem-in" style={step(1)}>
        {entry && (
          <BuildPicker
            entries={entries}
            entry={entry}
            fits={fits}
            label={label}
            known={base !== undefined}
            onChoose={onChoose}
          />
        )}
        <button
          type="button"
          className="mayhem-guide"
          onClick={() => void openGuide(view.championId)}
        >
          Guides and offmeta builds on aramonly.com
        </button>
      </aside>
      <section className="mayhem-card-main mayhem-in" style={step(2)}>
        {entry ? (
          <BuildDetail
            key={entry.key}
            entry={entry}
            view={view}
            plan={plan}
            label={label}
            sample={sample}
            // An offer means the game runs, even if the end of champ select was missed.
            selecting={selecting && !offer}
          >
            {facts}
          </BuildDetail>
        ) : (
          // No build yet: the augments and what is the same in every build still show.
          <div className="mayhem-build-detail">
            <p className="mayhem-note">Too few games for a build yet.</p>
            <BuildAugments entry={undefined} view={view} plan={plan} label={label} />
            {facts}
          </div>
        )}
      </section>
    </article>
  );
}

/**
 * The builds of the chosen build's tab (Meta, Offmeta at least as good as the champion's own win
 * rate, Troll below it; builds.ts). A tab chosen by hand holds while the same build stays chosen,
 * then the tab follows the build. Rows that fit a taken augment always show (never behind "more").
 */
function BuildPicker({
  entries,
  entry,
  fits,
  label,
  known,
  onChoose,
}: {
  entries: BuildEntry[];
  entry: BuildEntry;
  fits: Map<string, Took[]>;
  label: string;
  /** The champion's win rate is known (else no Troll, and Offmeta is not compared with it). */
  known: boolean;
  onChoose: (key: string) => void;
}) {
  const [tab, setTab] = useState<{ group: BuildGroup; at: string } | null>(null);
  const group = tab?.at === entry.key ? tab.group : entry.group;
  const tabs = GROUPS.filter((g) => entries.some((e) => e.group === g)).map((id) => ({
    id,
    label: GROUP_LABEL[id],
    // Fitting builds in another tab are not hidden behind it.
    mark: entries.some((e) => e.group === id && fits.has(e.key))
      ? 'A build here fits an augment you took'
      : undefined,
  }));
  const list = entries.filter((e) => e.group === group);
  // A combo or assembled build was never measured whole: only its parts were.
  const parts = list.some((e) => e.kind === 'combo' || e.kind === 'assembled')
    ? ' Builds put together are rated by their parts.'
    : '';
  const note =
    group === 'meta'
      ? `What ${label} players usually build.`
      : group === 'troll'
        ? `Less common and rated below ${label}'s average. For fun.${parts}`
        : known
          ? `Less common, rated at least ${label}'s average.${parts}`
          : 'Less common builds.';
  return (
    <section className="mayhem-section mayhem-build-pick">
      <Tabs
        tabs={tabs}
        value={group}
        onChange={(g) => setTab({ group: g, at: entry.key })}
        label="Builds"
      />
      <div role="tabpanel" aria-label={GROUP_LABEL[group]} className="mayhem-section">
        <p className="mayhem-note">{note}</p>
        <More
          key={group}
          list={list}
          className="mayhem-build-list"
          keep={(e) => e === entry || fits.has(e.key)}
          render={(e) => (
            <li key={e.key}>
              <BuildRow
                entry={e}
                chosen={e === entry}
                fits={fits.get(e.key)}
                onChoose={() => onChoose(e.key)}
              />
            </li>
          )}
        />
      </div>
    </section>
  );
}

/**
 * In the game: the augments offered now, left to right, with their tier for the chosen build (no
 * win rates, no advice; Riot's rules), a reroll replaces them; the ones taken so far below. A click
 * marks a card as taken when the app did not see it go (offers.rs), a second click undoes it.
 */
function OfferPanel({
  offer,
  plan,
  augments,
  taken,
  label,
  onTake,
}: {
  offer: Offer & { open?: boolean };
  plan: BuildPlan | undefined;
  augments: TierAugment[];
  taken: Took[];
  label: string;
  onTake: (id: number) => void;
}) {
  const cards = offer.augments.length > 0;
  // Closed, its cards stay: a click still marks the one taken when the app did not see it go.
  const open = cards && offer.open !== false;
  return (
    <section className="mayhem-offer-panel mayhem-in" aria-live="polite">
      <header>
        <h2>{open ? 'Augment offer' : 'This game'}</h2>
        {cards && (
          <span className="mayhem-note">
            {!open
              ? 'Last offer. Click the one you took if it is not marked.'
              : plan
                ? `Tiers for ${label}`
                : `No tiers yet: too few ${label} games`}
          </span>
        )}
      </header>
      {cards && (
        <ul className="mayhem-offer">
          {offer.augments.map((o) => {
            const row = plan?.augments.find((a) => a.id === o.id);
            const known = augments.find((a) => a.id === o.id);
            const name = row?.name ?? known?.name ?? o.name;
            const was = offer.taken.some((t) => t.id === o.id);
            const about = row
              ? `Tier ${row.tier} for ${label}${row.general ? ': too few games with it, from all games' : `, ${games(row.games)}`}`
              : `No ${label} games with it`;
            return (
              <li key={o.id}>
                <button
                  type="button"
                  aria-pressed={was}
                  title={`${name}\n${about}\n${was ? 'Taken. Click to undo.' : 'Click if you took it.'}`}
                  onClick={() => onTake(o.id)}
                >
                  <AugmentIcon
                    rarity={row?.rarity ?? known?.rarity ?? ''}
                    image={row?.image ?? known?.image ?? null}
                  />
                  <span className="mayhem-aug-name">{name}</span>
                  {was && <small>Taken</small>}
                  <span className="mayhem-aug-row-tier mayhem-offer-tier" data-tier={row?.tier}>
                    {row?.tier ?? '–'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {taken.length > 0 && (
        <p className="mayhem-offer-taken">
          <span>Taken</span> {taken.map((t) => t.name).join(', ')}
        </p>
      )}
    </section>
  );
}

/** One augment of the compact row: picture and tier letter; name and games in the tooltip. */
type Mini = {
  id: number;
  name: string;
  rarity: string;
  image: string | null;
  tier: Tier | null;
  title: string;
};

/** The direction whose tiers the augment row shows: the chosen build's; a combo of no direction and
 * a card without a chosen direction, the most played one. */
function planOf(view: ChampView, entry: BuildEntry | undefined): BuildPlan | undefined {
  if (entry?.kind === 'combo')
    return view.plans.find((p) => p.direction === entry.combo.theme) ?? view.plans[0];
  return entry?.plan ?? view.plans[0];
}

/** The augments of a direction with their tiers (no win rates on the row); without directions the
 * card's best augments, untiered. */
function minis(view: ChampView, plan: BuildPlan | undefined, label: string): Mini[] {
  if (plan)
    return plan.augments.map((a) => ({
      ...a,
      title: `${a.name}\n${a.general ? `Too few ${label} games: tier from its value over all games` : `${games(a.games)} with ${label}`}`,
    }));
  return view.augments.map((a) => ({ ...a, tier: null, title: `${a.name}\n${games(a.games)}` }));
}

/** Tier S as icons with their letter, the other tiers behind "+n" (user 09.10.2026: small). */
function AugmentRow({ augments }: { augments: Mini[] }) {
  const [all, setAll] = useState(false);
  const first = augments.filter((a) => a.tier === 'S' || a.tier === null);
  const rest = augments.length - first.length;
  return (
    <ul className="mayhem-aug-row">
      {(all ? augments : first).map((a) => (
        <li key={a.id} title={a.title} data-name={a.name}>
          <span
            className="mayhem-aug-icon"
            data-rarity={a.rarity}
            role="img"
            tabIndex={0}
            aria-label={`${a.tier ? `Tier ${a.tier}: ` : ''}${a.title.replace('\n', ', ')}`}
          >
            <AugmentPicture image={a.image} size={36} />
          </span>
          {a.tier && (
            <span className="mayhem-aug-row-tier" data-tier={a.tier} aria-hidden>
              {a.tier}
            </span>
          )}
        </li>
      ))}
      {rest > 0 && (
        <li>
          <button
            type="button"
            className="mayhem-aug-row-more"
            aria-expanded={all}
            aria-label={all ? 'Show tier S only' : `Show ${rest} more augments`}
            title={all ? 'Show tier S only' : 'Show all tiers'}
            onClick={() => setAll(!all)}
          >
            {all ? '−' : `+${rest}`}
          </button>
        </li>
      )}
    </ul>
  );
}

const Tag = ({ group }: { group: BuildGroup }) => (
  <span className="mayhem-combo-tag" data-meta={group === 'meta'} data-group={group}>
    {GROUP_LABEL[group]}
  </span>
);

/**
 * A row of the build list (like Blitz): name, its games, two core items; a win rate only when it was
 * measured. A build that fits an augment taken this game gets a ring and that augment's picture.
 */
function BuildRow({
  entry: e,
  chosen,
  fits,
  onChoose,
}: {
  entry: BuildEntry;
  chosen: boolean;
  fits: Took[] | undefined;
  onChoose: () => void;
}) {
  const fitNames = fits?.map((t) => t.name).join(', ');
  return (
    <button
      type="button"
      className="mayhem-build-row"
      aria-pressed={chosen}
      data-fits={!!fits || undefined}
      title={[
        e.name,
        e.winRate === null ? 'Put together, never measured as a whole' : winsIn(e.winRate, e.games),
        fitNames && `Fits what you took: ${fitNames}`,
      ]
        .filter(Boolean)
        .join('\n')}
      onClick={onChoose}
    >
      <span className="mayhem-build-row-name">
        <b>{e.name}</b>
        <small>
          {e.games !== null ? games(e.games) : e.kind === 'combo' ? 'Combo' : 'Put together'}
        </small>
      </span>
      {fits && (
        <span className="mayhem-build-row-fits" role="img" aria-label={`Fits ${fitNames}`}>
          {fits.slice(0, 2).map((t) => (
            <AugmentIcon key={t.id} rarity={t.rarity} image={t.image} />
          ))}
        </span>
      )}
      <span className="mayhem-items">
        {e.items.slice(0, 2).map((i) => (
          <img
            key={i.id}
            data-mana={i.mana || undefined}
            src={itemImage(i.id)}
            alt={i.name}
            width={26}
            height={26}
          />
        ))}
      </span>
      <span className="mayhem-facts">{e.winRate !== null && <b>{percent(e.winRate)}</b>}</span>
    </button>
  );
}

type Item = BuildEntry['items'][number];

/** An item's tooltip and, when it has numbers of its own on the champion, its win rate. */
function itemFacts(entry: BuildEntry, n: number, i: Item, label: string, later: boolean) {
  if (entry.kind === 'combo') {
    const own = entry.combo.items.find((c) => c.id === i.id);
    const known = own && own.games !== null && own.winRate !== null ? own : null;
    return {
      title: `${i.name}${i.mana ? MANA : ''}: ${known ? winsIn(known.winRate!, known.games!) : `no numbers on ${label}`}`,
      rate: known ? percent(known.winRate!) : '–',
    };
  }
  if (later)
    return {
      title: `${entry.kind === 'assembled' ? '' : 'Often later: '}${i.name}${i.mana ? MANA : ''}`,
      rate: null,
    };
  const own = entry.kind === 'assembled' ? entry.build.assembled?.[n] : undefined;
  return { title: itemTitle(entry.build, n, i, 'en'), rate: own ? percent(own.winRate) : null };
}

/**
 * The augments of the chosen build, where Blitz shows a build order: a combo's own augments, else
 * the champion's tiered augments for the build's direction, said to be the champion's.
 */
function BuildAugments({
  entry,
  view,
  plan,
  label,
}: {
  entry: BuildEntry | undefined;
  view: ChampView;
  plan: BuildPlan | undefined;
  label: string;
}) {
  if (entry?.kind === 'combo')
    return (
      <section className="mayhem-build-augs">
        <h3>Augments of this combo</h3>
        <ul className="mayhem-best">
          {entry.combo.augments.map((a) => (
            // No augment win rates here (Riot: products must not show win rates for Augments).
            <li key={a.id} title={`${a.name}: ${games(a.games)} with ${label}`}>
              <AugmentIcon rarity={a.rarity} image={a.image} />
              <span className="mayhem-aug-name">{a.name}</span>
              <span className="mayhem-facts">
                <span>{games(a.games)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  const row = minis(view, plan, label);
  if (!row.length) return null;
  return (
    <section className="mayhem-build-augs">
      <h3>Best augments for {label}</h3>
      <AugmentRow augments={row} />
      {plan && plan.source !== view.source && (
        <p className="mayhem-note">
          Few games on arammeta.com: from {games(plan.games)} on mayhemstats.lol.
        </p>
      )}
    </section>
  );
}

type PushState = 'idle' | 'saving' | 'done' | 'failed' | 'refused' | 'example';
/** Rust's answer when the set itself does not fit (`mayhem_item_set`), not the client. */
const NOT_A_SET = 'This build cannot be an item set.';

/** "Auto push" (user 10.10.2026): remembered on this PC; on, every build chosen in champ select
 * goes into the client by itself (items and spells), never in the game (nothing reacts to it). */
const AUTO_PUSH = 'mayhem.autoPush.v1';
const readAuto = () => {
  try {
    return localStorage.getItem(AUTO_PUSH) === '1';
  } catch {
    return false;
  }
};
const writeAuto = (on: boolean) => {
  try {
    localStorage.setItem(AUTO_PUSH, on ? '1' : '0');
  } catch {
    // Blocked storage: the switch lasts only this run.
  }
};
/** The build last pushed by itself, on which card: opening the page again does not repeat it, the
 * next champ select (a new view) does. */
let autoPushed: { view: ChampView; key: string } | null = null;
/** Auto push takes this build of this card once; false: done already. */
export const claimAutoPush = (view: ChampView, key: string) => {
  if (autoPushed?.view === view && autoPushed.key === key) return false;
  autoPushed = { view, key };
  return true;
};
const DAMAGE: Record<string, string> = { phys: 'Physical', magic: 'Magic', true: 'True' };

/**
 * The chosen build (right): its core big, later items, its augments, its win rate when measured
 * (else how it was put together), then what is the same in every build of the champion (children),
 * and "Push build" into the client's item sets ("Mayhem: <name>", on the click or by "Auto push" in
 * champ select).
 */
function BuildDetail({
  entry,
  view,
  plan,
  label,
  sample,
  selecting,
  children,
}: {
  entry: BuildEntry;
  view: ChampView;
  plan: BuildPlan | undefined;
  label: string;
  sample: boolean;
  selecting: boolean;
  children: ReactNode;
}) {
  const set = useMemo(() => itemSetFor(entry, view), [entry, view]);
  const [push, setPush] = useState<PushState>('idle');
  // The champion's best spell pair (shown below) goes with the build (user 10.10.2026: "muss alles
  // pushen auch summoners"); the client takes spells only in its champion select.
  const pair = view.extra?.spells[0]?.spells ?? [];
  /** The spells' outcome: short on the page, in full in the tooltip. */
  const [spells, setSpells] = useState<{ short: string; long: string }>({ short: '', long: '' });
  const [auto, setAuto] = useState(readAuto);
  const save = () => {
    if (sample) return setPush('example');
    setPush('saving');
    setSpells({ short: '', long: '' });
    void pushItemSet(view.championId, set).then((ok) => {
      // A failed push (client not ready) may go again the next time the build shows.
      if (ok !== true) autoPushed = null;
      setPush(ok === true ? 'done' : ok === NOT_A_SET ? 'refused' : 'failed');
    });
    if (pair.length === 2)
      void pushSpells(
        view.championId,
        pair.map((p) => p.id),
      ).then((ok) =>
        setSpells(
          ok === true
            ? { short: '', long: `Spells set: ${pair.map((p) => p.name).join(' + ')}.` }
            : ok === NOT_SELECTING
              ? { short: '', long: 'Spells are only set in champ select.' }
              : { short: 'Spells not set', long: 'Could not set the spells.' },
        ),
      );
  };
  // Auto push: each build once, when it is shown (the card picks or the user does) or the switch
  // goes on; only in champ select, never in the game or the preview.
  useEffect(() => {
    if (!auto || sample || !selecting || !claimAutoPush(view, entry.key)) return;
    save();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per build and switch, not on every render
  }, [auto]);
  const toggleAuto = (on: boolean) => {
    writeAuto(on);
    setAuto(on);
  };
  // Short on the page (user 10.10.2026: "nur saved"), the whole sentence in the tooltip.
  const said: Record<PushState, [string, string]> = {
    idle: ['', ''],
    saving: ['Saving …', ''],
    done: ['Saved', `Saved as "Mayhem: ${set.name}" in your item sets.`],
    failed: ['Not saved', 'Could not save the build. Is the League client open?'],
    refused: ['Not saved', 'This build does not fit into an item set.'],
    example: ['Mock', 'Mock: nothing is saved in the preview.'],
  };
  const theme = entry.kind === 'combo' ? themeOf(entry.combo.theme) : undefined;
  const line = theme && !theme.direction ? themeText(theme, 'en').line : null;
  const note = entry.kind === 'combo' ? comboNote(entry.combo, label, 'en') : null;
  const assembled = entry.kind === 'assembled' ? assembledFacts(entry.build, 'en') : null;
  return (
    <div className="mayhem-build-detail">
      <header className="mayhem-build-head">
        <div>
          <h2>
            {entry.name} <Tag group={entry.group} />
          </h2>
          {entry.winRate !== null ? (
            <p className="mayhem-build-rate" title={winsIn(entry.winRate, entry.games)}>
              <b>{percent(entry.winRate)}</b> win rate · {games(entry.games)}
            </p>
          ) : (
            line && <p className="mayhem-note">{line}</p>
          )}
        </div>
        {/* On top: reachable without scrolling. */}
        <div className="mayhem-build-push">
          <button
            type="button"
            className="mayhem-button primary"
            disabled={push === 'saving'}
            title="Saves this build as an item set in the League client and, in champ select, sets its summoner spells. Your own item sets stay."
            onClick={save}
          >
            Push build
          </button>
          <label
            className="mayhem-switch"
            title="In champ select, pushes every build you pick by itself. Remembered on this PC."
          >
            <input
              type="checkbox"
              role="switch"
              checked={auto}
              onChange={(e) => toggleAuto(e.target.checked)}
            />
            <span aria-hidden />
            Auto push
          </label>
          <p
            className="mayhem-note"
            role="status"
            title={[said[push][1], push === 'example' ? '' : spells.long].filter(Boolean).join(' ')}
          >
            {[said[push][0], push === 'example' ? '' : spells.short].filter(Boolean).join(' · ')}
          </p>
        </div>
      </header>
      {/* One compact row (user 10.10.2026, like other apps' "core build"): the core in buying
          order, then the later items; names and numbers in the tooltip. */}
      <div className="mayhem-build-items">
        <div>
          <span className="mayhem-build-label">Core</span>
          <ol className="mayhem-build-core">
            {entry.items.map((i, n) => {
              const facts = itemFacts(entry, n, i, label, false);
              return (
                <li key={i.id} title={facts.title}>
                  <img
                    data-mana={i.mana || undefined}
                    src={itemImage(i.id)}
                    alt={i.name}
                    width={40}
                    height={40}
                  />
                  {facts.rate && <small>{facts.rate}</small>}
                </li>
              );
            })}
          </ol>
        </div>
        {entry.later.length > 0 && (
          <div>
            <span className="mayhem-build-label">Later</span>
            <span className="mayhem-items">
              {entry.later.map((i, n) => (
                <img
                  key={i.id}
                  data-mana={i.mana || undefined}
                  src={itemImage(i.id)}
                  alt={i.name}
                  title={itemFacts(entry, n, i, label, true).title}
                  width={32}
                  height={32}
                />
              ))}
            </span>
          </div>
        )}
      </div>
      <BuildAugments entry={entry} view={view} plan={plan} label={label} />
      {entry.kind === 'combo' && (
        <p className="mayhem-note">{[note, COMBO_HONESTY_EN].filter(Boolean).join(' ')}</p>
      )}
      {assembled && (
        <p className="mayhem-note">
          Put together from single items, never measured as a whole: {assembled}.
        </p>
      )}
      {entry.kind === 'site' && (
        <p className="mayhem-note">From games on mayhemstats.lol: arammeta.com has few here.</p>
      )}
      {children}
    </div>
  );
}

const SLOT: Record<SkillKey, 0 | 1 | 2> = { Q: 0, W: 1, E: 2 };

/** Which ability most players max first, second, third (aramkit.com, src/features/aram/
 * skillOrders.ts): three icons, the share of players; the win rate only in the tooltip. */
function MaxOrder({
  skills,
  abilities,
}: {
  skills: SkillOrders;
  abilities: [string, string, string] | undefined;
}) {
  const top = skills.orders[0];
  if (!top) return null;
  const keys = top.order.split('>') as SkillKey[];
  return (
    <div
      title={`Max ${keys.join(' > ')}: ${percent(top.pick)} of players, ${percent(top.win)} wins\nSkill order: aramkit.com, ARAM Mayhem ${skills.patch} (data of ${skills.date})`}
    >
      <dt>Max</dt>
      <dd>
        <span className="mayhem-max" role="img" aria-label={`Max ${keys.join(', then ')}`}>
          {keys.map((k, n) => (
            <Fragment key={k}>
              {n > 0 && <span aria-hidden>›</span>}
              <span className="mayhem-max-key">
                {abilities && (
                  <img src={spellImage(abilities[SLOT[k]])} alt="" width={26} height={26} />
                )}
                <b>{k}</b>
              </span>
            </Fragment>
          ))}
        </span>
        <span className="mayhem-aug-name">{percent(top.pick)} of players</span>
        <small className="mayhem-max-source">Skill order: aramkit.com ({skills.patch})</small>
      </dd>
    </div>
  );
}

/** What is the same in every build: summoner spells, max order, best boots, the damage split
 * (clearly the champion's, not the build's). */
function ForChampion({
  extra,
  champion,
  label,
  skills,
  abilities,
}: {
  extra: ChampExtra | undefined;
  champion: TierChampion | null;
  label: string;
  skills: SkillOrders | undefined;
  abilities: [string, string, string] | undefined;
}) {
  const boots = extra?.boots[0];
  const spells = extra?.spells[0];
  const damage = champion ? teamProfile(champion, []).damage : [];
  if (!boots && !spells && !skills?.orders.length && !damage.length) return null;
  const names = spells?.spells.map((s) => spellName(s.id, 'en') ?? s.name) ?? [];
  return (
    <section className="mayhem-build-for">
      <h3>For {label}</h3>
      <dl>
        {spells && (
          <div title={picked(spells)}>
            <dt>Spells</dt>
            <dd>
              <span className="mayhem-items">
                {spells.spells.map((s) => (
                  <img key={s.id} src={spellImage(s.key)} alt="" width={26} height={26} />
                ))}
              </span>
              <span className="mayhem-aug-name">{names.join(' + ')}</span>
              <span className="mayhem-facts">
                <b>{percent(spells.winRate)}</b>
                <span>{games(spells.games)}</span>
              </span>
            </dd>
          </div>
        )}
        {skills && <MaxOrder skills={skills} abilities={abilities} />}
        {boots && (
          <div title={picked(boots)}>
            <dt>Boots</dt>
            <dd>
              <span className="mayhem-items">
                {boots.items.map((i) => (
                  <img key={i.id} src={itemImage(i.id)} alt="" width={26} height={26} />
                ))}
              </span>
              <span className="mayhem-aug-name">{boots.items.map((i) => i.name).join(' + ')}</span>
              <span className="mayhem-facts">
                <b>{percent(boots.winRate)}</b>
                <span>{games(boots.games)}</span>
              </span>
            </dd>
          </div>
        )}
        {damage.length > 0 && (
          <div>
            <dt>Damage</dt>
            <dd className="mayhem-build-damage">
              <span className="mayhem-mix" aria-hidden>
                {damage.map((d) => (
                  <span key={d.key} data-key={d.key} style={{ flexGrow: d.share }} />
                ))}
              </span>
              <span className="mayhem-mix-legend">
                {damage.map((d) => (
                  <span key={d.key} data-key={d.key} title={`${number(d.value)} per minute`}>
                    {DAMAGE[d.key]} {percent(d.share)}
                  </span>
                ))}
              </span>
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
