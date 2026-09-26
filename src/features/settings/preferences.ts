import { isDesignId, type DesignId } from './designs';
import { isThemeId, type ThemeId } from './themes';
import {
  isPopoutBackground,
  isPopoutEasing,
  isPopoutFilter,
  isPopoutPlace,
  isPopoutScreen,
  isPopoutSpeed,
  isPopoutTheme,
  isSeconds,
  isTrayClick,
  readFilterApps,
  type PopoutBackground,
  type PopoutEasing,
  type PopoutFilter,
  type PopoutPlace,
  type PopoutScreen,
  type PopoutSpeed,
  type PopoutTheme,
  type TrayClick,
} from '../popouts/placement';

/** Where the preferences are stored (also read by the popout window). */
export const preferencesKey = 'blank.preferences.v1';

export type Preferences = {
  compact: boolean;
  motion: boolean;
  sound: boolean;
  /** Live sound volume, 0–100. */
  volume: number;
  theme: ThemeId;
  /** Overall look; "arena" brings its own colours, the scheme applies to "classic". */
  design: DesignId;
  /** Do not disturb: no sound and no popouts. Switched by hand. */
  quiet: boolean;
  batteryWarning: boolean;
  loadWarning: boolean;
  /** Looks for a new version on GitHub once a day; installing is always a click. */
  updateCheck: boolean;
  /** Popouts (src/features/popouts/) while blank. is not the active window; all switches below. */
  popouts: boolean;
  /** Music from any player and the own mix: each new track. */
  popoutMusic: boolean;
  /** Music also on pause and resume (e.g. media keys). */
  popoutMusicToggle: boolean;
  /** Seconds a music popout stays (1–30), unless it always stays (until closed). */
  popoutMusicSeconds: number;
  popoutMusicAlways: boolean;
  /** One slim row (cover, title, buttons) instead of the large music popout. */
  popoutCompact: boolean;
  /** Title and artist centred instead of left-aligned. */
  popoutCenter: boolean;
  /** Name of the playing app; a click on it opens the player. */
  popoutPlayerName: boolean;
  /** Progress bar with times under the music. */
  popoutSeek: boolean;
  popoutRepeat: boolean;
  popoutShuffle: boolean;
  /** When a player starts, other playing apps pause. */
  popoutPauseOthers: boolean;
  /** A small "Als Nächstes" popout when a track follows by itself. */
  popoutUpNext: boolean;
  popoutUpNextSeconds: number;
  popoutFilter: PopoutFilter;
  /** Apps for the filter, as media.rs names them ("Spotify", "Chrome"). */
  popoutApps: string[];
  popoutLive: boolean;
  popoutWarnings: boolean;
  /** Seconds a live notice, warning or note stays (1–30), unless it always stays. */
  popoutNoticeSeconds: number;
  popoutNoticeAlways: boolean;
  popoutTheme: PopoutTheme;
  popoutBackground: PopoutBackground;
  /** The cover's colour for buttons and bar instead of the design's accent. */
  popoutCoverAccent: boolean;
  /** Windows blurs what lies behind the popout (the blur appears without fading). */
  popoutAcrylic: boolean;
  /** How much of the popout's colour covers what lies behind it (20–100 %; below 100 see-through). */
  popoutOpacity: number;
  popoutSpeed: PopoutSpeed;
  popoutEasing: PopoutEasing;
  /** Popouts slide in and out even with Windows' animation effects off (user's wish). */
  popoutMotionAlways: boolean;
  /** Also over full-screen games, videos and presentations. */
  popoutFullscreen: boolean;
  /** Also while blank. itself is the active window. */
  popoutInFront: boolean;
  popoutPlace: PopoutPlace;
  popoutScreen: PopoutScreen;
  /** Left click on the icon in the notification area. */
  trayClick: TrayClick;
};

export const defaultPreferences: Preferences = {
  compact: false,
  motion: true,
  sound: true,
  volume: 70,
  theme: 'forest',
  design: 'classic',
  quiet: false,
  batteryWarning: true,
  loadWarning: true,
  updateCheck: true,
  popouts: true,
  popoutMusic: true,
  popoutMusicToggle: true,
  popoutMusicSeconds: 10,
  popoutMusicAlways: false,
  popoutCompact: false,
  popoutCenter: true,
  popoutPlayerName: true,
  popoutSeek: true,
  popoutRepeat: false,
  popoutShuffle: false,
  popoutPauseOthers: false,
  popoutUpNext: false,
  popoutUpNextSeconds: 3,
  popoutFilter: 'off',
  popoutApps: [],
  popoutLive: true,
  popoutWarnings: true,
  popoutNoticeSeconds: 10,
  popoutNoticeAlways: false,
  popoutTheme: 'app',
  popoutBackground: 'none',
  popoutCoverAccent: false,
  popoutAcrylic: false,
  // Slightly see-through, and gliding in and out (user's wish).
  popoutOpacity: 88,
  popoutSpeed: 1,
  popoutEasing: 'quad',
  popoutMotionAlways: true,
  popoutFullscreen: false,
  popoutInFront: false,
  popoutPlace: 'bottom-center',
  popoutScreen: 'primary',
  trayClick: 'app',
};

type Flag = {
  [K in keyof Preferences]: Preferences[K] extends boolean ? K : never;
}[keyof Preferences];

/**
 * Preferences from stored or imported data; null when it is not a preferences object. Fields
 * added later (or invalid ones) fall back to the defaults, so older data stays usable; fields
 * that no longer exist (the former pet figure) are ignored.
 */
export function readPreferences(raw: unknown): Preferences | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.compact !== 'boolean' || typeof data.motion !== 'boolean') return null;
  const flag = (key: Flag) =>
    typeof data[key] === 'boolean' ? (data[key] as boolean) : defaultPreferences[key];
  // Earlier versions stored one choice 5/10/20 s or 0 ("Immer") as popoutMusicTime and
  // popoutNoticeTime; it is taken over.
  const earlier = (key: 'popoutMusicTime' | 'popoutNoticeTime') => {
    const value = data[key];
    return typeof value === 'number' && [0, 5, 10, 20].includes(value) ? value : undefined;
  };
  const seconds = (key: 'popoutMusicSeconds' | 'popoutNoticeSeconds' | 'popoutUpNextSeconds') => {
    if (isSeconds(data[key])) return data[key];
    const old = earlier(key === 'popoutMusicSeconds' ? 'popoutMusicTime' : 'popoutNoticeTime');
    return key !== 'popoutUpNextSeconds' && old ? old : defaultPreferences[key];
  };
  const always = (key: 'popoutMusicAlways' | 'popoutNoticeAlways') =>
    typeof data[key] === 'boolean'
      ? (data[key] as boolean)
      : earlier(key === 'popoutMusicAlways' ? 'popoutMusicTime' : 'popoutNoticeTime') === 0;
  const pick = <T>(value: unknown, valid: (v: unknown) => v is T, fallback: T): T =>
    valid(value) ? value : fallback;
  const volume = data.volume;
  const opacity = data.popoutOpacity;
  const d = defaultPreferences;
  return {
    compact: data.compact,
    motion: data.motion,
    sound: flag('sound'),
    volume:
      typeof volume === 'number' && Number.isInteger(volume) && volume >= 0 && volume <= 100
        ? volume
        : d.volume,
    theme: pick(data.theme, isThemeId, d.theme),
    design: pick(data.design, isDesignId, d.design),
    quiet: flag('quiet'),
    batteryWarning: flag('batteryWarning'),
    loadWarning: flag('loadWarning'),
    updateCheck: flag('updateCheck'),
    popouts: flag('popouts'),
    popoutMusic: flag('popoutMusic'),
    popoutMusicToggle: flag('popoutMusicToggle'),
    popoutMusicSeconds: seconds('popoutMusicSeconds'),
    popoutMusicAlways: always('popoutMusicAlways'),
    popoutCompact: flag('popoutCompact'),
    popoutCenter: flag('popoutCenter'),
    popoutPlayerName: flag('popoutPlayerName'),
    popoutSeek: flag('popoutSeek'),
    popoutRepeat: flag('popoutRepeat'),
    popoutShuffle: flag('popoutShuffle'),
    popoutPauseOthers: flag('popoutPauseOthers'),
    popoutUpNext: flag('popoutUpNext'),
    popoutUpNextSeconds: seconds('popoutUpNextSeconds'),
    popoutFilter: pick(data.popoutFilter, isPopoutFilter, d.popoutFilter),
    popoutApps: readFilterApps(data.popoutApps),
    popoutLive: flag('popoutLive'),
    popoutWarnings: flag('popoutWarnings'),
    popoutNoticeSeconds: seconds('popoutNoticeSeconds'),
    popoutNoticeAlways: always('popoutNoticeAlways'),
    popoutTheme: pick(data.popoutTheme, isPopoutTheme, d.popoutTheme),
    popoutBackground: pick(data.popoutBackground, isPopoutBackground, d.popoutBackground),
    popoutCoverAccent: flag('popoutCoverAccent'),
    popoutAcrylic: flag('popoutAcrylic'),
    popoutOpacity:
      typeof opacity === 'number' && Number.isInteger(opacity) && opacity >= 20 && opacity <= 100
        ? opacity
        : d.popoutOpacity,
    popoutSpeed: pick(data.popoutSpeed, isPopoutSpeed, d.popoutSpeed),
    popoutEasing: pick(data.popoutEasing, isPopoutEasing, d.popoutEasing),
    popoutMotionAlways: flag('popoutMotionAlways'),
    popoutFullscreen: flag('popoutFullscreen'),
    popoutInFront: flag('popoutInFront'),
    popoutPlace: pick(data.popoutPlace, isPopoutPlace, d.popoutPlace),
    popoutScreen: pick(data.popoutScreen, isPopoutScreen, d.popoutScreen),
    trayClick: pick(data.trayClick, isTrayClick, d.trayClick),
  };
}
