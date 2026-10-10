import { useEffect, useRef, useState } from 'react';
import { Crown, History, House, LayoutGrid, Plus, Sparkles, Swords, Trophy } from 'lucide-react';
import {
  leagueClientOpen,
  markTaken,
  onChamp,
  onChampOffer,
  onLeagueClient,
  onOffers,
  readChampInfo,
  watchChamp,
  type HeldChamp,
} from '../adapters/aramChamp';
import { isTauri } from '@tauri-apps/api/core';
import {
  findRank,
  onGameCard,
  onRankUpload,
  onRankUploaded,
  type GameCard,
} from '../adapters/aramSite';
import { Guard } from '../components/Guard';
import { champView, type ChampView, type Offer } from '../features/aram/champCard';
import { AfterGame } from './AfterGameView';
import { cardRank, inEnglish, RANK_ASKS, RANK_GIVE_UP, type CardRank } from './afterGame';
import { found, type FindState } from './findRank';
import {
  CARD_PREVIEWS,
  mockAugmentOffer,
  mockCard,
  mockChampView,
  mockOffer,
  type CardPreview,
} from './mock';
import { MayhemCard } from './MayhemCard';
import { PickView } from './PickView';
import { PlayerCard, PlayerProvider, type Who } from './PlayerCard';
import { AugmentDetail, ChampionDetail } from './metaPages';
import {
  AugmentsPage,
  ChampionsPage,
  HomePage,
  MatchHistoryPage,
  RankPage,
  type TierState,
} from './pages';
import { loadMe, savedMe, withChampions, type BoardRow, type MeState } from './me';
import { loadRecords, type RecordCard } from './records';
import { RecordsPage } from './RecordsPage';
import { loadTiers, type TierAugment, type TierChampion, type TierLists } from './tiers';
import { RETRY_MS, useRefresh } from './ui';
import { UpdateButton } from './UpdateButton';
import { WindowBar } from './WindowBar';
// The app's own icon (mayhem.ico is made from the same file), so the logo and the EXE match.
import logo from '../../src-tauri/icons/mayhem.svg';

/** Stable while the leaderboard loads (the player card reloads when it changes). */
const NO_BOARD: BoardRow[] = [];
/** Stable while the lists load (the player card reloads when its champions change). */
const NO_CHAMPIONS: TierChampion[] = [];
const NO_AUGMENTS: TierAugment[] = [];

export type Page = 'home' | 'champ' | 'augments' | 'champions' | 'rank' | 'history' | 'records';

/** The sidebar (user, 08.10.2026: dashboard like the canvas "App · Home"; the app grows by
 * entries like these, the dashed "Soon" marks the room for the next ones). English only. */
/** Groups apart by a thin line only (user, 08.10.2026): Home, then arammeta's data we import, then
 * our own from mayhemstats.lol. */
const PAGES: { id: Page; label: string; Icon: typeof Swords }[][] = [
  [{ id: 'home', label: 'Home', Icon: House }],
  [
    { id: 'champ', label: 'Champ', Icon: Swords },
    { id: 'augments', label: 'Augments', Icon: Sparkles },
    { id: 'champions', label: 'Champions', Icon: LayoutGrid },
  ],
  [
    { id: 'rank', label: 'Rank', Icon: Trophy },
    { id: 'records', label: 'Records', Icon: Crown },
    { id: 'history', label: 'Matches', Icon: History },
  ],
];

/** The tier lists from arammeta.com into `set` (loading, then ready or failed). Rust's reasons are
 * German (blank.'s), so the Mayhem app says it in its own words. */
function requestTiers(set: (tiers: TierState) => void) {
  set({ state: 'loading' });
  loadTiers().then(
    (lists) => set({ state: 'ready', lists }),
    () => set({ state: 'failed', message: 'arammeta.com did not answer. Check your connection.' }),
  );
}

/** Home, Rank, Matches and Records ask mayhemstats.lol again for the player after this long, by
 * themselves while shown and when opened (ranks change per game). */
const ME_FRESH_MS = 60_000;

/** Swaps and rerolls come in quick turns: the card waits for the pick to settle this long. */
const SETTLE_MS = 600;

/** The card after a game (afterGame.ts): from Rust, or invented in the browser preview (then with
 * its rank line). `gaveUp`: the game did not arrive on mayhemstats.lol while the card waited. */
type After = { card: GameCard; records: RecordCard[]; rank?: CardRank; gaveUp: boolean };

const preview = (kind: CardPreview): After => ({ ...mockCard(kind), gaveUp: false });

/** `mayhem.html?card=legend` opens that card in the browser preview (mock.ts). */
function previewFromAddress(): After | null {
  const kind = new URLSearchParams(window.location.search).get('card');
  return !isTauri() && CARD_PREVIEWS.includes(kind as CardPreview)
    ? preview(kind as CardPreview)
    : null;
}

/** The browser preview's Champ card (`mayhem.html?champ`), the same in a game with an augment
 * offer open (`?offer`) or the pick screen (`?pick`), invented, marked "Mock". */
function champFromAddress(): Shown {
  const address = new URLSearchParams(window.location.search);
  if (isTauri()) return { state: 'none' };
  if (address.has('pick')) return { state: 'pick', offered: mockOffer(), sample: true };
  if (address.has('champ') || address.has('offer'))
    return { state: 'ready', view: mockChampView(), sample: true, chosen: null };
  return { state: 'none' };
}

/** The augment offer of the game (offers.rs), with the champion it is for (0: not seen); `open`
 * false: closed, `augments` are the last offer's. */
type GameOffer = Offer & { championId: number; open?: boolean };

const offerFromAddress = (): GameOffer | null =>
  !isTauri() && new URLSearchParams(window.location.search).has('offer')
    ? { ...mockAugmentOffer(), championId: mockChampView().championId }
    : null;

/** One Guard and one fresh card per pick screen and per champion. */
const champKey = (shown: Shown) =>
  shown.state === 'pick'
    ? `pick-${shown.offered.map((c) => c.championId).join('-')}`
    : shown.state === 'ready'
      ? `card-${shown.view.championId}-${shown.sample}`
      : shown.state;

type Shown =
  | { state: 'none' }
  /** ARAM Mayhem's card phase: the dealt champions, a click picks one (PickView.tsx). */
  | { state: 'pick'; offered: HeldChamp[]; sample: boolean }
  | { state: 'loading'; champ: HeldChamp }
  | { state: 'failed'; champ: HeldChamp; sample: boolean }
  /** `chosen`: the build chosen by hand on this card (held for the game, across pages). */
  | { state: 'ready'; view: ChampView; sample: boolean; chosen: string | null };

/**
 * The Mayhem app (src-tauri/src/mayhem.rs, user's wish: "ganz schlicht", the card "direkt in der
 * App"): one window with the Champ-Karte of the champion held in an ARAM Mayhem champion select.
 * The card stays after the select, so its augment tiers can be looked up during the game, until
 * the next champion. English only (user's choice 08.10.2026).
 */
export function MayhemApp() {
  const [client, setClient] = useState<boolean | null>(null);
  const [shown, setShown] = useState<Shown>(champFromAddress);
  const asked = useRef(0);
  const [page, setPage] = useState<Page>(() =>
    champFromAddress().state === 'none' ? 'home' : 'champ',
  );
  const [tiers, setTiers] = useState<TierState | null>(null);
  const [me, setMe] = useState<MeState>(() => savedMe() ?? { state: 'loading' });
  const meAsked = useRef({ ask: 0, at: 0 });

  const fetchTiers = () => requestTiers(setTiers);
  /** The player from mayhemstats.lol; a shown player (or "client closed") stays while it is asked again. */
  const fetchMe = () => {
    const ask = ++meAsked.current.ask;
    meAsked.current.at = Date.now();
    setMe((old) => (old.state === 'ready' || old.state === 'closed' ? old : { state: 'loading' }));
    // A quiet refresh that fails keeps the shown player (it tries again by itself).
    void loadMe().then(
      (next) =>
        ask === meAsked.current.ask &&
        setMe((old) => (next.state === 'failed' && old.state === 'ready' ? old : next)),
    );
  };
  const fetchMeRef = useRef(fetchMe);
  fetchMeRef.current = fetchMe;
  const [find, setFind] = useState<FindState>({ state: 'idle' });
  /** "Find my Mayhem rank": uploads the games, then shows the player (findRank.ts). */
  const findMine = () => {
    setFind({ state: 'uploading', done: 0, total: 0 });
    const stop = onRankUpload((p) =>
      setFind((old) => (old.state === 'uploading' ? { state: 'uploading', ...p } : old)),
    );
    findRank()
      .then(
        (answer) => {
          const next = found(answer);
          // Replaces a player still being asked for.
          meAsked.current = { ask: meAsked.current.ask + 1, at: Date.now() };
          setMe(next.me);
          setFind(next.find);
        },
        (error: unknown) =>
          setFind({
            state: 'failed',
            message: typeof error === 'string' ? error : 'mayhemstats.lol did not take the games.',
          }),
      )
      .finally(stop);
  };
  /** A champion or augment opened from a list (its page keeps the list's filters underneath). */
  const [detail, setDetail] = useState<{ champion?: number; augment?: number }>({});
  const mainRef = useRef<HTMLElement>(null);
  const openDetail = (next: Page, which: { champion?: number; augment?: number }) => {
    setPage(next);
    setDetail(which);
    mainRef.current?.scrollTo(0, 0);
  };
  const open = (next: Page) => {
    setPage(next);
    setDetail({});
    const own = next === 'rank' || next === 'history';
    if (next !== 'champ' && !own && (!tiers || tiers.state === 'failed')) fetchTiers();
    const stale = me.state !== 'ready' || Date.now() - meAsked.current.at > ME_FRESH_MS;
    if ((next === 'home' || own || next === 'records') && stale) fetchMe();
  };

  const show = (held: HeldChamp, sample: boolean) => {
    // Data Dragon's key from arammeta's list: the client's differs for some (FiddleSticks).
    const alias = listsRef.current?.champions.find((c) => c.id === held.championId)?.alias;
    const champ = alias ? { ...held, alias } : held;
    const ask = ++asked.current;
    setShown({ state: 'loading', champ });
    readChampInfo(champ.championId, true, champ.alias).then(
      (info) => {
        if (ask !== asked.current) return;
        const view = champView(champ, info);
        setShown(
          view
            ? { state: 'ready', view, sample, chosen: null }
            : { state: 'failed', champ, sample },
        );
      },
      () => ask === asked.current && setShown({ state: 'failed', champ, sample }),
    );
  };
  const showRef = useRef(show);
  showRef.current = show;
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const listsRef = useRef<TierLists | null>(null);
  /** In the game: the augment offer open now (or the last one) and what was taken. */
  const [offer, setOffer] = useState<GameOffer | null>(offerFromAddress);
  /** A click on an offered card: taken, a second click undoes it (offers.rs answers with the new
   * list); in the browser preview the Mock offer itself. */
  const take = (id: number) => {
    if (isTauri()) return void markTaken(id);
    setOffer(
      (old) =>
        old && {
          ...old,
          taken: old.taken.some((t) => t.id === id)
            ? old.taken.filter((t) => t.id !== id)
            : [...old.taken, ...old.augments.filter((a) => a.id === id)],
        },
    );
  };

  // Home shows the top augments: the list is asked for once at the start.
  useEffect(() => requestTiers(setTiers), []);

  // The player is asked for when the client opens or closes (also at the start), and after games
  // went up by themselves (aram/ladder.rs). An earlier click's answer may be another account's.
  useEffect(() => {
    if (client === null) return;
    fetchMeRef.current();
    setFind((old) => (old.state === 'uploading' ? old : { state: 'idle' }));
  }, [client]);
  useEffect(() => onRankUploaded(() => fetchMeRef.current()), []);

  const [after, setAfter] = useState<After | null>(previewFromAddress);
  /** "Simulate game" on the Rank page: which made-up card comes next. */
  const simulated = useRef(0);
  /** A champion select runs: the card stays hidden until it ends (the Champ card comes first). */
  const [selecting, setSelecting] = useState(false);
  // The card after each Mayhem game (aram/game_card.rs), compared with the site's all-time records
  // as they are now (the Records page's `mayhem_records`, one answer per card; without them no
  // chips).
  useEffect(
    () =>
      onGameCard((card) => {
        setAfter({ card, records: [], gaveUp: false });
        void loadRecords(false).then((got) => {
          if (got.state === 'ready')
            setAfter((old) => (old?.card === card ? { ...old, records: got.records.cards } : old));
        });
      }),
    [],
  );

  useEffect(() => {
    void leagueClientOpen().then(setClient);
    const stopClient = onLeagueClient(setClient);
    void watchChamp(true);
    let timer = 0;
    let select = false;
    // The pick screen shows (cards dealt), and the champion held (0: none yet).
    let dealt = false;
    let held = 0;
    // The pick screen's end, after SETTLE_MS: the cards' list may go before the session names the
    // pick (the order was never recorded live).
    let over = 0;
    const stopOffer = onChampOffer((offered) => {
      window.clearTimeout(over);
      if (offered.length) {
        // At once (the card phase lasts about 12 s); a champion's numbers still coming stay out.
        window.clearTimeout(timer);
        ++asked.current;
        if (!select) setAfter(null);
        setOffer(null);
        select = true;
        dealt = true;
        held = 0;
        setSelecting(true);
        setShown({ state: 'pick', offered, sample: false });
        setPage('champ');
        return;
      }
      if (!dealt) return;
      dealt = false;
      // A picked champion goes on to its card (onChamp); without one the select is over.
      over = window.setTimeout(() => {
        if (held) return;
        select = false;
        setSelecting(false);
        setShown((old) => (old.state === 'pick' ? { state: 'none' } : old));
        setPage((old) => (old === 'champ' ? 'home' : old));
      }, SETTLE_MS);
    });
    const stopChamp = onChamp((champ) => {
      window.clearTimeout(timer);
      held = champ.championId;
      const now = champ.championId > 0;
      // A new champion select closes the card of the game before; a card that comes during the
      // select (from the history, minutes after the game) shows once it ends.
      if (now && !select) setAfter(null);
      select = now;
      setSelecting(now);
      if (!now) return;
      // A new champion select: the last game's offer and taken augments are gone.
      setOffer(null);
      timer = window.setTimeout(() => {
        // A champion select: the card comes to the front.
        setPage('champ');
        showRef.current(champ, false);
      }, SETTLE_MS);
    });
    // In an ARAM Mayhem game Rust reads the augment offers off the screen by itself (offers.rs,
    // always on in this app): an offer brings the Champ page to the front with the champion's card.
    let offerOpen = false;
    const stopOffers = onOffers((event) => {
      const { championId } = event;
      setOffer((old) => ({
        championId,
        direction: event.direction,
        // Closed: the last offer's cards stay clickable, for the one taken when the screen missed it.
        augments: event.offers.length ? event.offers : (old?.augments ?? []),
        open: event.offers.length > 0,
        taken: event.taken,
      }));
      const opens = event.offers.length > 0 && !offerOpen;
      offerOpen = event.offers.length > 0;
      const at = shownRef.current;
      // No champion known and no card: no empty page to jump to.
      if (!opens || (championId <= 0 && at.state === 'none')) return;
      setPage('champ');
      const held =
        (at.state === 'ready' && at.view.championId === championId) ||
        ((at.state === 'loading' || at.state === 'failed') && at.champ.championId === championId);
      if (championId <= 0 || held) return;
      // The app started during the game, or showed another card: the champion's own.
      const known = listsRef.current?.champions.find((c) => c.id === championId);
      showRef.current({ championId, alias: known?.alias ?? '', name: known?.name ?? '' }, false);
    });
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(over);
      stopOffer();
      stopOffers();
      stopChamp();
      stopClient();
      void watchChamp(false);
    };
  }, []);

  // Nothing needs a click: shown data refreshes by itself, failed answers are asked again.
  const mePage = page === 'home' || page === 'rank' || page === 'history' || page === 'records';
  useRefresh(fetchMe, mePage ? (me.state === 'failed' ? RETRY_MS : ME_FRESH_MS) : null);
  useRefresh(fetchTiers, tiers?.state === 'failed' ? RETRY_MS : null);
  useRefresh(
    () => shown.state === 'failed' && show(shown.champ, shown.sample),
    shown.state === 'failed' ? RETRY_MS : null,
  );

  const tierState = tiers ?? { state: 'loading' };
  const lists = tierState.state === 'ready' ? tierState.lists : null;
  listsRef.current = lists;
  /** The player card over everything (a click on any name, PlayerCard.tsx). */
  const [player, setPlayer] = useState<Who | null>(null);
  const champion = lists?.champions.find((c) => c.id === detail.champion);
  const augment = lists?.augments.find((a) => a.id === detail.augment);
  const toChampion = (id: number) => openDetail('champions', { champion: id });
  const toAugment = (id: number) => openDetail('augments', { augment: id });
  const meShown = withChampions(me, lists?.champions ?? []);

  const afterRank = after && (after.rank ?? cardRank(meShown, after.card.entry, after.gaveUp));
  // Only while a card waits for its game on mayhemstats.lol: the player is asked again a few times
  // (the upload after a game also asks, onRankUploaded), about two minutes at most.
  const waiting = !after?.rank && afterRank?.state === 'waiting';
  const afterGame = after?.card.entry.gameId;
  useEffect(() => {
    if (!waiting) return;
    const timers = RANK_ASKS.map((ms) => window.setTimeout(() => fetchMeRef.current(), ms));
    timers.push(
      window.setTimeout(() => setAfter((old) => old && { ...old, gaveUp: true }), RANK_GIVE_UP),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [waiting, afterGame]);

  return (
    <PlayerProvider value={setPlayer}>
      <div className="mayhem">
        <aside className="mayhem-side" data-tauri-drag-region>
          <img className="mayhem-logo" src={logo} alt="Mayhem" width={40} height={40} />
          <nav className="mayhem-nav" aria-label="Sections">
            {PAGES.map((group, g) => [
              g > 0 && <hr key={`line-${g}`} className="mayhem-nav-line" />,
              // Champ only once a champion select gave it a card (user, 09.10.2026: no waiting tab).
              ...group
                .filter(({ id }) => id !== 'champ' || shown.state !== 'none')
                .map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    aria-current={page === id ? 'page' : undefined}
                    onClick={() => open(id)}
                  >
                    <Icon size={20} strokeWidth={1.9} aria-hidden />
                    <span>{label}</span>
                  </button>
                )),
            ])}
            <span className="mayhem-soon" title="More sections are coming">
              <Plus size={20} strokeWidth={1.9} aria-hidden />
              <span>Soon</span>
            </span>
          </nav>
          <UpdateButton />
          <span
            className="mayhem-client"
            data-open={client === true}
            title={client ? 'League client is open' : 'League client is closed'}
          >
            {client === false ? 'Client offline' : 'Client'}
          </span>
        </aside>
        <div className="mayhem-body">
          <WindowBar />
          <main className="mayhem-main" key={page} ref={mainRef}>
            <div className="mayhem-wrap">
              {page === 'home' ? (
                <HomePage
                  me={meShown}
                  onOpen={open}
                  onChampion={toChampion}
                  onRetry={fetchMe}
                  find={find}
                  onFind={findMine}
                />
              ) : page === 'augments' ? (
                <>
                  <div className="mayhem-fill" hidden={!!augment}>
                    <AugmentsPage tiers={tierState} onRetry={fetchTiers} onSelect={toAugment} />
                  </div>
                  {lists && augment && (
                    <AugmentDetail
                      key={augment.id}
                      lists={lists}
                      augment={augment}
                      onBack={() => setDetail({})}
                      onChampion={toChampion}
                    />
                  )}
                </>
              ) : page === 'champions' ? (
                <>
                  <div className="mayhem-fill" hidden={!!champion}>
                    <ChampionsPage tiers={tierState} onRetry={fetchTiers} onSelect={toChampion} />
                  </div>
                  {lists && champion && (
                    <ChampionDetail
                      key={champion.id}
                      lists={lists}
                      champion={champion}
                      onBack={() => setDetail({})}
                      onChampion={toChampion}
                      onAugment={toAugment}
                    />
                  )}
                </>
              ) : page === 'rank' ? (
                <RankPage
                  me={meShown}
                  onRetry={fetchMe}
                  find={find}
                  onFind={findMine}
                  onPreviewCard={() => {
                    setAfter(preview(CARD_PREVIEWS[simulated.current % CARD_PREVIEWS.length]!));
                    simulated.current += 1;
                  }}
                  onHistory={() => open('history')}
                />
              ) : page === 'history' ? (
                <MatchHistoryPage me={meShown} onRetry={fetchMe} find={find} onFind={findMine} />
              ) : page === 'records' ? (
                <RecordsPage me={me} champions={lists?.champions ?? []} />
              ) : (
                // By card: a pick screen or card that failed to draw does not keep the next away.
                <Guard
                  key={champKey(shown)}
                  name="Champ"
                  fallback={(retry) => (
                    <div className="mayhem-glow mayhem-in mayhem-narrow">
                      <p>This card could not be drawn.</p>
                      <button type="button" className="mayhem-button" onClick={retry}>
                        Try again
                      </button>
                    </div>
                  )}
                >
                  {shown.state === 'pick' ? (
                    <PickView
                      offered={shown.offered}
                      champions={lists?.champions ?? NO_CHAMPIONS}
                      sample={shown.sample}
                    />
                  ) : shown.state === 'ready' ? (
                    <MayhemCard
                      view={shown.view}
                      sample={shown.sample}
                      champion={
                        lists?.champions.find((c) => c.id === shown.view.championId) ?? null
                      }
                      augments={lists?.augments ?? NO_AUGMENTS}
                      // Only the offer of this champion: one without a known champion (0) never lands
                      // on another champion's card.
                      offer={offer?.championId === shown.view.championId ? offer : null}
                      chosen={shown.chosen}
                      onTake={take}
                      onChoose={(key) =>
                        setShown((old) => (old.state === 'ready' ? { ...old, chosen: key } : old))
                      }
                      onClose={shown.sample ? () => setShown({ state: 'none' }) : undefined}
                    />
                  ) : shown.state === 'loading' ? (
                    <p className="mayhem-note mayhem-in">
                      Loading {shown.champ.name || shown.champ.alias} …
                    </p>
                  ) : shown.state === 'failed' ? (
                    <div className="mayhem-wait">
                      <div className="mayhem-glow mayhem-in">
                        <p>The numbers did not arrive. Check your connection.</p>
                        <button
                          type="button"
                          className="mayhem-button"
                          onClick={() => show(shown.champ, shown.sample)}
                        >
                          Try again
                        </button>
                      </div>
                    </div>
                  ) : null}
                </Guard>
              )}
            </div>
          </main>
        </div>
        {after && afterRank && !selecting && (
          // By game: a card that failed to draw does not keep the next one away.
          <Guard key={after.card.entry.gameId} name="Mayhem card" fallback={() => null}>
            <AfterGame
              card={inEnglish(after.card, lists)}
              records={after.records}
              siteId={meShown.state === 'ready' ? meShown.siteId : null}
              rank={afterRank}
              mock={!!after.rank}
              onClose={() => setAfter(null)}
              onFindRank={() => {
                setAfter(null);
                open('rank');
              }}
              onRetry={fetchMe}
            />
          </Guard>
        )}
        {player && (
          <Guard key={player.id} name="Player card" fallback={() => null}>
            <PlayerCard
              who={player}
              champions={lists?.champions ?? NO_CHAMPIONS}
              board={me.state === 'ready' ? me.board : NO_BOARD}
              onClose={() => setPlayer(null)}
            />
          </Guard>
        )}
      </div>
    </PlayerProvider>
  );
}
