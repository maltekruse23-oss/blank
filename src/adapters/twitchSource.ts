// Real Twitch data only in the desktop app; the browser preview stays on mock data.
import { isTauri } from '@tauri-apps/api/core';
import type { TwitchAdapter } from './twitch';
import { helixTwitchAdapter } from './twitchHelix';
import { mockTwitchAdapter } from './twitchMock';

export const twitchAdapter: TwitchAdapter = isTauri() ? helixTwitchAdapter : mockTwitchAdapter;
