import { useState, type CSSProperties } from 'react';
import { championSplash } from '../adapters/aram';
import { openGuide } from '../adapters/aramChamp';
import { DDRAGON_VERSION } from '../data/proStreamers';
import {
  assembledFacts,
  DIRECTION_LABEL,
  isOffmeta,
  itemTitle,
  planNote,
  slotsText,
  sourceLabel,
  spellName,
  TIERS,
  type AugTypePick,
  type BuildPick,
  type ChampExtra,
  type ChampView,
  type MetaItemPick,
  type TieredAugment,
} from '../features/aram/champCard';
import {
  COMBO_HONESTY_EN,
  comboNote,
  themeOf,
  themeText,
  type Combo,
} from '../features/aram/combos';
import { games, number, percent, winsIn } from './format';
import { FIRST, More, Tabs, Top } from './ui';

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

/** The item cores: one win rate and the games per row, the best marked. */
function Builds({ builds }: { builds: BuildPick[] }) {
  return (
    <ul className="mayhem-builds">
      {builds.map((b, n) => (
        <li
          key={b.items.map((i) => i.id).join(',')}
          className="mayhem-in"
          style={step(n + 2)}
          title={[b.label, b.mana > 0 ? 'Has mana items, weak in ARAM' : null]
            .filter(Boolean)
            .join('\n')}
        >
          <span className="mayhem-items">
            {b.items.map((i, n) => (
              <img
                key={i.id}
                data-mana={i.mana || undefined}
                src={itemImage(i.id)}
                alt={i.name}
                title={itemTitle(b, n, i, 'en')}
                width={34}
                height={34}
              />
            ))}
            {b.later?.map((i) => (
              <img
                key={i.id}
                className="later"
                src={itemImage(i.id)}
                alt={i.name}
                title={`Often later: ${i.name}${i.mana ? MANA : ''}`}
                width={24}
                height={24}
              />
            ))}
          </span>
          {/* The best core is lit in gold (mayhem.css, first row): no room for "Top" here. */}
          <span className="mayhem-facts">
            <b>{percent(b.winRate)}</b>
            {b.assembled ? (
              <span title={assembledFacts(b, 'en') ?? undefined}>avg of items</span>
            ) : (
              <span>{games(b.games)}</span>
            )}
          </span>
          {b.grade && (
            <span className="mayhem-grade" data-grade={b.grade.toLowerCase()} title="Avg grade">
              {b.grade}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

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
              {shown.map(({ c, i }) => {
                const t = themeOf(c.theme);
                return (
                  <button
                    key={c.theme}
                    type="button"
                    aria-pressed={c === combo}
                    onClick={() => setChosen(i)}
                  >
                    {t ? themeText(t, 'en').name : c.theme}
                  </button>
                );
              })}
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
          {theme?.name ?? combo.theme} {tag(combo.meta)}
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

/**
 * Every augment of the direction, grouped by tier S–D (the game offers three; look them up): tier
 * S first, the other tiers behind "Show all tiers".
 */
function TierList({ augments, label }: { augments: TieredAugment[]; label: string }) {
  const [all, setAll] = useState(false);
  const rest = augments.filter((a) => a.tier !== 'S').length;
  let n = 4;
  return (
    <>
      <div className="mayhem-tiers">
        {TIERS.map((tier) => {
          const list = augments.filter((a) => a.tier === tier);
          if (!list.length || (!all && tier !== 'S')) return null;
          return (
            <section key={tier} className="mayhem-tier" data-tier={tier}>
              <span className="mayhem-tier-letter" aria-label={`Tier ${tier}`}>
                {tier}
              </span>
              <ul>
                {list.map((a) => (
                  <li
                    key={a.id}
                    className="mayhem-in"
                    style={step(n++)}
                    title={
                      a.general
                        ? `Too few ${label} games: tier from its value over all games`
                        : `${games(a.games)} with ${label}`
                    }
                  >
                    <AugmentIcon rarity={a.rarity} image={a.image} />
                    <span className="mayhem-aug-name">{a.name}</span>
                    <span className="mayhem-facts">
                      {a.turns && (
                        <span className="turns">Turns you {DIRECTION_LABEL[a.turns]}</span>
                      )}
                      <span>{a.general ? 'general' : games(a.games)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {rest > 0 && (
        <button
          type="button"
          className="mayhem-more"
          aria-expanded={all}
          onClick={() => setAll(!all)}
        >
          {all ? 'Show tier S only' : `Show all tiers (${rest} more)`}
        </button>
      )}
    </>
  );
}

type ExtraTab = 'combos' | 'items' | 'boots' | 'kinds' | 'avoid';

/**
 * Everything else arammeta has on the champion, one question per tab: combos, items, boots and
 * spells, augment kinds, what to avoid.
 */
function ChampMore({ view, label }: { view: ChampView; label: string }) {
  const x = view.extra;
  const tabs = (
    [
      { id: 'combos', label: 'Combos', has: !!view.combos?.length },
      { id: 'items', label: 'Items', has: !!(x?.items.length || x?.pairs.length) },
      { id: 'boots', label: 'Boots & spells', has: !!(x?.boots.length || x?.spells.length) },
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
      <Tabs tabs={[...tabs]} value={tab} onChange={setChosen} label={`More on ${label}`} />
      <div role="tabpanel" aria-label={tabs.find((t) => t.id === tab)?.label}>
        {tab === 'combos' && view.combos && <ComboSection combos={view.combos} champion={label} />}
        {tab === 'items' && x && <ExtraItems extra={x} />}
        {tab === 'boots' && x && <BootsAndSpells extra={x} />}
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

function BootsAndSpells({ extra }: { extra: ChampExtra }) {
  return (
    <div className="mayhem-panel">
      {extra.boots.length > 0 && (
        <div className="mayhem-section">
          <h3>Boots</h3>
          <ItemRows rows={extra.boots} />
        </div>
      )}
      {extra.spells.length > 0 && (
        <div className="mayhem-section">
          <h3>Summoner spells</h3>
          <More
            list={extra.spells}
            className="mayhem-best"
            render={(s, n) => {
              const names = s.spells.map((x) => spellName(x.id, 'en') ?? x.name);
              return (
                <li key={s.spells.map((x) => x.id).join('+')} title={picked(s)} data-top={n === 0}>
                  <span className="mayhem-items">
                    {s.spells.map((x, i) => (
                      <img
                        key={x.id}
                        src={spellImage(x.key)}
                        alt={names[i]}
                        width={30}
                        height={30}
                      />
                    ))}
                  </span>
                  <span className="mayhem-aug-name">{names.join(' + ')}</span>
                  {n === 0 && <Top />}
                  <span className="mayhem-facts">
                    <b>{percent(s.winRate)}</b>
                    <span>{games(s.games)}</span>
                  </span>
                </li>
              );
            }}
          />
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
 * The Champ-Karte in the Mayhem app. Its question: what do I build on this champion? On top the
 * answer: the build directions (the most played preselected), the item core and the tier S
 * augments of that direction; everything else behind "Show all tiers" and the tabs below. Always
 * several choices with their numbers. Without enough games per direction: the best augments and
 * builds.
 */
export function MayhemCard({
  view,
  sample,
  onClose,
}: {
  view: ChampView;
  sample: boolean;
  onClose?: () => void;
}) {
  const label = view.name || view.alias || `Champion ${view.championId}`;
  const splash = championSplash(view.alias);
  const plans = view.plans;
  const [chosen, setChosen] = useState(plans[0]?.direction);
  const plan = plans.find((p) => p.direction === chosen) ?? plans[0];
  const note = plan ? planNote(view, plan, 'en') : null;
  const hero = (
    <header
      className="mayhem-hero mayhem-in"
      style={splash ? { ['--splash' as string]: `url("${splash}")` } : undefined}
    >
      <div className="mayhem-hero-glass">
        <h1>{label}</h1>
        <div className="mayhem-pills">
          <span className="mayhem-pill gold">
            {view.games ? games(view.games) : 'No games yet'}
          </span>
          <span className="mayhem-pill">{sourceLabel(view)}</span>
          {sample && <span className="mayhem-pill">Example</span>}
        </div>
      </div>
      {onClose && (
        <button type="button" className="mayhem-button small" onClick={onClose}>
          Back
        </button>
      )}
    </header>
  );
  if (plan)
    return (
      <article className="mayhem-card">
        <div className="mayhem-card-side">
          {hero}
          <div
            className="mayhem-directions mayhem-in"
            style={step(1)}
            role="group"
            aria-label="Build direction"
          >
            {plans.map((p) => (
              <button
                key={p.direction}
                type="button"
                aria-pressed={p.direction === plan.direction}
                title={`${DIRECTION_LABEL[p.direction]}: ${number(p.games)} games`}
                onClick={() => setChosen(p.direction)}
              >
                {DIRECTION_LABEL[p.direction]}
                <small>{isOffmeta(p) && !p.share ? 'Offmeta' : percent(p.share)}</small>
              </button>
            ))}
          </div>
          {note && <p className="mayhem-note">{note}</p>}
          <section className="mayhem-section">
            <h2>Item core</h2>
            {plan.builds.length ? (
              <Builds builds={plan.builds} />
            ) : (
              <p className="mayhem-note">Too few games for a core yet.</p>
            )}
            <button
              type="button"
              className="mayhem-guide"
              onClick={() => void openGuide(view.championId)}
            >
              Guides and offmeta builds on aramonly.com
            </button>
          </section>
        </div>
        <section className="mayhem-section mayhem-card-main">
          <h2>Augments for {DIRECTION_LABEL[plan.direction]}</h2>
          <TierList
            key={plan.direction}
            augments={plan.augments}
            label={DIRECTION_LABEL[plan.direction]}
          />
        </section>
        <ChampMore view={view} label={label} />
      </article>
    );
  return (
    <article className="mayhem-card">
      <div className="mayhem-card-side">
        {hero}
        {view.builds.length > 0 && (
          <section className="mayhem-section">
            <h2>Builds</h2>
            <Builds builds={view.builds} />
          </section>
        )}
      </div>
      <div className="mayhem-card-main">
        {view.augments.length > 0 ? (
          <section className="mayhem-section">
            <h2>Best augments</h2>
            <ul className="mayhem-best">
              {view.augments.map((a, n) => (
                <li key={a.id} className="mayhem-in" style={step(n + 2)} data-top={n === 0}>
                  <AugmentIcon rarity={a.rarity} image={a.image} />
                  <span className="mayhem-aug-name">{a.name}</span>
                  {n === 0 && <Top />}
                  <span className="mayhem-facts">
                    <b>{a.winRate === null ? '–' : percent(a.winRate)}</b>
                    <span>{games(a.games)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          !view.builds.length && (
            <p className="mayhem-note">Too few games for augments and builds yet.</p>
          )
        )}
      </div>
    </article>
  );
}
