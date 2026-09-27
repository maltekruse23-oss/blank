import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { spring } from '../design/motion';

/**
 * Something that opens below its button (filter, channels, watch together, more settings): it
 * grows to its height with a spring while it fades in, and folds away again when closed.
 */
export function Reveal({
  show,
  children,
  className,
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key="reveal"
          className={`reveal ${className ?? ''}`}
          initial={{ height: 0, opacity: 0 }}
          animate={{
            height: 'auto',
            opacity: 1,
            transition: { height: spring('default'), opacity: { duration: 0.22, delay: 0.04 } },
          }}
          exit={{
            height: 0,
            opacity: 0,
            transition: {
              height: { duration: 0.2, ease: [0.3, 0, 0.2, 1] },
              opacity: { duration: 0.12 },
            },
          }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
