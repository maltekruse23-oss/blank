'use client';
// All augments as cards in the color of their rarity (after Blitz's augment page): which ones win
// most? Names and icons come from blank. (/api/augments).
import type { Rarity } from '../../src/augments';
import { useAugments } from '../ui/data';
import { augmentLabel, augmentPicture } from '../ui/meta';
import { MetaListPage } from '../ui/meta-page';

type Only = 'all' | Exclude<Rarity, ''>;

export default function AugmentsPage() {
  const known = useAugments();
  return (
    <MetaListPage<Only>
      kind="augments"
      title="Augments"
      question="Which augments win most?"
      noun="Augment"
      label={(id) => augmentLabel(known, id)}
      picture={(id, size) => augmentPicture(known, id, size)}
      rarity={(id) => known.get(id)?.rarity || undefined}
      filter={(id, only) => only === 'all' || known.get(id)?.rarity === only}
      filters={[
        { id: 'all', label: 'All' },
        { id: 'prismatic', label: 'Prismatic' },
        { id: 'gold', label: 'Gold' },
        { id: 'silver', label: 'Silver' },
      ]}
      initialFilter="all"
      note="Names and icons are sent by blank.; one nobody has sent yet shows its number."
    />
  );
}
