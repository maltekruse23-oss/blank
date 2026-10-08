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
  TIERS,
  type AugTypePick,
  type BuildPick,
  type ChampExtra,
  type ChampView,
  type MetaItemPick,
  type TieredAugment,
} from '../features/aram/champCard';
import { COMBO_HONESTY, comboNote, themeOf, type Combo } from '../features/aram/combos';
import { percent } from '../features/aram/format';

export const itemImage = (id: number) =>
  `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/item/${id}.png`;
/** Staggers a row's soft entrance (mayhem.css, .mayhem-in). */
const step = (i: number) => ({ ['--i' as string]: i }) as CSSProperties;

export const games = (n: number) => `${n.toLocaleString('de-DE')} ${n === 1 ? 'Spiel' : 'Spiele'}`;

/** The augment's rarity as the frame of its picture (silver, gold, prismatic like in the game). */
function AugmentIcon({ rarity, image }: { rarity: string; image: string | null }) {
  return (
    <span className="mayhem-aug-icon" data-rarity={rarity}>
      {image && <img src={image} alt="" width={32} height={32} />}
    </span>
  );
}

function Builds({ builds }: { builds: BuildPick[] }) {
  return (
    <ul className="mayhem-builds">
      {builds.map((b, n) => (
        <li key={b.items.map((i) => i.id).join(',')} className="mayhem-in" style={step(n + 2)}>
          <span className="mayhem-items">
            {b.items.map((i, n) => (
              <img
                key={i.id}
                data-mana={i.mana || undefined}
                src={itemImage(i.id)}
                alt={i.name}
                title={itemTitle(b, n, i)}
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
                title={`Später oft: ${i.name}${i.mana ? ' (Mana)' : ''}`}
                width={24}
                height={24}
              />
            ))}
          </span>
          <span className="mayhem-facts">
            {b.assembled ? (
              <span>{assembledFacts(b)}</span>
            ) : (
              <>
                <b>{percent(b.winRate)} Siege</b>
                <span>{games(b.games)}</span>
              </>
            )}
            {b.mana > 0 && <span>Mana</span>}
            {b.label && <span>{b.label}</span>}
          </span>
          {b.grade && (
            <span className="mayhem-grade" data-grade={b.grade.toLowerCase()} title="Note Ø">
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
const facts = (p: { games: number; winRate: number; pick: number | null }) =>
  `${games(p.games)} · ${percent(p.winRate)} Siege${p.pick !== null ? ` · ${percent(p.pick)} gewählt` : ''}`;

/** Items (one or two per row) with win rate, games and pick rate. */
function ItemRows({ rows, weak = false }: { rows: MetaItemPick[]; weak?: boolean }) {
  return (
    <ul className={`mayhem-grid${weak ? ' weak' : ''}`}>
      {rows.map((r) => (
        <li key={r.items.map((i) => i.id).join('+')} title={facts(r)}>
          <span className="mayhem-items">
            {r.items.map((i) => (
              <img
                key={i.id}
                data-mana={i.mana || undefined}
                src={itemImage(i.id)}
                alt={i.name}
                title={i.mana ? `${i.name} (Mana, in ARAM schwach)` : i.name}
                width={30}
                height={30}
              />
            ))}
          </span>
          <span className="mayhem-facts">
            <b>{percent(r.winRate)}</b>
            <span>{r.games.toLocaleString('de-DE')}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function TypeChips({ rows, weak = false }: { rows: AugTypePick[]; weak?: boolean }) {
  return (
    <ul className={`mayhem-chips${weak ? ' weak' : ''}`}>
      {rows.map((t) => (
        <li key={t.name} title={facts(t)}>
          {t.name} <b>{percent(t.winRate)}</b>
        </li>
      ))}
    </ul>
  );
}

/** arammeta's further numbers on the left: boots, single items, pairs, weak items, spells. */
function ExtraItems({ extra }: { extra: ChampExtra }) {
  return (
    <>
      {extra.boots.length > 0 && (
        <section className="mayhem-section">
          <h2>Stiefel</h2>
          <ItemRows rows={extra.boots} />
        </section>
      )}
      {extra.items.length > 0 && (
        <section className="mayhem-section">
          <h2>Einzelne Items</h2>
          <ItemRows rows={extra.items} />
        </section>
      )}
      {extra.pairs.length > 0 && (
        <section className="mayhem-section">
          <h2>Starke Paare</h2>
          <ItemRows rows={extra.pairs} />
        </section>
      )}
      {extra.weak.length > 0 && (
        <section className="mayhem-section">
          <h2>Beliebt, aber schwach</h2>
          <ItemRows rows={extra.weak} weak />
        </section>
      )}
      {extra.spells.length > 0 && (
        <section className="mayhem-section">
          <h2>Beschwörerzauber</h2>
          <ul className="mayhem-builds">
            {extra.spells.map((s) => (
              <li key={s.spells.map((x) => x.id).join('+')} title={facts(s)}>
                <span className="mayhem-items">
                  {s.spells.map((x) => (
                    <img key={x.id} src={spellImage(x.key)} alt="" width={30} height={30} />
                  ))}
                </span>
                <span className="mayhem-aug-name">{s.spells.map((x) => x.name).join(' + ')}</span>
                <span className="mayhem-facts">
                  <b>{percent(s.winRate)} Siege</b>
                  <span>{games(s.games)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** Augment kinds that work or not, and the weakest augments of the champion. */
function ExtraAvoid({ extra }: { extra: ChampExtra }) {
  if (!extra.augTypes.length && !extra.weakTypes.length && !extra.avoid.length) return null;
  return (
    <section className="mayhem-section">
      <h2>Augment-Arten</h2>
      {extra.augTypes.length > 0 && <TypeChips rows={extra.augTypes} />}
      {extra.weakTypes.length > 0 && (
        <>
          <p className="mayhem-note">Schwächer:</p>
          <TypeChips rows={extra.weakTypes} weak />
        </>
      )}
      {extra.avoid.length > 0 && (
        <>
          <h2>Schwächste Augments</h2>
          <ul className="mayhem-best">
            {extra.avoid.map((a) => (
              <li key={a.id} title={slotsText(a.slots)}>
                <AugmentIcon rarity={a.rarity} image={a.image} />
                <span className="mayhem-aug-name">{a.name}</span>
                <span className="mayhem-facts">
                  <b className="down">{percent(a.winRate)} Siege</b>
                  <span>{games(a.games)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * Mayhem-Combos (combos.ts): every combo of the champion as a chip, Meta and Offmeta apart, the
 * chosen one with its augments and items and their numbers on the champion.
 */
export function ComboSection({ combos, champion }: { combos: Combo[]; champion: string }) {
  const [chosen, setChosen] = useState(0);
  const combo = combos[chosen] ?? combos[0];
  if (!combo) return null;
  const theme = themeOf(combo.theme);
  const note = comboNote(combo, champion);
  const tag = (meta: boolean) => (
    <span className="mayhem-combo-tag" data-meta={meta}>
      {meta ? 'Meta' : 'Offmeta'}
    </span>
  );
  return (
    <section className="mayhem-section">
      <h2>Combos</h2>
      {[true, false].map(
        (meta) =>
          combos.some((c) => c.meta === meta) && (
            <div
              key={String(meta)}
              className="mayhem-chips mayhem-combo-picks"
              role="group"
              aria-label={meta ? 'Meta-Combos' : 'Offmeta-Combos'}
            >
              {tag(meta)}
              {combos.map((c, i) =>
                c.meta === meta ? (
                  <button
                    key={c.theme}
                    type="button"
                    aria-pressed={c === combo}
                    onClick={() => setChosen(i)}
                  >
                    {themeOf(c.theme)?.name ?? c.theme}
                  </button>
                ) : null,
              )}
            </div>
          ),
      )}
      <div className="mayhem-combo">
        <h3>
          {theme?.name ?? combo.theme} {tag(combo.meta)}
        </h3>
        {theme && <p className="mayhem-note">{theme.line}</p>}
        <ul className="mayhem-best">
          {combo.augments.map((a) => (
            <li key={a.id}>
              <AugmentIcon rarity={a.rarity} image={a.image} />
              <span className="mayhem-aug-name">{a.name}</span>
              <span className="mayhem-facts">
                <b>{percent(a.winRate)} Siege</b>
                <span>{games(a.games)}</span>
              </span>
            </li>
          ))}
        </ul>
        <ul className="mayhem-grid">
          {combo.items.map((i) => (
            <li
              key={i.id}
              title={`${i.name}${i.mana ? ' (Mana, in ARAM schwach)' : ''}${i.games === null ? `: keine Zahlen mit ${champion}` : ''}`}
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
                  <span>allgemein</span>
                ) : (
                  <>
                    <b>{percent(i.winRate)}</b>
                    <span>{i.games.toLocaleString('de-DE')}</span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
        {note && <p className="mayhem-note">{note}</p>}
      </div>
      <p className="mayhem-note">{COMBO_HONESTY}</p>
    </section>
  );
}

/** Every augment of the direction, grouped by tier S–D (the game offers three; look them up). */
function TierList({ augments, label }: { augments: TieredAugment[]; label: string }) {
  let n = 4;
  return (
    <div className="mayhem-tiers">
      {TIERS.map((tier) => {
        const list = augments.filter((a) => a.tier === tier);
        if (!list.length) return null;
        return (
          <section key={tier} className="mayhem-tier" data-tier={tier}>
            <span className="mayhem-tier-letter" aria-label={`Stufe ${tier}`}>
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
                      ? `Zu wenig ${label}-Spiele: Stufe nach dem allgemeinen Wert`
                      : `${games(a.games)} mit ${label}`
                  }
                >
                  <AugmentIcon rarity={a.rarity} image={a.image} />
                  <span className="mayhem-aug-name">{a.name}</span>
                  <span className="mayhem-facts">
                    {a.turns && (
                      <span className="turns">Umwandler → {DIRECTION_LABEL[a.turns]}</span>
                    )}
                    <span>{a.general ? 'allgemein' : games(a.games)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * The Champ-Karte in the Mayhem app: the held champion, the build directions (the most played
 * preselected, the user picks one before the game), its item cores and every augment in a tier
 * S–D for that direction. Always several choices with their numbers. Without enough games per
 * direction: the best augments and builds.
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
  const note = plan ? planNote(view, plan) : null;
  const hero = (
    <header
      className="mayhem-hero mayhem-in"
      style={splash ? { ['--splash' as string]: `url("${splash}")` } : undefined}
    >
      <div className="mayhem-hero-glass">
        <h1>{label}</h1>
        <div className="mayhem-pills">
          <span className="mayhem-pill gold">
            {view.games ? games(view.games) : 'Noch keine Spiele'}
          </span>
          <span className="mayhem-pill">{sourceLabel(view)}</span>
          {sample && <span className="mayhem-pill">Beispiel</span>}
        </div>
      </div>
      {onClose && (
        <button type="button" className="mayhem-button small" onClick={onClose}>
          Zurück
        </button>
      )}
    </header>
  );
  // Desktop like Blitz: the champion, its directions and item cores on the left, the augments
  // (the longest list) on the right.
  if (plan)
    return (
      <article className="mayhem-card">
        <div className="mayhem-card-side">
          {hero}
          <div
            className="mayhem-directions mayhem-in"
            style={step(1)}
            role="group"
            aria-label="Build-Richtung"
          >
            {plans.map((p) => (
              <button
                key={p.direction}
                type="button"
                aria-pressed={p.direction === plan.direction}
                onClick={() => setChosen(p.direction)}
              >
                {DIRECTION_LABEL[p.direction]}
                <small>{isOffmeta(p) && !p.share ? 'Offmeta' : percent(p.share)}</small>
              </button>
            ))}
          </div>
          {note && <p className="mayhem-note">{note}</p>}
          <section className="mayhem-section">
            <h2>Item-Kern</h2>
            {plan.builds.length ? (
              <Builds builds={plan.builds} />
            ) : (
              <p className="mayhem-note">Noch zu wenig Spiele für einen Kern.</p>
            )}
            <button
              type="button"
              className="mayhem-guide"
              onClick={() => void openGuide(view.championId)}
            >
              Guides und Offmeta-Builds auf aramonly.com
            </button>
          </section>
          {!!view.combos?.length && <ComboSection combos={view.combos} champion={label} />}
          {view.extra && <ExtraItems extra={view.extra} />}
          {/* Here, not under the long tier list, so it is seen. */}
          {view.extra && <ExtraAvoid extra={view.extra} />}
        </div>
        <section className="mayhem-section mayhem-card-main">
          <h2>Augments für {DIRECTION_LABEL[plan.direction]}</h2>
          <TierList augments={plan.augments} label={DIRECTION_LABEL[plan.direction]} />
        </section>
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
            <h2>Beste Augments</h2>
            <ul className="mayhem-best">
              {view.augments.map((a, n) => (
                <li key={a.id} className="mayhem-in" style={step(n + 2)}>
                  <AugmentIcon rarity={a.rarity} image={a.image} />
                  <span className="mayhem-aug-name">{a.name}</span>
                  <span className="mayhem-facts">
                    {a.winRate !== null && <b>{percent(a.winRate)} Siege</b>}
                    <span>{games(a.games)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          !view.builds.length && (
            <p className="mayhem-note">Noch zu wenig Spiele für Augments und Builds.</p>
          )
        )}
      </div>
    </article>
  );
}
