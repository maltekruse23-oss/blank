import { bouncyCurve, spring } from '../../design/motion';
import { AnimatePresence, motion } from 'motion/react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import { BatteryLow, Bell, Gauge, Info, Radio } from 'lucide-react';
import { ChannelAvatar } from '../../components/ui';
import {
  onMediaChanged,
  readMedia,
  readTimeline,
  type NowPlaying,
  type Timeline,
} from '../../adapters/media';
import {
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
import { MusicPopout, UpNextPopout } from './MusicPopout';
import {
  fromMix,
  fromPreview,
  fromSystem,
  useCoverColor,
  type Playing,
  type Sample,
} from './playing';

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

export { PopoutCrashed } from './PopoutCrashed';

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
