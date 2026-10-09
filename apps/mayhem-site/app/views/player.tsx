'use client';
// A player's profile: how good is this player? The answer on top (rank card with emblem and points
// bar, win rate and games, the rarest tags), then tabs: the recent games (match history with the
// grade on the right, all ten players on click), all matches, champions, play style (tags,
// strengths, preferences, form) and earlier seasons.
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { AramEntry } from '../../src/adapters/aram';
import { rankName, seasonOf } from '../../src/features/aram/aramRating';
import { AXES, badgesOf, championsOf, formLine, lobbyPerformances, mvpOf, radarOf } from '../../src/insights';
import { Augment, fillOf, GradeChip, GradeMark, Img, LadderChart, More, points, Problem, Radar, Sparkline, Tabs, TierMark, step } from '../ui/bits';
import {
  championImage,
  championKey,
  championLabel,
  duration,
  itemImage,
  profileHref,
  profileImage,
  splitName,
  useAugments,
  useDragon,
  useLive,
  useNow,
  useTagCensus,
  type Profile,
  type ProfileStep,
} from '../ui/data';
import { num, date, season as seasonText, ago } from '../ui/format';
import { meText, setMe, useMe } from '../ui/me';
import { MIN_GAMES, preferencesOf, rankedTags, statsOf } from '../../src/tags';
import { MIN_GAMES as RATE_GAMES } from '../../src/meta';
import { gamesText } from '../ui/meta';

type Tab = 'overview' | 'matches' | 'champions' | 'style' | 'seasons';
type Dragon = ReturnType<typeof useDragon>;

/** The address part as typed (a Riot ID like "Name Zwei-EUW" may arrive still encoded). */
function decoded(part: string) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/** "only 4%": how rare a tag is among all players. */
const shareText = (share: number) => {
  const n = share < 0.01 ? '<1' : String(Math.round(share * 100));
  return share < 0.5 ? `only ${n}%` : `${n}%`;
};

export default function PlayerPage() {
  const params = useParams<{ puuid: string }>();
  const { data, error, missing } = useLive<Profile>('/api/players/' + encodeURIComponent(decoded(params.puuid)));
  const dragon = useDragon();
  const census = useTagCensus();
  const [tab, setTab] = useState<Tab>('overview');
  const now = useNow();
  const router = useRouter();
  // Every address (an old link with a PUUID, a public id, a Riot ID in other case) moves to the
  // Riot ID like op.gg, or to the public id when the name is hidden: no PUUID in the address bar.
  const home = data?.id ? profileHref({ puuid: data.id, name: data.name }) : null;
  const here = profileHref({ puuid: decoded(params.puuid) });
  const moved = home && home.toLowerCase() !== here.toLowerCase() ? home : null;
  useEffect(() => {
    if (moved) router.replace(moved);
  }, [moved, router]);

  if (error) return <Problem message={error} missing={missing} />;
  if (!data) return <p className="empty">Loading player …</p>;

  const history = data.history;
  const season = seasonOf(now);
  const thisSeason = history.filter((h) => h.season === season.id);
  const recent = history.slice(-20);
  const radar = radarOf(recent.map((h) => h.entry));
  const stats = census ? statsOf(history.map((h) => ({ entry: h.entry, pct: h.mark.pct })), new Set(census.prismatic)) : null;
  const tags = stats && census ? rankedTags(stats, census) : [];
  // The rarest tags stand at the top; without them (few games) the playstyle badges as before.
  const badges = tags.length
    ? tags.slice(0, 3).map((g) => ({ id: g.id, name: g.name, hint: `${g.hint} · ${shareText(g.share)}` }))
    : badgesOf(radar, recent.length);
  const { name, tag } = splitName(data.name);
  const losses = data.games - data.wins;
  const newest = [...history].reverse();

  return (
    <>
      <Link className="back" href="/leaderboard">
        ← Leaderboard
      </Link>

      <section className="profile-head" aria-label="Player">
        <div className="profile-id in">
          <Img className="avatar" src={profileImage(dragon, data.icon)} size={84} />
          <div>
            <h1>
              {name}
              {tag && <small>#{tag}</small>}
            </h1>
            <div className="profile-line">
              {data.server && (
                <span className="server" title="Server of the latest archived game">
                  {data.server}
                </span>
              )}
              <span title={`${data.wins} wins, ${losses} losses`}>
                <b>{data.games ? `${Math.round((data.wins / data.games) * 100)}%` : '–'}</b> wins
              </span>
              <span>{gamesText(data.games)}</span>
              {data.average && (
                <span>
                  average <GradeChip grade={data.average.grade} small />
                </span>
              )}
              {history.length > 0 && <span>{`last ${ago(history[history.length - 1].entry.at, now)}`}</span>}
            </div>
            <div className="pills">
              <MeButton id={data.id ?? (/^a[1-9][0-9]*$/.test(params.puuid) ? params.puuid : null)} name={data.name} />
              {data.climbing && (
                <span className="pill up" title="Playing above the rank, so the gains are bigger.">
                  Climbing
                </span>
              )}
              {badges.map((b, i) => (
                <span className={i === 0 && tags.length ? 'pill gold' : 'pill'} key={b.id} title={b.hint}>
                  {b.name}
                </span>
              ))}
            </div>
          </div>
        </div>
        <RankCard profile={data} season={seasonText(season)} />
      </section>

      <section className="section in" style={step(2)} aria-label="Details">
        <Tabs<Tab>
          label="Sections"
          value={tab}
          onChange={setTab}
          options={[
            { id: 'overview', label: 'Overview' },
            { id: 'matches', label: <>Matches<small>{history.length}</small></> },
            { id: 'champions', label: 'Champions' },
            { id: 'style', label: 'Play style' },
            { id: 'seasons', label: 'Seasons' },
          ]}
        />

        {tab === 'overview' && (
          <div className="split">
            <section className="section" aria-labelledby="recent">
              <div className="section-head">
                <h2 id="recent">Recent games</h2>
                {history.length > 5 && (
                  <button type="button" className="link-button" onClick={() => setTab('matches')}>
                    {`All ${history.length} matches`}
                  </button>
                )}
              </div>
              <Matches steps={newest.slice(0, 5)} dragon={dragon} name={data.name} now={now} />
              <p className="fine">
                Games missing? Only uploaded games show up. <Link href="/join">Join</Link> and all your Mayhem games count.
              </p>
            </section>
            <section className="card" aria-labelledby="way">
              <h2 id="way">{`This season · ${thisSeason.length} games`}</h2>
              <LadderChart points={thisSeason.filter((h) => h.after).map((h) => ({ ladder: h.after!.ladder, change: h.change }))} />
              <p className="fine">Rank points after each game. Dots mark a promotion or demotion.</p>
            </section>
          </div>
        )}

        {tab === 'matches' && (
          <>
            {newest.length ? (
              <More
                list={newest}
                first={10}
                step={20}
                label="Matches"
                render={(s, i) => <Match key={s.entry.gameId} step={s} dragon={dragon} name={data.name} now={now} index={i} />}
              />
            ) : (
              <p className="empty">No rated games yet.</p>
            )}
          </>
        )}
        {tab === 'champions' && <Champions steps={history} dragon={dragon} />}
        {tab === 'style' && <Style steps={history} recent={recent.length} radar={radar} tags={tags} census={!!census} dragon={dragon} />}
        {tab === 'seasons' && <Seasons profile={data} now={now} />}
      </section>
    </>
  );
}

function RankCard({ profile: p, season }: { profile: Profile; season: string }) {
  return (
    <div className="glass rank-card in" data-tier={p.rank?.tier.id} style={step(1)}>
      <TierMark rank={p.rank} size={88} />
      <div>
        <small>{season}</small>
        {p.rank ? (
          <>
            <span className="rank-name tier-text">{rankName(p.rank)}</span>
            <span className="bar" aria-hidden>
              <span style={{ width: `${fillOf(p.rank)}%` }} />
            </span>
            <small>
              {points(p.rank.points)}
              {p.rank.division !== null ? ' of 100' : ''}
            </small>
          </>
        ) : (
          <>
            <span className="rank-name muted">Placement</span>
            <span className="bar quiet" aria-hidden>
              <span style={{ width: `${p.placed * 20}%` }} />
            </span>
            <small>{`${p.placed} of 5 games, then the rank shows`}</small>
          </>
        )}
      </div>
    </div>
  );
}

// ---- Matches --------------------------------------------------------------------------------

function Matches({ steps, dragon, name, now }: { steps: ProfileStep[]; dragon: Dragon; name: string; now: number }) {
  if (!steps.length) return <p className="empty">No rated games yet.</p>;
  return (
    <ul className="rows" aria-label="Recent games">
      {steps.map((s, i) => (
        <Match key={s.entry.gameId} step={s} dragon={dragon} name={name} now={now} index={i} />
      ))}
    </ul>
  );
}

/** One game: result and champion with K/D/A, the grade and its points on the right; a click shows
 * the facts, the build and all ten players. */
function Match({ step: s, dragon, name, now, index }: { step: ProfileStep; dragon: Dragon; name: string; now: number; index: number }) {
  const [open, setOpen] = useState(false);
  const e = s.entry;
  const id = `match-${e.gameId}`;
  const champion = championLabel(dragon, e);
  return (
    <li className="match in" data-open={open} style={step(index)}>
      <button
        type="button"
        className="row"
        data-win={e.win}
        aria-expanded={open}
        aria-controls={id}
        title={`${duration(e.seconds)} min · ${date(e.at)}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Img className="champ" src={championImage(dragon, championKey(dragon, e) || undefined)} alt="" size={48} />
        <span className="who">
          <b className={e.win ? 'up' : 'down'}>{e.win ? 'Win' : 'Loss'}</b>
          <small className="mono">
            {champion}, {e.kills} / {e.deaths} / {e.assists} · {ago(e.at, now)}
          </small>
        </span>
        <span className="grade-cell">
          <GradeMark grade={s.mark.grade} size={44} />
          {s.gain === null ? (
            <small className="faint">{s.change === 'placed' ? 'Placed' : 'Placement'}</small>
          ) : (
            <small className={s.gain > 0 ? 'up' : 'down'} title={points(Math.abs(s.gain))}>
              {s.gain > 0 ? '+' : '−'}
              {Math.abs(s.gain)}
              {s.change === 'promoted' ? ' ▲' : s.change === 'demoted' ? ' ▼' : ''}
            </small>
          )}
        </span>
        <svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <MatchMore id={id} step={s} dragon={dragon} name={name} />}
    </li>
  );
}

function MatchMore({ id, step: s, dragon, name }: { id: string; step: ProfileStep; dragon: Dragon; name: string }) {
  const augments = useAugments();
  const e = s.entry;
  const minutes = Math.max(1, e.seconds / 60);
  return (
    <div id={id} className="match-more">
      <dl className="match-facts">
        <div>
          <dt>Grade</dt>
          <dd>{`${s.mark.grade}, better than ${Math.round(s.mark.pct * 100)}%`}</dd>
        </div>
        <div>
          <dt>Damage per minute</dt>
          <dd>{num(e.damage / minutes)}</dd>
        </div>
        <div>
          <dt>Length</dt>
          <dd>{duration(e.seconds)}</dd>
        </div>
        <div>
          <dt>Day</dt>
          <dd>{date(e.at)}</dd>
        </div>
        {s.change === 'promoted' && (
          <div>
            <dt>Rank</dt>
            <dd className="up">Promotion</dd>
          </div>
        )}
        {s.change === 'demoted' && (
          <div>
            <dt>Rank</dt>
            <dd className="down">Demotion</dd>
          </div>
        )}
      </dl>
      <div className="items" aria-label="Items and augments">
        {e.items.filter((i) => i > 0).map((i, n) => (
          <Img key={n} className="item" src={itemImage(dragon, i)} size={30} />
        ))}
        {e.augments.map((a) => (
          <Augment key={a} id={a} info={augments.get(a)} size={30} />
        ))}
      </div>
      <Lobby entry={e} dragon={dragon} name={name} />
    </div>
  );
}

/** All ten of a game: grade (same rule for everyone), the best grade marked, K/D/A. */
function Lobby({ entry, dragon, name }: { entry: AramEntry; dragon: Dragon; name: string }) {
  const lobby = entry.lobby ?? [];
  const page = `/game/${entry.gameId}?p=${encodeURIComponent(entry.puuid)}`;
  if (!lobby.length)
    return (
      <p className="fine">
        {"This game lacks the others' stats."} <Link href={page}>View game</Link>
      </p>
    );
  const marks = lobbyPerformances(entry);
  const mvp = mvpOf(marks);
  const mine = lobby.find((s) => s.you);
  const teams = [...new Set(lobby.map((s) => s.team))].sort((a, b) => (a === mine?.team ? -1 : b === mine?.team ? 1 : a - b));
  const mateOf = (championId: number) => {
    const key = dragon?.champions.get(championId)?.id;
    return entry.with.find((m) => m.champion === key);
  };
  return (
    <>
      <div className="lobby">
        {teams.map((team) => (
          <div key={team}>
            <h3>
              {team === mine?.team ? 'Team' : 'Enemies'} · {(team === mine?.team) === entry.win ? 'Win' : 'Loss'}
            </h3>
            {lobby.map((s, i) => {
              if (s.team !== team) return null;
              const champ = dragon?.champions.get(s.championId);
              const mate = mateOf(s.championId);
              const who = s.you ? splitName(name).name : mate?.name ? splitName(mate.name).name : (champ?.name ?? '–');
              const mark = marks[i];
              return (
                <div className="seat" key={i} data-you={s.you === true}>
                  <Img className="champ" src={championImage(dragon, champ?.id)} alt={champ?.name} size={28} />
                  <span className="who">
                    <b>
                      <span>{who}</span>
                      {i === mvp && <span className="mvp" title="Best grade in the game">MVP</span>}
                    </b>
                  </span>
                  <span className="mono faint">
                    {s.kills}/{s.deaths}/{s.assists}
                  </span>
                  {mark ? <GradeChip grade={mark.grade} small /> : <span className="faint">–</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <Link className="button small" href={page}>
        View full game
      </Link>
    </>
  );
}

// ---- Champions, play style and seasons ----------------------------------------------------------

function Champions({ steps, dragon }: { steps: ProfileStep[]; dragon: Dragon }) {
  const rows = championsOf(steps);
  if (!rows.length) return <p className="empty">No rated games yet.</p>;
  // The best average grade, from as many games as a win rate needs (the list is sorted by games).
  const best = rows.filter((r) => r.games >= RATE_GAMES).reduce<(typeof rows)[number] | null>((a, r) => (!a || r.pct > a.pct ? r : a), null);
  return (
    <More
      list={rows}
      className="rows grid"
      label="Champions"
      render={(r, i) => (
        <li
          key={r.championId}
          className="row in"
          data-top={(rows.length > 1 && r === best) || undefined}
          style={step(i)}
          title={`${num(r.kills, 1)} / ${num(r.deaths, 1)} / ${num(r.assists, 1)} on average · ${num(r.damagePerMinute)} damage per minute · best grade ${r.best.grade}`}
        >
          <Img className="champ" src={championImage(dragon, championKey(dragon, r) || undefined)} size={40} />
          <span className="who">
            <Link className="stretch name" href={'/champions/' + (r.champion || r.championId)}>
              <span>{championLabel(dragon, r)}</span>
            </Link>
            <small>{`${r.games} ${r.games === 1 ? 'game' : 'games'} · ${Math.round((r.wins / r.games) * 100)}% wins`}</small>
          </span>
          <GradeChip grade={r.grade} />
        </li>
      )}
    />
  );
}

type RankedTag = ReturnType<typeof rankedTags>[number];

function Style({ steps, recent, radar, tags, census, dragon }: { steps: ProfileStep[]; recent: number; radar: number[] | null; tags: RankedTag[]; census: boolean; dragon: Dragon }) {
  const prefs = steps.length
    ? preferencesOf(
        steps.map((h) => h.entry),
        (id) => dragon?.champions.get(id)?.tags[0],
      )
    : null;
  const pct = (share: number) => `${Math.round(share * 100)}%`;
  const width = (share: number) => ({ width: `${Math.round(share * 1000) / 10}%` });
  const topClass = prefs?.classes[0]?.key;
  return (
    <div className="cards">
      <section className="card" aria-labelledby="tags">
        <h2 id="tags">Tags</h2>
        {tags.length ? (
          <ul className="tag-list">
            {tags.map((g) => (
              <li key={g.id} title={g.hint}>
                {g.name}
                <small>{shareText(g.share)}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="fine">
            {steps.length < MIN_GAMES
              ? `Tags from ${MIN_GAMES} rated games (${MIN_GAMES - steps.length} to go).`
              : census
                ? 'No tag yet, nothing stands out.'
                : 'Loading tags …'}
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="strengths">
        <h2 id="strengths">{`Strengths · last ${recent} games`}</h2>
        {radar ? (
          <>
            <Radar values={radar} />
            <p className="fine">
              {`Dashed: what the champion usually reaches. Further out is better. ${Object.values(AXES).join(', ')} make up the grade.`}
            </p>
          </>
        ) : (
          <p className="fine">No rated games yet.</p>
        )}
      </section>

      {prefs && (
        <section className="card" aria-labelledby="prefs">
          <h2 id="prefs">Preferences</h2>
          {prefs.classes.length > 0 && (
            <ul className="bars" aria-label="Classes">
              {prefs.classes.slice(0, 5).map((c) => (
                <li key={c.key} data-top={c.key === topClass} title={pct(c.share)}>
                  <span>{c.key}</span>
                  <span className="bar" aria-hidden>
                    <span style={width(c.share)} />
                  </span>
                </li>
              ))}
            </ul>
          )}
          {prefs.damage && (
            <p className="fine">{`Damage: ${pct(prefs.damage.ap)} magic, ${pct(prefs.damage.ad)} physical, ${pct(prefs.damage.true)} true`}</p>
          )}
        </section>
      )}

      {recent > 1 && (
        <section className="card" aria-labelledby="form">
          <h2 id="form">Form</h2>
          <Sparkline values={formLine(steps.slice(-20).map((h) => h.mark.pct))} />
          <p className="fine">{`Average of the grades over the last ${recent} games, as it went.`}</p>
        </section>
      )}
    </div>
  );
}

function Seasons({ profile, now: at }: { profile: Profile; now: number }) {
  const now = seasonOf(at);
  const rows = [
    { name: seasonText(now) + ' (now)', rank: profile.rank },
    ...profile.seasons.map((s) => ({ name: seasonText(s.season), rank: s.rank })),
  ];
  const best = rows.reduce<number | null>((b, r) => (r.rank && (b === null || r.rank.ladder > b) ? r.rank.ladder : b), null);
  return (
    <ul className="rows grid" aria-label="Seasons">
      {rows.map((r, i) => (
        <li key={r.name} className="row in" data-tier={r.rank?.tier.id} data-top={(rows.length > 1 && r.rank?.ladder === best) || undefined} style={step(i)}>
          <TierMark rank={r.rank} size={44} />
          <span className="who">
            <b className="tier-text">{r.rank ? rankName(r.rank) : 'Placement'}</b>
            <small>{r.name}</small>
          </span>
          {r.rank && <span className="value"><small>{points(r.rank.points)}</small></span>}
        </li>
      ))}
    </ul>
  );
}

/** "That's me": marks this player as the visitor, only in this browser (app/ui/me.ts). */
function MeButton({ id, name }: { id: string | null; name: string }) {
  const me = useMe();
  if (!id) return null;
  const mine = me?.id === id;
  return (
    <button
      type="button"
      className="pill"
      aria-pressed={mine}
      title={mine ? meText.unmark : meText.markHint}
      onClick={() => setMe(mine ? null : { id, name })}
    >
      {mine ? meText.marked : meText.mark}
    </button>
  );
}
