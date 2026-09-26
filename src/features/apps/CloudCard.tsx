import { useState } from 'react';
import { Check, Copy, UploadCloud } from 'lucide-react';
import { Card } from '../../components/ui';
import { cloud, formatCode } from '../../adapters/cloud';

type Step =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; code: string; copied: boolean }
  | { kind: 'error'; message: string };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Before a reset: one button stores everything online (encrypted) and shows the move code. After
 * the reset, blank. asks for that code on its first start (RestoreDialog).
 */
export function CloudCard({
  content,
  count,
  installed,
  onTakeAll,
  onRestore,
}: {
  /** The web part of the settings file. */
  content: () => string;
  /** Programs chosen to take along. */
  count: number;
  /** Programs of blank.'s list installed here (known after reading). */
  installed: number;
  onTakeAll: () => void;
  /** Opens the dialog for entering a code. */
  onRestore: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: 'idle' });

  async function backup() {
    if (!cloud) return;
    setStep({ kind: 'busy' });
    try {
      const code = formatCode(await cloud.backup(content()));
      setStep({ kind: 'done', code, copied: false });
    } catch (error) {
      setStep({ kind: 'error', message: message(error) });
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setStep({ kind: 'done', code, copied: true });
    } catch {
      // Copying is a convenience; the code stays visible to write down.
    }
  }

  if (!cloud) return null;
  return (
    <Card title="Vor dem Zurücksetzen">
      <ol className="move-steps">
        <li className={count > 0 ? 'ok' : ''}>
          {count > 0 ? <Check size={14} /> : <span>1</span>}
          {count === 0
            ? 'Noch keine Programme ausgewählt'
            : count === 1
              ? '1 Programm wird mitgenommen (Liste unten)'
              : `${count} Programme werden mitgenommen (Liste unten)`}
          {count === 0 && installed > 0 && (
            <button className="text-link" onClick={onTakeAll}>
              Alle {installed} installierten mitnehmen
            </button>
          )}
        </li>
        <li className={step.kind === 'done' ? 'ok' : ''}>
          {step.kind === 'done' ? <Check size={14} /> : <span>2</span>}
          {step.kind === 'done' ? 'Online gesichert – das ist dein Umzugs-Code:' : 'Online sichern'}
        </li>
      </ol>
      {step.kind === 'done' ? (
        <>
          <div className="move-code-row">
            <code className="move-code" aria-label="Umzugs-Code">
              {step.code}
            </code>
            <button className="filter-button" onClick={() => void copy(step.code)}>
              {step.copied ? <Check size={15} /> : <Copy size={15} />}
              {step.copied ? 'Kopiert' : 'Kopieren'}
            </button>
          </div>
          <p className="section-note">
            Abfotografieren, aufschreiben oder dir selbst schicken. Nach dem Zurücksetzen blank.
            herunterladen und diesen Code eingeben – ohne Code kommt niemand an die Daten, auch du
            nicht. Er gilt ein Jahr.
          </p>
        </>
      ) : (
        <>
          <div className="import-actions">
            <button
              className="filter-button selected"
              disabled={step.kind === 'busy'}
              onClick={() => void backup()}
            >
              <UploadCloud size={15} />
              {step.kind === 'busy' ? 'Sichert …' : 'Online sichern'}
            </button>
          </div>
          {step.kind === 'error' && (
            <p className="form-message" role="status">
              {step.message}
            </p>
          )}
          <p className="section-note">
            Alle Einstellungen und die Programmliste, verschlüsselt. Du bekommst einen Code; nur mit
            ihm lassen sich die Daten wieder öffnen.
          </p>
        </>
      )}
      <button className="text-link" onClick={onRestore}>
        Nach dem Zurücksetzen: Code eingeben
      </button>
    </Card>
  );
}
