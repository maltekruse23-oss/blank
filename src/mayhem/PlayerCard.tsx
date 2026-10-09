// The player card (user's wish 08.10.2026: "jeder Name soll anklickbar sein überall und die
// Playercard soll sich öffnen"). Every player's name in the app is a button (PlayerName) that opens
// their card over the page: rank, games and the last games from their public profile on
// mayhemstats.lol (mayhem_player, read-only). Its question: how is this player doing? Not listed,
// loading and failed are their own states; "–" for what is missing, never 0.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { championSquare } from '../adapters/aram';
import { PLACEMENT, rankName } from '../features/aram/aramRating';
import { games, percent } from './format';
import { loadPlayer, type PlayerState } from './me';
import { MatchList, mpLine, rankImage, winLoss } from './pages';
import type { TierChampion } from './tiers';
import { GradeMark, Overlay, RETRY_MS, useRefresh } from './ui';

/** A player as the app names them: the public id on mayhemstats.lol (`a123`) or a PUUID. */
export type Who = { id: string; name: string };

const OpenPlayer = createContext<((who: Who) => void) | null>(null);
/** MayhemApp opens the card for every PlayerName below it. */
export const PlayerProvider = OpenPlayer.Provider;

/** A player's name that opens their card; without an id (or outside the app) plain text. */
export function PlayerName({
  id,
  name,
  children,
}: {
  id: string | null | undefined;
  name: string;
  children?: ReactNode;
}) {
  const open = useContext(OpenPlayer);
  if (!open || !id) return <>{children ?? name}</>;
  return (
    <button
      type="button"
      className="mayhem-name"
      title={`${name}: player card`}
      onClick={(event) => {
        // Rows around the name may react to clicks themselves.
        event.stopPropagation();
        open({ id, name });
      }}
    >
      {children ?? name}
    </button>
  );
}

export function PlayerCard({
  who,
  champions,
  onClose,
}: {
  who: Who;
  champions: TierChampion[];
  onClose: () => void;
}) {
  const [got, setGot] = useState<PlayerState>({ state: 'loading' });
  const [ask, setAsk] = useState(0);
  useEffect(() => {
    let current = true;
    setGot({ state: 'loading' });
    void loadPlayer(who.id, who.name, champions).then((next) => current && setGot(next));
    return () => {
      current = false;
    };
  }, [who.id, who.name, champions, ask]);
  useRefresh(() => setAsk((n) => n + 1), got.state === 'failed' ? RETRY_MS : null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);
  const me = got.state === 'ready' ? got.me : null;
  const rank = me?.rank ?? null;
  const name = got.state === 'ready' ? got.name : who.name;
  const at = name.lastIndexOf('#');
  return (
    <Overlay onClose={onClose}>
      <article
        className="mayhem-glass mayhem-player"
        role="dialog"
        aria-modal="true"
        aria-label={`Player card: ${name}`}
      >
        <header className="mayhem-player-head">
          {rank && <img src={rankImage(rank)} alt="" width={76} height={76} />}
          <div>
            <h2>
              {at > 0 ? name.slice(0, at) : name}
              {at > 0 && <small>{name.slice(at)}</small>}
              {got.state === 'ready' && got.mock && <span className="mayhem-pill mock">Mock</span>}
            </h2>
            {me ? (
              <>
                <div className="mayhem-rank-name">{rank ? rankName(rank) : 'Unranked'}</div>
                <div className="mayhem-note">
                  {rank ? mpLine(me, rank) : `Placement ${me.placed}/${PLACEMENT}`}
                </div>
                <div className="mayhem-rank-facts">
                  {winLoss(me)}
                  {me.average && ` · Avg grade ${me.average}`}
                </div>
              </>
            ) : (
              <p className="mayhem-note" role="status">
                {got.state === 'loading'
                  ? 'Loading from mayhemstats.lol …'
                  : got.state === 'missing'
                    ? 'Not on mayhemstats.lol.'
                    : 'mayhemstats.lol did not answer.'}
              </p>
            )}
            {got.state === 'failed' && (
              <button type="button" className="mayhem-button small" onClick={() => setAsk(ask + 1)}>
                Try again
              </button>
            )}
          </div>
        </header>
        {me?.main && (
          <div className="mayhem-player-main">
            {me.main.alias && (
              <img src={championSquare(me.main.alias) ?? undefined} alt="" width={40} height={40} />
            )}
            <span>
              <span className="mayhem-note">Most played</span>
              <b>{me.main.name}</b>
            </span>
            <small title={`Grade ${me.main.grade}`}>
              {percent(me.main.wins / me.main.games)} wins · {games(me.main.games)}
            </small>
            <GradeMark grade={me.main.grade} size={34} />
          </div>
        )}
        {me && (
          <section className="mayhem-player-games">
            <h3>Last games</h3>
            {me.recent.length ? (
              <MatchList games={me.recent} />
            ) : (
              <p className="mayhem-note">No rated games yet.</p>
            )}
          </section>
        )}
        <button
          ref={close}
          type="button"
          className="mayhem-result-close"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={18} aria-hidden />
        </button>
      </article>
    </Overlay>
  );
}
