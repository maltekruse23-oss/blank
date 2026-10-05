'use client';
// All champions: games, pick rate, win rate, average grade, share of SSS/MAYHEM, damage per minute and role, sortable,
// with a role filter. Every seat of a game with the values of all ten counts (no names); champions
// with fewer than five graded games are listed with "wenige Daten" and no values.
import Link from 'next/link';
import { useState } from 'react';
import type { Role } from '../../src/features/aram/aramPerformance';
import { seasonName } from '../../src/features/aram/aramRating';
import { MIN_GAMES, ROLES, type ChampionStat } from '../../src/champions';
import { GradeChip, Img, Problem } from '../ui/bits';
import { Filters, useFilters, type Scope } from '../ui/filters';
import { championImage, championKey, championLabel, de, useDragon, useLive } from '../ui/data';
import { percent } from '../ui/meta';

type Champions = {
  scope: Scope;
  season: { id: string; year: number; number: number; start: number };
  group: { code: string; name: string } | null;
  games: number;
  champions: ChampionStat[];
};
type Dragon = ReturnType<typeof useDragon>;
type Sort = 'grade' | 'games' | 'pick' | 'win' | 'top' | 'dpm' | 'name';

const SORTS: { id: Sort; label: string; of: (c: ChampionStat) => number | null }[] = [
  { id: 'games', label: 'Spiele', of: (c) => c.games },
  { id: 'pick', label: 'Pickrate', of: (c) => c.pick ?? null },
  { id: 'win', label: 'Siegquote', of: (c) => c.winRate ?? null },
  { id: 'grade', label: 'Note Ø', of: (c) => c.pct },
  { id: 'top', label: 'SSS/MAYHEM', of: (c) => c.top },
  { id: 'dpm', label: 'Schaden/Min', of: (c) => c.damagePerMinute },
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
    if (sort === 'name') return championLabel(dragon, a).localeCompare(championLabel(dragon, b), 'de');
    const x = of!(a);
    const y = of!(b);
    return (y ?? -1) - (x ?? -1) || b.games - a.games || championLabel(dragon, a).localeCompare(championLabel(dragon, b), 'de');
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
          <span className="eyebrow">
            ARAM: Mayhem · {data && filters.scope === 'season' ? seasonName(data.season) : 'Alle Zeiten'}
          </span>
          <h1>{data?.group ? `Champions · ${data.group.name}` : 'Champions'}</h1>
        </div>
        <div className="side">
          <span className="live" data-on={live}>
            {live ? 'Live' : 'Aktualisiert alle 5 s'}
          </span>
          <Filters {...filters} />
        </div>
      </div>

      {error && <Problem message={error} />}

      <section className="card">
        <div className="card-head champ-tools">
          <form className="field" onSubmit={(e) => e.preventDefault()}>
            <input aria-label="Champion suchen" placeholder="Champion suchen" value={find} onChange={(e) => setFind(e.target.value)} />
          </form>
          <label className="field">
            <select aria-label="Rolle" value={role} onChange={(e) => setRole(e.target.value as Role | '')}>
              <option value="">Alle Rollen</option>
              {(Object.keys(ROLES) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLES[r]}
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
                <th className="hide-sm">Rolle</th>
                {head('games', 'Spiele', 'right')}
                {head('pick', 'Pickrate', 'right hide-sm')}
                {head('win', 'Siegquote', 'right hide-sm')}
                {head('grade', 'Note Ø')}
                {head('top', 'SSS/MAYHEM', 'right hide-sm')}
                {head('dpm', 'Schaden/Min', 'right hide-sm')}
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, i) => (
                <ChampionRow key={c.championId} champion={c} place={i + 1} dragon={dragon} />
              ))}
            </tbody>
          </table>
          {!data && !error && <p className="empty">Champions werden geladen …</p>}
          {data && !data.champions.length && (
            <p className="empty">
              {filters.scope === 'season'
                ? 'In dieser Saison gibt es noch keine Spiele.'
                : <>Noch keine Spiele. Champions erscheinen, sobald jemand Spiele hochlädt. <a href="/mitmachen">Mitmachen</a></>}
            </p>
          )}
          {data && data.champions.length > 0 && !sorted.length && <p className="empty">Kein Champion passt zur Auswahl.</p>}
        </div>
        {data && data.champions.length > 0 && (
          <p className="fine" style={{ marginTop: 12 }}>
            {de(data.games)} Spiele, {de(data.champions.length)} Champions. Es zählt jeder Platz eines Spiels mit den
            Werten aller zehn, ab 8 Minuten. Die Pickrate ist der Anteil der Spiele, in denen der Champion dabei war. Für die
            Note zählen Sieg oder Niederlage nicht; die Siegquote steht daneben. Die Note vergleicht mit dem, was der
            Champion üblicherweise schafft, deshalb liegt ein Champion nicht schon durch seine Stärke vorn.
            {few > 0 && ` Unter ${MIN_GAMES} gewerteten Spielen stehen keine Werte (wenige Daten).`}
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
      <td className="hide-sm muted">{ROLES[c.role]}</td>
      <td className="right num">{de(c.games)}</td>
      <td className="right num hide-sm">{percent(c.pick)}</td>
      <td className="right num hide-sm">{percent(c.winRate)}</td>
      <td>{c.grade ? <GradeChip grade={c.grade} /> : <span className="badge nowrap" title={`Weniger als ${MIN_GAMES} gewertete Spiele`}>wenige Daten</span>}</td>
      <td className="right num hide-sm">{c.top === null ? '–' : `${de(c.top * 100, 1)} %`}</td>
      <td className="right num hide-sm">{c.damagePerMinute === null ? '–' : de(c.damagePerMinute)}</td>
    </tr>
  );
}
