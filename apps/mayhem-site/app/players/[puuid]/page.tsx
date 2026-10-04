'use client';
// A player's profile: rank card, the season's way, form, the five axes of the grade, playstyle,
// match history with all ten players, champions and earlier seasons.
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { AramEntry } from '../../../src/adapters/aram';
import { rankName, seasonName, seasonOf } from '../../../src/features/aram/aramRating';
import {
  AXES,
  badgesOf,
  championsOf,
  formLine,
  lobbyPerformances,
  mvpOf,
  radarOf,
  streaksOf,
} from '../../../src/insights';
import {
  fillOf,
  GradeChip,
  GradeIcon,
  Img,
  LadderChart,
  Problem,
  Radar,
  Sparkline,
  Tabs,
  TierMark,
} from '../../ui/bits';
import {
  ago,
  championImage,
  championKey,
  championLabel,
  date,
  de,
  duration,
  itemImage,
  profileImage,
  splitName,
  useDragon,
  useLive,
  useNow,
  type Profile,
  type ProfileStep,
} from '../../ui/data';

type Tab = 'overview' | 'matches' | 'champions' | 'seasons';
type Dragon = ReturnType<typeof useDragon>;

export default function PlayerPage() {
  const params = useParams<{ puuid: string }>();
  const group = useSearchParams().get('group');
  const { data, error, missing } = useLive<Profile>(
    '/api/players/' + encodeURIComponent(params.puuid) + (group ? '?group=' + encodeURIComponent(group) : ''),
  );
  const dragon = useDragon();
  const [tab, setTab] = useState<Tab>('overview');
  const now = useNow();

  if (error) return <Problem message={error} missing={missing} />;
  if (!data) return <p className="empty">Spieler wird geladen …</p>;

  const history = data.history;
  const season = seasonOf(now);
  const thisSeason = history.filter((h) => h.season === season.id);
  const recent = history.slice(-20);
  const radar = radarOf(recent.map((h) => h.entry));
  const badges = badgesOf(radar, recent.length);
  const streak = streaksOf(history.map((h) => h.mark.grade));
  const { name, tag } = splitName(data.name);
  const losses = data.games - data.wins;

  return (
    <>
      <Link className="back" href={group ? '/?group=' + encodeURIComponent(group) : '/'}>
        ← Rangliste
      </Link>

      <section className="hero" data-tier={data.rank?.tier.id}>
        <Img className="avatar xl" src={profileImage(dragon, data.icon)} size={84} />
        <div>
          <h1>
            {name}
            {tag && <small>#{tag}</small>}
          </h1>
          <div className="facts num">
            <span>
              {data.wins}S {losses}N
            </span>
            <span>{data.games ? Math.round((data.wins / data.games) * 100) : 0} % Siege</span>
            <span>{history.length} gewertete Spiele</span>
            {history.length > 0 && <span>letztes Spiel {ago(history[history.length - 1].entry.at, now)}</span>}
          </div>
          <div className="badges">
            {data.climbing && (
              <span className="badge climb" title="Die Leistung liegt über dem Rang – die MP-Gewinne sind größer.">
                Klettert
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
            <span className="faint">{seasonName(season)}</span>
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
                <div className="name muted">Einstufung</div>
                <span className="muted num">{data.placed} von 5 Spielen</span>
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
          label="Bereiche"
          value={tab}
          onChange={setTab}
          options={[
            { id: 'overview', label: 'Übersicht' },
            { id: 'matches', label: `Matches (${history.length})` },
            { id: 'champions', label: 'Champions' },
            { id: 'seasons', label: 'Saisons' },
          ]}
        />
      </div>

      {tab === 'overview' && (
        <div className="grid cols-main">
          <div className="stack">
            <div className="stat-row">
              <Stat label="Leistung Ø">
                {data.average ? <GradeChip grade={data.average.grade} /> : '–'}
              </Stat>
              <Stat label="Diese Saison">{thisSeason.length} Spiele</Stat>
              <Stat label="Beste Serie S+">{streak.best}</Stat>
              <Stat label="MAYHEM-Noten">{history.filter((h) => h.mark.grade === 'MAYHEM').length}</Stat>
            </div>
            <div className="card">
              <h2>MP-Verlauf · {seasonName(season)}</h2>
              <LadderChart
                points={thisSeason
                  .filter((h) => h.after)
                  .map((h) => ({ ladder: h.after!.ladder, change: h.change }))}
              />
            </div>
            <div className="card">
              <h2>Letzte Spiele</h2>
              <Matches steps={history.slice(-5).reverse()} dragon={dragon} name={data.name} />
              {history.length > 5 && (
                <button className="button" style={{ marginTop: 10 }} onClick={() => setTab('matches')}>
                  Alle {history.length} Matches
                </button>
              )}
            </div>
          </div>
          <aside className="stack">
            <div className="card">
              <h2>Stärken · letzte {recent.length} Spiele</h2>
              {radar ? (
                <>
                  <Radar values={radar} />
                  <p className="fine">
                    Gestrichelt: was der gespielte Champion üblicherweise schafft. Weiter außen = besser.{' '}
                    {Object.values(AXES).join(', ')} ergeben zusammen die Note.
                  </p>
                </>
              ) : (
                <p className="empty">Noch keine gewerteten Spiele.</p>
              )}
            </div>
            <div className="card">
              <h2>Form</h2>
              <Sparkline values={formLine(recent.map((h) => h.mark.pct))} />
              <p className="fine">Gleitender Schnitt der Noten der letzten {recent.length} Spiele.</p>
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
  return (
    <>
      <Matches {...props} steps={props.steps.slice(0, shown)} />
      {shown < props.steps.length && (
        <button className="button" style={{ marginTop: 12 }} onClick={() => setShown((s) => s + 20)}>
          Weitere {Math.min(20, props.steps.length - shown)} laden
        </button>
      )}
    </>
  );
}

function Matches({ steps, dragon, name }: { steps: ProfileStep[]; dragon: Dragon; name: string }) {
  if (!steps.length) return <p className="empty">Noch keine gewerteten Spiele.</p>;
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
            <span className={e.win ? 'up' : 'down'}>{e.win ? 'Sieg' : 'Niederlage'}</span> · {duration(e.seconds)} · {date(e.at)}
          </small>
        </span>
        <span className="num">
          <b>
            {e.kills} / <span className="down">{e.deaths}</span> / {e.assists}
          </b>
          <small>{de(e.damage / minutes)} Schaden/Min</small>
        </span>
        <span className="items hide-sm">
          {e.items.filter((i) => i > 0).slice(0, 6).map((i, n) => (
            <Img key={n} className="item" src={itemImage(dragon, i)} size={22} />
          ))}
        </span>
        <span className="gain num">
          {step.gain === null ? (
            <small className="faint">Einstufung</small>
          ) : (
            <span className={step.gain > 0 ? 'up' : 'down'}>
              {step.gain > 0 ? '+' : '−'}
              {Math.abs(step.gain)}
            </span>
          )}
          {step.change === 'promoted' && <small className="up">Aufstieg</small>}
          {step.change === 'demoted' && <small className="down">Abstieg</small>}
          {step.change === 'placed' && <small>Eingestuft</small>}
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
  const page = `/spiel/${entry.gameId}?p=${encodeURIComponent(entry.puuid)}`;
  if (!lobby.length)
    return (
      <div id={id} className="lobby faint">
        Für dieses Spiel fehlen die Werte der anderen. <Link className="to-game" href={page}>Spiel ansehen →</Link>
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
        <span className="k-dmg"><i />Schaden</span>
        <span className="k-tank"><i />Eingesteckt</span>
        <span className="k-care"><i />Heilen & Schilde</span>
        <span>
          <span className="mvp">MVP</span> beste Note im Spiel
        </span>
        <Link className="to-game" href={page}>
          Ganzes Spiel ansehen →
        </Link>
      </div>
      <div className="teams">
        {teams.map((team) => (
          <div className="team" key={team}>
            <h3>{team === mine?.team ? 'Team' : 'Gegner'} · {(team === mine?.team) === entry.win ? 'Sieg' : 'Niederlage'}</h3>
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
                  <span className="bars" aria-label={`${de(s.damage)} Schaden, ${de(s.taken + s.mitigated)} eingesteckt, ${de(s.healed + s.shielded)} geheilt`}>
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
  if (!rows.length) return <p className="empty">Noch keine gewerteten Spiele.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Champion</th>
            <th className="right">Spiele</th>
            <th>Note Ø</th>
            <th className="right hide-sm">Siege</th>
            <th className="right">K / D / A</th>
            <th className="right hide-sm">Schaden/Min</th>
            <th className="hide-sm">Bestes Spiel</th>
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
              <td className="right num hide-sm">{Math.round((r.wins / r.games) * 100)} %</td>
              <td className="right num">
                {de(r.kills, 1)} / {de(r.deaths, 1)} / {de(r.assists, 1)}
              </td>
              <td className="right num hide-sm">{de(r.damagePerMinute)}</td>
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
    { name: seasonName(now) + ' (läuft)', rank: profile.rank },
    ...profile.seasons.map((s) => ({ name: seasonName(s.season), rank: s.rank })),
  ];
  return (
    <div className="grid cols-3">
      {rows.map((r) => (
        <div className="card" key={r.name} data-tier={r.rank?.tier.id}>
          <h2>{r.name}</h2>
          <div className="rank-cell">
            <TierMark rank={r.rank} />
            <div>
              <b className="tier-text">{r.rank ? rankName(r.rank) : 'Ohne Rang'}</b>
              {r.rank && <div className="muted num">{r.rank.points} MP</div>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
