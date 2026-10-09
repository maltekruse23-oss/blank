// The player card (user's wish 08.10.2026: "jeder Name soll anklickbar sein überall und die
// Playercard soll sich öffnen"). Every player's name in the app is a button (PlayerName) that opens
// their card over the page: rank with the MP curve and their best game (user, 09.10.2026: no match
// history), the most played champion as the background, from their public profile on
// mayhemstats.lol (mayhem_player, read-only). Its question: how is this player doing? Not listed,
// loading and failed are their own states; "–" for what is missing, never 0.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';
import { championSplash, championSquare, splashFallback } from '../adapters/aram';
import { PLACEMENT, rankName } from '../features/aram/aramRating';
import { rankFill } from '../features/aram/rankRun';
import { games, number, percent } from './format';
import { loadPlayer, type BoardRow, type PlayerState } from './me';
import { MpCurve, RankFacts, rankImage, winLoss } from './pages';
import { tagsOf } from './tags';
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
  board,
  onClose,
}: {
  who: Who;
  champions: TierChampion[];
  /** The whole leaderboard (the ladder rank); empty while it is not known. */
  board: BoardRow[];
  onClose: () => void;
}) {
  const [got, setGot] = useState<PlayerState>({ state: 'loading' });
  const [ask, setAsk] = useState(0);
  // Read when loading, not a reason to load: the app refreshes the leaderboard by itself.
  const boardNow = useRef(board);
  boardNow.current = board;
  useEffect(() => {
    let current = true;
    setGot({ state: 'loading' });
    void loadPlayer(who.id, who.name, champions, boardNow.current).then(
      (next) => current && setGot(next),
    );
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
  const main = me?.main ?? null;
  const splash = main?.alias ? championSplash(main.alias, main.skin) : null;
  const bestGame = me?.best.game ?? null;
  const tags = useMemo(() => tagsOf(me?.history ?? []), [me]);
  return (
    <Overlay onClose={onClose}>
      <article
        className="mayhem-glass mayhem-player"
        role="dialog"
        aria-modal="true"
        aria-label={`Player card: ${name}`}
      >
        {splash && main?.alias && (
          <img
            className="mayhem-player-splash"
            src={splash}
            alt=""
            onError={(event) => splashFallback(event, main.alias!, main.skin)}
          />
        )}
        <header className="mayhem-player-head">
          <h2>
            {at > 0 ? name.slice(0, at) : name}
            {at > 0 && <small>{name.slice(at)}</small>}
            {got.state === 'ready' && got.mock && <span className="mayhem-pill mock">Mock</span>}
          </h2>
          {me && tags.length > 0 && (
            <ul className="mayhem-tags" aria-label="Tags">
              {tags.map((tag) => (
                <li key={tag.label} className="mayhem-tag" data-tone={tag.tone} title={tag.why}>
                  {tag.label}
                </li>
              ))}
            </ul>
          )}
          {main && (
            <span className="mayhem-note" title={`Grade ${main.grade}`}>
              Most played: <b>{main.name}</b> · {percent(main.wins / main.games)} wins ·{' '}
              {games(main.games)}
            </span>
          )}
          {!me && (
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
        </header>
        {me && (
          <section className="mayhem-player-box">
            <h3>Mayhem rank</h3>
            <div className="mayhem-player-rank">
              {rank && <img src={rankImage(rank)} alt="" width={84} height={84} />}
              <div>
                <div className="mayhem-player-rank-line">
                  <span className="mayhem-rank-name">{rank ? rankName(rank) : 'Unranked'}</span>
                  <span>{rank ? `${rank.points} MP` : `Placement ${me.placed}/${PLACEMENT}`}</span>
                </div>
                <span className="mayhem-bar" aria-hidden>
                  <span
                    style={{
                      width: `${(rank ? rankFill(rank) : me.placed / PLACEMENT) * 100}%`,
                    }}
                  />
                </span>
                <div className="mayhem-player-rank-line mayhem-rank-facts">
                  <span>{me.games ? `${percent(me.wins / me.games)} WR` : '–'}</span>
                  <span>{winLoss(me)}</span>
                </div>
                <RankFacts me={me} />
              </div>
            </div>
            {me.curve.length > 1 && (
              <div className="mayhem-player-curve">
                <h3>MP history</h3>
                <MpCurve values={me.curve} />
              </div>
            )}
          </section>
        )}
        {me && (
          <section className="mayhem-player-box">
            <h3>Best performance</h3>
            {bestGame ? (
              <div className="mayhem-player-main">
                {bestGame.alias && (
                  <img
                    src={championSquare(bestGame.alias) ?? undefined}
                    alt=""
                    width={44}
                    height={44}
                  />
                )}
                <span>
                  <b>{bestGame.name}</b>
                  <small>
                    {bestGame.kda} · {number(bestGame.damage)} damage
                  </small>
                </span>
                <GradeMark grade={bestGame.grade} size={40} />
              </div>
            ) : (
              <p className="mayhem-note">No rated games yet.</p>
            )}
            {me.average && (
              <div className="mayhem-player-rank-line mayhem-rank-facts">
                <span>Avg grade</span>
                <GradeMark grade={me.average} size={22} />
              </div>
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
