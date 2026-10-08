// The Mayhem website's ranks (PLAN.md Etappe 6). Rust reads them (src-tauri/src/aram_website.rs,
// aram_site_ranks) only while the website upload is allowed; the browser preview has none.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/** The website's answers as JSON text, or nothing (upload not allowed, no profile yet). */
export type SiteAnswer = { enabled: boolean; board: string | null; me: string | null };

export const readSiteRanks = (): Promise<SiteAnswer> =>
  isTauri()
    ? invoke<SiteAnswer>('aram_site_ranks')
    : Promise.resolve({ enabled: false, board: null, me: null });

/** Upload status changes (aram_website.rs, publish): new confirmed games change the ranks. */
export function onUploadStatus(
  handler: (status: { enabled: boolean; lastSuccess: number | null }) => void,
) {
  if (!isTauri()) return () => undefined;
  const stop = listen<{ enabled: boolean; lastSuccess: number | null }>(
    'aram-website',
    ({ payload }) => handler(payload),
  );
  return () => void stop.then((unlisten) => unlisten());
}

/** One listed player's profile as JSON text, or null (upload not allowed, no profile). */
export const readSiteProfile = (puuid: string): Promise<string | null> =>
  isTauri() ? invoke<string | null>('aram_site_profile', { puuid }) : Promise.resolve(null);

/** The Mayhem app's own rank (aram_website.rs, mayhem_ranks; read-only, only the own PUUID and
 * Riot ID go out): the signed-in Riot ID with the website's answers as JSON text, or null while the League
 * client is closed or nobody is signed in. */
export type OwnRanks = { name: string; board: string | null; me: string | null };

export const readOwnRanks = (): Promise<OwnRanks | null> =>
  isTauri() ? invoke<OwnRanks | null>('mayhem_ranks') : Promise.resolve(null);

/** "Find my Mayhem rank" (aram/ladder.rs, mayhem_find_rank): the player's Mayhem games of the
 * client's history (`games`, `sent` of them new) went to mayhemstats.lol; then their rank. Null
 * while the League client is closed or nobody is signed in. Rejects with an English reason. */
export type FoundRank = { games: number; sent: number; ranks: OwnRanks };

export const findRank = (): Promise<FoundRank | null> =>
  isTauri() ? invoke<FoundRank | null>('mayhem_find_rank') : Promise.resolve(null);

/** Upload progress of the games (also after a game). */
export function onRankUpload(handler: (progress: { done: number; total: number }) => void) {
  if (!isTauri()) return () => undefined;
  const stop = listen<{ done: number; total: number }>('mayhem-upload', ({ payload }) =>
    handler(payload),
  );
  return () => void stop.then((unlisten) => unlisten());
}

/** New games went up by themselves after a game: the rank may have changed. */
export function onRankUploaded(handler: () => void) {
  if (!isTauri()) return () => undefined;
  const stop = listen('mayhem-uploaded', () => handler());
  return () => void stop.then((unlisten) => unlisten());
}
