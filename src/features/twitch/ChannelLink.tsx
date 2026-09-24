import type { WatchedChannel } from '../../adapters/twitch';
import type { TwitchData } from './useTwitch';

/** Invisible button over a card or row that opens the channel; absent for fictional channels. */
export function ChannelLink({
  twitch,
  channel,
  title,
}: {
  twitch: TwitchData;
  channel: Pick<WatchedChannel, 'login' | 'displayName'>;
  title?: string;
}) {
  const open = twitch.adapter.openChannel;
  if (!open) return null;
  return (
    <button
      className="channel-link"
      aria-label={`${channel.displayName} auf Twitch öffnen`}
      title={title ?? 'Auf Twitch öffnen'}
      onClick={() => void open(channel.login).catch(() => undefined)}
    />
  );
}
