import { Ticker } from '../../components/Ticker';
import { Card, ChannelAvatar, DeviceIcon, Meter } from '../../components/ui';
import { pcMetrics } from '../pc/PcPage';
import type { PcState } from '../pc/usePcStatus';
import { batteryText, LOW_BATTERY } from '../devices/DevicesPage';
import type { Batteries } from '../devices/useBatteries';
import type { Page } from '../../app/App';
import { usePros } from '../pros/usePros';
import { ChannelLink } from '../twitch/ChannelLink';
import type { TwitchData } from '../twitch/useTwitch';

/** Live channels listed on Home; the Twitch card is two rows high. */
const LIVE_ROWS = 6;
/** When none of the own channels is live: the biggest live pros instead. */
const PRO_ROWS = 3;

export function HomePage({
  navigate,
  twitch,
  batteries,
  pc,
}: {
  navigate: (page: Page) => void;
  twitch: TwitchData;
  batteries: Batteries;
  pc: PcState;
}) {
  const { streams } = twitch;
  const setup = batteries.state;
  const live = twitch.entries.flatMap(({ channel, status }) =>
    status.kind === 'live' ? [{ channel, stream: status.stream }] : [],
  );
  // None of the own channels live: the card shows live pros instead of staying empty. Asked only
  // then, and only while Home is open (like the Pros page, once a minute).
  const noneLive = streams.status === 'ready' && !twitch.needsLogin && live.length === 0;
  const pros = usePros(twitch.adapter, twitch.adapter.source === 'twitch' && noneLive);
  return (
    <>
      <div className="dashboard-grid">
        <Card title="Twitch Live" action={() => navigate('twitch')} className="home-twitch">
          <div className="card-summary">
            <strong>
              <Ticker
                text={
                  streams.status === 'ready' && !twitch.needsLogin
                    ? String(live.length).padStart(2, '0')
                    : '—'
                }
              />{' '}
              <span>Streams online</span>
            </strong>
          </div>
          {twitch.needsLogin ? (
            <small role="status">Nicht mit Twitch verbunden</small>
          ) : (
            <>
              {streams.status === 'loading' && <small role="status">Lädt …</small>}
              {streams.status === 'error' && <small role="status">Nicht verfügbar</small>}
            </>
          )}
          {live.slice(0, LIVE_ROWS).map(({ channel, stream }) => (
            <div className="list-row" key={channel.login}>
              <ChannelAvatar login={channel.login} imageUrl={channel.profileImageUrl} />
              <div className="row-copy">
                <b>{channel.displayName}</b>
                <small>{stream.game.name}</small>
              </div>
              <span
                className="live-dot"
                title={
                  twitch.adapter.source === 'mock' ? 'Simulierter Live-Status' : 'Live auf Twitch'
                }
              />
              <small>{stream.viewers.toLocaleString('de-DE')}</small>
              <ChannelLink twitch={twitch} channel={channel} title={stream.title} />
            </div>
          ))}
          {live.length > LIVE_ROWS && (
            <small className="more-note">+{live.length - LIVE_ROWS} weitere live</small>
          )}
          {noneLive && (
            <>
              <small className="home-none-live">Keiner deiner Kanäle ist live</small>
              {pros.live.length > 0 && <span className="eyebrow home-pros-title">Pros live</span>}
              {pros.live.slice(0, PRO_ROWS).map(({ channel, stream, pro }) => (
                <div className="list-row" key={channel.login}>
                  <ChannelAvatar login={channel.login} imageUrl={channel.profileImageUrl} />
                  <div className="row-copy">
                    <b>{channel.displayName}</b>
                    <small>
                      {pro.lane} · {pro.label}
                    </small>
                  </div>
                  <span className="live-dot" title="Live auf Twitch" />
                  <small>{stream.viewers.toLocaleString('de-DE')}</small>
                  <ChannelLink twitch={twitch} channel={channel} title={stream.title} />
                </div>
              ))}
              {pros.live.length > PRO_ROWS && (
                <button className="text-link more-note" onClick={() => navigate('pros')}>
                  Alle {pros.live.length} Pros live ansehen
                </button>
              )}
            </>
          )}
        </Card>
        <Card title="Dein Setup" action={() => navigate('devices')}>
          {setup.status === 'unavailable' && <small>Nur in der Desktop-App</small>}
          {setup.status === 'loading' && <small role="status">Lädt …</small>}
          {setup.status === 'error' && <small role="status">Nicht verfügbar</small>}
          {setup.status === 'ready' && setup.devices.length === 0 && (
            <small>Kein Gerät mit lesbarem Akku gefunden</small>
          )}
          {setup.status === 'ready' &&
            setup.devices.slice(0, 3).map((d) => (
              <div className="list-row" key={d.id}>
                <span className="device-small">
                  <DeviceIcon kind={d.kind} />
                </span>
                <div className="row-copy">
                  <b>{d.name}</b>
                  <small>
                    {!d.reachable ? 'Nicht erreichbar' : d.charge === 'charging' ? 'Lädt' : d.link}
                  </small>
                </div>
                <span
                  className={`battery-number ${d.battery !== null && d.battery <= LOW_BATTERY ? 'battery-low' : ''}`}
                >
                  {batteryText(d)}
                </span>
              </div>
            ))}
        </Card>
        <Card title="PC-Status" action={() => navigate('pc')}>
          {pc.status === 'unavailable' && <small>Nur in der Desktop-App</small>}
          {pc.status === 'loading' && <small role="status">Misst …</small>}
          {pc.status === 'error' && <small role="status">Nicht verfügbar</small>}
          {pc.status === 'ready' && (
            <div className="mini-metrics">
              {pcMetrics(pc.pc).map((m) => (
                <div key={m.name}>
                  <span>{m.name}</span>
                  <strong>
                    <Ticker text={m.value ?? '—'} />
                    <small> {m.unit}</small>
                  </strong>
                  {m.percent !== null ? (
                    <Meter value={Math.min(100, m.percent)} label={`${m.name} Auslastung`} />
                  ) : (
                    <div className="meter" />
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
