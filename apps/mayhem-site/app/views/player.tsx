'use client';
// A player's profile: rank card, the season's way, form, the five axes of the grade, playstyle,
// match history with all ten players, champions and earlier seasons.
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { AramEntry } from '../../src/adapters/aram';
import { rankName, seasonOf } from '../../src/features/aram/aramRating';
import {
  AXES,
  badgesOf,
  championsOf,
  formLine,
  lobbyPerformances,
  mvpOf,
  radarOf,
  streaksOf,
} from '../../src/insights';
import {
  fillOf,
  GradeChip,
  GradeIcon,
  Augment,
  Img,
  LadderChart,
  Problem,
  Radar,
  Sparkline,
  Tabs,
  TierMark,
} from '../ui/bits';
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
  useTagCensus,
  useNow,
  type Profile,
  type ProfileStep,
} from '../ui/data';
import { num, date, season as seasonText, ago } from '../ui/format';
import { meText, setMe, useMe } from '../ui/me';
import { MIN_GAMES, preferencesOf, rankedTags, statsOf } from '../../src/tags';

type Tab = 'overview' | 'matches' | 'champions' | 'seasons';
type Dragon = ReturnType<typeof useDragon>;

/** The address part as typed (a Riot ID like "Name Zwei-EUW" may arrive still encoded). */
function decoded(part: string) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

export default function PlayerPage() {
  const params = useParams<{ puuid: string }>();
  const { data, error, missing } = useLive<Profile>(
    '/api/players/' + encodeURIComponent(decoded(params.puuid)),
  );
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
  const streak = streaksOf(history.map((h) => h.mark.grade));
  const { name, tag } = splitName(data.name);
  const losses = data.games - data.wins;

  return (
    <>
      <Link className="back" href="/">
        ← Leaderboard
      </Link>

      <section className="hero" data-tier={data.rank?.tier.id}>
        <Img className="avatar xl" src={profileImage(dragon, data.icon)} size={84} />
        <div>
          <h1>
            {name}
            {tag && <small>#{tag}</small>}
          </h1>
          <div className="facts num">
            {data.server && (
              <span className="server-tag" title="Server of the latest archived game">
                {data.server}
              </span>
            )}
            <span>
              {data.wins}
              W {losses}
              L
            </span>
            <span>
              {`${data.games ? Math.round((data.wins / data.games) * 100) : 0}% wins`}
            </span>
            <span>
              {history.length} rated games
            </span>
            {history.length > 0 && (
              <span>
                last game {ago(history[history.length - 1].entry.at, now)}
              </span>
            )}
          </div>
          <div className="badges">
            <MeButton id={data.id ?? (/^a[1-9][0-9]*$/.test(params.puuid) ? params.puuid : null)} name={data.name} />
            {data.climbing && (
              <span
                className="badge climb"
                title="Performance is above the rank, so MP gains are bigger."
              >
                Climbing
              </span>
            )}
            {badges.map((b) => (
              <span className="badge" key={b.id} title={b.hint}>
                {b.name}
              </span>
            ))}
          </div>
        </div>
        <div className="rank-card" data-tier={data.rank?.tier.id}>
          <TierMark rank={data.rank} />
          <div>
            <span className="faint">{seasonText(season)}</span>
            {data.rank ? (
              <>
                <div className="name tier-text">{rankName(data.rank)}</div>
                <span className="muted num">{data.rank.points} MP</span>
                <div className="mp-bar" aria-hidden>
                  <span style={{ width: `${fillOf(data.rank)}%` }} />
                </div>
              </>
            ) : (
              <>
                <div className="name muted">Placement</div>
                <span className="muted num">
                  {data.placed} of 5 games
                </span>
                <div className="mp-bar" aria-hidden>
                  <span style={{ width: `${data.placed * 20}%`, background: 'var(--faint)' }} />
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <div style={{ marginBottom: 'var(--gap)' }}>
        <Tabs<Tab>
          label="Sections"
          value={tab}
          onChange={setTab}
          options={[
            { id: 'overview', label: 'Overview' },
            { id: 'matches', label: `Matches (${history.length})` },
            { id: 'champions', label: 'Champions' },
            { id: 'seasons', label: 'Seasons' },
          ]}
        />
      </div>

      {tab === 'overview' && (
        <div className="grid cols-main">
          <div className="stack">
            <div className="stat-row">
              <Stat label="Avg performance">
                {data.average ? <GradeChip grade={data.average.grade} /> : '–'}
              </Stat>
              <Stat label="This season">
                {thisSeason.length} games
              </Stat>
              <Stat label="Best S+ streak">{streak.best}</Stat>
              <Stat label="MAYHEM grades">
                {history.filter((h) => h.mark.grade === 'MAYHEM').length}
              </Stat>
            </div>
            <div className="card">
              <h2>
                MP history · {seasonText(season)}
              </h2>
              <LadderChart
                points={thisSeason
                  .filter((h) => h.after)
                  .map((h) => ({ ladder: h.after!.ladder, change: h.change }))}
              />
            </div>
            <div className="card">
              <h2>Recent games</h2>
              <Matches steps={history.slice(-5).reverse()} dragon={dragon} name={data.name} />
              {history.length > 5 && (
                <button className="button" style={{ marginTop: 10 }} onClick={() => setTab('matches')}>
                  {`All ${history.length} matches`}
                </button>
              )}
            </div>
          </div>
          <aside className="stack">
            <div className="card">
              <h2>Tags</h2>
              {tags.length ? (
                <ul className="tag-list">
                  {tags.map((g) => (
                    <li key={g.id} title={g.hint}>
                      <span className="tag-name">{g.name}</span>
                      <span className="faint num">{shareText(g.share)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty">
                  {history.length < MIN_GAMES
                    ? `Tags from ${MIN_GAMES} rated games (${MIN_GAMES - history.length} to go).`
                    : census
                      ? 'No tag yet, nothing stands out.'
                      : 'Loading tags …'}
                </p>
              )}
            </div>
            <Preferences steps={history} dragon={dragon} />
            <div className="card">
              <h2>
                {`Strengths · last ${recent.length} games`}
              </h2>
              {radar ? (
                <>
                  <Radar values={radar} />
                  <p className="fine">
                    Dashed: what the played champion usually reaches. Further out = better.{' '}
                    {`${Object.values(AXES).join(', ')} make up the grade.`}
                  </p>
                </>
              ) : (
                <p className="empty">No rated games yet.</p>
              )}
            </div>
            <div className="card">
              <h2>Form</h2>
              <Sparkline values={formLine(recent.map((h) => h.mark.pct))} />
              <p className="fine">
                {`Moving average of the grades over the last ${recent.length} games.`}
              </p>
            </div>
            <div className="card">
              <h2>Games missing?</h2>
              <p className="fine">
                Only games someone uploaded show up here. Is this you? With the Collector all your Mayhem games get added, and your rank gets more accurate.
              </p>
              <a className="button" href="/join">
                Join
              </a>
            </div>
          </aside>
        </div>
      )}

      {tab === 'matches' && <AllMatches steps={[...history].reverse()} dragon={dragon} name={data.name} />}
      {tab === 'champions' && <Champions steps={history} dragon={dragon} />}
      {tab === 'seasons' && <Seasons profile={data} now={now} />}
    </>
  );
}

/** "only 4 %": how rare a tag is among all players. */
const shareText = (share: number) => {
  const n = share < 0.01 ? '<1' : String(Math.round(share * 100));
  return share < 0.5 ? `only ${n}%` : `${n}%`;
};

function Preferences({ steps, dragon }: { steps: ProfileStep[]; dragon: Dragon }) {
  const augments = useAugments();
  if (!steps.length) return null;
  const prefs = preferencesOf(
    steps.map((h) => h.entry),
    (id) => dragon?.champions.get(id)?.tags[0],
  );
  const pct = (share: number) => `${Math.round(share * 100)}%`;
  const width = (share: number) => ({ width: `${Math.round(share * 1000) / 10}%` });
  return (
    <div className="card prefs">
      <h2>Preferences</h2>
      <h3>Champions</h3>
      <ul className="pref-list">
        {prefs.champions.map((c) => {
          const entry = steps.find((h) => h.entry.championId === c.key)!.entry;
          return (
            <li key={c.key}>
              <Img className="avatar sm" src={championImage(dragon, championKey(dragon, entry))} size={24} />
              <span>{championLabel(dragon, entry)}</span>
              <span className="faint num">{pct(c.share)}</span>
            </li>
          );
        })}
      </ul>
      {prefs.classes.length > 0 && (
        <>
          <h3>Classes</h3>
          <ul className="pref-bars">
            {prefs.classes.map((c) => (
              <li key={c.key}>
                <span>{c.key}</span>
                <span className="pref-bar" aria-hidden>
                  <span style={width(c.share)} />
                </span>
                <span className="faint num">{pct(c.share)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {prefs.damage && (
        <>
          <h3>Damage type</h3>
          <div
            className="dmg-split"
            role="img"
            aria-label={`AP ${pct(prefs.damage.ap)}, AD ${pct(prefs.damage.ad)}, ${'true'} ${pct(prefs.damage.true)}`}
          >
            <span className="ap" style={width(prefs.damage.ap)} />
            <span className="ad" style={width(prefs.damage.ad)} />
            <span className="tr" style={width(prefs.damage.true)} />
          </div>
          <p className="fine num">
            AP {pct(prefs.damage.ap)} · AD {pct(prefs.damage.ad)} · True {pct(prefs.damage.true)}
          </p>
        </>
      )}
      {prefs.augments.length > 0 && (
        <>
          <h3>Augments</h3>
          <ul className="pref-list">
            {prefs.augments.map((a) => (
              <li key={a.key}>
                <Augment id={a.key} info={augments.get(a.key)} size={24} />
                <span>{augments.get(a.key)?.name ?? `Augment ${a.key}`}</span>
                <span className="faint num">{a.games}×</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="stat">
      <small>{label}</small>
      <strong className="num">{children}</strong>
    </div>
  );
}

// ---- Matches --------------------------------------------------------------------------------

function AllMatches(props: { steps: ProfileStep[]; dragon: Dragon; name: string }) {
  const [shown, setShown] = useState(20);
  const more = Math.min(20, props.steps.length - shown);
  return (
    <>
      <Matches {...props} steps={props.steps.slice(0, shown)} />
      {shown < props.steps.length && (
        <button className="button" style={{ marginTop: 12 }} onClick={() => setShown((s) => s + 20)}>
          {`Load ${more} more`}
        </button>
      )}
    </>
  );
}

function Matches({ steps, dragon, name }: { steps: ProfileStep[]; dragon: Dragon; name: string }) {
  if (!steps.length) return <p className="empty">No rated games yet.</p>;
  return (
    <div className="matches">
      {steps.map((s) => (
        <Match key={s.entry.gameId} step={s} dragon={dragon} name={name} />
      ))}
    </div>
  );
}

function Match({ step, dragon, name }: { step: ProfileStep; dragon: Dragon; name: string }) {
  const [open, setOpen] = useState(false);
  const e = step.entry;
  const minutes = Math.max(1, e.seconds / 60);
  const id = `match-${e.gameId}`;
  return (
    <article className="match" data-g={step.mark.grade} data-open={open}>
      <button aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <GradeIcon grade={step.mark.grade} />
        <Img className="champ lg" src={championImage(dragon, championKey(dragon, e) || undefined)} alt={championLabel(dragon, e)} size={44} />
        <span className="title">
          <b>{championLabel(dragon, e)}</b>
          <small>
            <span className={e.win ? 'up' : 'down'}>{e.win ? 'Win' : 'Loss'}</span> ·{' '}
            {duration(e.seconds)} · {date(e.at)}
          </small>
        </span>
        <span className="num">
          <b>
            {e.kills} / <span className="down">{e.deaths}</span> / {e.assists}
          </b>
          <small>
            {num(e.damage / minutes)} damage/min
          </small>
        </span>
        <span className="items hide-sm">
          {e.items.filter((i) => i > 0).slice(0, 6).map((i, n) => (
            <Img key={n} className="item" src={itemImage(dragon, i)} size={22} />
          ))}
        </span>
        <span className="gain num">
          {step.gain === null ? (
            <small className="faint">Placement</small>
          ) : (
            <span className={step.gain > 0 ? 'up' : 'down'}>
              {step.gain > 0 ? '+' : '−'}
              {Math.abs(step.gain)}
            </span>
          )}
          {step.change === 'promoted' && <small className="up">Promotion</small>}
          {step.change === 'demoted' && <small className="down">Demotion</small>}
          {step.change === 'placed' && <small>Placed</small>}
        </span>
        <svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <Lobby id={id} entry={e} dragon={dragon} name={name} />}
    </article>
  );
}

/** All ten of a game: grade (same rule for everyone), MVP, damage, taken and healing. */
function Lobby({ id, entry, dragon, name }: { id: string; entry: AramEntry; dragon: Dragon; name: string }) {
  const lobby = entry.lobby ?? [];
  const page = `/game/${entry.gameId}?p=${encodeURIComponent(entry.puuid)}`;
  if (!lobby.length)
    return (
      <div id={id} className="lobby faint">
        {"This game lacks the others' stats."}{' '}
        <Link className="to-game" href={page}>
          View game →
        </Link>
      </div>
    );
  const marks = lobbyPerformances(entry);
  const mvp = mvpOf(marks);
  const max = {
    dmg: Math.max(1, ...lobby.map((s) => s.damage)),
    tank: Math.max(1, ...lobby.map((s) => s.taken + s.mitigated)),
    care: Math.max(1, ...lobby.map((s) => s.healed + s.shielded)),
  };
  const mine = lobby.find((s) => s.you);
  const teams = [...new Set(lobby.map((s) => s.team))].sort((a, b) => (a === mine?.team ? -1 : b === mine?.team ? 1 : a - b));
  const mateOf = (championId: number) => {
    const key = dragon?.champions.get(championId)?.id;
    return entry.with.find((m) => m.champion === key);
  };
  return (
    <div id={id} className="lobby">
      <div className="legend">
        <span className="k-dmg">
          <i />
          Damage
        </span>
        <span className="k-tank">
          <i />
          Damage taken
        </span>
        <span className="k-care">
          <i />
          {'Healing & shields'}
        </span>
        <span>
          <span className="mvp">MVP</span> best grade in the game
        </span>
        <Link className="to-game" href={page}>
          View full game →
        </Link>
      </div>
      <div className="teams">
        {teams.map((team) => (
          <div className="team" key={team}>
            <h3>
              {team === mine?.team ? 'Team' : 'Enemies'} ·{' '}
              {(team === mine?.team) === entry.win ? 'Win' : 'Loss'}
            </h3>
            {lobby.map((s, i) => {
              if (s.team !== team) return null;
              const champ = dragon?.champions.get(s.championId);
              const who = s.you ? splitName(name).name : mateOf(s.championId)?.name ? splitName(mateOf(s.championId)!.name).name : champ?.name ?? '–';
              const mark = marks[i];
              return (
                <div className="seat" key={i} data-you={s.you === true}>
                  <Img className="champ" src={championImage(dragon, champ?.id)} alt={champ?.name} size={28} />
                  <span>{mark ? <GradeChip grade={mark.grade} /> : <span className="faint">–</span>}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {who}
                      {i === mvp && <span className="mvp">MVP</span>}
                    </span>
                    <span className="faint num">
                      {s.kills}/{s.deaths}/{s.assists}
                    </span>
                  </span>
                  <span
                    className="bars"
                    aria-label={`${num(s.damage)} damage, ${num(s.taken + s.mitigated)} taken, ${num(s.healed + s.shielded)} healed`}
                  >
                    <span className="k-dmg" style={{ width: `${(s.damage / max.dmg) * 100}%` }} />
                    <span className="k-tank" style={{ width: `${((s.taken + s.mitigated) / max.tank) * 100}%` }} />
                    <span className="k-care" style={{ width: `${((s.healed + s.shielded) / max.care) * 100}%` }} />
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Champions and seasons ------------------------------------------------------------------

function Champions({ steps, dragon }: { steps: ProfileStep[]; dragon: Dragon }) {
  const rows = championsOf(steps);
  if (!rows.length) return <p className="empty">No rated games yet.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Champion</th>
            <th className="right">Games</th>
            <th>Avg grade</th>
            <th className="right hide-sm">Wins</th>
            <th className="right">K / D / A</th>
            <th className="right hide-sm">Damage/min</th>
            <th className="hide-sm">Best game</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.championId}>
              <td>
                <span className="who">
                  <Img className="champ" src={championImage(dragon, championKey(dragon, r) || undefined)} size={28} />
                  <b>{championLabel(dragon, r)}</b>
                </span>
              </td>
              <td className="right num">{r.games}</td>
              <td>
                <GradeChip grade={r.grade} />
              </td>
              <td className="right num hide-sm">{`${Math.round((r.wins / r.games) * 100)}%`}</td>
              <td className="right num">
                {num(r.kills, 1)} / {num(r.deaths, 1)} / {num(r.assists, 1)}
              </td>
              <td className="right num hide-sm">{num(r.damagePerMinute)}</td>
              <td className="hide-sm">
                <GradeChip grade={r.best.grade} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Seasons({ profile, now: at }: { profile: Profile; now: number }) {
  const now = seasonOf(at);
  const rows = [
    { name: seasonText(now) + ' (current)', rank: profile.rank },
    ...profile.seasons.map((s) => ({ name: seasonText(s.season), rank: s.rank })),
  ];
  return (
    <div className="grid cols-3">
      {rows.map((r) => (
        <div className="card" key={r.name} data-tier={r.rank?.tier.id}>
          <h2>{r.name}</h2>
          <div className="rank-cell">
            <TierMark rank={r.rank} />
            <div>
              <b className="tier-text">{r.rank ? rankName(r.rank) : 'Unranked'}</b>
              {r.rank && <div className="muted num">{r.rank.points} MP</div>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** "That's me": marks this player as the visitor, only in this browser (app/ui/me.ts). */
function MeButton({ id, name }: { id: string | null; name: string }) {
  const me = useMe();
  if (!id) return null;
  const words = meText;
  const mine = me?.id === id;
  return (
    <button
      type="button"
      className={mine ? 'badge me-badge on' : 'badge me-badge'}
      aria-pressed={mine}
      title={mine ? words.unmark : words.markHint}
      onClick={() => setMe(mine ? null : { id, name })}
    >
      {mine ? words.marked : words.mark}
    </button>
  );
}
