// What the Mayhem app's update dialog says in each state of the shared update flow (useUpdate.ts,
// update.rs). English only; Rust sends the Mayhem app's messages in English, too.
import type { UpdateState } from '../app/useUpdate';

export type UpdateView = {
  title: string;
  text: string | null;
  /** The one main button: install the found version, or ask GitHub again. */
  action: 'install' | 'retry' | null;
  /** Download progress in percent while installing. */
  percent: number | null;
};

const view = (title: string, text: string | null, action: UpdateView['action'] = null) => ({
  title,
  text,
  action,
  percent: null,
});

/** `online`: what the browser knows (navigator.onLine); offline gets its own words. */
export function updateView(state: UpdateState, online: boolean): UpdateView {
  switch (state.status) {
    case 'unavailable':
      return view('Updates', 'Updates work in the desktop app only.');
    case 'idle':
    case 'checking':
      return view('Checking for updates', 'Asking GitHub for the latest version.');
    case 'error':
      return online
        ? view('Update failed', state.message, 'retry')
        : view("You're offline", 'Connect to the internet and try again.', 'retry');
    case 'installing':
      return {
        ...view(
          `Downloading version ${state.latest}`,
          'Mayhem restarts by itself when it is done.',
        ),
        percent: state.percent,
      };
    case 'installed':
      return view(
        'Update installed',
        `Close Mayhem and open it again to use version ${state.latest}.`,
      );
    case 'ready':
      return state.info.available
        ? view(
            `Version ${state.info.latest} is available`,
            `You have version ${state.info.current}.`,
            'install',
          )
        : view("You're up to date", `Version ${state.info.current} is the latest.`);
  }
}
