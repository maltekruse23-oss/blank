import type { WatchedChannel } from '../../adapters/twitch';
import type { TwitchData } from './useTwitch';

/** Something else a click on the card does (in a watch-together room: switch for everyone). */
export type CardAction = { label: string; run: () => void };

/** Invisible button over a card or row that opens the channel; absent for fictional channels. */
export function ChannelLink({
  twitch,
  channel,
  title,
  action,
}: {
  twitch: TwitchData;
  channel: Pick<WatchedChannel, 'login' | 'displayName'>;
  title?: string;
  action?: CardAction;
}) {
  if (action)
    return (
      <button
        className="channel-link"
        aria-label={action.label}
        title={action.label}
        onClick={action.run}
      />
    );
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
