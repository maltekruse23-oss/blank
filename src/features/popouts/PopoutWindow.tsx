import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
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
  X,
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
  onPopoutItem,
  onPopoutUpdate,
  openApp,
  openStream,
  popoutDone,
  preparePopout,
  presentPopout,
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
const WIDTH = { normal: 360, button: 38, compact: 380, upNext: 330, notice: 360 };

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

/**
 * Notices (live, warnings, notes, sample) in order of arrival, then the one music popout: a notice
 * never waits behind music that stays open. Only the newest music state and one sample count.
 */
function enqueue(list: PopoutItem[], item: PopoutItem) {
  const same = (i: PopoutItem) =>
    isMusic(item) ? isMusic(i) : item.kind === 'test' && i.kind === 'test';
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

function Cover({ src, size }: { src: string | null; size: number }) {
  return src ? (
    <img className="popout-cover" src={src} alt="" />
  ) : (
    <span className="popout-cover empty">
      <Music2 size={size} />
    </span>
  );
}

function MusicPopout({
  playing,
  look,
  onClose,
}: {
  playing: Playing;
  look: Preferences;
  onClose: () => void;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const run = (action: MediaAction) => {
    setFailed(null);
    playing.run(action).catch(() => setFailed(`${playing.app} reagiert nicht`));
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
  if (look.popoutCompact)
    return (
      <div className="popout-media compact">
        <Cover src={playing.cover} size={18} />
        <div className="popout-now">
          <b title={playing.title}>{playing.title}</b>
          <span title={`${playing.artist} · ${playing.app}`}>{artist || playing.app}</span>
        </div>
        <div className="popout-controls">{main}</div>
        <CloseButton onClick={onClose} />
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
      <CloseButton onClick={onClose} />
    </>
  );
}

/** "Als Nächstes": small, after a track ended and the next one started by itself. */
function UpNextPopout({ playing, onClose }: { playing: Playing; onClose: () => void }) {
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
      <CloseButton onClick={onClose} />
    </div>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="popout-close" aria-label="Ausblenden" title="Ausblenden" onClick={onClick}>
      <X size={14} />
    </button>
  );
}

/** The design shown in the popout: blank.'s, or a fixed dark or light one (a setting). */
function lookOf(look: Preferences) {
  if (look.popoutTheme === 'light') return { design: 'clear', theme: look.theme };
  if (look.popoutTheme === 'dark') return { design: 'classic', theme: 'graphite' };
  return { design: look.design, theme: look.theme };
}

/**
 * The popout window's content, laid out like FluentFlyout: one notice at a time, the next one
 * after it. How long each kind stays is a setting (or until it is closed); while the mouse is on
 * it, or after a click in it, it stays. It fades in and out as set; hidden when none is left.
 */
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
  const wasHovered = useRef(false);
  const card = useRef<HTMLDivElement>(null);
  const shown = useRef(false);
  const lastShown = useRef<PopoutItem | null>(null);
  const current = queue[0];
  const currentKey = current ? `${current.kind}-${current.id}` : null;
  const { popoutPlace, popoutScreen, popoutCompact, popoutSeek } = look;
  // Sliding in and out: blank.'s "Animationen" and the speed decide; Windows' animation effects
  // only if "Auch wenn Windows-Animationen aus sind" is off.
  const systemCalm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fadeMs =
    look.motion && (look.popoutMotionAlways || !systemCalm) ? FADE_MS * look.popoutSpeed : 0;
  // Without Acrylic the page draws the frame and shadow itself and keeps an edge for the shadow.
  const inset = look.popoutAcrylic ? 0 : INSET;

  const { design, theme } = lookOf(look);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add('popout-mode');
    root.classList.toggle('acrylic', look.popoutAcrylic);
    root.style.setProperty('--popout-opacity', `${look.popoutOpacity}%`);
    root.style.setProperty('--inset', `${inset}px`);
    root.dataset.design = design;
    root.dataset.theme = theme;
  }, [design, theme, look.popoutAcrylic, look.popoutOpacity, inset]);

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

  // The progress of another player's track: read when its popout appears and after pause/resume.
  const mediaKey = media ? `${media.app}\n${media.title}\n${media.playing}` : '';
  const wantsTimeline =
    current?.kind === 'music' && !current.upNext && popoutSeek && !popoutCompact;
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
  }, [currentKey, media]);

  const playingOf = (item: PopoutItem): Playing | null =>
    item.kind === 'mix'
      ? fromMix(item)
      : item.kind === 'music' && shownMedia
        ? fromSystem(shownMedia, timeline)
        : null;
  const shownItem = current ?? leaving;
  const playing = shownItem ? playingOf(shownItem) : null;
  const coverColor = useCoverColor(playing?.cover ?? null);

  const widthOf = (item: PopoutItem) => {
    if (isUpNext(item)) return WIDTH.upNext;
    if (!isMusic(item)) return WIDTH.notice;
    if (look.popoutCompact) return WIDTH.compact;
    return WIDTH.normal + WIDTH.button * (Number(look.popoutRepeat) + Number(look.popoutShuffle));
  };

  // Show, resize (next notice, other layout, progress bar), or fade out and hide.
  const ready = current !== undefined && (current.kind !== 'music' || !!shownMedia);
  const seekShown =
    popoutSeek &&
    !popoutCompact &&
    current !== undefined &&
    !isUpNext(current) &&
    (current.kind === 'mix' ? !!current.duration : !!timeline);
  const width = current ? widthOf(current) : WIDTH.notice;
  useEffect(() => {
    if (!currentKey) {
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
    void (async () => {
      // The hidden page does not draw; let it draw before the window appears.
      if (!shown.current) await preparePopout();
      await nextFrame();
      await nextFrame();
      if (cancelled || !card.current) return;
      await presentPopout(
        width + 2 * inset,
        Math.ceil(card.current.offsetHeight) + 2 * inset,
        popoutPlace,
        popoutScreen,
        inset,
      );
      shown.current = true;
      setPresented(currentKey);
    })().catch((error: unknown) => console.error('Popout failed', error));
    return () => {
      cancelled = true;
    };
  }, [currentKey, ready, seekShown, width, inset, popoutCompact, popoutPlace, popoutScreen]);
  if (current) lastShown.current = current;

  // Each popout goes after its time (a setting; or it stays until closed). Not while the mouse is
  // on it; after it leaves, or after a click in it, it stays at least a few seconds more.
  const seconds = !current
    ? 0
    : isUpNext(current)
      ? look.popoutUpNextSeconds
      : isMusic(current)
        ? look.popoutMusicAlways
          ? 0
          : look.popoutMusicSeconds
        : look.popoutNoticeAlways
          ? 0
          : look.popoutNoticeSeconds;
  useEffect(() => {
    wasHovered.current = false;
    setTouched(0);
  }, [currentKey]);
  useEffect(() => {
    if (!current || hovered || seconds === 0) return;
    const full = seconds * 1000;
    const timer = window.setTimeout(
      next,
      wasHovered.current || touched > 0 ? Math.max(AFTER_HOVER_MS, Math.min(full, 5_000)) : full,
    );
    return () => window.clearTimeout(timer);
  }, [currentKey, hovered, seconds, touched]);

  if (!shownItem || (current && !ready)) return null;
  const item = shownItem;
  const easing = popoutEasings.find((e) => e.id === look.popoutEasing)?.curve ?? 'ease-out';
  const style = {
    width: `${widthOf(item)}px`,
    '--fade': `${fadeMs}ms`,
    '--ease': easing,
    // Slides in from the screen's edge: up from below, down from above.
    '--rise': `${look.popoutPlace.startsWith('top') ? -SLIDE : SLIDE}px`,
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
    playing && look.popoutCompact && !isUpNext(item) ? 'compact' : '',
    isUpNext(item) ? 'small' : '',
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
  return (
    <div
      ref={card}
      key={`${item.kind}-${item.id}`}
      className={classes.filter(Boolean).join(' ')}
      style={style}
      role="status"
      aria-live="polite"
      onMouseEnter={() => {
        wasHovered.current = true;
        setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={() => setTouched((n) => n + 1)}
      onKeyDown={() => setTouched((n) => n + 1)}
    >
      {playing &&
        (isUpNext(item) ? (
          <UpNextPopout playing={playing} onClose={next} />
        ) : (
          <MusicPopout playing={playing} look={look} onClose={next} />
        ))}
      {item.kind === 'test' && (
        <div className="popout-row">
          <span className="popout-icon">
            <Bell size={20} />
          </span>
          <span className="popout-text">
            <b>So erscheinen Popouts</b>
            <small>
              {popoutPlaces.find((p) => p.id === popoutPlace)?.name} ·{' '}
              {popoutScreens.find((s) => s.id === popoutScreen)?.name}
            </small>
          </span>
          <CloseButton onClick={next} />
        </div>
      )}
      {item.kind === 'info' && (
        <div className="popout-row">
          <span className="popout-icon">
            <Info size={20} />
          </span>
          <span className="popout-text">
            <b>{item.title}</b>
            <small>{item.detail}</small>
          </span>
          <CloseButton onClick={next} />
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
          <CloseButton onClick={() => close(item)} />
        </div>
      )}
      {item.kind === 'warning' && (
        <div className="popout-row">
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
          <CloseButton onClick={() => close(item)} />
        </div>
      )}
      {queue.length > 1 && <span className="popout-more">+{queue.length - 1}</span>}
    </div>
  );
}
