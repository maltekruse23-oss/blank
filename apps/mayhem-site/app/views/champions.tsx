'use client';
// All champions: games, pick rate, win rate, average grade, share of SSS/MAYHEM, damage per minute and role, sortable,
// with a role filter. Every seat of a game with the values of all ten counts (no names); champions
// with fewer than five graded games are listed with "little data" and no values.
import Link from 'next/link';
import { useState } from 'react';
import type { Role } from '../../src/features/aram/aramPerformance';
import { MIN_GAMES, ROLES, roleName, type ChampionStat } from '../../src/champions';
import { GradeChip, Img, Problem } from '../ui/bits';
import { Filters, useFilters, type Scope } from '../ui/filters';
import { championImage, championKey, championLabel, useDragon, useLive } from '../ui/data';
import { percent } from '../ui/meta';
import { num, season } from '../ui/format';

type Champions = {
  scope: Scope;
  season: { id: string; year: number; number: number; start: number };
  games: number;
  champions: ChampionStat[];
};
type Dragon = ReturnType<typeof useDragon>;
type Sort = 'grade' | 'games' | 'pick' | 'win' | 'top' | 'dpm' | 'name';

const SORTS: { id: Sort; of: (c: ChampionStat) => number | null }[] = [
  { id: 'games', of: (c) => c.games },
  { id: 'pick', of: (c) => c.pick ?? null },
  { id: 'win', of: (c) => c.winRate ?? null },
  { id: 'grade', of: (c) => c.pct },
  { id: 'top', of: (c) => c.top },
  { id: 'dpm', of: (c) => c.damagePerMinute },
];

/** By the key the server knows (from an upload), otherwise by ID. */
const linkOf = (c: ChampionStat) => '/champions/' + (c.champion || c.championId);

export default function ChampionsPage() {
  const filters = useFilters();
  const { data, error, live } = useLive<Champions>('/api/champions?' + filters.query);
  const dragon = useDragon();
  const [sort, setSort] = useState<Sort>('grade');
  const [role, setRole] = useState<Role | ''>('');
  const [find, setFind] = useState('');

  const q = find.trim().toLowerCase();
  const shown = (data?.champions ?? []).filter(
    (c) => (!role || c.role === role) && (!q || championLabel(dragon, c).toLowerCase().includes(q)),
  );
  const of = SORTS.find((s) => s.id === sort)?.of;
  const sorted = [...shown].sort((a, b) => {
    if (sort === 'name') return championLabel(dragon, a).localeCompare(championLabel(dragon, b), 'en');
    const x = of!(a);
    const y = of!(b);
    return (y ?? -1) - (x ?? -1) || b.games - a.games || championLabel(dragon, a).localeCompare(championLabel(dragon, b), 'en');
  });
  const few = data?.champions.filter((c) => c.pct === null).length ?? 0;

  const head = (id: Sort, label: string, className = '') => (
    <th className={className} aria-sort={sort === id ? (id === 'name' ? 'ascending' : 'descending') : undefined}>
      <button type="button" className="sort" data-on={sort === id} onClick={() => setSort(id)}>
        {label}
      </button>
    </th>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Champions</h1>
          <p className="page-sub">{data && filters.scope === 'season' ? season(data.season) : 'All time'}</p>
        </div>
        <div className="side">
          <span className="live" data-on={live}>
            {live ? 'Live' : 'Updates every 5 s'}
          </span>
          <Filters {...filters} />
        </div>
      </div>

      {error && <Problem message={error} />}

      <section className="card">
        <div className="card-head champ-tools">
          <form className="field" onSubmit={(e) => e.preventDefault()}>
            <input aria-label="Search champions" placeholder="Search champions" value={find} onChange={(e) => setFind(e.target.value)} />
          </form>
          <label className="field">
            <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as Role | '')}>
              <option value="">All roles</option>
              {(Object.keys(ROLES) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {roleName(r)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="hide-sm">#</th>
                {head('name', 'Champion')}
                <th className="hide-sm">Role</th>
                {head('games', 'Games', 'right')}
                {head('pick', 'Pick rate', 'right hide-sm')}
                {head('win', 'Win rate', 'right hide-sm')}
                {head('grade', 'Avg grade')}
                {head('top', 'SSS/MAYHEM', 'right hide-sm')}
                {head('dpm', 'Damage/min', 'right hide-sm')}
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, i) => (
                <ChampionRow key={c.championId} champion={c} place={i + 1} dragon={dragon} />
              ))}
            </tbody>
          </table>
          {!data && !error && <p className="empty">Loading champions …</p>}
          {data && !data.champions.length && (
            <p className="empty">
              {filters.scope === 'season' ? (
                'No games this season yet.'
              ) : (
                <>No games yet. Champions show up as soon as someone uploads games. <a href="/join">Join</a></>
              )}
            </p>
          )}
          {data && data.champions.length > 0 && !sorted.length && (
            <p className="empty">No champion matches the filter.</p>
          )}
        </div>
        {data && data.champions.length > 0 && (
          <p className="fine" style={{ marginTop: 12 }}>
            {`${num(data.games)} games, ${num(data.champions.length)} champions. Every seat of a game with the values of all ten counts, from 8 minutes on. The pick rate is the share of games the champion was in. Win or loss does not count for the grade; the win rate is shown next to it. The grade compares with what the champion usually achieves, so a champion does not lead just by being strong.`}
            {few > 0 &&
              ` Below ${MIN_GAMES} rated games there are no values (little data).`}
          </p>
        )}
      </section>
    </>
  );
}

function ChampionRow({ champion: c, place, dragon }: { champion: ChampionStat; place: number; dragon: Dragon }) {
  const name = championLabel(dragon, c);
  return (
    <tr>
      <td className="place num hide-sm">{place}</td>
      <td>
        <Link className="who" href={linkOf(c)}>
          <Img className="champ" src={championImage(dragon, championKey(dragon, c) || undefined)} size={28} />
          <b>{name}</b>
        </Link>
      </td>
      <td className="hide-sm muted">{roleName(c.role)}</td>
      <td className="right num">{num(c.games)}</td>
      <td className="right num hide-sm">{percent(c.pick)}</td>
      <td className="right num hide-sm">{percent(c.winRate)}</td>
      <td>
        {c.grade ? (
          <GradeChip grade={c.grade} />
        ) : (
          <span className="badge nowrap" title={`Fewer than ${MIN_GAMES} rated games`}>
            little data
          </span>
        )}
      </td>
      <td className="right num hide-sm">{percent(c.top)}</td>
      <td className="right num hide-sm">{c.damagePerMinute === null ? '–' : num(c.damagePerMinute)}</td>
    </tr>
  );
}
