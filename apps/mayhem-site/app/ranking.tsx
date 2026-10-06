'use client';
// The leaderboard (op.gg-like): apex lines, the table by rank or by performance, the
// distribution of the tiers and the way to join.
import Link from 'next/link';
import { useState } from 'react';
import { seasonName, seasonOf } from '../src/features/aram/aramRating';
import { apexLines, distributionOf, topShare } from '../src/insights';
import ArchiveCounter from './archive-counter';
import { GradeChip, Histogram, Img, Problem, RankLine, Tabs, TierMark } from './ui/bits';
import { championImage, championKey, profileHref, profileImage, splitName, useDragon, useLive, useNow, type Board, type PlayerSummary } from './ui/data';
import { ME_TEXT, useMe } from './ui/me';

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

  const players = data?.players ?? [];
  const ranks = players.map((p) => p.rank);
  const sorted =
    view === 'rank'
      ? players
      : [...players]
          .filter((p) => p.average)
          .sort((a, b) => b.average!.pct - a.average!.pct || a.name.localeCompare(b.name));
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
          <span className="eyebrow">ARAM: Mayhem · {seasonName(seasonOf(now))}</span>
          <h1>Rangliste</h1>
        </div>
        <div className="side">
          <span className="live" data-on={live}>
            {live ? 'Live' : 'Aktualisiert alle 5 s'}
          </span>
        </div>
      </div>

      {error && <Problem message={error} />}

      <div className="apex" style={{ marginBottom: 'var(--gap)' }}>
        {apexLines(ranks).map((a) => (
          <div className="card" key={a.tier.id} data-tier={a.tier.id}>
            <TierMark rank={{ tier: a.tier, division: null, points: 0, ladder: 0 }} size={52} />
            <div>
              <span className="faint">{a.tier.name}</span>
              <strong className="num">
                {a.lowest === null ? `ab ${APEX_MP[a.tier.id as keyof typeof APEX_MP]} MP` : `ab ${a.lowest} MP`}
              </strong>
              <span className="muted">
                {a.players === 0 ? `Noch niemand – so selten wie ${a.tier.id === 'mayhem' ? 'Challenger' : 'Grandmaster'}` : `${a.players} Spieler`}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid cols-main">
        <section className="stack" aria-label="Tabelle">
          <Tabs<View>
            label="Sortierung"
            value={view}
            onChange={(v) => {
              setView(v);
              setLimit(PAGE);
            }}
            options={[
              { id: 'rank', label: 'Nach Rang' },
              { id: 'performance', label: 'Nach Leistung Ø' },
            ]}
          />
          {myIndex >= 0 && (
            <button type="button" className="button me-jump" onClick={jump}>
              {ME_TEXT.jump} · <span className="num">#{myIndex + 1}</span>
            </button>
          )}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Spieler</th>
                  <th>{view === 'rank' ? 'Rang' : 'Leistung Ø'}</th>
                  <th className="hide-sm">{view === 'rank' ? 'Leistung Ø' : 'Rang'}</th>
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
                Weitere {Math.min(PAGE, sorted.length - limit)} von {sorted.length - limit} anzeigen
              </button>
            )}
            {!data && !error && <p className="empty">Rangliste wird geladen …</p>}
            {data && sorted.length === 0 && (
              <p className="empty">
                {view === 'rank' ? 'Noch keine Spiele in dieser Wertung.' : 'Noch niemand mit gewerteten Spielen.'}
              </p>
            )}
          </div>
          <p className="fine">
            Gewertet werden Spiele mit den Werten aller zehn Spieler, ab 8 Minuten. Die Note jedes Spiels
            kommt aus allen Werten im Vergleich zu dem, was der Champion üblicherweise schafft – Sieg oder
            Niederlage zählen nicht. Spiele mit widersprüchlichen Daten zählen nicht.
          </p>
        </section>

        <aside className="stack">
          <div className="card">
            <h2>Verteilung</h2>
            <Histogram rows={distributionOf(ranks)} />
            <p className="fine" style={{ marginTop: 12 }}>
              {ranked} eingestuft · {players.length - ranked} in der Einstufung · {data?.trackedGames ?? '–'} Spiele
            </p>
          </div>
          <div className="card">
            <h2>So zählt es</h2>
            <p className="fine">
              Jedes Spiel bekommt eine Note von <GradeChip grade="F" /> bis <GradeChip grade="MAYHEM" />. Nach 5
              Spielen gibt es einen Rang; danach bringt jede Note MP – mehr, je besser sie über der Erwartung
              deines Rangs liegt, höchstens ±30 pro Spiel. D bis SS haben vier Divisionen zu je 100 MP, SSS und
              MAYHEM sind so selten wie Grandmaster und Challenger. <a href="/wertung">Mehr dazu</a>
            </p>
          </div>
          <div className="card">
            <h2>Mitmachen</h2>
            <ArchiveCounter />
          </div>
        </aside>
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
              {mine && <span className="me-tag">{ME_TEXT.you}</span>}
            </b>
            <small className="num">
              {p.wins}S {losses}N · {p.games} Spiele{top !== null ? ` · Top ${Math.max(1, Math.round(top * 100))} %` : ''}
              {p.climbing ? ' · klettert' : ''}
            </small>
          </span>
        </Link>
      </td>
      <td>{view === 'rank' ? rank : average}</td>
      <td className="hide-sm">{view === 'rank' ? average : rank}</td>
      <td className="hide-sm">
        <div className="champs">
          {p.champions.map((c) => (
            <Img key={c.championId} className="champ" src={championImage(dragon, championKey(dragon, c) || undefined)} alt={`${dragon?.champions.get(c.championId)?.name ?? c.champion}, ${c.games} Spiele`} size={28} />
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
