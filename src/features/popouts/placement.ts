// Choices of Settings → Popouts (after FluentFlyout's settings). Keep the ids of places and screens
// in sync with PLACES and SCREENS in src-tauri/src/flyout.rs.
export const popoutPlaces = [
  { id: 'top-left', name: 'Oben links' },
  { id: 'top-center', name: 'Oben Mitte' },
  { id: 'top-right', name: 'Oben rechts' },
  { id: 'bottom-left', name: 'Unten links' },
  { id: 'bottom-center', name: 'Unten Mitte' },
  { id: 'bottom-right', name: 'Unten rechts' },
] as const;

export const popoutScreens = [
  { id: 'primary', name: 'Hauptbildschirm', short: 'Haupt' },
  { id: 'second', name: 'Zweiter Bildschirm', short: 'Zweiter' },
  { id: 'cursor', name: 'Wo die Maus ist', short: 'Maus' },
  { id: 'focus', name: 'Wo das aktive Fenster ist', short: 'Aktives Fenster' },
] as const;

/** Colours: those of blank.'s design, or a fixed light or dark look. */
export const popoutThemes = [
  { id: 'app', name: 'Wie blank.' },
  { id: 'dark', name: 'Dunkel' },
  { id: 'light', name: 'Hell' },
] as const;

/** Background behind the music, drawn once (nothing moves). */
export const popoutBackgrounds = [
  { id: 'none', name: 'Keiner' },
  { id: 'glow', name: 'Cover-Schein' },
  { id: 'rising', name: 'Aufsteigender Schein' },
  { id: 'blur', name: 'Unscharfes Cover' },
] as const;

/** Speed of fading in and out (a factor of 200 ms); 0: no animation. */
export const popoutSpeeds = [
  { id: 0, name: 'Aus' },
  { id: 0.5, name: '0,5×' },
  { id: 1, name: '1×' },
  { id: 1.5, name: '1,5×' },
  { id: 2, name: '2×' },
] as const;

/** How the fading moves over time (CSS easing, all slowing down at the end). */
export const popoutEasings = [
  { id: 'linear', name: 'Gleichmäßig', curve: 'linear' },
  { id: 'sine', name: 'Sanft', curve: 'cubic-bezier(0.61, 1, 0.88, 1)' },
  { id: 'quad', name: 'Standard', curve: 'cubic-bezier(0.5, 1, 0.89, 1)' },
  { id: 'cubic', name: 'Kräftig', curve: 'cubic-bezier(0.33, 1, 0.68, 1)' },
] as const;

/** Which players count for music popouts. */
export const popoutFilters = [
  { id: 'off', name: 'Alle Apps' },
  { id: 'allow', name: 'Nur diese' },
  { id: 'block', name: 'Alle außer diesen' },
] as const;

/** Left click on the icon in the notification area. */
export const trayClicks = [
  { id: 'app', name: 'App öffnen' },
  { id: 'music', name: 'Musik zeigen' },
] as const;

export type PopoutPlace = (typeof popoutPlaces)[number]['id'];
export type PopoutScreen = (typeof popoutScreens)[number]['id'];
export type PopoutTheme = (typeof popoutThemes)[number]['id'];
export type PopoutBackground = (typeof popoutBackgrounds)[number]['id'];
export type PopoutSpeed = (typeof popoutSpeeds)[number]['id'];
export type PopoutEasing = (typeof popoutEasings)[number]['id'];
export type PopoutFilter = (typeof popoutFilters)[number]['id'];
export type TrayClick = (typeof trayClicks)[number]['id'];

const oneOf =
  <T extends { id: unknown }>(list: readonly T[]) =>
  (value: unknown): value is T['id'] =>
    list.some((entry) => entry.id === value);

export const isPopoutPlace = oneOf(popoutPlaces);
export const isPopoutScreen = oneOf(popoutScreens);
export const isPopoutTheme = oneOf(popoutThemes);
export const isPopoutBackground = oneOf(popoutBackgrounds);
export const isPopoutSpeed = oneOf(popoutSpeeds);
export const isPopoutEasing = oneOf(popoutEasings);
export const isPopoutFilter = oneOf(popoutFilters);
export const isTrayClick = oneOf(trayClicks);

/** Seconds a popout stays: 1–30. */
export const isSeconds = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 30;

export const MAX_FILTER_APPS = 30;
/** App names as media.rs gives them (e.g. "Spotify", "Chrome"). */
export function readFilterApps(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names = value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim().slice(0, 60))
    .filter(Boolean);
  return [...new Set(names)].slice(0, MAX_FILTER_APPS);
}

/** Whether a player's music may show, by the filter setting. */
export function passesFilter(app: string, filter: PopoutFilter, apps: string[]) {
  if (filter === 'off') return true;
  const listed = apps.some((a) => a.toLowerCase() === app.toLowerCase());
  return filter === 'allow' ? listed : !listed;
}
