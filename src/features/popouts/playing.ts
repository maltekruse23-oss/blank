import { useEffect, useState } from 'react';
import {
  controlMedia,
  openPlayer,
  seekMedia,
  type MediaAction,
  type NowPlaying,
  type Timeline,
} from '../../adapters/media';
import { controlMix, openApp, type MixItem } from '../../platform/popout';

/** 1:05, 12:40, 1:02:03 */
export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const [h, m, r] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

/**
 * The cover's main colour (the average of its more colourful pixels), for "Cover-Farbe als
 * Akzent" and the glow backgrounds; null while unknown or if the image may not be read.
 */
export function useCoverColor(src: string | null) {
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
export type Playing = {
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

export function fromMix(item: MixItem): Playing {
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

export function fromSystem(media: NowPlaying, timeline: Timeline | null): Playing {
  return {
    ...media,
    timeline,
    run: (action) => controlMedia?.(action) ?? Promise.resolve(),
    seek: seekMedia,
    open: () => openPlayer?.() ?? Promise.resolve(),
  };
}

/** The made-up track of the settings preview; buttons change only the preview itself. */
export type Sample = {
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

/** Repeat as Windows steps through it (media.rs): off → all → this track → off. */
export const nextRepeat = { none: 'all', all: 'one', one: 'none' } as const;

export function fromPreview(sample: Sample, set: (next: Sample) => void): Playing {
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
export function positionOf(timeline: Timeline, playing: boolean, now: number) {
  const since = playing ? (now - timeline.updatedAt) / 1000 : 0;
  return Math.min(timeline.duration, Math.max(0, timeline.position + since));
}
