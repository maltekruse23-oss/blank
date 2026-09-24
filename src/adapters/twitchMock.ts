// Mock implementation of the Twitch boundary: no network, only data from data/mock.ts.
// The selection is a harmless display preference and is kept in localStorage for now.
import { defaultWatchlist, mockCategories, mockChannels } from '../data/mock';
import type { GameRef, TwitchAdapter, WatchedChannel } from './twitch';

const storageKey = 'blank.twitch.watchlist.v1';

function isGame(value: unknown): value is GameRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    typeof value.id === 'string' &&
    typeof value.name === 'string'
  );
}

function isWatchlist(value: unknown): value is WatchedChannel[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item: unknown) =>
        typeof item === 'object' &&
        item !== null &&
        'login' in item &&
        'displayName' in item &&
        'games' in item &&
        typeof item.login === 'string' &&
        typeof item.displayName === 'string' &&
        Array.isArray(item.games) &&
        item.games.every(isGame),
    )
  );
}

export const mockTwitchAdapter: TwitchAdapter = {
  source: 'mock',
  refreshMs: 60_000,
  account: null,
  openChannel: null,
  onStreamOnline: null,
  pushStatus: null,
  async loadWatchlist() {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (isWatchlist(raw)) return raw;
    } catch {
      // Unavailable or corrupt storage falls back to the default selection.
    }
    return defaultWatchlist;
  },
  async saveWatchlist(channels) {
    localStorage.setItem(storageKey, JSON.stringify(channels));
  },
  async findChannel(login) {
    const channel = mockChannels.find((c) => c.login === login.trim().toLowerCase());
    return channel ? { login: channel.login, displayName: channel.displayName } : null;
  },
  async fetchChannels(logins) {
    return mockChannels
      .filter((c) => logins.includes(c.login))
      .map((c) => ({ login: c.login, displayName: c.displayName, profileImageUrl: null }));
  },
  async searchCategories(query) {
    const needle = query.trim().toLowerCase();
    return mockCategories.filter((game) => game.name.toLowerCase().includes(needle));
  },
  async fetchLiveStreams(logins) {
    return mockChannels.flatMap((c) => (c.stream && logins.includes(c.login) ? [c.stream] : []));
  },
};
