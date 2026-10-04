import type { Tier } from './aramRating';
import d from './emblems/d.png';
import c from './emblems/c.png';
import b from './emblems/b.png';
import a from './emblems/a.png';
import s from './emblems/s.png';
import ss from './emblems/ss.png';
import sss from './emblems/sss.png';
import mayhem from './emblems/mayhem.png';

/** Approved Augment-v3 artwork; SSS has no floating triangles. Keep source PNGs unchanged. */
const EMBLEMS: Record<Tier['id'], string> = { d, c, b, a, s, ss, sss, mayhem };

export const emblemOf = (tier: Tier) => EMBLEMS[tier.id];

export function TierEmblem({
  tier,
  size,
  provisional = false,
}: {
  tier: Tier;
  size: number;
  /** Still in the placement games: the rank so far, pale. */
  provisional?: boolean;
}) {
  return (
    <img
      className={`rank-emblem ${provisional ? 'provisional' : ''}`}
      src={EMBLEMS[tier.id]}
      alt={`Stufe ${tier.name}`}
      width={size}
      height={size}
      draggable={false}
    />
  );
}
