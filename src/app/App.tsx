import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { mirrorSettings } from '../platform/store';
import { onTrayQuiet, setTrayQuiet } from '../platform/tray';
import { useDesign } from '../design/useDesign';
import { getMotion, spring } from '../design/motion';
import { useTilt } from '../design/useTilt';
import { AnimatePresence, MotionConfig, motion, type Variants } from 'motion/react';
import { gpu, updateNews } from '../platform/system';
import { PatchNotes } from './PatchNotes';
import { closeWindow, minimizeWindow } from '../platform/window';
import { playClose, playOpen, resetWindowFx } from './windowFx';
import {
  LayoutGrid,
  Radio,
  Trophy,
  Music as MusicIcon,
  Headphones,
  Cpu,
  Package,
  Swords,
  X,
} from 'lucide-react';
import { ProsPage } from '../features/pros/ProsPage';
import { AramPage } from '../features/aram/AramPage';
import { useAram } from '../features/aram/useAram';
import { useAramResult } from '../features/aram/useAramResult';
import { useAramGroup } from '../features/aram/useAramGroup';
import { AramResultDialog } from '../features/aram/AramResultDialog';
import { aramAdapter } from '../adapters/aram';
import { HomeGrid } from '../features/edit/HomeGrid';
import { EditDock, type EditTool } from '../features/edit/EditDock';
import { NavEditor } from '../features/edit/NavEditor';
import { changeSettings } from '../design/customization';
import { withDesign } from '../features/settings/preferences';
import { TwitchPage } from '../features/twitch/TwitchPage';
import { DevicesPage } from '../features/devices/DevicesPage';
import { useBatteries } from '../features/devices/useBatteries';
import { PcPage } from '../features/pc/PcPage';
import { MusicPage } from '../features/music/MusicPage';
import { AppsPage } from '../features/apps/AppsPage';
import { useApps } from '../features/apps/useApps';
import { settingsFileContent } from '../features/settings/settingsFile';
import { cloud } from '../adapters/cloud';
import { isFreshStart } from '../platform/store';
import { RestoreDialog } from './RestoreDialog';
import { StartScreen, type StartKind, type StartSource } from './StartScreen';
import { resolveSettings } from '../design/customization';
import { useMusic } from '../features/music/useMusic';
import { SettingsPage, type SettingsSection } from '../features/settings/SettingsPage';
import {
  defaultPreferences,
  preferencesKey,
  readPreferences,
  type Preferences,
} from '../features/settings/preferences';
import { useTwitch } from '../features/twitch/useTwitch';
import { useWatch } from '../features/twitch/useWatch';
import { useGoLiveAlerts } from '../features/twitch/useGoLiveAlerts';
import { LiveToasts } from '../features/twitch/LiveToasts';
import { usePopouts } from '../features/popouts/usePopouts';
import { twitchAdapter } from '../adapters/twitchSource';
import { version } from '../../package.json';
import { SidebarAccount } from './SidebarAccount';
import { TitleBar, dragWindow } from './TitleBar';
import { useAppUsage } from './useAppUsage';
import { useWarnings } from './useWarnings';
import { useUpdate } from './useUpdate';
import { usePcStatus } from '../features/pc/usePcStatus';
import { Guard, GuardNotice } from '../components/Guard';
import { readPcStatus } from '../adapters/pc';
export type Page =
  'home' | 'twitch' | 'pros' | 'aram' | 'music' | 'devices' | 'pc' | 'apps' | 'settings';
const navigation = [
  { id: 'home', label: 'Home', icon: LayoutGrid, section: 'Übersicht' },
  { id: 'twitch', label: 'Twitch', icon: Radio, section: 'Live' },
  { id: 'pros', label: 'Pros', icon: Trophy, section: 'Live' },
  { id: 'aram', label: 'ARAM', icon: Swords, section: 'Live' },
  { id: 'music', label: 'Musik', icon: MusicIcon, section: 'Live' },
  { id: 'devices', label: 'Devices', icon: Headphones, section: 'System' },
  { id: 'pc', label: 'PC', icon: Cpu, section: 'System' },
  { id: 'apps', label: 'Apps', icon: Package, section: 'System' },
] as const;
const sections = ['Übersicht', 'Live', 'System'] as const;
/**
 * Page changes (user's wish: bold motion): the new page comes from the side of its navigation
 * entry with a spring, out of a slight blur and scale; the old one leaves the other way. `dir`: 1
 * going down the navigation, -1 going up.
 */
const pageVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, y: 34 * dir, scale: 0.985, filter: 'blur(6px)' }),
  center: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      ...spring('default'),
      opacity: { duration: 0.2, delay: 0.05 },
      filter: { duration: 0.24, delay: 0.03 },
    },
    transitionEnd: { filter: 'none' },
  },
  exit: (dir: number) => ({
    opacity: 0,
    y: -22 * dir,
    scale: 0.985,
    filter: 'blur(4px)',
    transition: { duration: 0.12, ease: [0.3, 0, 1, 1] },
  }),
};
/** Runs `then` once when shown: a part that failed and has nothing to show goes away. */
function Gone({ then }: { then: () => void }) {
  const latest = useRef(then);
  useEffect(() => latest.current(), []);
  return null;
}
/** A failed dialog: a notice in its place that closes it. */
const failedDialog = (name: string, close: () => void) => () => (
  <div className="guard-float">
    <GuardNotice name={name} retry={close} retryLabel="Schließen" />
  </div>
);
function loadPreferences(): { preferences: Preferences; storageAvailable: boolean } {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(preferencesKey) ?? 'null');
    return { preferences: readPreferences(raw) ?? defaultPreferences, storageAvailable: true };
  } catch {
    return { preferences: defaultPreferences, storageAvailable: false };
  }
}
export function App() {
  const [page, setPage] = useState<Page>('home');
  // The open settings section stays while the app runs; links open the fitting one.
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('alerts');
  // The settings that are not edited in place live in a side panel (user's wish: edit mode).
  const [drawer, setDrawer] = useState(false);
  const drawerElement = useRef<HTMLElement>(null);
  // The open tool of the edit mode's dock; it and the side panel never cover each other.
  const [editTool, setEditTool] = useState<EditTool | null>(null);
  const openSettings = (section: SettingsSection) => {
    setSettingsSection(section);
    setEditTool(null);
    setDrawer(true);
  };
  const chooseTool = (tool: EditTool | null) => {
    setEditTool(tool);
    if (tool) setDrawer(false);
  };
  /** Pages, also from popouts; "settings" is the side panel now. */
  const go = (target: Page) => (target === 'settings' ? openSettings('alerts') : setPage(target));
  // The edit mode (user's wish: direct manipulation, WYSIWYG): the app is its own preview.
  const [editing, setEditing] = useState(false);
  // First start of a fresh installation: ask for the move code right away.
  const [restore, setRestore] = useState<'fresh' | 'manual' | null>(() =>
    cloud && isFreshStart() ? 'fresh' : null,
  );
  const [settings, setSettings] = useState(loadPreferences);
  // The start screen: the long one on the first start of an installation, a shorter one later;
  // not with "Animationen" off or when switched off.
  const motionChoice = resolveSettings(settings.preferences.customization).settings.motionLevel;
  const [start, setStart] = useState<{ kind: StartKind; run: number } | null>(() =>
    settings.preferences.startScreen && motionChoice !== 'off'
      ? { kind: isFreshStart() ? 'first' : 'again', run: 0 }
      : null,
  );
  const replayStart = () =>
    motionChoice !== 'off' && setStart((s) => ({ kind: 'again', run: (s?.run ?? 0) + 1 }));
  const twitch = useTwitch(twitchAdapter);
  const { sound, volume, theme, quiet } = settings.preferences;
  // Watch together: the stored name, else the Twitch name; entering a room stores the name used
  // and the room's code (offered as "Wieder beitreten" later).
  const watchName = settings.preferences.watchName || twitch.account?.login || '';
  const watch = useWatch(watchName, settings.preferences.watchLastRoom, (name, room) => {
    const { watchName: storedName, watchLastRoom } = settings.preferences;
    if (name !== storedName || room !== watchLastRoom)
      update({ ...settings.preferences, watchName: name, watchLastRoom: room });
  });
  // Do not disturb mutes the live sound and holds back popouts; the notice in the app still appears.
  const liveAlerts = useGoLiveAlerts(twitch, sound && !quiet ? volume : 0);
  const warnings = useWarnings(
    settings.preferences.batteryWarning,
    settings.preferences.loadWarning,
    quiet ? 0 : volume,
  );
  const music = useMusic();
  usePopouts({
    preferences: settings.preferences,
    mix: music,
    alerts: liveAlerts.alerts,
    dismissAlert: liveAlerts.dismiss,
    warnings: warnings.warnings,
    dismissWarning: warnings.dismiss,
    openPage: go,
  });
  const pc = usePcStatus(page === 'pc' ? 2 : page === 'home' ? 5 : 0);
  const usage = useAppUsage();
  const apps = useApps();
  const updates = useUpdate(settings.preferences.updateCheck);
  // The ARAM group (the same leaderboard for every member), exchanged for the whole app.
  const aramGroup = useAramGroup(aramAdapter, settings.preferences.aramGroup, (aramGroup) =>
    update({ ...settings.preferences, aramGroup }),
  );
  /** Players of the leaderboard: the group's members, else the chosen friends. */
  const aramPlayers = aramGroup.view?.members ?? settings.preferences.aramFriends;
  // ARAM Mayhem games from the League client, only while the page is open.
  const aram = useAram(
    aramAdapter,
    page === 'aram',
    aramPlayers.map((f) => f.puuid),
  );
  // The card after an ARAM Mayhem game: a popout in the background, otherwise here.
  const aramResult = useAramResult(aramAdapter, settings.preferences, aramPlayers);
  // Battery levels are read only while a page shows them.
  const batteries = useBatteries(page === 'home' || page === 'devices');
  // On <html>, so the page background and scrollbars follow the colour scheme too (tokens.css;
  // the design system writes the same values as properties, see src/design/).
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const design = useDesign(settings.preferences);
  const motionOn = design.motion.enabled;
  // The graphics card follows "Animationen" (gpu.rs; user's wish); it changes with the next start.
  const [gpuActive, setGpuActive] = useState<boolean | null>(null);
  useEffect(() => {
    void gpu?.read().then(
      (state) => setGpuActive(state.active),
      () => undefined,
    );
  }, []);
  useEffect(() => {
    void gpu?.set(motionOn).catch(() => undefined);
  }, [motionOn]);
  const restartForGpu = gpuActive !== null && gpuActive !== motionOn ? gpu?.restart : undefined;
  // What is new: once after an update (the start screen goes first), or from Settings → System.
  const [news, setNews] = useState(false);
  useEffect(() => {
    void updateNews?.().then(
      (updated) => updated && setNews(true),
      () => undefined,
    );
  }, []);

  // What really loads at the start (only what exists here; the browser preview has no PC data).
  const startSources: StartSource[] = [
    {
      name: 'Twitch',
      ready:
        twitch.loaded &&
        (twitch.needsLogin || twitch.accountFailed || twitch.streams.status !== 'loading'),
    },
    ...(pc.status === 'unavailable' ? [] : [{ name: 'PC', ready: pc.status !== 'loading' }]),
    ...(batteries.state.status === 'unavailable'
      ? []
      : [{ name: 'Geräte', ready: batteries.state.status !== 'loading' }]),
  ];

  // Pages enter from the side of the navigation they come from (down the list: from below).
  const lastPage = useRef<Page>(page);
  const pageIndex = (id: Page) => navigation.findIndex((n) => n.id === id);
  const dir = pageIndex(page) < pageIndex(lastPage.current) ? -1 : 1;
  useEffect(() => {
    lastPage.current = page;
  }, [page]);
  // The first cards of a page appear one after another; later ones (long lists, loaded data)
  // simply appear, so a page with hundreds of cards costs nothing.
  const main = useRef<HTMLElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    [...(pageRef.current?.querySelectorAll<HTMLElement>('.card') ?? [])]
      .slice(0, 6)
      .forEach((card, i) => {
        card.dataset.stagger = '';
        card.style.setProperty('--i', String(i));
      });
  }, [page]);

  // Overview and stream cards lean towards the mouse.
  useTilt(main);

  // The window: the content fades in at the start and after restoring; before minimizing and
  // closing it fades out first (the window itself stays opaque). Only with motion on.
  const [windowMotion, setWindowMotion] = useState<'enter' | 'leave'>('enter');
  const leaveThen = (action: () => void) => {
    const ms = getMotion().durations.fast;
    if (ms === 0) return action();
    setWindowMotion('leave');
    window.setTimeout(action, ms);
  };
  useEffect(() => {
    if (windowMotion !== 'leave') return;
    const back = () => !document.hidden && setWindowMotion('enter');
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    // Should the window not hide (minimizing failed), the content comes back anyway.
    const timer = window.setTimeout(back, 1500);
    return () => {
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('focus', back);
      window.clearTimeout(timer);
    };
  }, [windowMotion]);
  // The X hides blank. into the notification area (lib.rs) with its own animation, and coming
  // back plays the opening one (windowFx.ts; user's wish). Without motion: at once, as before.
  const appElement = useRef<HTMLDivElement>(null);
  const fxCanvas = useRef<HTMLCanvasElement>(null);
  const hiddenByX = useRef(false);
  const closeToTray = () => {
    const app = appElement.current;
    const canvas = fxCanvas.current;
    if (!getMotion().enabled || !app || !canvas) return closeWindow();
    hiddenByX.current = true;
    void playClose(app, canvas).then(closeWindow);
  };
  useEffect(() => {
    const back = () => {
      if (document.hidden || !hiddenByX.current) return;
      hiddenByX.current = false;
      const app = appElement.current;
      const canvas = fxCanvas.current;
      if (!app) return;
      if (getMotion().enabled && canvas) void playOpen(app, canvas);
      else resetWindowFx(app);
    };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => {
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('focus', back);
    };
  }, []);
  // Undo and redo while editing: every change is saved at once as always; quick changes (a slider,
  // a drag) count as one step.
  const history = useRef<{ past: Preferences[]; future: Preferences[]; at: number }>({
    past: [],
    future: [],
    at: 0,
  });
  const [, setHistoryTick] = useState(0);
  function update(preferences: Preferences) {
    if (editing) {
      const h = history.current;
      if (Date.now() - h.at > 600) h.past = [...h.past.slice(-49), settings.preferences];
      h.at = Date.now();
      h.future = [];
      setHistoryTick((n) => n + 1);
    }
    save(preferences);
  }
  const undo = () => {
    const h = history.current;
    const previous = h.past.at(-1);
    if (!previous) return;
    h.past = h.past.slice(0, -1);
    h.future = [settings.preferences, ...h.future];
    h.at = 0;
    setHistoryTick((n) => n + 1);
    save(previous);
  };
  const redo = () => {
    const h = history.current;
    const next = h.future[0];
    if (!next) return;
    h.future = h.future.slice(1);
    h.past = [...h.past, settings.preferences];
    h.at = 0;
    setHistoryTick((n) => n + 1);
    save(next);
  };
  const toggleEditing = () => {
    history.current = { past: [], future: [], at: 0 };
    setEditTool(null);
    setEditing((e) => !e);
  };
  /** From the settings ("Aussehen"): into the edit mode at a tool; Home for the widgets. */
  const editAt = (tool: EditTool | null, home = false) => {
    if (!editing) history.current = { past: [], future: [], at: 0 };
    setDrawer(false);
    if (home) setPage('home');
    setEditing(true);
    setEditTool(tool);
  };
  // Escape closes what is on top: dialogs close themselves; then the open tool, the settings, the
  // edit mode. A filled text field keeps it (the search clears itself first).
  useEffect(() => {
    if (!editTool && !drawer && !editing) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const field = (event.target as HTMLElement | null)?.closest('input, textarea');
      if (field instanceof HTMLInputElement && field.type !== 'range' && field.value) return;
      if (field instanceof HTMLTextAreaElement && field.value) return;
      if (editTool) setEditTool(null);
      else if (drawer) setDrawer(false);
      else toggleEditing();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [editTool, drawer, editing]);
  // The opened settings take the keyboard focus (tabs, search).
  useEffect(() => {
    if (drawer) drawerElement.current?.focus();
  }, [drawer]);
  function save(preferences: Preferences) {
    let storageAvailable = true;
    try {
      localStorage.setItem(preferencesKey, JSON.stringify(preferences));
    } catch {
      storageAvailable = false;
    }
    mirrorSettings();
    setSettings({ preferences, storageAvailable });
  }
  const toggleQuiet = () => update({ ...settings.preferences, quiet: !quiet });
  // "Nicht stören" in the menu of the icon in the notification area: switches here, and its tick
  // follows every change (title bar, settings, the menu itself).
  const latestToggle = useRef(toggleQuiet);
  latestToggle.current = toggleQuiet;
  useEffect(() => onTrayQuiet(() => latestToggle.current()), []);
  useEffect(() => void setTrayQuiet?.(quiet), [quiet]);
  const current = navigation.find((n) => n.id === page) ?? navigation[0];
  // The sidebar as arranged (edit mode): order within each section, hidden pages left out.
  const { navOrder, navHidden } = settings.preferences;
  const shownNav = (section: string) =>
    navigation
      .filter((n) => n.section === section && !navHidden.includes(n.id))
      .sort((a, b) => navOrder.indexOf(a.id) - navOrder.indexOf(b.id));
  const PageIcon = current.icon;
  const navButton = ({ id, label: name, icon: Icon }: (typeof navigation)[number]) => (
    <button
      key={id}
      className={`nav-item ${page === id ? 'current' : ''}`}
      title={name}
      aria-label={name}
      aria-current={page === id ? 'page' : undefined}
      onClick={() => setPage(id)}
    >
      {/* The highlight glides to the chosen entry with a spring. */}
      {page === id && (
        <motion.span layoutId="nav-current" className="nav-current" transition={spring('snappy')} />
      )}
      <Icon size={17} />
      <span>{name}</span>
    </button>
  );
  const status =
    (page === 'twitch' || page === 'pros') && twitch.adapter.source === 'twitch' ? (
      <span className="badge active" title="Daten von Twitch">
        Twitch
      </span>
    ) : page === 'devices' && batteries.state.status !== 'unavailable' ? (
      <span className="badge active" title="Akkustände direkt von den Geräten">
        Live
      </span>
    ) : page === 'pc' && readPcStatus ? (
      <span className="badge active" title="Werte direkt von Windows">
        Live
      </span>
    ) : page === 'home' && twitch.adapter.source === 'twitch' && readPcStatus ? (
      <span className="badge active" title="Twitch, Akkustände und PC-Werte direkt von der Quelle">
        Live
      </span>
    ) : page === 'aram' && aramAdapter.source === 'league' ? (
      <span className="badge active" title="Spiele aus dem League-Client auf diesem PC">
        League
      </span>
    ) : page === 'music' ? (
      <span className="badge active" title="Musik von SoundCloud">
        SoundCloud
      </span>
    ) : page === 'apps' ? null : (
      <span className="badge" title="Angezeigte Daten sind ganz oder teilweise simuliert">
        Mock
      </span>
    );
  return (
    <MotionConfig reducedMotion={motionOn ? 'never' : 'always'}>
      <div ref={appElement} className={`app ${windowMotion}`} onMouseDown={dragWindow}>
        <a className="skip-link" href="#main">
          Zum Inhalt
        </a>
        <aside className="sidebar" data-drag-region>
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setPage('home');
            }}
            aria-label="blank. Home"
          >
            blank<span>.</span>
          </a>
          <span className="brand-version" data-drag-region>
            App v{version}
          </span>
          {editing ? (
            <NavEditor
              entries={navigation}
              sections={sections}
              order={navOrder}
              hidden={navHidden}
              current={page}
              onOpen={setPage}
              onChange={(order, hidden) =>
                update({ ...settings.preferences, navOrder: order, navHidden: hidden })
              }
            />
          ) : (
            <nav aria-label="Hauptnavigation" data-drag-region>
              {sections.map((section) => (
                <div className="nav-group" key={section} data-drag-region>
                  <span className="sidebar-caption" data-drag-region>
                    {section}
                  </span>
                  {shownNav(section).map(navButton)}
                </div>
              ))}
            </nav>
          )}
          <div className="sidebar-footer">
            <SidebarAccount twitch={twitch} onOpen={() => openSettings('twitch')} />
          </div>
        </aside>
        <div className="workspace">
          <TitleBar
            status={status}
            usage={usage}
            quiet={quiet}
            onQuiet={toggleQuiet}
            updateAvailable={updates.available}
            onUpdate={() => openSettings('system')}
            room={watch?.room ? watch.members.length + 1 : null}
            onRoom={() => setPage('twitch')}
            onMinimize={() => leaveThen(minimizeWindow)}
            onClose={closeToTray}
            editing={editing}
            onEdit={toggleEditing}
            settingsOpen={drawer}
            onSettings={() => (drawer ? setDrawer(false) : openSettings(settingsSection))}
          />
          <div className={`panel ${editing ? 'editing' : ''}`}>
            <div className="scroll-area">
              <main id="main" tabIndex={-1} ref={main}>
                <AnimatePresence mode="popLayout" initial={false} custom={dir}>
                  <motion.div
                    className="page"
                    key={page}
                    ref={pageRef}
                    custom={dir}
                    variants={pageVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    <div className="page-heading">
                      <span className="page-icon">
                        <PageIcon size={17} />
                      </span>
                      <h1>{current.label}</h1>
                    </div>
                    <Guard name={current.label}>
                      {page === 'home' && (
                        <HomeGrid
                          layout={settings.preferences.homeLayout}
                          editing={editing}
                          context={{
                            navigate: setPage,
                            twitch,
                            batteries,
                            pc,
                            music,
                            aramFriends: aramPlayers,
                          }}
                          onChange={(homeLayout) => update({ ...settings.preferences, homeLayout })}
                          radiusScale={
                            resolveSettings(settings.preferences.customization).settings.radiusScale
                          }
                          onRadius={(radiusScale) =>
                            update(
                              withDesign(settings.preferences, (c) =>
                                changeSettings(c, { radiusScale }),
                              ),
                            )
                          }
                        />
                      )}
                      {page === 'twitch' && (
                        <TwitchPage twitch={twitch} watch={watch} watchName={watchName} />
                      )}
                      {page === 'pros' && <ProsPage twitch={twitch} />}
                      {page === 'aram' && (
                        <AramPage
                          aram={aram}
                          adapter={aramAdapter}
                          friends={settings.preferences.aramFriends}
                          setFriends={(aramFriends) =>
                            update({ ...settings.preferences, aramFriends })
                          }
                          chosen={settings.preferences.aramCategories}
                          setChosen={(aramCategories) =>
                            update({ ...settings.preferences, aramCategories })
                          }
                          onShow={aramResult.show}
                          group={aramGroup}
                        />
                      )}
                      {page === 'music' && <MusicPage music={music} />}
                      {page === 'devices' && <DevicesPage batteries={batteries} />}
                      {page === 'pc' && <PcPage pc={pc} />}
                      {page === 'apps' && (
                        <AppsPage
                          apps={apps}
                          navigate={(target) =>
                            target === 'settings' ? openSettings('data') : setPage(target)
                          }
                          content={() =>
                            settingsFileContent(
                              settings.preferences,
                              { accounts: music.accounts, volume: music.volume },
                              apps.selected,
                            )
                          }
                          onRestore={() => setRestore('manual')}
                        />
                      )}
                    </Guard>
                  </motion.div>
                </AnimatePresence>
              </main>
            </div>
          </div>
        </div>
        <AnimatePresence>
          {editing && (
            <Guard key="edit-dock" name="Bearbeiten">
              <EditDock
                tool={editTool}
                setTool={chooseTool}
                preferences={settings.preferences}
                update={update}
                storageAvailable={settings.storageAvailable}
                replayStart={replayStart}
                restartForGpu={restartForGpu}
                undo={history.current.past.length > 0 ? undo : null}
                redo={history.current.future.length > 0 ? redo : null}
                openMore={(popouts) => openSettings(popouts ? 'popouts' : settingsSection)}
                goHome={() => setPage('home')}
              />
            </Guard>
          )}
          {drawer && (
            <motion.aside
              key="settings-drawer"
              ref={drawerElement}
              tabIndex={-1}
              className={`settings-drawer ${editing ? 'over-dock' : ''}`}
              aria-label="Einstellungen"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0, transition: spring('snappy') }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.14 } }}
            >
              <header className="settings-drawer-head">
                <h2>Einstellungen</h2>
                <button
                  className="icon-button"
                  aria-label="Einstellungen schließen"
                  onClick={() => setDrawer(false)}
                >
                  <X size={17} />
                </button>
              </header>
              <div className="settings-drawer-body">
                <Guard name="Einstellungen">
                  <SettingsPage
                    preferences={settings.preferences}
                    update={update}
                    twitch={twitch}
                    usage={usage}
                    music={music}
                    apps={apps}
                    updates={updates}
                    section={settingsSection}
                    setSection={setSettingsSection}
                    openPage={(target) => {
                      setDrawer(false);
                      go(target);
                    }}
                    showNews={() => setNews(true)}
                    onEdit={editAt}
                  />
                </Guard>
              </div>
            </motion.aside>
          )}
          {news && (
            <Guard
              key="news"
              name="Neuigkeiten"
              fallback={failedDialog('Neuigkeiten', () => setNews(false))}
            >
              <PatchNotes onClose={() => setNews(false)} />
            </Guard>
          )}
          {aramResult.view && (
            <Guard
              key="aram-result"
              name="ARAM-Ergebnis"
              fallback={failedDialog('ARAM-Ergebnis', aramResult.close)}
            >
              <AramResultDialog
                view={aramResult.view}
                motionOn={motionOn}
                onClose={aramResult.close}
                onRanking={() => {
                  aramResult.close();
                  setPage('aram');
                }}
              />
            </Guard>
          )}
          {restore && (
            <Guard
              key="restore"
              name="Einstellungen holen"
              fallback={failedDialog('Einstellungen holen', () => setRestore(null))}
            >
              <RestoreDialog
                fresh={restore === 'fresh'}
                onClose={() => setRestore(null)}
                onDone={() => {
                  setRestore(null);
                  setPage('apps');
                }}
                update={update}
                music={music}
                apps={apps}
                twitch={twitch}
              />
            </Guard>
          )}
        </AnimatePresence>
        {start && (
          <Guard
            key={start.run}
            name="Startbildschirm"
            fallback={() => <Gone then={() => setStart(null)} />}
          >
            <StartScreen kind={start.kind} sources={startSources} onDone={() => setStart(null)} />
          </Guard>
        )}
        <Guard name="Meldungen" fallback={() => null}>
          <LiveToasts
            twitch={twitch}
            alerts={liveAlerts.alerts}
            dismiss={liveAlerts.dismiss}
            warnings={warnings.warnings}
            dismissWarning={warnings.dismiss}
            openPage={setPage}
          />
        </Guard>
      </div>
      <canvas ref={fxCanvas} className="window-fx" aria-hidden />
      {music.frame}
    </MotionConfig>
  );
}
