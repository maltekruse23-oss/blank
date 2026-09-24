import { useEffect, useRef, useState } from 'react';
import {
  errorKind,
  type ChannelInfo,
  type LiveStream,
  type TwitchAdapter,
} from '../../adapters/twitch';
import { LEAGUE_GAME_ID, proStreamers, type ProStreamer } from '../../data/proStreamers';
import type { StreamsState } from '../twitch/useTwitch';

const REFRESH_MS = 60_000;
// Helix accepts up to 100 logins per streams/users request.
const BATCH = 100;
const byLogin = new Map(proStreamers.map((p) => [p.login, p]));

export type ProLive = { channel: ChannelInfo; stream: LiveStream; pro: ProStreamer };

function batches(logins: string[]) {
  const out: string[][] = [];
  for (let i = 0; i < logins.length; i += BATCH) out.push(logins.slice(i, i + BATCH));
  return out;
}

/** Live League of Legends streams of the curated pro list; only while the tab is open. */
export function usePros(adapter: TwitchAdapter, enabled: boolean) {
  const [streams, setStreams] = useState<StreamsState>({ status: 'loading' });
  const [channels, setChannels] = useState<Map<string, ChannelInfo>>(new Map());
  const [revision, setRevision] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [previewStamp, setPreviewStamp] = useState<number | null>(null);
  const known = useRef(channels);
  known.current = channels;

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const logins = proStreamers.map((p) => p.login);
    const load = async () => {
      try {
        const found = await Promise.all(batches(logins).map((b) => adapter.fetchLiveStreams(b)));
        const league = found.flat().filter((s) => s.game.id === LEAGUE_GAME_ID);
        if (!active) return;
        setStreams({
          status: 'ready',
          logins,
          streams: league,
          updatedAt: new Date(),
          staleBecause: null,
        });
        // Names and pictures only for channels shown for the first time.
        const missing = league.map((s) => s.login).filter((l) => !known.current.has(l));
        if (missing.length > 0) {
          const infos = (
            await Promise.all(batches(missing).map((b) => adapter.fetchChannels(b)))
          ).flat();
          if (active)
            setChannels((previous) => {
              const next = new Map(previous);
              for (const info of infos) next.set(info.login, info);
              return next;
            });
        }
      } catch (error) {
        if (!active) return;
        const kind = errorKind(error);
        setStreams((previous) =>
          previous.status === 'ready'
            ? { ...previous, staleBecause: kind }
            : { status: 'error', kind },
        );
      } finally {
        if (active) setRefreshing(false);
      }
    };
    // Nothing here triggers alerts, so a minimized window does not poll; it catches up on restore.
    let lastLoad = 0;
    const poll = () => {
      if (document.hidden) return;
      lastLoad = Date.now();
      void load();
    };
    const onVisibility = () => {
      if (Date.now() - lastLoad >= REFRESH_MS) poll();
    };
    poll();
    const timer = window.setInterval(poll, REFRESH_MS);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [adapter, enabled, revision]);

  const live: ProLive[] =
    streams.status === 'ready'
      ? streams.streams
          .flatMap((stream) => {
            const pro = byLogin.get(stream.login);
            if (!pro) return [];
            const channel = channels.get(stream.login) ?? {
              login: stream.login,
              displayName: stream.login,
            };
            return [{ stream, pro, channel }];
          })
          .sort((a, b) => b.stream.viewers - a.stream.viewers)
      : [];

  return {
    streams,
    live,
    loaded: true,
    refreshing,
    previewStamp,
    reload: () => {
      setRefreshing(true);
      setPreviewStamp(Date.now());
      setRevision((r) => r + 1);
    },
  };
}
