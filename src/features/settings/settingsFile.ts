// Settings file for moving blank. to another PC (Settings → Übertragen). The web content writes
// appearance, notifications and music; the desktop app adds the Twitch channel selection and
// Client ID (src-tauri/src/settings_file.rs). Never included: the Twitch login (token) and
// autostart (only switched by hand).
import { isAccount, type SoundCloudAccount } from '../../adapters/soundcloud';
import type { GameRef, WatchedChannel } from '../../adapters/twitch';
import { readPreferences, type Preferences } from './preferences';

export const SETTINGS_FORMAT = 1;
const MAX_BYTES = 512 * 1024;
const MAX_ACCOUNTS = 50;
const MAX_CHANNELS = 100;
const LOGIN = /^[a-z0-9_]{1,25}$/;
const CLIENT_ID = /^[a-z0-9]{20,64}$/i;

export type MusicSettings = { accounts: SoundCloudAccount[]; volume: number };
export type TwitchSettings = { clientId: string | null; watchlist: WatchedChannel[] };

/** What a checked file contains; parts missing from the file stay unchanged on import. */
export type ImportedSettings = {
  exportedAt: string | null;
  preferences: Preferences | null;
  music: MusicSettings | null;
  twitch: TwitchSettings | null;
};

export function settingsFileContent(preferences: Preferences, music: MusicSettings) {
  return JSON.stringify({
    app: 'blank.',
    format: SETTINGS_FORMAT,
    exportedAt: new Date().toISOString(),
    preferences,
    music,
  });
}

function readMusic(raw: unknown): MusicSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const { accounts, volume } = raw as Record<string, unknown>;
  if (!Array.isArray(accounts)) return null;
  const unique = new Map<string, SoundCloudAccount>();
  for (const account of accounts.filter(isAccount)) unique.set(account.permalink, account);
  return {
    accounts: [...unique.values()].slice(0, MAX_ACCOUNTS),
    volume:
      typeof volume === 'number' && Number.isInteger(volume) && volume >= 0 && volume <= 100
        ? volume
        : 50,
  };
}

function readGame(raw: unknown): GameRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const { id, name } = raw as Record<string, unknown>;
  return typeof id === 'string' && /^\d{1,20}$/.test(id) && typeof name === 'string'
    ? { id, name: name.slice(0, 200) }
    : null;
}

function readChannel(raw: unknown): WatchedChannel | null {
  if (!raw || typeof raw !== 'object') return null;
  const { login, displayName, games, profileImageUrl } = raw as Record<string, unknown>;
  if (typeof login !== 'string' || !LOGIN.test(login) || !Array.isArray(games)) return null;
  return {
    login,
    displayName: typeof displayName === 'string' && displayName.trim() ? displayName : login,
    games: games.map(readGame).filter((game): game is GameRef => game !== null),
    // Only Twitch's own image server; otherwise the app looks the image up again.
    profileImageUrl:
      typeof profileImageUrl === 'string' &&
      profileImageUrl.startsWith('https://static-cdn.jtvnw.net/')
        ? profileImageUrl
        : undefined,
  };
}

function readTwitch(raw: unknown): TwitchSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const { clientId, watchlist } = raw as Record<string, unknown>;
  if (!Array.isArray(watchlist)) return null;
  const unique = new Map<string, WatchedChannel>();
  for (const channel of watchlist.map(readChannel)) if (channel) unique.set(channel.login, channel);
  return {
    clientId: typeof clientId === 'string' && CLIENT_ID.test(clientId) ? clientId : null,
    watchlist: [...unique.values()].slice(0, MAX_CHANNELS),
  };
}

/** Reads and checks a settings file; an error text when it is not one. */
export function parseSettingsFile(text: string): ImportedSettings | string {
  if (text.length > MAX_BYTES) return 'Datei zu groß für blank.-Einstellungen.';
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return 'Keine blank.-Einstellungsdatei.';
  }
  if (!raw || typeof raw !== 'object') return 'Keine blank.-Einstellungsdatei.';
  const data = raw as Record<string, unknown>;
  if (data.app !== 'blank.') return 'Keine blank.-Einstellungsdatei.';
  if (typeof data.format !== 'number' || data.format > SETTINGS_FORMAT)
    return 'Datei stammt aus einer neueren blank.-Version.';
  const imported: ImportedSettings = {
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null,
    preferences: readPreferences(data.preferences),
    music: readMusic(data.music),
    twitch: readTwitch(data.twitch),
  };
  if (!imported.preferences && !imported.music && !imported.twitch)
    return 'Die Datei enthält keine Einstellungen.';
  return imported;
}
