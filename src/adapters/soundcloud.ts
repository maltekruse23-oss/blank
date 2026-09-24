// SoundCloud without an API key: profiles and playlists are checked via the official oEmbed endpoint (CORS),
// music plays in SoundCloud's official embedded player (w.soundcloud.com), controlled through its
// postMessage protocol — SoundCloud's own api.js is not loaded, so no third-party script runs in
// the app. Links open in the default browser (Rust, only soundcloud.com).
import { invoke, isTauri } from '@tauri-apps/api/core';

export type SoundCloudAccount = {
  /** Path in lowercase: a profile ("forss") or a playlist ("david1v9/sets/1v9-league-of-legends"). */
  permalink: string;
  name: string;
  /** Playlists only: name of the account that made it. */
  owner?: string;
  url: string;
  avatarUrl: string | null;
};

export type LookupResult =
  | { ok: true; account: SoundCloudAccount }
  | { ok: false; error: 'invalid' | 'not-found' | 'offline' };

const PATH = /^[a-z0-9_-]{1,64}(\/sets\/[a-z0-9_-]{1,100})?$/;
const PROFILE = 'https://soundcloud.com/';
const IMAGE = /^https:\/\/[a-z0-9-]+\.sndcdn\.com\//;
export const PLAYER_ORIGIN = 'https://w.soundcloud.com';

export const isPlaylist = (account: SoundCloudAccount) => account.permalink.includes('/sets/');

/**
 * Path from a link or a bare name: a playlist link ("…/name/sets/list") stays a playlist, any
 * other link (profile, track) becomes its profile. Tracking parameters are dropped.
 */
export function parsePath(input: string): string | null {
  const rest = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^(www\.|m\.)?soundcloud\.com\//, '')
    .replace(/^@/, '')
    .split(/[?#]/)[0]!;
  const [user = '', section, list] = rest.split('/');
  const path = section === 'sets' && list ? `${user}/sets/${list}` : user;
  return PATH.test(path) ? path : null;
}

async function oembed(url: string): Promise<Record<string, unknown> | 'not-found' | 'offline'> {
  let response: Response;
  try {
    response = await fetch(
      `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`,
    );
  } catch {
    return 'offline';
  }
  if (response.status === 404) return 'not-found';
  if (!response.ok) return 'offline';
  const data: unknown = await response.json().catch(() => null);
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : 'offline';
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const image = (value: unknown) => (typeof value === 'string' && IMAGE.test(value) ? value : null);

/** Checks a profile or playlist with SoundCloud (oEmbed) and returns its name and picture. */
export async function lookupAccount(input: string): Promise<LookupResult> {
  const path = parsePath(input);
  if (!path) return { ok: false, error: 'invalid' };
  const url = PROFILE + path;
  const data = await oembed(url);
  if (typeof data === 'string') return { ok: false, error: data };
  const user = path.split('/')[0]!;
  const author = text(data.author_name) || user;
  // Profile and playlist must belong to the account named in the link.
  if (text(data.author_url).toLowerCase() !== PROFILE + user)
    return { ok: false, error: 'not-found' };
  if (!path.includes('/sets/'))
    return {
      ok: true,
      account: { permalink: path, name: author, url, avatarUrl: image(data.thumbnail_url) },
    };
  // Playlist title comes as "<title> by <author>"; without its own cover, the owner's picture.
  const raw = text(data.title);
  const suffix = ` by ${author}`;
  const title = raw.endsWith(suffix) ? raw.slice(0, -suffix.length) : raw;
  let avatarUrl = image(data.thumbnail_url);
  if (!avatarUrl) {
    const owner = await oembed(PROFILE + user);
    if (typeof owner !== 'string') avatarUrl = image(owner.thumbnail_url);
  }
  return {
    ok: true,
    account: { permalink: path, name: title || path, owner: author, url, avatarUrl },
  };
}

export function isAccount(value: unknown): value is SoundCloudAccount {
  if (!value || typeof value !== 'object') return false;
  const a = value as Record<string, unknown>;
  return (
    typeof a.permalink === 'string' &&
    PATH.test(a.permalink) &&
    typeof a.name === 'string' &&
    (a.owner === undefined || typeof a.owner === 'string') &&
    a.url === PROFILE + a.permalink &&
    (a.avatarUrl === null || (typeof a.avatarUrl === 'string' && IMAGE.test(a.avatarUrl)))
  );
}

/** Player for all tracks of a profile or playlist; minimal look, it stays invisible anyway. */
export function playerSrc(profileUrl: string) {
  const options = new URLSearchParams({
    url: profileUrl,
    auto_play: 'false',
    visual: 'false',
    show_artwork: 'false',
    show_comments: 'false',
    show_playcount: 'false',
    show_user: 'false',
    buying: 'false',
    sharing: 'false',
    download: 'false',
    single_active: 'false',
  });
  return `${PLAYER_ORIGIN}/player/?${options}`;
}

/** Sound as reported by the embedded player (only the fields used here). */
export type PlayerSound = {
  id?: number;
  title?: string;
  permalink_url?: string;
  duration?: number;
  artwork_url?: string | null;
  user?: { username?: string; permalink_url?: string; avatar_url?: string | null };
};

export type PlayerEvent = 'ready' | 'play' | 'pause' | 'finish' | 'error';
const EVENTS: readonly string[] = ['ready', 'play', 'pause', 'finish', 'error'];
type Getter = 'getSounds' | 'getCurrentSound' | 'getPosition' | 'isPaused';
const GET_TIMEOUT_MS = 5000;

/** Talks to one embedded player: commands, getters (answered by method name) and events. */
export class PlayerBridge {
  private readonly waiting = new Map<string, ((value: unknown) => void)[]>();

  constructor(
    private readonly frame: HTMLIFrameElement,
    private readonly onEvent: (event: PlayerEvent) => void,
  ) {
    window.addEventListener('message', this.receive);
  }

  dispose() {
    window.removeEventListener('message', this.receive);
    for (const list of this.waiting.values()) for (const resolve of list) resolve(undefined);
    this.waiting.clear();
  }

  send(method: string, value: unknown = null) {
    this.frame.contentWindow?.postMessage(JSON.stringify({ method, value }), PLAYER_ORIGIN);
  }

  get<T>(method: Getter): Promise<T | undefined> {
    return new Promise((resolve) => {
      const list = this.waiting.get(method) ?? [];
      const done = (value: unknown) => {
        window.clearTimeout(timer);
        resolve(value as T | undefined);
      };
      const timer = window.setTimeout(() => {
        const index = list.indexOf(done);
        if (index >= 0) list.splice(index, 1);
        resolve(undefined);
      }, GET_TIMEOUT_MS);
      list.push(done);
      this.waiting.set(method, list);
      this.send(method);
    });
  }

  private readonly receive = (event: MessageEvent) => {
    if (event.origin !== PLAYER_ORIGIN || event.source !== this.frame.contentWindow) return;
    let data: unknown;
    try {
      data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch {
      return;
    }
    if (!data || typeof data !== 'object') return;
    const { method, value } = data as { method?: unknown; value?: unknown };
    if (typeof method !== 'string') return;
    const next = this.waiting.get(method)?.shift();
    if (next) next(value);
    else if (EVENTS.includes(method)) this.onEvent(method as PlayerEvent);
  };
}

/** Opens a soundcloud.com page (track or profile) in the default browser. */
export function openSoundCloud(url: string) {
  if (!url.startsWith(PROFILE)) return;
  if (isTauri()) void invoke('soundcloud_open', { url }).catch(() => undefined);
  else window.open(url, '_blank', 'noopener');
}
