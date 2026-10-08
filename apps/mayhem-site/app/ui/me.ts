'use client';
// "That's me": the visitor marks one player as themselves, only in this browser (localStorage,
// no account, nothing sent). The pages then mark that player's rows and the start page shows
// their own places. Only the public id (a123) and the Riot ID are kept, never a PUUID.
import { useSyncExternalStore } from 'react';

export type Me = { id: string; name: string };

const KEY = 'mayhem.me.v1';
const EVENT = 'mayhem-me';

/** The texts of this feature in one place. */
export const meText = {
  mark: "That's me",
  marked: "That's me ✓",
  unmark: 'Not me anymore',
  markHint: 'Only this browser remembers it. Your rows are then marked everywhere and the start page shows your places.',
  you: 'You',
  jump: 'Jump to me',
  findTitle: 'Are you already in?',
  findLead: 'Search your Riot ID. Everyone from an uploaded Mayhem game is here with rank, grades and records.',
  notFound: (name: string) => `"${name}" is not in the database yet.`,
  notFoundCta: 'Add games',
  notFoundShort: "Get the Collector and you're in after its next start.",
  markNudge: "Found yourself? Click \"That's me\" on your profile and the start page shows your places.",
  notFoundLead: "Everyone from a Mayhem game uploaded by the Collector or blank. is here. Get the Collector and you're in after its next start, with your latest games.",
  placesTitle: 'Your places',
  placesEmpty: 'No places yet. They appear after your first rated game.',
  placesFrom: 'of',
  ladder: 'Overall leaderboard',
  performance: 'Performance avg',
  profile: 'Go to profile',
  change: 'Other player',
};

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
