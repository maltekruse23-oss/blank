import { useEffect, useRef, useState } from 'react';
import {
  House,
  LayoutGrid,
  Package,
  Plus,
  Sparkles,
  Swords,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import {
  leagueClientOpen,
  onChamp,
  onLeagueClient,
  readChampInfo,
  watchChamp,
  type HeldChamp,
} from '../adapters/aramChamp';
import { champView, SAMPLE_CHAMP, type ChampView } from '../features/aram/champCard';
import { MayhemCard } from './MayhemCard';
import { AugmentDetail, ChampionDetail, ItemsPage, PatchPage } from './metaPages';
import { AugmentsPage, ChampionsPage, HomePage, RankPage, type TierState } from './pages';
import { loadMe, type MeState } from './me';
import { loadTiers } from './tiers';

export type Page = 'home' | 'champ' | 'augments' | 'champions' | 'items' | 'patch' | 'rank';

/** The sidebar (user, 08.10.2026: dashboard like the canvas "App · Home"; the app grows by
 * entries like these, the dashed "Soon" marks the room for the next ones). English only. */
const PAGES: { id: Page; label: string; Icon: typeof Swords }[] = [
  { id: 'home', label: 'Home', Icon: House },
  { id: 'champ', label: 'Champ', Icon: Swords },
  { id: 'augments', label: 'Augments', Icon: Sparkles },
  { id: 'champions', label: 'Champions', Icon: LayoutGrid },
  { id: 'items', label: 'Items', Icon: Package },
  { id: 'patch', label: 'Patch', Icon: TrendingUp },
  { id: 'rank', label: 'Rank', Icon: Trophy },
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

/** Home and Rank ask mayhemstats.lol again when opened after this long (ranks change per game). */
const ME_FRESH_MS = 2 * 60_000;

/** Swaps and rerolls come in quick turns: the card waits for the pick to settle this long. */
const SETTLE_MS = 600;

type Shown =
  | { state: 'none' }
  | { state: 'loading'; champ: HeldChamp }
  | { state: 'failed'; champ: HeldChamp; sample: boolean }
  | { state: 'ready'; view: ChampView; sample: boolean };

/**
 * The Mayhem app (src-tauri/src/mayhem.rs, user's wish: "ganz schlicht", the card "direkt in der
 * App"): one window with the Champ-Karte of the champion held in an ARAM Mayhem champion select.
 * The card stays after the select, so its augment tiers can be looked up during the game, until
 * the next champion. English only (user's choice 08.10.2026).
 */
export function MayhemApp() {
  const [client, setClient] = useState<boolean | null>(null);
  const [shown, setShown] = useState<Shown>({ state: 'none' });
  const asked = useRef(0);
  const [page, setPage] = useState<Page>('home');
  const [tiers, setTiers] = useState<TierState | null>(null);
  const [me, setMe] = useState<MeState>({ state: 'loading' });
  const meAsked = useRef({ ask: 0, at: 0 });

  const fetchTiers = () => requestTiers(setTiers);
  /** The player from mayhemstats.lol; a shown player stays while it is asked again. */
  const fetchMe = () => {
    const ask = ++meAsked.current.ask;
    meAsked.current.at = Date.now();
    setMe((old) => (old.state === 'ready' ? old : { state: 'loading' }));
    void loadMe().then((next) => ask === meAsked.current.ask && setMe(next));
  };
  const fetchMeRef = useRef(fetchMe);
  fetchMeRef.current = fetchMe;
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
    if (next !== 'champ' && next !== 'rank' && (!tiers || tiers.state === 'failed')) fetchTiers();
    const stale = me.state !== 'ready' || Date.now() - meAsked.current.at > ME_FRESH_MS;
    if ((next === 'home' || next === 'rank') && stale) fetchMe();
  };

  const show = (champ: HeldChamp, sample: boolean) => {
    const ask = ++asked.current;
    setShown({ state: 'loading', champ });
    readChampInfo(champ.championId, true).then(
      (info) => {
        if (ask !== asked.current) return;
        const view = champView(champ, info);
        setShown(view ? { state: 'ready', view, sample } : { state: 'failed', champ, sample });
      },
      () => ask === asked.current && setShown({ state: 'failed', champ, sample }),
    );
  };
  const showRef = useRef(show);
  showRef.current = show;

  // Home shows the top augments: the list is asked for once at the start.
  useEffect(() => requestTiers(setTiers), []);

  // The player is asked for when the client opens or closes (also at the start).
  useEffect(() => {
    if (client !== null) fetchMeRef.current();
  }, [client]);

  useEffect(() => {
    void leagueClientOpen().then(setClient);
    const stopClient = onLeagueClient(setClient);
    void watchChamp(true);
    let timer = 0;
    const stopChamp = onChamp((champ) => {
      window.clearTimeout(timer);
      if (champ.championId <= 0) return;
      timer = window.setTimeout(() => {
        // A champion select: the card comes to the front.
        setPage('champ');
        showRef.current(champ, false);
      }, SETTLE_MS);
    });
    return () => {
      window.clearTimeout(timer);
      stopChamp();
      stopClient();
      void watchChamp(false);
    };
  }, []);

  const tierState = tiers ?? { state: 'loading' };
  const lists = tierState.state === 'ready' ? tierState.lists : null;
  const champion = lists?.champions.find((c) => c.id === detail.champion);
  const augment = lists?.augments.find((a) => a.id === detail.augment);
  const toChampion = (id: number) => openDetail('champions', { champion: id });
  const toAugment = (id: number) => openDetail('augments', { augment: id });

  return (
    <div className="mayhem">
      <aside className="mayhem-side">
        <span className="mayhem-logo" aria-label="Mayhem">
          m
        </span>
        <nav className="mayhem-nav" aria-label="Sections">
          {PAGES.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={page === id ? 'page' : undefined}
              onClick={() => open(id)}
            >
              <Icon size={20} strokeWidth={1.9} aria-hidden />
              <span>{label}</span>
            </button>
          ))}
          <span className="mayhem-soon" title="More sections are coming">
            <Plus size={20} strokeWidth={1.9} aria-hidden />
            <span>Soon</span>
          </span>
        </nav>
        <span
          className="mayhem-client"
          data-open={client === true}
          title={client ? 'League client is open' : 'League client is closed'}
        >
          Client
        </span>
      </aside>
      <main className="mayhem-main" key={page} ref={mainRef}>
        <div className="mayhem-wrap">
          {page === 'home' ? (
            <HomePage
              tiers={tierState}
              me={me}
              onOpen={open}
              onAugment={toAugment}
              onRetry={fetchMe}
            />
          ) : page === 'augments' ? (
            <>
              <div hidden={!!augment}>
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
              <div hidden={!!champion}>
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
          ) : page === 'items' ? (
            <ItemsPage tiers={tierState} onRetry={fetchTiers} />
          ) : page === 'patch' ? (
            <PatchPage
              tiers={tierState}
              onRetry={fetchTiers}
              onChampion={toChampion}
              onAugment={toAugment}
            />
          ) : page === 'rank' ? (
            <RankPage me={me} onRetry={fetchMe} />
          ) : shown.state === 'ready' ? (
            <MayhemCard
              key={`${shown.view.championId}-${shown.sample}`}
              view={shown.view}
              sample={shown.sample}
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
          ) : (
            <div className="mayhem-wait">
              <div className="mayhem-glow mayhem-in">
                <h1>{client ? 'Waiting for champion select' : 'Start League'}</h1>
                <p>Your build shows up here once you hold a champion in ARAM Mayhem.</p>
                <button
                  type="button"
                  className="mayhem-button primary"
                  onClick={() => show(SAMPLE_CHAMP, true)}
                >
                  Example: {SAMPLE_CHAMP.name}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
