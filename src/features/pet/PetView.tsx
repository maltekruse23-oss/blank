import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { BatteryLow, BellOff, Gauge, X } from 'lucide-react';
import { ChannelAvatar } from '../../components/ui';
import { resizePetWindow, startWindowDrag } from '../../platform/window';
import type { Page } from '../../app/App';
import { warningText, type Warning } from '../../app/useWarnings';
import type { GoLiveAlert } from '../twitch/useGoLiveAlerts';
import type { TwitchData } from '../twitch/useTwitch';
import { CloseProgramButton } from '../pc/CloseProgramButton';
import { petFigure, type Mood, type PetFigureId } from './figures';

/** Window sizes in CSS pixels: the pet alone, and with a speech bubble above it. */
export const PET_SIZE = { width: 104, height: 96 };
const BUBBLE_SIZE = { width: 240, height: 158 };
/** A warning with a "close program" button needs a second row. */
const ACTION_BUBBLE_SIZE = { width: 250, height: 190 };
/** How long the pet hops after a go-live; also the length of the CSS animation. */
const HOP_MS = 1300;
/** Movement that turns a press on the pet into dragging. */
const DRAG_PX = 4;

/**
 * The app as a small desktop pet. Sleeps while none of the channels is live, is awake while at
 * least one is, and hops with a short speech bubble (who is live) when a channel goes live.
 * Click: back to the app. Drag: move it. No animation runs while nothing happens.
 */
export function PetView({
  twitch,
  alerts,
  dismiss,
  motion,
  figure,
  quiet,
  warnings,
  dismissWarning,
  onOpenApp,
}: {
  twitch: TwitchData;
  alerts: GoLiveAlert[];
  dismiss: (id: number) => void;
  motion: boolean;
  figure: PetFigureId;
  /** Do not disturb: bubbles still appear, but the pet stays behind other windows. */
  quiet: boolean;
  warnings: Warning[];
  dismissWarning: (id: number) => void;
  onOpenApp: (page?: Page) => void;
}) {
  const { Figure } = petFigure(figure);
  const live = twitch.entries.filter((e) => e.status.kind === 'live').length;
  const newestAlert = alerts.at(-1);
  const newestWarning = warnings.at(-1);
  // The newest notice of either kind gets the bubble.
  const warning =
    newestWarning && (!newestAlert || newestWarning.at > newestAlert.at)
      ? newestWarning
      : undefined;
  const latest = warning ? undefined : newestAlert;
  const [hopping, setHopping] = useState(false);
  const [blinking, setBlinking] = useState(false);
  const mood: Mood = warning ? 'worried' : latest ? 'excited' : live > 0 ? 'awake' : 'sleepy';
  const press = useRef<{ x: number; y: number } | null>(null);

  // Hop once per new go-live.
  useEffect(() => {
    if (!latest || !motion) return;
    setHopping(true);
    const timer = window.setTimeout(() => setHopping(false), HOP_MS);
    return () => window.clearTimeout(timer);
  }, [latest?.id, motion]);

  // Blink now and then while awake; a short class change, no running animation in between.
  useEffect(() => {
    if (mood !== 'awake' || !motion) return;
    let timer: number;
    const next = () => {
      timer = window.setTimeout(
        () => {
          setBlinking(true);
          timer = window.setTimeout(() => {
            setBlinking(false);
            next();
          }, 160);
        },
        3500 + Math.random() * 4000,
      );
    };
    next();
    return () => window.clearTimeout(timer);
  }, [mood, motion]);

  // The window only grows while a bubble is shown, so it covers as little as possible; during
  // that time it also comes out from behind other windows.
  const bubble = latest !== undefined || warning !== undefined;
  const culprit = warning?.kind === 'load' ? warning.load.apps.find((a) => a.closable) : undefined;
  const size = culprit ? ACTION_BUBBLE_SIZE : bubble ? BUBBLE_SIZE : PET_SIZE;
  useEffect(() => {
    resizePetWindow(size.width, size.height, bubble && !quiet);
  }, [size, bubble, quiet]);

  function pointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    press.current = { x: event.screenX, y: event.screenY };
  }
  function pointerMove(event: PointerEvent) {
    const start = press.current;
    if (!start) return;
    if (Math.hypot(event.screenX - start.x, event.screenY - start.y) > DRAG_PX) {
      press.current = null;
      startWindowDrag();
    }
  }
  function pointerUp() {
    if (press.current) onOpenApp();
    press.current = null;
  }

  const open = twitch.adapter.openChannel;
  const title = `${live === 0 ? 'Niemand live' : live === 1 ? '1 Kanal live' : `${live} Kanäle live`} · Klicken: App öffnen · Ziehen: verschieben`;
  const warningInfo = warning && warningText(warning);
  const WarningIcon = warning?.kind === 'battery' ? BatteryLow : Gauge;
  return (
    <div className="pet">
      {warning && warningInfo && (
        <div className="pet-bubble warning">
          <div className="pet-bubble-row">
            <button
              className="pet-bubble-open"
              title="Details öffnen"
              onClick={() => {
                dismissWarning(warning.id);
                onOpenApp(warningInfo.page);
              }}
            >
              <span className="pet-bubble-icon">
                <WarningIcon size={15} />
              </span>
              <span className="pet-bubble-lines">
                <b>{warningInfo.title}</b>
                <small>{warningInfo.detail}</small>
              </span>
            </button>
            <button
              className="pet-bubble-close"
              aria-label="Meldung schließen"
              title="Schließen"
              onClick={() => warnings.forEach((w) => dismissWarning(w.id))}
            >
              <X size={12} />
            </button>
          </div>
          {culprit && (
            <div className="pet-bubble-action">
              <CloseProgramButton app={culprit} onDone={() => dismissWarning(warning.id)} />
            </div>
          )}
        </div>
      )}
      {latest && (
        <div className="pet-bubble">
          <button
            className="pet-bubble-open"
            title="Stream öffnen"
            onClick={() => {
              if (open) void open(latest.channel.login).catch(() => undefined);
              dismiss(latest.id);
            }}
          >
            <ChannelAvatar login={latest.channel.login} imageUrl={latest.channel.profileImageUrl} />
            <span>
              <b>{latest.channel.displayName}</b> ist live!
            </span>
            {alerts.length > 1 && <small>+{alerts.length - 1}</small>}
          </button>
          <button
            className="pet-bubble-close"
            aria-label="Meldung schließen"
            title="Schließen"
            onClick={() => alerts.forEach((a) => dismiss(a.id))}
          >
            <X size={12} />
          </button>
        </div>
      )}
      <div
        className={`pet-figure ${hopping ? 'hop' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`blank. öffnen (${live === 1 ? '1 Kanal' : `${live} Kanäle`} live)`}
        title={title}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => (press.current = null)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onOpenApp();
        }}
      >
        <Figure mood={mood} blinking={blinking} />
        {live > 0 && <span className="pet-count">{live}</span>}
        {quiet && (
          <span className="pet-quiet" title="Nicht stören ist an">
            <BellOff size={11} />
          </span>
        )}
      </div>
    </div>
  );
}
