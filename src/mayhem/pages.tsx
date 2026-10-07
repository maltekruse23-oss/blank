// The Mayhem app's pages besides the champ card (user, 07.10.2026: a desktop app like Blitz that
// grows page by page): augment tier list as cards (after Blitz's augment page), champion tier
// list as tier blocks with icon grids, and the rank page (planned, invented values, marked
// "Mock"). Numbers of the tier lists from arammeta.com (tiers.ts). Design "Arena" (mayhem.css).
import { useMemo, useState, type CSSProperties } from 'react';
import { championSplash, championSquare } from '../adapters/aram';
import { TIERS, type Tier } from '../features/aram/champCard';
import { percent } from '../features/aram/format';
import { games } from './MayhemCard';
import { MOCK_LADDER, MOCK_ME } from './mock';
import type { Page } from './MayhemApp';
import type { TierAugment, TierChampion, TierLists } from './tiers';
import rankSs from '../../apps/mayhem-site/public/ranks/ss.png';
import rankS from '../../apps/mayhem-site/public/ranks/s.png';
import gradeSss from '../../apps/mayhem-site/public/grades/sss.png';
import gradeSs from '../../apps/mayhem-site/public/grades/ss.png';
import gradeS from '../../apps/mayhem-site/public/grades/s.png';

const step = (i: number) => ({ ['--i' as string]: Math.min(i, 16) }) as CSSProperties;

/** Header of a page: title, a short line and, for invented values, the "Mock" badge. */
function PageHead({ title, line, badge }: { title: string; line: string; badge?: string }) {
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

function TierWait({ tiers, onRetry }: { tiers: TierState; onRetry: () => void }) {
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

export function AugmentsPage({ tiers, onRetry }: { tiers: TierState; onRetry: () => void }) {
  const [rarity, setRarity] = useState<TierAugment['rarity'] | 'all'>('all');
  const [tier, setTier] = useState<Tier | 'all'>('all');
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const list = tiers.state === 'ready' ? tiers.lists.augments : [];
    const q = query.trim().toLowerCase();
    return list.filter(
      (a) =>
        (rarity === 'all' || a.rarity === rarity) &&
        (tier === 'all' || a.tier === tier) &&
        (!q || a.name.toLowerCase().includes(q) || a.text.toLowerCase().includes(q)),
    );
  }, [tiers, rarity, tier, query]);
  return (
    <div className="mayhem-page">
      <PageHead title="ARAM Mayhem Augments" line={source(tiers, 'Jedes Augment')} />
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
                    <AugmentCard key={a.id} augment={a} index={i + 2} />
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
function AugmentCard({ augment: a, index }: { augment: TierAugment; index: number }) {
  return (
    <article className="mayhem-aug-card mayhem-in" data-rarity={a.rarity} style={step(index)}>
      <span className="mayhem-aug-card-tier" data-tier={a.tier}>
        {a.tier}
      </span>
      <span className="mayhem-aug-card-rate">{percent(a.winRate)}</span>
      <span className="mayhem-aug-card-icon">
        {a.image && <img src={a.image} alt="" width={56} height={56} loading="lazy" />}
      </span>
      <h3>{a.name}</h3>
      <p>{a.text}</p>
      <span className="mayhem-aug-card-games">{games(a.games)}</span>
    </article>
  );
}

/** Data Dragon's classes in German (the tier list filters by the first one). */
const ROLES: Record<string, string> = {
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

export function ChampionsPage({ tiers, onRetry }: { tiers: TierState; onRetry: () => void }) {
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
      <PageHead title="ARAM Mayhem Tier-Liste" line={source(tiers, 'Jeder Champion')} />
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
            return <ChampionTier key={tier} tier={tier} list={inTier} index={t + 2} />;
          })}
          {!shown.length && <p className="mayhem-note">Nichts gefunden.</p>}
        </>
      )}
    </div>
  );
}

/** A tier as Blitz shows it: a lit block with the letter, the champions in a grid beside it. */
function ChampionTier({ tier, list, index }: { tier: Tier; list: TierChampion[]; index: number }) {
  return (
    <section className="mayhem-tier-block mayhem-in" data-tier={tier} style={step(index)}>
      <div className="mayhem-tier-side">
        <span>{tier}</span>
        <small>{TIER_LINE[tier]}</small>
      </div>
      <div className="mayhem-champ-grid">
        {list.map((c) => (
          <span key={c.id} className="mayhem-champ" title={`${c.name}: ${games(c.games)}`}>
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
          </span>
        ))}
      </div>
    </section>
  );
}

const GRADE_IMAGE = { sss: gradeSss, ss: gradeSs, s: gradeS };

/** Planned: the user's rank and the leaderboard from mayhemstats.lol. Invented values for now. */
export function RankPage() {
  return (
    <div className="mayhem-page">
      <PageHead
        title="Rang"
        line="Dein Rang und die Rangliste von mayhemstats.lol. Kommt, sobald die App deinen Spieler liest."
        badge="Mock · geplant"
      />
      <div className="mayhem-columns">
        <div className="mayhem-column-side">
          <section className="mayhem-glass mayhem-rank mayhem-in" style={step(1)}>
            <img src={rankSs} alt="" width={88} height={88} />
            <div>
              <div className="mayhem-note">Season 3 · 2026</div>
              <div className="mayhem-rank-name">{MOCK_ME.rank}</div>
              <div className="mayhem-note">
                {MOCK_ME.mp} MP · {MOCK_ME.top}
              </div>
              <div className="mayhem-bar">
                <span style={{ width: `${MOCK_ME.mp}%` }} />
              </div>
              <div className="mayhem-rank-facts">
                {MOCK_ME.wins}S {MOCK_ME.losses}N
              </div>
            </div>
          </section>
          <section className="mayhem-section">
            <h2 className="mayhem-in" style={step(2)}>
              Rangliste
            </h2>
            <ul className="mayhem-ladder">
              {MOCK_LADDER.map((p, i) => (
                <li key={p.place} className="mayhem-in" data-place={p.place} style={step(i + 3)}>
                  <b className="mayhem-place">{p.place}</b>
                  <img src={championSquare(p.alias) ?? undefined} alt="" width={34} height={34} />
                  <span className="mayhem-aug-name">{p.name}</span>
                  <span className="mayhem-server">{p.server}</span>
                  <span className="mayhem-ladder-rank">
                    <img
                      src={p.rank.startsWith('SS') ? rankSs : rankS}
                      alt=""
                      width={28}
                      height={28}
                    />
                    {p.rank}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <section className="mayhem-section mayhem-column-main">
          <h2 className="mayhem-in" style={step(2)}>
            Matchverlauf
          </h2>
          <ul className="mayhem-games">
            {MOCK_ME.games.map((g, i) => (
              <li key={i} className="mayhem-in" data-win={g.win} style={step(i + 3)}>
                <img src={championSquare(g.alias) ?? undefined} alt="" width={52} height={52} />
                <span className="mayhem-game-main">
                  <b>{g.win ? 'Sieg' : 'Niederlage'}</b>
                  <span>
                    {g.kda} · {g.ago}
                  </span>
                </span>
                <span className="mayhem-game-grade">
                  <img
                    src={GRADE_IMAGE[g.grade]}
                    alt={`Note ${g.grade.toUpperCase()}`}
                    width={52}
                    height={52}
                  />
                  <span className="mayhem-mp">+{g.mp} MP</span>
                </span>
              </li>
            ))}
          </ul>
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
 * Home (user, 08.10.2026: the dashboard of the canvas "App · Home"): a hero, tabs into the other
 * pages, the week's top augments (real, arammeta.com) and the last games, with the rank, numbers,
 * records and a goal in a bento column. Everything about the player is invented until the app
 * reads the player from the League client, and says "Mock".
 */
export function HomePage({ tiers, onOpen }: { tiers: TierState; onOpen: (page: Page) => void }) {
  const top = tiers.state === 'ready' ? tiers.lists.augments.slice(0, 4) : [];
  const splash = championSplash(MOCK_ME.main.alias);
  return (
    <div className="mayhem-home">
      <div className="mayhem-home-main">
        <section
          className="mayhem-hero-big mayhem-in"
          style={splash ? { ['--splash' as string]: `url("${splash}")` } : undefined}
        >
          <span className="mayhem-pill mock">Mock</span>
          <div className="mayhem-hero-text">
            <span className="mayhem-kicker">Dein Champion diese Saison</span>
            <h1>{MOCK_ME.main.name}</h1>
            <p>
              {MOCK_ME.main.games} Spiele · Ø Note {MOCK_ME.main.grade} · {MOCK_ME.main.winRate}{' '}
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
        </div>

        <section className="mayhem-row">
          <div className="mayhem-row-head mayhem-in" style={step(2)}>
            <h2>Top Augments</h2>
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
                  onClick={() => onOpen('augments')}
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
            <span className="mayhem-pill mock">Mock</span>
          </div>
          <div className="mayhem-game-cards">
            {MOCK_ME.games.map((g, i) => {
              const art = championSplash(g.alias);
              return (
                <article
                  key={i}
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
                      {g.kda} · {g.ago}
                    </small>
                  </div>
                  <strong>+{g.mp} MP</strong>
                  <img
                    src={GRADE_IMAGE[g.grade]}
                    alt={`Note ${g.grade.toUpperCase()}`}
                    width={44}
                    height={44}
                  />
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <aside className="mayhem-bento">
        <section className="mayhem-glass mayhem-bento-rank mayhem-in" style={step(1)}>
          <div className="mayhem-bento-rank-head">
            <div>
              <span className="mayhem-note">Dein Rang · Season 3</span>
              <div className="mayhem-rank-name">{MOCK_ME.rank}</div>
              <span className="mayhem-note">
                {MOCK_ME.mp} MP · {MOCK_ME.top}
              </span>
            </div>
            <img src={rankSs} alt="" width={76} height={76} />
          </div>
          <svg
            viewBox="0 0 300 70"
            className="mayhem-curve"
            aria-label="MP-Verlauf der letzten Spiele"
          >
            <defs>
              <linearGradient id="mayhem-mp" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#f2c14e" stopOpacity="0.35" />
                <stop offset="1" stopColor="#f2c14e" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0 58 C 30 56, 50 50, 75 47 S 120 40, 150 30 S 200 34, 225 22 S 270 10, 300 6 L300 70 L0 70 Z"
              fill="url(#mayhem-mp)"
            />
            <path
              className="mayhem-curve-line"
              d="M0 58 C 30 56, 50 50, 75 47 S 120 40, 150 30 S 200 34, 225 22 S 270 10, 300 6"
            />
            <circle cx="300" cy="6" r="4" fill="#fff3d6" />
          </svg>
          <div className="mayhem-curve-scale">
            <span>vor 20 Spielen</span>
            <span className="mayhem-pill mock">Mock</span>
            <span>jetzt</span>
          </div>
        </section>
        <div className="mayhem-bento-pair">
          <section className="mayhem-tile mayhem-in" style={step(2)}>
            <span className="mayhem-note">Spiele</span>
            <strong>{MOCK_ME.played}</strong>
            <small>
              {MOCK_ME.wins}S {MOCK_ME.losses}N
            </small>
          </section>
          <section className="mayhem-tile mayhem-in" style={step(3)}>
            <span className="mayhem-note">Ø Note</span>
            <span className="mayhem-tile-grade">
              <img src={GRADE_IMAGE[MOCK_ME.average]} alt="" width={34} height={34} />
              <strong>{MOCK_ME.average.toUpperCase()}</strong>
            </span>
          </section>
        </div>
        <section className="mayhem-tile mayhem-in" style={step(4)}>
          <span className="mayhem-note">Rekorde</span>
          <div className="mayhem-records">
            {MOCK_ME.records.map((r) => (
              <span key={r.label} data-best={r.best}>
                <strong>{r.value}</strong>
                <small>{r.label}</small>
              </span>
            ))}
          </div>
        </section>
        <section className="mayhem-goal mayhem-in" style={step(5)}>
          <span className="mayhem-kicker">Ziel heute</span>
          <strong>{MOCK_ME.goal.title}</strong>
          <small>{MOCK_ME.goal.line}</small>
          <div className="mayhem-bar">
            <span style={{ width: `${Math.round(MOCK_ME.goal.done * 100)}%` }} />
          </div>
        </section>
      </aside>
    </div>
  );
}
