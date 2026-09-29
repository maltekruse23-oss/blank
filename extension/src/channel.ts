// Which Twitch channel a tab shows – only from its address, nothing is read from the page.
import { isChannel } from '../../src/adapters/watchRoom';

/** First parts of twitch.tv addresses that are pages of Twitch, not channels. */
const NOT_CHANNELS = new Set([
  'directory',
  'search',
  'settings',
  'subscriptions',
  'inventory',
  'drops',
  'wallet',
  'turbo',
  'prime',
  'downloads',
  'jobs',
  'p',
  'store',
  'friends',
  'messages',
  'login',
  'signup',
  'logout',
  'videos',
  'following',
  'moderator',
  'popout',
  'embed',
  'broadcast',
  'dashboard',
  'u',
  'team',
  'event',
  'activate',
  'bits',
  'products',
  'redeem',
  'user',
  'clip',
]);

/** "https://www.twitch.tv/xqc" → "xqc"; only the channel page itself (not its videos, clips …). */
export function channelOfUrl(url: string | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || !['www.twitch.tv', 'twitch.tv'].includes(parsed.hostname))
    return null;
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length !== 1) return null;
  const login = parts[0]!.toLowerCase();
  return isChannel(login) && !NOT_CHANNELS.has(login) ? login : null;
}

export const isTwitchUrl = (url: string | undefined) => {
  try {
    return !!url && ['www.twitch.tv', 'twitch.tv'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
};

export const channelUrl = (login: string) => `https://www.twitch.tv/${login}`;
