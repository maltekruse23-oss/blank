import { isPetFigureId, type PetFigureId } from '../pet/figures';
import { isThemeId, type ThemeId } from './themes';

export type Preferences = {
  compact: boolean;
  motion: boolean;
  sound: boolean;
  /** Live sound volume, 0–100. */
  volume: number;
  theme: ThemeId;
  /** Figure of the pet mode. */
  pet: PetFigureId;
  /** Do not disturb: no sound, the pet does not come to the front. Switched by hand. */
  quiet: boolean;
  batteryWarning: boolean;
  loadWarning: boolean;
};

export const defaultPreferences: Preferences = {
  compact: false,
  motion: true,
  sound: true,
  volume: 70,
  theme: 'forest',
  pet: 'minimal',
  quiet: false,
  batteryWarning: true,
  loadWarning: true,
};

/**
 * Preferences from stored or imported data; null when it is not a preferences object. Fields
 * added later (or invalid ones) fall back to the defaults, so older data stays usable.
 */
export function readPreferences(raw: unknown): Preferences | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.compact !== 'boolean' || typeof data.motion !== 'boolean') return null;
  const flag = (key: 'sound' | 'quiet' | 'batteryWarning' | 'loadWarning') =>
    typeof data[key] === 'boolean' ? (data[key] as boolean) : defaultPreferences[key];
  const volume = data.volume;
  return {
    compact: data.compact,
    motion: data.motion,
    sound: flag('sound'),
    volume:
      typeof volume === 'number' && Number.isInteger(volume) && volume >= 0 && volume <= 100
        ? volume
        : defaultPreferences.volume,
    theme: isThemeId(data.theme) ? data.theme : defaultPreferences.theme,
    pet: isPetFigureId(data.pet) ? data.pet : defaultPreferences.pet,
    quiet: flag('quiet'),
    batteryWarning: flag('batteryWarning'),
    loadWarning: flag('loadWarning'),
  };
}
