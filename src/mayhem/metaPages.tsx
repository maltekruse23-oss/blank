// The Mayhem app's pages with the rest of arammeta's list (user, 08.10.2026: "alle Daten von
// arammeta in mein System und App gut einbauen, so viele Daten wie möglich"): champion detail
// (best augments per rarity, teammates, team profile), augment detail (text, categories, lift,
// pick rate, linked champions), the patch changes and the items. All numbers from the one list
// tiers.ts reads; every rate with its games beside it, missing values as "–", nothing estimated.
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { championSquare, itemIcon } from '../adapters/aram';
import { readChampInfo } from '../adapters/aramChamp';
import { champView } from '../features/aram/champCard';
import type { Combo } from '../features/aram/combos';
import { number, percent } from '../features/aram/format';
import { ComboSection, games } from './MayhemCard';
import { PageHead, ROLES, step, TierWait, type TierState } from './pages';
import {
  categoryName,
  championsWithAugment,
  filterItems,
  itemRoles,
  pointsChange,
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

export const RARITY_WORD: Record<Rarity, string> = {
  prismatic: 'Prisma',
  gold: 'Gold',
  silver: 'Silber',
};

const PROFILE: Record<CompKey, string> = {
  phys: 'Physisch',
  magic: 'Magisch',
  true: 'Absolut',
  front: 'Frontlinie',
  damage: 'Schadenswert',
  engage: 'Engage',
  wave: 'Wellen räumen',
  poke: 'Poke',
  sustain: 'Durchhalten',
  cc: 'Kontrolle',
};

const lift = (value: number | null) => (value === null ? '–' : `${signedPoints(value)} Pp`);
const share = (value: number | null) => (value === null ? '–' : percent(value));

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

const byId = <T extends { id: number }>(list: T[]) => new Map(list.map((e) => [e.id, e]));

/** The champion's combos from its arammeta file (one request when the page opens; none in the
 * browser preview, which has no Rust). */
function ChampionCombos({ champion: c }: { champion: TierChampion }) {
  const [combos, setCombos] = useState<{ id: number; list: Combo[] | null } | null>(null);
  useEffect(() => {
    let live = true;
    const champ = { championId: c.id, alias: c.alias, name: c.name };
    readChampInfo(c.id).then(
      (info) => live && setCombos({ id: c.id, list: champView(champ, info)?.combos ?? null }),
      () => live && setCombos({ id: c.id, list: null }),
    );
    return () => {
      live = false;
    };
  }, [c.id, c.alias, c.name]);
  if (combos?.id !== c.id) return <p className="mayhem-note">Combos werden geladen …</p>;
  if (!combos.list?.length) return null;
  return <ComboSection key={c.id} combos={combos.list} champion={c.name} />;
}

/** One champion: its numbers, best augments per rarity, best teammates and team profile. */
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
  const [rarity, setRarity] = useState<Rarity>('prismatic');
  const augments = useMemo(() => byId(lists.augments), [lists]);
  const champions = useMemo(() => byId(lists.champions), [lists]);
  const profile = useMemo(() => teamProfile(c, lists.champions), [c, lists]);
  const top = c.top.filter((a) => a.rarity === rarity);
  return (
    <div className="mayhem-page">
      <Back onBack={onBack} label="Tier-Liste" />
      <section className="mayhem-glass mayhem-meta-head mayhem-in" style={step(1)}>
        <ChampionIcon champion={c} size={80} />
        <div>
          <h1>{c.name}</h1>
          <p className="mayhem-note">
            {c.tags.map((t) => ROLES[t] ?? t).join(' · ') || '–'} · arammeta.com, Patch{' '}
            {lists.patch}
          </p>
        </div>
        <dl className="mayhem-meta-stats">
          <div>
            <dt>Stufe</dt>
            <dd className="mayhem-aug-card-tier" data-tier={c.tier}>
              {c.tier}
            </dd>
          </div>
          <div>
            <dt>Siegquote</dt>
            <dd>{percent(c.winRate)}</dd>
          </div>
          <div>
            <dt>Spiele</dt>
            <dd>{number(c.games)}</dd>
          </div>
        </dl>
        {lists.mock && <span className="mayhem-pill mock">Mock</span>}
      </section>
      <div className="mayhem-columns">
        <div className="mayhem-column-side">
          <section className="mayhem-section mayhem-in" style={step(2)}>
            <h2>Team-Profil</h2>
            {profile.damage.length || profile.scores.length ? (
              <div className="mayhem-glass mayhem-profile">
                {profile.damage.length > 0 && (
                  <>
                    <span className="mayhem-note">Schaden pro Minute</span>
                    <div className="mayhem-mix" aria-hidden>
                      {profile.damage.map((d) => (
                        <span key={d.key} data-key={d.key} style={{ flexGrow: d.share }} />
                      ))}
                    </div>
                    <div className="mayhem-mix-legend">
                      {profile.damage.map((d) => (
                        <span key={d.key} data-key={d.key}>
                          {PROFILE[d.key]} {number(d.value)}
                        </span>
                      ))}
                    </div>
                  </>
                )}
                {profile.scores.map((s) => (
                  <div key={s.key} className="mayhem-profile-row">
                    <span>{PROFILE[s.key]}</span>
                    <div className="mayhem-bar">
                      <span style={{ width: `${s.share * 100}%` }} />
                    </div>
                    <span className="mono">{s.value.toLocaleString('de-DE')}</span>
                  </div>
                ))}
                <small className="mayhem-note">
                  Balken: Anteil am höchsten Wert aller Champions.
                </small>
              </div>
            ) : (
              <p className="mayhem-note">–</p>
            )}
          </section>
          <section className="mayhem-section mayhem-in" style={step(3)}>
            <h2>Beste Mitspieler</h2>
            {c.pairs.length ? (
              <ul className="mayhem-best">
                {c.pairs.slice(0, 10).map((p) => {
                  const mate = champions.get(p.id);
                  return (
                    <li key={p.id}>
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
                      <span className="mayhem-facts">
                        <b>{percent(p.winRate)}</b>
                        <span>
                          erwartet {share(p.expected)} · Lift {lift(p.lift)}
                        </span>
                        <span>{games(p.games)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mayhem-note">–</p>
            )}
          </section>
        </div>
        <section className="mayhem-section mayhem-column-main mayhem-in" style={step(2)}>
          <div className="mayhem-row-head">
            <h2>Beste Augments</h2>
            <div className="mayhem-chips" role="group" aria-label="Seltenheit">
              {(['prismatic', 'gold', 'silver'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  data-rarity={r}
                  aria-pressed={rarity === r}
                  onClick={() => setRarity(r)}
                >
                  {RARITY_WORD[r]}
                </button>
              ))}
            </div>
          </div>
          {top.length ? (
            <ul className="mayhem-best">
              {top.map((a) => {
                const augment = augments.get(a.id);
                return (
                  <li key={a.id}>
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
                    <span className="mayhem-facts">
                      <b>{percent(a.winRate)}</b>
                      <span>
                        Lift {lift(a.lift)} · Pick {share(a.pick)}
                      </span>
                      <span>{games(a.games)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mayhem-note">arammeta führt hier keine.</p>
          )}
        </section>
      </div>
      <div className="mayhem-in" style={step(4)}>
        <ChampionCombos champion={c} />
      </div>
    </div>
  );
}

/** One augment: text, categories, numbers and the champions it goes with. */
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
            {a.cats.length > 0 && ` · ${a.cats.map((c) => categoryName(lists, c)).join(' · ')}`}
          </p>
          <p className="mayhem-meta-text">{a.text || '–'}</p>
        </div>
        <dl className="mayhem-meta-stats">
          <div>
            <dt>Stufe</dt>
            <dd className="mayhem-aug-card-tier" data-tier={a.tier}>
              {a.tier}
            </dd>
          </div>
          <div>
            <dt>Siegquote</dt>
            <dd>{percent(a.winRate)}</dd>
          </div>
          <div>
            <dt>Lift</dt>
            <dd>{lift(a.lift)}</dd>
          </div>
          <div>
            <dt>Pickrate</dt>
            <dd>{share(a.pick)}</dd>
          </div>
          <div>
            <dt>Spiele</dt>
            <dd>{number(a.games)}</dd>
          </div>
        </dl>
        {lists.mock && <span className="mayhem-pill mock">Mock</span>}
      </section>
      <p className="mayhem-note mayhem-in" style={step(2)}>
        Lift: wie viel öfter Spiele mit dem Augment gewinnen, als ihre Champions ohnehin gewinnen
        (Prozentpunkte). Patch {lists.patch}, arammeta.com.
      </p>
      <div className="mayhem-columns">
        <section className="mayhem-section mayhem-column-side mayhem-in" style={step(3)}>
          <h2>Stark bei</h2>
          {best.length ? (
            <ul className="mayhem-best">
              {best.slice(0, 12).map(({ champion, entry }) => (
                <li key={champion.id}>
                  <ChampionIcon champion={champion} size={34} />
                  <button
                    type="button"
                    className="mayhem-aug-name mayhem-plain"
                    onClick={() => onChampion(champion.id)}
                  >
                    {champion.name}
                  </button>
                  <span className="mayhem-facts">
                    <b>{percent(entry.winRate)}</b>
                    <span>Lift {lift(entry.lift)}</span>
                    <span>{games(entry.games)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mayhem-note">Bei keinem Champion unter seinen besten Augments.</p>
          )}
        </section>
        <section className="mayhem-section mayhem-column-main mayhem-in" style={step(3)}>
          <h2>Verknüpfte Champions</h2>
          <p className="mayhem-note">Wie arammetas Suche sie mit dem Augment verbindet.</p>
          {linked.length ? (
            <div className="mayhem-meta-faces">
              {linked.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="mayhem-plain"
                  title={`${c.name}: ${percent(c.winRate)}, ${games(c.games)}`}
                  onClick={() => onChampion(c.id)}
                >
                  <ChampionIcon champion={c} size={40} />
                </button>
              ))}
            </div>
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
  { id: 'championAugments', label: 'Champion + Augment' },
  { id: 'championItems', label: 'Champion + Item' },
];

/** The patch changes: current patch against the one before, risers and fallers by kind. */
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
  const row = (c: Change) => {
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
      <li key={`${c.champion ?? ''}-${c.id}`}>
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
            <small className="mayhem-note">mit {champ?.name ?? `Champion ${c.champion}`}</small>
          )}
        </span>
        <span className="mayhem-facts">
          <b data-down={c.currentWr < c.baselineWr}>{pointsChange(c)} Pp</b>
          <span>
            {percent(c.baselineWr)} → {percent(c.currentWr)}
            {c.currentTier && ` · ${c.baselineTier ?? '–'} → ${c.currentTier}`}
          </span>
          <span>
            {games(c.currentGames)} (vorher {number(c.baselineGames)})
          </span>
        </span>
      </li>
    );
  };
  return (
    <div className="mayhem-page">
      <PageHead
        title="Patch-Änderungen"
        line={
          changes
            ? `Patch ${changes.current} gegen ${changes.baseline}: wer seit dem letzten Patch öfter oder seltener gewinnt, arammeta.com. Stufen OP und T1–T5 von arammeta.`
            : 'Was sich seit dem letzten Patch geändert hat, von arammeta.com.'
        }
        badge={lists?.mock ? 'Mock' : undefined}
      />
      {!lists ? (
        <TierWait tiers={tiers} onRetry={onRetry} />
      ) : !changes ? (
        <p className="mayhem-note">arammeta.com hat gerade keine Patch-Änderungen.</p>
      ) : (
        <>
          <div className="mayhem-tools mayhem-in" style={step(1)}>
            <div className="mayhem-meta-tiles">
              <span>
                <small className="mayhem-note">Spiele {changes.current}</small>
                <strong>
                  {changes.currentGames === null ? '–' : number(changes.currentGames)}
                </strong>
              </span>
              <span>
                <small className="mayhem-note">Spiele {changes.baseline}</small>
                <strong>
                  {changes.baselineGames === null ? '–' : number(changes.baselineGames)}
                </strong>
              </span>
            </div>
            <div className="mayhem-chips" role="group" aria-label="Art">
              {MOVER_KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={kind === k.id}
                  onClick={() => setKind(k.id)}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mayhem-meta-split">
            {(['risers', 'fallers'] as const).map((side, i) => (
              <section key={side} className="mayhem-section mayhem-in" style={step(i + 2)}>
                <h2>{side === 'risers' ? 'Aufsteiger' : 'Absteiger'}</h2>
                {changes[kind][side].length ? (
                  <ul className="mayhem-best" data-side={side}>
                    {changes[kind][side].map(row)}
                  </ul>
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

/** Every item arammeta lists: name, price, role and text, filtered by role. */
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
            ? `Alle Items, die arammeta.com für ARAM Mayhem führt, Patch ${lists.patch}. Teuerste zuerst.`
            : 'Items von arammeta.com'
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
              placeholder="Items nach Name oder Effekt suchen"
              aria-label="Items suchen"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="mayhem-chips" role="group" aria-label="Rolle">
              {['all', ...roles, 'none'].map((r) => (
                <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)}>
                  {r === 'all' ? 'Alle Rollen' : r === 'none' ? 'Ohne Rolle' : (ROLES[r] ?? r)}
                </button>
              ))}
            </div>
          </div>
          {shown.length ? (
            <div className="mayhem-item-grid">
              {shown.map((item, i) => (
                <article key={item.id} className="mayhem-item mayhem-in" style={step(i + 2)}>
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
                      {item.price === null ? '–' : `${number(item.price)} Gold`} ·{' '}
                      {item.role ? (ROLES[item.role] ?? item.role) : 'ohne Rolle'}
                    </span>
                  </div>
                  <p>{item.text || '–'}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="mayhem-note">Nichts gefunden.</p>
          )}
        </>
      )}
    </div>
  );
}
