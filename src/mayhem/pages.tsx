// The Mayhem app's pages besides the champ card (user, 07.10.2026: a desktop app like Blitz that
// grows page by page): augment tier list as cards (after Blitz's augment page), champion tier
// list as tier blocks with icon grids, and the rank page (the player's rank and the leaderboard
// from mayhemstats.lol, me.ts). Numbers of the tier lists from arammeta.com (tiers.ts). Design
// "Arena" (mayhem.css).
import { useMemo, useState, type CSSProperties } from 'react';
import { championSplash, championSquare } from '../adapters/aram';
import type { Grade } from '../features/aram/aramPerformance';
import { PLACEMENT, rankName, seasonName, seasonOf, type Rank } from '../features/aram/aramRating';
import { TIERS, type Tier } from '../features/aram/champCard';
import { number, percent } from '../features/aram/format';
import { games } from './MayhemCard';
import { ago, CURVE_SIZE, curvePath, type MeState, type MeView } from './me';
import type { Page } from './MayhemApp';
import {
  categoryName,
  usedCategories,
  type TierAugment,
  type TierChampion,
  type TierLists,
} from './tiers';

export const step = (i: number) => ({ ['--i' as string]: Math.min(i, 16) }) as CSSProperties;

/** Header of a page: title, a short line and, for invented values, the "Mock" badge. */
export function PageHead({ title, line, badge }: { title: string; line: string; badge?: string }) {
  return (
    <header className="mayhem-page-head mayhem-in">
      <div>
        <h1>{title}</h1>
        <p className="mayhem-note">{line}</p>
      </div>
      {badge && <span className="mayhem-pill mock">{badge}</span>}
    </header>
  );
}

/** Loading, failed or the browser preview: the tier lists come only in the app. */
export type TierState =
  | { state: 'loading' }
  | { state: 'failed'; message: string }
  | { state: 'ready'; lists: TierLists };

export function TierWait({ tiers, onRetry }: { tiers: TierState; onRetry: () => void }) {
  if (tiers.state === 'loading')
    return <p className="mayhem-note mayhem-in">Lade die Liste von arammeta.com …</p>;
  if (tiers.state === 'failed')
    return (
      <div className="mayhem-glow mayhem-in mayhem-narrow">
        <p>{tiers.message}</p>
        <button type="button" className="mayhem-button" onClick={onRetry}>
          Nochmal
        </button>
      </div>
    );
  return null;
}

const source = (tiers: TierState, what: string) =>
  tiers.state === 'ready'
    ? `${what} aus allen ARAM-Mayhem-Spielen bei arammeta.com, Patch ${tiers.lists.patch}. Stufen nach Siegquote.`
    : `${what} von arammeta.com`;

const RARITIES: { id: TierAugment['rarity']; label: string; line: string }[] = [
  { id: 'prismatic', label: 'Prisma-Augments', line: 'Die stärkste Seltenheit.' },
  { id: 'gold', label: 'Gold-Augments', line: 'Für die meisten Builds.' },
  { id: 'silver', label: 'Silber-Augments', line: 'Kleine Schritte, oft unterschätzt.' },
];

const RARITY_CHIP: Record<TierAugment['rarity'] | 'all', string> = {
  all: 'Alle',
  prismatic: 'Prisma',
  gold: 'Gold',
  silver: 'Silber',
};

export function AugmentsPage({
  tiers,
  onRetry,
  onSelect,
}: {
  tiers: TierState;
  onRetry: () => void;
  onSelect: (id: number) => void;
}) {
  const [rarity, setRarity] = useState<TierAugment['rarity'] | 'all'>('all');
  const [tier, setTier] = useState<Tier | 'all'>('all');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const lists = tiers.state === 'ready' ? tiers.lists : null;
  const categories = useMemo(() => (lists ? usedCategories(lists) : []), [lists]);
  const shown = useMemo(() => {
    const list = lists?.augments ?? [];
    const q = query.trim().toLowerCase();
    return list.filter(
      (a) =>
        (rarity === 'all' || a.rarity === rarity) &&
        (tier === 'all' || a.tier === tier) &&
        (category === 'all' || a.cats.includes(category)) &&
        (!q || a.name.toLowerCase().includes(q) || a.text.toLowerCase().includes(q)),
    );
  }, [lists, rarity, tier, category, query]);
  return (
    <div className="mayhem-page">
      <PageHead
        title="ARAM Mayhem Augments"
        line={source(tiers, 'Jedes Augment')}
        badge={lists?.mock ? 'Mock' : undefined}
      />
      {tiers.state !== 'ready' ? (
        <TierWait tiers={tiers} onRetry={onRetry} />
      ) : (
        <>
          <div className="mayhem-tools mayhem-in" style={step(1)}>
            <input
              type="search"
              className="mayhem-search"
              placeholder="Augments nach Name oder Effekt suchen"
              aria-label="Augments suchen"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="mayhem-chips" role="group" aria-label="Seltenheit">
              {(['all', 'prismatic', 'gold', 'silver'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  data-rarity={r}
                  aria-pressed={rarity === r}
                  onClick={() => setRarity(r)}
                >
                  {RARITY_CHIP[r]}
                </button>
              ))}
            </div>
            <div className="mayhem-chips" role="group" aria-label="Stufe">
              {(['all', ...TIERS] as const).map((t) => (
                <button key={t} type="button" aria-pressed={tier === t} onClick={() => setTier(t)}>
                  {t === 'all' ? 'Alle Stufen' : t}
                </button>
              ))}
            </div>
            {lists && categories.length > 0 && (
              <div className="mayhem-chips" role="group" aria-label="Kategorie">
                {[{ id: 'all', label: '' }, ...categories].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={category === c.id}
                    onClick={() => setCategory(c.id)}
                  >
                    {c.id === 'all' ? 'Alle Kategorien' : categoryName(lists, c.id)}
                  </button>
                ))}
              </div>
            )}
          </div>
          {RARITIES.map((r) => {
            const inRarity = shown.filter((a) => a.rarity === r.id);
            if (!inRarity.length) return null;
            return (
              <section key={r.id} className="mayhem-group" data-rarity={r.id}>
                <div className="mayhem-in">
                  <h2>{r.label}</h2>
                  <p className="mayhem-note">{r.line}</p>
                </div>
                <div className="mayhem-aug-grid">
                  {inRarity.map((a, i) => (
                    <AugmentCard key={a.id} augment={a} index={i + 2} onSelect={onSelect} />
                  ))}
                </div>
              </section>
            );
          })}
          {!shown.length && <p className="mayhem-note">Nichts gefunden.</p>}
        </>
      )}
    </div>
  );
}

/** One augment as a card (after Blitz): picture in the middle, tier top right, win rate top left. */
function AugmentCard({
  augment: a,
  index,
  onSelect,
}: {
  augment: TierAugment;
  index: number;
  onSelect: (id: number) => void;
}) {
  return (
    <article className="mayhem-aug-card mayhem-in" data-rarity={a.rarity} style={step(index)}>
      <span className="mayhem-aug-card-tier" data-tier={a.tier}>
        {a.tier}
      </span>
      <span className="mayhem-aug-card-rate">{percent(a.winRate)}</span>
      <span className="mayhem-aug-card-icon">
        {a.image && <img src={a.image} alt="" width={56} height={56} loading="lazy" />}
      </span>
      <h3>
        {/* The whole card opens the augment (the button's ::after covers it). */}
        <button type="button" className="mayhem-stretch" onClick={() => onSelect(a.id)}>
          {a.name}
        </button>
      </h3>
      <p>{a.text}</p>
      <span className="mayhem-aug-card-games">
        {games(a.games)} · Pick {a.pick === null ? '–' : percent(a.pick)}
      </span>
    </article>
  );
}

/** Data Dragon's classes in German (the tier list filters by the first one). */
export const ROLES: Record<string, string> = {
  Tank: 'Tank',
  Fighter: 'Kämpfer',
  Mage: 'Magier',
  Marksman: 'Schütze',
  Assassin: 'Assassine',
  Support: 'Support',
};

const TIER_LINE: Record<Tier, string> = {
  S: 'Beste 10 %',
  A: 'Nächste 20 %',
  B: 'Mitte 40 %',
  C: 'Nächste 20 %',
  D: 'Letzte 10 %',
};

export function ChampionsPage({
  tiers,
  onRetry,
  onSelect,
}: {
  tiers: TierState;
  onRetry: () => void;
  onSelect: (id: number) => void;
}) {
  const [role, setRole] = useState<string>('all');
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const list = tiers.state === 'ready' ? tiers.lists.champions : [];
    const q = query.trim().toLowerCase();
    return list.filter(
      (c) => (role === 'all' || c.tags[0] === role) && (!q || c.name.toLowerCase().includes(q)),
    );
  }, [tiers, role, query]);
  return (
    <div className="mayhem-page">
      <PageHead
        title="ARAM Mayhem Tier-Liste"
        line={source(tiers, 'Jeder Champion')}
        badge={tiers.state === 'ready' && tiers.lists.mock ? 'Mock' : undefined}
      />
      {tiers.state !== 'ready' ? (
        <TierWait tiers={tiers} onRetry={onRetry} />
      ) : (
        <>
          <div className="mayhem-tools mayhem-in" style={step(1)}>
            <input
              type="search"
              className="mayhem-search"
              placeholder="Champion suchen"
              aria-label="Champions suchen"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="mayhem-chips" role="group" aria-label="Klasse">
              {['all', ...Object.keys(ROLES)].map((r) => (
                <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)}>
                  {r === 'all' ? 'Alle Klassen' : ROLES[r]}
                </button>
              ))}
            </div>
          </div>
          {TIERS.map((tier, t) => {
            const inTier = shown.filter((c) => c.tier === tier);
            if (!inTier.length) return null;
            return (
              <ChampionTier
                key={tier}
                tier={tier}
                list={inTier}
                index={t + 2}
                onSelect={onSelect}
              />
            );
          })}
          {!shown.length && <p className="mayhem-note">Nichts gefunden.</p>}
        </>
      )}
    </div>
  );
}

/** A tier as Blitz shows it: a lit block with the letter, the champions in a grid beside it. */
function ChampionTier({
  tier,
  list,
  index,
  onSelect,
}: {
  tier: Tier;
  list: TierChampion[];
  index: number;
  onSelect: (id: number) => void;
}) {
  return (
    <section className="mayhem-tier-block mayhem-in" data-tier={tier} style={step(index)}>
      <div className="mayhem-tier-side">
        <span>{tier}</span>
        <small>{TIER_LINE[tier]}</small>
      </div>
      <div className="mayhem-champ-grid">
        {list.map((c) => (
          <button
            key={c.id}
            type="button"
            className="mayhem-champ"
            title={`${c.name}: ${games(c.games)}`}
            onClick={() => onSelect(c.id)}
          >
            <img
              src={championSquare(c.alias) ?? undefined}
              alt=""
              width={42}
              height={42}
              loading="lazy"
            />
            <span>
              <b>{c.name}</b>
              <small>{percent(c.winRate)}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

const RANK_IMAGE = import.meta.glob<string>('../../apps/mayhem-site/public/ranks/*.png', {
  eager: true,
  import: 'default',
});
const GRADE_IMAGE = import.meta.glob<string>('../../apps/mayhem-site/public/grades/*.png', {
  eager: true,
  import: 'default',
});
const rankImage = (rank: Rank) =>
  RANK_IMAGE[`../../apps/mayhem-site/public/ranks/${rank.tier.id}.png`];
const gradeImage = (grade: Grade) =>
  GRADE_IMAGE[`../../apps/mayhem-site/public/grades/${grade.toLowerCase()}.png`];

const winLoss = (me: MeView) => `${me.wins}S ${me.games - me.wins}N`;
const mpLine = (me: MeView, rank: Rank) =>
  [`${rank.points} MP`, me.top !== null ? `Top ${me.top} %` : me.place ? `Platz ${me.place}` : null]
    .filter(Boolean)
    .join(' · ');
const gainText = (gain: number | null) =>
  gain === null ? '–' : `${gain > 0 ? '+' : gain < 0 ? '−' : ''}${Math.abs(gain)} MP`;

/** Why there is no player to show: client closed, loading, failed or not in the database. */
function MeNotice({ me, onRetry }: { me: MeState; onRetry: () => void }) {
  const [title, line] =
    me.state === 'loading'
      ? ['Lade deinen Spieler …', 'Von mayhemstats.lol.']
      : me.state === 'closed'
        ? ['Starte League', 'Dein Rang erscheint, sobald du im League-Client angemeldet bist.']
        : me.state === 'failed'
          ? ['Keine Verbindung', me.message]
          : ['Nicht in der Datenbank', `${me.name} hat noch keine Spiele bei mayhemstats.lol.`];
  return (
    <>
      <h1>{title}</h1>
      <p>{line}</p>
      {me.state === 'failed' && (
        <div className="mayhem-hero-actions">
          <button type="button" className="mayhem-button" onClick={onRetry}>
            Nochmal
          </button>
        </div>
      )}
    </>
  );
}

const ready = (me: MeState) => (me.state === 'ready' ? me : null);

/** The player's rank, the leaderboard and the match history from mayhemstats.lol (me.ts). */
export function RankPage({ me, onRetry }: { me: MeState; onRetry: () => void }) {
  const got = ready(me);
  const own = got?.me ?? null;
  const rank = own?.rank ?? null;
  return (
    <div className="mayhem-page">
      <PageHead
        title="Rang"
        line={`Dein Rang und die Rangliste von mayhemstats.lol, ${seasonName(seasonOf(Date.now()))}.`}
        badge={got?.mock ? 'Mock' : undefined}
      />
      <div className="mayhem-columns">
        <div className="mayhem-column-side">
          <section className="mayhem-glass mayhem-rank mayhem-in" style={step(1)}>
            {own && rank && <img src={rankImage(rank)} alt="" width={88} height={88} />}
            <div>
              {own ? (
                <>
                  <div className="mayhem-note">{got!.name}</div>
                  <div className="mayhem-rank-name">{rank ? rankName(rank) : '–'}</div>
                  <div className="mayhem-note">
                    {rank ? mpLine(own, rank) : `Einstufung ${own.placed}/${PLACEMENT}`}
                  </div>
                  <div className="mayhem-bar">
                    <span
                      style={{
                        width: `${rank ? (rank.division === null ? 100 : rank.points) : (own.placed / PLACEMENT) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="mayhem-rank-facts">{winLoss(own)}</div>
                </>
              ) : (
                <MeNotice me={me} onRetry={onRetry} />
              )}
            </div>
          </section>
          {got && got.ladder.length > 0 && (
            <section className="mayhem-section">
              <h2 className="mayhem-in" style={step(2)}>
                Rangliste
              </h2>
              <ul className="mayhem-ladder">
                {got.ladder.map((p, i) => (
                  <li
                    key={p.place}
                    className="mayhem-in"
                    data-place={p.place}
                    data-me={p.me}
                    style={step(i + 3)}
                  >
                    <b className="mayhem-place">{p.place}</b>
                    {p.rank && <img src={rankImage(p.rank)} alt="" width={34} height={34} />}
                    <span className="mayhem-aug-name">{p.name}</span>
                    <span className="mayhem-ladder-rank">
                      {p.rank ? `${rankName(p.rank)} · ${p.rank.points} MP` : '–'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <section className="mayhem-section mayhem-column-main">
          <h2 className="mayhem-in" style={step(2)}>
            Matchverlauf
          </h2>
          {own?.recent.length ? (
            <ul className="mayhem-games">
              {own.recent.map((g, i) => (
                <li key={g.gameId} className="mayhem-in" data-win={g.win} style={step(i + 3)}>
                  <img
                    src={(g.alias && championSquare(g.alias)) || undefined}
                    alt=""
                    width={52}
                    height={52}
                  />
                  <span className="mayhem-game-main">
                    <b>{g.win ? 'Sieg' : 'Niederlage'}</b>
                    <span>
                      {g.name} · {g.kda} · {ago(g.at, Date.now())}
                    </span>
                  </span>
                  <span className="mayhem-game-grade">
                    <img src={gradeImage(g.grade)} alt={`Note ${g.grade}`} width={52} height={52} />
                    <span className="mayhem-mp" data-down={(g.gain ?? 0) < 0}>
                      {gainText(g.gain)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mayhem-note mayhem-in">
              {own ? 'Noch keine gewerteten Spiele.' : 'Erscheint mit deinem Spieler.'}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

const RARITY_WORD: Record<TierAugment['rarity'], string> = {
  prismatic: 'Prisma',
  gold: 'Gold',
  silver: 'Silber',
};

/**
 * Home (user, 08.10.2026: the dashboard of the canvas "App · Home"): a hero with the most played
 * champion, tabs into the other pages, the week's top augments (arammeta.com) and the last games,
 * with the rank, numbers and records in a bento column. The player comes from mayhemstats.lol
 * (me.ts); without one the hero says why.
 */
export function HomePage({
  tiers,
  me,
  onOpen,
  onAugment,
  onRetry,
}: {
  tiers: TierState;
  me: MeState;
  onOpen: (page: Page) => void;
  onAugment: (id: number) => void;
  onRetry: () => void;
}) {
  const top = tiers.state === 'ready' ? tiers.lists.augments.slice(0, 4) : [];
  const got = ready(me);
  const own = got?.me ?? null;
  const main = own?.main ?? null;
  const splash = main?.alias ? championSplash(main.alias) : null;
  const curve = own ? curvePath(own.curve) : null;
  return (
    <div className="mayhem-home">
      <div className="mayhem-home-main">
        <section
          className="mayhem-hero-big mayhem-in"
          style={splash ? { ['--splash' as string]: `url("${splash}")` } : undefined}
        >
          {got?.mock && <span className="mayhem-pill mock">Mock</span>}
          <div className="mayhem-hero-text">
            {main ? (
              <>
                <span className="mayhem-kicker">Dein meistgespielter Champion</span>
                <h1>{main.name}</h1>
                <p>
                  {games(main.games)} · Ø Note {main.grade} · {percent(main.wins / main.games)}{' '}
                  Siege
                </p>
                <div className="mayhem-hero-actions">
                  <button
                    type="button"
                    className="mayhem-button primary"
                    onClick={() => onOpen('champions')}
                  >
                    Tier-Liste
                  </button>
                  <button type="button" className="mayhem-button" onClick={() => onOpen('rank')}>
                    Alle Spiele
                  </button>
                </div>
              </>
            ) : own ? (
              <>
                <span className="mayhem-kicker">{got!.name}</span>
                <h1>Noch keine Spiele</h1>
                <p>Deine gewerteten Spiele bei mayhemstats.lol erscheinen hier.</p>
              </>
            ) : (
              <MeNotice me={me} onRetry={onRetry} />
            )}
          </div>
        </section>

        <div className="mayhem-tabs mayhem-in" style={step(1)} role="group" aria-label="Schnell zu">
          <button type="button" aria-pressed="true">
            Übersicht
          </button>
          <button type="button" onClick={() => onOpen('augments')}>
            Augments
          </button>
          <button type="button" onClick={() => onOpen('champions')}>
            Champions
          </button>
          <button type="button" onClick={() => onOpen('rank')}>
            Rang
          </button>
          <button type="button" onClick={() => onOpen('patch')}>
            Patch
          </button>
          <button type="button" onClick={() => onOpen('items')}>
            Items
          </button>
        </div>

        <section className="mayhem-row">
          <div className="mayhem-row-head mayhem-in" style={step(2)}>
            <h2>Top Augments</h2>
            {tiers.state === 'ready' && tiers.lists.mock && (
              <span className="mayhem-pill mock">Mock</span>
            )}
            <button type="button" className="mayhem-link" onClick={() => onOpen('augments')}>
              Alle ansehen
            </button>
          </div>
          {top.length ? (
            <div className="mayhem-mini-grid">
              {top.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  className="mayhem-mini mayhem-in"
                  data-rarity={a.rarity}
                  style={step(i + 3)}
                  onClick={() => onAugment(a.id)}
                  title={a.text}
                >
                  <span className="mayhem-aug-card-tier" data-tier={a.tier}>
                    {a.tier}
                  </span>
                  <span className="mayhem-aug-card-icon small">
                    {a.image && <img src={a.image} alt="" width={40} height={40} />}
                  </span>
                  <b>{a.name}</b>
                  <small>
                    {percent(a.winRate)} · {RARITY_WORD[a.rarity]}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <p className="mayhem-note">
              {tiers.state === 'failed' ? tiers.message : 'Lade die Liste von arammeta.com …'}
            </p>
          )}
        </section>

        <section className="mayhem-row">
          <div className="mayhem-row-head mayhem-in" style={step(7)}>
            <h2>Letzte Spiele</h2>
          </div>
          {own?.recent.length ? (
            <div className="mayhem-game-cards">
              {own.recent.slice(0, 3).map((g, i) => {
                const art = g.alias ? championSplash(g.alias) : null;
                return (
                  <article
                    key={g.gameId}
                    className="mayhem-game-card mayhem-in"
                    data-win={g.win}
                    style={{
                      ...step(i + 8),
                      ...(art ? { ['--splash' as string]: `url("${art}")` } : {}),
                    }}
                  >
                    <div>
                      <b>{g.win ? 'Sieg' : 'Niederlage'}</b>
                      <small>
                        {g.kda} · {ago(g.at, Date.now())}
                      </small>
                    </div>
                    <strong>{gainText(g.gain)}</strong>
                    <img src={gradeImage(g.grade)} alt={`Note ${g.grade}`} width={44} height={44} />
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="mayhem-note">
              {own ? 'Noch keine gewerteten Spiele.' : 'Erscheint mit deinem Spieler.'}
            </p>
          )}
        </section>
      </div>

      <aside className="mayhem-bento">
        <section className="mayhem-glass mayhem-bento-rank mayhem-in" style={step(1)}>
          <div className="mayhem-bento-rank-head">
            <div>
              <span className="mayhem-note">Dein Rang · {seasonName(seasonOf(Date.now()))}</span>
              <div className="mayhem-rank-name">{own?.rank ? rankName(own.rank) : '–'}</div>
              <span className="mayhem-note">
                {own?.rank
                  ? mpLine(own, own.rank)
                  : own
                    ? `Einstufung ${own.placed}/${PLACEMENT}`
                    : '–'}
              </span>
            </div>
            {own?.rank && <img src={rankImage(own.rank)} alt="" width={76} height={76} />}
          </div>
          {curve && (
            <>
              <svg
                viewBox={`0 0 ${CURVE_SIZE.width} ${CURVE_SIZE.height}`}
                className="mayhem-curve"
                aria-label="MP-Verlauf der letzten Spiele"
              >
                <defs>
                  <linearGradient id="mayhem-mp" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor="#f2c14e" stopOpacity="0.35" />
                    <stop offset="1" stopColor="#f2c14e" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={curve.area} fill="url(#mayhem-mp)" />
                <path className="mayhem-curve-line" d={curve.line} />
                <circle cx={curve.end[0]} cy={curve.end[1]} r="4" fill="#fff3d6" />
              </svg>
              <div className="mayhem-curve-scale">
                <span>vor {own!.curve.length} Spielen</span>
                <span>jetzt</span>
              </div>
            </>
          )}
        </section>
        <div className="mayhem-bento-pair">
          <section className="mayhem-tile mayhem-in" style={step(2)}>
            <span className="mayhem-note">Spiele</span>
            <strong>{own ? own.games : '–'}</strong>
            {own && <small>{winLoss(own)}</small>}
          </section>
          <section className="mayhem-tile mayhem-in" style={step(3)}>
            <span className="mayhem-note">Ø Note</span>
            <span className="mayhem-tile-grade">
              {own?.average && <img src={gradeImage(own.average)} alt="" width={34} height={34} />}
              <strong>{own?.average ?? '–'}</strong>
            </span>
          </section>
        </div>
        <section className="mayhem-tile mayhem-in" style={step(4)}>
          <span className="mayhem-note">Rekorde</span>
          <div className="mayhem-records">
            <span data-best="true">
              <strong>{own?.best.damage != null ? number(own.best.damage) : '–'}</strong>
              <small>Höchster Schaden</small>
            </span>
            <span data-best="false">
              <strong>{own?.best.kills != null ? own.best.kills : '–'}</strong>
              <small>Meiste Kills</small>
            </span>
          </div>
        </section>
        {own && !own.rank && (
          <section className="mayhem-goal mayhem-in" style={step(5)}>
            <span className="mayhem-kicker">Einstufung</span>
            <strong>Noch {games(PLACEMENT - Math.min(own.placed, PLACEMENT))} bis zum Rang</strong>
            <small>Der Rang erscheint nach {PLACEMENT} gewerteten Spielen.</small>
            <div className="mayhem-bar">
              <span style={{ width: `${(Math.min(own.placed, PLACEMENT) / PLACEMENT) * 100}%` }} />
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}
