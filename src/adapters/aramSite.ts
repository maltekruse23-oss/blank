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

/** The Mayhem app's own rank (aram_website.rs, mayhem_ranks; read-only, only the own PUUID goes
 * out): the signed-in Riot ID with the website's answers as JSON text, or null while the League
 * client is closed or nobody is signed in. */
export type OwnRanks = { name: string; board: string | null; me: string | null };

export const readOwnRanks = (): Promise<OwnRanks | null> =>
  isTauri() ? invoke<OwnRanks | null>('mayhem_ranks') : Promise.resolve(null);
