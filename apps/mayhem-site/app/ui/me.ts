'use client';
// "Das bin ich": the visitor marks one player as themselves, only in this browser (localStorage,
// no account, nothing sent). The pages then mark that player's rows and the start page shows
// their own places. Only the public id (a123) and the Riot ID are kept, never a PUUID.
import { useSyncExternalStore } from 'react';

export type Me = { id: string; name: string };

const KEY = 'mayhem.me.v1';
const EVENT = 'mayhem-me';

/** The texts of this feature in one place (the site gets an English version later). */
export const ME_TEXT = {
  mark: 'Das bin ich',
  marked: 'Das bin ich ✓',
  unmark: 'Nicht mehr ich',
  markHint: 'Merkt sich nur dieser Browser. Dann sind deine Zeilen überall markiert und die Startseite zeigt deine Plätze.',
  you: 'Du',
  jump: 'Zu mir springen',
  findTitle: 'Bist du schon drin?',
  findLead: 'Such deine Riot-ID. Jeder, der in einem hochgeladenen Mayhem-Spiel vorkommt, steht hier mit Rang, Noten und Rekorden.',
  notFound: (name: string) => `„${name}“ ist noch nicht in der Datenbank.`,
  notFoundCta: 'Spiele hinzufügen',
  notFoundShort: 'Lad den Collector, dann bist du nach dem nächsten Start dabei.',
  markNudge: 'Gefunden? Klick auf deinem Profil auf „Das bin ich“, dann zeigt dir die Startseite deine Plätze.',
  notFoundLead:
    'Hier steht jeder aus einem Mayhem-Spiel, das der Collector oder blank. hochgeladen hat. Lad den Collector, dann bist du nach dem nächsten Start dabei, samt deinen letzten Spielen.',
  placesTitle: 'Deine Plätze',
  placesEmpty: 'Noch keine Plätze. Sie erscheinen nach deinem ersten gewerteten Spiel.',
  placesFrom: 'von',
  ladder: 'Rangliste gesamt',
  performance: 'Leistung Ø',
  profile: 'Zum Profil',
  change: 'Anderer Spieler',
} as const;

function read(): Me | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Me>;
    return typeof value.id === 'string' && /^a[1-9][0-9]{0,9}$/.test(value.id) && typeof value.name === 'string' && value.name.length <= 64
      ? { id: value.id, name: value.name }
      : null;
  } catch {
    return null;
  }
}

/** Marks `me` as the visitor (null forgets it). */
export function setMe(me: Me | null) {
  try {
    if (me) localStorage.setItem(KEY, JSON.stringify(me));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the mark lasts until the page closes at most.
  }
  window.dispatchEvent(new Event(EVENT));
}

// useSyncExternalStore needs the same object while nothing changed.
let cache: { raw: string | null; me: Me | null } = { raw: null, me: null };
function snapshot(): Me | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== cache.raw) cache = { raw, me: read() };
  return cache.me;
}

function subscribe(change: () => void) {
  const onStorage = (e: StorageEvent) => e.key === KEY && change();
  window.addEventListener(EVENT, change);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, change);
    window.removeEventListener('storage', onStorage);
  };
}

/** The player marked as "Das bin ich" (null on the server and when none). */
export function useMe(): Me | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
