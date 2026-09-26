// SoundCloud without an API key: profiles and playlists are checked via the official oEmbed endpoint (CORS),
// music plays in SoundCloud's official embedded player (w.soundcloud.com), controlled through its
// postMessage protocol — SoundCloud's own api.js is not loaded, so no third-party script runs in
// the app. Links open in the default browser (Rust, only soundcloud.com).
import { invoke, isTauri } from '@tauri-apps/api/core';

export type SoundCloudAccount = {
  /**
   * Path: a profile ("forss") or a playlist ("david1v9/sets/1v9-league-of-legends"), lowercase; a
   * private playlist keeps its secret code as given ("…/sets/mix/s-AbC123").
   */
  permalink: string;
  name: string;
  /** Playlists only: name of the account that made it. */
  owner?: string;
  url: string;
  avatarUrl: string | null;
  /**
   * Not confirmed by SoundCloud yet: "pending" (it could not be asked; checked again
   * automatically), "not-found" or "private" (answer of that later check).
   */
  check?: 'pending' | 'not-found' | 'private';
};

export type LookupError = 'invalid' | 'short-link' | 'not-found' | 'private' | 'offline';
export type LookupResult =
  { ok: true; account: SoundCloudAccount } | { ok: false; error: LookupError };

const PATH = /^[a-z0-9_-]{1,64}(\/sets\/[a-z0-9_-]{1,100}(\/s-[A-Za-z0-9]{1,64})?)?$/;
const PROFILE = 'https://soundcloud.com/';
const IMAGE = /^https:\/\/[a-z0-9-]+\.sndcdn\.com\//;
const CHECKS: readonly unknown[] = ['pending', 'not-found', 'private'];
export const PLAYER_ORIGIN = 'https://w.soundcloud.com';

export const isPlaylist = (account: SoundCloudAccount) => account.permalink.includes('/sets/');

/**
 * Path from a link or a bare name: a playlist link ("…/name/sets/list", also with the secret code
 * of a private one) stays a playlist, any other link (profile, track) becomes its profile.
 * Tracking parameters are dropped.
 */
export function parsePath(input: string): string | null {
  const rest = input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.|m\.)?soundcloud\.com\//i, '')
    .replace(/^@/, '')
    .split(/[?#]/)[0]!;
  const [user = '', section = '', list = '', secret = ''] = rest.split('/');
  // The secret code is case-sensitive; everything else is not.
  const code = /^s-[A-Za-z0-9]+$/.test(secret) ? `/${secret}` : '';
  const path =
    section.toLowerCase() === 'sets' && list
      ? `${user.toLowerCase()}/sets/${list.toLowerCase()}${code}`
      : user.toLowerCase();
  return PATH.test(path) ? path : null;
}

/** Short links from the SoundCloud app; they only lead to the real link in a browser. */
const isShortLink = (input: string) => /^(https?:\/\/)?on\.soundcloud\.com\//i.test(input.trim());

/** Waiting times before each attempt: a short hiccup of the connection or of SoundCloud passes. */
const ATTEMPTS_MS = [0, 1_000, 3_000];
/** An answer that takes longer counts as failed (instead of "Prüft …" forever). */
const REQUEST_TIMEOUT_MS = 8_000;

type OEmbed = Record<string, unknown> | 'not-found' | 'private' | 'offline';

async function oembed(url: string): Promise<OEmbed> {
  for (const wait of ATTEMPTS_MS) {
    if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait));
    // No network at all: asking again right away does not help (the caller checks later).
    if (!navigator.onLine) return 'offline';
    const abort = new AbortController();
    const timer = window.setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(
        `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`,
        { signal: abort.signal },
      );
      if (response.status === 404) return 'not-found';
      if (response.status === 401 || response.status === 403) return 'private';
      if (response.ok) {
        const data: unknown = await response.json().catch(() => null);
        if (data && typeof data === 'object') return data as Record<string, unknown>;
      }
      // Server error, rate limit or an unreadable answer: try again.
    } catch {
      // Network error or timeout: try again.
    } finally {
      window.clearTimeout(timer);
    }
  }
  return 'offline';
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const image = (value: unknown) => (typeof value === 'string' && IMAGE.test(value) ? value : null);

/** Checks a profile or playlist with SoundCloud (oEmbed) and returns its name and picture. */
export async function lookupAccount(input: string): Promise<LookupResult> {
  if (isShortLink(input)) return { ok: false, error: 'short-link' };
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

/**
 * Entry for a valid path SoundCloud could not be asked about: saved anyway, named after its path;
 * name and picture follow with the next successful check.
 */
export function pendingAccount(path: string): SoundCloudAccount {
  const [user = path, , list] = path.split('/');
  return {
    permalink: path,
    name: list ?? user,
    ...(list ? { owner: user } : {}),
    url: PROFILE + path,
    avatarUrl: null,
    check: 'pending',
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
    (a.avatarUrl === null || (typeof a.avatarUrl === 'string' && IMAGE.test(a.avatarUrl))) &&
    (a.check === undefined || CHECKS.includes(a.check))
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
