import { championSquare } from '../../adapters/aram';
import { DDRAGON_VERSION } from '../../data/proStreamers';
import { useState } from 'react';
import {
  DIRECTION_LABEL,
  PLAN_AUGMENTS_SHOWN,
  sourceLabel,
  type BuildPick,
  type ChampView,
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
            {b.items.map((i) => (
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
            {games(b.games)} · {percent(b.winRate)} Siege
            {b.mana > 0 && ' · Mana'}
          </small>
          {b.grade && <GradeBadge grade={b.grade} title={`Note Ø ${b.grade}`} />}
        </li>
      ))}
    </ul>
  );
}

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
  const [chosen, setChosen] = useState(plans[0]?.direction);
  const plan = plans.find((p) => p.direction === chosen) ?? plans[0];
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
                  }}
                >
                  {DIRECTION_LABEL[p.direction]}
                  <small>{percent(p.share)}</small>
                </button>
              ))}
            </div>
            {plan.builds.length > 0 ? (
              <Builds builds={plan.builds} />
            ) : (
              <p className="champ-card-empty">Noch zu wenig Spiele für einen Kern.</p>
            )}
          </section>
          <section>
            <h3>Augments für {DIRECTION_LABEL[plan.direction]}</h3>
            <ul className="champ-card-list">
              {plan.augments.slice(0, PLAN_AUGMENTS_SHOWN).map((a) => (
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
                  <span className="champ-card-name">{a.name}</span>
                  <small>
                    {a.turns && `Umwandler → ${DIRECTION_LABEL[a.turns]} · `}
                    {a.general ? 'allgemein' : games(a.games)}
                  </small>
                </li>
              ))}
            </ul>
          </section>
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
