// Small building blocks for the rule "Übersicht vor Vollständigkeit" (MAYHEM-DESIGN.md): lists
// show their first entries and the rest behind "Show more", pages use tabs instead of length.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Grade } from '../features/aram/aramPerformance';

/** Rows shown before "Show more". */
export const FIRST = 5;

/** A list that shows its first `first` entries; `keep` rows (the player's own) always show. */
export function More<T>({
  list,
  className,
  render,
  first = FIRST,
  keep,
}: {
  list: T[];
  className: string;
  render: (entry: T, index: number) => ReactNode;
  first?: number;
  keep?: (entry: T) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const rows = list.flatMap((entry, i) =>
    open || i < first || keep?.(entry) ? [render(entry, i)] : [],
  );
  const hidden = list.length - rows.length;
  return (
    <>
      <ul className={className}>{rows}</ul>
      {(open ? list.length > first : hidden > 0) && (
        <button
          type="button"
          className="mayhem-more"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Show less' : `Show ${hidden} more`}
        </button>
      )}
    </>
  );
}

/** Tabs (arrow keys move between them); the panel below is the caller's. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    const at = tabs.findIndex((t) => t.id === value);
    if (!step || at < 0) return;
    const next = tabs[(at + step + tabs.length) % tabs.length];
    onChange(next.id);
    e.currentTarget.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus();
  };
  return (
    <div className="mayhem-tabs" role="tablist" aria-label={label} onKeyDown={keys}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          data-tab={t.id}
          aria-selected={t.id === value}
          tabIndex={t.id === value ? 0 : -1}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** A grade as a bold letter in its color (user, 08.10.2026: no grade icons, "nur dicke
 * Buchstaben"); longer grades get a smaller letter so SSS and MAYHEM fit the same box. */
export function GradeMark({ grade, size = 40 }: { grade: Grade; size?: number }) {
  return (
    <span
      className="mayhem-grade mayhem-grade-mark"
      data-grade={grade.toLowerCase()}
      data-len={Math.min(grade.length, 4)}
      style={{ ['--size' as string]: `${size}px` }}
      role="img"
      aria-label={`Grade ${grade}`}
      title={`Grade ${grade}`}
    >
      {grade}
    </span>
  );
}

/** Marks the best entry of a list, so nobody has to compare (gold, "Top"). */
export const Top = () => <span className="mayhem-top">Top</span>;

/** Open dialogs, oldest first. */
const open: symbol[] = [];

/** The dimmed layer under a dialog: Esc and a click beside the dialog close it. Into the body: the
 * sidebar's backdrop-filter would hold a fixed overlay inside the sidebar. */
export function Overlay({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    // Esc closes only the topmost dialog (a player card over the card after a game).
    const me = Symbol();
    open.push(me);
    const key = (event: globalThis.KeyboardEvent) =>
      event.key === 'Escape' && open.at(-1) === me && close.current();
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      open.splice(open.indexOf(me), 1);
    };
  }, []);
  return createPortal(
    <div
      className="mayhem-dialog"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      {children}
    </div>,
    document.body,
  );
}
