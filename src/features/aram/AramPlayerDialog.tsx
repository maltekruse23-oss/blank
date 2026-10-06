import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import { Crown, Play, X } from 'lucide-react';
import {
  championSquare,
  profileIcon,
  splitRiotId,
  type AramEntry,
  type AramPlayer,
} from '../../adapters/aram';
import { ChannelAvatar } from '../../components/ui';
import { spring } from '../../design/motion';
import { placeColor } from './AramRanking';
import { categoryIcons } from './aramIcons';
import { playerOverview, type Standing } from './aramPlayer';
import { day, number, percent } from './format';
import { useSiteProfile } from './useSiteRanks';
import { RankHistory } from './RankHistory';

/** What the overview of a player needs, taken when it opens (from the ARAM page). */
export type AramPlayerView = {
  player: AramPlayer;
  players: AramPlayer[];
  /** The games that count (since the start). */
  games: AramEntry[];
  meId: string | null;
  /** Shows a game as the card after a game. */
  showGame: (entry: AramEntry) => void;
};

/** A place as a medal (user's wish: the classic colours), only for a value over 0. */
function Medal({ standing, count }: { standing: Standing; count: number }) {
  const { place, value } = standing;
  if (place === null || count < 2) return null;
  const earned = value !== null && value > 0;
  return (
    <span
      className={`aram-bar-place ${place === 1 && earned ? 'first' : ''}`}
      style={{ '--place': earned ? placeColor(place) : 'var(--rank-rest)' } as CSSProperties}
      aria-label={`Platz ${place}`}
    >
      {place === 1 && earned ? <Crown size={10} /> : place}
    </span>
  );
}

/**
 * One player of the leaderboard (user's wish: click a player, see an overview): medals, the
 * numbers over all games with their place, the records, best games and champions.
 */
export function AramPlayerDialog({ view, onClose }: { view: AramPlayerView; onClose: () => void }) {
  const { player, players, games, meId } = view;
  const site = useSiteProfile(player);
  const overview = useMemo(() => playerOverview(player, players, games), [player, players, games]);
  const { name, tag } = splitRiotId(player.name);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // A game opened from here lies above: Escape closes that one first.
      const open = document.querySelectorAll('[aria-modal="true"]');
      if (open[open.length - 1] === dialog.current) onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const [gold, silver, bronze] = overview.medals;
  const count = players.length;
  return (
    <motion.div
      ref={dialog}
      className="restore-dialog aram-player-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={`ARAM: ${name}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.2 } }}
      exit={{ opacity: 0, transition: { duration: 0.16 } }}
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <motion.section
        className="aram-player-card"
        initial={{ opacity: 0, y: 22, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: spring('bouncy') }}
        exit={{ opacity: 0, y: 10, scale: 0.97, transition: { duration: 0.14 } }}
      >
        <header className="aram-player-head">
          <ChannelAvatar login={name} imageUrl={profileIcon(player.icon)} />
          <div>
            <h2>
              {name}
              {tag && <small>#{tag}</small>}
              {player.puuid === meId && <span className="badge active">Du</span>}
            </h2>
            <p>
              {overview.games} {overview.games === 1 ? 'Spiel' : 'Spiele'}
            </p>
          </div>
          {count > 1 && (
            <ul className="aram-player-medals" aria-label="Medaillen in den Rekorden">
              {[gold, silver, bronze].map((n, i) => (
                <li
                  key={i}
                  style={{ '--place': placeColor(i + 1) } as CSSProperties}
                  title={`${n}× Platz ${i + 1}`}
                  className={n === 0 ? 'none' : ''}
                >
                  <span className="aram-bar-place">{i === 0 ? <Crown size={10} /> : i + 1}</span>
                  <b>{n}</b>
                </li>
              ))}
            </ul>
          )}
          <button className="icon-button" aria-label="Schließen" onClick={onClose} autoFocus>
            <X size={17} />
          </button>
        </header>
        <div className="aram-player-body">
          {overview.games === 0 ? (
            <p className="section-note">Noch keine Spiele, die zählen.</p>
          ) : (
            <>
              <RankHistory games={games} puuid={player.puuid} site={site} />
              <dl className="aram-player-overall">
                {overview.overall.map((standing) => {
                  const Icon = categoryIcons[standing.category.id];
                  return (
                    <div
                      key={standing.category.id}
                      style={{ '--hue': `var(--game-${standing.category.hue})` } as CSSProperties}
                    >
                      <dt>
                        <Icon size={12} aria-hidden />
                        {standing.category.title}
                      </dt>
                      <dd>
                        {standing.value === null ? '–' : standing.category.format(standing.value)}
                        <Medal standing={standing} count={count} />
                      </dd>
                    </div>
                  );
                })}
              </dl>
              {overview.records.length > 0 && (
                <>
                  <h3 className="aram-player-caption">Rekorde</h3>
                  <ol className="aram-player-records">
                    {overview.records.map((standing) => {
                      const Icon = categoryIcons[standing.category.id];
                      const champion = standing.game
                        ? championSquare(standing.game.champion)
                        : null;
                      return (
                        <li
                          key={standing.category.id}
                          style={
                            { '--hue': `var(--game-${standing.category.hue})` } as CSSProperties
                          }
                        >
                          <Medal standing={standing} count={count} />
                          <Icon size={13} className="aram-player-icon" aria-hidden />
                          <span className="aram-player-record-title">
                            {standing.category.title}
                          </span>
                          {champion && standing.game && (
                            <img
                              src={champion}
                              alt=""
                              width={16}
                              height={16}
                              title={`${standing.game.championName} · ${day(standing.game.at)}`}
                              onError={(event) => {
                                event.currentTarget.hidden = true;
                              }}
                            />
                          )}
                          <b>{standing.category.format(standing.value!)}</b>
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
              <div className="aram-player-columns">
                <div>
                  <h3 className="aram-player-caption">Beste Spiele</h3>
                  <ol className="aram-player-games">
                    {overview.best.map((entry) => {
                      const icon = championSquare(entry.champion);
                      return (
                        <li key={entry.gameId} className={entry.win ? 'win' : 'loss'}>
                          {icon && (
                            <img
                              src={icon}
                              alt=""
                              width={22}
                              height={22}
                              onError={(event) => {
                                event.currentTarget.hidden = true;
                              }}
                            />
                          )}
                          <span className="aram-player-game-name">
                            <b>{entry.championName}</b>
                            <small>
                              {entry.kills} / {entry.deaths} / {entry.assists} · {day(entry.at)}
                            </small>
                          </span>
                          <b className="aram-player-game-damage">{number(entry.damage)}</b>
                          <button
                            className="aram-game-show"
                            title="Als Karte nach dem Spiel ansehen"
                            onClick={() => view.showGame(entry)}
                          >
                            <Play size={12} />
                            Ansehen
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
                <div>
                  <h3 className="aram-player-caption">Champions</h3>
                  <ol className="aram-player-champions">
                    {overview.champions.map((c) => {
                      const icon = championSquare(c.champion);
                      return (
                        <li key={c.champion || c.championName}>
                          {icon && (
                            <img
                              src={icon}
                              alt=""
                              width={22}
                              height={22}
                              onError={(event) => {
                                event.currentTarget.hidden = true;
                              }}
                            />
                          )}
                          <span>
                            <b>{c.championName}</b>
                            <small>
                              {c.games} {c.games === 1 ? 'Spiel' : 'Spiele'} ·{' '}
                              {percent(c.wins / c.games)} Siege
                            </small>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>
            </>
          )}
        </div>
      </motion.section>
    </motion.div>
  );
}
