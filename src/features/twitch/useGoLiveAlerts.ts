import { useEffect, useRef, useState } from 'react';
import { matchesGames, type WatchedChannel } from '../../adapters/twitch';
import { playAlertSound } from '../../platform/sound';
import type { ChannelStatus, TwitchData } from './useTwitch';

export type GoLiveAlert = { id: number; at: number; channel: WatchedChannel; game: string };

// Push and polling can both see the same start; announce a channel at most once in this window.
const REPEAT_AFTER_MS = 10 * 60_000;
// Long enough to notice it and click through to the stream.
const SHOW_MS = 30_000;
// Helix lists a new stream a little after the push; load again a few times.
const REFETCH_AFTER_MS = [0, 20_000, 60_000];

/**
 * Detects channels that went live (or switched to a selected game) and announces them with a
 * short sound and a notice: instantly via push where available, otherwise from polling results.
 * `volume` 0–100; 0 announces without sound.
 */
export function useGoLiveAlerts(twitch: TwitchData, volume: number) {
  const [alerts, setAlerts] = useState<GoLiveAlert[]>([]);
  const announced = useRef(new Map<string, number>());
  const previous = useRef<Map<string, ChannelStatus['kind']> | null>(null);
  const nextId = useRef(1);
  const latest = useRef({ twitch, volume });
  latest.current = { twitch, volume };

  function dismiss(id: number) {
    setAlerts((list) => list.filter((a) => a.id !== id));
  }

  function announce(channel: WatchedChannel, game: string) {
    const last = announced.current.get(channel.login);
    if (last !== undefined && Date.now() - last < REPEAT_AFTER_MS) return;
    announced.current.set(channel.login, Date.now());
    playAlertSound(latest.current.volume);
    const id = nextId.current++;
    setAlerts((list) => [...list.slice(-2), { id, at: Date.now(), channel, game }]);
    window.setTimeout(() => dismiss(id), SHOW_MS);
  }

  // Instant push (desktop app).
  useEffect(() => {
    const subscribe = twitch.adapter.onStreamOnline;
    if (!subscribe) return;
    const timers: number[] = [];
    const stop = subscribe((event) => {
      const channel = latest.current.twitch.entries.find(
        (e) => e.channel.login === event.login,
      )?.channel;
      if (!channel) return;
      // Unknown game: a game rule cannot be checked yet, polling decides later.
      const gameKnown = event.game.id !== '';
      if (gameKnown ? matchesGames(channel, event) : channel.games.length === 0)
        announce(channel, event.game.name);
      for (const delay of REFETCH_AFTER_MS)
        timers.push(window.setTimeout(() => latest.current.twitch.refetch(), delay));
    });
    return () => {
      stop();
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [twitch.adapter]);

  // Polling: compare each new result with the previous one.
  const { streams, entries } = twitch;
  const updatedAt = streams.status === 'ready' ? streams.updatedAt.getTime() : null;
  useEffect(() => {
    if (updatedAt === null) return;
    const before = previous.current;
    previous.current = new Map(entries.map((e) => [e.channel.login, e.status.kind]));
    // The first result after start is the baseline; newly added channels have no "before".
    if (!before) return;
    for (const { channel, status } of entries) {
      const was = before.get(channel.login);
      if (status.kind === 'live' && (was === 'offline' || was === 'other-game'))
        announce(channel, status.stream.game.name);
    }
    // Only a new result matters; entries belong to it.
  }, [updatedAt]);

  return { alerts, dismiss };
}
