import { useState, type KeyboardEvent } from 'react';
import { TabPill } from './TabMotion';

/**
 * Sub-tabs of a page (user's wish: one logic for all tabs and sub-tabs): a row of tabs with the
 * gliding highlight, arrow keys move between them, and every page remembers its sub-tab while the
 * app runs – leaving a page and coming back shows the same one. Another part of the app can open
 * a page at a given sub-tab (`openSubTab` before switching the page).
 */
const remembered = new Map<string, string>();

/** Opens `page` at `tab` the next time it shows (e.g. "Freunde hinzufügen" → Rang/Gruppe). */
export function openSubTab(page: string, tab: string) {
  remembered.set(page, tab);
}

export type SubTab<T extends string> = { id: T; name: string };

/** The chosen sub-tab of a page and the direction of the last change (for the content motion). */
export function useSubTab<T extends string>(page: string, tabs: readonly SubTab<T>[], fallback: T) {
  const known = (id: string | undefined): id is T => tabs.some((t) => t.id === id);
  const [view, setView] = useState<{ tab: T; dir: number }>(() => {
    const kept = remembered.get(page);
    return { tab: known(kept) ? kept : fallback, dir: 1 };
  });
  const index = (id: T) => tabs.findIndex((t) => t.id === id);
  const choose = (tab: T) => {
    remembered.set(page, tab);
    setView((v) => ({ tab, dir: index(tab) >= index(v.tab) ? 1 : -1 }));
  };
  return { tab: view.tab, dir: view.dir, choose };
}

export function SubTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  group,
}: {
  tabs: readonly SubTab<T>[];
  value: T;
  onChange: (tab: T) => void;
  /** Name of the row for screen readers ("Bereiche von Rang"). */
  label: string;
  /** Unique per row, so the highlight glides only within it. */
  group: string;
}) {
  const move = (event: KeyboardEvent, from: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = tabs[(from + step + tabs.length) % tabs.length];
    onChange(next.id);
    const row = event.currentTarget.parentElement;
    (row?.querySelector(`[data-tab="${next.id}"]`) as HTMLElement | null)?.focus();
  };
  return (
    <div className="sub-tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          role="tab"
          data-tab={t.id}
          aria-selected={value === t.id}
          tabIndex={value === t.id ? 0 : -1}
          className={`filter-button ${value === t.id ? 'selected' : ''}`}
          onClick={() => onChange(t.id)}
          onKeyDown={(event) => move(event, i)}
        >
          {value === t.id && <TabPill group={group} />}
          <span className="tab-label">{t.name}</span>
        </button>
      ))}
    </div>
  );
}
