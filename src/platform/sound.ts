// Notification sounds (went live, overload). The desktop app plays them natively
// (src-tauri/src/sound.rs, works regardless of WebView autoplay rules); the browser preview plays
// the same files.
import { invoke, isTauri } from '@tauri-apps/api/core';
import liveAlert from '../assets/live-alert.wav';
import warningAlert from '../assets/warning-alert.wav';

/**
 * Volume 0–100 from the settings; loudness grows with the square, as in the native player.
 * `sound`: the live notice, or the overload warning.
 */
export function playAlertSound(volume: number, sound: 'live' | 'warning' = 'live') {
  const level = Math.min(100, Math.max(0, Math.round(volume)));
  if (level === 0) return;
  if (isTauri()) {
    invoke('play_alert_sound', { volume: level, sound }).catch(() => undefined);
    return;
  }
  const audio = new Audio(sound === 'live' ? liveAlert : warningAlert);
  audio.volume = (level / 100) ** 2;
  audio.play().catch(() => undefined);
}
