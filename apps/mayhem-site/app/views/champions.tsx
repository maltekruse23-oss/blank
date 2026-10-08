'use client';
// All champions: which ones win most? One row per champion with the win rate as its one number and
// the games below; pick rate, average grade, SSS/MAYHEM share and damage per minute in the tooltip.
// Strongest first (win rate pulled towards 50 % for few games), a role filter and a search. Every
// seat of a game with the values of all ten counts (no names).
import { useState } from 'react';
import type { Role } from '../../src/features/aram/aramPerformance';
import { MIN_GAMES, ROLES, roleName, type ChampionStat } from '../../src/champions';
import { Img, More, Problem } from '../ui/bits';
import { Filters, useFilters, type Scope } from '../ui/filters';
import { championImage, championKey, championLabel, useDragon, useLive } from '../ui/data';
import { gamesText, MetaRow, percent, SortSelect, sortRows, strongest, type Sort } from '../ui/meta';
import { num, season } from '../ui/format';

type Champions = {
  scope: Scope;
  season: { id: string; year: number; number: number; start: number };
  games: number;
  champions: ChampionStat[];
};

/** By the key the server knows (from an upload), otherwise by ID. */
const linkOf = (c: ChampionStat) => '/champions/' + (c.champion || c.championId);

/** Everything a row does not show, for its tooltip. */
const more = (c: ChampionStat) =>
  [
    c.winRate === null ? `Win rate from ${MIN_GAMES} games on` : `Win rate ${percent(c.winRate)}`,
    gamesText(c.games),
    `In ${percent(c.pick)} of games`,
    c.grade ? `Average grade ${c.grade}` : null,
    c.top !== null ? `SSS or MAYHEM in ${percent(c.top)}` : null,
    c.damagePerMinute !== null ? `${num(c.damagePerMinute)} damage per minute` : null,
  ]
    .filter(Boolean)
    .join(' · ');

export default function ChampionsPage() {
  const filters = useFilters();
  const { data, error, live } = useLive<Champions>('/api/champions?' + filters.query);
  const dragon = useDragon();
  const [sort, setSort] = useState<Sort>('strong');
  const [role, setRole] = useState<Role | ''>('');
  const [find, setFind] = useState('');

  const name = (c: ChampionStat) => championLabel(dragon, c);
  const q = find.trim().toLowerCase();
  const shown = sortRows(
    (data?.champions ?? []).filter((c) => (!role || c.role === role) && (!q || name(c).toLowerCase().includes(q))),
    sort,
    name,
  );
  const best = strongest(shown, name)[0];
  const top = best?.winRate != null && shown.length > 1 ? best.championId : null;

  return (
    <>
      <div className="page-head in">
        <div>
          <h1>Champions</h1>
          <p className="page-sub">
            Which champions win most? {data && filters.scope === 'season' ? season(data.season) : 'All time'}
            {data ? ` · ${gamesText(data.games)}` : ''}
          </p>
        </div>
        <div className="side">
          <span className="live" data-on={live}>
            {live ? 'Live' : 'Updates every 5 s'}
          </span>
          <Filters {...filters} />
        </div>
      </div>

      {error && <Problem message={error} />}

      <section className="section" aria-label="Champions">
        <div className="tools">
          <label className="field">
            <span className="sr">Search champions</span>
            <input type="search" placeholder="Search champions" value={find} onChange={(e) => setFind(e.target.value)} />
          </label>
          <div className="chips" role="group" aria-label="Role">
            <button type="button" aria-pressed={role === ''} onClick={() => setRole('')}>
              All
            </button>
            {(Object.keys(ROLES) as Role[]).map((r) => (
              <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)}>
                {roleName(r)}
              </button>
            ))}
          </div>
          <SortSelect value={sort} onChange={setSort} />
        </div>

        {!data && !error && <p className="empty">Loading champions …</p>}
        {data && !data.champions.length && (
          <p className="empty">
            {filters.scope === 'season' ? (
              'No games this season yet.'
            ) : (
              <>
                No games yet. Champions show up as soon as someone uploads games. <a href="/join">Join</a>
              </>
            )}
          </p>
        )}
        {data && data.champions.length > 0 && !shown.length && <p className="empty">No champion matches the filter.</p>}

        {shown.length > 0 && (
          <More
            key={`${role}-${sort}`}
            list={shown}
            className="rows grid"
            first={12}
            all={!!q}
            label="Champions"
            render={(c, i) => (
              <MetaRowTitled key={c.championId} champion={c} index={i} top={c.championId === top} dragon={dragon} />
            )}
          />
        )}

        {data && data.champions.length > 0 && (
          <p className="fine">
            {`Strongest = most wins, with few games pulled towards 50%. Every seat of a game with the values of all ten counts, from 8 minutes on; win rate from ${MIN_GAMES} games on. Hover a row for pick rate, average grade and damage.`}
          </p>
        )}
      </section>
    </>
  );
}

function MetaRowTitled({ champion: c, index, top, dragon }: { champion: ChampionStat; index: number; top: boolean; dragon: ReturnType<typeof useDragon> }) {
  return (
    <MetaRow
      index={index}
      href={linkOf(c)}
      picture={<Img className="champ" src={championImage(dragon, championKey(dragon, c) || undefined)} size={40} />}
      name={championLabel(dragon, c)}
      sub={roleName(c.role)}
      stat={{ games: c.games, pick: c.pick, winRate: c.winRate ?? null, graded: c.graded, pct: c.pct, grade: c.grade }}
      top={top}
      title={more(c)}
    />
  );
}
