import type { MouseEvent, ReactNode } from 'react';
import {
  Activity,
  Bell,
  BellOff,
  Download,
  Minus,
  Users,
  X,
  Check,
  Pencil,
  Settings,
} from 'lucide-react';
import { hasNativeWindow, startWindowDrag } from '../platform/window';
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
  quiet,
  onQuiet,
  updateAvailable,
  onUpdate,
  room,
  onRoom,
  onMinimize,
  onClose,
  editing,
  onEdit,
  settingsOpen,
  onSettings,
}: {
  status?: ReactNode;
  usage: UsageState;
  quiet: boolean;
  onQuiet: () => void;
  /** Newer version on GitHub, shown as a small chip that opens the settings. */
  updateAvailable: string | null;
  onUpdate: () => void;
  /** In a watch-together room: how many are in it (with oneself); the chip opens the room. */
  room: number | null;
  onRoom: () => void;
  /** Minimize and close (the app fades its content out first). */
  onMinimize: () => void;
  onClose: () => void;
  /** The edit mode (the app as its own editor) and its switch. */
  editing: boolean;
  onEdit: () => void;
  /** The settings side panel (user's wish: easy to find, not only through the edit mode). */
  settingsOpen: boolean;
  onSettings: () => void;
}) {
  return (
    <div className="titlebar" data-drag-region>
      {room !== null && (
        <button
          className="update-chip"
          title="Du bist in einem Raum „Zusammen schauen“ – öffnen"
          onClick={onRoom}
        >
          <Users size={12} /> Im Raum · {room}
        </button>
      )}
      {updateAvailable && (
        <button
          className="update-chip"
          title={`Version ${updateAvailable} verfügbar – in den Settings aktualisieren`}
          onClick={onUpdate}
        >
          <Download size={12} /> Update
        </button>
      )}
      <button
        className={`edit-toggle ${editing ? 'on' : ''}`}
        aria-pressed={editing}
        title={
          editing
            ? 'Bearbeiten beenden'
            : 'Bearbeiten: Home, Seitenleiste, Aussehen und Popout direkt ändern'
        }
        onClick={onEdit}
      >
        {editing ? <Check size={13} /> : <Pencil size={13} />}
        {editing ? 'Fertig' : 'Bearbeiten'}
      </button>
      <button
        className={`window-button settings-toggle ${settingsOpen ? 'on' : ''}`}
        aria-label="Einstellungen"
        aria-pressed={settingsOpen}
        title={settingsOpen ? 'Einstellungen schließen' : 'Einstellungen'}
        onClick={onSettings}
      >
        <Settings size={15} />
      </button>
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
            aria-label="Minimieren"
            title="Minimieren"
            onClick={onMinimize}
          >
            <Minus size={15} />
          </button>
          <button
            className="window-button close"
            aria-label="Schließen"
            title="Schließen – blank. läuft im Infobereich weiter (Beenden: Symbol unten rechts)"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
