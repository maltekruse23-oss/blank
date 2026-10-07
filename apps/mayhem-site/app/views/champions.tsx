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
import { useLang } from '../ui/i18n';
import { percentIn } from '../ui/meta';

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
  const { lang, t, href, num, season } = useLang();
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
    if (sort === 'name') return championLabel(dragon, a).localeCompare(championLabel(dragon, b), lang);
    const x = of!(a);
    const y = of!(b);
    return (y ?? -1) - (x ?? -1) || b.games - a.games || championLabel(dragon, a).localeCompare(championLabel(dragon, b), lang);
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
          <p className="page-sub">{data && filters.scope === 'season' ? season(data.season) : t('All time', 'Alle Zeiten')}</p>
        </div>
        <div className="side">
          <span className="live" data-on={live}>
            {live ? 'Live' : t('Updates every 5 s', 'Aktualisiert alle 5 s')}
          </span>
          <Filters {...filters} />
        </div>
      </div>

      {error && <Problem message={error} />}

      <section className="card">
        <div className="card-head champ-tools">
          <form className="field" onSubmit={(e) => e.preventDefault()}>
            <input aria-label={t('Search champions', 'Champion suchen')} placeholder={t('Search champions', 'Champion suchen')} value={find} onChange={(e) => setFind(e.target.value)} />
          </form>
          <label className="field">
            <select aria-label={t('Role', 'Rolle')} value={role} onChange={(e) => setRole(e.target.value as Role | '')}>
              <option value="">{t('All roles', 'Alle Rollen')}</option>
              {(Object.keys(ROLES) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {roleName(r, lang)}
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
                <th className="hide-sm">{t('Role', 'Rolle')}</th>
                {head('games', t('Games', 'Spiele'), 'right')}
                {head('pick', t('Pick rate', 'Pickrate'), 'right hide-sm')}
                {head('win', t('Win rate', 'Siegquote'), 'right hide-sm')}
                {head('grade', t('Avg grade', 'Note Ø'))}
                {head('top', 'SSS/MAYHEM', 'right hide-sm')}
                {head('dpm', t('Damage/min', 'Schaden/Min'), 'right hide-sm')}
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, i) => (
                <ChampionRow key={c.championId} champion={c} place={i + 1} dragon={dragon} />
              ))}
            </tbody>
          </table>
          {!data && !error && <p className="empty">{t('Loading champions …', 'Champions werden geladen …')}</p>}
          {data && !data.champions.length && (
            <p className="empty">
              {filters.scope === 'season' ? (
                t('No games this season yet.', 'In dieser Saison gibt es noch keine Spiele.')
              ) : lang === 'de' ? (
                <>Noch keine Spiele. Champions erscheinen, sobald jemand Spiele hochlädt. <a href={href('/join')}>Mitmachen</a></>
              ) : (
                <>No games yet. Champions show up as soon as someone uploads games. <a href={href('/join')}>Join</a></>
              )}
            </p>
          )}
          {data && data.champions.length > 0 && !sorted.length && (
            <p className="empty">{t('No champion matches the filter.', 'Kein Champion passt zur Auswahl.')}</p>
          )}
        </div>
        {data && data.champions.length > 0 && (
          <p className="fine" style={{ marginTop: 12 }}>
            {t(
              `${num(data.games)} games, ${num(data.champions.length)} champions. Every seat of a game with the values of all ten counts, from 8 minutes on. The pick rate is the share of games the champion was in. Win or loss does not count for the grade; the win rate is shown next to it. The grade compares with what the champion usually achieves, so a champion does not lead just by being strong.`,
              `${num(data.games)} Spiele, ${num(data.champions.length)} Champions. Es zählt jeder Platz eines Spiels mit den Werten aller zehn, ab 8 Minuten. Die Pickrate ist der Anteil der Spiele, in denen der Champion dabei war. Für die Note zählen Sieg oder Niederlage nicht; die Siegquote steht daneben. Die Note vergleicht mit dem, was der Champion üblicherweise schafft, deshalb liegt ein Champion nicht schon durch seine Stärke vorn.`,
            )}
            {few > 0 &&
              t(
                ` Below ${MIN_GAMES} rated games there are no values (little data).`,
                ` Unter ${MIN_GAMES} gewerteten Spielen stehen keine Werte (wenige Daten).`,
              )}
          </p>
        )}
      </section>
    </>
  );
}

function ChampionRow({ champion: c, place, dragon }: { champion: ChampionStat; place: number; dragon: Dragon }) {
  const { lang, t, href, num } = useLang();
  const percent = percentIn(lang);
  const name = championLabel(dragon, c);
  return (
    <tr>
      <td className="place num hide-sm">{place}</td>
      <td>
        <Link className="who" href={href(linkOf(c))}>
          <Img className="champ" src={championImage(dragon, championKey(dragon, c) || undefined)} size={28} />
          <b>{name}</b>
        </Link>
      </td>
      <td className="hide-sm muted">{roleName(c.role, lang)}</td>
      <td className="right num">{num(c.games)}</td>
      <td className="right num hide-sm">{percent(c.pick)}</td>
      <td className="right num hide-sm">{percent(c.winRate)}</td>
      <td>
        {c.grade ? (
          <GradeChip grade={c.grade} />
        ) : (
          <span className="badge nowrap" title={t(`Fewer than ${MIN_GAMES} rated games`, `Weniger als ${MIN_GAMES} gewertete Spiele`)}>
            {t('little data', 'wenige Daten')}
          </span>
        )}
      </td>
      <td className="right num hide-sm">{percent(c.top)}</td>
      <td className="right num hide-sm">{c.damagePerMinute === null ? '–' : num(c.damagePerMinute)}</td>
    </tr>
  );
}
