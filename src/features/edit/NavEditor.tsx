import { useRef, useState, type PointerEvent } from 'react';
import { Eye, EyeOff, GripVertical, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { spring } from '../../design/motion';
import type { Page } from '../../app/App';

type Entry = { id: Page; label: string; icon: LucideIcon; section: string | null };

/**
 * The sidebar in the edit mode (user's wish: drag and drop): the pages of each section can be
 * dragged into another order (the others make room live) and hidden with the eye (Home stays).
 * A click without moving opens the page, as outside the edit mode. Only a finished drag is saved.
 */
export function NavEditor({
  entries,
  sections,
  order,
  hidden,
  current: page,
  onOpen,
  onChange,
}: {
  entries: readonly Entry[];
  sections: readonly string[];
  order: Page[];
  hidden: Page[];
  /** The open page (highlighted) and opening one by a click. */
  current: Page;
  onOpen: (page: Page) => void;
  onChange: (order: Page[], hidden: Page[]) => void;
}) {
  const [draft, setDraft] = useState<Page[] | null>(null);
  const drag = useRef<{ id: Page; startY: number; from: Page[] } | null>(null);
  const [lifted, setLifted] = useState<Page | null>(null);
  const items = useRef(new Map<Page, HTMLElement>());
  const arranged = draft ?? order;
  const byId = new Map(entries.map((e) => [e.id, e]));
  const rank = (id: Page) => arranged.indexOf(id);

  function down(event: PointerEvent, id: Page) {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = { id, startY: event.clientY, from: order };
    setLifted(id);
  }

  function move(event: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const section = byId.get(d.id)!.section;
    // Among the pages of the same section: the place by the middles of the others.
    const siblings = d.from.filter((p) => byId.get(p)?.section === section);
    const others = siblings.filter((p) => p !== d.id);
    let index = 0;
    for (const p of others) {
      const box = items.current.get(p)?.getBoundingClientRect();
      if (box && event.clientY > box.top + box.height / 2) index += 1;
    }
    const reordered = [...others];
    reordered.splice(index, 0, d.id);
    // Put the section's new order back into the whole order (other sections stay).
    let i = 0;
    const next = d.from.map((p) => (byId.get(p)?.section === section ? reordered[i++]! : p));
    if (JSON.stringify(next) !== JSON.stringify(arranged)) setDraft(next);
  }

  function up(event: PointerEvent) {
    const d = drag.current;
    drag.current = null;
    setLifted(null);
    const next = draft;
    setDraft(null);
    if (!d) return;
    if (next && JSON.stringify(next) !== JSON.stringify(d.from)) onChange(next, hidden);
    // Hardly moved: a click, which opens the page.
    else if (event.type === 'pointerup' && Math.abs(event.clientY - d.startY) < 4) onOpen(d.id);
  }

  const toggle = (id: Page) =>
    onChange(order, hidden.includes(id) ? hidden.filter((p) => p !== id) : [...hidden, id]);

  const row = (entry: Entry) => {
    const Icon = entry.icon;
    const off = hidden.includes(entry.id);
    return (
      <motion.div
        key={entry.id}
        layout
        transition={spring('snappy')}
        ref={(element) => {
          if (element) items.current.set(entry.id, element);
          else items.current.delete(entry.id);
        }}
        className={`nav-item nav-edit ${off ? 'off' : ''} ${lifted === entry.id ? 'lifted' : ''} ${page === entry.id ? 'current' : ''}`}
        onPointerDown={(event) => down(event, entry.id)}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        role="button"
        tabIndex={0}
        onKeyDown={(event) =>
          event.key === 'Enter' && event.target === event.currentTarget && onOpen(entry.id)
        }
        title="Klicken: öffnen · Ziehen: Reihenfolge"
        aria-current={page === entry.id ? 'page' : undefined}
      >
        <GripVertical size={13} className="nav-grip" aria-hidden />
        <Icon size={17} />
        <span>{entry.label}</span>
        {entry.id !== 'home' && (
          <button
            className="nav-eye"
            aria-label={off ? `${entry.label} einblenden` : `${entry.label} ausblenden`}
            aria-pressed={!off}
            onClick={() => toggle(entry.id)}
          >
            {off ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}
      </motion.div>
    );
  };

  return (
    <nav aria-label="Seitenleiste bearbeiten" data-drag-region>
      {sections.map((section) => (
        <div className="nav-group" key={section}>
          <span className="sidebar-caption">{section}</span>
          {entries
            .filter((e) => e.section === section)
            .sort((a, b) => rank(a.id) - rank(b.id))
            .map(row)}
        </div>
      ))}
    </nav>
  );
}
