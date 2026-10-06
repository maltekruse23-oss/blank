import { bouncyCurve, spring } from '../../design/motion';
import { AnimatePresence, motion } from 'motion/react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  BatteryLow,
  Bell,
  Gauge,
  Info,
  Music2,
  Pause,
  Play,
  Radio,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { ChannelAvatar } from '../../components/ui';
import {
  controlMedia,
  onMediaChanged,
  openPlayer,
  readMedia,
  readTimeline,
  seekMedia,
  type MediaAction,
  type NowPlaying,
  type Timeline,
} from '../../adapters/media';
import {
  controlMix,
  hidePopout,
  onPopoutFullScreen,
  onPopoutItem,
  onPopoutUpdate,
  openApp,
  openStream,
  popoutDone,
  preparePopout,
  presentPopout,
  setPopoutRegion,
  takePendingPopouts,
  type MixItem,
  type PopoutItem,
} from '../../platform/popout';
import { CloseProgramButton } from '../pc/CloseProgramButton';
import {
  defaultPreferences,
  preferencesKey,
  readPreferences,
  type Preferences,
} from '../settings/preferences';
import { popoutEasings, popoutPlaces, popoutScreens } from './placement';
import { AramResultCard } from '../aram/AramResult';
import { ChampCard } from '../aram/ChampCardView';

/** After the mouse leaves a popout (or a click in it), it stays at least this long. */
const AFTER_HOVER_MS = 3_000;
const MAX_QUEUE = 6;
/** A player that reports nothing for this long has stopped. */
const NOTHING_PLAYS_MS = 3_000;
/** Fading in and out at speed 1×. */
const FADE_MS = 250;
/** Transparent edge around the popout for its own shadow (CSS pixels). */
const INSET = 10;
/** How far a popout slides while it fades in and out (CSS pixels). */
const SLIDE = 18;
/** Widths in CSS pixels; each extra button (repeat, shuffle) adds one step. */
const WIDTH = {
  normal: 360,
  button: 38,
  compact: 380,
  upNext: 330,
  notice: 360,
  taskbar: 300,
  aram: 560,
  champ: 380,
};
/** The ARAM card builds up for about 2.5 s; it stays at least this long (unless "Immer"). */
const ARAM_SECONDS = 12;
/** The Champ-Karte is read during the champion select; it stays at least this long. */
const CHAMP_SECONDS = 20;
/** Cards too large for a row in the taskbar: at that end, above it, like a normal popout. */
const isCard = (item: PopoutItem | undefined) => item?.kind === 'aram' || item?.kind === 'champ';

/** The settings, shared with the app window; read again whenever they change there. */
function readLook(): Preferences {
  try {
    return (
      readPreferences(JSON.parse(localStorage.getItem(preferencesKey) ?? 'null')) ??
      defaultPreferences
    );
  } catch {
    return defaultPreferences;
  }
}

const isMusic = (item: PopoutItem) => item.kind === 'music' || item.kind === 'mix';
const isUpNext = (item: PopoutItem) =>
  (item.kind === 'music' || item.kind === 'mix') && !!item.upNext;
/** Shows a track: real music, the own mix, or the preview of the music settings. */
const showsMusic = (item: PopoutItem) =>
  isMusic(item) || (item.kind === 'preview' && item.topic === 'music');
/** The settings preview stays this long after the last change (not while the mouse is on it). */
const PREVIEW_SECONDS = 6;
/** After the mouse leaves an opened compact popout, it folds back after this long. */
const FOLD_MS = 250;
/**
 * Opening and folding a compact music popout: the card morphs between its two sizes, out of the
 * screen's edge (user's example videos). Starts at once and stays quick, whatever the speed.
 */
const MORPH_MS = 180;
const MORPH_EASING = 'cubic-bezier(0.2, 0, 0, 1)';
/** Room above (or below) a compact music popout in its window, to open into (CSS px). */
const ROOM = 130;
/** In the taskbar: room above the row for the panel that opens there (CSS px). */
const ROOM_TASKBAR = 210;

/**
 * Notices (live, warnings, notes, sample) in order of arrival, then the one music popout: a notice
 * never waits behind music that stays open. Only the newest music state and one sample count.
 */
function enqueue(list: PopoutItem[], item: PopoutItem) {
  const same = (i: PopoutItem) =>
    isMusic(item)
      ? isMusic(i)
      : (item.kind === 'test' || item.kind === 'preview') && i.kind === item.kind;
  // A newer sample or preview takes the old one's place (no new slide, no reordering).
  if (!isMusic(item) && list.some(same)) return list.map((i) => (same(i) ? item : i));
  const rest = list.filter((i) => !same(i));
  const notices = [...rest.filter((i) => !isMusic(i)), ...(isMusic(item) ? [] : [item])];
  const music = isMusic(item) ? [item] : rest.filter(isMusic);
  return [...notices.slice(-(MAX_QUEUE - 1)), ...music];
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** 1:05, 12:40, 1:02:03 */
function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const [h, m, r] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

/**
 * The cover's main colour (the average of its more colourful pixels), for "Cover-Farbe als
 * Akzent" and the glow backgrounds; null while unknown or if the image may not be read.
 */
function useCoverColor(src: string | null) {
  const [color, setColor] = useState<{ fill: string; ink: string } | null>(null);
  useEffect(() => {
    setColor(null);
    if (!src) return;
    let active = true;
    const image = new Image();
    if (!src.startsWith('data:')) image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 16;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.drawImage(image, 0, 0, 16, 16);
        const data = context.getImageData(0, 0, 16, 16).data;
        let [r, g, b, weight] = [0, 0, 0, 0];
        for (let i = 0; i < data.length; i += 4) {
          const [pr, pg, pb] = [data[i]!, data[i + 1]!, data[i + 2]!];
          const saturation = Math.max(pr, pg, pb) - Math.min(pr, pg, pb);
          const w = 1 + saturation * saturation;
          [r, g, b, weight] = [r + pr * w, g + pg * w, b + pb * w, weight + w];
        }
        [r, g, b] = [r / weight, g / weight, b / weight].map(Math.round) as [
          number,
          number,
          number,
        ];
        const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
        if (active)
          setColor({
            fill: `rgb(${r}, ${g}, ${b})`,
            ink: light ? 'rgb(20, 20, 20)' : 'rgb(255, 255, 255)',
          });
      } catch {
        // An image from another server without permission to read it: the design's colours stay.
      }
    };
    image.src = src;
    return () => {
      active = false;
    };
  }, [src]);
  return color;
}

/** One view for both sources: any player (Windows) and blank.'s own mix (the app). */
type Playing = {
  title: string;
  artist: string;
  app: string;
  playing: boolean;
  cover: string | null;
  canPrevious: boolean;
  canNext: boolean;
  canToggle: boolean;
  repeat: 'none' | 'one' | 'all' | null;
  shuffle: boolean | null;
  canRepeat: boolean;
  canShuffle: boolean;
  timeline: Timeline | null;
  run: (action: MediaAction) => Promise<void>;
  seek: ((seconds: number) => Promise<void>) | null;
  open: () => Promise<void>;
};

function fromMix(item: MixItem): Playing {
  return {
    title: item.title,
    artist: item.artist,
    app: 'blank. Mix',
    playing: item.playing,
    cover: item.cover,
    canPrevious: false,
    canNext: true,
    canToggle: true,
    // A mix always plays in random order and goes on after each track.
    repeat: null,
    shuffle: true,
    canRepeat: false,
    canShuffle: false,
    timeline:
      item.duration && item.position !== null
        ? {
            position: item.position / 1000,
            duration: item.duration / 1000,
            updatedAt: item.at,
            canSeek: true,
          }
        : null,
    run: (action) => controlMix(action === 'next' ? 'next' : 'toggle'),
    seek: (seconds) => controlMix('seek', Math.round(seconds * 1000)),
    open: () => openApp('music'),
  };
}

function fromSystem(media: NowPlaying, timeline: Timeline | null): Playing {
  return {
    ...media,
    timeline,
    run: (action) => controlMedia?.(action) ?? Promise.resolve(),
    seek: seekMedia,
    open: () => openPlayer?.() ?? Promise.resolve(),
  };
}

/** The made-up track of the settings preview; buttons change only the preview itself. */
type Sample = {
  playing: boolean;
  repeat: 'none' | 'one' | 'all';
  shuffle: boolean;
  /** Seconds into the track at `at` (ms). */
  position: number;
  at: number;
};
const SAMPLE_LENGTH = 214;

let sampleCover: string | null = null;
/** A cover for the preview, drawn once here (nothing is loaded). */
function previewCover() {
  if (sampleCover) return sampleCover;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const fill = context.createLinearGradient(0, 0, 96, 96);
  fill.addColorStop(0, '#2f8f7a');
  fill.addColorStop(1, '#6b3fc0');
  context.fillStyle = fill;
  context.fillRect(0, 0, 96, 96);
  sampleCover = canvas.toDataURL('image/png');
  return sampleCover;
}

function fromPreview(sample: Sample, set: (next: Sample) => void): Playing {
  const now = () => {
    const at = Date.now();
    const since = sample.playing ? (at - sample.at) / 1000 : 0;
    return { at, position: Math.min(SAMPLE_LENGTH, sample.position + since) };
  };
  return {
    title: 'Beispiel-Titel',
    artist: 'So sehen deine Popouts aus',
    app: 'Vorschau',
    playing: sample.playing,
    repeat: sample.repeat,
    shuffle: sample.shuffle,
    cover: previewCover(),
    canPrevious: true,
    canNext: true,
    canToggle: true,
    canRepeat: true,
    canShuffle: true,
    timeline: {
      position: sample.position,
      duration: SAMPLE_LENGTH,
      updatedAt: sample.at,
      canSeek: true,
    },
    run: async (action) => {
      if (action === 'toggle') set({ ...sample, ...now(), playing: !sample.playing });
      if (action === 'repeat') set({ ...sample, repeat: nextRepeat[sample.repeat] });
      if (action === 'shuffle') set({ ...sample, shuffle: !sample.shuffle });
    },
    seek: async (seconds) => set({ ...sample, position: seconds, at: Date.now() }),
    open: async () => undefined,
  };
}

/** Where the track is now: the last known position plus the time since, while it plays. */
function positionOf(timeline: Timeline, playing: boolean, now: number) {
  const since = playing ? (now - timeline.updatedAt) / 1000 : 0;
  return Math.min(timeline.duration, Math.max(0, timeline.position + since));
}

function Seekbar({ playing }: { playing: Playing }) {
  const [now, setNow] = useState(Date.now());
  const [drag, setDrag] = useState<number | null>(null);
  const [jumped, setJumped] = useState<Timeline | null>(null);
  const timeline = jumped ?? playing.timeline;
  // Only while the popout is on screen, once a second.
  useEffect(() => {
    if (!playing.playing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [playing.playing]);
  // A newer report from the player replaces the own jump.
  const reported = playing.timeline
    ? `${playing.timeline.position}|${playing.timeline.updatedAt}`
    : '';
  useEffect(() => setJumped(null), [reported]);
  if (!timeline) return null;
  const position = drag ?? positionOf(timeline, playing.playing, now);
  const canSeek = timeline.canSeek && playing.seek !== null;
  const commit = () => {
    if (drag === null || !playing.seek) return;
    setJumped({ ...timeline, position: drag, updatedAt: Date.now() });
    setDrag(null);
    void playing.seek(drag).catch(() => undefined);
  };
  return (
    <div className="popout-seek">
      <span>{clock(position)}</span>
      <input
        type="range"
        min={0}
        max={Math.ceil(timeline.duration)}
        step={1}
        value={Math.round(position)}
        disabled={!canSeek}
        aria-label="Stelle im Titel"
        aria-valuetext={`${clock(position)} von ${clock(timeline.duration)}`}
        style={{ '--value': `${(position / timeline.duration) * 100}%` } as CSSProperties}
        onChange={(event) => setDrag(Number(event.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
      />
      <span>{clock(timeline.duration)}</span>
    </div>
  );
}

/**
 * The compact popout's progress (user's wish): a slim bar where the buttons were, how far the
 * track or video has played. Nothing without a length (a Twitch live stream) or with "Fortschritt"
 * off. Moves on once a second, only while it plays and the popout is on screen; hovering opens the
 * full popout with pause and the seek bar.
 */
function MiniProgress({ playing }: { playing: Playing }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!playing.playing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [playing.playing]);
  const timeline = playing.timeline;
  if (!timeline || !(timeline.duration > 0)) return null;
  const share = positionOf(timeline, playing.playing, now) / timeline.duration;
  return (
    <span
      className="popout-mini-progress"
      role="progressbar"
      aria-label="Fortschritt"
      aria-valuemin={0}
      aria-valuemax={Math.ceil(timeline.duration)}
      aria-valuenow={Math.round(share * timeline.duration)}
      style={{ '--value': `${share * 100}%` } as CSSProperties}
    />
  );
}

function Cover({ src, size }: { src: string | null; size: number }) {
  return src ? (
    <img className="popout-cover" src={src} alt="" />
  ) : (
    <span className="popout-cover empty">
      <Music2 size={size} />
    </span>
  );
}

/** What a click changes, shown at once; the player's next report replaces it. */
type Guess = Partial<Pick<Playing, 'playing' | 'repeat' | 'shuffle'>>;
/** Repeat as Windows steps through it (media.rs): off → all → this track → off. */
const nextRepeat = { none: 'all', all: 'one', one: 'none' } as const;
/** If a player never answers, the guess goes after this long. */
const GUESS_MS = 3_000;

function MusicPopout({
  playing: reported,
  look,
  compact,
}: {
  playing: Playing;
  look: Preferences;
  /** One slim row; hovering a compact popout shows the full one (the window decides). */
  compact: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  // Instant feedback: pause, repeat and shuffle change on the click, not when the player reports.
  const [guess, setGuess] = useState<Guess | null>(null);
  const reportKey = `${reported.title}|${reported.playing}|${reported.repeat}|${reported.shuffle}`;
  useEffect(() => setGuess(null), [reportKey]);
  useEffect(() => {
    if (!guess) return;
    const timer = window.setTimeout(() => setGuess(null), GUESS_MS);
    return () => window.clearTimeout(timer);
  }, [guess]);
  const playing: Playing = { ...reported, ...guess };
  const run = (action: MediaAction) => {
    setFailed(null);
    if (action === 'toggle') setGuess((g) => ({ ...g, playing: !playing.playing }));
    if (action === 'repeat' && playing.repeat)
      setGuess((g) => ({ ...g, repeat: nextRepeat[playing.repeat!] }));
    if (action === 'shuffle' && playing.shuffle !== null)
      setGuess((g) => ({ ...g, shuffle: !playing.shuffle }));
    reported.run(action).catch(() => {
      setGuess(null);
      setFailed(`${playing.app} reagiert nicht`);
    });
  };
  const open = () => {
    setFailed(null);
    playing.open().catch(() => setFailed(`${playing.app} nicht gefunden`));
  };
  const button = (
    action: MediaAction,
    label: string,
    enabled: boolean,
    icon: ReactNode,
    extra = '',
    pressed?: boolean,
  ) => (
    <button
      className={`popout-button ${extra}`}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={!enabled}
      onClick={() => run(action)}
    >
      {icon}
    </button>
  );
  const main = (
    <>
      {button(
        'previous',
        'Vorheriger Titel',
        playing.canPrevious,
        <SkipBack size={16} fill="currentColor" />,
      )}
      {button(
        'toggle',
        playing.playing ? 'Pause' : 'Abspielen',
        playing.canToggle,
        playing.playing ? (
          <Pause size={16} fill="currentColor" />
        ) : (
          <Play size={16} fill="currentColor" />
        ),
        'play',
      )}
      {button(
        'next',
        'Nächster Titel',
        playing.canNext,
        <SkipForward size={16} fill="currentColor" />,
      )}
    </>
  );
  const artist = failed ?? playing.artist;
  if (compact)
    return (
      <div className="popout-media compact">
        <Cover src={playing.cover} size={18} />
        <div className="popout-now">
          <b title={playing.title}>{playing.title}</b>
          <span title={`${playing.artist} · ${playing.app}`}>{artist || playing.app}</span>
        </div>
        {look.popoutSeek && <MiniProgress playing={playing} />}
      </div>
    );
  const repeatLabel =
    playing.repeat === 'one'
      ? 'Wiederholen: dieser Titel'
      : playing.repeat === 'all'
        ? 'Wiederholen: alle'
        : 'Wiederholen: aus';
  return (
    <>
      <div className="popout-media">
        <Cover src={playing.cover} size={28} />
        <div className={`popout-now ${look.popoutCenter ? '' : 'left'}`}>
          <b title={playing.title}>{playing.title}</b>
          {artist && <span title={artist}>{artist}</span>}
          <div className="popout-controls">
            {main}
            {look.popoutRepeat &&
              button(
                'repeat',
                repeatLabel,
                playing.canRepeat,
                playing.repeat === 'one' ? <Repeat1 size={15} /> : <Repeat size={15} />,
                playing.repeat && playing.repeat !== 'none' ? 'on' : '',
                playing.repeat === null ? undefined : playing.repeat !== 'none',
              )}
            {look.popoutShuffle &&
              button(
                'shuffle',
                playing.shuffle ? 'Zufall: an' : 'Zufall: aus',
                playing.canShuffle,
                <Shuffle size={15} />,
                playing.shuffle ? 'on' : '',
                playing.shuffle ?? undefined,
              )}
            {look.popoutPlayerName && (
              <button className="popout-app" title={`${playing.app} öffnen`} onClick={open}>
                <Music2 size={12} />
                <span>{playing.app}</span>
              </button>
            )}
          </div>
        </div>
      </div>
      {look.popoutSeek && <Seekbar playing={playing} />}
    </>
  );
}

/** "Als Nächstes": small, after a track ended and the next one started by itself. */
function UpNextPopout({ playing }: { playing: Playing }) {
  return (
    <div className="popout-row upnext">
      <span className="popout-label">
        <Music2 size={14} /> Als Nächstes:
      </span>
      <Cover src={playing.cover} size={16} />
      <span className="popout-text">
        <b title={playing.title}>{playing.title}</b>
        {playing.artist && <small>{playing.artist}</small>}
      </span>
    </div>
  );
}

/**
 * No × on popouts (user's wish: they are switched off in the settings only). A notice without a
 * button of its own goes on a click on it; clicks on its buttons do what they say (and put it away
 * themselves), so a notice set to "Immer anzeigen" always has a way out.
 */
const dismissOn = (dismiss: () => void) => (event: MouseEvent<HTMLElement>) => {
  if (!(event.target as HTMLElement).closest('button')) dismiss();
};

/**
 * The colours of the popout (a setting): blank.'s scheme, a fixed dark one, or the light popout
 * colours (tokens.css, data-popout-look).
 */
function lookOf(look: Preferences) {
  if (look.popoutTheme === 'light') return { light: true, theme: look.theme };
  if (look.popoutTheme === 'dark') return { light: false, theme: 'graphite' };
  return { light: false, theme: look.theme };
}

/**
 * The popout window's content, laid out like FluentFlyout: one notice at a time, the next one
 * after it. How long each kind stays is a setting (or until it is closed); while the mouse is on
 * it, or after a click in it, it stays. It fades in and out as set; hidden when none is left.
 */
const RELOADED_KEY = 'blank.popout.reloaded';
const RELOAD_AT_MOST_MS = 60_000;

/**
 * The popout failed to draw (the error is in the log): it hides and loads itself again for the
 * next notice; at most once a minute, so a notice that always fails cannot loop.
 */
export function PopoutCrashed() {
  useEffect(() => {
    void hidePopout().catch(() => undefined);
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(RELOADED_KEY)) || 0;
    } catch {
      // No storage: reload anyway, the minute cannot be kept.
    }
    if (Date.now() - last < RELOAD_AT_MOST_MS) return;
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
      } catch {
        // See above.
      }
      window.location.reload();
    }, 1000);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}

export function PopoutWindow() {
  const [queue, setQueue] = useState<PopoutItem[]>([]);
  /** undefined: not read yet. */
  const [media, setMedia] = useState<NowPlaying | null | undefined>(undefined);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [look, setLook] = useState(readLook);
  const [hovered, setHovered] = useState(false);
  /** Counts clicks and keys in the popout: each one starts its time again. */
  const [touched, setTouched] = useState(0);
  /** The last popout, kept on screen while it fades out. */
  const [leaving, setLeaving] = useState<PopoutItem | null>(null);
  /** The popout whose window is on screen: only then it slides in. */
  const [presented, setPresented] = useState<string | null>(null);
  /** A compact music popout with the mouse on it shows the full one (user's wish). */
  const [expanded, setExpanded] = useState(false);
  const foldTimer = useRef<number | undefined>(undefined);
  /** The card as last put on screen (size, compact or not), and the morph running now. */
  const shownSize = useRef<{ key: string; width: number; height: number; compact: boolean } | null>(
    null,
  );
  const morph = useRef<Animation | null>(null);
  const [sample, setSample] = useState<Sample>(() => ({
    playing: true,
    repeat: 'none',
    shuffle: false,
    position: 72,
    at: Date.now(),
  }));
  const wasHovered = useRef(false);
  const card = useRef<HTMLDivElement>(null);
  const shown = useRef(false);
  const lastShown = useRef<PopoutItem | null>(null);
  const current = queue[0];
  const currentKey = current ? `${current.kind}-${current.id}` : null;
  const { popoutScreen, popoutSeek } = look;
  // In the taskbar (a setting): at its left end, always the slim row, never Acrylic. Which edge
  // it keeps to is known once it was placed (a taskbar at the top: from above).
  const inTaskbar = look.popoutTaskbar;
  const popoutCompact = look.popoutCompact || inTaskbar;
  const acrylicOn = look.popoutAcrylic && !inTaskbar;
  const [taskbarPlace, setTaskbarPlace] = useState<{
    edge: 'top' | 'bottom';
    side: 'left' | 'right';
    light: boolean;
  } | null>(null);
  const popoutPlace =
    inTaskbar && taskbarPlace
      ? (`${taskbarPlace.edge}-${taskbarPlace.side}` as const)
      : look.popoutPlace;
  const compactNow = popoutCompact && (!expanded || inTaskbar);
  // Sliding in and out: blank.'s "Animationen" and the speed decide; Windows' animation effects
  // only if "Auch wenn Windows-Animationen aus sind" is off.
  const systemCalm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fadeMs =
    look.motion && (look.popoutMotionAlways || !systemCalm) ? FADE_MS * look.popoutSpeed : 0;
  // Without Acrylic the page draws the frame and shadow itself and keeps an edge for the shadow.
  const inset = acrylicOn ? 0 : INSET;
  // With Acrylic Windows draws the whole window as the card, so there it just changes size.
  const morphs = fadeMs > 0 && !acrylicOn;

  // In the taskbar: its colours (Windows light or dark, neutral), not the popout colour setting.
  const { light, theme } = inTaskbar
    ? { light: taskbarPlace?.light ?? false, theme: 'graphite' as const }
    : lookOf(look);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add('popout-mode');
    root.classList.toggle('acrylic', acrylicOn);
    root.classList.toggle('in-taskbar', inTaskbar);
    root.style.setProperty('--popout-opacity', `${look.popoutOpacity}%`);
    root.style.setProperty('--inset', `${inset}px`);
    if (light) root.dataset.popoutLook = 'light';
    else delete root.dataset.popoutLook;
    root.dataset.theme = theme;
    // The card keeps to the screen's edge: growing (a compact popout opening) goes away from it.
    root.classList.toggle('top', popoutPlace.startsWith('top'));
    root.dataset.side = popoutPlace.split('-')[1];
    // Motion as the popout settings say (also with Windows' animation effects off, if chosen):
    // on, the popout's own animations run; off, nothing moves (app.css).
    root.dataset.motion = fadeMs > 0 ? 'normal' : 'off';
    root.classList.toggle('popout-motion', fadeMs > 0);
    root.style.setProperty('--ease-spring', bouncyCurve.easing);
  }, [light, theme, acrylicOn, inTaskbar, look.popoutOpacity, inset, popoutPlace, fadeMs]);

  // Second way to notice the mouse is gone: it left the popout window altogether. Then an opened
  // compact popout folds in any case (once it stayed open although the mouse had left).
  useEffect(() => {
    const root = document.documentElement;
    const left = () => {
      setHovered(false);
      window.clearTimeout(foldTimer.current);
      foldTimer.current = window.setTimeout(() => setExpanded(false), FOLD_MS);
    };
    root.addEventListener('mouseleave', left);
    return () => {
      root.removeEventListener('mouseleave', left);
      window.clearTimeout(foldTimer.current);
    };
  }, []);

  // New settings apply at once, also to the popout on screen.
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === preferencesKey) setLook(readLook());
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);

  useEffect(() => {
    const add = (item: PopoutItem) => {
      setLook(readLook());
      setQueue((list) => enqueue(list, item));
    };
    const stops = [
      onPopoutItem(add),
      // Its screen turned full screen: already hidden; everything shown goes, and it hides as usual.
      onPopoutFullScreen(() => {
        setQueue([]);
        setLeaving(null);
        void hidePopout();
      }),
      // The own mix changed while its popout may be open: new state in place, same time left.
      onPopoutUpdate((item) => {
        if (item.kind !== 'mix') return;
        setQueue((list) =>
          item.ended
            ? list.filter((i) => i.kind !== 'mix')
            : list.map((i) =>
                i.kind === 'mix' ? { ...item, id: i.id, upNext: i.upNext && item.upNext } : i,
              ),
        );
      }),
    ];
    void takePendingPopouts().then((items) => items.forEach(add));
    return () => stops.forEach((stop) => stop());
  }, []);

  useEffect(() => {
    void readMedia?.().then(setMedia);
    return onMediaChanged?.(setMedia);
  }, []);

  // The progress of another player's track: read when its popout appears and after pause/resume;
  // also for a compact one, so hovering shows the bar at once.
  const mediaKey = media ? `${media.app}\n${media.title}\n${media.playing}` : '';
  const wantsTimeline = current?.kind === 'music' && !current.upNext && popoutSeek;
  useEffect(() => {
    setTimeline(null);
    if (!wantsTimeline || !readTimeline) return;
    let active = true;
    void readTimeline().then((t) => active && setTimeline(t));
    return () => {
      active = false;
    };
  }, [currentKey, mediaKey, wantsTimeline]);

  const next = () => setQueue((list) => list.slice(1));
  const close = (item: PopoutItem) => {
    if (item.kind === 'live' || item.kind === 'warning') void popoutDone(item.kind, item.id);
    next();
  };

  // While a player reports "nothing" for a moment, the last track stays on screen; only after a
  // few seconds without anything is a music popout over.
  const lastMedia = useRef<NowPlaying | null>(null);
  if (media) lastMedia.current = media;
  const shownMedia = media ?? lastMedia.current;
  useEffect(() => {
    if (current?.kind !== 'music' || media !== null) return;
    const timer = window.setTimeout(next, NOTHING_PLAYS_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentKey covers the item
  }, [currentKey, media]);

  const playingOf = (item: PopoutItem): Playing | null =>
    item.kind === 'mix'
      ? fromMix(item)
      : item.kind === 'music' && shownMedia
        ? fromSystem(shownMedia, timeline)
        : item.kind === 'preview' && item.topic === 'music'
          ? fromPreview(sample, setSample)
          : null;
  const shownItem = current ?? leaving;
  const playing = shownItem ? playingOf(shownItem) : null;
  const coverColor = useCoverColor(playing?.cover ?? null);

  const widthOf = (item: PopoutItem) => {
    if (item.kind === 'aram') return WIDTH.aram;
    if (item.kind === 'champ') return WIDTH.champ;
    if (isUpNext(item)) return inTaskbar ? WIDTH.taskbar : WIDTH.upNext;
    if (!showsMusic(item)) return inTaskbar ? WIDTH.taskbar : WIDTH.notice;
    if (compactNow) return inTaskbar ? WIDTH.taskbar : WIDTH.compact;
    const full =
      WIDTH.normal + WIDTH.button * (Number(look.popoutRepeat) + Number(look.popoutShuffle));
    // Opened by hovering a compact one: never narrower, so the mouse stays on it.
    return popoutCompact ? Math.max(full, WIDTH.compact) : full;
  };

  // Show, resize (next notice, other layout, progress bar, opening), or fade out and hide.
  const ready = current !== undefined && (current.kind !== 'music' || !!shownMedia);
  const seekShown =
    popoutSeek &&
    !compactNow &&
    current !== undefined &&
    showsMusic(current) &&
    !isUpNext(current) &&
    (current.kind === 'mix' ? !!current.duration : current.kind === 'preview' || !!timeline);
  const width = current ? widthOf(current) : WIDTH.notice;
  // The ARAM card is too large for the taskbar: at that end, above it, like a normal popout.
  const taskbarCard = inTaskbar && !isCard(current);
  // A compact music popout can open under the mouse. Its window has room to open into and a
  // region shows only the card, so opening and folding never resize the window: a resize briefly
  // showed the old picture at the wrong place (the card jumped; user's report "wackelt").
  // Not with Acrylic, where Windows draws the whole window as the card.
  const roomy =
    !!current && popoutCompact && showsMusic(current) && !isUpNext(current) && !acrylicOn;
  const openWidth = Math.max(
    WIDTH.normal + WIDTH.button * (Number(look.popoutRepeat) + Number(look.popoutShuffle)),
    WIDTH.compact,
  );
  /** The panel above a row in the taskbar is open: the whole window must take the mouse. */
  const panelShown = useRef(false);
  panelShown.current = inTaskbar && expanded;
  /** The window of a roomy popout (CSS px, without the edge) and whose it is. */
  const room = useRef<{ key: string; width: number; height: number } | null>(null);
  /** The whole roomy window as a region (a panel above the row in the taskbar is open). */
  const wholeWindow = (): [number, number, number, number] | null => {
    const r = room.current;
    return r ? [0, 0, r.width + 2 * inset, r.height + 2 * inset] : null;
  };
  /** Where the card is in a roomy window, with the edge for its shadow (it keeps to the edge). */
  const regionOf = (size: { width: number; height: number }) => {
    const r = room.current!;
    const [windowW, windowH] = [r.width + 2 * inset, r.height + 2 * inset];
    const side = popoutPlace.split('-')[1];
    const x =
      side === 'left'
        ? 0
        : side === 'right'
          ? windowW - size.width - 2 * inset
          : (windowW - size.width) / 2 - inset;
    const y = popoutPlace.startsWith('top') ? 0 : windowH - size.height - 2 * inset;
    return [x, y, size.width + 2 * inset, size.height + 2 * inset] as [
      number,
      number,
      number,
      number,
    ];
  };

  // Before the next paint: opening a compact popout starts at once.
  useLayoutEffect(() => {
    // A morph still running ends where it is now (it may go on from there).
    const element = card.current;
    const running = morph.current;
    const now =
      running && element ? { width: element.offsetWidth, height: element.offsetHeight } : null;
    running?.cancel();
    morph.current = null;
    element?.classList.remove('morphing');
    if (!currentKey) {
      setExpanded(false);
      shownSize.current = null;
      room.current = null;
      if (!shown.current) return;
      shown.current = false;
      let cancelled = false;
      void (async () => {
        if (fadeMs > 0 && lastShown.current) {
          setLeaving(lastShown.current);
          await wait(fadeMs);
        }
        if (cancelled) return;
        setLeaving(null);
        await hidePopout();
      })();
      return () => {
        cancelled = true;
      };
    }
    if (!ready) return;
    setLeaving(null);
    let cancelled = false;

    // Opening or folding the popout on screen: the card changes from its size on screen to the
    // new one; with motion on it morphs (the content keeps to the screen's edge meanwhile).
    const before = shownSize.current;
    const toggled =
      !!element && shown.current && before?.key === currentKey && before.compact !== compactNow;
    const natural = element ? { width, height: Math.ceil(element.offsetHeight) } : null;
    let animation: Animation | null = null;
    if (toggled && morphs && natural && element && before) {
      const from = now ?? before;
      element.classList.add('morphing');
      animation = element.animate(
        [
          { width: `${from.width}px`, height: `${from.height}px` },
          { width: `${natural.width}px`, height: `${natural.height}px` },
        ],
        { duration: MORPH_MS, easing: MORPH_EASING },
      );
      morph.current = animation;
      // The content of the other layout fades in while the card changes its size.
      for (const child of element.children)
        child.animate([{ opacity: 0.25 }, { opacity: 1 }], {
          duration: MORPH_MS,
          easing: 'ease-out',
        });
      const own = animation;
      own.finished.then(
        () => {
          if (morph.current !== own) return;
          morph.current = null;
          element.classList.remove('morphing');
        },
        () => undefined,
      );
    }

    void (async () => {
      // The hidden page does not draw; let it draw before the window appears. A window on
      // screen only changes its size: at once, the new layout is already measured.
      if (!shown.current) {
        await preparePopout();
        await nextFrame();
        await nextFrame();
      }
      if (cancelled || !card.current) return;
      const size =
        toggled && natural ? natural : { width, height: Math.ceil(card.current.offsetHeight) };
      const done = () => {
        shown.current = true;
        setPresented(currentKey);
        shownSize.current = { key: currentKey, ...size, compact: compactNow };
      };
      if (!roomy) {
        const edge = await presentPopout(
          size.width + 2 * inset,
          size.height + 2 * inset,
          popoutPlace,
          popoutScreen,
          inset,
          taskbarCard ? size.height : null,
        );
        if (taskbarCard) setTaskbarPlace(edge);
        return done();
      }
      const r = room.current;
      if (!r || r.key !== currentKey || size.width > r.width || size.height > r.height) {
        // A new window (or one too small): the card's size plus room to open into.
        const next = {
          key: currentKey,
          width: openWidth,
          height: size.height + (inTaskbar ? ROOM_TASKBAR : ROOM),
        };
        const edge = await presentPopout(
          next.width + 2 * inset,
          next.height + 2 * inset,
          popoutPlace,
          popoutScreen,
          inset,
          inTaskbar ? size.height : null,
        );
        if (inTaskbar) setTaskbarPlace(edge);
        room.current = next;
      }
      if (cancelled) return;
      // Growing: the region at once; folding: only once the card is small again.
      if (animation && before && size.height < before.height) {
        done();
        try {
          await animation.finished;
        } catch {
          return;
        }
        if (cancelled) return;
      } else done();
      await setPopoutRegion(panelShown.current ? wholeWindow() : regionOf(size));
    })().catch((error: unknown) => console.error('Popout failed', error));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- placed again only when what is shown changes
  }, [
    currentKey,
    ready,
    seekShown,
    width,
    inset,
    compactNow,
    popoutPlace,
    popoutScreen,
    morphs,
    roomy,
    openWidth,
    inTaskbar,
    taskbarCard,
  ]);
  if (current) lastShown.current = current;

  // Any other change of the card's height (a setting, the progress bar) resizes the window too;
  // in a roomy window only its region, as long as the card fits.
  const placement = useRef({
    width,
    inset,
    popoutPlace,
    popoutScreen,
    roomy,
    regionOf,
    wholeWindow,
    inTaskbar: taskbarCard,
  });
  placement.current = {
    width,
    inset,
    popoutPlace,
    popoutScreen,
    roomy,
    regionOf,
    wholeWindow,
    inTaskbar: taskbarCard,
  };
  useEffect(() => {
    const element = card.current;
    if (!element) return;
    let last = Math.ceil(element.offsetHeight);
    const observer = new ResizeObserver(() => {
      const height = Math.ceil(element.offsetHeight);
      if (!shown.current || height === last) return;
      last = height;
      // A morph changes the size every frame; its window sizes are set by the effect above.
      if (morph.current) return;
      if (shownSize.current) shownSize.current = { ...shownSize.current, height };
      const p = placement.current;
      const r = room.current;
      if (p.roomy && r && height <= r.height && p.width <= r.width) {
        void setPopoutRegion(
          panelShown.current ? p.wholeWindow() : p.regionOf({ width: p.width, height }),
        ).catch(() => undefined);
        return;
      }
      room.current = null;
      void presentPopout(
        p.width + 2 * p.inset,
        height + 2 * p.inset,
        p.popoutPlace,
        p.popoutScreen,
        p.inset,
        p.inTaskbar ? height : null,
      ).catch(() => undefined);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [currentKey]);

  // Windows shows what a region uncovers only if the page draws there afterwards: freeing the
  // window when the mouse arrives lets the mouse in at once, but the panel appeared only after the
  // region was set once more (found by measuring). So again once the panel was drawn.
  const panelVisible = inTaskbar && expanded;
  useEffect(() => {
    if (!panelVisible) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (panelShown.current) void setPopoutRegion(wholeWindow()).catch(() => undefined);
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the panel opens or closes
  }, [panelVisible]);

  // Each popout goes after its time (a setting; or it stays until closed). Not while the mouse is
  // on it; after it leaves, or after a click in it, it stays at least a few seconds more.
  const seconds = !current
    ? 0
    : current.kind === 'preview'
      ? PREVIEW_SECONDS
      : isUpNext(current)
        ? look.popoutUpNextSeconds
        : isMusic(current)
          ? look.popoutMusicAlways
            ? 0
            : look.popoutMusicSeconds
          : look.popoutNoticeAlways
            ? 0
            : current.kind === 'aram'
              ? Math.max(ARAM_SECONDS, look.popoutNoticeSeconds)
              : current.kind === 'champ'
                ? Math.max(CHAMP_SECONDS, look.popoutNoticeSeconds)
                : look.popoutNoticeSeconds;
  // Every change in the settings starts the preview's time again.
  const stamp = current?.kind === 'preview' ? current.stamp : 0;
  useEffect(() => {
    wasHovered.current = false;
    setTouched(0);
  }, [currentKey]);
  /** How long the popout still stays, shown as a bar that runs out (null: it stays). */
  const [stay, setStay] = useState<{ ms: number; at: number } | null>(null);
  useEffect(() => {
    if (!current || hovered || seconds === 0) {
      setStay(null);
      return;
    }
    const full = seconds * 1000;
    const ms =
      wasHovered.current || touched > 0 ? Math.max(AFTER_HOVER_MS, Math.min(full, 5_000)) : full;
    setStay({ ms, at: Date.now() });
    const timer = window.setTimeout(next, ms);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the time runs from these triggers only
  }, [currentKey, hovered, seconds, touched, stamp]);

  if (!shownItem || (current && !ready)) return null;
  const item = shownItem;
  const easing = popoutEasings.find((e) => e.id === look.popoutEasing)?.curve ?? 'ease-out';
  const style = {
    width: `${widthOf(item)}px`,
    '--fade': `${fadeMs}ms`,
    '--grow': `${Math.round(fadeMs * 1.4)}ms`,
    '--ease': easing,
    // Slides in from the screen's edge: up from below, down from above.
    '--rise': `${popoutPlace.startsWith('top') ? -SLIDE : SLIDE}px`,
    ...(look.popoutCoverAccent && coverColor
      ? { '--accent': coverColor.fill, '--accent-ink': coverColor.ink }
      : {}),
    ...(coverColor ? { '--cover-color': coverColor.fill } : {}),
    ...(playing?.cover && look.popoutBackground === 'blur'
      ? { '--cover-image': `url("${playing.cover}")` }
      : {}),
  } as CSSProperties;
  const classes = [
    'popout',
    item.kind,
    playing && compactNow && !isUpNext(item) ? 'compact' : '',
    expanded && !inTaskbar ? 'opened' : '',
    expanded && inTaskbar && playing && !isUpNext(item) ? 'active' : '',
    isUpNext(item) ? 'small' : '',
    inTaskbar && !isCard(item) ? 'taskbar' : '',
    playing && !isUpNext(item) && look.popoutBackground !== 'none'
      ? `bg-${look.popoutBackground}`
      : '',
    fadeMs > 0
      ? leaving
        ? 'leave'
        : presented === `${item.kind}-${item.id}`
          ? 'enter'
          : 'waiting'
      : '',
  ];
  const hoverIn = () => {
    wasHovered.current = true;
    setHovered(true);
    window.clearTimeout(foldTimer.current);
    // Compact music opens at once into the full popout, with the bar to jump in the track.
    if (popoutCompact && playing && !isUpNext(item)) {
      setExpanded(true);
      // In the taskbar the panel opens above the row: the whole window takes the mouse now.
      if (inTaskbar) {
        panelShown.current = true;
        void setPopoutRegion(wholeWindow()).catch(() => undefined);
      }
    }
  };
  const hoverOut = () => {
    setHovered(false);
    window.clearTimeout(foldTimer.current);
    foldTimer.current = window.setTimeout(() => setExpanded(false), FOLD_MS);
  };
  // In the taskbar, hovered music opens a panel above the row like Windows' own flyouts (the row
  // stays in the taskbar). While it is open the whole window takes the mouse; afterwards only the row.
  const panelOpen = inTaskbar && expanded && !!playing && !isUpNext(item);
  const edgeTop = popoutPlace.startsWith('top');
  const side = popoutPlace.split('-')[1];
  const panel = inTaskbar && playing && !isUpNext(item) && (
    <AnimatePresence
      onExitComplete={() => {
        if (room.current && card.current && !panelShown.current)
          void setPopoutRegion(
            regionOf({ width, height: Math.ceil(card.current.offsetHeight) }),
          ).catch(() => undefined);
      }}
    >
      {panelOpen && (
        <motion.div
          key="panel"
          className="popout taskbar-panel"
          style={{
            ...style,
            width: `${openWidth}px`,
            transformOrigin: `${side === 'center' ? 'center' : side} ${edgeTop ? 'top' : 'bottom'}`,
          }}
          initial={{ opacity: 0, y: edgeTop ? -14 : 14, scale: 0.94 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
            transition: fadeMs > 0 ? spring('snappy') : { duration: 0 },
          }}
          exit={{
            opacity: 0,
            y: edgeTop ? -8 : 8,
            scale: 0.97,
            transition: { duration: fadeMs > 0 ? 0.14 : 0 },
          }}
          onMouseEnter={hoverIn}
          onMouseLeave={hoverOut}
          onPointerDown={() => setTouched((n) => n + 1)}
        >
          <MusicPopout playing={playing} look={look} compact={false} />
        </motion.div>
      )}
    </AnimatePresence>
  );
  const row = (
    <div
      ref={card}
      key={`${item.kind}-${item.id}`}
      className={classes.filter(Boolean).join(' ')}
      style={style}
      role="status"
      aria-live="polite"
      onMouseEnter={hoverIn}
      onMouseLeave={hoverOut}
      onPointerDown={() => setTouched((n) => n + 1)}
      onKeyDown={() => setTouched((n) => n + 1)}
    >
      {fadeMs > 0 && stay && current && !hovered && (
        <span
          className="popout-timer"
          key={stay.at}
          style={{ '--stay': `${stay.ms}ms` } as CSSProperties}
          aria-hidden
        />
      )}
      {playing &&
        (isUpNext(item) ? (
          <UpNextPopout playing={playing} />
        ) : (
          <MusicPopout playing={playing} look={look} compact={compactNow} />
        ))}
      {item.kind === 'preview' && item.topic === 'notice' && (
        <div className="popout-row" title="Klick: ausblenden" onClick={dismissOn(next)}>
          <span className="popout-label">
            <Radio size={14} /> Live:
          </span>
          <ChannelAvatar login="vorschau" />
          <span className="popout-text">
            <b>Beispielkanal</b>
            <small>So sehen deine Meldungen aus</small>
          </span>
        </div>
      )}
      {item.kind === 'test' && (
        <div className="popout-row" title="Klick: ausblenden" onClick={dismissOn(next)}>
          <span className="popout-icon">
            <Bell size={20} />
          </span>
          <span className="popout-text">
            <b>So erscheinen Popouts</b>
            <small>
              {inTaskbar
                ? 'In der Taskleiste'
                : popoutPlaces.find((p) => p.id === popoutPlace)?.name}{' '}
              · {popoutScreens.find((s) => s.id === popoutScreen)?.name}
            </small>
          </span>
        </div>
      )}
      {item.kind === 'info' && (
        <div className="popout-row" title="Klick: ausblenden" onClick={dismissOn(next)}>
          <span className="popout-icon">
            <Info size={20} />
          </span>
          <span className="popout-text">
            <b>{item.title}</b>
            <small>{item.detail}</small>
          </span>
        </div>
      )}
      {item.kind === 'live' && (
        <div className="popout-row">
          <button
            className="popout-open"
            title="Stream öffnen"
            onClick={() => {
              void openStream(item.login).catch(() => undefined);
              close(item);
            }}
          >
            <span className="popout-label">
              <Radio size={14} /> Live:
            </span>
            <ChannelAvatar login={item.login} imageUrl={item.imageUrl} />
            <span className="popout-text">
              <b>{item.displayName}</b>
              {item.game && <small>{item.game}</small>}
            </span>
          </button>
        </div>
      )}
      {item.kind === 'warning' && (
        <div
          className="popout-row"
          title="Klick: ausblenden"
          onClick={dismissOn(() => close(item))}
        >
          <span className="popout-icon warning">
            {item.battery ? <BatteryLow size={20} /> : <Gauge size={20} />}
          </span>
          <span className="popout-text">
            <b>{item.title}</b>
            <small>{item.detail}</small>
            <span className="popout-actions">
              <button
                className="popout-link"
                onClick={() => {
                  void openApp(item.page);
                  close(item);
                }}
              >
                Details
              </button>
              {item.culprit && <CloseProgramButton app={item.culprit} onDone={() => close(item)} />}
            </span>
          </span>
        </div>
      )}
      {item.kind === 'aram' && (
        <AramResultCard
          entry={item.entry}
          augments={item.augments}
          highlight={item.highlight}
          rank={item.rank ?? null}
          run={fadeMs === 0 ? 'off' : presented === `${item.kind}-${item.id}` ? 'play' : 'wait'}
          onOpen={() => {
            void openApp('rank');
            next();
          }}
        />
      )}
      {item.kind === 'champ' && <ChampCard view={item.view} onDismiss={next} />}
      {queue.length > 1 && <span className="popout-more">+{queue.length - 1}</span>}
    </div>
  );
  // The panel opens away from the taskbar's edge: above the row, or below it at the top.
  return edgeTop ? (
    <>
      {row}
      {panel}
    </>
  ) : (
    <>
      {panel}
      {row}
    </>
  );
}
