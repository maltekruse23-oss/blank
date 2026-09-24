import { useState } from 'react';
import { ListFilter, Trophy } from 'lucide-react';
import { proStreamers } from '../../data/proStreamers';
import { RefreshButton } from '../twitch/RefreshButton';
import { StreamCard } from '../twitch/StreamCard';
import { TwitchAccountCard } from '../twitch/TwitchAccountCard';
import type { TwitchData } from '../twitch/useTwitch';
import { matchesFilter, NO_FILTER, ProFilter, type ProFilterValue } from './ProFilter';
import { ProMeta } from './ProMeta';
import { usePros } from './usePros';

/** Live League of Legends pros, OTPs and high-elo players from a curated list; no offline channels. */
export function ProsPage({ twitch }: { twitch: TwitchData }) {
  const real = twitch.adapter.source === 'twitch';
  const pros = usePros(twitch.adapter, real && !twitch.needsLogin);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState<ProFilterValue>(NO_FILTER);
  const { streams, live } = pros;
  const filtering = filter.lane !== null || filter.kind !== null;
  const shown = live.filter((p) => matchesFilter(p, filter));

  if (!real)
    return (
      <div className="empty-state">
        <Trophy size={28} />
        <h2>Nur in der Desktop-App</h2>
      </div>
    );
  if (twitch.needsLogin || (twitch.accountFailed && !twitch.account))
    return <TwitchAccountCard twitch={twitch} />;
  return (
    <>
      <div className="toolbar">
        {streams.status === 'ready' && (
          <span className="toolbar-count" title={`${proStreamers.length} Spieler auf der Liste`}>
            <b>{shown.length}</b> {filtering && `von ${live.length} `}live
          </span>
        )}
        <button
          className={`filter-button icon-only ${filterOpen || filtering ? 'selected' : ''}`}
          aria-label="Filter"
          title={filtering ? 'Filter aktiv' : 'Filter'}
          aria-expanded={filterOpen}
          aria-controls="pro-filter"
          onClick={() => setFilterOpen(!filterOpen)}
        >
          <ListFilter size={16} />
        </button>
        <RefreshButton data={pros} result={pros.streams} />
      </div>
      {filterOpen && <ProFilter live={live} value={filter} onChange={setFilter} />}
      {streams.status === 'ready' && streams.staleBecause && (
        <div className="notice" role="status">
          Aktualisierung fehlgeschlagen · Stand{' '}
          {streams.updatedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
      {streams.status === 'loading' && (
        <p className="section-note" role="status">
          Lädt …
        </p>
      )}
      {streams.status === 'error' && (
        <div className="notice" role="status">
          Twitch-Daten nicht verfügbar.
        </div>
      )}
      {shown.length > 0 && (
        <div className="stream-grid">
          {shown.map(({ channel, stream, pro }) => (
            <StreamCard
              key={channel.login}
              twitch={twitch}
              channel={channel}
              stream={stream}
              subtitle={<ProMeta pro={pro} />}
              previewStamp={pros.previewStamp}
            />
          ))}
        </div>
      )}
      {streams.status === 'ready' && live.length === 0 && (
        <div className="empty-state">
          <Trophy size={28} />
          <h2>Gerade spielt kein Pro live League</h2>
        </div>
      )}
      {live.length > 0 && shown.length === 0 && (
        <div className="empty-state">
          <ListFilter size={28} />
          <h2>Kein Live-Spieler passt zum Filter</h2>
          <button className="secondary-button" onClick={() => setFilter(NO_FILTER)}>
            Filter zurücksetzen
          </button>
        </div>
      )}
    </>
  );
}
