import { useEffect, useState } from 'react';
import { ChannelAvatar } from '../components/ui';
import type { TwitchData } from '../features/twitch/useTwitch';

/** Profile block at the bottom of the sidebar: Twitch connection at a glance, opens Settings. */
export function SidebarAccount({ twitch, onOpen }: { twitch: TwitchData; onOpen: () => void }) {
  const { account, adapter } = twitch;
  const login = account?.signedIn ? account.login : null;
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    setImageUrl(null);
    if (!login) return;
    let active = true;
    adapter.fetchChannels([login]).then(
      ([own]) => active && setImageUrl(own?.profileImageUrl ?? null),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [adapter, login]);

  const mock = adapter.source === 'mock';
  const connected = mock || Boolean(account?.signedIn);
  const name = mock ? 'Vorschau' : account === null ? '…' : (login ?? 'Nicht verbunden');
  const detail = mock ? 'Mock-Daten' : connected ? 'Verbunden' : 'Twitch';
  return (
    <button className="sidebar-account" onClick={onOpen} title="Konto in Settings">
      <ChannelAvatar login={login ?? 'blank'} imageUrl={imageUrl} muted={!connected} />
      <span className="sidebar-account-text">
        <b>{name}</b>
        <small>
          <i className={connected ? 'on' : ''} />
          {detail}
        </small>
      </span>
    </button>
  );
}
