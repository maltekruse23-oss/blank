import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Pencil, Search } from 'lucide-react';
import { Card, Badge } from '../../components/ui';
import { playAlertSound } from '../../platform/sound';
import { TwitchAccountCard } from '../twitch/TwitchAccountCard';
import type { TwitchData } from '../twitch/useTwitch';
import type { UsageState } from '../../app/useAppUsage';
import type { Page } from '../../app/App';
import { SystemCard } from './SystemCard';
import { TransferCard } from './TransferCard';
import { GamingCard } from './GamingCard';
import type { Music } from '../music/useMusic';
import type { Apps } from '../apps/useApps';
import type { Updates } from '../../app/useUpdate';
import { PopoutCard } from './PopoutCard';
import { Searching } from './More';
import { TabContent, TabPill } from '../../components/TabMotion';
import type { Preferences } from './preferences';
import type { EditTool } from '../edit/EditDock';

/**
 * Settings in sections (user's wish: the one long page had become too much), in a side panel; the
 * look is edited in place (edit mode, features/edit/).
 */
export type SettingsSection = 'alerts' | 'popouts' | 'twitch' | 'gaming' | 'system' | 'data';
export const settingsSections: { id: SettingsSection; name: string }[] = [
  { id: 'alerts', name: 'Meldungen' },
  { id: 'popouts', name: 'Popouts' },
  { id: 'twitch', name: 'Twitch' },
  { id: 'gaming', name: 'Gaming' },
  { id: 'system', name: 'System' },
  { id: 'data', name: 'Daten' },
];

type Props = {
  preferences: Preferences;
  update: (next: Preferences) => void;
};

function Switch({
  label,
  on,
  onToggle,
  disabled = false,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="switch"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
    >
      <span />
    </button>
  );
}

/** What is changed in place (edit mode): only in the search, each row opens its tool there. */
const lookRows: { title: string; text: string; tool: EditTool | null; home?: boolean }[] = [
  { title: 'Stil', text: 'Standard, Sparsam, Schlicht oder ein eigener', tool: 'style' },
  { title: 'Farben', text: 'Farbschema und Akzentfarbe', tool: 'color' },
  { title: 'Form', text: 'Dichte und Rundung', tool: 'layout' },
  { title: 'Bewegung', text: 'Animationen, Grafikkarte, Startbildschirm', tool: 'motion' },
  {
    title: 'Home',
    text: 'Widgets anordnen, vergrößern, umbenennen, hinzufügen',
    tool: 'widgets',
    home: true,
  },
  { title: 'Seitenleiste', text: 'Seiten sortieren und ausblenden', tool: null },
  { title: 'Popout-Platz', text: 'Stelle, Bildschirm, Taskleiste, Deckkraft', tool: 'popout' },
];

function LookEntryCard({ onEdit }: { onEdit: (tool: EditTool | null, home?: boolean) => void }) {
  return (
    <Card title="Direkt in der App">
      {lookRows.map((row) => (
        <div className="setting-row" key={row.title}>
          <div>
            <h3>{row.title}</h3>
            <p>{row.text}</p>
          </div>
          <button className="filter-button" onClick={() => onEdit(row.tool, row.home)}>
            <Pencil size={13} /> Bearbeiten
          </button>
        </div>
      ))}
    </Card>
  );
}

/** Sound, do not disturb and warnings; switching a sound on plays it, so it can be heard at once. */
function AlertsCard({ preferences, update, twitch }: Props & { twitch: TwitchData }) {
  const pushStatus = twitch.adapter.pushStatus;
  const [push, setPush] = useState<{ connected: boolean; watched: number } | null>(null);
  useEffect(() => {
    if (!pushStatus) return;
    let active = true;
    const load = () =>
      pushStatus().then(
        (status) => active && setPush(status),
        () => active && setPush(null),
      );
    void load();
    const timer = window.setInterval(load, 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [pushStatus]);

  const channels = twitch.entries.length;
  const { volume } = preferences;
  const anySound = preferences.sound || preferences.batteryWarning || preferences.loadWarning;
  return (
    <Card title="Meldungen">
      <div className="setting-row">
        <div>
          <h3>Nicht stören</h3>
          <p>Kein Ton, keine Popouts</p>
        </div>
        <Switch
          label="Nicht stören"
          on={preferences.quiet}
          onToggle={() => update({ ...preferences, quiet: !preferences.quiet })}
        />
      </div>
      <div className="setting-row">
        <div>
          <h3>Ton bei Live-Start</h3>
        </div>
        <button className="text-link" onClick={() => playAlertSound(volume)}>
          Testen
        </button>
        <Switch
          label="Ton bei Live-Start"
          on={preferences.sound}
          onToggle={() => {
            update({ ...preferences, sound: !preferences.sound });
            if (!preferences.sound) playAlertSound(volume);
          }}
        />
      </div>
      <div className="setting-row">
        <div>
          <h3>Lautstärke</h3>
          <p>Live-Ton und Warnungen, beim Loslassen zum Hören</p>
        </div>
        <input
          type="range"
          className="volume-slider"
          min={0}
          max={100}
          step={5}
          value={volume}
          // The warnings play their sound at this volume too.
          disabled={!anySound}
          aria-label="Lautstärke"
          aria-valuetext={`${volume} %`}
          style={{ '--value': `${volume}%` } as CSSProperties}
          onChange={(event) => update({ ...preferences, volume: Number(event.target.value) })}
          onPointerUp={(event) => playAlertSound(Number(event.currentTarget.value))}
          onKeyUp={(event) => playAlertSound(Number(event.currentTarget.value))}
        />
        <span className="volume-value" aria-hidden>
          {volume} %
        </span>
      </div>
      <div className="setting-row">
        <div>
          <h3>Akku-Warnung</h3>
          <p>Ab 15 %</p>
        </div>
        <Switch
          label="Akku-Warnung"
          on={preferences.batteryWarning}
          onToggle={() => {
            update({ ...preferences, batteryWarning: !preferences.batteryWarning });
            if (!preferences.batteryWarning && !preferences.quiet)
              playAlertSound(volume, 'warning');
          }}
        />
      </div>
      <div className="setting-row">
        <div>
          <h3>Warnung bei Überlastung</h3>
          <p>CPU und RAM ab 90 %, Grafikkarte ab 95 %, mit Ursache</p>
        </div>
        <Switch
          label="Warnung bei Überlastung"
          on={preferences.loadWarning}
          onToggle={() => {
            update({ ...preferences, loadWarning: !preferences.loadWarning });
            if (!preferences.loadWarning && !preferences.quiet) playAlertSound(volume, 'warning');
          }}
        />
      </div>
      <div className="setting-row">
        <div>
          <h3>Sofort-Meldung</h3>
          {push?.connected && channels > push.watched && (
            <p>Weitere Kanäle werden alle 30 s geprüft.</p>
          )}
        </div>
        {!pushStatus ? (
          <Badge>Nur in der Desktop-App</Badge>
        ) : push?.connected ? (
          <Badge active>{push.watched === 1 ? '1 Kanal' : `${push.watched} Kanäle`}</Badge>
        ) : (
          <Badge>Nicht verbunden</Badge>
        )}
      </div>
    </Card>
  );
}

/** The name others see in a watch-together room (empty: the Twitch name). */
function WatchNameCard({ preferences, update, twitch }: Props & { twitch: TwitchData }) {
  const [name, setName] = useState(preferences.watchName);
  useEffect(() => setName(preferences.watchName), [preferences.watchName]);
  const save = () => {
    const clean = name
      .replace(/\p{Cc}/gu, '')
      .trim()
      .slice(0, 24)
      .trim();
    setName(clean);
    if (clean !== preferences.watchName) update({ ...preferences, watchName: clean });
  };
  return (
    <Card title="Zusammen schauen">
      <div className="setting-row">
        <div>
          <h3>Dein Name im Raum</h3>
          <p>Leer: dein Twitch-Name</p>
        </div>
        <label className="search setting-input">
          <input
            aria-label="Dein Name im Raum"
            placeholder={twitch.account?.login ?? 'Name'}
            maxLength={24}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={save}
            onKeyDown={(event) => event.key === 'Enter' && save()}
          />
        </label>
      </div>
    </Card>
  );
}

function BackupCard({ openPage }: { openPage: (page: Page) => void }) {
  return (
    <Card title="Online sichern">
      <div className="setting-row">
        <div>
          <h3>Mit Umzugs-Code, ohne Konto</h3>
          <p>Alles verschlüsselt sichern und auf dem neuen PC zurückholen</p>
        </div>
        <button className="secondary-button" onClick={() => openPage('apps')}>
          Zur Seite Apps
        </button>
      </div>
    </Card>
  );
}

export function SettingsPage({
  preferences,
  update,
  twitch,
  usage,
  music,
  apps,
  updates,
  section,
  setSection,
  openPage,
  showNews,
  onEdit,
}: Props & {
  twitch: TwitchData;
  usage: UsageState;
  music: Music;
  apps: Apps;
  updates: Updates;
  /** The open section (kept by the app, so links can open one: update → System). */
  section: SettingsSection;
  setSection: (section: SettingsSection) => void;
  openPage: (page: Page) => void;
  /** Opens "what is new" (Settings → System). */
  showNews: () => void;
  /** Into the edit mode, at a tool (the look is changed in place). */
  onEdit: (tool: EditTool | null, home?: boolean) => void;
}) {
  const planned = twitch.adapter.account ? [] : ['Twitch-Account'];
  // A new section enters from the side of its tab.
  const lastSection = useRef(section);
  const sectionIndex = (id: SettingsSection) => settingsSections.findIndex((s) => s.id === id);
  const dir = sectionIndex(section) < sectionIndex(lastSection.current) ? -1 : 1;
  useEffect(() => {
    lastSection.current = section;
  }, [section]);

  // Search: across all sections; rows (and whole cards) whose text does not contain the words
  // are hidden. Runs after every render, since cards change their rows themselves.
  const [query, setQuery] = useState('');
  const [found, setFound] = useState(true);
  const searching = query.trim().length > 0;
  const layout = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- filters after every render; setFound bails out on the same value
  useEffect(() => {
    const root = layout.current;
    if (!root) return;
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (element: Element) => {
      const text = (element.textContent ?? '').toLowerCase();
      return words.every((word) => text.includes(word));
    };
    let any = false;
    for (const card of root.querySelectorAll<HTMLElement>(':scope > .card')) {
      const whole = words.length > 0 && matches(card.querySelector('h2') ?? card);
      let shown = false;
      for (const row of card.querySelectorAll<HTMLElement>('.setting-row, .setting-group')) {
        row.hidden = words.length > 0 && !whole && !matches(row);
        if (!row.hidden && row.classList.contains('setting-row')) shown = true;
      }
      card.hidden = words.length > 0 && !whole && !shown;
      any ||= !card.hidden;
    }
    setFound(any);
  });

  const cards: Record<SettingsSection, ReactNode> = {
    alerts: <AlertsCard preferences={preferences} update={update} twitch={twitch} />,
    popouts: (
      <PopoutCard preferences={preferences} update={update} onPlace={() => onEdit('popout')} />
    ),
    twitch: (
      <>
        <TwitchAccountCard twitch={twitch} />
        <WatchNameCard preferences={preferences} update={update} twitch={twitch} />
        {planned.length > 0 && (
          <Card title="Verbindungen">
            {planned.map((x) => (
              <div className="setting-row" key={x}>
                <div>
                  <h3>{x}</h3>
                </div>
                <Badge>{x === 'Twitch-Account' ? 'Nur in der Desktop-App' : 'Geplant'}</Badge>
              </div>
            ))}
          </Card>
        )}
      </>
    ),
    gaming: <GamingCard />,
    system: (
      <SystemCard
        usage={usage}
        updates={updates}
        autoCheck={preferences.updateCheck}
        setAutoCheck={(updateCheck) => update({ ...preferences, updateCheck })}
        showNews={showNews}
      />
    ),
    data: (
      <>
        <TransferCard
          preferences={preferences}
          update={update}
          music={music}
          apps={apps}
          twitch={twitch}
        />
        <BackupCard openPage={openPage} />
      </>
    ),
  };

  return (
    <Searching.Provider value={searching}>
      <div className="settings-layout" ref={layout}>
        <div className="settings-search">
          <label className="search">
            <Search size={15} />
            <input
              type="search"
              value={query}
              placeholder="Einstellungen durchsuchen"
              aria-label="Einstellungen durchsuchen"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
        {!searching && (
          <div className="settings-tabs" role="tablist" aria-label="Bereiche der Settings">
            {settingsSections.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={section === s.id}
                className={`filter-button ${section === s.id ? 'selected' : ''}`}
                onClick={() => setSection(s.id)}
              >
                {section === s.id && <TabPill group="settings-tab" />}
                <span className="tab-label">{s.name}</span>
              </button>
            ))}
          </div>
        )}
        {searching && !found && (
          <p className="section-note" role="status">
            Keine Einstellung passt zu „{query.trim()}“.
          </p>
        )}
        {searching ? (
          <>
            <LookEntryCard onEdit={onEdit} />
            {settingsSections.map((s) => (
              <Fragment key={s.id}>{cards[s.id]}</Fragment>
            ))}
          </>
        ) : (
          <TabContent id={section} dir={dir} className="tab-enter">
            {cards[section]}
          </TabContent>
        )}
      </div>
    </Searching.Provider>
  );
}
