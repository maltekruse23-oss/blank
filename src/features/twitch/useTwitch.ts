import { useEffect, useRef, useState } from 'react';
import {
  errorKind,
  matchesGames,
  type ChannelInfo,
  type LiveStream,
  type TwitchAccount,
  type TwitchAdapter,
  type TwitchErrorKind,
  type WatchedChannel,
} from '../../adapters/twitch';

export type StreamsState =
  | { status: 'loading' }
  | { status: 'error'; kind: TwitchErrorKind }
  | {
      status: 'ready';
      /** Logins covered by this result; channels added later are still unknown. */
      logins: string[];
      streams: LiveStream[];
      updatedAt: Date;
      staleBecause: TwitchErrorKind | null;
    };

export type ChannelStatus =
  | { kind: 'live'; stream: LiveStream }
  | { kind: 'other-game'; stream: LiveStream }
  | { kind: 'offline' }
  | { kind: 'unknown' };

export type ChannelEntry = { channel: WatchedChannel; status: ChannelStatus };
export type TwitchData = ReturnType<typeof useTwitch>;

function statusOf(channel: WatchedChannel, state: StreamsState): ChannelStatus {
  if (state.status !== 'ready' || !state.logins.includes(channel.login)) return { kind: 'unknown' };
  const stream = state.streams.find((s) => s.login === channel.login);
  if (!stream) return { kind: 'offline' };
  return matchesGames(channel, stream) ? { kind: 'live', stream } : { kind: 'other-game', stream };
}

export function useTwitch(adapter: TwitchAdapter) {
  const [watchlist, setWatchlist] = useState<WatchedChannel[] | null>(null);
  const [streams, setStreams] = useState<StreamsState>({ status: 'loading' });
  const [saveFailed, setSaveFailed] = useState(false);
  /** null while unknown; always null for sources without login. */
  const [account, setAccount] = useState<TwitchAccount | null>(null);
  const [accountFailed, setAccountFailed] = useState(false);
  // Bumped after login/logout so account and streams are loaded again.
  const [revision, setRevision] = useState(0);
  // Manual refresh: reloads streams now; the stamp forces fresh preview images.
  const [streamRevision, setStreamRevision] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [channelsRefreshing, setChannelsRefreshing] = useState(false);
  const [previewStamp, setPreviewStamp] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    adapter.loadWatchlist().then(
      (list) => active && setWatchlist(list),
      () => active && setWatchlist([]),
    );
    return () => {
      active = false;
    };
  }, [adapter]);

  useEffect(() => {
    if (!adapter.account) return;
    let active = true;
    adapter.account.status().then(
      (status) => {
        if (!active) return;
        setAccount(status);
        setAccountFailed(false);
      },
      () => active && setAccountFailed(true),
    );
    return () => {
      active = false;
    };
  }, [adapter, revision]);

  // Only a change of the selected logins needs a new request; game rules are applied locally.
  const loginKey = watchlist?.map((c) => c.login).join(',');
  useEffect(() => {
    if (loginKey === undefined) return;
    const logins = loginKey ? loginKey.split(',') : [];
    let active = true;
    const load = () =>
      adapter.fetchLiveStreams(logins).then(
        (list) => {
          if (!active) return;
          setStreams({
            status: 'ready',
            logins,
            streams: list,
            updatedAt: new Date(),
            staleBecause: null,
          });
          setRefreshing(false);
        },
        (error: unknown) => {
          if (!active) return;
          setRefreshing(false);
          const kind = errorKind(error);
          setStreams((previous) =>
            previous.status === 'ready'
              ? { ...previous, staleBecause: kind }
              : { status: 'error', kind },
          );
        },
      );
    void load();
    const timer = window.setInterval(load, adapter.refreshMs);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [adapter, loginKey, revision, streamRevision]);

  function update(next: WatchedChannel[]) {
    setWatchlist(next);
    adapter.saveWatchlist(next).then(
      () => setSaveFailed(false),
      () => setSaveFailed(true),
    );
  }

  // Name and profile image are stored with the channel; this refreshes them for the given logins.
  const latest = useRef(watchlist);
  latest.current = watchlist;
  function applyChannelInfo(infos: ChannelInfo[], logins: string[]) {
    const current = latest.current;
    if (!current) return;
    const byLogin = new Map(infos.map((info) => [info.login, info]));
    let changed = false;
    const next = current.map((c) => {
      if (!logins.includes(c.login)) return c;
      const info = byLogin.get(c.login);
      const displayName = info?.displayName ?? c.displayName;
      // A channel Twitch no longer returns keeps its data; "not looked up" becomes "none".
      const profileImageUrl = info ? (info.profileImageUrl ?? null) : (c.profileImageUrl ?? null);
      if (displayName === c.displayName && profileImageUrl === c.profileImageUrl) return c;
      changed = true;
      return { ...c, displayName, profileImageUrl };
    });
    if (changed) update(next);
  }

  // Channels saved before profile images existed get them looked up once.
  const canLookUp = !adapter.account || account?.signedIn === true;
  const missingImages = watchlist
    ?.filter((c) => c.profileImageUrl === undefined)
    .map((c) => c.login)
    .join(',');
  useEffect(() => {
    if (!missingImages || !canLookUp) return;
    let active = true;
    const logins = missingImages.split(',');
    adapter.fetchChannels(logins).then(
      (infos) => active && applyChannelInfo(infos, logins),
      () => undefined,
    );
    return () => {
      active = false;
    };
    // applyChannelInfo reads the latest list through a ref; only what is missing matters here.
  }, [adapter, missingImages, canLookUp]);

  // Manual refresh: streams (title, game, viewers, preview) and channel data, all at once.
  function reload() {
    setRefreshing(true);
    setPreviewStamp(Date.now());
    setStreamRevision((r) => r + 1);
    const logins = latest.current?.map((c) => c.login) ?? [];
    if (logins.length === 0 || !canLookUp) return;
    setChannelsRefreshing(true);
    adapter
      .fetchChannels(logins)
      .then(
        (infos) => applyChannelInfo(infos, logins),
        () => undefined,
      )
      .finally(() => setChannelsRefreshing(false));
  }

  const entries: ChannelEntry[] = (watchlist ?? []).map((channel) => ({
    channel,
    status: statusOf(channel, streams),
  }));

  // Without a usable login the page shows the account card instead of channel data.
  const needsLogin = account !== null && (!account.configured || !account.signedIn);

  return {
    adapter,
    loaded: watchlist !== null,
    entries,
    streams,
    update,
    saveFailed,
    account,
    accountFailed,
    needsLogin,
    refresh: () => setRevision((r) => r + 1),
    refreshing: refreshing || channelsRefreshing,
    previewStamp,
    reload,
    /** Loads streams again without the refresh-button feedback (e.g. after a live push). */
    refetch: () => setStreamRevision((r) => r + 1),
  };
}
