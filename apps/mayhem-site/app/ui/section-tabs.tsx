'use client';
// Tabs instead of a long page (MAYHEM-DESIGN.md): every section stays in the page (hidden ones with
// `hidden`), the address keeps its anchor (/scoring#rank opens that tab, a tab sets the anchor), so
// old links to the sections still work.
import { useEffect, useState, type ReactNode } from 'react';
import { Tabs } from './bits';

export function SectionTabs({ sections, label }: { sections: { id: string; label: string; content: ReactNode }[]; label: string }) {
  const [open, setOpen] = useState(sections[0].id);
  useEffect(() => {
    const follow = () => {
      const id = location.hash.slice(1);
      if (sections.some((s) => s.id === id)) setOpen(id);
    };
    follow();
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, [sections]);
  const pick = (id: string) => {
    setOpen(id);
    history.replaceState(null, '', '#' + id);
  };
  return (
    <>
      <Tabs label={label} value={open} onChange={pick} options={sections.map((s) => ({ id: s.id, label: s.label }))} />
      {sections.map((s) => (
        <section key={s.id} id={s.id} className="howto-panel" hidden={s.id !== open} aria-label={s.label}>
          {s.content}
        </section>
      ))}
    </>
  );
}
