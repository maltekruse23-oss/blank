// What plays in any app that reports to Windows (Spotify, browsers, …; src-tauri/src/media.rs).
// Desktop app only; null in the browser preview.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export type NowPlaying = {
  title: string;
  artist: string;
  /** Name of the playing app, e.g. "Spotify". */
  app: string;
  playing: boolean;
  /** Cover as a data: URL, if the app provides one. */
  cover: string | null;
  canPrevious: boolean;
  canNext: boolean;
  canToggle: boolean;
  /** Null when the player does not say. */
  repeat: 'none' | 'one' | 'all' | null;
  shuffle: boolean | null;
  canRepeat: boolean;
  canShuffle: boolean;
  /** Came by itself: the track before ran to its end. */
  byItself: boolean;
};

export type MediaAction = 'toggle' | 'next' | 'previous' | 'repeat' | 'shuffle';

/** Settings Rust needs itself: pause other players when one starts. */
export const mediaSettings = isTauri()
  ? (pauseOthers: boolean) => invoke<void>('media_settings', { pauseOthers })
  : null;

/** blank.'s own mix starts: other playing apps pause (with that setting). */
export const pauseOtherMedia = isTauri() ? () => invoke<void>('media_pause_others') : null;

/** Brings the playing app to the front (popout window only). */
export const openPlayer = isTauri() ? () => invoke<void>('media_open_player') : null;

/** Same track: a pause or a later cover is no new track. */
export const trackKey = (now: NowPlaying) => `${now.app}\n${now.title}\n${now.artist}`;

export const readMedia = isTauri() ? () => invoke<NowPlaying | null>('media_current') : null;

/** Every change of track, cover or play state; returns a function that stops listening. */
export const onMediaChanged = isTauri()
  ? (handler: (now: NowPlaying | null) => void) => {
      const unlisten = listen<NowPlaying | null>('media-changed', (e) => handler(e.payload));
      return () => void unlisten.then((stop) => stop());
    }
  : null;

export const controlMedia = isTauri()
  ? (action: MediaAction) => invoke<void>('media_control', { action })
  : null;

/** Progress of a track in seconds; `updatedAt`: when `position` was true (ms since 1970). */
export type Timeline = {
  position: number;
  duration: number;
  updatedAt: number;
  canSeek: boolean;
};

/** Read once when a popout shows the track; null for live streams and players without it. */
export const readTimeline = isTauri() ? () => invoke<Timeline | null>('media_timeline') : null;

export const seekMedia = isTauri()
  ? (seconds: number) => invoke<void>('media_seek', { seconds })
  : null;
