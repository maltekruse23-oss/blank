import { useEffect, useState } from 'react';
import { Badge, Card } from '../../components/ui';
import { autostart, type Autostart } from '../../platform/system';
import { formatCpu, formatMemory, usageLevel, type UsageState } from '../../app/useAppUsage';
import type { Updates } from '../../app/useUpdate';
import { version } from '../../../package.json';
import { errorReport } from '../../platform/errorLog';

/** Version line and button of the update row, by state. */
function updateText(updates: Updates) {
  const { state } = updates;
  switch (state.status) {
    case 'unavailable':
      return { text: 'Updates nur in der Desktop-App', action: null };
    case 'idle':
      return { text: 'Noch nicht geprüft', action: 'check' as const };
    case 'checking':
      return { text: 'Prüft bei GitHub …', action: null };
    case 'error':
      return { text: state.message, action: 'check' as const };
    case 'installing':
      return {
        text:
          state.percent >= 100
            ? `v${state.latest} geprüft – startet neu …`
            : `Lädt v${state.latest} … ${state.percent} %`,
        action: null,
      };
    case 'installed':
      return {
        text: `v${state.latest} installiert – blank. beenden und neu starten`,
        action: null,
      };
    case 'ready':
      return state.info.available
        ? { text: `Version ${state.info.latest} verfügbar`, action: 'install' as const }
        : { text: 'Aktuell', action: 'check' as const };
  }
}

type AutostartState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; info: Autostart };

/** Last folders and file of a path; the full path goes into the tooltip. */
function shortPath(path: string) {
  const parts = path.split('\\');
  return parts.length > 3 ? `…\\${parts.slice(-3).join('\\')}` : path;
}

/** Line under "Mit Windows starten": which file Windows starts at sign-in, or why none. */
function autostartLine(info: Autostart) {
  if (info.enabled) return { text: `Startet ${shortPath(info.path)}`, title: info.path };
  if (info.disabled)
    return {
      text: 'Im Task-Manager deaktiviert – Einschalten aktiviert es wieder',
      title: undefined,
    };
  if (info.other)
    return {
      text: info.otherMissing
        ? `Eingetragene Datei fehlt (${shortPath(info.other)}) – Einschalten nimmt diese hier`
        : `Startet eine andere Datei (${shortPath(info.other)}) – Einschalten nimmt diese hier`,
      title: info.other,
    };
  return null;
}

/** Start with Windows and the app's own live resource usage (desktop app only). */
export function SystemCard({
  usage,
  updates,
  autoCheck,
  setAutoCheck,
  showNews,
}: {
  usage: UsageState;
  updates: Updates;
  autoCheck: boolean;
  setAutoCheck: (enabled: boolean) => void;
  /** What is new in this version. */
  showNews: () => void;
}) {
  const update = updateText(updates);
  const [start, setStart] = useState<AutostartState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!autostart) return;
    let active = true;
    autostart.read().then(
      (info) => active && setStart({ status: 'ready', info }),
      () => active && setStart({ status: 'error' }),
    );
    return () => {
      active = false;
    };
  }, []);

  function toggle() {
    if (!autostart || start.status !== 'ready') return;
    setBusy(true);
    autostart
      .set(!start.info.enabled)
      .then(
        (info) => setStart({ status: 'ready', info }),
        () => setStart({ status: 'error' }),
      )
      .finally(() => setBusy(false));
  }

  // The error report (errors.rs): copied for the user to send; nothing is sent from here.
  const [report, setReport] = useState<'copied' | 'failed' | null>(null);
  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(await errorReport());
      setReport('copied');
    } catch {
      setReport('failed');
    }
  };

  const startLine = start.status === 'ready' ? autostartLine(start.info) : null;
  const ready = usage.status === 'ready' ? usage.usage : null;
  const level = ready && usageLevel(ready);
  return (
    <Card title="System">
      <div className="setting-row">
        <div>
          <h3>Version {version}</h3>
          <p role="status">{update.text}</p>
        </div>
        <button className="text-link" onClick={showNews}>
          Neuigkeiten
        </button>
        {update.action === 'install' ? (
          <button className="filter-button selected" onClick={() => void updates.install()}>
            Jetzt aktualisieren
          </button>
        ) : update.action === 'check' ? (
          <button className="filter-button" onClick={() => void updates.check()}>
            Nach Updates suchen
          </button>
        ) : null}
      </div>
      {updates.state.status !== 'unavailable' && (
        <div className="setting-row">
          <div>
            <h3>Automatisch nach Updates suchen</h3>
            <p>Einmal am Tag bei GitHub; installiert wird nur auf Klick</p>
          </div>
          <button
            className="switch"
            role="switch"
            aria-checked={autoCheck}
            aria-label="Automatisch nach Updates suchen"
            onClick={() => setAutoCheck(!autoCheck)}
          >
            <span />
          </button>
        </div>
      )}
      <div className="setting-row">
        <div>
          <h3>Mit Windows starten</h3>
          {start.status === 'error' && <p role="status">Autostart nicht verfügbar.</p>}
          {startLine && (
            <p role="status" title={startLine.title}>
              {startLine.text}
            </p>
          )}
        </div>
        {!autostart ? (
          <Badge>Nur in der Desktop-App</Badge>
        ) : (
          <button
            className="switch"
            role="switch"
            aria-checked={start.status === 'ready' && start.info.enabled}
            aria-label="Mit Windows starten"
            disabled={busy || start.status !== 'ready'}
            onClick={toggle}
          >
            <span />
          </button>
        )}
      </div>
      <div className="setting-row">
        <div>
          <h3>Fehlerbericht</h3>
          <p role="status">
            {report === 'copied'
              ? 'Kopiert – in eine Nachricht einfügen und schicken'
              : report === 'failed'
                ? 'Kopieren ging nicht'
                : 'Die letzten Fehler zum Verschicken; blank. sendet nichts selbst'}
          </p>
        </div>
        <button className="filter-button" onClick={() => void copyReport()}>
          Kopieren
        </button>
      </div>
      <div className="setting-row">
        <div>
          <h3>Auslastung</h3>
          {ready && (
            <p
              className="usage-detail"
              title="CPU: Anteil an der gesamten Prozessorleistung. Arbeitsspeicher: privater Arbeitssatz aller Prozesse von blank. (App + WebView2), wie im Task-Manager."
            >
              CPU {formatCpu(ready.cpuPercent)} · Arbeitsspeicher {formatMemory(ready.memoryBytes)}{' '}
              · {ready.processes} Prozesse
            </p>
          )}
          {usage.status === 'error' && <p role="status">Messung nicht verfügbar.</p>}
        </div>
        {usage.status === 'unavailable' ? (
          <Badge>Nur in der Desktop-App</Badge>
        ) : (
          level && <Badge active={level === 'Niedrig'}>{level}</Badge>
        )}
      </div>
    </Card>
  );
}
