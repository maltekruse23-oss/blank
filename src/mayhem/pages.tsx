// The Mayhem app's pages besides the champ card (user, 07.10.2026: a desktop app like Blitz that
// grows page by page): augment tier list as cards (after Blitz's augment page), champion tier
// list as tier blocks with icon grids, and the rank page (the player's rank and the leaderboard
// from mayhemstats.lol, me.ts). Numbers of the tier lists from arammeta.com (tiers.ts). Design
// "Arena" (mayhem.css). English only; each page answers one question on top, one main number per
// row, lists show their first entries (MAYHEM-DESIGN.md "Übersicht vor Vollständigkeit").
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { championSplash, championSquare, profileIcon } from '../adapters/aram';
import { openGame } from '../adapters/aramSite';
import { PLACEMENT, rankName, seasonOf, type Rank } from '../features/aram/aramRating';
import { TIERS, type Tier } from '../features/aram/champCard';
import { games, number, percent, winsIn } from './format';
import { CONSENT, findView, type FindState } from './findRank';
import {
  ago,
  CURVE_SIZE,
  curvePath,
  type LadderRow,
  type MeGame,
  type MeState,
  type MeView,
} from './me';
import type { Page } from './MayhemApp';
import {
  categoryName,
  usedCategories,
  type TierAugment,
  type TierChampion,
  type TierLists,
} from './tiers';
import { PlayerName } from './PlayerCard';
import { GradeMark, More, Tabs, Top } from './ui';

export const step = (i: number) => ({ ['--i' as string]: Math.min(i, 16) }) as CSSProperties;

/** Header of a page: title, a short line and, for invented values, the "Mock" badge (with an action
 * of the preview next to it). */
export function PageHead({
  title,
  line,
  badge,
  action,
}: {
  title: string;
  line: string;
  badge?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mayhem-page-head mayhem-in">
      <div>
        <h1>{title}</h1>
        <p className="mayhem-note">{line}</p>
      </div>
      {(badge || action) && (
        <span className="mayhem-page-head-side">
          {action}
          {badge && <span className="mayhem-pill mock">{badge}</span>}
        </span>
      )}
    </header>
  );
}

/** Loading, failed or the browser preview: the tier lists come only in the app. */
export type TierState =
  | { state: 'loading' }
  | { state: 'failed'; message: string }
  | { state: 'ready'; lists: TierLists };

export function TierWait({ tiers, onRetry }: { tiers: TierState; onRetry: () => void }) {
  if (tiers.state === 'loading')
    return <p className="mayhem-note mayhem-in">Loading the list from arammeta.com …</p>;
  if (tiers.state === 'failed')
    return (
      <div className="mayhem-glow mayhem-in mayhem-narrow">
        <p>{tiers.message}</p>
        <button type="button" className="mayhem-button" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  return null;
}

const source = (tiers: TierState) =>
  tiers.state === 'ready'
    ? `Every ARAM Mayhem game on arammeta.com, Patch ${tiers.lists.patch}.`
    : 'From arammeta.com.';

export const RARITY_WORD: Record<TierAugment['rarity'], string> = {
  prismatic: 'Prismatic',
  gold: 'Gold',
  silver: 'Silver',
};
const RARITY_TABS = (['prismatic', 'gold', 'silver'] as const).map((id) => ({
  id,
  label: RARITY_WORD[id],
}));

/** Cards shown before "Show more" on the tier pages (two rows on most windows). */
const FIRST_CARDS = 12;

/** Which augments win most? One rarity at a time, best first. */
export function AugmentsPage({
  tiers,
  onRetry,
  onSelect,
}: {
  tiers: TierState;
  onRetry: () => void;
  onSelect: (id: number) => void;
}) {
  const [rarity, setRarity] = useState<TierAugment['rarity']>('prismatic');
  const [tier, setTier] = useState<Tier | 'all'>('all');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const lists = tiers.state === 'ready' ? tiers.lists : null;
  const categories = useMemo(() => (lists ? usedCategories(lists) : []), [lists]);
  const shown = useMemo(() => {
    const list = lists?.augments ?? [];
    const q = query.trim().toLowerCase();
    return list.filter(
      (a) =>
        a.rarity === rarity &&
        (tier === 'all' || a.tier === tier) &&
        (category === 'all' || a.cats.includes(category)) &&
        (!q || a.name.toLowerCase().includes(q) || a.text.toLowerCase().includes(q)),
    );
  }, [lists, rarity, tier, category, query]);
  return (
    <div className="mayhem-page">
      <PageHead
        title="Augments"
        line={`Which augments win most? ${source(tiers)}`}
        badge={lists?.mock ? 'Mock' : undefined}
      />
      {!lists ? (
        <TierWait tiers={tiers} onRetry={onRetry} />
      ) : (
        <>
          <div className="mayhem-tools mayhem-in" style={step(1)}>
            <Tabs tabs={RARITY_TABS} value={rarity} onChange={setRarity} label="Rarity" />
            <input
              type="search"
              className="mayhem-search"
              placeholder="Search by name or effect"
              aria-label="Search augments"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="mayhem-chips" role="group" aria-label="Tier">
              {(['all', ...TIERS] as const).map((t) => (
                <button key={t} type="button" aria-pressed={tier === t} onClick={() => setTier(t)}>
                  {t === 'all' ? 'All tiers' : t}
                </button>
              ))}
            </div>
            {categories.length > 0 && (
              <select
                className="mayhem-select"
                aria-label="Category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="all">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {categoryName(lists, c.id)}
                  </option>
                ))}
              </select>
            )}
          </div>
          {shown.length ? (
            <section className="mayhem-group" data-rarity={rarity}>
              <More
                key={`${rarity}-${tier}-${category}-${query}`}
                list={shown}
                first={FIRST_CARDS}
                className="mayhem-aug-grid"
                render={(a, i) => (
                  <AugmentCard
                    key={a.id}
                    augment={a}
                    index={i + 2}
                    top={i === 0}
                    onSelect={onSelect}
                  />
                )}
              />
            </section>
          ) : (
            <p className="mayhem-note">Nothing found.</p>
          )}
        </>
      )}
    </div>
  );
}

/** One augment as a card (after Blitz): win rate top left, tier top right, games at the bottom. */
function AugmentCard({
  augment: a,
  index,
  top,
  onSelect,
}: {
  augment: TierAugment;
  index: number;
  top: boolean;
  onSelect: (id: number) => void;
}) {
  return (
    <li
      className="mayhem-aug-card mayhem-in"
      data-rarity={a.rarity}
      data-top={top}
      style={step(index)}
      title={`${winsIn(a.winRate, a.games)}${a.pick === null ? '' : `\nPicked in ${percent(a.pick)} of games`}`}
    >
      <span className="mayhem-aug-card-tier" data-tier={a.tier}>
        {a.tier}
      </span>
      <span className="mayhem-aug-card-rate">{percent(a.winRate)}</span>
      <span className="mayhem-aug-card-icon">
        {a.image && <img src={a.image} alt="" width={56} height={56} loading="lazy" />}
      </span>
      <h3>
        {/* The whole card opens the augment (the button's ::after covers it). */}
        <button type="button" className="mayhem-stretch" onClick={() => onSelect(a.id)}>
          {a.name}
        </button>
      </h3>
      <p>{a.text}</p>
      <span className="mayhem-aug-card-games">
        {top && <Top />} {games(a.games)}
      </span>
    </li>
  );
}

/** Data Dragon's classes (the tier list filters by the first one). */
export const ROLES = ['Tank', 'Fighter', 'Mage', 'Marksman', 'Assassin', 'Support'];

const TIER_LINE: Record<Tier, string> = {
  S: 'Top 10%',
  A: 'Next 20%',
  B: 'Middle 40%',
  C: 'Next 20%',
  D: 'Bottom 10%',
};

/** Which champions win most? Tiers S and A first, the rest behind "Show all tiers". */
export function ChampionsPage({
  tiers,
  onRetry,
  onSelect,
}: {
  tiers: TierState;
  onRetry: () => void;
  onSelect: (id: number) => void;
}) {
  const [role, setRole] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(false);
  const shown = useMemo(() => {
    const list = tiers.state === 'ready' ? tiers.lists.champions : [];
    const q = query.trim().toLowerCase();
    return list.filter(
      (c) => (role === 'all' || c.tags[0] === role) && (!q || c.name.toLowerCase().includes(q)),
    );
  }, [tiers, role, query]);
  // Searching or a class shows every tier: the champion asked for must be there.
  const open = all || role !== 'all' || !!query.trim();
  const folded = open ? 0 : shown.filter((c) => c.tier !== 'S' && c.tier !== 'A').length;
  return (
    <div className="mayhem-page">
      <PageHead
        title="Champions"
        line={`Which champions win most? ${source(tiers)}`}
        badge={tiers.state === 'ready' && tiers.lists.mock ? 'Mock' : undefined}
      />
      {tiers.state !== 'ready' ? (
        <TierWait tiers={tiers} onRetry={onRetry} />
      ) : (
        <>
          <div className="mayhem-tools mayhem-in" style={step(1)}>
            <input
              type="search"
              className="mayhem-search"
              placeholder="Search a champion"
              aria-label="Search champions"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="mayhem-chips" role="group" aria-label="Class">
              {['all', ...ROLES].map((r) => (
                <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)}>
                  {r === 'all' ? 'All classes' : r}
                </button>
              ))}
            </div>
          </div>
          {TIERS.map((tier, t) => {
            const inTier = shown.filter((c) => c.tier === tier);
            if (!inTier.length || (!open && tier !== 'S' && tier !== 'A')) return null;
            return (
              <ChampionTier
                key={tier}
                tier={tier}
                list={inTier}
                index={t + 2}
                onSelect={onSelect}
              />
            );
          })}
          {(folded > 0 || (all && role === 'all' && !query.trim())) && (
            <button
              type="button"
              className="mayhem-more"
              aria-expanded={all}
              onClick={() => setAll(!all)}
            >
              {all ? 'Show tiers S and A only' : `Show all tiers (${folded} more)`}
            </button>
          )}
          {!shown.length && <p className="mayhem-note">Nothing found.</p>}
        </>
      )}
    </div>
  );
}

/** A tier as Blitz shows it: a lit block with the letter, the champions in a grid beside it. */
function ChampionTier({
  tier,
  list,
  index,
  onSelect,
}: {
  tier: Tier;
  list: TierChampion[];
  index: number;
  onSelect: (id: number) => void;
}) {
  return (
    <section className="mayhem-tier-block mayhem-in" data-tier={tier} style={step(index)}>
      <div className="mayhem-tier-side">
        <span>{tier}</span>
        <small>{TIER_LINE[tier]}</small>
      </div>
      <div className="mayhem-champ-grid">
        {list.map((c) => (
          <button
            key={c.id}
            type="button"
            className="mayhem-champ"
            title={`${c.name}: ${winsIn(c.winRate, c.games)}`}
            onClick={() => onSelect(c.id)}
          >
            <img
              src={championSquare(c.alias) ?? undefined}
              alt=""
              width={42}
              height={42}
              loading="lazy"
            />
            <span>
              <b>{c.name}</b>
              <small>{percent(c.winRate)}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

const RANK_IMAGE = import.meta.glob<string>('../../apps/mayhem-site/public/ranks/*.png', {
  eager: true,
  import: 'default',
});
export const rankImage = (rank: Rank) =>
  RANK_IMAGE[`../../apps/mayhem-site/public/ranks/${rank.tier.id}.png`];

export const winLoss = (me: MeView) => `${me.wins}W ${me.games - me.wins}L`;
export const mpLine = (me: MeView, rank: Rank) =>
  [`${rank.points} MP`, me.top !== null ? `Top ${me.top}%` : me.place ? `#${me.place}` : null]
    .filter(Boolean)
    .join(' · ');
export const gainText = (gain: number | null) =>
  gain === null ? '–' : `${gain > 0 ? '+' : gain < 0 ? '−' : ''}${Math.abs(gain)} MP`;
/** "Season 3 · 2026" (aramRating's `seasonName` is German and shared word for word with the
 * website, so the English one lives here). */
const season = () => {
  const s = seasonOf(Date.now());
  return `Season ${s.number} · ${s.year}`;
};

/** "Find my Mayhem rank" (findRank.ts): the button with its consent line, and how it went. */
function FindRank({ find, onFind }: Finding) {
  const v = findView(find, navigator.onLine);
  return (
    <>
      <h1>{v.title}</h1>
      {v.text && <p role="status">{v.text}</p>}
      {(v.action || v.busy) && (
        <>
          <div className="mayhem-hero-actions">
            <button
              type="button"
              className="mayhem-button primary"
              disabled={v.busy}
              onClick={onFind}
            >
              {v.busy ? 'Uploading …' : v.action === 'retry' ? 'Try again' : 'Find my Mayhem rank'}
            </button>
          </div>
          <p className="mayhem-note mayhem-consent">{CONSENT}</p>
        </>
      )}
    </>
  );
}

/** The click on "Find my Mayhem rank" and its state (MayhemApp keeps it across pages). */
type Finding = { find: FindState; onFind: () => void };

/** Why there is no player to show: client closed, loading, failed or not on the leaderboard (then
 * the way onto it). */
function MeNotice({ me, onRetry, find, onFind }: { me: MeState; onRetry: () => void } & Finding) {
  if (me.state === 'ready') return <FindRank find={find} onFind={onFind} />;
  const [title, line] =
    me.state === 'loading'
      ? ['Loading your player …', 'From mayhemstats.lol.']
      : me.state === 'closed'
        ? ['Start League', 'Your rank shows up once you are signed in to the League client.']
        : ['No connection', me.message];
  return (
    <>
      <h1>{title}</h1>
      <p>{line}</p>
      {me.state === 'failed' && (
        <div className="mayhem-hero-actions">
          <button type="button" className="mayhem-button" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </>
  );
}

const ready = (me: MeState) => (me.state === 'ready' ? me : null);

/** One rated game as a row: champion, win or loss with K/D/A, the grade and the MP it brought.
 * `onOpen` makes the row a button (the game on mayhemstats.lol). */
function GameRow({
  game: g,
  index,
  size,
  onOpen,
}: {
  game: MeGame;
  index: number;
  size: number;
  onOpen?: (gameId: number) => void;
}) {
  const body = (
    <>
      <img
        src={(g.alias && championSquare(g.alias)) || undefined}
        alt=""
        width={size}
        height={size}
      />
      <span className="mayhem-game-main">
        <b>{g.win ? 'Win' : 'Loss'}</b>
        <span>
          {g.name} · {g.kda}
        </span>
      </span>
      <span className="mayhem-game-when">{ago(g.at, Date.now())}</span>
      <span className="mayhem-game-grade">
        <GradeMark grade={g.grade} size={size - 12} />
        <span className="mayhem-mp" data-down={(g.gain ?? 0) < 0}>
          {gainText(g.gain)}
        </span>
      </span>
    </>
  );
  return (
    <li key={g.gameId} className="mayhem-in" data-win={g.win} style={step(index + 3)}>
      {onOpen ? (
        <button
          type="button"
          className="mayhem-game-open"
          onClick={() => onOpen(g.gameId)}
          title="View on mayhemstats.lol"
        >
          {body}
        </button>
      ) : (
        body
      )}
    </li>
  );
}

/** The last games, newest first (the player card). */
export function MatchList({ games }: { games: MeView['recent'] }) {
  return (
    <More
      list={games}
      className="mayhem-games"
      render={(g, i) => <GameRow key={g.gameId} game={g} index={i} size={52} />}
    />
  );
}

/** The last games on the Rank page (the whole list is its own page, Match history). */
const RANK_GAMES = 5;
/** Leaderboard rows before "Show more" (the player's own row always shows). */
const LADDER_FIRST = 25;

/** Who leads, and where am I? The leaderboard with profile icons first (user, 08.10.2026: "mehr auf
 * Player-Rangliste gehen … Match History sekundär"), the rank card and the last games beside it. */
export function RankPage({
  me,
  onRetry,
  find,
  onFind,
  onPreviewCard,
  onHistory,
}: {
  me: MeState;
  onRetry: () => void;
  /** The browser preview's look at the card after a game (mock.ts). */
  onPreviewCard: () => void;
  /** Opens the page Match history. */
  onHistory: () => void;
} & Finding) {
  const got = ready(me);
  const own = got?.me ?? null;
  const rank = own?.rank ?? null;
  return (
    <div className="mayhem-page">
      <PageHead
        title="Rank"
        line={`Who leads on mayhemstats.lol, ${season()}?`}
        badge={got?.mock ? 'Mock' : undefined}
        action={
          got?.mock && (
            <button type="button" className="mayhem-button small" onClick={onPreviewCard}>
              Preview card
            </button>
          )
        }
      />
      <div className="mayhem-columns mayhem-columns-end">
        <section className="mayhem-section">
          <h2 className="mayhem-in" style={step(1)}>
            Leaderboard
          </h2>
          {got && got.ladder.length > 0 ? (
            <More
              list={got.ladder}
              first={LADDER_FIRST}
              className="mayhem-ladder"
              keep={(p) => p.me}
              render={(p, i) => (
                <li
                  key={p.place}
                  className="mayhem-in"
                  data-place={p.place}
                  data-me={p.me}
                  style={step(i + 2)}
                  title={p.rank ? `${p.rank.points} MP` : undefined}
                >
                  <b className="mayhem-place">{p.place}</b>
                  {p.icon === null ? (
                    <span className="mayhem-ladder-icon" aria-hidden />
                  ) : (
                    <img
                      className="mayhem-ladder-icon"
                      src={profileIcon(p.icon)}
                      alt=""
                      width={36}
                      height={36}
                      loading="lazy"
                    />
                  )}
                  <span className="mayhem-aug-name">
                    <PlayerName id={p.siteId} name={p.name} />
                    {p.me && <span className="mayhem-ladder-you">You</span>}
                  </span>
                  <span className="mayhem-ladder-rank">
                    {p.rank && <img src={rankImage(p.rank)} alt="" width={30} height={30} />}
                    {p.rank ? rankName(p.rank) : '–'}
                  </span>
                </li>
              )}
            />
          ) : (
            <p className="mayhem-note mayhem-in">
              {got ? 'Nobody is ranked yet.' : 'Shows up with the website.'}
            </p>
          )}
        </section>
        <div className="mayhem-column-side">
          <section className="mayhem-glass mayhem-rank mayhem-in" style={step(1)}>
            {own && rank && <img src={rankImage(rank)} alt="" width={88} height={88} />}
            <div>
              {own ? (
                <>
                  <div className="mayhem-note">
                    <PlayerName id={got!.siteId} name={got!.name} />
                  </div>
                  <div className="mayhem-rank-name">{rank ? rankName(rank) : '–'}</div>
                  <div className="mayhem-note">
                    {rank ? mpLine(own, rank) : `Placement ${own.placed}/${PLACEMENT}`}
                  </div>
                  <div className="mayhem-bar">
                    <span
                      style={{
                        width: `${rank ? (rank.division === null ? 100 : rank.points) : (own.placed / PLACEMENT) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="mayhem-rank-facts">{winLoss(own)}</div>
                </>
              ) : (
                <MeNotice me={me} onRetry={onRetry} find={find} onFind={onFind} />
              )}
            </div>
          </section>
          {own && (
            <section className="mayhem-section">
              <div className="mayhem-row-head mayhem-in" style={step(2)}>
                <h2>Last games</h2>
                {own.recent.length > 0 && (
                  <button type="button" className="mayhem-link" onClick={onHistory}>
                    See all
                  </button>
                )}
              </div>
              {own.recent.length ? (
                <ul className="mayhem-games compact">
                  {own.recent.slice(0, RANK_GAMES).map((g, i) => (
                    <GameRow key={g.gameId} game={g} index={i} size={40} />
                  ))}
                </ul>
              ) : (
                <p className="mayhem-note mayhem-in">No rated games yet.</p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/** Rows of the match history before "Show more". */
const HISTORY_FIRST = 10;

/** How did my games go? Every rated Mayhem game of the player, newest first; a click opens the game
 * on mayhemstats.lol (user, 08.10.2026: "Match History hinzufügen als Tab"). */
export function MatchHistoryPage({
  me,
  onRetry,
  find,
  onFind,
}: { me: MeState; onRetry: () => void } & Finding) {
  const got = ready(me);
  const own = got?.me ?? null;
  return (
    <div className="mayhem-page">
      <PageHead
        title="Match history"
        line={
          own
            ? `How did your games go? ${games(own.recent.length)} rated on mayhemstats.lol, ${winLoss(own)}.`
            : 'Your rated Mayhem games on mayhemstats.lol.'
        }
        badge={got?.mock ? 'Mock' : undefined}
      />
      {own?.recent.length ? (
        <More
          list={own.recent}
          first={HISTORY_FIRST}
          className="mayhem-games mayhem-history"
          render={(g, i) => (
            <GameRow
              key={g.gameId}
              game={g}
              index={i}
              size={52}
              onOpen={got?.mock ? undefined : (id) => void openGame(id)}
            />
          )}
        />
      ) : own ? (
        <p className="mayhem-note mayhem-in">No rated games yet.</p>
      ) : (
        <section className="mayhem-glass mayhem-notice mayhem-in">
          <MeNotice me={me} onRetry={onRetry} find={find} onFind={onFind} />
        </section>
      )}
    </div>
  );
}

/** Top augments on Home: as many as fit one row (mayhem.css hides the rest). */
const HOME_AUGMENTS = 8;
/** Last games on Home (all of them on the page Match history). */
const HOME_GAMES = 6;
/** One row of Home's "Around you". */
const ladderRow = (p: LadderRow, style: CSSProperties) => (
  <li
    key={p.place}
    className="mayhem-in"
    data-place={p.place}
    data-me={p.me}
    style={style}
    title={p.rank ? `${p.rank.points} MP` : undefined}
  >
    <b className="mayhem-place">{p.place}</b>
    {p.rank && <img src={rankImage(p.rank)} alt="" width={34} height={34} />}
    <span className="mayhem-aug-name">
      <PlayerName id={p.siteId} name={p.name} />
    </span>
    <span className="mayhem-ladder-rank">{p.rank ? rankName(p.rank) : '–'}</span>
  </li>
);

/** Strong champions on Home: the same tiles and row as the augments. */
const HOME_CHAMPIONS = 8;

/**
 * Home (user, 08.10.2026: the dashboard of the canvas "App · Home"). Its question: how am I doing,
 * and what is strong right now? The most played champion, the top augments (arammeta.com) and the
 * last games, with the rank, numbers and records in a bento column. The player comes from
 * mayhemstats.lol (me.ts); without one a small notice says why.
 */
export function HomePage({
  tiers,
  me,
  onOpen,
  onAugment,
  onChampion,
  onRetry,
  find,
  onFind,
}: {
  tiers: TierState;
  me: MeState;
  onOpen: (page: Page) => void;
  onAugment: (id: number) => void;
  onChampion: (id: number) => void;
  onRetry: () => void;
} & Finding) {
  const top = tiers.state === 'ready' ? tiers.lists.augments.slice(0, HOME_AUGMENTS) : [];
  const strong = tiers.state === 'ready' ? tiers.lists.champions.slice(0, HOME_CHAMPIONS) : [];
  const got = ready(me);
  const own = got?.me ?? null;
  const main = own?.main ?? null;
  const splash = main?.alias ? championSplash(main.alias) : null;
  const curve = own ? curvePath(own.curve) : null;
  return (
    <div className="mayhem-home">
      <div className="mayhem-home-main">
        {main ? (
          <section
            className="mayhem-hero-big mayhem-in"
            style={splash ? { ['--splash' as string]: `url("${splash}")` } : undefined}
          >
            {got?.mock && <span className="mayhem-pill mock">Mock</span>}
            <div className="mayhem-hero-text">
              <span className="mayhem-kicker">Your most played champion</span>
              <h1>{main.name}</h1>
              <p>
                {percent(main.wins / main.games)} wins · {games(main.games)}
              </p>
              <div className="mayhem-hero-actions">
                <button
                  type="button"
                  className="mayhem-button primary"
                  onClick={() => onOpen('champions')}
                >
                  Tier list
                </button>
                <button type="button" className="mayhem-button" onClick={() => onOpen('history')}>
                  Match history
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="mayhem-glass mayhem-notice mayhem-in">
            {got?.mock && <span className="mayhem-pill mock">Mock</span>}
            {own ? (
              <>
                <h1>No games yet</h1>
                <p>Your rated games on mayhemstats.lol show up here.</p>
              </>
            ) : (
              <MeNotice me={me} onRetry={onRetry} find={find} onFind={onFind} />
            )}
          </section>
        )}

        <section className="mayhem-row">
          <div className="mayhem-row-head mayhem-in" style={step(2)}>
            <h2>Top augments</h2>
            {tiers.state === 'ready' && tiers.lists.mock && (
              <span className="mayhem-pill mock">Mock</span>
            )}
            <button type="button" className="mayhem-link" onClick={() => onOpen('augments')}>
              See all
            </button>
          </div>
          {top.length ? (
            <div className="mayhem-mini-grid">
              {top.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  className="mayhem-mini mayhem-in"
                  data-rarity={a.rarity}
                  style={step(i + 3)}
                  onClick={() => onAugment(a.id)}
                  title={`${winsIn(a.winRate, a.games)}\n${a.text}`}
                >
                  <span className="mayhem-aug-card-tier" data-tier={a.tier}>
                    {a.tier}
                  </span>
                  <span className="mayhem-aug-card-icon small">
                    {a.image && <img src={a.image} alt="" width={40} height={40} />}
                  </span>
                  <b>{a.name}</b>
                  <small>{percent(a.winRate)} wins</small>
                </button>
              ))}
            </div>
          ) : (
            <p className="mayhem-note">
              {tiers.state === 'failed' ? tiers.message : 'Loading the list from arammeta.com …'}
            </p>
          )}
        </section>

        <section className="mayhem-row">
          <div className="mayhem-row-head mayhem-in" style={step(7)}>
            <h2>Last games</h2>
            {own?.recent.length ? (
              <button type="button" className="mayhem-link" onClick={() => onOpen('history')}>
                See all
              </button>
            ) : null}
          </div>
          {own?.recent.length ? (
            <div className="mayhem-game-cards">
              {own.recent.slice(0, HOME_GAMES).map((g, i) => {
                const art = g.alias ? championSplash(g.alias) : null;
                return (
                  <article
                    key={g.gameId}
                    className="mayhem-game-card mayhem-in"
                    data-win={g.win}
                    title={`${g.name} · ${g.kda}`}
                    style={{
                      ...step(i + 8),
                      ...(art ? { ['--splash' as string]: `url("${art}")` } : {}),
                    }}
                  >
                    <div>
                      <b>{g.win ? 'Win' : 'Loss'}</b>
                      <small>{ago(g.at, Date.now())}</small>
                    </div>
                    <strong>{gainText(g.gain)}</strong>
                    <GradeMark grade={g.grade} size={44} />
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="mayhem-note">
              {own ? 'No rated games yet.' : 'Shows up with your player.'}
            </p>
          )}
        </section>

        {strong.length > 0 && (
          <section className="mayhem-row">
            <div className="mayhem-row-head mayhem-in" style={step(12)}>
              <h2>Strong champions right now</h2>
              <button type="button" className="mayhem-link" onClick={() => onOpen('champions')}>
                See all
              </button>
            </div>
            <div className="mayhem-mini-grid">
              {strong.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  className="mayhem-mini mayhem-in"
                  style={step(i + 13)}
                  onClick={() => onChampion(c.id)}
                  title={winsIn(c.winRate, c.games)}
                >
                  <span className="mayhem-aug-card-tier" data-tier={c.tier}>
                    {c.tier}
                  </span>
                  <span className="mayhem-aug-card-icon small">
                    <img src={championSquare(c.alias) ?? undefined} alt="" width={40} height={40} />
                  </span>
                  <b>{c.name}</b>
                  <small>{percent(c.winRate)} wins</small>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <aside className="mayhem-bento">
        <section className="mayhem-glass mayhem-bento-rank mayhem-in" style={step(1)}>
          <div className="mayhem-bento-rank-head">
            <div>
              <span className="mayhem-note">{season()}</span>
              <div className="mayhem-rank-name">{own?.rank ? rankName(own.rank) : '–'}</div>
              <span className="mayhem-note">
                {own?.rank
                  ? mpLine(own, own.rank)
                  : own
                    ? `Placement ${own.placed}/${PLACEMENT}`
                    : '–'}
              </span>
            </div>
            {own?.rank && <img src={rankImage(own.rank)} alt="" width={76} height={76} />}
          </div>
          {curve && (
            <>
              <svg
                viewBox={`0 0 ${CURVE_SIZE.width} ${CURVE_SIZE.height}`}
                className="mayhem-curve"
                role="img"
                aria-label="Rank over the last games"
              >
                <defs>
                  <linearGradient id="mayhem-mp" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" style={{ stopColor: 'var(--accent)', stopOpacity: 0.35 }} />
                    <stop offset="1" style={{ stopColor: 'var(--accent)', stopOpacity: 0 }} />
                  </linearGradient>
                </defs>
                <path d={curve.area} fill="url(#mayhem-mp)" />
                <path className="mayhem-curve-line" d={curve.line} />
                <circle
                  cx={curve.end[0]}
                  cy={curve.end[1]}
                  r="4"
                  style={{ fill: 'var(--accent-soft)' }}
                />
              </svg>
              <div className="mayhem-curve-scale">
                <span>{own!.curve.length} games ago</span>
                <span>now</span>
              </div>
            </>
          )}
        </section>
        <div className="mayhem-bento-pair">
          <section className="mayhem-tile mayhem-in" style={step(2)}>
            <span className="mayhem-note">Games</span>
            <strong>{own ? number(own.games) : '–'}</strong>
            {own && <small>{winLoss(own)}</small>}
          </section>
          <section className="mayhem-tile mayhem-in" style={step(3)}>
            <span className="mayhem-note">Avg grade</span>
            <span className="mayhem-tile-grade">
              {own?.average ? <GradeMark grade={own.average} size={40} /> : <strong>–</strong>}
            </span>
          </section>
        </div>
        <section className="mayhem-tile mayhem-in" style={step(4)}>
          <span className="mayhem-note">Records</span>
          <div className="mayhem-records">
            <span data-best="true">
              <strong>{own?.best.damage != null ? number(own.best.damage) : '–'}</strong>
              <small>Most damage</small>
            </span>
            <span data-best="false">
              <strong>{own?.best.kills != null ? own.best.kills : '–'}</strong>
              <small>Most kills</small>
            </span>
          </div>
        </section>
        {own && !own.rank && (
          <section className="mayhem-goal mayhem-in" style={step(5)}>
            <span className="mayhem-kicker">Placement</span>
            <strong>{games(PLACEMENT - Math.min(own.placed, PLACEMENT))} to your rank</strong>
            <small>Your rank shows after {PLACEMENT} rated games.</small>
            <div className="mayhem-bar">
              <span style={{ width: `${(Math.min(own.placed, PLACEMENT) / PLACEMENT) * 100}%` }} />
            </div>
          </section>
        )}
        {got && got.around.length > 0 && (
          <section className="mayhem-tile mayhem-in" style={step(6)}>
            <span className="mayhem-note">Around you</span>
            <ul className="mayhem-ladder">{got.around.map((p) => ladderRow(p, {}))}</ul>
          </section>
        )}
      </aside>
    </div>
  );
}
