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
import {
  LayoutGrid,
  Radio,
  Trophy,
  Music as MusicIcon,
  Headphones,
  Cpu,
  Package,
  Settings,
} from 'lucide-react';
import { ProsPage } from '../features/pros/ProsPage';
import { HomePage } from '../features/home/HomePage';
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
import { readPcStatus } from '../adapters/pc';
export type Page = 'home' | 'twitch' | 'pros' | 'music' | 'devices' | 'pc' | 'apps' | 'settings';
const navigation = [
  { id: 'home', label: 'Home', icon: LayoutGrid, section: 'Übersicht' },
  { id: 'twitch', label: 'Twitch', icon: Radio, section: 'Live' },
  { id: 'pros', label: 'Pros', icon: Trophy, section: 'Live' },
  { id: 'music', label: 'Musik', icon: MusicIcon, section: 'Live' },
  { id: 'devices', label: 'Devices', icon: Headphones, section: 'System' },
  { id: 'pc', label: 'PC', icon: Cpu, section: 'System' },
  { id: 'apps', label: 'Apps', icon: Package, section: 'System' },
  { id: 'settings', label: 'Settings', icon: Settings, section: null },
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
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('look');
  const openSettings = (section: SettingsSection) => {
    setSettingsSection(section);
    setPage('settings');
  };
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
    openPage: setPage,
  });
  const pc = usePcStatus(page === 'pc' ? 2 : page === 'home' ? 5 : 0);
  const usage = useAppUsage();
  const apps = useApps();
  const updates = useUpdate(settings.preferences.updateCheck);
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
  function update(preferences: Preferences) {
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
  const current = navigation.find((n) => n.id === page)!;
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
    ) : page === 'music' ? (
      <span className="badge active" title="Musik von SoundCloud">
        SoundCloud
      </span>
    ) : page === 'apps' || (page === 'settings' && twitch.adapter.source === 'twitch') ? null : (
      <span className="badge" title="Angezeigte Daten sind ganz oder teilweise simuliert">
        Mock
      </span>
    );
  return (
    <MotionConfig reducedMotion={motionOn ? 'never' : 'always'}>
      <div className={`app ${windowMotion}`} onMouseDown={dragWindow}>
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
          <nav aria-label="Hauptnavigation" data-drag-region>
            {sections.map((section) => (
              <div className="nav-group" key={section} data-drag-region>
                <span className="sidebar-caption" data-drag-region>
                  {section}
                </span>
                {navigation.filter((n) => n.section === section).map(navButton)}
              </div>
            ))}
          </nav>
          <div className="sidebar-footer">
            <SidebarAccount twitch={twitch} onOpen={() => openSettings('twitch')} />
            {navigation.filter((n) => n.section === null).map(navButton)}
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
            onClose={() => leaveThen(closeWindow)}
          />
          <div className="panel">
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
                    {page === 'home' && (
                      <HomePage navigate={setPage} twitch={twitch} batteries={batteries} pc={pc} />
                    )}
                    {page === 'twitch' && (
                      <TwitchPage twitch={twitch} watch={watch} watchName={watchName} />
                    )}
                    {page === 'pros' && <ProsPage twitch={twitch} />}
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
                    {page === 'settings' && (
                      <SettingsPage
                        preferences={settings.preferences}
                        update={update}
                        storageAvailable={settings.storageAvailable}
                        twitch={twitch}
                        usage={usage}
                        music={music}
                        apps={apps}
                        updates={updates}
                        section={settingsSection}
                        setSection={setSettingsSection}
                        openPage={setPage}
                        replayStart={replayStart}
                        restartForGpu={restartForGpu}
                        showNews={() => setNews(true)}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </main>
            </div>
          </div>
        </div>
        <AnimatePresence>
          {news && <PatchNotes key="news" onClose={() => setNews(false)} />}
          {restore && (
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
          )}
        </AnimatePresence>
        {start && (
          <StartScreen
            key={start.run}
            kind={start.kind}
            sources={startSources}
            onDone={() => setStart(null)}
          />
        )}
        <LiveToasts
          twitch={twitch}
          alerts={liveAlerts.alerts}
          dismiss={liveAlerts.dismiss}
          warnings={warnings.warnings}
          dismissWarning={warnings.dismiss}
          openPage={setPage}
        />
      </div>
      {music.frame}
    </MotionConfig>
  );
}
