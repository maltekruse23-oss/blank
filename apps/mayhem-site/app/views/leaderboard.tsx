'use client';
// The leaderboard (op.gg-like): the distribution of the tiers with the apex lines beside it, the
// table over the full width (by rank or by performance), then how it counts and the way to join.
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { seasonOf } from '../../src/features/aram/aramRating';
import { apexLines, distributionOf, topShare } from '../../src/insights';
import { serverParam, serversIn } from '../../src/servers';
import ArchiveCounter from '../archive-counter';
import { GradeChip, Histogram, Img, Problem, RankLine, Tabs, TierMark } from '../ui/bits';
import { championImage, championKey, profileHref, profileImage, splitName, useDragon, useLive, useNow, type Board, type PlayerSummary } from '../ui/data';
import { meText, useMe } from '../ui/me';
import { num, season } from '../ui/format';

type View = 'rank' | 'performance';

/** Rows shown at first and added per click (everyone from the archive is on the board). */
const PAGE = 50;

/** MP needed from the apex line on (aramRating.ts: SSS from 2800, MAYHEM from 3200 on the ladder). */
const APEX_MP = { sss: 400, mayhem: 800 } as const;

export default function Ranking() {
  const [view, setView] = useState<View>('rank');
  const [limit, setLimit] = useState(PAGE);
  const { data, error, live } = useLive<Board>('/api/leaderboard');
  const dragon = useDragon();
  const now = useNow();

  // ?server=euw: only that server's players; places, Top % and distribution count within it.
  const router = useRouter();
  const server = serverParam(useSearchParams().get('server'));
  const everyone = data?.players ?? [];
  const servers = serversIn(everyone);
  const players = server ? everyone.filter((p) => p.server === server) : everyone;
  const pickServer = (next: string) => {
    setLimit(PAGE);
    router.replace(next ? `/leaderboard?server=${next.toLowerCase()}` : '/leaderboard', { scroll: false });
  };
  const ranks = players.map((p) => p.rank);
  const sorted =
    view === 'rank'
      ? players
      : [...players]
          .filter((p) => p.average)
          .sort((a, b) => b.average!.pct - a.average!.pct || a.name.localeCompare(b.name, 'en'));
  const ranked = players.filter((p) => p.rank).length;
  const me = useMe();
  const myIndex = me ? sorted.findIndex((p) => p.puuid === me.id) : -1;
  const jump = () => {
    if (myIndex < 0) return;
    setLimit((l) => Math.max(l, Math.ceil((myIndex + 1) / PAGE) * PAGE));
    // After the rows are there.
    requestAnimationFrame(() => document.getElementById('me-row')?.scrollIntoView({ block: 'center' }));
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Leaderboard</h1>
          <p className="page-sub num">
            {season(seasonOf(now))} ·{' '}
            {server && <>{server} · </>}
            {`${num(ranked)} ranked, ${num(players.length - ranked)} in placement, ${data ? num(data.trackedGames) : '–'} games`}
          </p>
        </div>
        <div className="side">
          <span className="live" data-on={live}>
            {live ? 'Live' : 'Updates every 5 s'}
          </span>
        </div>
      </div>

      {error && <Problem message={error} />}

      <section className="ladder-top" aria-label="Rank distribution">
        <div className="ladder-dist">
          <h2>Distribution</h2>
          <Histogram rows={distributionOf(ranks)} />
        </div>
        <ul className="apex-lines">
          {apexLines(ranks).map((a) => (
            <li key={a.tier.id} data-tier={a.tier.id}>
              <TierMark rank={{ tier: a.tier, division: null, points: 0, ladder: 0 }} size={48} />
              <span>
                <b className="tier-text">{a.tier.name}</b>{' '}
                <strong className="num">
                  from {a.lowest === null ? APEX_MP[a.tier.id as keyof typeof APEX_MP] : a.lowest} MP
                </strong>
                <small className="muted">
                  {a.players === 0
                    ? `Nobody yet, as rare as ${a.tier.id === 'mayhem' ? 'Challenger' : 'Grandmaster'}`
                    : `${a.players} ${a.players === 1 ? 'player' : 'players'}`}
                </small>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Table">
        <div className="ladder-tools">
          <Tabs<View>
            label="Sort"
            value={view}
            onChange={(v) => {
              setView(v);
              setLimit(PAGE);
            }}
            options={[
              { id: 'rank', label: 'By rank' },
              { id: 'performance', label: 'By avg performance' },
            ]}
          />
          <label className="server-filter">
            <span>Server</span>
            <select value={server ?? ''} onChange={(e) => pickServer(e.target.value)}>
              <option value="">All servers</option>
              {server && !servers.some((s) => s.server === server) && <option value={server}>{server}</option>}
              {servers.map((s) => (
                <option key={s.server} value={s.server}>
                  {s.server} ({num(s.players)})
                </option>
              ))}
            </select>
          </label>
          {myIndex >= 0 && (
            <button type="button" className="button me-jump" onClick={jump}>
              {meText.jump} · <span className="num">#{myIndex + 1}</span>
            </button>
          )}
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>{view === 'rank' ? 'Rank' : 'Avg performance'}</th>
                <th className="hide-sm">{view === 'rank' ? 'Avg performance' : 'Rank'}</th>
                <th className="hide-sm">Champions</th>
                <th className="hide-sm">Form</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, limit).map((p, i) => (
                <Row key={p.puuid} player={p} place={i + 1} view={view} dragon={dragon} top={topShare(p.rank, ranks)} mine={p.puuid === me?.id} />
              ))}
            </tbody>
          </table>
          {sorted.length > limit && (
            <button type="button" className="button more" onClick={() => setLimit((l) => l + PAGE)}>
              {`Show ${Math.min(PAGE, sorted.length - limit)} more of ${sorted.length - limit}`}
            </button>
          )}
          {!data && !error && <p className="empty">Loading leaderboard …</p>}
          {data && sorted.length === 0 && (
            <p className="empty">
              {server && everyone.length > 0
                ? `No players from ${server} yet.`
                : view === 'rank'
                ? 'No games in this ranking yet.'
                : 'Nobody with rated games yet.'}
            </p>
          )}
        </div>
      </section>

      <div className="ladder-notes">
        <section>
          <h2>How it counts</h2>
          <p className="fine">
            Every game gets a grade from <GradeChip grade="F" /> to <GradeChip grade="MAYHEM" />, from all stats compared to
            what the champion usually does. Win or loss doesn&apos;t count. After 5 games you get a rank, then every grade is
            worth up to ±30 MP. Games of 8 minutes or more with the stats of all ten players are rated.{' '}
            <a href="/scoring">Learn more</a>
          </p>
        </section>
        <section>
          <h2>Join</h2>
          <ArchiveCounter />
        </section>
      </div>
    </>
  );
}

function Row({
  player: p,
  place,
  view,
  dragon,
  top,
  mine,
}: {
  player: PlayerSummary;
  place: number;
  view: View;
  dragon: ReturnType<typeof useDragon>;
  top: number | null;
  mine: boolean;
}) {
  const { name, tag } = splitName(p.name);
  const href = profileHref(p);
  const losses = p.games - p.wins;
  const average = p.average ? <GradeChip grade={p.average.grade} /> : <span className="faint">–</span>;
  const rank = <RankLine rank={p.rank} placed={p.placed} />;
  return (
    <tr data-place={place} data-me={mine || undefined} id={mine ? 'me-row' : undefined}>
      <td className="place num">{place}</td>
      <td>
        <Link className="who" href={href}>
          <Img className="avatar" src={profileImage(dragon, p.icon)} size={34} />
          <span>
            <b>
              {name}
              {tag && <span className="faint">#{tag}</span>}
              {mine && <span className="me-tag">{meText.you}</span>}
            </b>
            <small className="num">
              {p.server && <span className="server-tag">{p.server}</span>}
              {`${p.wins}W ${losses}L · ${p.games} games`}
              {top !== null ? ` · Top ${Math.max(1, Math.round(top * 100))}%` : ''}
              {p.climbing ? ' · climbing' : ''}
            </small>
          </span>
        </Link>
      </td>
      <td>{view === 'rank' ? rank : average}</td>
      <td className="hide-sm">{view === 'rank' ? average : rank}</td>
      <td className="hide-sm">
        <div className="champs">
          {p.champions.map((c) => (
            <Img key={c.championId} className="champ" src={championImage(dragon, championKey(dragon, c) || undefined)} alt={`${dragon?.champions.get(c.championId)?.name ?? c.champion}, ${c.games} games`} size={28} />
          ))}
        </div>
      </td>
      <td className="hide-sm">
        <div className="chips">
          {p.last6.map((h) => (
            <GradeChip key={h.gameId} grade={h.grade} small />
          ))}
        </div>
      </td>
    </tr>
  );
}
