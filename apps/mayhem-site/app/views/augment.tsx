'use client';
// One augment: games, pick rate, win rate and Ø grade, the champions that took it and the items
// built with it most often.
import { useParams } from 'next/navigation';
import { Augment } from '../ui/bits';
import { useAugments, useDragon, useItems } from '../ui/data';
import { useLang } from '../ui/i18n';
import { ItemLink, augmentLabel, itemLabel } from '../ui/meta';
import { MetaDetailPage } from '../ui/meta-page';

const RARITY = { prismatic: ['Prismatic', 'Prismatisch'], gold: ['Gold', 'Gold'], silver: ['Silver', 'Silber'] } as const;

export default function AugmentPage() {
  const { t } = useLang();
  const { id: raw } = useParams<{ id: string }>();
  const id = /^[1-9][0-9]{0,6}$/.test(raw) ? Number(raw) : null;
  const known = useAugments();
  const items = useItems();
  const dragon = useDragon();
  const info = id ? known.get(id) : undefined;
  return (
    <MetaDetailPage
      kind="augments"
      id={id}
      back={{ href: '/augments', label: 'Augments' }}
      name={id ? augmentLabel(known, id) : 'Augment'}
      icon={id ? <Augment id={id} info={info} size={64} /> : null}
      facts={info?.rarity ? t(RARITY[info.rarity][0], RARITY[info.rarity][1]) : null}
      paired={{
        title: t('Items with it', 'Items dazu'),
        noun: 'Item',
        label: (n) => itemLabel(items, n),
        cell: (n) => <ItemLink id={n} known={items} dragon={dragon} />,
      }}
    />
  );
}
