import { useEffect } from 'react';
import { motion } from 'motion/react';
import { spring } from '../../design/motion';
import { AramResultCard } from './AramResult';
import type { AramResultView } from './useAramResult';

/** The card after a game inside the app, larger, over a dimmed backdrop. */
export function AramResultDialog({
  view,
  motionOn,
  onClose,
  onRanking,
}: {
  view: AramResultView;
  motionOn: boolean;
  onClose: () => void;
  onRanking: () => void;
}) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <motion.div
      className="restore-dialog aram-result-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="ARAM-Ergebnis"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.2 } }}
      exit={{ opacity: 0, transition: { duration: 0.16 } }}
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <motion.div
        className="aram-result-zoom"
        initial={{ opacity: 0, y: 26, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: spring('bouncy') }}
        exit={{ opacity: 0, y: 10, scale: 0.96, transition: { duration: 0.14 } }}
      >
        <AramResultCard
          key={view.id}
          entry={view.entry}
          augments={view.augments}
          highlight={view.highlight}
          run={motionOn ? 'play' : 'off'}
          onClose={onClose}
        />
      </motion.div>
      <div className="aram-result-actions">
        <button className="secondary-button" onClick={onRanking} autoFocus>
          Zur Rangliste
        </button>
      </div>
    </motion.div>
  );
}
