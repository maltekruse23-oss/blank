import type { Apps } from '../apps/useApps';
import type { Music } from '../music/useMusic';
import type { TwitchData } from '../twitch/useTwitch';
import type { Preferences } from './preferences';
import type { ImportedSettings } from './settingsFile';

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What a settings file contains, in a few words. */
export function describeSettings(data: ImportedSettings) {
  const parts: string[] = [];
  if (data.preferences) parts.push('Darstellung und Benachrichtigungen');
  if (data.music) parts.push(count(data.music.accounts.length, 'Musik-Eintrag', 'Musik-Einträge'));
  if (data.twitch)
    parts.push(
      count(data.twitch.watchlist.length, 'Twitch-Kanal', 'Twitch-Kanäle') +
        (data.twitch.clientId ? ' mit Client-ID' : ''),
    );
  if (data.apps) parts.push(count(data.apps.length, 'Programm', 'Programme') + ' zum Installieren');
  return parts.join(' · ');
}

/**
 * Applies a checked settings file part by part, each saved the usual way. Resolves once
 * everything is saved, to a note when something was refused ('' otherwise).
 */
export async function applySettings(
  data: ImportedSettings,
  targets: {
    update: (next: Preferences) => void;
    music: Music;
    apps: Apps;
    twitch: TwitchData;
  },
): Promise<string> {
  const { update, music, apps, twitch } = targets;
  if (data.preferences) update(data.preferences);
  if (data.music) music.replaceAll(data.music);
  if (data.apps) apps.replaceAll(data.apps);
  let note = '';
  if (data.twitch) {
    const account = twitch.adapter.account;
    if (data.twitch.clientId && account) {
      await account.setClientId(data.twitch.clientId).catch(() => {
        note = ' Twitch-Client-ID wurde abgelehnt.';
      });
    }
    await twitch.update(data.twitch.watchlist);
    twitch.refresh();
  }
  return note;
}
