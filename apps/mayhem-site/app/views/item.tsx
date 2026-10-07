'use client';
// One item: games, pick rate, win rate and Ø grade, the champions that built it and the augments
// taken with it most often.
import { useParams } from 'next/navigation';
import { Img } from '../ui/bits';
import { itemImage, useAugments, useDragon, useItems } from '../ui/data';
import { useLang } from '../ui/i18n';
import { AugmentLink, augmentLabel, itemLabel } from '../ui/meta';
import { MetaDetailPage } from '../ui/meta-page';

const KIND = {
  done: ['Finished item', 'Fertiges Item'],
  boots: ['Boots', 'Stiefel'],
  other: ['Component or other', 'Bauteil oder Sonstiges'],
} as const;

export default function ItemPage() {
  const { t, num } = useLang();
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
      facts={info ? `${t(KIND[info.kind][0], KIND[info.kind][1])}${info.gold ? ` · ${num(info.gold)} Gold` : ''}` : null}
      paired={{
        title: t('Augments with it', 'Augments dazu'),
        noun: 'Augment',
        label: (n) => augmentLabel(augments, n),
        cell: (n) => <AugmentLink id={n} known={augments} />,
      }}
    />
  );
}
