import { useEffect, useRef, useState } from 'react';
import { updater, type UpdateInfo } from '../platform/update';

/** First automatic check after the start, then once a day while the app runs. */
const FIRST_CHECK_MS = 20_000;
const DAILY_MS = 24 * 60 * 60 * 1000;

export type UpdateState =
  | { status: 'unavailable' }
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ready'; info: UpdateInfo }
  | { status: 'error'; message: string }
  | { status: 'installing'; latest: string; percent: number }
  /** The new file is in place but did not start: only a restart by hand helps. */
  | { status: 'installed'; latest: string };

/**
 * Update check against the GitHub releases: automatically (switchable) and on request. Installing
 * only happens through install(), i.e. a click.
 */
export function useUpdate(autoCheck: boolean) {
  const [state, setState] = useState<UpdateState>(
    updater ? { status: 'idle' } : { status: 'unavailable' },
  );
  const busy = useRef(false);

  async function check() {
    // Installed: this process still is the old version and would offer the same one again.
    if (!updater || busy.current || state.status === 'installed') return;
    busy.current = true;
    setState({ status: 'checking' });
    try {
      setState({ status: 'ready', info: await updater.check() });
    } catch (error) {
      setState({
        status: 'error',
        message: typeof error === 'string' ? error : 'Update-Prüfung fehlgeschlagen.',
      });
    } finally {
      busy.current = false;
    }
  }
  const latest = useRef(check);
  latest.current = check;

  useEffect(() => {
    if (!updater || !autoCheck) return;
    const first = window.setTimeout(() => void latest.current(), FIRST_CHECK_MS);
    const daily = window.setInterval(() => void latest.current(), DAILY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(daily);
    };
  }, [autoCheck]);

  async function install() {
    if (!updater || state.status !== 'ready' || !state.info.available || busy.current) return;
    busy.current = true;
    const version = state.info.latest;
    setState({ status: 'installing', latest: version, percent: 0 });
    const stop = updater.onProgress((percent) =>
      setState({ status: 'installing', latest: version, percent }),
    );
    try {
      // On success the app closes and the new version starts.
      if (!(await updater.install())) setState({ status: 'installed', latest: version });
    } catch (error) {
      setState({
        status: 'error',
        message: typeof error === 'string' ? error : 'Update fehlgeschlagen.',
      });
    } finally {
      stop();
      busy.current = false;
    }
  }

  const available = state.status === 'ready' && state.info.available ? state.info.latest : null;
  return { state, available, check, install };
}

export type Updates = ReturnType<typeof useUpdate>;
