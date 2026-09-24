import { useEffect, useState, type CSSProperties } from 'react';
import { Card, Badge } from '../../components/ui';
import { playAlertSound } from '../../platform/sound';
import { TwitchAccountCard } from '../twitch/TwitchAccountCard';
import type { TwitchData } from '../twitch/useTwitch';
import type { UsageState } from '../../app/useAppUsage';
import { SystemCard } from './SystemCard';
import { TransferCard } from './TransferCard';
import type { Music } from '../music/useMusic';
import { petFigure, petFigures } from '../pet/figures';
import { themes } from './themes';
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
          <p>Kein Ton, das Pet bleibt im Hintergrund</p>
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
}: {
  preferences: Preferences;
  update: (next: Preferences) => void;
  storageAvailable: boolean;
  twitch: TwitchData;
  usage: UsageState;
  music: Music;
}) {
  const planned = twitch.adapter.account ? [] : ['Twitch-Account'];
  return (
    <div className="settings-layout">
      <Card title="Darstellung">
        <div className="setting-row">
          <div>
            <h3>Farbe</h3>
            <p>{themes.find((t) => t.id === preferences.theme)?.name}</p>
          </div>
          <div className="theme-picker" role="group" aria-label="Farbschema">
            {themes.map((t) => (
              <button
                key={t.id}
                className="theme-swatch"
                data-theme={t.id}
                aria-label={t.name}
                aria-pressed={preferences.theme === t.id}
                title={t.name}
                onClick={() => update({ ...preferences, theme: t.id })}
              />
            ))}
          </div>
        </div>
        <div className="setting-row">
          <div>
            <h3>Pet</h3>
            <p>{petFigure(preferences.pet).name}</p>
          </div>
          <div className="pet-picker" role="group" aria-label="Pet-Figur">
            {petFigures.map(({ id, name, Figure }) => (
              <button
                key={id}
                className="pet-choice"
                aria-label={name}
                aria-pressed={preferences.pet === id}
                title={name}
                onClick={() => update({ ...preferences, pet: id })}
              >
                <Figure mood="awake" blinking={false} />
              </button>
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
            update({ ...defaultPreferences, sound: preferences.sound, volume: preferences.volume })
          }
        >
          Darstellung zurücksetzen
        </button>
      </Card>
      <TwitchAccountCard twitch={twitch} />
      <NotificationsCard preferences={preferences} update={update} twitch={twitch} />
      <SystemCard usage={usage} />
      <TransferCard preferences={preferences} update={update} music={music} twitch={twitch} />
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
