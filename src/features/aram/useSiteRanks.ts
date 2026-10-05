import { useEffect, useState } from 'react';
import { onUploadStatus, readSiteProfile, readSiteRanks } from '../../adapters/aramSite';
import {
  isInvalid,
  parseBoard,
  parseProfile,
  siteEntry,
  type Ranked,
  type SiteBoard,
} from './aramSite';

export type SiteRanks =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'ready'; board: SiteBoard; at: number }
  | { status: 'error'; message: string };

/** At most this often a new look at the website (Home and Rang share it). */
const FRESH_MS = 2 * 60_000;

let cached: { at: number; value: SiteRanks } | null = null;
let running = false;
/** Asked again while a look was running (the upload confirmed more games meanwhile). */
let again = false;
const listeners = new Set<(value: SiteRanks) => void>();

async function load(): Promise<SiteRanks> {
  try {
    const answer = await readSiteRanks();
    if (!answer.enabled || !answer.board) return { status: 'off' };
    const board = {
      players: parseBoard(answer.board),
      me: answer.me ? parseProfile(answer.me) : null,
    };
    return { status: 'ready', board, at: Date.now() };
  } catch (error) {
    return {
      status: 'error',
      message: isInvalid(error)
        ? 'Antwort der Website nicht lesbar.'
        : typeof error === 'string'
          ? error
          : 'Website nicht erreichbar.',
    };
  }
}

function refresh(force = false) {
  if (document.hidden) return;
  if (!force && cached && Date.now() - cached.at < FRESH_MS) return;
  if (running) {
    again ||= force;
    return;
  }
  running = true;
  void load().then((value) => {
    // A failed look keeps the last good answer.
    if (value.status !== 'error' || cached?.value.status !== 'ready') {
      cached = { at: Date.now(), value };
      for (const l of listeners) l(value);
    } else cached = { ...cached, at: Date.now() };
    running = false;
    if (again) {
      again = false;
      refresh(true);
    }
  });
}

/**
 * The website's ranks while a page shows them: on opening, on returning to the window (at most
 * every two minutes) and after the upload confirmed new games. No polling.
 */
export function useSiteRanks(): SiteRanks {
  const [value, setValue] = useState<SiteRanks>(cached?.value ?? { status: 'loading' });
  useEffect(() => {
    listeners.add(setValue);
    refresh();
    let last: number | null | undefined;
    const stop = onUploadStatus((s) => {
      if (!s.enabled) {
        cached = { at: Date.now(), value: { status: 'off' } };
        for (const l of listeners) l(cached.value);
      } else if (cached?.value.status === 'off' || (last !== undefined && s.lastSuccess !== last))
        refresh(true);
      last = s.lastSuccess;
    });
    const back = () => refresh();
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);
    return () => {
      listeners.delete(setValue);
      stop();
      window.removeEventListener('focus', back);
      document.removeEventListener('visibilitychange', back);
    };
  }, []);
  return value;
}

/** The board to rank with, or null (website off, not read yet, unreadable). */
export const boardOf = (site: SiteRanks) => (site.status === 'ready' ? site.board : null);

const profiles = new Map<string, { at: number; value: Ranked | null }>();

/**
 * The website's ranks with one player's full profile (the player dialog): the user's own comes
 * with the board, others are read when the dialog opens, only for players the public leaderboard
 * lists (found by Riot ID: the website names nobody by PUUID). Until it arrives (or without it)
 * null: the dialog then shows the local ladder.
 */
export function useSiteProfile(player: { puuid: string; name: string }): SiteBoard | null {
  const { puuid } = player;
  const board = boardOf(useSiteRanks());
  const siteId = board ? (siteEntry(board, player)?.siteId ?? null) : null;
  const own = board?.me?.puuid === puuid ? board.me : null;
  const known = siteId ? profiles.get(siteId) : undefined;
  const [profile, setProfile] = useState<Ranked | null>(
    known && Date.now() - known.at < FRESH_MS ? known.value : null,
  );
  useEffect(() => {
    if (!siteId || own) return;
    const known = profiles.get(siteId);
    if (known && Date.now() - known.at < FRESH_MS) return setProfile(known.value);
    let active = true;
    void readSiteProfile(siteId).then(
      (text) => {
        let value: Ranked | null = null;
        try {
          value = text ? parseProfile(text) : null;
        } catch {
          value = null;
        }
        if (value && value.siteId !== siteId) value = null;
        profiles.set(siteId, { at: Date.now(), value });
        if (active) setProfile(value);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [siteId, own]);
  // The profile answers under the public id; on this PC it is the player's PUUID.
  const full = own ?? (profile && profile.siteId === siteId ? { ...profile, puuid } : null);
  return board && full ? { players: board.players, me: full } : null;
}

/** How long the card after a game waits for the website when nothing is known yet. */
const CARD_WAIT_MS = 3000;

/**
 * The website's board for the card after a game (blank. is usually in the background then): the
 * last answer, however old – games the website does not have yet come from this PC
 * (aramSite.ts, rankGames) – and a fresh look for next time. Without any answer yet one short
 * look; offline or slow, the card computes locally.
 */
export async function boardForCard(): Promise<SiteBoard | null> {
  const known = cached?.value.status === 'ready' ? cached.value.board : null;
  if (known) {
    refresh();
    return known;
  }
  const value = await Promise.race([
    load(),
    new Promise<null>((done) => setTimeout(() => done(null), CARD_WAIT_MS)),
  ]);
  if (value?.status !== 'ready') return null;
  cached = { at: Date.now(), value };
  for (const l of listeners) l(value);
  return value.board;
}
