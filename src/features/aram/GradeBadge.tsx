import type { Grade } from './aramPerformance';

/** How a grade reads: bad ones red, middle ones calm, good ones green, the top gold. */
const TONE: Record<Grade, string> = {
  F: 'bad',
  E: 'bad',
  D: 'low',
  C: 'low',
  B: 'mid',
  A: 'good',
  S: 'good',
  SS: 'top',
  SSS: 'top',
  MAYHEM: 'peak',
};

/** The performance of a game (F–MAYHEM), independent of the rank. */
export function GradeBadge({
  grade,
  size = 'normal',
  title,
}: {
  grade: Grade;
  size?: 'normal' | 'large';
  title?: string;
}) {
  return (
    <span
      className={`grade-badge ${TONE[grade]} ${size}`}
      title={title ?? `Note ${grade}`}
      aria-label={`Note ${grade}`}
    >
      {grade}
    </span>
  );
}
