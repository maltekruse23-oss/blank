'use client';
// The tier list: champions, augments or finished items in tiers S–D by their win rate (pulled
// towards 50 % for few games, src/tiers.ts), each with its picture and a link to its page.
import Link from 'next/link';
import { useState } from 'react';
import type { ChampionStat } from '../../src/champions';
import { seasonName } from '../../src/features/aram/aramRating';
import type { MetaRow } from '../../src/meta';
import { MIN_GAMES } from '../../src/meta';
import { PRIOR, TIERS, tiersOf, type Tier } from '../../src/tiers';
import { Augment, Img, Problem, Tabs } from '../ui/bits';
import { Filters, useFilters, type Scope } from '../ui/filters';
import { championImage, championKey, championLabel, de, itemImage, useAugments, useDragon, useItems, useLive } from '../ui/data';
import { augmentLabel, itemLabel, percent } from '../ui/meta';

type Kind = 'champions' | 'augments' | 'items';
type Head = { scope: Scope; season: { id: string; year: number; number: number; start: number } };
type Answer = Head & { champions?: ChampionStat[]; rows?: MetaRow[] };

type Tile = { key: string; href: string; label: string; picture: React.ReactNode; games: number; winRate: number | null };

const PATHS: Record<Kind, string> = { champions: '/api/champions', augments: '/api/stats/augments', items: '/api/stats/items' };

export default function TierListPage() {
  const filters = useFilters();
  const [kind, setKind] = useState<Kind>('champions');
  const path = `${PATHS[kind]}?${filters.query}`;
  const answer = useLive<Answer>(path);
  const { error, live } = answer;
  // After a tab switch the old answer stays until the new one arrives (augments and items look
  // the same): only use an answer to this path.
  const data = answer.path === path ? answer.data : null;
  const dragon = useDragon();
  const augments = useAugments();
  const items = useItems();

  const tiles: Tile[] =
    kind === 'champions'
      ? (data?.champions ?? []).map((c) => ({
          key: `c${c.championId}`,
          href: '/champions/' + (c.champion || c.championId),
          label: championLabel(dragon, c),
          picture: <Img className="champ" src={championImage(dragon, championKey(dragon, c) || undefined)} size={44} />,
          games: c.games,
          winRate: c.winRate ?? null,
        }))
      : !data?.rows
        ? []
        : kind === 'augments'
          ? data.rows.map((r) => ({
              key: `a${r.id}`,
              href: `/augments/${r.id}`,
              label: augmentLabel(augments, r.id),
              picture: <Augment id={r.id} info={augments.get(r.id)} size={44} />,
              games: r.games,
              winRate: r.winRate,
            }))
          : data.rows
              // Finished items and boots; before Data Dragon answers, all.
              .filter((r) => !items.size || (items.get(r.id) && items.get(r.id)!.kind !== 'other'))
              .map((r) => ({
                key: `i${r.id}`,
                href: `/items/${r.id}`,
                label: itemLabel(items, r.id),
                picture: <Img className="item" src={itemImage(dragon, r.id)} size={44} />,
                games: r.games,
                winRate: r.winRate,
              }));
  const ready = kind === 'champions' ? !!data?.champions : !!data?.rows;
  const tiers = ready ? tiersOf(tiles) : [];
  const few = ready ? tiles.length - tiers.length : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tier-Liste</h1>
          <p className="page-sub">{data && filters.scope === 'season' ? seasonName(data.season) : 'Alle Zeiten'}</p>
        </div>
        <div className="side">
          <span className="live" data-on={live}>
            {live ? 'Live' : 'Aktualisiert alle 5 s'}
          </span>
          <Filters {...filters} />
        </div>
      </div>

      <Tabs<Kind>
        label="Was"
        value={kind}
        onChange={setKind}
        options={[
          { id: 'champions', label: 'Champions' },
          { id: 'augments', label: 'Augments' },
          { id: 'items', label: 'Items' },
        ]}
      />

      {error && <Problem message={error} />}
      {!ready && !error && <p className="empty">Tier-Liste wird geladen …</p>}
      {ready && !tiers.length && (
        <p className="empty">Noch zu wenige Spiele: ein Eintrag braucht mindestens {MIN_GAMES} Spiele.</p>
      )}

      {tiers.length > 0 && (
        <section className="card tier-list">
          {TIERS.map((tier) => (
            <TierRow key={tier} tier={tier} tiles={tiers.filter((t) => t.tier === tier).map((t) => t.row)} />
          ))}
        </section>
      )}

      {ready && (
        <p className="fine" style={{ marginTop: 12 }}>
          Sortiert nach Siegquote, bei wenigen Spielen zu 50 % gezogen (als kämen {PRIOR} Spiele mit 50 % dazu). Die
          besten 10 % sind S, dann 20 % A, 40 % B, 20 % C und die letzten 10 % D. Nicht nach Note: die Note vergleicht
          mit dem, was der Champion üblicherweise schafft, und sagt deshalb nichts über den Champion selbst.
          {few > 0 && ` ${de(few)} mit weniger als ${MIN_GAMES} Spielen fehlen.`}
          {kind === 'items' && ' Nur fertige Items und Stiefel.'}
        </p>
      )}
    </>
  );
}

function TierRow({ tier, tiles }: { tier: Tier; tiles: Tile[] }) {
  return (
    <div className="tier-row" data-tier={tier}>
      <strong className="tier-letter" aria-label={`Stufe ${tier}`}>
        {tier}
      </strong>
      {tiles.length ? (
        <ul className="tier-tiles">
          {tiles.map((t) => (
            <li key={t.key}>
              <Link href={t.href} title={`${t.label} · Siegquote ${percent(t.winRate)} · ${de(t.games)} Spiele`}>
                {t.picture}
                <span>{t.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <span className="faint">–</span>
      )}
    </div>
  );
}
