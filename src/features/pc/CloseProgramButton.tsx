import { useEffect, useRef, useState } from 'react';
import { Power } from 'lucide-react';
import { closeProgram, programRunning, type AppLoad } from '../../adapters/pc';

/** Time a program gets to close its windows (it may ask about unsaved work) before we check. */
const CHECK_AFTER_MS = 4_000;

type Step = 'idle' | 'closing' | 'stuck' | 'forcing' | 'done' | 'failed';

/**
 * Closes the program behind a warning: first normally (like its window's X), and only if it is
 * still running afterwards, offers to end it forcibly. `onDone` runs once it is gone.
 */
export function CloseProgramButton({ app, onDone }: { app: AppLoad; onDone: () => void }) {
  const [step, setStep] = useState<Step>('idle');
  const [message, setMessage] = useState('');
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  if (!closeProgram || !programRunning || !app.closable) return null;
  const close = closeProgram;
  const running = programRunning;

  const finish = () => {
    setStep('done');
    window.setTimeout(() => mounted.current && onDone(), 1_200);
  };

  async function closeNormally() {
    setStep('closing');
    try {
      if ((await close(app.exe, false)) === 0) return finish();
    } catch {
      // No window left to ask: offer to end it.
      if (mounted.current) setStep('stuck');
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, CHECK_AFTER_MS));
    if (!mounted.current) return;
    if ((await running(app.exe).catch(() => 1)) === 0) finish();
    else setStep('stuck');
  }

  async function closeForcibly() {
    setStep('forcing');
    try {
      await close(app.exe, true);
      if (mounted.current) finish();
    } catch (error) {
      if (!mounted.current) return;
      setMessage(typeof error === 'string' ? error : 'Beenden nicht möglich');
      setStep('failed');
    }
  }

  if (step === 'done') return <span className="close-program done">{app.name} geschlossen</span>;
  if (step === 'failed') return <span className="close-program failed">{message}</span>;
  const stuck = step === 'stuck' || step === 'forcing';
  return (
    <button
      className={`close-program ${stuck ? 'force' : ''}`}
      disabled={step === 'closing' || step === 'forcing'}
      title={
        stuck
          ? `${app.name} reagiert nicht – Prozess beenden (ungespeicherte Daten gehen verloren)`
          : `${app.name} schließen (wie das X am Fenster)`
      }
      onClick={(event) => {
        event.stopPropagation();
        void (stuck ? closeForcibly() : closeNormally());
      }}
    >
      <Power size={12} />
      <span>
        {step === 'closing'
          ? 'Wird geschlossen …'
          : stuck
            ? 'Beenden erzwingen'
            : `${app.name} schließen`}
      </span>
    </button>
  );
}
