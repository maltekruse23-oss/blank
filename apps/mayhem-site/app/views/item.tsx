'use client';
// One item: games, pick rate, win rate and Ø grade, the champions that built it and the augments
// taken with it most often.
import { useParams } from 'next/navigation';
import { Img } from '../ui/bits';
import { itemImage, useAugments, useDragon, useItems } from '../ui/data';
import { num } from '../ui/format';
import { AugmentLink, augmentLabel, itemLabel } from '../ui/meta';
import { MetaDetailPage } from '../ui/meta-page';

const KIND = {
  done: 'Finished item',
  boots: 'Boots',
  other: 'Component or other',
} as const;

export default function ItemPage() {
  const { id: raw } = useParams<{ id: string }>();
  const id = /^[1-9][0-9]{0,6}$/.test(raw) ? Number(raw) : null;
  const known = useItems();
  const augments = useAugments();
  const dragon = useDragon();
  const info = id ? known.get(id) : undefined;
  return (
    <MetaDetailPage
      kind="items"
      id={id}
      back={{ href: '/items', label: 'Items' }}
      name={id ? itemLabel(known, id) : 'Item'}
      icon={id ? <Img className="item" src={itemImage(dragon, id)} size={64} /> : null}
      facts={info ? `${KIND[info.kind]}${info.gold ? ` · ${num(info.gold)} gold` : ''}` : null}
      paired={{
        title: 'Augments with it',
        noun: 'Augment',
        label: (n) => augmentLabel(augments, n),
        cell: (n) => <AugmentLink id={n} known={augments} />,
      }}
    />
  );
}
