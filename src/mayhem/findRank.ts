// "Find my Mayhem rank" (ROADMAP "Jetzt 2", user's decisions 08.10.2026; Rust aram/ladder.rs): the
// button on Home and Rank while mayhemstats.lol does not list the player. A click uploads their
// recent Mayhem games and shows the rank; after that every game goes up by itself, as long as the
// site lists them (the site knows; the app keeps only the upload key the click made). English only.
import type { FoundRank } from '../adapters/aramSite';
import { withSaved, type MeState } from './me';

export type FindState =
  | { state: 'idle' }
  /** `total` 0: still reading the client's history. */
  | { state: 'uploading'; done: number; total: number }
  /** No ARAM Mayhem game in the client's history (its last 20 games). */
  | { state: 'empty' }
  /** The games went up, but mayhemstats.lol does not list the player under their current Riot ID
   * (renamed since, or hidden there – the app cannot tell). */
  | { state: 'unlisted' }
  | { state: 'failed'; message: string };

/** Next to the button, before the click: what becomes public, that later games follow by
 * themselves, and the way out. */
export const CONSENT =
  'Your Riot ID, Mayhem games and rank will be public on mayhemstats.lol, and each new Mayhem game uploads by itself while this app runs. Remove anytime at mayhemstats.lol/privacy/remove.';

/** The click's answer: the button's next state and the player as Home and Rank show them. A closed
 * client ends as the pages' own "Start League". */
export function found(answer: FoundRank | null): { find: FindState; me: MeState } {
  if (!answer) return { find: { state: 'idle' }, me: withSaved(null) };
  const me = withSaved(answer.ranks);
  if (me.state === 'failed') return { find: { state: 'failed', message: me.message }, me };
  if (me.state === 'ready' && me.me) return { find: { state: 'idle' }, me };
  return { find: { state: answer.games ? 'unlisted' : 'empty' }, me };
}

export type FindView = {
  title: string;
  text: string | null;
  /** The button: the first click, or once more after something went wrong. */
  action: 'find' | 'retry' | null;
  busy: boolean;
};

const view = (title: string, text: string | null, action: FindView['action']): FindView => ({
  title,
  text,
  action,
  busy: false,
});

/** `online`: what the browser knows (navigator.onLine); offline gets its own words. */
export function findView(find: FindState, online: boolean): FindView {
  switch (find.state) {
    case 'idle':
      return view('No rank yet', null, 'find');
    case 'uploading':
      return {
        title: 'Uploading your games',
        text: find.total
          ? `${Math.min(find.done, find.total)} of ${find.total} Mayhem games …`
          : 'Reading your Mayhem games …',
        action: null,
        busy: true,
      };
    case 'empty':
      return view('No Mayhem games yet', 'Play a game of ARAM Mayhem, then try again.', 'retry');
    case 'unlisted':
      return view(
        'Not listed',
        'Your games went up, but mayhemstats.lol does not list you under your current Riot ID (for example after a name change, or if you hid your name there).',
        'retry',
      );
    case 'failed':
      return online
        ? view('Upload failed', find.message, 'retry')
        : view("You're offline", 'Connect to the internet and try again.', 'retry');
  }
}
