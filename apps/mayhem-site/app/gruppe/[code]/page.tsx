'use client';
// A group's page: its ladder, the duel of two members (radar, best values, games together) and
// its game nights (games, MP won or lost, best grade per player). Only members, from the group's
// start on.
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { duelOf, type Member, type Session } from '../../../src/group';
import { AXES } from '../../../src/insights';
import { RECORDS } from '../../../src/records';
import { GradeChip, Problem, Radar } from '../../ui/bits';
import { date, de, profileHref, splitName, useDragon, useLive, type PlayerSummary } from '../../ui/data';
import { PlayerRow } from '../../ui/player-row';

type GroupData = {
  group: { code: string; name: string; since: number };
  players: PlayerSummary[];
  members: Member[];
  sessions: Session[];
};

const short = (name: string) => splitName(name).name;

export default function GroupPage() {
  const { code } = useParams<{ code: string }>();
  const { data, error, live, missing } = useLive<GroupData>('/api/gruppe/' + encodeURIComponent(code));
  const dragon = useDragon();

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">
            Gruppe {code}
            {data && ` · seit ${date(data.group.since)}`}
          </span>
          <h1>{data?.group.name ?? 'Gruppe'}</h1>
        </div>
        <div className="side">
          <span className="live" data-on={live}>
            {live ? 'Live' : 'Aktualisiert alle 5 s'}
          </span>
        </div>
      </div>

      {error && <Problem message={error} missing={missing} />}
      {!data && !error && <p className="empty">Gruppe wird geladen …</p>}

      {data && !data.players.length && (
        <div className="card empty">
          Seit dem Start der Gruppe gibt es noch keine gewerteten Spiele. Spiele zählen, sobald Mitglieder in blank. hochladen.
        </div>
      )}

      {data && data.players.length > 0 && (
        <div className="grid cols-main">
          <div className="stack">
            <section className="card" aria-labelledby="ladder">
              <h2 id="ladder">Rangliste der Gruppe</h2>
              <div className="table-wrap flat">
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Spieler</th>
                      <th>Rang</th>
                      <th className="hide-sm">Leistung Ø</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.players.map((p, i) => (
                      <PlayerRow key={p.puuid} player={p} place={i + 1} dragon={dragon} group={data.group.code} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {data.players.length >= 2 && <DuelCard players={data.players} members={data.members} />}
          </div>

          <aside className="stack">
            <section className="card" aria-labelledby="nights">
              <h2 id="nights">Spielabende</h2>
              {data.sessions.length ? (
                <ol className="nights">
                  {data.sessions.map((s) => (
                    <Night key={s.start} session={s} />
                  ))}
                </ol>
              ) : (
                <p className="empty">Noch kein Spielabend.</p>
              )}
              <p className="fine" style={{ marginTop: 12 }}>
                Ein Spielabend sind Spiele mit höchstens drei Stunden Pause dazwischen.
              </p>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}

function DuelCard({ players, members }: { players: PlayerSummary[]; members: Member[] }) {
  const [left, setLeft] = useState(players[0].puuid);
  const [right, setRight] = useState(players[1].puuid);
  const byId = new Map(members.map((m) => [m.puuid, m]));
  const names = new Map(players.map((p) => [p.puuid, short(p.name)]));
  const a = byId.get(left);
  const b = byId.get(right);
  const duel = a && b && left !== right ? duelOf(a, b) : null;
  const pick = (value: string, set: (id: string) => void, label: string) => (
    <select aria-label={label} value={value} onChange={(e) => set(e.target.value)}>
      {players.map((p) => (
        <option key={p.puuid} value={p.puuid}>
          {short(p.name)}
        </option>
      ))}
    </select>
  );
  const shown = RECORDS.filter((c) => a?.bests[c.id] !== undefined || b?.bests[c.id] !== undefined);
  const value = (unit: string, v: number | undefined) =>
    v === undefined ? '–' : unit === 'seconds' ? `${de(v)} s` : de(v);

  return (
    <section className="card duel" aria-labelledby="duel">
      <div className="card-head">
        <h2 id="duel">Duell</h2>
        <div className="duel-pick">
          <span className="duel-a">{pick(left, setLeft, 'Erster Spieler')}</span>
          <span className="faint">gegen</span>
          <span className="duel-b">{pick(right, setRight, 'Zweiter Spieler')}</span>
        </div>
      </div>

      {left === right ? (
        <p className="empty">Wähle zwei verschiedene Spieler.</p>
      ) : (
        <>
          <div className="duel-top">
            <div>
              {a?.radar ? (
                <Radar values={a.radar} compare={b?.radar} />
              ) : (
                <p className="empty">Für das Radar fehlen gewertete Spiele.</p>
              )}
              <p className="fine legend">
                <span className="nowrap">
                  <i className="duel-a-key" /> {names.get(left)}
                </span>
                <span className="nowrap">
                  <i className="duel-b-key" /> {names.get(right)}
                </span>
                <span>gestrichelt: Schnitt des Champions</span>
              </p>
            </div>
            <dl className="duel-facts">
              <div>
                <dt>Gemeinsame Spiele</dt>
                <dd className="num">{duel ? duel.together : '–'}</dd>
              </div>
              <div>
                <dt>Note Ø zusammen</dt>
                <dd>
                  {duel?.a && duel.b ? (
                    <>
                      <GradeChip grade={duel.a} /> <span className="faint vs">gegen</span> <GradeChip grade={duel.b} />
                    </>
                  ) : (
                    '–'
                  )}
                </dd>
              </div>
              <div>
                <dt>Bessere Note im selben Spiel</dt>
                <dd className="num">{duel?.together ? `${duel.aAhead} : ${duel.bAhead}` : '–'}</dd>
              </div>
            </dl>
          </div>

          {a?.radar && b?.radar && (
            <ul className="duel-axes" aria-label="Achsen im Vergleich">
              {Object.values(AXES).map((label, i) => {
                const diff = a.radar![i] - b.radar![i];
                return (
                  <li key={label}>
                    <span>{label}</span>
                    <b className={Math.abs(diff) < 0.05 ? 'faint' : diff > 0 ? 'duel-a-text' : 'duel-b-text'}>
                      {Math.abs(diff) < 0.05 ? 'gleich' : diff > 0 ? names.get(left) : names.get(right)}
                    </b>
                  </li>
                );
              })}
            </ul>
          )}

          {shown.length > 0 && (
            <div className="table-wrap flat">
              <table className="table duel-bests">
                <caption className="sr">Bestwerte im Vergleich</caption>
                <thead>
                  <tr>
                    <th scope="col">Bestwert</th>
                    <th scope="col" className="right">
                      {names.get(left)}
                    </th>
                    <th scope="col" className="right">
                      {names.get(right)}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => {
                    const x = a?.bests[c.id];
                    const y = b?.bests[c.id];
                    const win = (x ?? -1) > (y ?? -1) ? 'a' : (y ?? -1) > (x ?? -1) ? 'b' : null;
                    return (
                      <tr key={c.id}>
                        <th scope="row">{c.title}</th>
                        <td className="right num" data-win={win === 'a' || undefined}>
                          {value(c.unit, x)}
                        </td>
                        <td className="right num" data-win={win === 'b' || undefined}>
                          {value(c.unit, y)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Night({ session: s }: { session: Session }) {
  const day = new Date(s.start).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  const time = (at: number) => new Date(at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return (
    <li className="night">
      <header>
        <b>{day}</b>
        <span className="faint num">
          {time(s.start)}–{time(s.end)} · {s.games} {s.games === 1 ? 'Spiel' : 'Spiele'}
        </span>
      </header>
      <ul>
        {s.players.map((p) => (
          <li key={p.puuid}>
            <Link href={profileHref(p)}>{short(p.name)}</Link>
            <span className="faint num">{p.games}×</span>
            <GradeChip grade={p.best} small />
            <span className={'num ' + (p.gain > 0 ? 'up' : p.gain < 0 ? 'down' : 'faint')}>
              {p.games === p.placements ? 'Einstufung' : `${p.gain > 0 ? '+' : p.gain < 0 ? '−' : '±'}${Math.abs(p.gain)} MP`}
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}
