import { useEffect, useRef, useState } from 'react';
import {
  PlayerBridge,
  isAccount,
  isPlaylist,
  lookupAccount,
  parsePath,
  pendingAccount,
  playerSrc,
  type LookupError,
  type PlayerEvent,
  type PlayerSound,
  type SoundCloudAccount,
} from '../../adapters/soundcloud';
import { mirrorSettings } from '../../platform/store';

const STORAGE_KEY = 'blank.music.v1';
const MAX_ACCOUNTS = 50;
const DEFAULT_VOLUME = 50;
/** No answer from the player (network, blocked) within this time counts as a failure. */
const START_TIMEOUT_MS = 20_000;
/** Tracks in a row that fail to play before the mix gives up. */
const MAX_FAILURES = 3;
/** Retries of "play" for a chosen track that does not start (see playRandom). */
const START_RETRIES = 4;
const START_RETRY_MS = 1500;
/** Second check of an entry saved while SoundCloud did not answer. */
const RECHECK_MS = 60_000;

const freshMix = () => ({
  count: 0,
  played: [] as number[],
  current: null as number | null,
  turn: 0,
});

export type Track = {
  title: string;
  url: string | null;
  artist: string;
  artistUrl: string | null;
  artworkUrl: string | null;
  durationMs: number | null;
};

export type Player =
  | { status: 'idle' }
  | { status: 'loading'; account: SoundCloudAccount }
  /** No internet: the mix starts or goes on by itself once it is back. */
  | { status: 'offline'; account: SoundCloudAccount }
  | {
      status: 'playing' | 'paused';
      account: SoundCloudAccount;
      track: Track | null;
      /** This track followed by itself after the one before finished (popouts: "Als Nächstes"). */
      auto?: boolean;
    }
  | { status: 'error'; account: SoundCloudAccount; message: string };

/** Answers to "Hinzufügen" that SoundCloud gave for sure (no connection problem). */
const ADD_ERRORS: Record<Exclude<LookupError, 'offline'>, string> = {
  invalid: 'Kein SoundCloud-Profil oder Playlist-Link.',
  'short-link':
    'Kurzlink aus der SoundCloud-App: einmal im Browser öffnen und den Link aus der Adresszeile nehmen.',
  'not-found': 'Auf SoundCloud nicht gefunden.',
  private: 'Privat – mit dem Geheim-Link der Playlist (…/s-…) geht es.',
};

type Saved = { accounts: SoundCloudAccount[]; volume: number };

function load(): Saved {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      const { accounts, volume } = raw as Record<string, unknown>;
      return {
        accounts: Array.isArray(accounts) ? accounts.filter(isAccount).slice(0, MAX_ACCOUNTS) : [],
        volume:
          typeof volume === 'number' && Number.isInteger(volume) && volume >= 0 && volume <= 100
            ? volume
            : DEFAULT_VOLUME,
      };
    }
  } catch {
    // Storage unavailable or broken: start empty.
  }
  return { accounts: [], volume: DEFAULT_VOLUME };
}

/** Random track index not played yet in this mix and never the current one. */
export function pickNext(count: number, played: readonly number[], current: number | null) {
  const all = [...Array(count).keys()].filter((i) => i !== current);
  const fresh = all.filter((i) => !played.includes(i));
  const pool = fresh.length ? fresh : all;
  return pool.length ? pool[Math.floor(Math.random() * pool.length)]! : 0;
}

const soundcloudLink = (url: unknown) =>
  typeof url === 'string' && url.startsWith('https://soundcloud.com/') ? url : null;
const imageLink = (url: unknown) =>
  typeof url === 'string' && /^https:\/\/[a-z0-9-]+\.sndcdn\.com\//.test(url) ? url : null;

function toTrack(sound: PlayerSound | undefined): Track | null {
  if (!sound?.title) return null;
  return {
    title: sound.title,
    url: soundcloudLink(sound.permalink_url),
    artist: sound.user?.username ?? '',
    artistUrl: soundcloudLink(sound.user?.permalink_url),
    artworkUrl: imageLink(sound.artwork_url) ?? imageLink(sound.user?.avatar_url),
    durationMs: typeof sound.duration === 'number' && sound.duration > 0 ? sound.duration : null,
  };
}

/** The hidden player; mounted once per mix and connected before SoundCloud reports "ready". */
function PlayerFrame({
  src,
  connect,
}: {
  src: string;
  connect: (frame: HTMLIFrameElement) => () => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const first = useRef(connect);
  useEffect(() => (ref.current ? first.current(ref.current) : undefined), []);
  return (
    <iframe
      ref={ref}
      className="music-frame"
      src={src}
      title="SoundCloud-Player"
      allow="autoplay; encrypted-media"
      tabIndex={-1}
      aria-hidden="true"
    />
  );
}

/**
 * SoundCloud mixes: saved accounts and one player for the whole app. The player only exists while
 * a mix is active (nothing loads or runs before the first "Mix" or after "Stop"); it plays on
 * across pages and while minimized. A mix plays the account's tracks in random order.
 */
export function useMusic() {
  const [saved, setSaved] = useState(load);
  const [saveFailed, setSaveFailed] = useState(false);
  const [player, setPlayer] = useState<Player>({ status: 'idle' });
  const [session, setSession] = useState<{ id: number; account: SoundCloudAccount } | null>(null);
  const latest = useRef(saved);
  latest.current = saved;
  const bridge = useRef<PlayerBridge | null>(null);
  /** Tracks in the list, played indexes, current index; turn: counts track choices and user
   *  actions, so a pending start retry knows it is no longer wanted. */
  const mix = useRef(freshMix());
  const sessions = useRef(0);
  /** The running session is already the automatic second try. */
  const retried = useRef(false);
  /** What to do once the internet is back (start or continue the mix). */
  const resume = useRef<(() => void) | null>(null);
  const checking = useRef(false);
  /** The track that starts next follows by itself (the one before finished). */
  const byItself = useRef(false);

  /** Asks SoundCloud again about entries it could not confirm yet; at start and when online. */
  async function recheck() {
    if (checking.current || !navigator.onLine) return;
    checking.current = true;
    try {
      for (const account of latest.current.accounts.filter((a) => a.check === 'pending')) {
        const result = await lookupAccount(account.url);
        if (!result.ok && result.error === 'offline') return;
        const next: SoundCloudAccount = result.ok
          ? result.account
          : { ...account, check: result.error === 'private' ? 'private' : 'not-found' };
        save({
          ...latest.current,
          accounts: latest.current.accounts.map((a) =>
            a.permalink === account.permalink ? next : a,
          ),
        });
      }
    } finally {
      checking.current = false;
    }
  }

  // Only refs and state setters are used, so the first render's functions stay valid.
  useEffect(() => {
    void recheck();
    const online = () => {
      void recheck();
      const next = resume.current;
      resume.current = null;
      next?.();
    };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, []);

  function save(next: Saved) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
    mirrorSettings();
    latest.current = next;
    setSaved(next);
  }

  function playRandom() {
    const m = mix.current;
    const b = bridge.current;
    if (!b || m.count === 0) return;
    if (m.played.length >= m.count) m.played = [];
    const index = pickNext(m.count, m.played, m.current);
    m.played.push(index);
    m.current = index;
    const turn = ++m.turn;
    b.send('skip', index);
    b.send('play');
    // A track the player has not loaded yet (playlists load bit by bit) gets selected but does
    // not start; ask again until it plays. Stops once it plays, another track is chosen or the
    // user pauses/seeks.
    void (async () => {
      const wanted = () => bridge.current === b && m.turn === turn;
      for (let attempt = 0; attempt < START_RETRIES; attempt++) {
        await new Promise((resolve) => window.setTimeout(resolve, START_RETRY_MS));
        if (!wanted() || (await b.get<boolean>('isPaused')) !== true || !wanted()) return;
        b.send('play');
      }
    })();
  }

  function fail(account: SoundCloudAccount, message: string) {
    setSession(null);
    setPlayer({ status: 'error', account, message });
  }

  function connect(frame: HTMLIFrameElement, account: SoundCloudAccount) {
    mix.current = freshMix();
    let ready = false;
    let started = false;
    let playing = false;
    let failures = 0;
    const timer = window.setTimeout(() => {
      if (started) return;
      // No internet, or a load that got stuck: start again (once) instead of giving up.
      if (!navigator.onLine || !retried.current) startMix(account, true);
      else
        fail(
          account,
          ready
            ? 'Wiedergabe startet nicht – später nochmal versuchen'
            : 'SoundCloud antwortet nicht – später nochmal versuchen',
        );
    }, START_TIMEOUT_MS);
    const b = new PlayerBridge(frame, (event) => void handle(event));
    bridge.current = b;
    /** The connection drops while a track plays: wait for it, then play on. */
    const offline = () => {
      if (!playing) return;
      setPlayer({ status: 'offline', account });
      resume.current = () => {
        if (bridge.current === b) b.send('play');
      };
    };
    window.addEventListener('offline', offline);

    async function handle(event: PlayerEvent) {
      if (event === 'ready') {
        ready = true;
        for (const name of ['play', 'pause', 'finish', 'error']) b.send('addEventListener', name);
        b.send('setVolume', latest.current.volume);
        const sounds = await b.get<PlayerSound[]>('getSounds');
        if (bridge.current !== b) return;
        if (!sounds?.length) {
          started = true;
          fail(
            account,
            isPlaylist(account)
              ? 'Playlist ist leer'
              : 'Keine eigenen Tracks – Playlist-Link (…/sets/…) hinzufügen',
          );
          return;
        }
        mix.current.count = sounds.length;
        playRandom();
      } else if (event === 'play') {
        started = true;
        playing = true;
        failures = 0;
        const sound = await b.get<PlayerSound>('getCurrentSound');
        if (bridge.current !== b) return;
        const auto = byItself.current;
        byItself.current = false;
        setPlayer({ status: 'playing', account, track: toTrack(sound), auto });
        // Profiles load their track list bit by bit; later tracks join the mix.
        const sounds = await b.get<PlayerSound[]>('getSounds');
        if (bridge.current === b && sounds)
          mix.current.count = Math.max(mix.current.count, sounds.length);
      } else if (event === 'pause') {
        playing = false;
        setPlayer((p) => (p.status === 'playing' ? { ...p, status: 'paused' } : p));
      } else if (event === 'finish') {
        byItself.current = true;
        playRandom();
      } else if (!navigator.onLine) {
        // Tracks fail because the connection is gone: wait for it instead of skipping through.
        playing = false;
        setPlayer({ status: 'offline', account });
        resume.current = () => {
          if (bridge.current === b) playRandom();
        };
      } else {
        // A track that cannot play (removed, blocked for embedding): try another one.
        failures += 1;
        if (failures < MAX_FAILURES) playRandom();
        else {
          started = true;
          fail(account, 'Tracks lassen sich nicht abspielen');
        }
      }
    }

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('offline', offline);
      b.dispose();
      if (bridge.current === b) bridge.current = null;
    };
  }

  /** `retry`: automatic second try after a start that got no answer. */
  function startMix(account: SoundCloudAccount, retry = false) {
    resume.current = null;
    void recheck();
    if (!navigator.onLine) {
      setSession(null);
      setPlayer({ status: 'offline', account });
      resume.current = () => startMix(account);
      return;
    }
    retried.current = retry;
    sessions.current += 1;
    setSession({ id: sessions.current, account });
    setPlayer({ status: 'loading', account });
  }

  function stop() {
    resume.current = null;
    setSession(null);
    setPlayer({ status: 'idle' });
  }

  function setVolume(volume: number) {
    save({ ...latest.current, volume });
    bridge.current?.send('setVolume', volume);
  }

  /**
   * Adds a profile or playlist (link or name). When SoundCloud cannot be asked, a valid link is
   * saved anyway and checked again later. `message`: shown under the field.
   */
  async function add(input: string): Promise<{ added: boolean; message: string | null }> {
    const permalink = parsePath(input);
    if (permalink && latest.current.accounts.some((a) => a.permalink === permalink))
      return { added: false, message: 'Ist schon in der Liste.' };
    if (latest.current.accounts.length >= MAX_ACCOUNTS)
      return { added: false, message: `Maximal ${MAX_ACCOUNTS} Einträge.` };
    const result = await lookupAccount(input);
    if (!result.ok && (result.error !== 'offline' || !permalink))
      return {
        added: false,
        message: ADD_ERRORS[result.error === 'offline' ? 'invalid' : result.error],
      };
    const account = result.ok ? result.account : pendingAccount(permalink!);
    if (latest.current.accounts.some((a) => a.permalink === account.permalink))
      return { added: false, message: 'Ist schon in der Liste.' };
    save({ ...latest.current, accounts: [...latest.current.accounts, account] });
    if (result.ok) return { added: true, message: null };
    // One later try in case only SoundCloud had a hiccup (then no "online" event comes).
    window.setTimeout(() => void recheck(), RECHECK_MS);
    return {
      added: true,
      message: navigator.onLine
        ? 'Hinzugefügt. SoundCloud antwortet gerade nicht – Name und Bild kommen automatisch.'
        : 'Hinzugefügt. Keine Internetverbindung – Name und Bild kommen automatisch.',
    };
  }

  /** Settings import: replaces all accounts/playlists and the volume. */
  function replaceAll(next: Saved) {
    save({ accounts: next.accounts.slice(0, MAX_ACCOUNTS), volume: next.volume });
    bridge.current?.send('setVolume', next.volume);
    void recheck();
  }

  function remove(permalink: string) {
    save({
      ...latest.current,
      accounts: latest.current.accounts.filter((a) => a.permalink !== permalink),
    });
  }

  const frame = session ? (
    <PlayerFrame
      key={`music-${session.id}`}
      src={playerSrc(session.account.url)}
      connect={(element) => connect(element, session.account)}
    />
  ) : null;

  return {
    accounts: saved.accounts,
    volume: saved.volume,
    saveFailed,
    player,
    frame,
    add,
    remove,
    replaceAll,
    startMix,
    stop,
    setVolume,
    toggle: () => {
      mix.current.turn += 1;
      bridge.current?.send('toggle');
    },
    next: playRandom,
    seek: (ms: number) => {
      mix.current.turn += 1;
      bridge.current?.send('seekTo', ms);
    },
    position: () => bridge.current?.get<number>('getPosition') ?? Promise.resolve(undefined),
  };
}

export type Music = ReturnType<typeof useMusic>;
