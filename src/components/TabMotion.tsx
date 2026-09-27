import type { ReactNode } from 'react';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import { spring } from '../design/motion';

/** Content of a tab: comes from the side of its tab with a spring, the old one leaves the other way. */
const variants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: 36 * dir, filter: 'blur(4px)' }),
  center: {
    opacity: 1,
    x: 0,
    filter: 'blur(0px)',
    transition: {
      ...spring('default'),
      opacity: { duration: 0.18, delay: 0.05 },
      filter: { duration: 0.2, delay: 0.03 },
    },
    transitionEnd: { filter: 'none' },
  },
  exit: (dir: number) => ({
    opacity: 0,
    x: -24 * dir,
    transition: { duration: 0.1, ease: [0.3, 0, 1, 1] },
  }),
};

export function TabContent({
  id,
  dir,
  className,
  children,
  role,
  label,
}: {
  id: string;
  /** 1: the new tab is to the right of the old one, -1: to the left. */
  dir: number;
  className?: string;
  children: ReactNode;
  role?: string;
  label?: string;
}) {
  return (
    <AnimatePresence mode="popLayout" initial={false} custom={dir}>
      <motion.div
        key={id}
        className={className}
        custom={dir}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        role={role}
        aria-label={label}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/** The highlight behind the chosen tab; glides to the next one with a spring. */
export function TabPill({ group }: { group: string }) {
  return <motion.span layoutId={group} className="tab-pill" transition={spring('snappy')} />;
}
