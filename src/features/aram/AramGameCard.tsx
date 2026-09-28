import {
  championSplash,
  itemIcon,
  splitRiotId,
  type AramAugment,
  type AramEntry,
} from '../../adapters/aram';
import { Play } from 'lucide-react';
import { day, duration, number, percent } from './format';

/** One game of the collection: the champion's picture behind it, the damage in large. */
export function AramGameCard({
  entry,
  place,
  augments,
  onShow,
}: {
  entry: AramEntry;
  place: number;
  augments: Record<string, AramAugment>;
  /** Shows the game as the card after a game, with its animation. */
  onShow: () => void;
}) {
  const splash = championSplash(entry.champion);
  const { name, tag } = splitRiotId(entry.name);
  const stats: [string, string][] = [
    ['K / D / A', `${entry.kills} / ${entry.deaths} / ${entry.assists}`],
    ['Anteil Team', percent(entry.teamShare)],
    ['Eingesteckt', number(entry.taken)],
    ['Geheilt', number(entry.healed)],
    ['Gold', number(entry.gold)],
  ];
  return (
    <article className={`aram-game ${entry.win ? 'win' : 'loss'}`}>
      {splash && (
        <img
          className="aram-splash"
          src={splash}
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      )}
      <div className="aram-game-body">
        <p className="aram-game-head">
          <span className="aram-game-place">#{place}</span>
          <b className="aram-outcome">{entry.win ? 'Sieg' : 'Niederlage'}</b>
          <span>{duration(entry.seconds)}</span>
          <span>{day(entry.at)}</span>
          {entry.damageRank === 1 && <span className="badge active">Top-Schaden</span>}
          <button
            className="aram-game-show"
            onClick={onShow}
            title="Als Karte nach dem Spiel ansehen"
          >
            <Play size={12} />
            Ansehen
          </button>
        </p>
        <p className="aram-game-who">
          <b>{name}</b>
          {tag && <small>#{tag}</small>}
          <span>{entry.championName || 'Champion'}</span>
        </p>
        <p className="aram-game-damage">
          <strong>{number(entry.damage)}</strong>
          <span>Schaden an Champions</span>
        </p>
        <dl className="aram-game-stats">
          {stats.map(([label, value]) => (
            <div key={label}>
              <dd>{value}</dd>
              <dt>{label}</dt>
            </div>
          ))}
        </dl>
        <div className="aram-loadout">
          {entry.augments.length > 0 && (
            <ul className="aram-augments" aria-label="Augments">
              {entry.augments.map((id, i) => {
                const augment = augments[String(id)];
                return (
                  <li
                    key={`${id}-${i}`}
                    className={augment?.rarity ?? ''}
                    title={augment?.name ?? 'Augment'}
                  >
                    {augment?.icon ? (
                      <img src={augment.icon} alt={augment.name} width={24} height={24} />
                    ) : (
                      <span>{(augment?.name ?? '?').slice(0, 2)}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {entry.items.length > 0 && (
            <div className="aram-items" aria-label="Items">
              {entry.items.map((item, i) => (
                <img
                  key={`${item}-${i}`}
                  src={itemIcon(item, entry.patch)}
                  alt=""
                  width={26}
                  height={26}
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.hidden = true;
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
