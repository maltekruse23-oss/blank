// Twitch adapter for the desktop app. All requests, the client ID and the OAuth token live in
// Rust (src-tauri/src/twitch); this module only invokes the allowed commands.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { TwitchError, type StreamOnline, type TwitchAdapter, type TwitchErrorKind } from './twitch';

const kinds: TwitchErrorKind[] = [
  'not-configured',
  'unauthenticated',
  'offline',
  'rate-limited',
  'login-expired',
  'login-cancelled',
  'unknown',
];

function toTwitchError(error: unknown) {
  if (typeof error === 'object' && error !== null && 'kind' in error) {
    const kind = kinds.find((k) => k === error.kind) ?? 'unknown';
    const message = 'message' in error && typeof error.message === 'string' ? error.message : kind;
    return new TwitchError(kind, message);
  }
  return new TwitchError('unknown', String(error));
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toTwitchError(error);
  }
}

export const helixTwitchAdapter: TwitchAdapter = {
  source: 'twitch',
  // Covers channels beyond the EventSub limit and game switches; 2 requests per minute.
  refreshMs: 30_000,
  account: {
    status: () => call('twitch_account'),
    setClientId: (clientId) => call('twitch_set_client_id', { clientId }),
    startLogin: () => call('twitch_start_login'),
    finishLogin: () => call('twitch_finish_login'),
    cancelLogin: () => call('twitch_cancel_login'),
    logout: () => call('twitch_logout'),
  },
  openChannel: (login) => call('twitch_open_channel', { login }),
  // Event name defined in src-tauri/src/twitch/eventsub.rs.
  onStreamOnline: (callback) => {
    const unlisten = listen<StreamOnline>('twitch-stream-online', (e) => callback(e.payload));
    return () => void unlisten.then((stop) => stop());
  },
  pushStatus: () => call('twitch_eventsub_status'),
  loadWatchlist: () => call('twitch_load_watchlist'),
  saveWatchlist: (channels) => call('twitch_save_watchlist', { channels }),
  findChannel: (login) => call('twitch_find_channel', { login }),
  fetchChannels: (logins) => call('twitch_channels', { logins }),
  searchCategories: (query) => call('twitch_search_categories', { query }),
  fetchLiveStreams: (logins) => call('twitch_live_streams', { logins }),
};
