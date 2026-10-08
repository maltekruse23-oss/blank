'use client';
// One augment: how often it wins (on top), the champions it does best on and the items built with it.
import { useParams } from 'next/navigation';
import { Augment } from '../ui/bits';
import { useAugments, useDragon, useItems } from '../ui/data';
import { augmentLabel, itemLabel, itemPicture } from '../ui/meta';
import { MetaDetailPage } from '../ui/meta-page';

const RARITY = { prismatic: 'Prismatic', gold: 'Gold', silver: 'Silver' } as const;

export default function AugmentPage() {
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
      facts={info?.rarity ? RARITY[info.rarity] : null}
      paired={{
        title: 'Best items with it',
        noun: 'Item',
        href: (n) => `/items/${n}`,
        label: (n) => itemLabel(items, n),
        picture: (n) => itemPicture(dragon, n),
      }}
    />
  );
}
