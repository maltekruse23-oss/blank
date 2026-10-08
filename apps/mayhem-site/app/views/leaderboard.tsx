'use client';
// The leaderboard: who is the best? The top three as a podium, then one row per player with the
// rank as its one value (emblem, name, points bar) and the points below; wins, games, Top %,
// average grade and champions stay in the row's tooltip and on the profile. Tabs: by rank, by
// average grade, and the spread of the ranks. ?server=euw shows one server's players.
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { rankName, seasonOf } from '../../src/features/aram/aramRating';
import { apexLines, distributionOf, topShare } from '../../src/insights';
import { serverParam, serversIn } from '../../src/servers';
import ArchiveCounter from '../archive-counter';
import { GradeChip, GradeIcon, Histogram, Img, More, Podium, Problem, RankCell, Tabs, TierMark, points, step } from '../ui/bits';
import { championLabel, profileHref, profileImage, splitName, useDragon, useLive, useNow, type Board, type PlayerSummary } from '../ui/data';
import { meText, useMe } from '../ui/me';
import { num, season } from '../ui/format';

type View = 'rank' | 'performance' | 'spread';
type Dragon = ReturnType<typeof useDragon>;

/** Rows after the podium shown at first (with it the top 10), and added per click. */
const FIRST_ROWS = 7;
const PAGE = 50;

/** Points needed from the apex line on (aramRating.ts: SSS from 2800, MAYHEM from 3200 on the ladder). */
const APEX_POINTS = { sss: 400, mayhem: 800 } as const;

/** Everything a row does not show, for its tooltip. */
function details(p: PlayerSummary, top: number | null, dragon: Dragon) {
  const losses = p.games - p.wins;
  const champions = p.champions.map((c) => championLabel(dragon, { ...c, championName: c.champion })).join(', ');
  return [
    `${p.wins} ${p.wins === 1 ? 'win' : 'wins'}, ${losses} ${losses === 1 ? 'loss' : 'losses'} in ${p.games} games`,
    top !== null ? `Top ${Math.max(1, Math.round(top * 100))}%` : null,
    p.average ? `Average grade ${p.average.grade}` : null,
    champions ? `Plays ${champions}` : null,
    p.climbing ? 'Climbing: playing above the rank' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export default function Ranking() {
  const [view, setView] = useState<View>('rank');
  const { data, error, live } = useLive<Board>('/api/leaderboard');
  const dragon = useDragon();
  const now = useNow();

  // ?server=euw: only that server's players; places, Top % and spread count within it.
  const router = useRouter();
  const server = serverParam(useSearchParams().get('server'));
  const everyone = data?.players ?? [];
  const servers = serversIn(everyone);
  const players = server ? everyone.filter((p) => p.server === server) : everyone;
  const pickServer = (next: string) =>
    router.replace(next ? `/leaderboard?server=${next.toLowerCase()}` : '/leaderboard', { scroll: false });
  const ranks = players.map((p) => p.rank);
  const sorted =
    view !== 'performance'
      ? players
      : [...players].filter((p) => p.average).sort((a, b) => b.average!.pct - a.average!.pct || a.name.localeCompare(b.name, 'en'));
  const ranked = players.filter((p) => p.rank).length;
  const me = useMe();
  const myIndex = me && view !== 'spread' ? sorted.findIndex((p) => p.puuid === me.id) : -1;
  const jump = () => document.getElementById('me-row')?.scrollIntoView({ block: 'center' });

  const podium = sorted.slice(0, 3).map((p) => ({
    key: p.puuid,
    href: profileHref(p),
    name: splitName(p.name).name,
    title: details(p, topShare(p.rank, ranks), dragon),
    mine: p.puuid === me?.id,
    ...(view === 'performance' && p.average
      ? { mark: <GradeIcon grade={p.average.grade} size={64} />, main: <b>{`Grade ${p.average.grade}`}</b>, small: `${p.games} games` }
      : {
          mark: <TierMark rank={p.rank} size={70} />,
          main: p.rank ? (
            <b className="tier-text" data-tier={p.rank.tier.id}>
              {rankName(p.rank)}
            </b>
          ) : (
            <b className="muted">Placement</b>
          ),
          small: p.rank ? points(p.rank.points) : `${p.placed} of 5 games`,
        }),
  }));

  return (
    <>
      <div className="page-head in">
        <div>
          <h1>Leaderboard</h1>
          <p className="page-sub">
            Who is the best? {season(seasonOf(now))}
            {server && `, ${server}`}
            {`, ${num(ranked)} ranked, ${data ? num(data.trackedGames) : '–'} games`}
          </p>
        </div>
        <div className="side">
          <span className="live" data-on={live}>
            {live ? 'Live' : 'Updates every 5 s'}
          </span>
        </div>
      </div>

      {error && <Problem message={error} />}

      <section className="section" aria-label="Leaderboard">
        <div className="tools">
          <Tabs<View>
            label="Show"
            value={view}
            onChange={setView}
            options={[
              { id: 'rank', label: 'By rank' },
              { id: 'performance', label: 'By average grade' },
              { id: 'spread', label: 'Rank spread' },
            ]}
          />
          <label className="field">
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
            <button type="button" className="button small" onClick={jump}>
              {meText.jump} · <span className="mono">#{myIndex + 1}</span>
            </button>
          )}
        </div>

        {!data && !error && <p className="empty">Loading leaderboard …</p>}
        {data && view !== 'spread' && sorted.length === 0 && (
          <p className="empty">
            {server && everyone.length > 0
              ? `No players from ${server} yet.`
              : view === 'rank'
                ? 'No games in this ranking yet.'
                : 'Nobody with rated games yet.'}
          </p>
        )}

        {view !== 'spread' && sorted.length > 0 && (
          <>
            <Podium entries={podium} label="Places 1 to 3" />
            {sorted.length > 3 && (
              <More
                key={`${view}-${server}`}
                list={sorted.slice(3)}
                className="rows grid-wide"
                first={FIRST_ROWS}
                step={PAGE}
                keep={(p) => p.puuid === me?.id}
                label="Places from 4 on"
                render={(p, i) => (
                  <Row key={p.puuid} player={p} place={i + 4} view={view} dragon={dragon} title={details(p, topShare(p.rank, ranks), dragon)} mine={p.puuid === me?.id} index={i} />
                )}
              />
            )}
          </>
        )}

        {view === 'spread' && data && (
          <div className="spread in">
            <div className="card">
              <h2>How the ranks are spread</h2>
              <Histogram rows={distributionOf(ranks)} />
            </div>
            <ul className="apex">
              {apexLines(ranks).map((a) => (
                <li key={a.tier.id} className="tile" data-tone={a.tier.id === 'mayhem' ? 'gold' : 'bronze'}>
                  <TierMark rank={{ tier: a.tier, division: null, points: 0, ladder: 0 }} size={52} />
                  <span data-tier={a.tier.id}>
                    <b className="tier-text">{a.tier.name}</b>
                    <strong>from {a.lowest === null ? APEX_POINTS[a.tier.id as keyof typeof APEX_POINTS] : a.lowest} points</strong>
                    <small>
                      {a.players === 0
                        ? `Nobody yet, as rare as ${a.tier.id === 'mayhem' ? 'Challenger' : 'Grandmaster'}`
                        : `${a.players} ${a.players === 1 ? 'player' : 'players'}`}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card in" style={step(2)} aria-labelledby="how">
        <h2 id="how">How it counts</h2>
        <p className="fine">
          Every game gets a grade from F to MAYHEM from all stats, compared with what the champion usually does. Win or loss
          doesn&apos;t count. After 5 games you get a rank; then each grade moves it by up to 30 points.{' '}
          <Link href="/scoring">How it works</Link>
        </p>
        <ArchiveCounter />
      </section>
    </>
  );
}

function Row({
  player: p,
  place,
  view,
  dragon,
  title,
  mine,
  index,
}: {
  player: PlayerSummary;
  place: number;
  view: View;
  dragon: Dragon;
  title: string;
  mine: boolean;
  index: number;
}) {
  const { name, tag } = splitName(p.name);
  return (
    <li className="row in" data-place={place} data-me={mine || undefined} id={mine ? 'me-row' : undefined} style={step(index)}>
      <span className="place">{place}</span>
      <Img className="avatar" src={profileImage(dragon, p.icon)} size={36} />
      <span className="who">
        <Link className="stretch name" href={profileHref(p)} title={title}>
          <span>{name}</span>
          {tag && <span className="tag hide-sm">#{tag}</span>}
          {p.server && <span className="server">{p.server}</span>}
          {mine && <span className="you">{meText.you}</span>}
        </Link>
        {p.climbing && <small className="up">Climbing</small>}
      </span>
      {view === 'performance' ? (
        <span className="value">
          {p.average ? <GradeChip grade={p.average.grade} /> : <b className="faint">–</b>}
          <small>{p.games} games</small>
        </span>
      ) : (
        <RankCell rank={p.rank} placed={p.placed} />
      )}
    </li>
  );
}
