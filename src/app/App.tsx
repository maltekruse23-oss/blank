import { useLayoutEffect, useState } from 'react';
import { mirrorSettings } from '../platform/store';
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
import { useMusic } from '../features/music/useMusic';
import { SettingsPage } from '../features/settings/SettingsPage';
import {
  defaultPreferences,
  preferencesKey,
  readPreferences,
  type Preferences,
} from '../features/settings/preferences';
import { useTwitch } from '../features/twitch/useTwitch';
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
// tagline: short line next to the page title, shown in the "Arena" and "HUD" designs only.
const navigation = [
  {
    id: 'home',
    label: 'Home',
    icon: LayoutGrid,
    section: 'Übersicht',
    tagline: 'Alles Wichtige auf einen Blick',
  },
  {
    id: 'twitch',
    label: 'Twitch',
    icon: Radio,
    section: 'Live',
    tagline: 'Deine Kanäle, live verfolgt',
  },
  { id: 'pros', label: 'Pros', icon: Trophy, section: 'Live', tagline: 'League-Pros gerade live' },
  {
    id: 'music',
    label: 'Musik',
    icon: MusicIcon,
    section: 'Live',
    tagline: 'SoundCloud-Mixes nebenbei',
  },
  {
    id: 'devices',
    label: 'Devices',
    icon: Headphones,
    section: 'System',
    tagline: 'Akkustände deiner Geräte',
  },
  { id: 'pc', label: 'PC', icon: Cpu, section: 'System', tagline: 'Auslastung live von Windows' },
  {
    id: 'apps',
    label: 'Apps',
    icon: Package,
    section: 'System',
    tagline: 'Programme für den nächsten Reset',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    section: null,
    tagline: 'Darstellung, Meldungen, System',
  },
] as const;
const sections = ['Übersicht', 'Live', 'System'] as const;
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
  // First start of a fresh installation: ask for the move code right away.
  const [restore, setRestore] = useState<'fresh' | 'manual' | null>(() =>
    cloud && isFreshStart() ? 'fresh' : null,
  );
  const [settings, setSettings] = useState(loadPreferences);
  const twitch = useTwitch(twitchAdapter);
  const { sound, volume, theme, design, quiet } = settings.preferences;
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
  // On <html>, so the page background and scrollbars follow the colour scheme too.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.design = design;
  }, [theme, design]);
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
    ) : page === 'apps' || (page === 'settings' && twitch.adapter.source === 'twitch') ? null : (
      <span className="badge" title="Angezeigte Daten sind ganz oder teilweise simuliert">
        Mock
      </span>
    );
  return (
    <>
      <div
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
            quiet={quiet}
            onQuiet={toggleQuiet}
            updateAvailable={updates.available}
            onUpdate={() => setPage('settings')}
          />
          <div className="panel">
            <div className="scroll-area">
              <main id="main" tabIndex={-1}>
                <div className="page-heading">
                  <span className="page-icon">
                    <PageIcon size={17} />
                  </span>
                  <h1>{current.label}</h1>
                  <p className="page-tagline">{current.tagline}</p>
                </div>
                {page === 'home' && (
                  <HomePage navigate={setPage} twitch={twitch} batteries={batteries} pc={pc} />
                )}
                {page === 'twitch' && <TwitchPage twitch={twitch} />}
                {page === 'pros' && <ProsPage twitch={twitch} />}
                {page === 'music' && <MusicPage music={music} />}
                {page === 'devices' && <DevicesPage batteries={batteries} />}
                {page === 'pc' && <PcPage pc={pc} />}
                {page === 'apps' && (
                  <AppsPage
                    apps={apps}
                    navigate={setPage}
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
                  />
                )}
              </main>
            </div>
          </div>
        </div>
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
