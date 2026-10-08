'use client';
// All items in the final builds: which ones win most? By default only finished items. Names and
// pictures from Data Dragon.
import { useDragon, useItems, type ItemKind } from '../ui/data';
import { itemLabel, itemPicture } from '../ui/meta';
import { MetaListPage } from '../ui/meta-page';

type Only = ItemKind | 'all';

export default function ItemsPage() {
  const known = useItems();
  const dragon = useDragon();
  return (
    <MetaListPage<Only>
      kind="items"
      title="Items"
      question="Which items win most?"
      noun="Item"
      label={(id) => itemLabel(known, id)}
      picture={(id, size) => itemPicture(dragon, id, size)}
      // Before Data Dragon answers, all items are shown.
      filter={(id, only) => only === 'all' || !known.size || (known.get(id)?.kind ?? 'other') === only}
      filters={[
        { id: 'done', label: 'Finished' },
        { id: 'boots', label: 'Boots' },
        { id: 'other', label: 'Parts and other' },
        { id: 'all', label: 'All' },
      ]}
      initialFilter="done"
      note="What counts is the inventory when the game ended."
    />
  );
}
