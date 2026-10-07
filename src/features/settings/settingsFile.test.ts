import { describe, expect, it } from 'vitest';
import { defaultPreferences } from './preferences';
import { parseSettingsFile, SETTINGS_FORMAT, settingsFileContent } from './settingsFile';

// Settings → Übertragen (settingsFile.ts): export and strict check on import. Invalid parts are
// dropped or fall back to defaults, never taken over as they are.
const file = (data: Record<string, unknown>) =>
  JSON.stringify({ app: 'blank.', format: SETTINGS_FORMAT, ...data });

const account = (permalink: string) => ({
  permalink,
  name: permalink,
  url: `https://soundcloud.com/${permalink}`,
  avatarUrl: null,
});

const parsed = (text: string) => {
  const result = parseSettingsFile(text);
  if (typeof result === 'string') throw new Error(result);
  return result;
};

describe('settings file', () => {
  it('reads back what it exported', () => {
    const music = { accounts: [account('forss')], volume: 40 };
    const apps = [{ id: 'firefox', name: 'Firefox' }];
    const result = parsed(settingsFileContent(defaultPreferences, music, apps));
    expect(result.preferences).toEqual(defaultPreferences);
    expect(result.music).toEqual(music);
    expect(result.apps).toEqual(apps);
    expect(result.twitch).toBeNull();
    expect(result.exportedAt).not.toBeNull();
  });

  it('rejects files that are not blank. settings', () => {
    expect(parseSettingsFile('nope')).toBe('Keine blank.-Einstellungsdatei.');
    expect(parseSettingsFile('null')).toBe('Keine blank.-Einstellungsdatei.');
    expect(parseSettingsFile(JSON.stringify({ app: 'other', format: 1 }))).toBe(
      'Keine blank.-Einstellungsdatei.',
    );
    expect(parseSettingsFile(file({ format: SETTINGS_FORMAT + 1 }))).toBe(
      'Datei stammt aus einer neueren blank.-Version.',
    );
    expect(parseSettingsFile(file({}))).toBe('Die Datei enthält keine Einstellungen.');
    expect(parseSettingsFile(' '.repeat(512 * 1024 + 1))).toBe(
      'Datei zu groß für blank.-Einstellungen.',
    );
  });

  it('checks music: unique accounts, volume 0–100 or 50', () => {
    const result = parsed(
      file({
        music: {
          accounts: [account('forss'), account('forss'), { permalink: 'x' }],
          volume: 101,
        },
      }),
    );
    expect(result.music).toEqual({ accounts: [account('forss')], volume: 50 });
  });

  it('checks Twitch: valid logins, Twitch images only, no strange Client ID', () => {
    const result = parsed(
      file({
        twitch: {
          clientId: 'not valid!',
          watchlist: [
            {
              login: 'some_streamer',
              displayName: ' ',
              games: [
                { id: '21779', name: 'League of Legends' },
                { id: 'x', name: 'Bad' },
              ],
              profileImageUrl: 'https://evil.example/a.png',
            },
            { login: 'Bad Login', games: [] },
          ],
        },
      }),
    );
    expect(result.twitch).toEqual({
      clientId: null,
      watchlist: [
        {
          login: 'some_streamer',
          displayName: 'some_streamer',
          games: [{ id: '21779', name: 'League of Legends' }],
          profileImageUrl: undefined,
        },
      ],
    });
  });

  it('keeps each valid program once', () => {
    const result = parsed(
      file({
        apps: [
          { id: 'firefox', name: 'Firefox' },
          { id: 'firefox', name: 'Firefox again' },
          { id: 'steam', name: ' ' },
          { id: 'Bad.Id', name: 'Bad' },
        ],
      }),
    );
    expect(result.apps).toEqual([{ id: 'firefox', name: 'Firefox' }]);
  });

  it('takes stored preferences over and falls back to defaults for invalid fields', () => {
    const result = parsed(
      file({
        preferences: { compact: false, motion: true, volume: 30, theme: 'neon', popoutOpacity: 5 },
      }),
    );
    expect(result.preferences?.volume).toBe(30);
    expect(result.preferences?.theme).toBe(defaultPreferences.theme);
    expect(result.preferences?.popoutOpacity).toBe(defaultPreferences.popoutOpacity);
  });
});
