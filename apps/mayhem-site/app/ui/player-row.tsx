'use client';
// One compact row of a ladder (start page): place, player, rank and Leistung Ø.
import Link from 'next/link';
import { GradeChip, Img, RankLine } from './bits';
import { profileImage, splitName, useDragon, type PlayerSummary } from './data';
import { ME_TEXT, useMe } from './me';

export function PlayerRow({
  player: p,
  place,
  dragon,
}: {
  player: PlayerSummary;
  place: number;
  dragon: ReturnType<typeof useDragon>;
}) {
  const me = useMe();
  const mine = me?.id === p.puuid;
  const { name, tag } = splitName(p.name);
  const href = '/players/' + encodeURIComponent(p.puuid);
  return (
    <tr data-place={place} data-me={mine || undefined}>
      <td className="place num">{place}</td>
      <td>
        <Link className="who" href={href}>
          <Img className="avatar" src={profileImage(dragon, p.icon)} size={34} />
          <span>
            <b>{name}</b>
            {tag && <span className="faint">#{tag}</span>}
            {mine && <span className="me-tag">{ME_TEXT.you}</span>}
          </span>
        </Link>
      </td>
      <td>
        <RankLine rank={p.rank} placed={p.placed} />
      </td>
      <td className="hide-sm">{p.average ? <GradeChip grade={p.average.grade} /> : <span className="faint">–</span>}</td>
    </tr>
  );
}
