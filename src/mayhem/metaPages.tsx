// The Mayhem app's pages with the rest of arammeta's list (user, 08.10.2026: "alle Daten von
// arammeta in mein System und App gut einbauen, so viele Daten wie möglich"): champion detail
// (best augments per rarity, teammates, team profile), augment detail (text, categories, lift,
// pick rate, linked champions), the patch changes and the items. All numbers from the one list
// tiers.ts reads; every rate with its games beside it or in its tooltip, missing values as "–",
// nothing estimated. English only; one question per page, the answer on top, one main number per
// row, lists show five first (MAYHEM-DESIGN.md "Übersicht vor Vollständigkeit").
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { championSquare, itemIcon } from '../adapters/aram';
import { readChampInfo } from '../adapters/aramChamp';
import { champView } from '../features/aram/champCard';
import type { Combo } from '../features/aram/combos';
import { ComboSection } from './MayhemCard';
import { games, number, percent, winsIn } from './format';
import { PageHead, RARITY_WORD, step, TierWait, type TierState } from './pages';
import {
  categoryName,
  championsWithAugment,
  filterItems,
  itemRoles,
  signedPoints,
  teamProfile,
  type Change,
  type Changes,
  type CompKey,
  type Rarity,
  type TierAugment,
  type TierChampion,
  type TierLists,
} from './tiers';
import { More, Tabs, Top } from './ui';

const PROFILE: Record<CompKey, string> = {
  phys: 'Physical',
  magic: 'Magic',
  true: 'True',
  front: 'Frontline',
  damage: 'Damage',
  engage: 'Engage',
  wave: 'Wave clear',
  poke: 'Poke',
  sustain: 'Sustain',
  cc: 'Crowd control',
};

const RARITY_TABS = (['prismatic', 'gold', 'silver'] as const).map((id) => ({
  id,
  label: RARITY_WORD[id],
}));

/** Lift and pick rate in plain words, for a row's tooltip (never on the row itself). */
const extras = (row: { lift: number | null; pick?: number | null }) =>
  [
    row.lift === null ? null : `${signedPoints(row.lift)} points over the usual win rate`,
    row.pick == null ? null : `Picked in ${percent(row.pick)} of games`,
  ].filter(Boolean);
const tip = (row: { winRate: number; games: number; lift: number | null; pick?: number | null }) =>
  [winsIn(row.winRate, row.games), ...extras(row)].join('\n');

function AugmentIcon({ augment, rarity }: { augment?: TierAugment; rarity: Rarity }) {
  return (
    <span className="mayhem-aug-icon" data-rarity={rarity}>
      {augment?.image && <img src={augment.image} alt="" width={34} height={34} loading="lazy" />}
    </span>
  );
}

function ChampionIcon({ champion, size }: { champion?: TierChampion; size: number }) {
  const src = champion ? championSquare(champion.alias) : null;
  return src ? (
    <img className="mayhem-meta-face" src={src} alt="" width={size} height={size} loading="lazy" />
  ) : (
    <span className="mayhem-meta-face" style={{ width: size, height: size }} />
  );
}

function Back({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <button type="button" className="mayhem-link mayhem-back mayhem-in" onClick={onBack}>
      <ArrowLeft size={16} aria-hidden /> {label}
    </button>
  );
}

/** The head's numbers: the tier, the win rate big and its games small. */
function HeadStats({
  tier,
  winRate,
  n,
  title,
}: {
  tier: string;
  winRate: number;
  n: number;
  title?: string;
}) {
  return (
    <dl className="mayhem-meta-stats">
      <div>
        <dt>Tier</dt>
        <dd className="mayhem-aug-card-tier" data-tier={tier}>
          {tier}
        </dd>
      </div>
      <div title={title}>
        <dt>Win rate</dt>
        <dd>{percent(winRate)}</dd>
        <small>{games(n)}</small>
      </div>
    </dl>
  );
}

const byId = <T extends { id: number }>(list: T[]) => new Map(list.map((e) => [e.id, e]));

/** The champion's combos from its arammeta file (one request when the page opens; none in the
 * browser preview, which has no Rust). Null while loading or without any. */
function useCombos(c: TierChampion) {
  const [combos, setCombos] = useState<Combo[] | null>(null);
  useEffect(() => {
    let live = true;
    const champ = { championId: c.id, alias: c.alias, name: c.name };
    readChampInfo(c.id, true).then(
      (info) => live && setCombos(champView(champ, info)?.combos ?? null),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [c.id, c.alias, c.name]);
  return combos;
}

/** A champion's team profile: its damage split and its strengths as bars, the strongest marked;
 * the raw values only in the tooltips. */
function TeamProfile({ c, lists }: { c: TierChampion; lists: TierLists }) {
  const profile = useMemo(() => teamProfile(c, lists.champions), [c, lists]);
  if (!profile.damage.length && !profile.scores.length) return <p className="mayhem-note">–</p>;
  const best = Math.max(...profile.scores.map((s) => s.share));
  return (
    <div className="mayhem-glass mayhem-profile">
      {profile.damage.length > 0 && (
        <>
          <span className="mayhem-note">Damage</span>
          <div className="mayhem-mix" aria-hidden>
            {profile.damage.map((d) => (
              <span key={d.key} data-key={d.key} style={{ flexGrow: d.share }} />
            ))}
          </div>
          <div className="mayhem-mix-legend">
            {profile.damage.map((d) => (
              <span key={d.key} data-key={d.key} title={`${number(d.value)} per minute`}>
                {PROFILE[d.key]} {percent(d.share)}
              </span>
            ))}
          </div>
        </>
      )}
      {profile.scores.map((s) => (
        <div
          key={s.key}
          className="mayhem-profile-row"
          data-top={s.share === best && best > 0}
          title={`${PROFILE[s.key]}: ${s.value.toLocaleString('en-US')} (the most of any champion is a full bar)`}
        >
          <span>{PROFILE[s.key]}</span>
          <div className="mayhem-bar">
            <span style={{ width: `${s.share * 100}%` }} />
          </div>
        </div>
      ))}
      <small className="mayhem-note">A full bar is the most of any champion.</small>
    </div>
  );
}

type ChampTab = 'augments' | 'combos' | 'profile';

/** What do I take on this champion? Its best augments on top, its teammates beside them, combos and
 * team profile in tabs. */
export function ChampionDetail({
  lists,
  champion: c,
  onBack,
  onChampion,
  onAugment,
}: {
  lists: TierLists;
  champion: TierChampion;
  onBack: () => void;
  onChampion: (id: number) => void;
  onAugment: (id: number) => void;
}) {
  const [tab, setTab] = useState<ChampTab>('augments');
  const [rarity, setRarity] = useState<Rarity>('prismatic');
  const augments = useMemo(() => byId(lists.augments), [lists]);
  const champions = useMemo(() => byId(lists.champions), [lists]);
  const combos = useCombos(c);
  const top = c.top.filter((a) => a.rarity === rarity);
  const tabs: { id: ChampTab; label: string }[] = [
    { id: 'augments', label: 'Augments' },
    ...(combos?.length ? [{ id: 'combos' as const, label: 'Combos' }] : []),
    { id: 'profile', label: 'Team role' },
  ];
  const shown = tabs.some((t) => t.id === tab) ? tab : 'augments';
  return (
    <div className="mayhem-page">
      <Back onBack={onBack} label="Champions" />
      <section className="mayhem-glass mayhem-meta-head mayhem-in" style={step(1)}>
        <ChampionIcon champion={c} size={80} />
        <div>
          <h1>{c.name}</h1>
          <p className="mayhem-note">
            {c.tags.join(', ') || '–'} · arammeta.com, Patch {lists.patch}
          </p>
        </div>
        <HeadStats tier={c.tier} winRate={c.winRate} n={c.games} />
        {lists.mock && <span className="mayhem-pill mock">Mock</span>}
      </section>
      <div className="mayhem-columns mayhem-columns-end">
        <section className="mayhem-section mayhem-column-main mayhem-in" style={step(2)}>
          <Tabs tabs={tabs} value={shown} onChange={setTab} label={`About ${c.name}`} />
          <div role="tabpanel" aria-label={tabs.find((t) => t.id === shown)?.label}>
            {shown === 'augments' && (
              <div className="mayhem-section">
                <div className="mayhem-row-head">
                  <h2>Best augments</h2>
                  <div className="mayhem-chips" role="group" aria-label="Rarity">
                    {RARITY_TABS.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        data-rarity={r.id}
                        aria-pressed={rarity === r.id}
                        onClick={() => setRarity(r.id)}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
                {top.length ? (
                  <More
                    key={rarity}
                    list={top}
                    className="mayhem-best"
                    render={(a, n) => {
                      const augment = augments.get(a.id);
                      return (
                        <li key={a.id} data-top={n === 0} title={tip(a)}>
                          <AugmentIcon augment={augment} rarity={a.rarity} />
                          {augment ? (
                            <button
                              type="button"
                              className="mayhem-aug-name mayhem-plain"
                              onClick={() => onAugment(a.id)}
                              title={augment.text}
                            >
                              {augment.name}
                            </button>
                          ) : (
                            <span className="mayhem-aug-name">Augment {a.id}</span>
                          )}
                          {n === 0 && <Top />}
                          <span className="mayhem-facts">
                            <b>{percent(a.winRate)}</b>
                            <span>{games(a.games)}</span>
                          </span>
                        </li>
                      );
                    }}
                  />
                ) : (
                  <p className="mayhem-note">arammeta.com lists none here.</p>
                )}
              </div>
            )}
            {shown === 'combos' && combos && <ComboSection combos={combos} champion={c.name} />}
            {shown === 'profile' && <TeamProfile c={c} lists={lists} />}
          </div>
        </section>
        <section className="mayhem-section mayhem-column-side mayhem-in" style={step(3)}>
          <h2>Strong with</h2>
          {c.pairs.length ? (
            <More
              list={c.pairs}
              className="mayhem-best"
              render={(p, n) => {
                const mate = champions.get(p.id);
                return (
                  <li
                    key={p.id}
                    data-top={n === 0}
                    title={[
                      `${percent(p.winRate)} wins together in ${games(p.games)}`,
                      p.expected === null ? null : `Expected ${percent(p.expected)}`,
                      p.lift === null ? null : `${signedPoints(p.lift)} points better together`,
                    ]
                      .filter(Boolean)
                      .join('\n')}
                  >
                    <ChampionIcon champion={mate} size={34} />
                    {mate ? (
                      <button
                        type="button"
                        className="mayhem-aug-name mayhem-plain"
                        onClick={() => onChampion(p.id)}
                      >
                        {mate.name}
                      </button>
                    ) : (
                      <span className="mayhem-aug-name">Champion {p.id}</span>
                    )}
                    {n === 0 && <Top />}
                    <span className="mayhem-facts">
                      <b>{percent(p.winRate)}</b>
                      <span>{games(p.games)}</span>
                    </span>
                  </li>
                );
              }}
            />
          ) : (
            <p className="mayhem-note">–</p>
          )}
        </section>
      </div>
    </div>
  );
}

/** Is this augment good, and on whom? Its numbers on top, the champions it is strong on below. */
export function AugmentDetail({
  lists,
  augment: a,
  onBack,
  onChampion,
}: {
  lists: TierLists;
  augment: TierAugment;
  onBack: () => void;
  onChampion: (id: number) => void;
}) {
  const champions = useMemo(() => byId(lists.champions), [lists]);
  const best = useMemo(() => championsWithAugment(lists.champions, a.id), [lists, a.id]);
  const linked = a.champions.flatMap((id) => champions.get(id) ?? []);
  return (
    <div className="mayhem-page">
      <Back onBack={onBack} label="Augments" />
      <section
        className="mayhem-glass mayhem-meta-head mayhem-in"
        data-rarity={a.rarity}
        style={step(1)}
      >
        <span className="mayhem-aug-card-icon">
          {a.image && <img src={a.image} alt="" width={56} height={56} />}
        </span>
        <div>
          <h1>{a.name}</h1>
          <p className="mayhem-note">
            {RARITY_WORD[a.rarity]}
            {a.cats.length > 0 && ` · ${a.cats.map((c) => categoryName(lists, c)).join(', ')}`}
          </p>
          <p className="mayhem-meta-text">{a.text || '–'}</p>
        </div>
        <HeadStats
          tier={a.tier}
          winRate={a.winRate}
          n={a.games}
          title={extras(a).join('\n') || undefined}
        />
        {lists.mock && <span className="mayhem-pill mock">Mock</span>}
      </section>
      <div className="mayhem-columns mayhem-columns-end">
        <section className="mayhem-section mayhem-column-main mayhem-in" style={step(2)}>
          <h2>Strong on</h2>
          {best.length ? (
            <More
              list={best}
              className="mayhem-best"
              render={({ champion, entry }, n) => (
                <li key={champion.id} data-top={n === 0} title={tip(entry)}>
                  <ChampionIcon champion={champion} size={34} />
                  <button
                    type="button"
                    className="mayhem-aug-name mayhem-plain"
                    onClick={() => onChampion(champion.id)}
                  >
                    {champion.name}
                  </button>
                  {n === 0 && <Top />}
                  <span className="mayhem-facts">
                    <b>{percent(entry.winRate)}</b>
                    <span>{games(entry.games)}</span>
                  </span>
                </li>
              )}
            />
          ) : (
            <p className="mayhem-note">No champion has it among its best augments.</p>
          )}
        </section>
        <section className="mayhem-section mayhem-column-side mayhem-in" style={step(3)}>
          <h2 title="Champions arammeta.com's search links with this augment">Related champions</h2>
          {linked.length ? (
            <More
              list={linked}
              first={12}
              className="mayhem-meta-faces"
              render={(c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="mayhem-plain"
                    title={`${c.name}: ${winsIn(c.winRate, c.games)}`}
                    aria-label={c.name}
                    onClick={() => onChampion(c.id)}
                  >
                    <ChampionIcon champion={c} size={40} />
                  </button>
                </li>
              )}
            />
          ) : (
            <p className="mayhem-note">–</p>
          )}
        </section>
      </div>
    </div>
  );
}

type MoverKind = keyof Omit<Changes, 'current' | 'baseline' | 'currentGames' | 'baselineGames'>;
const MOVER_KINDS: { id: MoverKind; label: string }[] = [
  { id: 'champions', label: 'Champions' },
  { id: 'augments', label: 'Augments' },
  { id: 'items', label: 'Items' },
  { id: 'championAugments', label: 'Champion + augment' },
  { id: 'championItems', label: 'Champion + item' },
];

/** What changed this patch? Who got stronger and who weaker since the patch before, by kind. */
export function PatchPage({
  tiers,
  onRetry,
  onChampion,
  onAugment,
}: {
  tiers: TierState;
  onRetry: () => void;
  onChampion: (id: number) => void;
  onAugment: (id: number) => void;
}) {
  const [kind, setKind] = useState<MoverKind>('champions');
  const lists = tiers.state === 'ready' ? tiers.lists : null;
  const changes = lists?.changes ?? null;
  const champions = useMemo(() => byId(lists?.champions ?? []), [lists]);
  const augments = useMemo(() => byId(lists?.augments ?? []), [lists]);
  const row = (c: Change, n: number, up: boolean) => {
    const champ = champions.get(c.champion ?? c.id);
    const augment = augments.get(c.id);
    const isAugment = kind === 'augments' || kind === 'championAugments';
    const isItem = kind === 'items' || kind === 'championItems';
    const open =
      isAugment && augment
        ? () => onAugment(c.id)
        : !isAugment && !isItem && champ
          ? () => onChampion(c.id)
          : null;
    return (
      <li
        key={`${c.champion ?? ''}-${c.id}`}
        data-top={up && n === 0}
        title={[
          `Win rate ${percent(c.baselineWr)} → ${percent(c.currentWr)} (${signedPoints(c.currentWr - c.baselineWr)} points)`,
          `${games(c.currentGames)} on ${changes!.current}, ${games(c.baselineGames)} on ${changes!.baseline}`,
          c.currentTier ? `arammeta tier ${c.baselineTier ?? '–'} → ${c.currentTier}` : null,
        ]
          .filter(Boolean)
          .join('\n')}
      >
        {c.champion !== null && <ChampionIcon champion={champ} size={34} />}
        {isAugment ? (
          <AugmentIcon augment={augment} rarity={augment?.rarity ?? 'silver'} />
        ) : isItem ? (
          <img
            className="mayhem-meta-face"
            src={itemIcon(c.id, lists!.patch)}
            alt=""
            width={34}
            height={34}
            loading="lazy"
          />
        ) : (
          <ChampionIcon champion={champ} size={34} />
        )}
        <span className="mayhem-meta-name">
          {open ? (
            <button type="button" className="mayhem-aug-name mayhem-plain" onClick={open}>
              {c.name}
            </button>
          ) : (
            <span className="mayhem-aug-name">{c.name}</span>
          )}
          {c.champion !== null && (
            <small className="mayhem-note">on {champ?.name ?? `Champion ${c.champion}`}</small>
          )}
        </span>
        {up && n === 0 && <Top />}
        <span className="mayhem-facts">
          <b data-down={c.currentWr < c.baselineWr}>{percent(c.currentWr)}</b>
          <span>was {percent(c.baselineWr)}</span>
        </span>
      </li>
    );
  };
  return (
    <div className="mayhem-page">
      <PageHead
        title="Patch"
        line={
          changes
            ? `What changed since Patch ${changes.baseline}? From arammeta.com${changes.currentGames === null ? '' : `, ${number(changes.currentGames)} games on ${changes.current} so far`}.`
            : 'What changed since the last patch, from arammeta.com.'
        }
        badge={lists?.mock ? 'Mock' : undefined}
      />
      {!lists ? (
        <TierWait tiers={tiers} onRetry={onRetry} />
      ) : !changes ? (
        <p className="mayhem-note">arammeta.com has no patch changes right now.</p>
      ) : (
        <>
          <div className="mayhem-tools mayhem-in" style={step(1)}>
            <Tabs tabs={MOVER_KINDS} value={kind} onChange={setKind} label="Kind" />
          </div>
          <div className="mayhem-meta-split" role="tabpanel" aria-label={kind}>
            {(['risers', 'fallers'] as const).map((side, i) => (
              <section key={side} className="mayhem-section mayhem-in" style={step(i + 2)}>
                <h2>{side === 'risers' ? 'Stronger now' : 'Weaker now'}</h2>
                {changes[kind][side].length ? (
                  <More
                    key={kind}
                    list={changes[kind][side]}
                    className="mayhem-best"
                    render={(c, n) => row(c, n, side === 'risers')}
                  />
                ) : (
                  <p className="mayhem-note">–</p>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** What does each item do? Every item arammeta lists, dearest first, filtered by role. */
export function ItemsPage({ tiers, onRetry }: { tiers: TierState; onRetry: () => void }) {
  const [role, setRole] = useState('all');
  const [query, setQuery] = useState('');
  const lists = tiers.state === 'ready' ? tiers.lists : null;
  const roles = useMemo(() => itemRoles(lists?.items ?? []), [lists]);
  const shown = useMemo(() => filterItems(lists?.items ?? [], role, query), [lists, role, query]);
  return (
    <div className="mayhem-page">
      <PageHead
        title="Items"
        line={
          lists
            ? `What does each item do? Every ARAM Mayhem item on arammeta.com, Patch ${lists.patch}.`
            : 'Items from arammeta.com.'
        }
        badge={lists?.mock ? 'Mock' : undefined}
      />
      {!lists ? (
        <TierWait tiers={tiers} onRetry={onRetry} />
      ) : (
        <>
          <div className="mayhem-tools mayhem-in" style={step(1)}>
            <input
              type="search"
              className="mayhem-search"
              placeholder="Search by name or effect"
              aria-label="Search items"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="mayhem-chips" role="group" aria-label="Role">
              {['all', ...roles, 'none'].map((r) => (
                <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)}>
                  {r === 'all' ? 'All roles' : r === 'none' ? 'Other' : r}
                </button>
              ))}
            </div>
          </div>
          {shown.length ? (
            <More
              key={`${role}-${query}`}
              list={shown}
              first={12}
              className="mayhem-item-grid"
              render={(item, i) => (
                <li
                  key={item.id}
                  className="mayhem-item mayhem-in"
                  style={step(i + 2)}
                  title={item.role ?? 'Other'}
                >
                  <img
                    src={itemIcon(item.id, lists.patch)}
                    alt=""
                    width={44}
                    height={44}
                    loading="lazy"
                  />
                  <div>
                    <h3>{item.name}</h3>
                    <span className="mayhem-note">
                      {item.price === null ? '–' : `${number(item.price)} gold`}
                    </span>
                  </div>
                  <p title={item.text || undefined}>{item.text || '–'}</p>
                </li>
              )}
            />
          ) : (
            <p className="mayhem-note">Nothing found.</p>
          )}
        </>
      )}
    </div>
  );
}
