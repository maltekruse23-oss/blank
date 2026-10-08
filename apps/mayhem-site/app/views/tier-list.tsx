'use client';
// The tier list: what is strong right now? Champions, augments or finished items in tiers S–D by
// their win rate (pulled towards 50% for few games, src/tiers.ts). Each tier is a block lit in its
// color with the entries beside it; S and A show first, the rest behind "Show all tiers".
import Link from 'next/link';
import { useState } from 'react';
import type { ChampionStat } from '../../src/champions';
import { championImage, championKey, championLabel, itemImage, useAugments, useDragon, useItems, useLive } from '../ui/data';
import { num, season } from '../ui/format';
import { augmentLabel, itemLabel, percent, wholePercent } from '../ui/meta';
import type { MetaRow } from '../../src/meta';
import { MIN_GAMES } from '../../src/meta';
import { PRIOR, TIERS, tiersOf, type Tier } from '../../src/tiers';
import { Augment, Img, Problem, Tabs, step } from '../ui/bits';
import { Filters, useFilters, type Scope } from '../ui/filters';

type Kind = 'champions' | 'augments' | 'items';
type Head = { scope: Scope; season: { id: string; year: number; number: number; start: number } };
type Answer = Head & { champions?: ChampionStat[]; rows?: MetaRow[] };

type Tile = { key: string; href: string; label: string; picture: React.ReactNode; games: number; winRate: number | null };

const PATHS: Record<Kind, string> = { champions: '/api/champions', augments: '/api/stats/augments', items: '/api/stats/items' };
/** Tiers shown before "Show all tiers". */
const FIRST_TIERS: readonly Tier[] = ['S', 'A'];

export default function TierListPage() {
  const filters = useFilters();
  const [kind, setKind] = useState<Kind>('champions');
  const [all, setAll] = useState(false);
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
          picture: <Img className="champ" src={championImage(dragon, championKey(dragon, c) || undefined)} size={40} />,
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
              picture: <Augment id={r.id} info={augments.get(r.id)} size={40} />,
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
                picture: <Img className="item" src={itemImage(dragon, r.id)} size={40} />,
                games: r.games,
                winRate: r.winRate,
              }));
  const ready = kind === 'champions' ? !!data?.champions : !!data?.rows;
  const tiers = ready ? tiersOf(tiles) : [];
  const few = ready ? tiles.length - tiers.length : 0;
  const shownTiers = all ? TIERS : TIERS.filter((t) => FIRST_TIERS.includes(t));

  return (
    <>
      <div className="page-head in">
        <div>
          <h1>Tier list</h1>
          <p className="page-sub">What is strong right now? {data && filters.scope === 'season' ? season(data.season) : 'All time'}</p>
        </div>
        <div className="side">
          <span className="live" data-on={live}>
            {live ? 'Live' : 'Updates every 5 s'}
          </span>
          <Filters {...filters} />
        </div>
      </div>

      <section className="section" aria-label="Tier list">
        <Tabs<Kind>
          label="What"
          value={kind}
          onChange={setKind}
          options={[
            { id: 'champions', label: 'Champions' },
            { id: 'augments', label: 'Augments' },
            { id: 'items', label: 'Items' },
          ]}
        />

        {error && <Problem message={error} />}
        {!ready && !error && <p className="empty">Loading tier list …</p>}
        {ready && !tiers.length && <p className="empty">{`Not enough games yet: an entry needs at least ${MIN_GAMES} games.`}</p>}

        {tiers.length > 0 && (
          <div className="tier-blocks">
            {shownTiers.map((tier, i) => (
              <TierBlock key={tier} tier={tier} index={i} tiles={tiers.filter((x) => x.tier === tier).map((x) => x.row)} />
            ))}
          </div>
        )}
        {tiers.length > 0 && (
          <button type="button" className="more" aria-expanded={all} onClick={() => setAll(!all)}>
            {all ? 'Show S and A only' : `Show all tiers (${num(tiers.filter((x) => !FIRST_TIERS.includes(x.tier)).length)} more)`}
          </button>
        )}

        {ready && (
          <p className="fine">
            {`By win rate, pulled towards 50% for few games (as if ${PRIOR} games at 50% were added). The top 10% are S, then 20% A, 40% B, 20% C and the bottom 10% D. Not by grade: the grade compares with what the champion usually achieves.`}
            {few > 0 && ` ${num(few)} with fewer than ${MIN_GAMES} games are left out.`}
            {kind === 'items' && ' Only finished items and boots.'}
          </p>
        )}
      </section>
    </>
  );
}

const TIER_WORDS: Record<Tier, string> = { S: 'Best', A: 'Strong', B: 'Good', C: 'Weak', D: 'Weakest' };

function TierBlock({ tier, tiles, index }: { tier: Tier; tiles: Tile[]; index: number }) {
  return (
    <div className="tier-block in" data-tier={tier} style={step(index)}>
      <div className="tier-side">
        <b aria-label={`Tier ${tier}`}>{tier}</b>
        <small>{TIER_WORDS[tier]}</small>
      </div>
      {tiles.length ? (
        <ul className="tier-grid">
          {tiles.map((tile) => (
            <li key={tile.key}>
              <Link href={tile.href} title={`${tile.label} · win rate ${percent(tile.winRate)} · ${num(tile.games)} games`}>
                {tile.picture}
                <span>
                  <b>{tile.label}</b>
                  <small>{wholePercent(tile.winRate)} wins</small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="tier-grid faint">–</p>
      )}
    </div>
  );
}
