import type { ReactNode } from 'react';
import { Radio, Users } from 'lucide-react';
import type { ChannelInfo, LiveStream } from '../../adapters/twitch';
import { ChannelAvatar, channelTone } from '../../components/ui';
import { ChannelLink } from './ChannelLink';
import type { TwitchData } from './useTwitch';

/** After a manual refresh, a new query forces the browser to fetch the current preview image. */
function previewUrl(url: string, stamp: number | null) {
  if (stamp === null) return url;
  const fresh = new URL(url);
  fresh.searchParams.set('r', String(stamp));
  return fresh.toString();
}

/** Live card: 16:9 preview with pills, avatar, name, one-line title and a subtitle. */
export function StreamCard({
  twitch,
  channel,
  stream,
  subtitle,
  previewStamp,
}: {
  twitch: TwitchData;
  channel: ChannelInfo;
  stream: LiveStream;
  subtitle: ReactNode;
  previewStamp: number | null;
}) {
  const mock = twitch.adapter.source === 'mock' ? ' · Mock' : '';
  return (
    <article className="card stream-card">
      <div className={`stream-thumb ${channelTone(channel.login)}`}>
        {stream.thumbnailUrl ? (
          <img src={previewUrl(stream.thumbnailUrl, previewStamp)} alt="" />
        ) : (
          <Radio size={34} strokeWidth={1} />
        )}
        <span className="thumb-pill live">
          <i /> Live{mock}
        </span>
        <span className="thumb-pill viewers">
          <Users size={11} /> {stream.viewers.toLocaleString('de-DE')}
        </span>
      </div>
      <div className="stream-body">
        <ChannelAvatar login={channel.login} imageUrl={channel.profileImageUrl} />
        <div className="stream-text">
          <h2>{channel.displayName}</h2>
          <p title={stream.title}>{stream.title}</p>
          <small>{subtitle}</small>
        </div>
      </div>
      <ChannelLink twitch={twitch} channel={channel} title={stream.title} />
    </article>
  );
}
