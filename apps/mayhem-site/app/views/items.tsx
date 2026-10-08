'use client';
// All items in the final builds: how often each is in a build, the win rate and Ø grade of those
// games, sortable, by default only finished items. Names and pictures from Data Dragon.
import { useDragon, useItems, type ItemKind } from '../ui/data';
import { ItemLink, itemLabel } from '../ui/meta';
import { MetaListPage } from '../ui/meta-page';

type Only = ItemKind | 'all';

export default function ItemsPage() {
  const known = useItems();
  const dragon = useDragon();
  return (
    <MetaListPage<Only>
      kind="items"
      title="Items"
      noun="Item"
      label={(id) => itemLabel(known, id)}
      cell={(id) => <ItemLink id={id} known={known} dragon={dragon} />}
      // Before Data Dragon answers, all items are shown.
      filter={(id, only) => only === 'all' || !known.size || (known.get(id)?.kind ?? 'other') === only}
      filters={[
        { id: 'done', label: 'Finished items' },
        { id: 'boots', label: 'Boots' },
        { id: 'other', label: 'Components and other' },
        { id: 'all', label: 'All items' },
      ]}
      initialFilter="done"
      note="What counts is what was in the inventory when the game ended."
    />
  );
}
