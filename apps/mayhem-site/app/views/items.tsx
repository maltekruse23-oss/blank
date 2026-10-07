'use client';
// All items in the final builds: how often each is in a build, the win rate and Ø grade of those
// games, sortable, by default only finished items. Names and pictures from Data Dragon.
import { useDragon, useItems, type ItemKind } from '../ui/data';
import { useLang } from '../ui/i18n';
import { ItemLink, itemLabel } from '../ui/meta';
import { MetaListPage } from '../ui/meta-page';

type Only = ItemKind | 'all';

export default function ItemsPage() {
  const { t } = useLang();
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
        { id: 'done', label: t('Finished items', 'Fertige Items') },
        { id: 'boots', label: t('Boots', 'Stiefel') },
        { id: 'other', label: t('Components and other', 'Bauteile und Sonstiges') },
        { id: 'all', label: t('All items', 'Alle Items') },
      ]}
      initialFilter="done"
      note={t('What counts is what was in the inventory when the game ended.', 'Es zählt, was am Spielende im Inventar war.')}
    />
  );
}
