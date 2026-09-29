// The widgets of Home (user's wish: arrange them freely in the edit mode). Each shows as much as
// its size allows; the card around it and the grid are in features/edit/HomeGrid.tsx.
import { useEffect, useState, type ReactNode } from 'react';
import {
  Cpu,
  Headphones,
  Music as MusicIcon,
  Pause,
  Play,
  Radio,
  SkipForward,
  Swords,
  type LucideIcon,
} from 'lucide-react';
import { Ticker } from '../../components/Ticker';
import { ChannelAvatar, DeviceIcon, Meter } from '../../components/ui';
import { pcMetrics } from '../pc/PcPage';
import type { PcState } from '../pc/usePcStatus';
import { batteryText, LOW_BATTERY } from '../devices/DevicesPage';
import type { Batteries } from '../devices/useBatteries';
import { SUPPORTED_DEVICES } from '../../adapters/devices';
import type { Page } from '../../app/App';
import { usePros } from '../pros/usePros';
import { ChannelLink } from '../twitch/ChannelLink';
import type { TwitchData } from '../twitch/useTwitch';
import type { Music } from '../music/useMusic';
import {
  aramAdapter,
  profileIcon,
  splitRiotId,
  type AramData,
  type AramPlayer,
} from '../../adapters/aram';
import { categories, ranking } from '../aram/aramCategories';
import { placeColor } from '../aram/AramRanking';
import { sinceGames } from '../aram/aramStats';
import type { WidgetId } from '../edit/layout';

export type WidgetContext = {
  navigate: (page: Page) => void;
  twitch: TwitchData;
  batteries: Batteries;
  pc: PcState;
  music: Music;
  aramFriends: AramPlayer[];
};

type Widget = {
  title: string;
  /** What it shows, for the widget library. */
  description: string;
  icon: LucideIcon;
  page: Page;
  Body: (props: WidgetContext) => ReactNode;
};

/** Live channels listed at most; the rest as "+n". */
const LIVE_ROWS = 6;
/** When none of the own channels is live: the biggest live pros instead. */
const PRO_ROWS = 3;

function TwitchBody({ navigate, twitch }: WidgetContext) {
  const { streams } = twitch;
  const live = twitch.entries.flatMap(({ channel, status }) =>
    status.kind === 'live' ? [{ channel, stream: status.stream }] : [],
  );
  // None of the own channels live: live pros instead. Asked only then, and only while shown.
  const noneLive = streams.status === 'ready' && !twitch.needsLogin && live.length === 0;
  const pros = usePros(twitch.adapter, twitch.adapter.source === 'twitch' && noneLive);
  return (
    <>
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
            title={twitch.adapter.source === 'mock' ? 'Simulierter Live-Status' : 'Live auf Twitch'}
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
    </>
  );
}

function SetupBody({ batteries }: WidgetContext) {
  const setup = batteries.state;
  return (
    <>
      {setup.status === 'unavailable' && <small>Nur in der Desktop-App</small>}
      {setup.status === 'loading' && <small role="status">Lädt …</small>}
      {setup.status === 'error' && <small role="status">Nicht verfügbar</small>}
      {setup.status === 'ready' && setup.devices.length === 0 && (
        <small title={`Unterstützt: ${SUPPORTED_DEVICES}`}>Kein unterstütztes Gerät gefunden</small>
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
    </>
  );
}

function PcBody({ pc }: WidgetContext) {
  return (
    <>
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
    </>
  );
}

/** blank.'s own mix: what plays, with pause and next; otherwise start the first account's mix. */
function MusicBody({ music, navigate }: WidgetContext) {
  const { player } = music;
  if (player.status === 'playing' || player.status === 'paused') {
    const track = player.track;
    return (
      <div className="widget-music">
        {track?.artworkUrl ? (
          <img className="widget-cover" src={track.artworkUrl} alt="" />
        ) : (
          <span className="widget-cover" aria-hidden>
            <MusicIcon size={18} />
          </span>
        )}
        <div className="row-copy">
          <b>{track?.title ?? 'Lädt …'}</b>
          <small>{track?.artist ?? player.account.name}</small>
        </div>
        <button
          className="icon-button"
          aria-label={player.status === 'playing' ? 'Pause' : 'Weiter'}
          onClick={music.toggle}
        >
          {player.status === 'playing' ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button className="icon-button" aria-label="Nächster Titel" onClick={music.next}>
          <SkipForward size={16} />
        </button>
      </div>
    );
  }
  const first = music.accounts[0];
  return (
    <div className="widget-music">
      <span className="widget-cover" aria-hidden>
        <MusicIcon size={18} />
      </span>
      <div className="row-copy">
        <b>{player.status === 'loading' ? 'Startet …' : 'Kein Mix läuft'}</b>
        <small>
          {music.accounts.length === 0
            ? 'Noch keine Musik hinterlegt'
            : `${music.accounts.length} ${music.accounts.length === 1 ? 'Eintrag' : 'Einträge'}`}
        </small>
      </div>
      {first ? (
        <button className="filter-button" onClick={() => music.startMix(first)}>
          <Play size={13} /> Mix
        </button>
      ) : (
        <button className="text-link" onClick={() => navigate('music')}>
          Hinzufügen
        </button>
      )}
    </div>
  );
}

/** The top three of "Höchster Schaden" from the stored ARAM games (asks the League client nothing). */
function AramBody({ aramFriends }: WidgetContext) {
  const [data, setData] = useState<AramData | null>(null);
  useEffect(() => {
    let active = true;
    void aramAdapter.data().then(
      (d) => active && setData(d),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, []);
  if (!data) return <small role="status">Lädt …</small>;
  const players = [
    ...(data.me ? [data.me] : []),
    ...aramFriends.filter((f) => f.puuid !== data.me?.puuid),
  ];
  const damage = categories.find((c) => c.id === 'damage')!;
  const rows = ranking(damage, players, sinceGames(data.games, data.since))
    .filter((r) => r.value !== null)
    .slice(0, 3);
  if (rows.length === 0) return <small>Noch keine ARAM-Mayhem-Spiele</small>;
  const top = rows[0]!.value ?? 1;
  return (
    <ol className="widget-aram">
      {rows.map((row, i) => (
        <li key={row.player.puuid} style={{ '--place': placeColor(i + 1) } as React.CSSProperties}>
          <span className="aram-bar-place">{i + 1}</span>
          <ChannelAvatar
            login={splitRiotId(row.player.name).name}
            imageUrl={profileIcon(row.player.icon)}
          />
          <span className="aram-bar-name">{splitRiotId(row.player.name).name}</span>
          <b>{damage.format(row.value ?? 0)}</b>
          <span
            className="widget-aram-bar"
            style={{ width: `${((row.value ?? 0) / top) * 100}%` }}
          />
        </li>
      ))}
    </ol>
  );
}

export const widgets: Record<WidgetId, Widget> = {
  twitch: {
    title: 'Twitch Live',
    description: 'Wer von deinen Kanälen live ist',
    icon: Radio,
    page: 'twitch',
    Body: TwitchBody,
  },
  setup: {
    title: 'Dein Setup',
    description: 'Akkus von Maus und Headset',
    icon: Headphones,
    page: 'devices',
    Body: SetupBody,
  },
  pc: {
    title: 'PC-Status',
    description: 'CPU, RAM, Grafikkarte, Laufwerk',
    icon: Cpu,
    page: 'pc',
    Body: PcBody,
  },
  music: {
    title: 'Musik',
    description: 'Dein Mix mit Pause und Weiter',
    icon: MusicIcon,
    page: 'music',
    Body: MusicBody,
  },
  aram: {
    title: 'ARAM',
    description: 'Top 3 im höchsten Schaden',
    icon: Swords,
    page: 'aram',
    Body: AramBody,
  },
};
