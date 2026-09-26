import { useEffect, useRef, useState } from 'react';
import {
  appsNative,
  isAppPackage,
  type AppPackage,
  type AppScan,
  type InstallProgress,
} from '../../adapters/apps';
import { mirrorSettings } from '../../platform/store';

const STORAGE_KEY = 'blank.apps.v1';
export const MAX_APPS = 100;

export type Scan =
  | { status: 'idle' }
  | { status: 'scanning' }
  | { status: 'ready'; result: AppScan }
  | { status: 'error'; message: string };

/** The saved list and whether the user ever changed it by hand (then it is never refilled). */
function load(): { apps: AppPackage[]; chosen: boolean } {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    return {
      apps: Array.isArray(data.apps) ? data.apps.filter(isAppPackage).slice(0, MAX_APPS) : [],
      chosen: data.chosen === true,
    };
  } catch {
    return { apps: [], chosen: true };
  }
}

/**
 * Reset helper: the programs to take along (saved at once, part of the settings file), which of
 * them are on this PC, and installing the missing ones straight from their makers. The program
 * list is read when the page is opened (once per app start) or on a click; installing goes on
 * across pages.
 */
export function useApps() {
  const [initial] = useState(load);
  const [selected, setSelected] = useState(initial.apps);
  const [saveFailed, setSaveFailed] = useState(false);
  const [scan, setScan] = useState<Scan>({ status: 'idle' });
  const [progress, setProgress] = useState<Record<string, InstallProgress>>({});
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const latest = useRef(selected);
  latest.current = selected;
  const scanning = useRef(false);
  /**
   * Never changed by hand: an empty list is filled with everything installed from blank.'s
   * list, so nothing is forgotten before a reset.
   */
  const chosen = useRef(initial.chosen);

  useEffect(() => {
    if (!appsNative) return;
    const off = appsNative.onProgress((p) => setProgress((prev) => ({ ...prev, [p.id]: p })));
    return () => void off.then((unlisten) => unlisten());
  }, []);

  /** `byHand`: a change by the user (or an import); the automatic filling passes false. */
  function save(next: AppPackage[], byHand = true) {
    if (byHand) chosen.current = true;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ apps: next, chosen: chosen.current }));
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
    mirrorSettings();
    latest.current = next;
    setSelected(next);
  }

  async function refresh() {
    if (!appsNative || scanning.current) return;
    scanning.current = true;
    setScan({ status: 'scanning' });
    try {
      const result = await appsNative.scan();
      setScan({ status: 'ready', result });
      if (!chosen.current && latest.current.length === 0)
        save(
          result.installed.map(({ id, name }) => ({ id, name })),
          false,
        );
    } catch (error) {
      setScan({ status: 'error', message: String(error) });
    } finally {
      scanning.current = false;
    }
  }

  const result = scan.status === 'ready' ? scan.result : null;
  const installed = (id: string) => result?.installed.some((a) => a.id === id) ?? false;
  /** Installs without questions (otherwise its own installer window opens). */
  const silent = (id: string) =>
    [...(result?.installed ?? []), ...(result?.available ?? [])].find((a) => a.id === id)?.silent ??
    true;
  /** Chosen programs of the list that are not on this PC (ids blank. no longer knows are left out). */
  const missing = result
    ? selected.filter((a) => !installed(a.id) && result.available.some((o) => o.id === a.id))
    : [];

  async function installMissing() {
    if (!appsNative || installing || missing.length === 0) return;
    setProgress({});
    setInstallError(null);
    setInstalling(true);
    try {
      await appsNative.install(missing.map((a) => a.id));
    } catch (error) {
      setInstallError(String(error));
    } finally {
      setInstalling(false);
      void refresh();
    }
  }

  return {
    available: appsNative !== null,
    selected,
    saveFailed,
    scan,
    result,
    installed,
    silent,
    missing,
    progress,
    installing,
    installError,
    refresh,
    installMissing,
    /** Reads the programs once per app start, when the page is opened. */
    scanOnce: () => {
      if (scan.status === 'idle') void refresh();
    },
    add: (app: AppPackage) => {
      if (!latest.current.some((a) => a.id === app.id) && latest.current.length < MAX_APPS)
        save([...latest.current, { id: app.id, name: app.name }]);
    },
    addAll: (apps: AppPackage[]) =>
      save(
        [
          ...latest.current,
          ...apps
            .filter((a) => !latest.current.some((s) => s.id === a.id))
            .map((a) => ({ id: a.id, name: a.name })),
        ].slice(0, MAX_APPS),
      ),
    remove: (id: string) => save(latest.current.filter((a) => a.id !== id)),
    /** Settings import: replaces the whole list. */
    replaceAll: (apps: AppPackage[]) => save(apps.slice(0, MAX_APPS)),
    cancel: () => void appsNative?.cancel(),
  };
}

export type Apps = ReturnType<typeof useApps>;
