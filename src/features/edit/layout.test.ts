import { describe, expect, it } from 'vitest';
import {
  addTile,
  defaultLayout,
  place,
  readHomeLayout,
  readNavHidden,
  readNavOrder,
  removeTile,
  type Tile,
} from './layout';

const at = (layout: Tile[] | null, id: string) => layout?.find((t) => t.id === id);

describe('Home-Raster', () => {
  it('frei: rastet ein und bleibt im Raster', () => {
    const layout = removeTile(defaultLayout, 'pc');
    const moved = place(layout, 'setup', { x: 6.4, y: 4.6, w: 6, h: 4 });
    expect(at(moved, 'setup')).toMatchObject({ x: 6, y: 4 });
    expect(at(place(layout, 'setup', { x: 40, y: -3, w: 6, h: 4 }), 'setup')).toMatchObject({
      x: 6,
      y: 0,
    });
  });

  it('ein Widget im Weg tauscht den Platz', () => {
    const swapped = place(defaultLayout, 'setup', { x: 6, y: 4, w: 6, h: 4 });
    expect(at(swapped, 'setup')).toMatchObject({ x: 6, y: 4 });
    expect(at(swapped, 'pc')).toMatchObject({ x: 6, y: 0 });
  });

  it('passt es nicht, bleibt alles, wie es war (null)', () => {
    // Twitch across the whole width: the other two do not fit below it.
    expect(place(defaultLayout, 'twitch', { x: 0, y: 0, w: 12, h: 8 })).toBeNull();
  });

  it('Größe: nie kleiner als erlaubt, andere rücken nach unten', () => {
    const smaller = place(defaultLayout, 'twitch', { x: 0, y: 0, w: 1, h: 1 });
    expect(at(smaller, 'twitch')).toMatchObject({ w: 3, h: 3 });
    const layout: Tile[] = [
      { id: 'setup', x: 0, y: 0, w: 6, h: 2 },
      { id: 'pc', x: 0, y: 2, w: 6, h: 3 },
    ];
    const taller = place(layout, 'setup', { x: 0, y: 0, w: 6, h: 4 });
    expect(at(taller, 'pc')).toMatchObject({ y: 4 });
  });

  it('neue Widgets an den ersten freien Platz, sonst kein Platz', () => {
    const layout = removeTile(defaultLayout, 'pc');
    const added = addTile(layout, 'music');
    expect(at(added, 'music')).toMatchObject({ x: 6, y: 4 });
    expect(addTile(defaultLayout, 'aram')).toBeNull();
    expect(addTile(defaultLayout, 'pc')).toBeNull();
  });

  it('gespeicherte Anordnung streng geprüft', () => {
    expect(readHomeLayout('kaputt')).toEqual(defaultLayout);
    expect(readHomeLayout([])).toEqual([]);
    expect(
      readHomeLayout([
        { id: 'pc', x: 0, y: 0, w: 4, h: 4, title: 'Mein PC' },
        { id: 'pc', x: 4, y: 0, w: 4, h: 4 },
        { id: 'setup', x: 2, y: 2, w: 4, h: 4 },
        { id: 'music', x: 10, y: 0, w: 4, h: 3 },
        { id: 'aram', x: 0, y: 4, w: 1, h: 1 },
        { id: 'twitch', x: 4, y: 0, w: 4.5, h: 4 },
        { id: 'hack', x: 0, y: 0, w: 4, h: 4 },
        { id: 'music', x: 4, y: 0, w: 4, h: 3, title: ' x' },
      ]),
    ).toEqual([
      { id: 'pc', x: 0, y: 0, w: 4, h: 4, title: 'Mein PC' },
      { id: 'music', x: 4, y: 0, w: 4, h: 3 },
    ]);
  });
});

describe('Seitenleiste', () => {
  it('Reihenfolge: bekannte Seiten je einmal, fehlende an ihren Platz', () => {
    expect(readNavOrder(['pc', 'home', 'pc', 'settings', 'x'])).toEqual([
      'rank',
      'aram',
      'twitch',
      'pros',
      'music',
      'devices',
      'pc',
      'home',
      'apps',
    ]);
    expect(readNavOrder(undefined)[0]).toBe('home');
  });

  it('nach dem Update: die neue Seite Rang steht vor Rekorde, Eigenes bleibt', () => {
    // Saved before Rang existed, with Musik moved above Twitch.
    const order = readNavOrder([
      'home',
      'music',
      'twitch',
      'pros',
      'aram',
      'devices',
      'pc',
      'apps',
    ]);
    expect(order.indexOf('rank')).toBe(order.indexOf('aram') - 1);
    expect(order.indexOf('music')).toBeLessThan(order.indexOf('twitch'));
    expect(new Set(order).size).toBe(9);
  });

  it('ausgeblendet: nie Home', () => {
    expect(readNavHidden(['home', 'pros', 'pros', 'x'])).toEqual(['pros']);
  });
});

describe('Tauschen verschieden großer Widgets', () => {
  it('PC auf Twitch: beide tauschen Platz und Größe', () => {
    const swapped = place(defaultLayout, 'pc', { x: 0, y: 0, w: 6, h: 4 });
    expect(at(swapped, 'pc')).toMatchObject({ x: 0, y: 0, w: 6, h: 8 });
    expect(at(swapped, 'twitch')).toMatchObject({ x: 6, y: 4, w: 6, h: 4 });
  });
});
