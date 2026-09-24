import { useEffect, useRef, useState } from 'react';
import { Check, CircleAlert, RefreshCw } from 'lucide-react';

// Spin at least this long so fast refreshes are still noticeable; then show the result briefly.
const MIN_SPIN_MS = 700;
const RESULT_MS = 1600;

/** Works with any data source that can be reloaded (Twitch, Pros, Devices). */
type Reloadable = { refreshing: boolean; reload: () => void; loaded?: boolean };
/** Its last result: only a fresh `ready` counts as success; `updatedAt` goes into the title. */
type LoadResult =
  | { status: 'loading' | 'error' | 'unavailable' }
  | { status: 'ready'; updatedAt: Date; staleBecause: unknown };

export function RefreshButton({ data, result: streams }: { data: Reloadable; result: LoadResult }) {
  const [holding, setHolding] = useState(false);
  const [result, setResult] = useState<'done' | 'failed' | null>(null);
  const spinning = data.refreshing || holding;
  const wasSpinning = useRef(false);

  useEffect(() => {
    if (spinning) {
      wasSpinning.current = true;
      return;
    }
    if (!wasSpinning.current) return;
    wasSpinning.current = false;
    setResult(streams.status === 'ready' && !streams.staleBecause ? 'done' : 'failed');
    // Only the end of a spin matters; streams is read at that moment.
  }, [spinning]);

  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(() => setResult(null), RESULT_MS);
    return () => window.clearTimeout(timer);
  }, [result]);

  function refresh() {
    setResult(null);
    setHolding(true);
    window.setTimeout(() => setHolding(false), MIN_SPIN_MS);
    data.reload();
  }

  const stand =
    streams.status === 'ready'
      ? ` · Stand ${streams.updatedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
      : '';
  const Icon = spinning
    ? RefreshCw
    : result === 'done'
      ? Check
      : result === 'failed'
        ? CircleAlert
        : RefreshCw;
  return (
    <>
      <button
        className={`filter-button icon-only ${spinning ? 'spinning' : ''} ${result ? `refresh-${result}` : ''}`}
        aria-label="Aktualisieren"
        title={`Aktualisieren${stand}`}
        disabled={spinning || data.loaded === false}
        onClick={refresh}
      >
        <Icon size={16} />
      </button>
      <span className="sr-only" role="status">
        {result === 'done'
          ? 'Aktualisiert'
          : result === 'failed'
            ? 'Aktualisierung fehlgeschlagen'
            : ''}
      </span>
    </>
  );
}
