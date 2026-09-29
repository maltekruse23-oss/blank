import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { ArrowUpRight, GripVertical, X } from 'lucide-react';
import { motion } from 'motion/react';
import { spring } from '../../design/motion';
import { widgets, type WidgetContext } from '../home/widgets';
import { COLS, MAX_TITLE, ROWS, place, removeTile, type Tile, type WidgetId } from './layout';
import { Guard } from '../../components/Guard';

type Gesture = {
  id: WidgetId;
  kind: 'move' | 'resize';
  startX: number;
  startY: number;
  origin: Tile;
  /** Layout when the gesture began (the draft is built from it). */
  from: Tile[];
};

/**
 * Home as a grid of widgets (user's wish: direct manipulation). Outside the edit mode it simply
 * shows them; in it every widget can be dragged (it snaps from cell to cell, the others make room
 * live), resized by its corner, removed, renamed in place and moved with the keyboard (arrows;
 * with Shift the size, Delete removes). A handle in a corner drags the rounding of all cards.
 * Only a finished gesture is saved (one step to undo).
 */
export function HomeGrid({
  layout,
  editing,
  context,
  onChange,
  radiusScale,
  onRadius,
}: {
  layout: Tile[];
  editing: boolean;
  context: WidgetContext;
  onChange: (layout: Tile[]) => void;
  radiusScale: number;
  onRadius: (scale: number) => void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [draft, setDraft] = useState<Tile[] | null>(null);
  const [active, setActive] = useState<WidgetId | null>(null);
  const [naming, setNaming] = useState<WidgetId | null>(null);
  const shown = draft ?? layout;

  /** One cell plus the gap, in CSS pixels. */
  const step = () => {
    const box = grid.current?.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(grid.current!).columnGap) || 0;
    if (!box) return { x: 1, y: 1 };
    return { x: (box.width + gap) / COLS, y: (box.height + gap) / ROWS };
  };

  function begin(event: PointerEvent, tile: Tile, kind: Gesture['kind']) {
    if (!editing || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    gesture.current = {
      id: tile.id,
      kind,
      startX: event.clientX,
      startY: event.clientY,
      origin: tile,
      from: layout,
    };
    setActive(tile.id);
  }

  function follow(event: PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    const s = step();
    const dx = (event.clientX - g.startX) / s.x;
    const dy = (event.clientY - g.startY) / s.y;
    const target =
      g.kind === 'move'
        ? { ...g.origin, x: g.origin.x + dx, y: g.origin.y + dy }
        : { ...g.origin, w: g.origin.w + dx, h: g.origin.h + dy };
    // Only places that fit: otherwise the widget stays where it last fitted.
    const next = place(g.from, g.id, target);
    if (next) setDraft(next);
  }

  function end(cancel = false) {
    const g = gesture.current;
    gesture.current = null;
    setActive(null);
    if (!g) return;
    const next = draft;
    setDraft(null);
    if (!cancel && next && JSON.stringify(next) !== JSON.stringify(g.from)) onChange(next);
  }

  function keys(event: KeyboardEvent, tile: Tile) {
    // Only the widget itself (focused as a whole), not a button or link in it.
    if (!editing || naming || event.target !== event.currentTarget) return;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onChange(removeTile(layout, tile.id));
      return;
    }
    const d = move[event.key];
    if (!d) return;
    event.preventDefault();
    const target = event.shiftKey
      ? { ...tile, w: tile.w + d[0], h: tile.h + d[1] }
      : { ...tile, x: tile.x + d[0], y: tile.y + d[1] };
    const next = place(layout, tile.id, target);
    if (next) onChange(next);
  }

  function rename(tile: Tile, value: string) {
    setNaming(null);
    const title = value
      .replace(/\p{Cc}/gu, '')
      .trim()
      .slice(0, MAX_TITLE);
    const next = layout.map((t) => {
      if (t.id !== tile.id) return t;
      const { title: _old, ...rest } = t;
      return title && title !== widgets[t.id].title ? { ...rest, title } : rest;
    });
    if (JSON.stringify(next) !== JSON.stringify(layout)) onChange(next);
  }

  // The rounding handle: dragged to the right (or down) the cards get rounder, live; saved on
  // release. Meanwhile only the CSS properties change (no saving on every move).
  const radius = useRef<{ startX: number; startY: number; scale: number; base: number } | null>(
    null,
  );
  const root = document.documentElement;
  function radiusStart(event: PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const card = parseFloat(getComputedStyle(root).getPropertyValue('--radius-card')) || 12;
    radius.current = {
      startX: event.clientX,
      startY: event.clientY,
      scale: radiusScale,
      base: radiusScale > 0 ? card / radiusScale : 12,
    };
  }
  const scaleAt = (event: PointerEvent) => {
    const r = radius.current!;
    const moved = (event.clientX - r.startX + (event.clientY - r.startY)) / 40;
    return Math.min(2, Math.max(0, Math.round((r.scale + moved) * 20) / 20));
  };
  function radiusMove(event: PointerEvent) {
    if (!radius.current) return;
    const scale = scaleAt(event);
    root.style.setProperty('--radius-scale', String(scale));
    root.style.setProperty('--radius-card', `${radius.current.base * scale}px`);
  }
  function radiusEnd(event: PointerEvent) {
    if (!radius.current) return;
    const scale = scaleAt(event);
    radius.current = null;
    if (scale !== radiusScale) onRadius(scale);
  }

  return (
    <div
      ref={grid}
      className={`home-grid ${editing ? 'editing' : ''} ${active ? 'dragging' : ''}`}
      onPointerMove={follow}
      onPointerUp={() => end()}
      onPointerCancel={() => end(true)}
      onKeyDown={(event) => event.key === 'Escape' && gesture.current && end(true)}
    >
      {editing &&
        Array.from({ length: COLS * ROWS }, (_, i) => (
          <span
            key={`cell-${i}`}
            className="home-cell"
            style={{ gridColumn: (i % COLS) + 1, gridRow: Math.floor(i / COLS) + 1 }}
            aria-hidden
          />
        ))}
      {shown.length === 0 && (
        <p className="home-empty">
          {editing
            ? 'Füge unten über „Widgets“ etwas hinzu.'
            : 'Home ist leer – Stift oben: Bearbeiten.'}
        </p>
      )}
      {shown.map((tile) => {
        const widget = widgets[tile.id];
        const Body = widget.Body;
        const title = tile.title ?? widget.title;
        return (
          <motion.section
            key={tile.id}
            layout
            transition={spring('snappy')}
            className={`card home-tile ${active === tile.id ? 'lifted' : ''}`}
            style={
              {
                gridColumn: `${tile.x + 1} / span ${tile.w}`,
                gridRow: `${tile.y + 1} / span ${tile.h}`,
              } as CSSProperties
            }
            tabIndex={editing ? 0 : undefined}
            aria-label={
              editing
                ? `${title}: ziehen zum Verschieben, Pfeiltasten bewegen, mit Umschalt die Größe`
                : undefined
            }
            onPointerDown={(event) => {
              const target = event.target as HTMLElement;
              if (target.closest('button, input, a, .home-radius')) return;
              begin(event, tile, 'move');
            }}
            onKeyDown={(event) => keys(event, tile)}
          >
            <header className="card-header">
              <div>
                {editing && naming === tile.id ? (
                  <input
                    className="home-title-input"
                    defaultValue={title}
                    maxLength={MAX_TITLE}
                    aria-label="Titel des Widgets"
                    autoFocus
                    onBlur={(event) => rename(tile, event.target.value)}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === 'Enter') rename(tile, event.currentTarget.value);
                      if (event.key === 'Escape') setNaming(null);
                    }}
                  />
                ) : editing ? (
                  <button
                    className="home-title"
                    title="Titel ändern"
                    onClick={() => setNaming(tile.id)}
                  >
                    <h2>{title}</h2>
                  </button>
                ) : (
                  <h2>{title}</h2>
                )}
              </div>
              {editing ? (
                <span className="home-tools">
                  <span className="home-grip" aria-hidden>
                    <GripVertical size={15} />
                  </span>
                  <button
                    className="icon-button"
                    aria-label={`${title} entfernen`}
                    title="Entfernen"
                    onClick={() => onChange(removeTile(layout, tile.id))}
                  >
                    <X size={16} />
                  </button>
                </span>
              ) : (
                <button
                  className="icon-button"
                  aria-label={`${title} öffnen`}
                  onClick={() => context.navigate(widget.page)}
                >
                  <ArrowUpRight size={19} />
                </button>
              )}
            </header>
            <div className="home-body">
              <Guard name={title}>
                <Body {...context} />
              </Guard>
            </div>
            {editing && (
              <>
                <span
                  className="home-radius"
                  role="slider"
                  aria-label="Rundung aller Karten (ziehen)"
                  aria-valuemin={0}
                  aria-valuemax={2}
                  aria-valuenow={radiusScale}
                  title="Ziehen: Rundung aller Karten"
                  onPointerDown={radiusStart}
                  onPointerMove={radiusMove}
                  onPointerUp={radiusEnd}
                />
                <span
                  className="home-resize"
                  aria-hidden
                  title="Ziehen: Größe"
                  onPointerDown={(event) => begin(event, tile, 'resize')}
                />
              </>
            )}
          </motion.section>
        );
      })}
    </div>
  );
}
