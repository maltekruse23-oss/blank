import { useEffect, useState, type ReactNode } from 'react';
import {
  LayoutGrid,
  MessageSquare,
  Palette,
  Redo2,
  Settings,
  Shapes,
  Sparkles,
  Undo2,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { spring } from '../../design/motion';
import { LookCard, type LookPart } from '../settings/LookCard';
import type { Preferences } from '../settings/preferences';
import { widgets } from '../home/widgets';
import { addTile, defaultLayout, widgetIds, type WidgetId } from './layout';
import { navPages } from './layout';
import { PopoutStage } from './PopoutStage';

export type EditTool = LookPart | 'widgets' | 'popout';

const tools: { id: EditTool; name: string; icon: LucideIcon }[] = [
  { id: 'style', name: 'Stil', icon: Wand2 },
  { id: 'color', name: 'Farben', icon: Palette },
  { id: 'layout', name: 'Form', icon: Shapes },
  { id: 'motion', name: 'Bewegung', icon: Sparkles },
  { id: 'widgets', name: 'Widgets', icon: LayoutGrid },
  { id: 'popout', name: 'Popout', icon: MessageSquare },
];

/**
 * The edit mode's dock (user's wish: a WYSIWYG editor): at the bottom of the window, over the app
 * that stays the live preview. Each tool opens above it; undo and redo step through the changes
 * of this edit; "Einstellungen" opens all the others. "Fertig" is the switch in the title bar (one
 * way in and out, user's wish). Everything is saved at once, as always. The open tool is kept by
 * the app (settings can open one; it never covers the side panel).
 */
export function EditDock({
  tool,
  setTool,
  preferences,
  update,
  storageAvailable,
  replayStart,
  restartForGpu,
  undo,
  redo,
  openMore,
  goHome,
}: {
  tool: EditTool | null;
  setTool: (tool: EditTool | null) => void;
  preferences: Preferences;
  update: (next: Preferences) => void;
  storageAvailable: boolean;
  replayStart: () => void;
  restartForGpu?: () => void;
  undo: (() => void) | null;
  redo: (() => void) | null;
  /** The remaining settings (side panel), optionally at the popout part. */
  openMore: (popouts?: boolean) => void;
  goHome: () => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => setNote(null), [tool]);

  // Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) while editing (Escape: the app, App.tsx).
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement | null)?.closest('input, textarea');
      if (!event.ctrlKey || typing) return;
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        (event.shiftKey ? redo : undo)?.();
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo?.();
      }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [undo, redo]);

  const add = (id: WidgetId) => {
    const next = addTile(preferences.homeLayout, id);
    if (!next) {
      setNote('Kein Platz mehr – ein Widget verkleinern oder entfernen.');
      return;
    }
    goHome();
    update({ ...preferences, homeLayout: next });
  };

  let panel: ReactNode = null;
  if (tool === 'style' || tool === 'color' || tool === 'layout' || tool === 'motion')
    panel = (
      <LookCard
        part={tool}
        preferences={preferences}
        update={update}
        storageAvailable={storageAvailable}
        replayStart={replayStart}
        restartForGpu={restartForGpu}
      />
    );
  if (tool === 'widgets')
    panel = (
      <div className="dock-widgets">
        <ul>
          {widgetIds.map((id) => {
            const widget = widgets[id];
            const Icon = widget.icon;
            const onHome = preferences.homeLayout.some((t) => t.id === id);
            return (
              <li key={id}>
                <span className="dock-widget-icon">
                  <Icon size={15} />
                </span>
                <span className="dock-widget-text">
                  <b>{widget.title}</b>
                  <small>{widget.description}</small>
                </span>
                {onHome ? (
                  <span className="badge active">Auf Home</span>
                ) : (
                  <button className="filter-button" onClick={() => add(id)}>
                    Hinzufügen
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {note && (
          <p className="aram-note" role="status">
            {note}
          </p>
        )}
        <p className="dock-hint">
          Auf Home: Widgets ziehen, an der Ecke unten rechts die Größe ändern, Titel anklicken zum
          Umbenennen. In der Seitenleiste Einträge ziehen oder ausblenden.
        </p>
        <button
          className="text-link"
          onClick={() =>
            update({ ...preferences, homeLayout: defaultLayout, navOrder: navPages, navHidden: [] })
          }
        >
          Anordnung zurücksetzen
        </button>
      </div>
    );
  if (tool === 'popout')
    panel = (
      <PopoutStage preferences={preferences} update={update} openAll={() => openMore(true)} />
    );

  return (
    <div className="edit-dock-area">
      <AnimatePresence>
        {panel && (
          <motion.div
            key={tool}
            className={`card edit-popover ${tool === 'popout' ? 'wide' : ''}`}
            role="dialog"
            aria-label={tools.find((t) => t.id === tool)?.name}
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: spring('snappy') }}
            exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.12 } }}
          >
            {/* "Stil" starts with its own row "Stil"; a heading above it would say it twice. */}
            {tool !== 'style' && (
              <header className="edit-popover-head">
                <h2>{tools.find((t) => t.id === tool)?.name}</h2>
              </header>
            )}
            {panel}
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        className="edit-dock"
        role="toolbar"
        aria-label="Bearbeiten"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0, transition: spring('bouncy') }}
        exit={{ opacity: 0, y: 30, transition: { duration: 0.14 } }}
      >
        <button
          className="dock-button"
          aria-label="Rückgängig"
          title="Rückgängig (Strg+Z)"
          disabled={!undo}
          onClick={() => undo?.()}
        >
          <Undo2 size={16} />
        </button>
        <button
          className="dock-button"
          aria-label="Wiederholen"
          title="Wiederholen (Strg+Y)"
          disabled={!redo}
          onClick={() => redo?.()}
        >
          <Redo2 size={16} />
        </button>
        <span className="dock-divider" aria-hidden />
        {tools.map(({ id, name, icon: Icon }) => (
          <button
            key={id}
            className={`dock-button labeled ${tool === id ? 'selected' : ''}`}
            aria-pressed={tool === id}
            onClick={() => setTool(tool === id ? null : id)}
          >
            <Icon size={16} />
            <span>{name}</span>
          </button>
        ))}
        <span className="dock-divider" aria-hidden />
        <button className="dock-button labeled" onClick={() => openMore()}>
          <Settings size={16} />
          <span>Einstellungen</span>
        </button>
      </motion.div>
    </div>
  );
}
