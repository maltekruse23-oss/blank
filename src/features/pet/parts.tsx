// Shared drawing parts of the pet figures (viewBox 0 0 100 92).

/** Band of the headphones, arching from one ear (left, y) over the head to the other. Drawn
 *  before the head, so the head covers its lower part. `top`: control height of the arch. */
export function HeadphonesBand({
  left,
  right,
  y,
  top,
}: {
  left: number;
  right: number;
  y: number;
  top: number;
}) {
  const d = `M${left} ${y} C${left} ${top} ${right} ${top} ${right} ${y}`;
  // Light rim under the dark band, so it shows on dark and light desktops alike.
  return (
    <>
      <path className="pet-phones-rim" d={d} />
      <path className="pet-phones-band" d={d} />
    </>
  );
}

/** Ear cups at both ends of the band; drawn after the head. */
export function HeadphonesCups({ left, right, y }: { left: number; right: number; y: number }) {
  return (
    <>
      <rect className="pet-phones-cup" x={left - 6} y={y - 6} width="12" height="20" rx="5" />
      <rect className="pet-phones-cup" x={right - 6} y={y - 6} width="12" height="20" rx="5" />
    </>
  );
}

/** A music note next to the pet (static, no animation). */
export function Note({ x, y }: { x: number; y: number }) {
  return (
    <text className="pet-note" x={x} y={y}>
      ♪
    </text>
  );
}

/** Small marks next to the pet: "z" while sleeping, "!" when excited. */
export function Mark({
  x,
  y,
  children,
  size = 'normal',
}: {
  x: number;
  y: number;
  children: string;
  size?: 'small' | 'normal' | 'big';
}) {
  return (
    <text className={`pet-mark ${size}`} x={x} y={y}>
      {children}
    </text>
  );
}
