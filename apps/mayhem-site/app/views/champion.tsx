'use client';
// One champion: how does it do and what do I build? The answer on top (win rate and games over its
// splash art), then tabs: the best augments and items, the most common combos, the players with a
// profile on it and the best games. Every list shows five first, strongest first, with the win
// rate as its one number; pick rate and average grade stay in the tooltip. Below five graded games
// it says "little data" and shows no averages.
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { MIN_GAMES, roleName, type ChampionDetail, type ChampionGame } from '../../src/champions';
import { combosOf, MIN_COMBO_GAMES, type Combo } from '../../src/builds';
import { Augment, GradeChip, GradeIcon, Img, More, Problem, Tabs, Top, step } from '../ui/bits';
import { Answer, augmentLabel, augmentPicture, gamesText, isTop, itemLabel, itemPicture, MetaRow, percent, strongest, WinValue } from '../ui/meta';
import { num, ago } from '../ui/format';
import { Filters, useFilters, type Scope } from '../ui/filters';
import {
  championImage,
  championKey,
  championLabel,
  profileHref,
  profileImage,
  splashImage,
  splitName,
  useAugments,
  useDragon,
  useItems,
  useLive,
  useNow,
} from '../ui/data';

type Detail = {
  scope: Scope;
  season: { id: string; year: number; number: number; start: number };
  champion: ChampionDetail;
};
type Dragon = ReturnType<typeof useDragon>;
type Part = 'build' | 'combos' | 'players' | 'games';

const VALID = /^([1-9][0-9]{0,4}|[A-Za-z][A-Za-z0-9]{0,29})$/;
const gameLink = (g: ChampionGame) => `/game/${g.gameId}?p=${encodeURIComponent(g.puuid)}`;

export default function ChampionPage() {
  const params = useParams<{ name: string }>();
  const name = params.name;
  const filters = useFilters();
  const { data, error, missing } = useLive<Detail>(VALID.test(name) ? `/api/champions/${name}?${filters.query}` : null);
  const dragon = useDragon();
  const [part, setPart] = useState<Part>('build');

  if (!VALID.test(name)) return <Problem message="Unknown champion" missing />;

  const c = data?.champion;
  const key = c ? championKey(dragon, c) : /^[0-9]+$/.test(name) ? '' : name;
  const title = c ? championLabel(dragon, c) : key;

  return (
    <>
      <Link className="back" href="/champions">
        ← Champions
      </Link>

      <section
        className="hero in"
        aria-label={title || 'Champion'}
        style={key ? ({ '--splash': `url(${splashImage(key)})` } as React.CSSProperties) : undefined}
      >
        <div className="glass hero-glass">
          <div className="title">
            <Img className="champ" src={championImage(dragon, key || undefined)} alt="" size={64} />
            <div>
              <h1>{title || 'Champion'}</h1>
              <div className="pills">
                {c && <span className="pill">{roleName(c.role)}</span>}
                {c?.grade && (
                  <span className="pill gold" title="How well players do on it compared with its usual game">
                    {`Average grade ${c.grade}`}
                  </span>
                )}
                {c && c.pct === null && <span className="pill">Little data</span>}
              </div>
            </div>
          </div>
          {c && <Answer stat={{ games: c.games, pick: c.pick, winRate: c.winRate ?? null, graded: c.graded, pct: c.pct, grade: c.grade }} pickLabel="In" />}
        </div>
      </section>

      {error && <Problem message={error} missing={missing} />}
      {!data && !error && <p className="empty">Loading champion …</p>}

      {c && (
        <section className="section in" style={step(1)} aria-label="Details">
          <div className="tools">
            <Tabs<Part>
              label="Show"
              value={part}
              onChange={setPart}
              options={[
                { id: 'build', label: 'Build' },
                { id: 'combos', label: 'Combos' },
                { id: 'players', label: 'Top players' },
                { id: 'games', label: 'Best games' },
              ]}
            />
            <Filters {...filters} />
          </div>

          {c.pct === null && (
            <div className="notice" role="note">
              {`Little data: only ${c.graded} of ${MIN_GAMES} rated games. Averages show from ${MIN_GAMES} on.`}
            </div>
          )}

          {part === 'build' && <Build detail={c} dragon={dragon} />}
          {part === 'combos' && <Combos detail={c} dragon={dragon} />}
          {part === 'players' && <Players detail={c} dragon={dragon} />}
          {part === 'games' && <BestGames detail={c} dragon={dragon} />}

          <p className="fine">
            Win rate and games count every seat with the values of all ten. Players, builds and best games come from games
            with names. Win or loss does not count for the grade.
          </p>
        </section>
      )}
    </>
  );
}

/** The best augments and the best finished items on this champion, five each. */
function Build({ detail, dragon }: { detail: ChampionDetail; dragon: Dragon }) {
  const known = useAugments();
  const items = useItems();
  const augments = strongest(detail.augments, (a) => augmentLabel(known, a.id));
  const done = strongest(
    (detail.items ?? []).filter((i) => !items.size || items.get(i.id)?.kind !== 'other'),
    (i) => itemLabel(items, i.id),
  );
  return (
    <div className="split even">
      <section className="section" aria-labelledby="best-augments">
        <h2 id="best-augments">Best augments</h2>
        {augments.length ? (
          <More
            list={augments}
            label="Best augments"
            render={(a, i) => (
              <MetaRow key={a.id} index={i} href={`/augments/${a.id}`} picture={augmentPicture(known, a.id)} name={augmentLabel(known, a.id)} stat={a} top={isTop(augments, i)} pickLabel="Taken in" />
            )}
          />
        ) : (
          <p className="empty">No augments in uploaded games.</p>
        )}
      </section>
      <section className="section" aria-labelledby="best-items">
        <h2 id="best-items">Best items</h2>
        {done.length ? (
          <More
            list={done}
            label="Best items"
            render={(it, i) => (
              <MetaRow key={it.id} index={i} href={`/items/${it.id}`} picture={itemPicture(dragon, it.id)} name={itemLabel(items, it.id)} stat={it} top={isTop(done, i)} pickLabel="Built in" />
            )}
          />
        ) : (
          <p className="empty">No items in games with names.</p>
        )}
      </section>
    </div>
  );
}

/** The most common augment pairs and cores of three finished items. */
function Combos({ detail, dragon }: { detail: ChampionDetail; dragon: Dragon }) {
  const augments = useAugments();
  const items = useItems();
  const games = detail.builds ?? [];
  const pairs = combosOf(games, (g) => g.augments, 2);
  // Without Data Dragon there is no telling finished items apart: no cores then.
  const cores = items.size ? combosOf(games, (g) => g.items.filter((id) => items.get(id)?.kind === 'done'), 3) : [];
  return (
    <>
      <div className="split even">
        <ComboList
          title="Augment pairs"
          rows={pairs}
          cell={(id) => (
            <Link key={id} href={`/augments/${id}`} title={augmentLabel(augments, id)}>
              <Augment id={id} info={augments.get(id)} size={32} />
            </Link>
          )}
          label={(ids) => ids.map((id) => augmentLabel(augments, id)).join(' + ')}
        />
        <ComboList
          title="Item cores"
          rows={cores}
          cell={(id) => (
            <Link key={id} href={`/items/${id}`} title={itemLabel(items, id)}>
              {itemPicture(dragon, id, 32)}
            </Link>
          )}
          label={(ids) => ids.map((id) => itemLabel(items, id)).join(' + ')}
        />
      </div>
      <p className="fine">{`Most common in this champion's games, from ${MIN_COMBO_GAMES} games on. Items: the inventory at the end; the buy order is not stored.`}</p>
    </>
  );
}

function ComboList({ title, rows, cell, label }: { title: string; rows: Combo[]; cell: (id: number) => React.ReactNode; label: (ids: number[]) => string }) {
  const list = strongest(rows, (r) => label(r.ids));
  return (
    <section className="section" aria-label={title}>
      <h2>{title}</h2>
      {list.length ? (
        <More
          list={list}
          label={title}
          render={(r, i) => (
            <li
              key={r.ids.join()}
              className="row in"
              data-top={isTop(list, i) || undefined}
              style={step(i)}
              title={`${label(r.ids)} · ${r.winRate === null ? `win rate from ${MIN_GAMES} games on` : `win rate ${percent(r.winRate)}`} · ${gamesText(r.games)} · in ${percent(r.pick)} of games${r.grade ? ` · average grade ${r.grade}` : ''}`}
            >
              <span className="icons">{r.ids.map(cell)}</span>
              <span className="who">{isTop(list, i) && <Top />}</span>
              <WinValue stat={r} />
            </li>
          )}
        />
      ) : (
        <p className="empty">{`No combo in at least ${MIN_COMBO_GAMES} games yet.`}</p>
      )}
    </section>
  );
}

function Players({ detail, dragon }: { detail: ChampionDetail; dragon: Dragon }) {
  if (!detail.players.length) return <p className="empty">Nobody with a profile has played this champion yet.</p>;
  return (
    <More
      list={detail.players}
      className="rows grid"
      label="Top players"
      render={(p, i) => {
        const { name, tag } = splitName(p.name);
        return (
          <li key={p.puuid} className="row in" data-place={p.pct === null ? undefined : i + 1} style={step(i)}>
            <span className="place">{i + 1}</span>
            <Img className="avatar" src={profileImage(dragon, p.icon)} size={36} />
            <span className="who">
              <Link
                className="stretch name"
                href={profileHref({ puuid: p.puuid, name: p.name })}
                title={`${num(p.kills, 1)} / ${num(p.deaths, 1)} / ${num(p.assists, 1)} on average · ${num(p.damagePerMinute)} damage per minute`}
              >
                <span>{name}</span>
                {tag && <span className="tag">#{tag}</span>}
              </Link>
              <small>{gamesText(p.games)}</small>
            </span>
            {p.grade ? <GradeChip grade={p.grade} /> : <span className="faint">–</span>}
          </li>
        );
      }}
    />
  );
}

function BestGames({ detail, dragon }: { detail: ChampionDetail; dragon: Dragon }) {
  const now = useNow();
  if (!detail.best.length) return <p className="empty">No rated game from players with a profile yet.</p>;
  return (
    <More
      list={detail.best}
      className="rows grid"
      label="Best games"
      render={(g, i) => {
        const { name } = splitName(g.name);
        return (
          <li key={`${g.gameId}:${g.puuid}`} className="row in" data-top={i === 0 || undefined} style={step(i)}>
            <GradeIcon grade={g.grade} size={44} />
            <span className="who">
              <Link className="stretch name" href={gameLink(g)} title={`${num(g.damage)} damage · view game`}>
                <span>{name}</span>
              </Link>
              <small className="mono">
                {g.kills} / {g.deaths} / {g.assists} · {ago(g.at, now)}
              </small>
            </span>
            <Img className="avatar" src={profileImage(dragon, g.icon)} size={30} />
          </li>
        );
      }}
    />
  );
}
