'use client';
// The pages of augments and items: the lists (/augments, /items), strongest first with the win
// rate as the one number per entry, a search, one filter (rarity or kind of item) and the period,
// and the page of one (/augments/<id>, /items/<id>) with the answer on top (win rate and games)
// and tabs for the champions it was taken on and what was taken with it.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { championImage, championKey, championLabel, useDragon, useLive } from './data';
import { num, season } from './format';
import type { MetaChampion, MetaDetail, MetaRow as Row } from '../../src/meta';
import { MIN_GAMES } from '../../src/meta';
import { tiersOf, type Tier } from '../../src/tiers';
import { Img, More, Problem, Tabs, Top, step } from './bits';
import { Filters, useFilters, type Scope } from './filters';
import { Answer, gamesText, isTop, MetaRow, SortSelect, sortRows, statTitle, strongest, wholePercent, type Sort } from './meta';

export type MetaList = {
  scope: Scope;
  season: { id: string; year: number; number: number; start: number };
  games: number;
  /** Counted player-games: what the pick rate is a share of. */
  entries: number;
  rows: Row[];
};

/** Cards (augments) shown before "Show more"; rows (items) show the usual 5. */
const FIRST_CARDS = 12;

export function MetaListPage<F extends string>({
  kind,
  title,
  question,
  noun,
  label,
  picture,
  rarity,
  filter,
  filters: choices,
  initialFilter,
  note,
  ranked,
}: {
  kind: 'augments' | 'items';
  title: string;
  /** The page's one question, under the title. */
  question: string;
  /** "Augment" / "Item", for the search and the empty states. */
  noun: string;
  label: (id: number) => string;
  picture: (id: number, size: number) => ReactNode;
  /** Augments are cards in the color of their rarity; items are rows. */
  rarity?: (id: number) => string | undefined;
  filter: (id: number, value: F) => boolean;
  filters: { id: F; label: string }[];
  initialFilter: F;
  note: string;
  /** What the tiers rank among (items: finished and boots, as on the tier list); default everything. */
  ranked?: (id: number) => boolean;
}) {
  const filters = useFilters();
  const { data, error, live } = useLive<MetaList>(`/api/stats/${kind}?` + filters.query);
  const [find, setFind] = useState('');
  const [only, setOnly] = useState<F>(initialFilter);
  const [sort, setSort] = useState<Sort>('strong');

  const q = find.trim().toLowerCase();
  const all = data?.rows ?? [];
  const shown = sortRows(
    all.filter((r) => filter(r.id, only) && (!q || label(r.id).toLowerCase().includes(q))),
    sort,
    (r) => label(r.id),
  );
  // Tiers S–D among the same rows as on the tier list, not only the filtered ones.
  const tiers = new Map<number, Tier>(tiersOf(ranked ? all.filter((r) => ranked(r.id)) : all).map((t) => [t.row.id, t.tier]));
  const best = strongest(shown, (r) => label(r.id))[0]?.id;
  const topOf = (r: Row) => r.id === best && r.winRate !== null && shown.length > 1;

  return (
    <>
      <div className="page-head in">
        <div>
          <h1>{title}</h1>
          <p className="page-sub">
            {question} {data && filters.scope === 'season' ? season(data.season) : 'All time'}
            {data ? ` · ${gamesText(data.games)}` : ''}
          </p>
        </div>
        <div className="side">
          <span className="live" data-on={live}>
            {live ? 'Live' : 'Updates every 5 s'}
          </span>
          <Filters {...filters} />
        </div>
      </div>

      {error && <Problem message={error} />}

      <section className="section" aria-label={title}>
        <div className="tools">
          <label className="field">
            <span className="sr">{`Search ${noun.toLowerCase()}s`}</span>
            <input type="search" placeholder={`Search ${noun.toLowerCase()}s`} value={find} onChange={(e) => setFind(e.target.value)} />
          </label>
          <div className="chips" role="group" aria-label="Show">
            {choices.map((c) => (
              <button key={c.id} type="button" aria-pressed={only === c.id} onClick={() => setOnly(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
          <SortSelect value={sort} onChange={setSort} />
        </div>

        {!data && !error && <p className="empty">{`Loading ${title.toLowerCase()} …`}</p>}
        {data && !all.length && (
          <p className="empty">
            {filters.scope === 'season' ? (
              'No games this season yet.'
            ) : (
              <>
                No games yet. {title} show up as soon as someone uploads games. <a href="/join">Join</a>
              </>
            )}
          </p>
        )}
        {data && all.length > 0 && !shown.length && <p className="empty">Nothing matches the filter.</p>}

        {shown.length > 0 &&
          (rarity ? (
            <More
              key={`${only}-${sort}`}
              list={shown}
              className="aug-grid"
              first={FIRST_CARDS}
              all={!!q}
              label={title}
              render={(r, i) => (
                <li key={r.id} className="tile aug-card in" data-rarity={rarity(r.id)} data-top={topOf(r) || undefined} style={step(i)}>
                  <span className="rate">{wholePercent(r.winRate)}</span>
                  {tiers.get(r.id) && (
                    <span className="tier-shield" data-tier={tiers.get(r.id)} title={`Tier ${tiers.get(r.id)}`}>
                      {tiers.get(r.id)}
                    </span>
                  )}
                  {picture(r.id, 60)}
                  <h2>
                    <Link className="stretch" href={`/${kind}/${r.id}`} title={statTitle(r)}>
                      {label(r.id)}
                    </Link>
                  </h2>
                  <span className="games">
                    {topOf(r) && <Top />} {gamesText(r.games)}
                  </span>
                </li>
              )}
            />
          ) : (
            <More
              key={`${only}-${sort}`}
              list={shown}
              className="rows grid"
              all={!!q}
              label={title}
              render={(r, i) => (
                <MetaRow
                  key={r.id}
                  index={i}
                  href={`/${kind}/${r.id}`}
                  picture={picture(r.id, 40)}
                  name={label(r.id)}
                  stat={r}
                  top={topOf(r)}
                  sub={tiers.get(r.id) ? `Tier ${tiers.get(r.id)}` : (ranked?.(r.id) ?? true) ? 'few games' : undefined}
                />
              )}
            />
          ))}

        {data && all.length > 0 && (
          <p className="fine">
            {`Strongest = most wins, with few games pulled towards 50%. ${num(data.entries)} player games of 8 minutes or more. Win rate from ${MIN_GAMES} games on. ${note} `}
            <a href="/join">More games make it more accurate</a>
          </p>
        )}
      </section>
    </>
  );
}

type Detail = Omit<MetaList, 'games' | 'entries' | 'rows'> & { detail: MetaDetail };
type Dragon = ReturnType<typeof useDragon>;
type Part = 'champions' | 'paired';

/** One augment or item: the answer on top, the champions it was taken on and what was taken with it. */
export function MetaDetailPage({
  kind,
  id,
  back,
  name,
  icon,
  facts,
  paired,
}: {
  kind: 'augments' | 'items';
  id: number | null;
  back: { href: string; label: string };
  name: string;
  icon: ReactNode;
  facts: ReactNode;
  paired: { title: string; noun: string; href: (id: number) => string; label: (id: number) => string; picture: (id: number) => ReactNode };
}) {
  const filters = useFilters();
  const { data, error, missing } = useLive<Detail>(id ? `/api/stats/${kind}/${id}?${filters.query}` : null);
  const dragon = useDragon();
  const [part, setPart] = useState<Part>('champions');
  if (!id) return <Problem message={kind === 'augments' ? 'Unknown augment' : 'Unknown item'} missing />;
  const d = data?.detail;
  const noun = kind === 'augments' ? 'augment' : 'item';

  return (
    <>
      <Link className="back" href={back.href}>
        ← {back.label}
      </Link>

      <section className="hero plain in" aria-label={name}>
        <div className="glass hero-glass">
          <div className="title">
            {icon}
            <div>
              <h1>{name}</h1>
              <div className="pills">
                {facts && <span className="pill">{facts}</span>}
                {d?.grade && <span className="pill gold">{`Average grade ${d.grade}`}</span>}
                <span className="pill">{data && filters.scope === 'season' ? season(data.season) : 'All time'}</span>
              </div>
            </div>
          </div>
          {d && <Answer stat={d} />}
        </div>
      </section>

      {error && <Problem message={error} missing={missing} />}
      {!data && !error && <p className="empty">{`Loading ${noun} …`}</p>}

      {d && (
        <section className="section in" style={step(1)}>
          <div className="tools">
            <Tabs<Part>
              label="Show"
              value={part}
              onChange={setPart}
              options={[
                { id: 'champions', label: 'Best champions' },
                { id: 'paired', label: paired.title },
              ]}
            />
            <Filters {...filters} />
          </div>
          {part === 'champions' ? (
            <Champions rows={d.champions} dragon={dragon} noun={noun} />
          ) : (
            <Paired rows={d.paired} {...paired} />
          )}
          <p className="fine">
            {`Every game of 8 minutes or more in which someone had the ${noun}. Strongest first; hover a row for pick rate and average grade.`}
          </p>
        </section>
      )}
    </>
  );
}

function Champions({ rows, dragon, noun }: { rows: MetaChampion[]; dragon: Dragon; noun: string }) {
  const list = strongest(rows, (c) => championLabel(dragon, c));
  if (!list.length) return <p className="empty">{`No champion with this ${noun}.`}</p>;
  return (
    <More
      list={list}
      className="rows grid"
      label="Champions"
      render={(c, i) => (
        <MetaRow
          key={c.championId}
          index={i}
          href={'/champions/' + (c.champion || c.championId)}
          picture={<Img className="champ" src={championImage(dragon, championKey(dragon, c) || undefined)} size={40} />}
          name={championLabel(dragon, c)}
          stat={c}
          top={isTop(list, i)}
          pickLabel="Taken in"
        />
      )}
    />
  );
}

function Paired({ rows, noun, href, label, picture }: { rows: Row[]; noun: string; href: (id: number) => string; label: (id: number) => string; picture: (id: number) => ReactNode }) {
  const list = strongest(rows, (r) => label(r.id));
  if (!list.length) return <p className="empty">{`No ${noun.toLowerCase()} yet.`}</p>;
  return (
    <More
      list={list}
      className="rows grid"
      label={noun}
      render={(r, i) => (
        <MetaRow key={r.id} index={i} href={href(r.id)} picture={picture(r.id)} name={label(r.id)} stat={r} top={isTop(list, i)} pickLabel="Taken in" />
      )}
    />
  );
}
