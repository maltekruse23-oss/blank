// Motion tokens: durations and easings (also as CSS properties, see tokens.ts), springs and
// staggers for animations in TypeScript. A motion level and a speed factor scale everything; the
// system's "reduce motion" is respected unless the user chose a level. See README.md.

export type MotionLevel = 'off' | 'reduced' | 'subtle' | 'normal' | 'enhanced';
/** "system": normal, or reduced when Windows' animation effects are off. */
export type MotionChoice = MotionLevel | 'system';

export type Spring = { stiffness: number; damping: number; mass: number };

/** Base values at level "normal" and speed 1. */
export const motionBase = {
  durations: { instant: 0, fast: 120, normal: 200, slow: 320, emphasized: 450 },
  springs: {
    soft: { stiffness: 170, damping: 26, mass: 1 },
    default: { stiffness: 260, damping: 28, mass: 1 },
    snappy: { stiffness: 420, damping: 32, mass: 1 },
    heavy: { stiffness: 180, damping: 34, mass: 1.6 },
    /** With a visible overshoot: cards, counters, the start of something new. */
    bouncy: { stiffness: 300, damping: 20, mass: 1 },
  },
  stagger: { small: 30, medium: 60, large: 100 },
} as const;

/**
 * What a level does: duration factor (more is slower), spring factor (more is livelier) and
 * whether larger movements (slides, overshoot) are allowed. "reduced" keeps fades, no travel.
 */
const levelEffect: Record<MotionLevel, { duration: number; spring: number; travel: boolean }> = {
  off: { duration: 0, spring: 1, travel: false },
  reduced: { duration: 0.6, spring: 1, travel: false },
  subtle: { duration: 0.8, spring: 0.9, travel: true },
  normal: { duration: 1, spring: 1, travel: true },
  enhanced: { duration: 1.15, spring: 1.1, travel: true },
};

/**
 * A spring as CSS easing: the curve as `linear(…)` points and how long it takes to settle, so CSS
 * animations can spring too (with overshoot) without a script per frame.
 */
export function springCurve({ stiffness, damping, mass }: Spring) {
  const dt = 1 / 1000;
  let x = 0;
  let v = 0;
  const points: number[] = [];
  let t = 0;
  // Simulate until it rests (at most 2 s), one point per millisecond.
  for (; t < 2; t += dt) {
    const a = (-stiffness * (x - 1) - damping * v) / mass;
    v += a * dt;
    x += v * dt;
    points.push(x);
    if (t > 0.05 && Math.abs(x - 1) < 0.001 && Math.abs(v) < 0.01) break;
  }
  const ms = Math.round(points.length);
  // About 40 points are plenty for a smooth curve.
  const step = Math.max(1, Math.floor(points.length / 40));
  const sampled = points.filter((_, i) => i % step === 0).map((p) => Math.round(p * 1000) / 1000);
  return { easing: `linear(0, ${sampled.join(', ')}, 1)`, ms };
}

/** A spring for Motion (the animation library): `transition={spring('snappy')}`. */
export const spring = (name: keyof typeof motionBase.springs) => ({
  type: 'spring' as const,
  ...motionBase.springs[name],
});

/** The bouncy spring for CSS (tokens easing.spring and motion.spring). */
export const bouncyCurve = springCurve(motionBase.springs.bouncy);

export type ResolvedMotion = {
  level: MotionLevel;
  /** False: no animations at all (durations 0). */
  enabled: boolean;
  /** Larger movements (sliding, overshoot) allowed. */
  travel: boolean;
  durations: Record<keyof typeof motionBase.durations | 'spring', number>;
  springs: Record<keyof typeof motionBase.springs, Spring>;
  stagger: Record<keyof typeof motionBase.stagger, number>;
};

/** `speed` > 1 is faster (0.25–3, clamped by the config). */
export function resolveMotion(
  choice: MotionChoice,
  speed: number,
  systemReduced: boolean,
): ResolvedMotion {
  const level: MotionLevel = choice === 'system' ? (systemReduced ? 'reduced' : 'normal') : choice;
  const effect = levelEffect[level];
  const factor = effect.duration / speed;
  const scale = (ms: number) => Math.round(ms * factor);
  const springs = Object.fromEntries(
    Object.entries(motionBase.springs).map(([name, s]) => [
      name,
      { stiffness: s.stiffness * effect.spring * speed, damping: s.damping, mass: s.mass },
    ]),
  ) as ResolvedMotion['springs'];
  return {
    level,
    enabled: level !== 'off',
    travel: effect.travel,
    durations: {
      instant: 0,
      spring: scale(bouncyCurve.ms),
      fast: scale(motionBase.durations.fast),
      normal: scale(motionBase.durations.normal),
      slow: scale(motionBase.durations.slow),
      emphasized: scale(motionBase.durations.emphasized),
    },
    springs,
    stagger: {
      small: scale(motionBase.stagger.small),
      medium: scale(motionBase.stagger.medium),
      large: scale(motionBase.stagger.large),
    },
  };
}

// The current motion for TypeScript animations; components read it without a big React context
// (set by the design hook in the app, read with useMotion()).
let current: ResolvedMotion = resolveMotion('system', 1, false);
const listeners = new Set<() => void>();

export function setMotion(next: ResolvedMotion) {
  current = next;
  listeners.forEach((l) => l());
}
export const getMotion = () => current;
export function subscribeMotion(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
