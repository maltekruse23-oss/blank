import { useState } from 'react';
import { Radio, SlidersHorizontal } from 'lucide-react';
import { ChannelAvatar } from '../../components/ui';
import { ChannelLink } from './ChannelLink';
import { RefreshButton } from './RefreshButton';
import { StreamCard } from './StreamCard';
import { TwitchAccountCard } from './TwitchAccountCard';
import type { TwitchData } from './useTwitch';
import { WatchlistPanel } from './WatchlistPanel';

export function TwitchPage({ twitch }: { twitch: TwitchData }) {
  const [onlyLive, setOnlyLive] = useState(false);
  const [managing, setManaging] = useState(false);
  const { entries, streams, loaded } = twitch;
  const mock = twitch.adapter.source === 'mock' ? ' · Mock' : '';
  // Channels that are live with a game outside their rule stay hidden.
  const shown = entries.filter((e) => e.status.kind !== 'other-game');
  const liveCount = shown.filter((e) => e.status.kind === 'live').length;
  const filtered = shown.filter(({ status }) => !onlyLive || status.kind === 'live');
  const live = filtered
    .flatMap(({ channel, status }) =>
      status.kind === 'live' ? [{ channel, stream: status.stream }] : [],
    )
    .sort((a, b) => b.stream.viewers - a.stream.viewers);
  const rest = filtered.filter((e) => e.status.kind !== 'live');
  if (twitch.needsLogin || (twitch.accountFailed && !twitch.account))
    return <TwitchAccountCard twitch={twitch} />;
  return (
    <>
      <div className="toolbar">
        <button
          className={`filter-button ${onlyLive ? 'selected' : ''}`}
          aria-pressed={onlyLive}
          onClick={() => setOnlyLive(!onlyLive)}
        >
          Nur live {streams.status === 'ready' && <span>{liveCount}</span>}
        </button>
        <button
          className={`filter-button ${managing ? 'selected' : ''}`}
          aria-expanded={managing}
          aria-controls="watchlist"
          onClick={() => setManaging(!managing)}
        >
          <SlidersHorizontal size={16} /> Kanäle
        </button>
        <RefreshButton data={twitch} result={twitch.streams} />
      </div>
      {managing && <WatchlistPanel twitch={twitch} />}
      {streams.status === 'ready' && streams.staleBecause && (
        <div className="notice" role="status">
          Aktualisierung fehlgeschlagen · Stand{' '}
          {streams.updatedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
      {(!loaded || streams.status === 'loading') && (
        <p className="section-note" role="status">
          Lädt …
        </p>
      )}
      {streams.status === 'error' && (
        <div className="notice" role="status">
          Twitch-Daten nicht verfügbar.
        </div>
      )}
      {live.length > 0 && (
        <div className="stream-grid">
          {live.map(({ channel, stream }) => (
            <StreamCard
              key={channel.login}
              twitch={twitch}
              channel={channel}
              stream={stream}
              subtitle={stream.game.name}
              previewStamp={twitch.previewStamp}
            />
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <section className="offline-section" aria-label="Offline">
          <span className="eyebrow">Offline</span>
          <div className="offline-list">
            {rest.map(({ channel, status }) => (
              <div
                className="offline-chip"
                key={channel.login}
                title={status.kind === 'unknown' ? 'Status unbekannt' : `Offline${mock}`}
              >
                <ChannelAvatar login={channel.login} imageUrl={channel.profileImageUrl} muted />
                <span>{channel.displayName}</span>
                <ChannelLink twitch={twitch} channel={channel} />
              </div>
            ))}
          </div>
        </section>
      )}
      {loaded && entries.length === 0 && (
        <div className="empty-state">
          <Radio size={28} />
          <h2>Keine Kanäle ausgewählt</h2>
          {!managing && (
            <button className="secondary-button" onClick={() => setManaging(true)}>
              Kanäle verwalten
            </button>
          )}
        </div>
      )}
      {streams.status === 'ready' && entries.length > 0 && filtered.length === 0 && (
        <div className="empty-state">
          <Radio size={28} />
          {onlyLive ? (
            <h2>Gerade ist keiner deiner Kanäle live</h2>
          ) : (
            <h2>Deine Kanäle spielen gerade andere Spiele</h2>
          )}
          {onlyLive && (
            <button className="secondary-button" onClick={() => setOnlyLive(false)}>
              Alle Kanäle zeigen
            </button>
          )}
        </div>
      )}
    </>
  );
}
