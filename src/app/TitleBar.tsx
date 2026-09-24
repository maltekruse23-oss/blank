import type { MouseEvent, ReactNode } from 'react';
import { Activity, Bell, BellOff, Minus, PawPrint, X } from 'lucide-react';
import { closeWindow, hasNativeWindow, minimizeWindow, startWindowDrag } from '../platform/window';
import { formatCpu, formatMemory, type UsageState } from './useAppUsage';

// Drag the frameless window from elements marked with data-drag-region.
// Double clicks are ignored so the window never maximizes.
export function dragWindow(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (event.button === 0 && event.detail === 1 && target.dataset.dragRegion !== undefined)
    startWindowDrag();
}

/** Live CPU and memory of the whole app; part of the drag area. */
function UsageChip({ usage }: { usage: UsageState }) {
  if (usage.status === 'unavailable') return null;
  const ready = usage.status === 'ready' ? usage.usage : null;
  const cpu = formatCpu(ready?.cpuPercent ?? null);
  const memory = formatMemory(ready?.memoryBytes ?? null);
  // Fixed text: a tooltip whose text changes with every reading flickers while hovered.
  const title =
    usage.status === 'error'
      ? 'Auslastung nicht messbar'
      : 'Auslastung von blank. (App + WebView2): CPU · Arbeitsspeicher';
  return (
    <span className="usage-chip" data-drag-region title={title}>
      <Activity size={12} />
      <span>{cpu}</span>
      <span>{memory}</span>
    </span>
  );
}

export function TitleBar({
  status,
  usage,
  onPet,
  quiet,
  onQuiet,
}: {
  status?: ReactNode;
  usage: UsageState;
  onPet: () => void;
  quiet: boolean;
  onQuiet: () => void;
}) {
  return (
    <div className="titlebar" data-drag-region>
      <UsageChip usage={usage} />
      {status}
      {hasNativeWindow && (
        <div className="window-controls">
          <button
            className={`window-button ${quiet ? 'quiet' : ''}`}
            aria-label="Nicht stören"
            aria-pressed={quiet}
            title={quiet ? 'Nicht stören ist an' : 'Nicht stören'}
            onClick={onQuiet}
          >
            {quiet ? <BellOff size={15} /> : <Bell size={15} />}
          </button>
          <button
            className="window-button"
            aria-label="In Pet verwandeln"
            title="In Pet verwandeln"
            onClick={onPet}
          >
            <PawPrint size={15} />
          </button>
          <button
            className="window-button"
            aria-label="Minimieren"
            title="Minimieren"
            onClick={minimizeWindow}
          >
            <Minus size={15} />
          </button>
          <button
            className="window-button close"
            aria-label="Schließen"
            title="Schließen"
            onClick={closeWindow}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
