import { AnimatePresence, motion } from 'motion/react';
import { spring } from '../../design/motion';
import { BatteryLow, Gauge, X } from 'lucide-react';
import { warningText, type Warning } from '../../app/useWarnings';
import { CloseProgramButton } from '../pc/CloseProgramButton';
import type { Page } from '../../app/App';
import { ChannelAvatar } from '../../components/ui';
import { ChannelLink } from './ChannelLink';
import type { GoLiveAlert } from './useGoLiveAlerts';
import type { TwitchData } from './useTwitch';

/**
 * Small notices at the bottom right: a channel went live (click opens the stream), or a battery
 * or overload warning (click opens the matching page).
 */
/** A notice springs in from the side, leaves to it, and the others move up to close the gap. */
const toastMotion = {
  layout: true,
  initial: { opacity: 0, x: 64, scale: 0.94 },
  animate: { opacity: 1, x: 0, scale: 1, transition: spring('bouncy') },
  exit: { opacity: 0, x: 64, scale: 0.96, transition: { duration: 0.18 } },
} as const;

export function LiveToasts({
  twitch,
  alerts,
  dismiss,
  warnings,
  dismissWarning,
  openPage,
}: {
  twitch: TwitchData;
  alerts: GoLiveAlert[];
  dismiss: (id: number) => void;
  warnings: Warning[];
  dismissWarning: (id: number) => void;
  openPage: (page: Page) => void;
}) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {warnings.map((w) => {
          const { title, detail, page } = warningText(w);
          const Icon = w.kind === 'battery' ? BatteryLow : Gauge;
          const culprit = w.kind === 'load' ? w.load.apps.find((a) => a.closable) : undefined;
          return (
            <motion.div className="toast warning" key={`w${w.id}`} {...toastMotion}>
              <span className="toast-icon">
                <Icon size={16} />
              </span>
              <span className="toast-text">
                <b>{title}</b>
                <small>{detail}</small>
                {culprit && (
                  <CloseProgramButton app={culprit} onDone={() => dismissWarning(w.id)} />
                )}
              </span>
              <button
                className="toast-close"
                aria-label="Meldung schließen"
                onClick={() => dismissWarning(w.id)}
              >
                <X size={14} />
              </button>
              <button
                className="channel-link"
                aria-label={`${title} – Details öffnen`}
                title="Details öffnen"
                onClick={() => {
                  dismissWarning(w.id);
                  openPage(page);
                }}
              />
            </motion.div>
          );
        })}
        {alerts.map(({ id, channel, game }) => (
          <motion.div className="toast" key={id} {...toastMotion}>
            <ChannelAvatar login={channel.login} imageUrl={channel.profileImageUrl} />
            <span className="toast-text">
              <b>{channel.displayName} ist live</b>
              {game && <small>{game}</small>}
            </span>
            <button
              className="toast-close"
              aria-label="Meldung schließen"
              onClick={() => dismiss(id)}
            >
              <X size={14} />
            </button>
            <ChannelLink twitch={twitch} channel={channel} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
