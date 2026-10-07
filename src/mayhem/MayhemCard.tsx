import { useState } from 'react';
import { championSplash } from '../adapters/aram';
import { DDRAGON_VERSION } from '../data/proStreamers';
import {
  DIRECTION_LABEL,
  planNote,
  sourceLabel,
  TIERS,
  type BuildPick,
  type ChampView,
  type TieredAugment,
} from '../features/aram/champCard';
import { percent } from '../features/aram/format';

export const itemImage = (id: number) =>
  `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/item/${id}.png`;
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
      {builds.map((b) => (
        <li key={b.items.map((i) => i.id).join(',')}>
          <span className="mayhem-items">
            {b.items.map((i) => (
              <img
                key={i.id}
                data-mana={i.mana || undefined}
                src={itemImage(i.id)}
                alt={i.name}
                title={i.mana ? `${i.name} (Mana, in ARAM schwach)` : i.name}
                width={34}
                height={34}
              />
            ))}
          </span>
          <span className="mayhem-facts">
            <b>{percent(b.winRate)} Siege</b>
            <span>
              {games(b.games)}
              {b.mana > 0 && ' · Mana'}
            </span>
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

/** Every augment of the direction, grouped by tier S–D (the game offers three; look them up). */
function TierList({ augments, label }: { augments: TieredAugment[]; label: string }) {
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
  return (
    <article className="mayhem-card">
      <header
        className="mayhem-hero"
        style={splash ? { ['--splash' as string]: `url("${splash}")` } : undefined}
      >
        <h1>{label}</h1>
        <p>{view.games ? games(view.games) : 'Noch keine Spiele'}</p>
        <p>
          {sourceLabel(view)}
          {sample && ' · Beispiel'}
        </p>
        {onClose && (
          <button type="button" className="mayhem-button small" onClick={onClose}>
            Zurück
          </button>
        )}
      </header>

      {plan ? (
        <>
          <div className="mayhem-directions" role="group" aria-label="Build-Richtung">
            {plans.map((p) => (
              <button
                key={p.direction}
                type="button"
                aria-pressed={p.direction === plan.direction}
                onClick={() => setChosen(p.direction)}
              >
                {DIRECTION_LABEL[p.direction]}
                <small>{percent(p.share)}</small>
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
          </section>
          <section className="mayhem-section">
            <h2>Augments für {DIRECTION_LABEL[plan.direction]}</h2>
            <TierList augments={plan.augments} label={DIRECTION_LABEL[plan.direction]} />
          </section>
        </>
      ) : view.augments.length || view.builds.length ? (
        <>
          {view.builds.length > 0 && (
            <section className="mayhem-section">
              <h2>Builds</h2>
              <Builds builds={view.builds} />
            </section>
          )}
          {view.augments.length > 0 && (
            <section className="mayhem-section">
              <h2>Beste Augments</h2>
              <ul className="mayhem-best">
                {view.augments.map((a) => (
                  <li key={a.id}>
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
          )}
        </>
      ) : (
        <p className="mayhem-note">Noch zu wenig Spiele für Augments und Builds.</p>
      )}
    </article>
  );
}
