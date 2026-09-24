import { useEffect, useState } from 'react';
import { Badge, Card } from '../../components/ui';
import { autostart } from '../../platform/system';
import { formatCpu, formatMemory, usageLevel, type UsageState } from '../../app/useAppUsage';

type Autostart =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; enabled: boolean };

/** Start with Windows and the app's own live resource usage (desktop app only). */
export function SystemCard({ usage }: { usage: UsageState }) {
  const [start, setStart] = useState<Autostart>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!autostart) return;
    let active = true;
    autostart.read().then(
      (enabled) => active && setStart({ status: 'ready', enabled }),
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
      .set(!start.enabled)
      .then(
        (enabled) => setStart({ status: 'ready', enabled }),
        () => setStart({ status: 'error' }),
      )
      .finally(() => setBusy(false));
  }

  const ready = usage.status === 'ready' ? usage.usage : null;
  const level = ready && usageLevel(ready);
  return (
    <Card title="System">
      <div className="setting-row">
        <div>
          <h3>Mit Windows starten</h3>
          {start.status === 'error' && <p role="status">Autostart nicht verfügbar.</p>}
        </div>
        {!autostart ? (
          <Badge>Nur in der Desktop-App</Badge>
        ) : (
          <button
            className="switch"
            role="switch"
            aria-checked={start.status === 'ready' && start.enabled}
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
