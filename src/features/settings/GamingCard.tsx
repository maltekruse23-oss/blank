import { useEffect, useState } from 'react';
import { Gauge, RotateCcw } from 'lucide-react';
import { Badge, Card } from '../../components/ui';
import { tweaks, type Tweak } from '../../adapters/tweaks';

type Load =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; list: Tweak[] };

function when(ms: number) {
  return new Date(ms).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Line under a setting: what it does, or what blank. changed and when. */
function line(tweak: Tweak) {
  if (tweak.state !== 'changed') return tweak.detail;
  const parts = [`Vorher: ${tweak.before ?? '—'}`];
  if (tweak.changedAt) parts.push(`geändert ${when(tweak.changedAt)}`);
  if (tweak.drifted) parts.push(`inzwischen wieder ${tweak.now}`);
  return parts.join(' · ');
}

/**
 * Gaming optimisation: Windows settings of the current user, changed only on click. The previous
 * values are saved first, so every change can be undone singly or all at once.
 */
export function GamingCard() {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!tweaks) return;
    let active = true;
    tweaks.status().then(
      (list) => active && setLoad({ status: 'ready', list }),
      (error: unknown) => active && setLoad({ status: 'error', message: String(error) }),
    );
    return () => {
      active = false;
    };
  }, []);

  function run(action: 'apply' | 'restore', ids: string[], done: string) {
    if (!tweaks || ids.length === 0) return;
    const api = tweaks;
    setBusy(true);
    setConfirming(false);
    setMessage(null);
    api[action](ids)
      .then(
        (list) => {
          setLoad({ status: 'ready', list });
          setMessage(done);
        },
        (error: unknown) => {
          setMessage(String(error));
          // Shows what Windows really has now.
          api.status().then(
            (list) => setLoad({ status: 'ready', list }),
            () => undefined,
          );
        },
      )
      .finally(() => setBusy(false));
  }

  if (!tweaks)
    return (
      <Card title="Gaming-Optimierung">
        <div className="setting-row">
          <div>
            <h3>Windows für Spiele einstellen</h3>
          </div>
          <Badge>Nur in der Desktop-App</Badge>
        </div>
      </Card>
    );

  const list = load.status === 'ready' ? load.list : [];
  const open = list.filter((t) => t.state === 'open');
  const changed = list.filter((t) => t.state === 'changed');
  return (
    <Card title="Gaming-Optimierung">
      {load.status === 'loading' && <p role="status">Liest die Windows-Einstellungen …</p>}
      {load.status === 'error' && <p role="status">{load.message}</p>}
      {list.map((tweak) => (
        <div className="setting-row" key={tweak.id}>
          <div>
            <h3>{tweak.name}</h3>
            <p>{line(tweak)}</p>
          </div>
          {tweak.state === 'done' && <Badge>Schon so</Badge>}
          {tweak.state === 'open' && (
            <button
              className="filter-button"
              disabled={busy}
              onClick={() =>
                run('apply', [tweak.id], `${tweak.name}: geändert – Rückgängig jederzeit hier`)
              }
            >
              Anwenden
            </button>
          )}
          {tweak.state === 'changed' && (
            <>
              <Badge active>Geändert</Badge>
              <button
                className="filter-button"
                disabled={busy}
                onClick={() => run('restore', [tweak.id], `${tweak.name}: wieder wie vorher`)}
              >
                <RotateCcw size={14} /> Rückgängig
              </button>
            </>
          )}
        </div>
      ))}
      {confirming && open.length > 0 && (
        <div className="import-check" role="group" aria-label="Optimierung prüfen">
          <p>
            <b>{open.map((t) => `${t.name} (jetzt ${t.now})`).join(', ')}</b>
          </p>
          <p>Die bisherigen Werte werden vorher gesichert; alles lässt sich zurücksetzen.</p>
          <div className="import-actions">
            <button
              className="filter-button selected"
              onClick={() =>
                run(
                  'apply',
                  open.map((t) => t.id),
                  `${open.length === 1 ? '1 Einstellung' : `${open.length} Einstellungen`} geändert – Rückgängig jederzeit hier`,
                )
              }
            >
              Anwenden
            </button>
            <button className="filter-button" onClick={() => setConfirming(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      {load.status === 'ready' && (
        <div className="import-actions">
          <button
            className="filter-button selected"
            disabled={busy || open.length === 0}
            onClick={() => setConfirming(true)}
          >
            <Gauge size={15} /> Alle anwenden
          </button>
          <button
            className="filter-button"
            disabled={busy || changed.length === 0}
            onClick={() =>
              run(
                'restore',
                changed.map((t) => t.id),
                'Alles wieder wie vor der Optimierung',
              )
            }
          >
            <RotateCcw size={15} /> Alles zurücksetzen
          </button>
        </div>
      )}
    </Card>
  );
}
