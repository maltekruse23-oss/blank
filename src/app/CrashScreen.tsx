import { useState } from 'react';
import { Copy, RotateCcw } from 'lucide-react';
import { errorReport } from '../platform/errorLog';

/** The whole app failed to draw: instead of a black window, a way back and the report to send. */
export function CrashScreen() {
  const [copied, setCopied] = useState(false);
  // Copying failed: the report to select by hand (the settings are out of reach here).
  const [report, setReport] = useState<string | null>(null);
  const copy = async () => {
    const text = await errorReport().catch(() => 'Kein Bericht verfügbar.');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setReport(text);
    }
  };
  return (
    <div className="crash-screen" role="alert">
      <span className="crash-brand">
        blank<span>.</span>
      </span>
      <h1>Da ist etwas schiefgegangen.</h1>
      <p>Der Fehler ist aufgezeichnet. Neu laden hilft meistens.</p>
      <div className="crash-actions">
        <button className="filter-button selected" onClick={() => window.location.reload()}>
          <RotateCcw size={15} aria-hidden />
          Neu laden
        </button>
        <button className="filter-button" onClick={() => void copy()}>
          <Copy size={15} aria-hidden />
          {copied ? 'Bericht kopiert' : 'Fehlerbericht kopieren'}
        </button>
      </div>
      {report && (
        <textarea
          className="crash-report"
          readOnly
          value={report}
          aria-label="Fehlerbericht"
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </div>
  );
}
