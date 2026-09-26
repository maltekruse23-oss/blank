import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Search } from 'lucide-react';
import { Card, Badge } from '../../components/ui';
import { playAlertSound } from '../../platform/sound';
import { TwitchAccountCard } from '../twitch/TwitchAccountCard';
import type { TwitchData } from '../twitch/useTwitch';
import type { UsageState } from '../../app/useAppUsage';
import { SystemCard } from './SystemCard';
import { TransferCard } from './TransferCard';
import { GamingCard } from './GamingCard';
import type { Music } from '../music/useMusic';
import type { Apps } from '../apps/useApps';
import type { Updates } from '../../app/useUpdate';
import { PopoutCard } from './PopoutCard';
import { themes } from './themes';
import { designs } from './designs';
import { defaultPreferences, type Preferences } from './preferences';
function NotificationsCard({
  preferences,
  update,
  twitch,
}: {
  preferences: Preferences;
  update: (next: Preferences) => void;
  twitch: TwitchData;
}) {
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
  return (
    <Card title="Benachrichtigungen">
      <div className="setting-row">
        <div>
          <h3>Ton bei Live-Start</h3>
        </div>
        <button className="text-link" onClick={() => playAlertSound(preferences.volume)}>
          Testen
        </button>
        <button
          className="switch"
          role="switch"
          aria-checked={preferences.sound}
          aria-label="Ton bei Live-Start"
          onClick={() => update({ ...preferences, sound: !preferences.sound })}
        >
          <span />
        </button>
      </div>
      <div className="setting-row">
        <div>
          <h3>Lautstärke</h3>
        </div>
        <input
          type="range"
          className="volume-slider"
          min={0}
          max={100}
          step={5}
          value={preferences.volume}
          disabled={!preferences.sound}
          aria-label="Lautstärke"
          aria-valuetext={`${preferences.volume} %`}
          style={{ '--value': `${preferences.volume}%` } as CSSProperties}
          onChange={(event) => update({ ...preferences, volume: Number(event.target.value) })}
        />
        <span className="volume-value" aria-hidden>
          {preferences.volume} %
        </span>
      </div>
      <div className="setting-row">
        <div>
          <h3>Nicht stören</h3>
          <p>Kein Ton, keine Popouts</p>
        </div>
        <button
          className="switch"
          role="switch"
          aria-checked={preferences.quiet}
          aria-label="Nicht stören"
          onClick={() => update({ ...preferences, quiet: !preferences.quiet })}
        >
          <span />
        </button>
      </div>
      <div className="setting-row">
        <div>
          <h3>Akku-Warnung</h3>
          <p>Ab 15 %</p>
        </div>
        <button
          className="switch"
          role="switch"
          aria-checked={preferences.batteryWarning}
          aria-label="Akku-Warnung"
          onClick={() => update({ ...preferences, batteryWarning: !preferences.batteryWarning })}
        >
          <span />
        </button>
      </div>
      <div className="setting-row">
        <div>
          <h3>Warnung bei Überlastung</h3>
          <p>CPU und RAM ab 90 %, Grafikkarte ab 95 %, mit Ursache</p>
        </div>
        <button
          className="switch"
          role="switch"
          aria-checked={preferences.loadWarning}
          aria-label="Warnung bei Überlastung"
          onClick={() => update({ ...preferences, loadWarning: !preferences.loadWarning })}
        >
          <span />
        </button>
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
export function SettingsPage({
  preferences,
  update,
  storageAvailable,
  twitch,
  usage,
  music,
  apps,
  updates,
}: {
  preferences: Preferences;
  update: (next: Preferences) => void;
  storageAvailable: boolean;
  twitch: TwitchData;
  usage: UsageState;
  music: Music;
  apps: Apps;
  updates: Updates;
}) {
  const planned = twitch.adapter.account ? [] : ['Twitch-Account'];
  const design = designs.find((d) => d.id === preferences.design) ?? designs[0];
  const ownColours = design.id !== 'classic';

  // Search: rows (and whole cards) whose text does not contain the words are hidden. Runs after
  // every render, since cards change their rows themselves.
  const [query, setQuery] = useState('');
  const [found, setFound] = useState(true);
  const layout = useRef<HTMLDivElement>(null);
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

  return (
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
      {!found && (
        <p className="section-note" role="status">
          Keine Einstellung passt zu „{query.trim()}“.
        </p>
      )}
      <Card title="Darstellung">
        <div className="setting-row">
          <div>
            <h3>Design</h3>
            <p>{design.name}</p>
          </div>
          <div className="design-picker" role="group" aria-label="Design">
            {designs.map((d) => (
              <button
                key={d.id}
                className="design-choice"
                aria-pressed={preferences.design === d.id}
                onClick={() => update({ ...preferences, design: d.id })}
              >
                {/* Small preview in the design's colours (classic: in the chosen scheme). */}
                <span
                  className="design-mini"
                  data-design-preview={d.id}
                  data-theme={d.id === 'classic' ? preferences.theme : undefined}
                  aria-hidden="true"
                >
                  <i />
                  <b />
                </span>
                {d.name}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <div>
            <h3>Farbe</h3>
            <p>
              {ownColours
                ? `${design.name} hat eigene Farben`
                : themes.find((t) => t.id === preferences.theme)?.name}
            </p>
          </div>
          <div className="theme-picker" role="group" aria-label="Farbschema">
            {themes.map((t) => (
              <button
                key={t.id}
                className="theme-swatch"
                data-theme={t.id}
                aria-label={t.name}
                aria-pressed={preferences.theme === t.id}
                title={ownColours ? `${t.name} (nur im Design Klassisch)` : t.name}
                disabled={ownColours}
                onClick={() => update({ ...preferences, theme: t.id })}
              />
            ))}
          </div>
        </div>
        <div className="setting-row">
          <div>
            <h3>Kompakte Ansicht</h3>
          </div>
          <button
            className="switch"
            role="switch"
            aria-checked={preferences.compact}
            aria-label="Kompakte Ansicht"
            onClick={() => update({ ...preferences, compact: !preferences.compact })}
          >
            <span />
          </button>
        </div>
        <div className="setting-row">
          <div>
            <h3>Animationen</h3>
          </div>
          <button
            className="switch"
            role="switch"
            aria-checked={preferences.motion}
            aria-label="Animationen"
            onClick={() => update({ ...preferences, motion: !preferences.motion })}
          >
            <span />
          </button>
        </div>
        {!storageAvailable && <p role="status">Speichern nicht verfügbar.</p>}
        <button
          className="secondary-button"
          onClick={() =>
            // Only the look; notifications, popouts and system settings stay.
            update({
              ...preferences,
              compact: defaultPreferences.compact,
              motion: defaultPreferences.motion,
              theme: defaultPreferences.theme,
              design: defaultPreferences.design,
            })
          }
        >
          Darstellung zurücksetzen
        </button>
      </Card>
      <TwitchAccountCard twitch={twitch} />
      <NotificationsCard preferences={preferences} update={update} twitch={twitch} />
      <PopoutCard preferences={preferences} update={update} />
      <SystemCard
        usage={usage}
        updates={updates}
        autoCheck={preferences.updateCheck}
        setAutoCheck={(updateCheck) => update({ ...preferences, updateCheck })}
      />
      <GamingCard />
      <TransferCard
        preferences={preferences}
        update={update}
        music={music}
        apps={apps}
        twitch={twitch}
      />
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
    </div>
  );
}
