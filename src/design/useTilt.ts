import { useEffect, type RefObject } from 'react';
import { getMotion } from './motion';

/** Cards that lean towards the mouse: the overview cards and stream cards. */
const TILTING =
  '.home-grid:not(.editing) > .home-tile, .device-grid > .card, .pc-grid > .card, .stream-card';
/** At most this many degrees in each direction. */
const MAX_DEG = 4;

/**
 * Cards under the mouse lean slightly towards it and a soft light follows it (CSS reads --rx, --ry,
 * --mx, --my; desktop.css). One listener for the whole content, at most one update per frame, and
 * only while the mouse moves; nothing runs otherwise.
 */
export function useTilt(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const area = root.current;
    if (!area) return;
    let card: HTMLElement | null = null;
    let frame = 0;
    let last: PointerEvent | null = null;
    const reset = (element: HTMLElement) => {
      for (const name of ['--rx', '--ry', '--mx', '--my']) element.style.removeProperty(name);
      element.classList.remove('tilting');
    };
    const apply = () => {
      frame = 0;
      const event = last;
      if (!event) return;
      const target = (event.target as Element | null)?.closest<HTMLElement>(TILTING) ?? null;
      if (card && card !== target) reset(card);
      card = getMotion().enabled ? target : null;
      if (!card) return;
      const box = card.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width;
      const y = (event.clientY - box.top) / box.height;
      card.classList.add('tilting');
      card.style.setProperty('--ry', `${((x - 0.5) * 2 * MAX_DEG).toFixed(2)}deg`);
      card.style.setProperty('--rx', `${((0.5 - y) * 2 * MAX_DEG).toFixed(2)}deg`);
      card.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
      card.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    };
    const move = (event: PointerEvent) => {
      last = event;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const leave = () => {
      last = null;
      if (card) reset(card);
      card = null;
    };
    area.addEventListener('pointermove', move);
    area.addEventListener('pointerleave', leave);
    return () => {
      area.removeEventListener('pointermove', move);
      area.removeEventListener('pointerleave', leave);
      cancelAnimationFrame(frame);
    };
  }, [root]);
}
