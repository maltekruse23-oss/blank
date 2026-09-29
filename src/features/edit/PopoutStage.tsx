import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import { Music, Pause, SkipBack, SkipForward } from 'lucide-react';
import { countScreens, hasPopouts, showPopout, taskbarIconsLeft } from '../../platform/popout';
import { popoutScreens, type PopoutPlace, type PopoutScreen } from '../popouts/placement';
import type { Preferences } from '../settings/preferences';

/** Where each place sits on the miniature screen (share of width and height). */
const spots: Record<PopoutPlace, { x: number; y: number }> = {
  'top-left': { x: 0.16, y: 0.16 },
  'top-center': { x: 0.5, y: 0.16 },
  'top-right': { x: 0.84, y: 0.16 },
  'bottom-left': { x: 0.16, y: 0.72 },
  'bottom-center': { x: 0.5, y: 0.72 },
  'bottom-right': { x: 0.84, y: 0.72 },
};
const places = Object.keys(spots) as PopoutPlace[];
/** The taskbar strip: the lowest share of a miniature screen. */
const TASKBAR = 0.88;
/** Room between the miniature popout and the edge of its screen, in CSS pixels. */
const MARGIN = 6;

type Box = { x: number; y: number; w: number; h: number };
type Target = { screen: PopoutScreen; taskbar: boolean; place: PopoutPlace };
const same = (a: Target, b: Target) =>
  a.screen === b.screen && a.taskbar === b.taskbar && (a.taskbar || a.place === b.place);

/**
 * The popout placed by hand (user's wish: direct manipulation): a miniature of the screen (two when
 * there are two) with the popout on it. It follows the mouse exactly; while dragging, the place it
 * will snap to (nearest of the six, the taskbar, or the other screen) lights up with an outline of
 * the popout; on release it springs there and the real popout appears there at once (live
 * preview). Parts of the miniature switch themselves on a click (progress, player name); the rest
 * of the popout settings are in the side panel.
 */
export function PopoutStage({
  preferences: p,
  update,
  openAll,
}: {
  preferences: Preferences;
  update: (next: Preferences) => void;
  /** All popout settings (side panel). */
  openAll: () => void;
}) {
  const [screens, setScreens] = useState(1);
  // Where Windows puts popouts in the taskbar: right end with icons on the left, else left end.
  const [iconsLeft, setIconsLeft] = useState(false);
  useEffect(() => {
    if (!hasPopouts) return;
    void countScreens().then(setScreens);
    void taskbarIconsLeft().then(setIconsLeft);
  }, []);
  const previewId = useRef(Date.now() % 1_000_000_000).current;
  const [heldBack, setHeldBack] = useState(false);

  /** Shows the real popout (the preview) where `next` says; each call keeps it a while longer. */
  function preview(next: Preferences) {
    if (!hasPopouts || !next.popouts) return;
    void showPopout(
      { kind: 'preview', id: previewId, topic: 'music', stamp: Date.now() },
      { overFullScreen: true, acrylic: next.popoutAcrylic && !next.popoutTaskbar },
    ).then((shown) => setHeldBack(!shown));
  }
  /** Saves and shows the real popout at once (not while popouts are off). */
  function change(next: Preferences) {
    update(next);
    preview(next);
  }
  // The real popout appears where it is as soon as this tool opens: its window is there before the
  // first drag, so it follows the miniature at once (user's wish "instant").
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once when the tool opens
  useEffect(() => preview(p), []);

  const monitors: PopoutScreen[] = screens > 1 ? ['primary', 'second'] : ['primary'];
  const onScreen: PopoutScreen = monitors.includes(p.popoutScreen) ? p.popoutScreen : 'primary';
  const current: Target = { screen: onScreen, taskbar: p.popoutTaskbar, place: p.popoutPlace };

  // The screens and the miniature in layout pixels of the stage (offsets: unaffected by the
  // popover's opening scale and the window's zoom).
  const stage = useRef<HTMLDivElement>(null);
  const mini = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<Partial<Record<PopoutScreen, Box>>>({});
  const [size, setSize] = useState({ w: 132, h: 40 });
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => {
      const next: Partial<Record<PopoutScreen, Box>> = {};
      for (const screen of element.querySelectorAll<HTMLElement>('.stage-screen'))
        // Inside the border: where its spots and taskbar are drawn.
        next[screen.dataset.screen as PopoutScreen] = {
          x: screen.offsetLeft + screen.clientLeft,
          y: screen.offsetTop + screen.clientTop,
          w: screen.clientWidth,
          h: screen.clientHeight,
        };
      setBoxes(next);
      if (mini.current) setSize({ w: mini.current.offsetWidth, h: mini.current.offsetHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (mini.current) observer.observe(mini.current);
    return () => observer.disconnect();
  }, [screens]);

  /** The middle of the miniature at a target, kept inside its screen. */
  function centre(target: Target) {
    const box = boxes[target.screen];
    if (!box) return null;
    const clamp = (value: number, low: number, high: number) =>
      Math.min(Math.max(value, low), Math.max(low, high));
    const halfW = size.w / 2 + MARGIN;
    const halfH = size.h / 2 + MARGIN;
    if (target.taskbar)
      return {
        x: box.x + clamp((iconsLeft ? 0.72 : 0.22) * box.w, halfW, box.w - halfW),
        y: box.y + (box.h * (1 + TASKBAR)) / 2,
      };
    const spot = spots[target.place];
    return {
      x: box.x + clamp(spot.x * box.w, halfW, box.w - halfW),
      y: box.y + clamp(spot.y * box.h, halfH, box.h * TASKBAR - halfH),
    };
  }

  /** The place the miniature snaps to with its middle at x, y (nearest; none far off). */
  function targetAt(x: number, y: number): Target | null {
    for (const screen of monitors) {
      const box = boxes[screen];
      if (!box) continue;
      if (x < box.x - 24 || x > box.x + box.w + 24 || y < box.y - 24 || y > box.y + box.h + 24)
        continue;
      if ((y - box.y) / box.h > TASKBAR) return { screen, taskbar: true, place: p.popoutPlace };
      let best = places[0]!;
      let distance = Infinity;
      for (const place of places) {
        const spot = centre({ screen, taskbar: false, place });
        if (!spot) continue;
        const d = (spot.x - x) ** 2 + (spot.y - y) ** 2;
        if (d < distance) [best, distance] = [place, d];
      }
      return { screen, taskbar: false, place: best };
    }
    return null;
  }

  // Dragging: the miniature follows the mouse 1:1 (client pixels turned into layout pixels).
  const grab = useRef<{ px: number; py: number; x: number; y: number; scale: number } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number; target: Target | null } | null>(null);
  const here = centre(current);
  // Springs into places only once it stands in its first one (never flies in from a corner).
  const [settled, setSettled] = useState(false);
  const placed = here !== null;
  useEffect(() => {
    if (!placed || settled) return;
    const frame = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(frame);
  }, [placed, settled]);

  // Grabbed anywhere, also on its switches: a few pixels of movement make it a drag (only then the
  // mouse is captured), less stays a click that switches a part.
  const dragged = useRef(false);
  // While dragging, every new place it snaps to is taken at once and the real popout jumps there;
  // a cancelled drag goes back to where it was.
  const origin = useRef<Target | null>(null);
  const live = useRef<Target | null>(null);
  const take = (target: Target) =>
    change({
      ...p,
      popoutScreen: target.screen,
      popoutTaskbar: target.taskbar,
      popoutPlace: target.place,
    });
  function down(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !here || !stage.current) return;
    event.preventDefault();
    dragged.current = false;
    origin.current = current;
    live.current = current;
    const rect = stage.current.getBoundingClientRect();
    const scale = rect.width / (stage.current.offsetWidth || rect.width) || 1;
    grab.current = { px: event.clientX, py: event.clientY, x: here.x, y: here.y, scale };
    // Wakes the real popout (it went after a few seconds), so it is there when the drag begins.
    preview(p);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const g = grab.current;
    if (!g) return;
    // Released outside without a drag: nothing is held any more.
    if (event.buttons === 0) {
      grab.current = null;
      return;
    }
    const x = g.x + (event.clientX - g.px) / g.scale;
    const y = g.y + (event.clientY - g.py) / g.scale;
    if (!dragged.current) {
      if (Math.abs(x - g.x) + Math.abs(y - g.y) < 4) return;
      dragged.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const target = targetAt(x, y);
    setDrag({ x, y, target });
    if (target && live.current && !same(target, live.current)) {
      live.current = target;
      take(target);
    }
  }
  /** A part's switch: only on a click, not at the end of a drag. */
  const toggle = (next: Preferences) => {
    if (!dragged.current) change(next);
  };
  function end(cancel: boolean) {
    const g = grab.current;
    grab.current = null;
    setDrag(null);
    const [from, now] = [origin.current, live.current];
    origin.current = null;
    live.current = null;
    // Taken while dragging already; a cancelled drag (e.g. Windows took the mouse) goes back.
    if (g && cancel && from && now && !same(from, now)) take(from);
  }

  const at = drag ?? here;
  const ghost = drag?.target ? centre(drag.target) : null;
  const lit = (screen: PopoutScreen, place: PopoutPlace | 'taskbar') =>
    !!drag?.target &&
    drag.target.screen === screen &&
    (place === 'taskbar'
      ? drag.target.taskbar
      : !drag.target.taskbar && drag.target.place === place);

  return (
    <div className="popout-stage">
      <div className="stage-screens" ref={stage}>
        {monitors.map((screen) => (
          <div
            key={screen}
            // Outlined only when it is the chosen screen ("Maus" and "Aktives Fenster": neither).
            className={`stage-screen ${p.popoutScreen === screen ? 'current' : ''}`}
            data-screen={screen}
          >
            <span className="stage-label">
              {screen === 'primary' ? 'Hauptbildschirm' : 'Zweiter'}
            </span>
            {places.map((place) => {
              const spot = centre({ screen, taskbar: false, place });
              const box = boxes[screen];
              return (
                spot &&
                box && (
                  <span
                    key={place}
                    className={`stage-spot ${lit(screen, place) ? 'target' : ''}`}
                    style={{ left: spot.x - box.x, top: spot.y - box.y }}
                    aria-hidden
                  />
                )
              );
            })}
            <span
              className={`stage-taskbar ${lit(screen, 'taskbar') ? 'target' : ''}`}
              aria-hidden
            />
          </div>
        ))}
        {drag && ghost && (
          <span
            className={`stage-ghost ${drag.target?.taskbar ? 'in-taskbar' : ''}`}
            style={{ left: ghost.x, top: ghost.y, width: size.w, height: size.h }}
            aria-hidden
          />
        )}
        <div
          ref={mini}
          className={`stage-popout ${p.popoutTaskbar ? 'in-taskbar' : ''} ${p.popoutCompact ? 'compact' : ''} ${settled ? 'settled' : ''} ${drag ? 'dragging' : ''}`}
          style={
            {
              left: at?.x ?? 0,
              top: at?.y ?? 0,
              visibility: at ? undefined : 'hidden',
              '--opacity': `${p.popoutOpacity}%`,
            } as CSSProperties
          }
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={() => end(false)}
          onPointerCancel={() => end(true)}
          onLostPointerCapture={() => grab.current && end(false)}
          title="Ziehen: Platz des Popouts"
        >
          <span className="stage-cover" aria-hidden>
            <Music size={12} />
          </span>
          <span className="stage-lines">
            <b>Titel</b>
            {!p.popoutTaskbar && (
              <button
                className={`stage-part ${p.popoutPlayerName ? '' : 'off'}`}
                title="Klick: Name des Players an/aus"
                onClick={() => toggle({ ...p, popoutPlayerName: !p.popoutPlayerName })}
              >
                Spotify
              </button>
            )}
          </span>
          {!p.popoutTaskbar && !p.popoutCompact && (
            <span className="stage-controls" aria-hidden>
              <SkipBack size={10} />
              <Pause size={10} />
              <SkipForward size={10} />
            </span>
          )}
          {!p.popoutTaskbar && !p.popoutCompact && (
            <button
              className={`stage-part stage-seek ${p.popoutSeek ? '' : 'off'}`}
              title="Klick: Fortschritt an/aus"
              onClick={() => toggle({ ...p, popoutSeek: !p.popoutSeek })}
            >
              <span />
            </button>
          )}
        </div>
      </div>
      {!hasPopouts && <p className="aram-note">Popouts gibt es nur in der Desktop-App.</p>}
      {hasPopouts && !p.popouts && (
        <p className="aram-note" role="status">
          Popouts sind aus.{' '}
          <button className="text-link" onClick={() => change({ ...p, popouts: true })}>
            Einschalten
          </button>
        </p>
      )}
      {heldBack && (
        <p className="aram-note" role="status">
          Gerade im Vollbild – das Popout erscheint danach.
        </p>
      )}
      {/* The screen only here (not also in the side panel): dragging picks the main or second
          one, these buttons also "where the mouse is" and "where the active window is". */}
      {screens > 1 && (
        <div className="stage-screen-choice" role="group" aria-label="Bildschirm der Popouts">
          <span>Bildschirm</span>
          {popoutScreens.map((screen) => (
            <button
              key={screen.id}
              className={`filter-button ${p.popoutScreen === screen.id ? 'selected' : ''}`}
              aria-pressed={p.popoutScreen === screen.id}
              title={screen.name}
              onClick={() => change({ ...p, popoutScreen: screen.id })}
            >
              {screen.short}
            </button>
          ))}
        </div>
      )}
      <div className="stage-options">
        <label className="stage-opacity">
          <span>Deckkraft</span>
          <input
            type="range"
            className="volume-slider"
            min={20}
            max={100}
            step={5}
            value={p.popoutOpacity}
            aria-label="Deckkraft des Popouts"
            style={{ '--value': `${((p.popoutOpacity - 20) / 80) * 100}%` } as CSSProperties}
            onChange={(event) => update({ ...p, popoutOpacity: Number(event.target.value) })}
            onPointerUp={(event) =>
              change({ ...p, popoutOpacity: Number(event.currentTarget.value) })
            }
          />
          <b>{p.popoutOpacity} %</b>
        </label>
        <button className="text-link" onClick={openAll}>
          Alle Popout-Einstellungen
        </button>
      </div>
    </div>
  );
}
