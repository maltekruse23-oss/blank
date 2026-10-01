// The layout of the editable app (user's wish: direct manipulation, drag and snap): Home as a grid
// of 12 × 8 cells whose widgets can be moved, resized, added and removed; the order and visibility
// of the pages in the sidebar. Pure functions; stored in the preferences (strictly checked).
import type { Page } from '../../app/App';

export const COLS = 12;
export const ROWS = 8;

export type WidgetId = 'twitch' | 'setup' | 'pc' | 'music' | 'aram';
export type Tile = { id: WidgetId; x: number; y: number; w: number; h: number; title?: string };

/** Smallest and first size of each widget, in cells. */
export const widgetSizes: Record<WidgetId, { minW: number; minH: number; w: number; h: number }> = {
  twitch: { minW: 3, minH: 3, w: 6, h: 8 },
  setup: { minW: 3, minH: 2, w: 6, h: 4 },
  pc: { minW: 3, minH: 3, w: 6, h: 4 },
  music: { minW: 3, minH: 2, w: 6, h: 3 },
  aram: { minW: 3, minH: 3, w: 6, h: 4 },
};
export const widgetIds = Object.keys(widgetSizes) as WidgetId[];

/** As Home looked before (Twitch left, setup and PC right). */
export const defaultLayout: Tile[] = [
  { id: 'twitch', x: 0, y: 0, w: 6, h: 8 },
  { id: 'setup', x: 6, y: 0, w: 6, h: 4 },
  { id: 'pc', x: 6, y: 4, w: 6, h: 4 },
];

const overlaps = (a: Tile, b: Tile) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inBounds = (t: Tile) => t.x >= 0 && t.y >= 0 && t.x + t.w <= COLS && t.y + t.h <= ROWS;
const bigEnough = (t: Tile) => t.w >= widgetSizes[t.id].minW && t.h >= widgetSizes[t.id].minH;
const free = (t: Tile, others: Tile[]) => others.every((o) => !overlaps(t, o));

/**
 * The layout with one widget at a new place or size, or null if it does not fit. Widgets in the
 * way swap places with it (one of them) or move down; nothing ever leaves the grid.
 */
export function place(
  layout: Tile[],
  id: WidgetId,
  target: { x: number; y: number; w: number; h: number },
): Tile[] | null {
  const tile = layout.find((t) => t.id === id);
  if (!tile) return null;
  const w = Math.min(COLS, Math.max(widgetSizes[id].minW, Math.round(target.w)));
  const h = Math.min(ROWS, Math.max(widgetSizes[id].minH, Math.round(target.h)));
  const moved: Tile = {
    ...tile,
    w,
    h,
    x: Math.min(COLS - w, Math.max(0, Math.round(target.x))),
    y: Math.min(ROWS - h, Math.max(0, Math.round(target.y))),
  };
  const others = layout.filter((t) => t.id !== id);
  const inWay = others.filter((o) => overlaps(moved, o));
  const result = (next: Tile[]) => layout.map((t) => next.find((n) => n.id === t.id) ?? t);
  if (inWay.length === 0) return result([moved]);
  // One widget in the way: it takes the old place (if it fits there).
  if (inWay.length === 1) {
    const swapped = { ...inWay[0]!, x: tile.x, y: tile.y };
    const rest = others.filter((o) => o.id !== swapped.id);
    if (inBounds(swapped) && !overlaps(swapped, moved) && free(swapped, rest))
      return result([moved, swapped]);
    // Different sizes: the two exchange their places with their sizes (as far as allowed).
    const other = inWay[0]!;
    if (target.w === tile.w && target.h === tile.h) {
      const taken: Tile = {
        ...moved,
        x: other.x,
        y: other.y,
        w: Math.max(other.w, widgetSizes[id].minW),
        h: Math.max(other.h, widgetSizes[id].minH),
      };
      const given: Tile = { ...other, x: tile.x, y: tile.y, w: tile.w, h: tile.h };
      if (
        inBounds(taken) &&
        inBounds(given) &&
        bigEnough(given) &&
        !overlaps(taken, given) &&
        free(taken, rest) &&
        free(given, rest)
      )
        return result([taken, given]);
    }
  }
  // Otherwise the ones in the way move down, as far as needed (and the ones they meet).
  const placed: Tile[] = [moved];
  const waiting = [...others].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const other of waiting) {
    let next = { ...other };
    while (!free(next, placed)) {
      const blocker = placed.find((p) => overlaps(next, p))!;
      next = { ...next, y: blocker.y + blocker.h };
      if (!inBounds(next)) return null;
    }
    placed.push(next);
  }
  return result(placed);
}

/** A widget added at the first free place (its first size, else its smallest); null: no room. */
export function addTile(layout: Tile[], id: WidgetId): Tile[] | null {
  if (layout.some((t) => t.id === id)) return null;
  const size = widgetSizes[id];
  for (const [w, h] of [
    [size.w, size.h],
    [size.minW, size.minH],
  ] as const)
    for (let y = 0; y + h <= ROWS; y++)
      for (let x = 0; x + w <= COLS; x++) {
        const tile: Tile = { id, x, y, w, h };
        if (free(tile, layout)) return [...layout, tile];
      }
  return null;
}

export const removeTile = (layout: Tile[], id: WidgetId) => layout.filter((t) => t.id !== id);

export const MAX_TITLE = 30;

/** Home's layout from stored or imported settings; not a list: as before; each widget once. */
export function readHomeLayout(raw: unknown): Tile[] {
  if (!Array.isArray(raw)) return defaultLayout;
  const tiles: Tile[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { id, x, y, w, h, title } = item as Record<string, unknown>;
    const numbers = [x, y, w, h];
    if (
      typeof id !== 'string' ||
      !(id in widgetSizes) ||
      !numbers.every((n) => typeof n === 'number' && Number.isInteger(n))
    )
      continue;
    const tile: Tile = {
      id: id as WidgetId,
      x: x as number,
      y: y as number,
      w: w as number,
      h: h as number,
    };
    if (
      typeof title === 'string' &&
      title.trim() === title &&
      title.length > 0 &&
      title.length <= MAX_TITLE &&
      !/\p{Cc}/u.test(title)
    )
      tile.title = title;
    if (tiles.some((t) => t.id === tile.id) || !inBounds(tile) || !bigEnough(tile)) continue;
    if (!free(tile, tiles)) continue;
    tiles.push(tile);
  }
  return tiles;
}

/** Pages in the sidebar, in their sections; Home first and always there. */
export const navPages: Page[] = [
  'home',
  'rank',
  'aram',
  'twitch',
  'pros',
  'music',
  'devices',
  'pc',
  'apps',
];

/** The order of the pages (known ones, each once); a page missing from it (e.g. new in an update)
 * goes to its place in the default order: before the first page that follows it there. */
export function readNavOrder(raw: unknown): Page[] {
  const order = Array.isArray(raw)
    ? [
        ...new Set(
          raw.filter((p): p is Page => typeof p === 'string' && navPages.includes(p as Page)),
        ),
      ]
    : [];
  for (const [i, page] of navPages.entries()) {
    if (order.includes(page)) continue;
    const next = navPages.slice(i + 1).find((p) => order.includes(p));
    order.splice(next ? order.indexOf(next) : order.length, 0, page);
  }
  return order;
}

/** Hidden pages (never Home). */
export function readNavHidden(raw: unknown): Page[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw.filter(
        (p): p is Page => typeof p === 'string' && p !== 'home' && navPages.includes(p as Page),
      ),
    ),
  ];
}
