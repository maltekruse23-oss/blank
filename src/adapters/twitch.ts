// Typed boundary for Twitch data. The UI only talks to a TwitchAdapter: the Helix adapter in
// the desktop app (requests and token in Rust), the mock adapter in the browser preview.

export type GameRef = { id: string; name: string };
/** A selected channel. Empty `games` means: show whenever the channel is live. */
export type WatchedChannel = {
  login: string;
  displayName: string;
  games: GameRef[];
  /** undefined = not looked up yet, null = none available. */
  profileImageUrl?: string | null;
};
export type ChannelInfo = Pick<WatchedChannel, 'login' | 'displayName' | 'profileImageUrl'>;
export type LiveStream = {
  login: string;
  title: string;
  game: GameRef;
  viewers: number;
  /** Official Twitch preview image; null when none is available. */
  thumbnailUrl: string | null;
};
/** Pushed the moment a watched channel goes live. `game.id` is empty if the game is unknown. */
export type StreamOnline = { login: string; displayName: string; game: GameRef; title: string };
export type TwitchErrorKind =
  | 'not-configured'
  | 'unauthenticated'
  | 'offline'
  | 'rate-limited'
  | 'login-expired'
  | 'login-cancelled'
  | 'unknown';

export class TwitchError extends Error {
  readonly kind: TwitchErrorKind;
  constructor(kind: TwitchErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export type TwitchAccount = { configured: boolean; signedIn: boolean; login: string | null };
export type DeviceLogin = { userCode: string; verificationUri: string; expiresIn: number };

export interface TwitchAccountApi {
  status(): Promise<TwitchAccount>;
  setClientId(clientId: string): Promise<void>;
  /** Requests a device code and opens Twitch's activation page in the browser. */
  startLogin(): Promise<DeviceLogin>;
  /** Resolves once the code was confirmed; rejects when it expired or was cancelled. */
  finishLogin(): Promise<TwitchAccount>;
  cancelLogin(): Promise<void>;
  logout(): Promise<void>;
}

export interface TwitchAdapter {
  readonly source: 'mock' | 'twitch';
  readonly refreshMs: number;
  /** Account handling; null when the source needs no login (mock). */
  readonly account: TwitchAccountApi | null;
  /** Opens the channel on twitch.tv; null when channels are fictional (mock). */
  readonly openChannel: ((login: string) => Promise<void>) | null;
  /** Instant "went live" push (EventSub); returns an unsubscribe function. null without push. */
  readonly onStreamOnline: ((callback: (event: StreamOnline) => void) => () => void) | null;
  /** State of the push connection: how many channels are watched instantly. */
  readonly pushStatus: (() => Promise<{ connected: boolean; watched: number }>) | null;
  loadWatchlist(): Promise<WatchedChannel[]>;
  saveWatchlist(channels: WatchedChannel[]): Promise<void>;
  /** Resolves a login to a channel, or null if it does not exist. */
  findChannel(login: string): Promise<ChannelInfo | null>;
  /** Current name and profile image of existing channels (unknown logins are absent). */
  fetchChannels(logins: string[]): Promise<ChannelInfo[]>;
  searchCategories(query: string): Promise<GameRef[]>;
  /** Live streams among the given logins; offline channels are absent. */
  fetchLiveStreams(logins: string[]): Promise<LiveStream[]>;
}

export function matchesGames(channel: WatchedChannel, stream: Pick<LiveStream, 'game'>) {
  return channel.games.length === 0 || channel.games.some((game) => game.id === stream.game.id);
}

export function errorKind(error: unknown): TwitchErrorKind {
  return error instanceof TwitchError ? error.kind : 'unknown';
}
