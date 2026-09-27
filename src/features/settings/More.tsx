import { createContext, useContext, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Reveal } from '../../components/Reveal';

/** True while the settings are searched: everything is shown, so no match stays folded away. */
export const Searching = createContext(false);

/** Rarely used settings, folded under "Mehr Einstellungen (n)". */
export function More({ count, children }: { count: number; children: ReactNode }) {
  const searching = useContext(Searching);
  const [open, setOpen] = useState(false);
  if (searching) return <>{children}</>;
  return (
    <>
      <button className="more-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronDown size={15} />
        {open ? 'Weniger anzeigen' : `Mehr Einstellungen (${count})`}
      </button>
      <Reveal show={open}>{children}</Reveal>
    </>
  );
}
