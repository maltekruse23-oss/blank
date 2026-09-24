import { Headphones } from 'lucide-react';
import type { BatteryDevice, DeviceKind } from '../../adapters/devices';
import { Badge, DeviceIcon, Meter } from '../../components/ui';
import { RefreshButton } from '../twitch/RefreshButton';
import type { Batteries } from './useBatteries';

export const kindLabel: Record<DeviceKind, string> = {
  mouse: 'Maus',
  keyboard: 'Tastatur',
  headset: 'Headset',
  controller: 'Controller',
  other: 'Gerät',
};

/** At or below this the level is highlighted. */
export const LOW_BATTERY = 20;

export function batteryText(d: BatteryDevice) {
  return d.battery === null ? '—' : `${d.battery} %`;
}

function statusText(d: BatteryDevice) {
  if (!d.reachable) return 'Nicht erreichbar';
  if (d.charge === 'charging') return 'Lädt';
  if (d.charge === 'full') return 'Voll geladen';
  return 'Verbunden';
}

/** Real battery levels of the connected wireless devices (desktop app only). */
export function DevicesPage({ batteries }: { batteries: Batteries }) {
  const { state } = batteries;
  if (state.status === 'unavailable')
    return (
      <div className="empty-state">
        <Headphones size={28} />
        <h2>Nur in der Desktop-App</h2>
      </div>
    );
  return (
    <>
      <div className="toolbar">
        {state.status === 'ready' && (
          <span className="toolbar-count">
            <b>{state.devices.length}</b> {state.devices.length === 1 ? 'Gerät' : 'Geräte'}
          </span>
        )}
        <RefreshButton data={batteries} result={state} />
      </div>
      {state.status === 'ready' && state.staleBecause && (
        <div className="notice" role="status">
          Aktualisierung fehlgeschlagen · Stand{' '}
          {state.updatedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
      {state.status === 'loading' && (
        <p className="section-note" role="status">
          Sucht Geräte …
        </p>
      )}
      {state.status === 'error' && (
        <div className="notice" role="status">
          Geräte nicht lesbar.
        </div>
      )}
      {state.status === 'ready' && state.devices.length > 0 && (
        <div className="device-grid">
          {state.devices.map((d) => (
            <article
              className={`card device-card ${!d.reachable ? 'disconnected' : ''}`}
              key={d.id}
            >
              <div className="device-card-top">
                <span className="eyebrow">{kindLabel[d.kind]}</span>
                <Badge active={d.reachable}>{statusText(d)}</Badge>
              </div>
              <h2>{d.name}</h2>
              <p>{d.link}</p>
              <div className="device-illustration">
                <DeviceIcon kind={d.kind} size={60} />
              </div>
              <div className="battery-header">
                <span>Akkustand</span>
                <strong
                  className={d.battery !== null && d.battery <= LOW_BATTERY ? 'battery-low' : ''}
                >
                  {batteryText(d)}
                </strong>
              </div>
              {d.battery !== null ? (
                <Meter value={d.battery} label={`${d.name} Akku`} />
              ) : (
                <div className="meter" />
              )}
            </article>
          ))}
        </div>
      )}
      {state.status === 'ready' && state.devices.length === 0 && (
        <div className="empty-state">
          <Headphones size={28} />
          <h2>Kein Gerät mit lesbarem Akku gefunden</h2>
        </div>
      )}
    </>
  );
}
