import { useMemo, useState, type CSSProperties } from 'react';
import { championSplash } from '../adapters/aram';
import { openGuide, pushItemSet } from '../adapters/aramChamp';
import { DDRAGON_VERSION } from '../data/proStreamers';
import {
  assembledFacts,
  itemTitle,
  slotsText,
  sourceLabel,
  spellName,
  type AugTypePick,
  type ChampExtra,
  type BuildPlan,
  type ChampView,
  type MetaItemPick,
  type Tier,
} from '../features/aram/champCard';
import {
  COMBO_HONESTY_EN,
  comboNote,
  themeOf,
  themeText,
  type Combo,
} from '../features/aram/combos';
import { buildList, comboName, itemSetFor, type BuildEntry } from './builds';
import { games, number, percent, winsIn } from './format';
import { teamProfile, type TierChampion } from './tiers';
import { FIRST, More, Tabs } from './ui';

export const itemImage = (id: number) =>
  `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/item/${id}.png`;
/** Staggers a row's soft entrance (mayhem.css, .mayhem-in). */
const step = (i: number) => ({ ['--i' as string]: Math.min(i, 16) }) as CSSProperties;

/** The augment's rarity as the frame of its picture (silver, gold, prismatic like in the game). */
function AugmentIcon({ rarity, image }: { rarity: string; image: string | null }) {
  return (
    <span className="mayhem-aug-icon" data-rarity={rarity}>
      {image && <img src={image} alt="" width={32} height={32} />}
    </span>
  );
}

const MANA = ' (mana, weak in ARAM)';
/** Win rate and games on the row; the pick rate only in its tooltip. */
const picked = (p: { games: number; winRate: number; pick: number | null }) =>
  `${winsIn(p.winRate, p.games)}${p.pick !== null ? `\nPicked in ${percent(p.pick)} of games` : ''}`;

const spellImage = (key: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/spell/${key}.png`;

/** Items (one or two per row) with win rate and games; five first, the best marked. */
function ItemRows({ rows, weak = false }: { rows: MetaItemPick[]; weak?: boolean }) {
  return (
    <More
      list={rows}
      className={`mayhem-grid${weak ? ' weak' : ''}`}
      render={(r, n) => (
        <li key={r.items.map((i) => i.id).join('+')} title={picked(r)} data-top={!weak && n === 0}>
          <span className="mayhem-items">
            {r.items.map((i) => (
              <img
                key={i.id}
                data-mana={i.mana || undefined}
                src={itemImage(i.id)}
                alt={i.name}
                title={i.mana ? `${i.name}${MANA}` : i.name}
                width={30}
                height={30}
              />
            ))}
          </span>
          <span className="mayhem-facts">
            <b>{percent(r.winRate)}</b>
            <span>{games(r.games)}</span>
          </span>
        </li>
      )}
    />
  );
}

function TypeChips({ rows, weak = false }: { rows: AugTypePick[]; weak?: boolean }) {
  return (
    <ul className={`mayhem-chips${weak ? ' weak' : ''}`}>
      {rows.map((t) => (
        <li key={t.name} title={picked(t)}>
          {t.name} <b>{percent(t.winRate)}</b>
        </li>
      ))}
    </ul>
  );
}

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

type ExtraTab = 'items' | 'kinds' | 'avoid';

/**
 * Everything else arammeta has on the champion, one question per tab: items, augment kinds, what
 * to avoid (combos, boots and spells are in the build list and its details now).
 */
function ChampMore({ view, label }: { view: ChampView; label: string }) {
  const x = view.extra;
  const tabs = (
    [
      { id: 'items', label: 'Items', has: !!(x?.items.length || x?.pairs.length) },
      { id: 'kinds', label: 'Augment kinds', has: !!(x?.augTypes.length || x?.weakTypes.length) },
      { id: 'avoid', label: 'Avoid', has: !!(x?.weak.length || x?.avoid.length) },
    ] as const
  ).filter((t) => t.has);
  const [chosen, setChosen] = useState<ExtraTab | null>(null);
  const tab = tabs.find((t) => t.id === chosen)?.id ?? tabs[0]?.id;
  if (!tab) return null;
  return (
    <section className="mayhem-section mayhem-card-more mayhem-in" style={step(6)}>
      <h2>More on {label}</h2>
      {tabs.length > 1 && (
        <Tabs tabs={[...tabs]} value={tab} onChange={setChosen} label={`More on ${label}`} />
      )}
      <div role="tabpanel" aria-label={tabs.find((t) => t.id === tab)?.label}>
        {tab === 'items' && x && <ExtraItems extra={x} />}
        {tab === 'kinds' && x && <Kinds extra={x} />}
        {tab === 'avoid' && x && <Avoid extra={x} />}
      </div>
    </section>
  );
}

function ExtraItems({ extra }: { extra: ChampExtra }) {
  return (
    <div className="mayhem-panel">
      {extra.items.length > 0 && (
        <div className="mayhem-section">
          <h3>Best items</h3>
          <ItemRows rows={extra.items} />
        </div>
      )}
      {extra.pairs.length > 0 && (
        <div className="mayhem-section">
          <h3>Strong together</h3>
          <ItemRows rows={extra.pairs} />
        </div>
      )}
    </div>
  );
}

function Kinds({ extra }: { extra: ChampExtra }) {
  return (
    <div className="mayhem-panel">
      {extra.augTypes.length > 0 && (
        <div className="mayhem-section">
          <h3>Strong kinds</h3>
          <TypeChips rows={extra.augTypes} />
        </div>
      )}
      {extra.weakTypes.length > 0 && (
        <div className="mayhem-section">
          <h3>Weaker kinds</h3>
          <TypeChips rows={extra.weakTypes} weak />
        </div>
      )}
    </div>
  );
}

function Avoid({ extra }: { extra: ChampExtra }) {
  return (
    <div className="mayhem-panel">
      {extra.weak.length > 0 && (
        <div className="mayhem-section">
          <h3>Popular but weak</h3>
          <ItemRows rows={extra.weak} weak />
        </div>
      )}
      {extra.avoid.length > 0 && (
        <div className="mayhem-section">
          <h3>Weakest augments</h3>
          <More
            list={extra.avoid}
            className="mayhem-best"
            render={(a) => (
              <li
                key={a.id}
                title={[winsIn(a.winRate, a.games), slotsText(a.slots, 'en')]
                  .filter(Boolean)
                  .join('\n')}
              >
                <AugmentIcon rarity={a.rarity} image={a.image} />
                <span className="mayhem-aug-name">{a.name}</span>
                <span className="mayhem-facts">
                  <b className="down">{percent(a.winRate)}</b>
                  <span>{games(a.games)}</span>
                </span>
              </li>
            )}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The Champ-Karte in the Mayhem app. Its question: what do I build on this champion? The champion
 * as a banner, then the chosen build's details on the left and on the right the tier S augments as
 * small icons and one list of builds to choose from (builds.ts: meta first, then offmeta, the good
 * ones first; user 09.10.2026), "Push build" writes the chosen one into the client. No build
 * directions (user 09.10.2026: "AP AD Tank ganz entfernen"). Everything else in the tabs below.
 */
export function MayhemCard({
  view,
  sample,
  champion,
  onClose,
}: {
  view: ChampView;
  sample: boolean;
  /** The champion in arammeta's champion list (its damage split), null when not there. */
  champion: TierChampion | null;
  onClose?: () => void;
}) {
  const label = view.name || view.alias || `Champion ${view.championId}`;
  const splash = championSplash(view.alias);
  const base = champion?.winRate;
  const entries = useMemo(() => buildList(view, base), [view, base]);
  // Nothing chosen yet: the first build.
  const [chosen, setChosen] = useState<string | null>(null);
  const entry = entries.find((e) => e.key === chosen) ?? entries[0];
  const plan = planOf(view, entry);
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
  const guide = (
    <button type="button" className="mayhem-guide" onClick={() => void openGuide(view.championId)}>
      Guides and offmeta builds on aramonly.com
    </button>
  );
  const augments = minis(view, plan, label);
  return (
    <article className="mayhem-card">
      {hero}
      <section className="mayhem-card-main mayhem-in" style={step(1)}>
        {entry ? (
          <BuildDetail
            key={entry.key}
            entry={entry}
            view={view}
            champion={champion}
            label={label}
            sample={sample}
          />
        ) : (
          <p className="mayhem-note">
            {augments.length
              ? 'Too few games for a build yet.'
              : 'Too few games for augments and builds yet.'}
          </p>
        )}
      </section>
      <aside className="mayhem-card-side mayhem-in" style={step(2)}>
        {augments.length > 0 && (
          <section className="mayhem-section">
            <h2>Best augments</h2>
            <AugmentRow augments={augments} />
            {plan && plan.source !== view.source && (
              <p className="mayhem-note">
                Few games on arammeta.com: from {games(plan.games)} on mayhemstats.lol.
              </p>
            )}
          </section>
        )}
        {entries.length > 0 && (
          <section className="mayhem-section">
            <h2>Builds</h2>
            <More
              list={entries}
              className="mayhem-build-list"
              keep={(e) => e === entry}
              render={(e) => (
                <li key={e.key}>
                  <BuildRow entry={e} chosen={e === entry} onChoose={() => setChosen(e.key)} />
                </li>
              )}
            />
          </section>
        )}
        {guide}
      </aside>
      <ChampMore view={view} label={label} />
    </article>
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

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2);

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
            {a.image ? (
              <img src={a.image} alt="" width={36} height={36} />
            ) : (
              <span aria-hidden>{initials(a.name)}</span>
            )}
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

const Tag = ({ meta }: { meta: boolean }) => (
  <span className="mayhem-combo-tag" data-meta={meta}>
    {meta ? 'Meta' : 'Offmeta'}
  </span>
);

/** A row of the build list: name, Meta/Offmeta, the core; a win rate only when it was measured. */
function BuildRow({
  entry: e,
  chosen,
  onChoose,
}: {
  entry: BuildEntry;
  chosen: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      className="mayhem-build-row"
      aria-pressed={chosen}
      title={`${e.name}\n${e.winRate === null ? 'Put together, never measured as a whole' : winsIn(e.winRate, e.games)}`}
      onClick={onChoose}
    >
      <span className="mayhem-build-row-name">
        <b>{e.name}</b>
        <Tag meta={e.meta} />
      </span>
      <span className="mayhem-items">
        {e.items.map((i) => (
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
      {e.winRate !== null && (
        <span className="mayhem-facts">
          <b>{percent(e.winRate)}</b>
        </span>
      )}
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

type PushState = 'idle' | 'saving' | 'done' | 'failed' | 'refused' | 'example';
/** Rust's answer when the set itself does not fit (`mayhem_item_set`), not the client. */
const NOT_A_SET = 'This build cannot be an item set.';
const DAMAGE: Record<string, string> = { phys: 'Physical', magic: 'Magic', true: 'True' };

/**
 * The chosen build (left): its core big, later items, a combo's augments, what is the same in every
 * build of the champion, its win rate when measured (else how it was put together) and "Push build"
 * into the client's item sets ("Mayhem: <name>", only on the click).
 */
function BuildDetail({
  entry,
  view,
  champion,
  label,
  sample,
}: {
  entry: BuildEntry;
  view: ChampView;
  champion: TierChampion | null;
  label: string;
  sample: boolean;
}) {
  const set = useMemo(() => itemSetFor(entry, view), [entry, view]);
  const [push, setPush] = useState<PushState>('idle');
  const save = () => {
    if (sample) return setPush('example');
    setPush('saving');
    void pushItemSet(view.championId, set).then((ok) =>
      setPush(ok === true ? 'done' : ok === NOT_A_SET ? 'refused' : 'failed'),
    );
  };
  const said: Record<PushState, string> = {
    idle: '',
    saving: 'Saving …',
    done: `Saved as "Mayhem: ${set.name}" in your item sets.`,
    failed: 'Could not save the build. Is the League client open?',
    refused: 'This build does not fit into an item set.',
    example: 'Mock: nothing is saved in the preview.',
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
            {entry.name} <Tag meta={entry.meta} />
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
            title="Saves this build as an item set in the League client. Your own item sets stay."
            onClick={save}
          >
            Push build
          </button>
          <p className="mayhem-note" role="status">
            {said[push]}
          </p>
        </div>
      </header>
      <ul className="mayhem-build-core">
        {entry.items.map((i, n) => {
          const facts = itemFacts(entry, n, i, label, false);
          return (
            <li key={i.id} title={facts.title}>
              <img
                data-mana={i.mana || undefined}
                src={itemImage(i.id)}
                alt=""
                width={48}
                height={48}
              />
              <span>{i.name}</span>
              {facts.rate && <small>{facts.rate}</small>}
            </li>
          );
        })}
      </ul>
      {entry.later.length > 0 && (
        <div className="mayhem-build-later">
          <span>Later</span>
          <span className="mayhem-items">
            {entry.later.map((i, n) => (
              <img
                key={i.id}
                data-mana={i.mana || undefined}
                src={itemImage(i.id)}
                alt={i.name}
                title={itemFacts(entry, n, i, label, true).title}
                width={30}
                height={30}
              />
            ))}
          </span>
        </div>
      )}
      {entry.kind === 'combo' && (
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
      )}
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
      <ForChampion extra={view.extra} champion={champion} label={label} />
    </div>
  );
}

/** What is the same in every build: best boots, summoner spells, the damage split (clearly the
 * champion's, not the build's). */
function ForChampion({
  extra,
  champion,
  label,
}: {
  extra: ChampExtra | undefined;
  champion: TierChampion | null;
  label: string;
}) {
  const boots = extra?.boots[0];
  const spells = extra?.spells[0];
  const damage = champion ? teamProfile(champion, []).damage : [];
  if (!boots && !spells && !damage.length) return null;
  const names = spells?.spells.map((s) => spellName(s.id, 'en') ?? s.name) ?? [];
  return (
    <section className="mayhem-build-for">
      <h3>For {label}</h3>
      <dl>
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
              </span>
            </dd>
          </div>
        )}
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
