import { useCallback, useEffect, useRef, useState } from 'react';
import type { AramAdapter, AramData } from '../../adapters/aram';

/** When the window comes back, at most this often a new look into the League client. */
const RESYNC_MS = 2 * 60_000;

export type AramState =
  | { status: 'loading' }
  | { status: 'ready'; data: AramData; updatedAt: Date; staleBecause: string | null }
  | { status: 'error'; message: string };

const stand = (data: AramData) => (data.syncedAt ? new Date(data.syncedAt) : new Date());

/**
 * The ARAM Mayhem collection, only while the page is open: the stored games at once, then new
 * ones from the League client – on opening, when the friends change, on returning to the window
 * (after a game) and on click. No polling.
 */
export function useAram(adapter: AramAdapter, enabled: boolean, friends: string[]) {
  const [state, setState] = useState<AramState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const running = useRef(false);
  const lastSync = useRef(0);
  const friendsKey = friends.join(',');

  const sync = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    lastSync.current = Date.now();
    setRefreshing(true);
    try {
      const data = await adapter.sync(friendsKey ? friendsKey.split(',') : []);
      setState({ status: 'ready', data, updatedAt: stand(data), staleBecause: null });
    } catch (error) {
      const message = typeof error === 'string' ? error : 'Unbekannter Fehler.';
      setState((previous) =>
        previous.status === 'ready'
          ? { ...previous, staleBecause: message }
          : { status: 'error', message },
      );
    } finally {
      running.current = false;
      setRefreshing(false);
    }
  }, [adapter, friendsKey]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void adapter.data().then(
      (data) => {
        if (!active) return;
        setState((previous) =>
          previous.status === 'ready'
            ? previous
            : { status: 'ready', data, updatedAt: stand(data), staleBecause: null },
        );
        if (data.client) void sync();
      },
      (error: unknown) =>
        active &&
        setState({
          status: 'error',
          message: typeof error === 'string' ? error : 'Unbekannter Fehler.',
        }),
    );
    // blank. fetched new games by itself (after a game): show them.
    const stopUpdates = adapter.onUpdate(() => {
      void adapter.data().then(
        (data) =>
          active && setState({ status: 'ready', data, updatedAt: stand(data), staleBecause: null }),
        () => undefined,
      );
    });
    const back = () => {
      if (!document.hidden && Date.now() - lastSync.current >= RESYNC_MS) void sync();
    };
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);
    return () => {
      active = false;
      stopUpdates();
      window.removeEventListener('focus', back);
      document.removeEventListener('visibilitychange', back);
    };
  }, [adapter, enabled, sync]);

  /** Starts the leaderboard anew (all games go, only later ones count). */
  const reset = async () => {
    const data = await adapter.reset();
    setState({ status: 'ready', data, updatedAt: new Date(), staleBecause: null });
  };

  return { state, refreshing, reload: () => void sync(), reset };
}

export type AramHook = ReturnType<typeof useAram>;
