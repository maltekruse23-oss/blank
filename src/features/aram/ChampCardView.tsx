import { championSquare } from '../../adapters/aram';
import { chooseBuild, markTaken, openGuide } from '../../adapters/aramChamp';
import { DDRAGON_VERSION } from '../../data/proStreamers';
import { useState } from 'react';
import {
  assembledFacts,
  DIRECTION_LABEL,
  isOffmeta,
  itemTitle,
  itemSetOf,
  offerRows,
  planNote,
  PLAN_AUGMENTS_SHOWN,
  slotsText,
  sourceLabel,
  type AugTypePick,
  type BuildPick,
  type ChampExtra,
  type ChampView,
  type MetaItemPick,
  type Tier,
} from './champCard';
import { percent } from './format';
import { GradeBadge } from './GradeBadge';

const itemImage = (id: number) =>
  `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/item/${id}.png`;

const games = (n: number) => `${n} ${n === 1 ? 'Spiel' : 'Spiele'}`;

function TierLetter({ tier, title }: { tier: Tier; title: string }) {
  return (
    <span className={`champ-tier tier-${tier}`} title={title} aria-label={`Stufe ${tier}`}>
      {tier}
    </span>
  );
}

function Builds({ builds }: { builds: BuildPick[] }) {
  return (
    <ul className="champ-card-list">
      {builds.map((b) => (
        <li key={b.items.map((i) => i.id).join(',')}>
          <span className="champ-card-items">
            {b.items.map((i, n) => (
              <img
                key={i.id}
                className={i.mana ? 'mana' : undefined}
                src={itemImage(i.id)}
                alt={i.name}
                title={itemTitle(b, n, i)}
                width={26}
                height={26}
              />
            ))}
          </span>
          <small>
            {assembledFacts(b) ?? `${games(b.games)} · ${percent(b.winRate)} Siege`}
            {b.mana > 0 && ' · Mana'}
          </small>
          {b.grade && <GradeBadge grade={b.grade} title={`Note Ø ${b.grade}`} />}
        </li>
      ))}
    </ul>
  );
}

const spellImage = (key: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/spell/${key}.png`;

const facts = (p: { games: number; winRate: number; pick?: number | null }) =>
  `${games(p.games)} · ${percent(p.winRate)} Siege${p.pick != null ? ` · ${percent(p.pick)} gewählt` : ''}`;

/** Items as small pictures with their win rate and games below (several choices with numbers). */
function ItemGrid({ rows, weak = false }: { rows: MetaItemPick[]; weak?: boolean }) {
  return (
    <ul className={`champ-card-grid${weak ? ' weak' : ''}`}>
      {rows.map((r) => {
        const i = r.items[0];
        return (
          <li
            key={i.id}
            title={`${i.name}${i.mana ? ' (Mana, in ARAM schwach)' : ''}: ${facts(r)}`}
          >
            <span className="champ-card-items">
              <img
                className={i.mana ? 'mana' : undefined}
                src={itemImage(i.id)}
                alt={i.name}
                width={26}
                height={26}
              />
            </span>
            <b>{percent(r.winRate)}</b>
            <small>{r.games.toLocaleString('de-DE')}</small>
          </li>
        );
      })}
    </ul>
  );
}

type Tab = 'augments' | 'items' | 'spells' | 'avoid';
/** Weakest augments shown per rarity in the popout (the Mayhem app shows all the card has). */
const AVOID_IN_POPOUT = 2;
const PAIRS_IN_POPOUT = 4;

/** arammeta's further numbers on the champion (08.10.2026): boots, items, spells, what to avoid. */
function Extra({ extra, tab }: { extra: ChampExtra; tab: Exclude<Tab, 'augments'> }) {
  if (tab === 'spells')
    return (
      <ul className="champ-card-list">
        {extra.spells.map((s) => (
          <li key={s.spells.map((x) => x.id).join('+')} title={facts(s)}>
            <span className="champ-card-items">
              {s.spells.map((x) => (
                <img key={x.id} src={spellImage(x.key)} alt="" width={24} height={24} />
              ))}
            </span>
            <span className="champ-card-name">{s.spells.map((x) => x.name).join(' + ')}</span>
            <small>
              {games(s.games)} · {percent(s.winRate)}
            </small>
          </li>
        ))}
      </ul>
    );
  if (tab === 'avoid') {
    const shown = extra.avoid.filter(
      (a, i, all) => all.slice(0, i).filter((b) => b.rarity === a.rarity).length < AVOID_IN_POPOUT,
    );
    return (
      <>
        {extra.augTypes.length > 0 && (
          <section>
            <h3>Passende Augment-Arten</h3>
            <TypeChips rows={extra.augTypes} />
          </section>
        )}
        {extra.weakTypes.length > 0 && (
          <section>
            <h3>Schwächere Arten</h3>
            <TypeChips rows={extra.weakTypes} weak />
          </section>
        )}
        {shown.length > 0 && (
          <section>
            <h3>Schwächste Augments</h3>
            <ul className="champ-card-list">
              {shown.map((a) => (
                <li key={a.id} title={slotsText(a.slots)}>
                  <span className={`champ-card-augment ${a.rarity}`}>
                    {a.image && <img src={a.image} alt="" width={24} height={24} />}
                  </span>
                  <span className="champ-card-name">{a.name}</span>
                  <small>
                    {games(a.games)} · {percent(a.winRate)}
                  </small>
                </li>
              ))}
            </ul>
          </section>
        )}
      </>
    );
  }
  return (
    <>
      {extra.boots.length > 0 && (
        <section>
          <h3>Stiefel</h3>
          <ItemGrid rows={extra.boots} />
        </section>
      )}
      {extra.items.length > 0 && (
        <section>
          <h3>Einzelne Items</h3>
          <ItemGrid rows={extra.items} />
        </section>
      )}
      {extra.pairs.length > 0 && (
        <section>
          <h3>Starke Paare</h3>
          <ul className="champ-card-list">
            {extra.pairs.slice(0, PAIRS_IN_POPOUT).map((p) => (
              <li key={p.items.map((i) => i.id).join('+')} title={facts(p)}>
                <span className="champ-card-items">
                  {p.items.map((i) => (
                    <img
                      key={i.id}
                      className={i.mana ? 'mana' : undefined}
                      src={itemImage(i.id)}
                      alt={i.name}
                      title={i.mana ? `${i.name} (Mana, in ARAM schwach)` : i.name}
                      width={26}
                      height={26}
                    />
                  ))}
                </span>
                <small>
                  {games(p.games)} · {percent(p.winRate)} Siege
                </small>
              </li>
            ))}
          </ul>
        </section>
      )}
      {extra.weak.length > 0 && (
        <section>
          <h3>Beliebt, aber schwach</h3>
          <ItemGrid rows={extra.weak} weak />
        </section>
      )}
    </>
  );
}

function TypeChips({ rows, weak = false }: { rows: AugTypePick[]; weak?: boolean }) {
  return (
    <ul className={`champ-card-chips${weak ? ' weak' : ''}`}>
      {rows.map((t) => (
        <li key={t.name} title={facts(t)}>
          {t.name} <b>{percent(t.winRate)}</b>
        </li>
      ))}
    </ul>
  );
}

/** Whether the extra data has anything for the tab. */
const hasTab = (extra: ChampExtra | undefined, tab: Tab) =>
  tab === 'augments' ||
  (!!extra &&
    (tab === 'items'
      ? extra.boots.length + extra.items.length + extra.pairs.length + extra.weak.length > 0
      : tab === 'spells'
        ? extra.spells.length > 0
        : extra.avoid.length + extra.augTypes.length + extra.weakTypes.length > 0));
const TAB_LABEL: Record<Tab, string> = {
  augments: 'Augments',
  items: 'Items',
  spells: 'Zauber',
  avoid: 'Meiden',
};

/**
 * Champ-Karte (popout in an ARAM Mayhem champion select, useChampCard.ts): the build directions of
 * the held champion from arammeta.com or mayhemstats.lol (the user picks one before the game, the most played is
 * preselected), their item cores and every augment in a tier S–D for the chosen direction; several
 * choices with their numbers. Without enough games per direction: the best augments and builds.
 */
export function ChampCard({ view, onDismiss }: { view: ChampView; onDismiss: () => void }) {
  const square = championSquare(view.alias);
  const label = view.name || view.alias || `Champion ${view.championId}`;
  const empty = !view.augments.length && !view.builds.length;
  const plans = view.plans;
  const [chosen, setChosen] = useState(view.offer?.direction ?? plans[0]?.direction);
  const plan = plans.find((p) => p.direction === chosen) ?? plans[0];
  const note = plan ? planNote(view, plan) : null;
  const offer = view.offer;
  // Further numbers of arammeta in tabs (not in the game: there the offer counts).
  const tabs = offer ? [] : (Object.keys(TAB_LABEL) as Tab[]).filter((t) => hasTab(view.extra, t));
  const [tab, setTab] = useState<Tab>('augments');
  const extraTab = tabs.length > 1 && view.extra && tab !== 'augments' ? tab : null;
  const tabRow = tabs.length > 1 && (
    <div className="champ-card-directions" role="group" aria-label="Ansicht">
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          className={t === tab ? 'active' : undefined}
          aria-pressed={t === tab}
          onClick={(event) => {
            event.stopPropagation();
            setTab(t);
          }}
        >
          {TAB_LABEL[t]}
        </button>
      ))}
    </div>
  );
  const taken = (id: number) => !!offer?.taken.some((t) => t.id === id);
  // In the game an offered row is a button: a click marks it taken (or undoes it), offers.rs.
  const name = (a: { id: number; name: string }) =>
    offer ? (
      <button
        type="button"
        className="champ-card-name champ-card-take"
        aria-pressed={taken(a.id)}
        aria-label={`${a.name} genommen`}
        title="Klick: als genommen markieren"
        onClick={(event) => {
          event.stopPropagation();
          void markTaken(a.id);
        }}
      >
        {a.name}
      </button>
    ) : (
      <span className="champ-card-name">{a.name}</span>
    );
  return (
    <div className="champ-card" title="Klick: ausblenden" onClick={onDismiss}>
      <header className="champ-card-head">
        {square && <img src={square} alt="" width={40} height={40} />}
        <span className="popout-text">
          <b>{label}</b>
          <small>
            {view.games
              ? `${games(view.games)} · ${sourceLabel(view)}`
              : `Noch keine Spiele · ${sourceLabel(view)}`}
          </small>
        </span>
      </header>
      {plans.length > 0 && plan ? (
        <>
          <section>
            <h3>Dein Build</h3>
            <div className="champ-card-directions" role="group" aria-label="Build-Richtung">
              {plans.map((p) => (
                <button
                  key={p.direction}
                  type="button"
                  className={p.direction === plan.direction ? 'active' : undefined}
                  aria-pressed={p.direction === plan.direction}
                  onClick={(event) => {
                    event.stopPropagation();
                    setChosen(p.direction);
                    void chooseBuild(view.championId, p.direction, itemSetOf(p, view.extra));
                  }}
                >
                  {DIRECTION_LABEL[p.direction]}
                  <small>{isOffmeta(p) && !p.share ? 'Offmeta' : percent(p.share)}</small>
                </button>
              ))}
            </div>
            {note && <p className="champ-card-empty">{note}</p>}
            {plan.builds.length > 0 ? (
              <Builds builds={plan.builds} />
            ) : (
              <p className="champ-card-empty">Noch zu wenig Spiele für einen Kern.</p>
            )}
            <button
              type="button"
              className="champ-card-guide"
              onClick={(event) => {
                event.stopPropagation();
                void openGuide(view.championId);
              }}
            >
              Guides auf aramonly.com
            </button>
          </section>
          {tabRow}
          {extraTab && view.extra ? (
            <Extra extra={view.extra} tab={extraTab} />
          ) : (
            <section>
              <h3>
                {view.offer ? 'Angebot' : 'Augments'} für {DIRECTION_LABEL[plan.direction]}
              </h3>
              {offer && offer.taken.length > 0 && (
                <p className="champ-card-empty">
                  Bisher: {offer.taken.map((t) => t.name).join(', ')}
                </p>
              )}
              <ul className="champ-card-list">
                {(view.offer
                  ? offerRows(plan, view.offer)
                  : plan.augments.slice(0, PLAN_AUGMENTS_SHOWN)
                ).map((a) =>
                  'missing' in a ? (
                    <li key={a.id}>
                      {name(a)}
                      <small>{taken(a.id) && 'genommen · '}keine Spiele</small>
                    </li>
                  ) : (
                    <li key={a.id}>
                      <TierLetter
                        tier={a.tier}
                        title={
                          a.general
                            ? `Stufe ${a.tier} (allgemein, zu wenig ${DIRECTION_LABEL[plan.direction]}-Spiele)`
                            : `Stufe ${a.tier} für ${DIRECTION_LABEL[plan.direction]}`
                        }
                      />
                      <span className={`champ-card-augment ${a.rarity}`}>
                        {a.image && <img src={a.image} alt="" width={24} height={24} />}
                      </span>
                      {name(a)}
                      <small>
                        {taken(a.id) && 'genommen · '}
                        {a.turns && `Umwandler → ${DIRECTION_LABEL[a.turns]} · `}
                        {a.general ? 'allgemein' : games(a.games)}
                      </small>
                    </li>
                  ),
                )}
              </ul>
            </section>
          )}
        </>
      ) : empty ? (
        <p className="champ-card-empty">Noch zu wenig Spiele für Augments und Builds.</p>
      ) : (
        <>
          {view.augments.length > 0 && (
            <section>
              <h3>Beste Augments</h3>
              <ul className="champ-card-list">
                {view.augments.map((a) => (
                  <li key={a.id}>
                    <span className={`champ-card-augment ${a.rarity}`}>
                      {a.image && <img src={a.image} alt="" width={24} height={24} />}
                    </span>
                    <span className="champ-card-name">{a.name}</span>
                    <small>
                      {games(a.games)}
                      {a.winRate !== null && ` · ${percent(a.winRate)} Siege`}
                    </small>
                    {a.grade && <GradeBadge grade={a.grade} title={`Note Ø ${a.grade}`} />}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {view.builds.length > 0 && (
            <section>
              <h3>Builds</h3>
              <Builds builds={view.builds} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
