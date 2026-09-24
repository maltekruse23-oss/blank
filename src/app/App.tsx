import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PetView, PET_SIZE } from '../features/pet/PetView';
import { onShowApp, setPetWindow } from '../platform/window';
import {
  LayoutGrid,
  Radio,
  Trophy,
  Music as MusicIcon,
  Headphones,
  Cpu,
  Settings,
} from 'lucide-react';
import { ProsPage } from '../features/pros/ProsPage';
import { HomePage } from '../features/home/HomePage';
import { TwitchPage } from '../features/twitch/TwitchPage';
import { DevicesPage } from '../features/devices/DevicesPage';
import { useBatteries } from '../features/devices/useBatteries';
import { PcPage } from '../features/pc/PcPage';
import { MusicPage } from '../features/music/MusicPage';
import { useMusic } from '../features/music/useMusic';
import { SettingsPage } from '../features/settings/SettingsPage';
import {
  defaultPreferences,
  readPreferences,
  type Preferences,
} from '../features/settings/preferences';
import { useTwitch } from '../features/twitch/useTwitch';
import { useGoLiveAlerts } from '../features/twitch/useGoLiveAlerts';
import { LiveToasts } from '../features/twitch/LiveToasts';
import { twitchAdapter } from '../adapters/twitchSource';
import { version } from '../../package.json';
import { SidebarAccount } from './SidebarAccount';
import { TitleBar, dragWindow } from './TitleBar';
import { useAppUsage } from './useAppUsage';
import { useWarnings } from './useWarnings';
import { usePcStatus } from '../features/pc/usePcStatus';
import { readPcStatus } from '../adapters/pc';
export type Page = 'home' | 'twitch' | 'pros' | 'music' | 'devices' | 'pc' | 'settings';
const navigation = [
  { id: 'home', label: 'Home', icon: LayoutGrid, section: 'Übersicht' },
  { id: 'twitch', label: 'Twitch', icon: Radio, section: 'Live' },
  { id: 'pros', label: 'Pros', icon: Trophy, section: 'Live' },
  { id: 'music', label: 'Musik', icon: MusicIcon, section: 'Live' },
  { id: 'devices', label: 'Devices', icon: Headphones, section: 'System' },
  { id: 'pc', label: 'PC', icon: Cpu, section: 'System' },
  { id: 'settings', label: 'Settings', icon: Settings, section: null },
] as const;
const sections = ['Übersicht', 'Live', 'System'] as const;
const storageKey = 'blank.preferences.v1';
function loadPreferences(): { preferences: Preferences; storageAvailable: boolean } {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    return { preferences: readPreferences(raw) ?? defaultPreferences, storageAvailable: true };
  } catch {
    return { preferences: defaultPreferences, storageAvailable: false };
  }
}
export function App() {
  const [page, setPage] = useState<Page>('home');
  const [mode, setMode] = useState<'app' | 'pet'>('app');
  const [settings, setSettings] = useState(loadPreferences);
  const twitch = useTwitch(twitchAdapter);
  const { sound, volume, theme, quiet } = settings.preferences;
  // Do not disturb mutes the live sound; the notice itself still appears.
  const liveAlerts = useGoLiveAlerts(twitch, sound && !quiet ? volume : 0);
  const warnings = useWarnings(
    settings.preferences.batteryWarning,
    settings.preferences.loadWarning,
    quiet ? 0 : volume,
  );
  const pc = usePcStatus(mode !== 'app' ? 0 : page === 'pc' ? 2 : page === 'home' ? 5 : 0);
  const usage = useAppUsage(mode === 'app');
  const music = useMusic();
  // Battery levels are read only while a page shows them.
  const batteries = useBatteries(mode === 'app' && (page === 'home' || page === 'devices'));
  // On <html>, so the page background and scrollbars follow the colour scheme too.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  function update(preferences: Preferences) {
    let storageAvailable = true;
    try {
      localStorage.setItem(storageKey, JSON.stringify(preferences));
    } catch {
      storageAvailable = false;
    }
    setSettings({ preferences, storageAvailable });
  }
  // Pet: the page turns transparent first, then the window shrinks. Back: the window is
  // restored first, then the app is drawn, so it never shows squeezed into the small window.
  function enterPet() {
    document.documentElement.classList.add('pet-mode');
    setMode('pet');
    setPetWindow(true, PET_SIZE.width, PET_SIZE.height).catch((error: unknown) => {
      console.error('Pet mode failed', error);
      document.documentElement.classList.remove('pet-mode');
      setMode('app');
    });
  }
  const leaving = useRef(false);
  function leavePet(target?: Page) {
    if (leaving.current) return;
    leaving.current = true;
    setPetWindow(false, PET_SIZE.width, PET_SIZE.height)
      .catch((error: unknown) => console.error('Leaving pet mode failed', error))
      .finally(() => {
        leaving.current = false;
        document.documentElement.classList.remove('pet-mode');
        if (target) setPage(target);
        setMode('app');
      });
  }
  // Taskbar button and tray icon: always the full app, never the pet. leavePet only uses refs
  // and state setters, so the first render's copy stays valid.
  useEffect(
    () =>
      onShowApp(() => {
        if (document.documentElement.classList.contains('pet-mode')) leavePet();
      }),
    [],
  );
  const toggleQuiet = () => update({ ...settings.preferences, quiet: !quiet });
  // The music player sits next to the app or the pet, at the same place in both, so a mix plays
  // on when the view changes.
  if (mode === 'pet')
    return (
      <>
        <PetView
          key="pet"
          twitch={twitch}
          alerts={liveAlerts.alerts}
          dismiss={liveAlerts.dismiss}
          motion={settings.preferences.motion}
          figure={settings.preferences.pet}
          quiet={quiet}
          warnings={warnings.warnings}
          dismissWarning={warnings.dismiss}
          onOpenApp={leavePet}
        />
        {music.frame}
      </>
    );
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
    ) : page === 'settings' && twitch.adapter.source === 'twitch' ? null : (
      <span className="badge" title="Angezeigte Daten sind ganz oder teilweise simuliert">
        Mock
      </span>
    );
  return (
    <>
      <div
        key="app"
        className={`app ${settings.preferences.compact ? 'compact' : ''} ${settings.preferences.motion ? '' : 'no-motion'}`}
        onMouseDown={dragWindow}
      >
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
            <SidebarAccount twitch={twitch} onOpen={() => setPage('settings')} />
            {navigation.filter((n) => n.section === null).map(navButton)}
          </div>
        </aside>
        <div className="workspace">
          <TitleBar
            status={status}
            usage={usage}
            onPet={enterPet}
            quiet={quiet}
            onQuiet={toggleQuiet}
          />
          <div className="panel">
            <div className="scroll-area">
              <main id="main" tabIndex={-1}>
                <div className="page-heading">
                  <span className="page-icon">
                    <PageIcon size={17} />
                  </span>
                  <h1>{current.label}</h1>
                </div>
                {page === 'home' && (
                  <HomePage navigate={setPage} twitch={twitch} batteries={batteries} pc={pc} />
                )}
                {page === 'twitch' && <TwitchPage twitch={twitch} />}
                {page === 'pros' && <ProsPage twitch={twitch} />}
                {page === 'music' && <MusicPage music={music} />}
                {page === 'devices' && <DevicesPage batteries={batteries} />}
                {page === 'pc' && <PcPage pc={pc} />}
                {page === 'settings' && (
                  <SettingsPage
                    preferences={settings.preferences}
                    update={update}
                    storageAvailable={settings.storageAvailable}
                    twitch={twitch}
                    usage={usage}
                    music={music}
                  />
                )}
              </main>
            </div>
          </div>
        </div>
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
    </>
  );
}
