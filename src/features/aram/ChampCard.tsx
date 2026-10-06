import { championSquare } from '../../adapters/aram';
import { DDRAGON_VERSION } from '../../data/proStreamers';
import type { ChampView } from './champCard';
import { percent } from './format';
import { GradeBadge } from './GradeBadge';

const itemImage = (id: number) =>
  `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/item/${id}.png`;
/** Pictures of Mayhem augments (Data Dragon has none): from the website. */
const augmentImage = (id: number) => `https://mayhemstats.lol/api/augments/${id}.png`;

const games = (n: number) => `${n} ${n === 1 ? 'Spiel' : 'Spiele'}`;

/**
 * Champ-Karte (popout in an ARAM Mayhem champion select, useChampCard.ts): the best augments and
 * builds for the held champion from mayhemstats.lol, several choices with their numbers.
 */
export function ChampCard({ view, onDismiss }: { view: ChampView; onDismiss: () => void }) {
  const square = championSquare(view.alias);
  const label = view.name || view.alias || `Champion ${view.championId}`;
  const empty = !view.augments.length && !view.builds.length;
  return (
    <div className="champ-card" title="Klick: ausblenden" onClick={onDismiss}>
      <header className="champ-card-head">
        {square && <img src={square} alt="" width={40} height={40} />}
        <span className="popout-text">
          <b>{label}</b>
          <small>
            {view.games
              ? `${games(view.games)} auf mayhemstats.lol`
              : 'Noch keine Spiele auf mayhemstats.lol'}
          </small>
        </span>
      </header>
      {empty ? (
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
                      {a.icon && <img src={augmentImage(a.id)} alt="" width={24} height={24} />}
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
              <ul className="champ-card-list">
                {view.builds.map((b) => (
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
            </section>
          )}
        </>
      )}
    </div>
  );
}
