'use client';
// All augments: how often each is taken, the win rate and Ø grade of those games, sortable and
// filterable by rarity. Names and icons come from blank. (/api/augments).
import type { Rarity } from '../../src/augments';
import { useAugments } from '../ui/data';
import { AugmentLink, augmentLabel } from '../ui/meta';
import { MetaListPage } from '../ui/meta-page';

type Only = 'all' | Exclude<Rarity, ''>;

export default function AugmentsPage() {
  const known = useAugments();
  return (
    <MetaListPage<Only>
      kind="augments"
      title="Augments"
      noun="Augment"
      label={(id) => augmentLabel(known, id)}
      cell={(id) => <AugmentLink id={id} known={known} />}
      filter={(id, only) => only === 'all' || known.get(id)?.rarity === only}
      filters={[
        { id: 'all', label: 'Alle Seltenheiten' },
        { id: 'prismatic', label: 'Prismatisch' },
        { id: 'gold', label: 'Gold' },
        { id: 'silver', label: 'Silber' },
      ]}
      initialFilter="all"
      note="Namen und Symbole schickt blank. mit; ein Augment, das noch niemand geschickt hat, steht mit seiner Nummer da."
    />
  );
}
