'use client';
// Navigation with the current page marked, and the player search (Riot-ID; the list comes from
// the leaderboard, loaded on first focus).
import { useRouter, usePathname } from 'next/navigation';
import { useRef, useState } from 'react';
import { profileHref, profileImage, splitName, useDragon, type Board } from './data';
import { Img } from './bits';

const PAGES = [
  { href: '/rangliste', label: 'Rangliste' },
  { href: '/rekorde', label: 'Rekorde' },
  { href: '/champions', label: 'Champions' },
  { href: '/augments', label: 'Augments' },
  { href: '/items', label: 'Items' },
  { href: '/tierliste', label: 'Tier-Liste' },
  { href: '/wertung', label: "So funktioniert's" },
  { href: '/api-guide', label: 'API' },
  { href: '/mitmachen', label: 'Mitmachen' },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Seiten">
      {PAGES.map((p) => (
        <a key={p.href} href={p.href} aria-current={(p.href === '/rangliste' ? path.startsWith('/rangliste') || path.startsWith('/players') || path.startsWith('/spiel') : path.startsWith(p.href)) ? 'page' : undefined}>
          {p.label}
        </a>
      ))}
    </nav>
  );
}

type Found = Board['players'][number];

/** `big`: the large search on the start page (its own id for the list of hits). */
export function Search({ big = false }: { big?: boolean }) {
  const hitsId = big ? 'start-search-hits' : 'search-hits';
  const path = usePathname();
  const router = useRouter();
  const dragon = useDragon();
  const [players, setPlayers] = useState<Found[] | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const loading = useRef(false);

  const load = async () => {
    if (players || loading.current) return;
    loading.current = true;
    try {
      const response = await fetch('/api/leaderboard');
      if (response.ok) setPlayers(((await response.json()) as Board).players);
    } finally {
      loading.current = false;
    }
  };

  const q = query.trim().toLowerCase();
  const hits = q && players ? players.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6) : [];
  const go = (p: Found) => {
    setOpen(false);
    setQuery('');
    router.push(profileHref(p));
  };

  // The start page has its own large search.
  if (!big && path === '/') return <div className="search" aria-hidden />;
  return (
    <div className={big ? 'search big' : 'search'}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        placeholder="Spieler suchen (Riot-ID)"
        aria-label="Spieler suchen"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls={hitsId}
        value={query}
        onFocus={() => {
          setOpen(true);
          void load();
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, hits.length - 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          else if (e.key === 'Enter' && hits[active]) go(hits[active]);
          else if (e.key === 'Escape') setOpen(false);
          else return;
          e.preventDefault();
        }}
      />
      {open && q && players && (
        <ul id={hitsId} role="listbox">
          {hits.length ? (
            hits.map((p, i) => {
              const { name, tag } = splitName(p.name);
              return (
                <li key={p.puuid} role="option" aria-selected={i === active}>
                  <a
                    href={profileHref(p)}
                    data-active={i === active}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      go(p);
                    }}
                  >
                    <Img className="avatar" src={profileImage(dragon, p.icon)} size={28} />
                    <span>
                      {name}
                      {tag && <span className="faint">#{tag}</span>}
                    </span>
                    <small>{p.rank ? p.rank.tier.name : 'Einstufung'}</small>
                  </a>
                </li>
              );
            })
          ) : (
            <li className="faint" style={{ padding: 8 }}>
              Nicht in der Datenbank. Hier steht jeder aus einem Spiel, das blank. oder der Collector
              hochgeladen hat. <a href="/mitmachen">Eigene Spiele hinzufügen</a>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
