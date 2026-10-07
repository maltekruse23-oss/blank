'use client';
// "Das bin ich": the visitor marks one player as themselves, only in this browser (localStorage,
// no account, nothing sent). The pages then mark that player's rows and the start page shows
// their own places. Only the public id (a123) and the Riot ID are kept, never a PUUID.
import { useSyncExternalStore } from 'react';

export type Me = { id: string; name: string };

const KEY = 'mayhem.me.v1';
const EVENT = 'mayhem-me';

/** The texts of this feature in one place, in the page's language (t from useLang). */
export const meText = (t: (en: string, de: string) => string) => ({
  mark: t("That's me", 'Das bin ich'),
  marked: t("That's me ✓", 'Das bin ich ✓'),
  unmark: t('Not me anymore', 'Nicht mehr ich'),
  markHint: t(
    'Only this browser remembers it. Your rows are then marked everywhere and the start page shows your places.',
    'Merkt sich nur dieser Browser. Dann sind deine Zeilen überall markiert und die Startseite zeigt deine Plätze.',
  ),
  you: t('You', 'Du'),
  jump: t('Jump to me', 'Zu mir springen'),
  findTitle: t('Are you already in?', 'Bist du schon drin?'),
  findLead: t(
    'Search your Riot ID. Everyone from an uploaded Mayhem game is here with rank, grades and records.',
    'Such deine Riot-ID. Jeder aus einem hochgeladenen Mayhem-Spiel steht hier mit Rang, Noten und Rekorden.',
  ),
  notFound: (name: string) => t(`"${name}" is not in the database yet.`, `„${name}“ ist noch nicht in der Datenbank.`),
  notFoundCta: t('Add games', 'Spiele hinzufügen'),
  notFoundShort: t(
    "Get the Collector and you're in after its next start.",
    'Lad den Collector, dann bist du nach dem nächsten Start dabei.',
  ),
  markNudge: t(
    "Found yourself? Click \"That's me\" on your profile and the start page shows your places.",
    'Gefunden? Klick auf deinem Profil auf „Das bin ich“, dann zeigt dir die Startseite deine Plätze.',
  ),
  notFoundLead: t(
    "Everyone from a Mayhem game uploaded by the Collector or blank. is here. Get the Collector and you're in after its next start, with your latest games.",
    'Hier steht jeder aus einem Mayhem-Spiel, das der Collector oder blank. hochgeladen hat. Lad den Collector, dann bist du nach dem nächsten Start dabei, samt deinen letzten Spielen.',
  ),
  placesTitle: t('Your places', 'Deine Plätze'),
  placesEmpty: t(
    'No places yet. They appear after your first rated game.',
    'Noch keine Plätze. Sie erscheinen nach deinem ersten gewerteten Spiel.',
  ),
  placesFrom: t('of', 'von'),
  ladder: t('Overall leaderboard', 'Rangliste gesamt'),
  performance: t('Performance avg', 'Leistung Ø'),
  profile: t('Go to profile', 'Zum Profil'),
  change: t('Other player', 'Anderer Spieler'),
});

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

/** The player marked as "That's me" (null on the server and when none). */
export function useMe(): Me | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
