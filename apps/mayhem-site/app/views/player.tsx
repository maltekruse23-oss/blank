'use client';
// A player's profile: rank card, the season's way, form, the five axes of the grade, playstyle,
// match history with all ten players, champions and earlier seasons.
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { AramEntry } from '../../src/adapters/aram';
import { rankName, seasonOf } from '../../src/features/aram/aramRating';
import {
  axesIn,
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
import { useLang, type Lang } from '../ui/i18n';
import { meText, setMe, useMe } from '../ui/me';
import { MIN_GAMES, preferencesOf, rankedTags, statsOf } from '../../src/tags';

type T = (en: string, de: string) => string;
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
  const { lang, t, href, ago, season: seasonText } = useLang();
  // Every address (an old link with a PUUID, a public id, a Riot ID in other case) moves to the
  // Riot ID like op.gg, or to the public id when the name is hidden: no PUUID in the address bar.
  const home = data?.id ? profileHref({ puuid: data.id, name: data.name }) : null;
  const here = profileHref({ puuid: decoded(params.puuid) });
  const moved = home && home.toLowerCase() !== here.toLowerCase() ? href(home) : null;
  useEffect(() => {
    if (moved) router.replace(moved);
  }, [moved, router]);

  if (error) return <Problem message={error} missing={missing} />;
  if (!data) return <p className="empty">{t('Loading player …', 'Spieler wird geladen …')}</p>;

  const history = data.history;
  const season = seasonOf(now);
  const thisSeason = history.filter((h) => h.season === season.id);
  const recent = history.slice(-20);
  const radar = radarOf(recent.map((h) => h.entry));
  const stats = census ? statsOf(history.map((h) => ({ entry: h.entry, pct: h.mark.pct })), new Set(census.prismatic)) : null;
  const tags = stats && census ? rankedTags(stats, census, lang) : [];
  // The rarest tags stand at the top; without them (few games) the playstyle badges as before.
  const badges = tags.length
    ? tags.slice(0, 3).map((g) => ({ id: g.id, name: g.name, hint: `${g.hint} · ${shareText(g.share, t)}` }))
    : badgesOf(radar, recent.length).map((b) => ({
        id: b.id,
        name: lang === 'de' ? b.name : b.nameEn,
        hint: lang === 'de' ? b.hint : b.hintEn,
      }));
  const streak = streaksOf(history.map((h) => h.mark.grade));
  const { name, tag } = splitName(data.name);
  const losses = data.games - data.wins;

  return (
    <>
      <Link className="back" href={href('/')}>
        ← {t('Leaderboard', 'Rangliste')}
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
              {data.wins}
              {t('W', 'S')} {losses}
              {t('L', 'N')}
            </span>
            <span>
              {data.games ? Math.round((data.wins / data.games) * 100) : 0} % {t('wins', 'Siege')}
            </span>
            <span>
              {history.length} {t('rated games', 'gewertete Spiele')}
            </span>
            {history.length > 0 && (
              <span>
                {t('last game', 'letztes Spiel')} {ago(history[history.length - 1].entry.at, now)}
              </span>
            )}
          </div>
          <div className="badges">
            <MeButton id={data.id ?? (/^a[1-9][0-9]*$/.test(params.puuid) ? params.puuid : null)} name={data.name} />
            {data.climbing && (
              <span
                className="badge climb"
                title={t(
                  'Performance is above the rank, so MP gains are bigger.',
                  'Die Leistung liegt über dem Rang, die MP-Gewinne sind größer.',
                )}
              >
                {t('Climbing', 'Klettert')}
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
                <div className="name muted">{t('Placement', 'Einstufung')}</div>
                <span className="muted num">
                  {data.placed} {t('of 5 games', 'von 5 Spielen')}
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
          label={t('Sections', 'Bereiche')}
          value={tab}
          onChange={setTab}
          options={[
            { id: 'overview', label: t('Overview', 'Übersicht') },
            { id: 'matches', label: `Matches (${history.length})` },
            { id: 'champions', label: 'Champions' },
            { id: 'seasons', label: t('Seasons', 'Saisons') },
          ]}
        />
      </div>

      {tab === 'overview' && (
        <div className="grid cols-main">
          <div className="stack">
            <div className="stat-row">
              <Stat label={t('Avg performance', 'Leistung Ø')}>
                {data.average ? <GradeChip grade={data.average.grade} /> : '–'}
              </Stat>
              <Stat label={t('This season', 'Diese Saison')}>
                {thisSeason.length} {t('games', 'Spiele')}
              </Stat>
              <Stat label={t('Best S+ streak', 'Beste Serie S+')}>{streak.best}</Stat>
              <Stat label={t('MAYHEM grades', 'MAYHEM-Noten')}>
                {history.filter((h) => h.mark.grade === 'MAYHEM').length}
              </Stat>
            </div>
            <div className="card">
              <h2>
                {t('MP history', 'MP-Verlauf')} · {seasonText(season)}
              </h2>
              <LadderChart
                points={thisSeason
                  .filter((h) => h.after)
                  .map((h) => ({ ladder: h.after!.ladder, change: h.change }))}
              />
            </div>
            <div className="card">
              <h2>{t('Recent games', 'Letzte Spiele')}</h2>
              <Matches steps={history.slice(-5).reverse()} dragon={dragon} name={data.name} />
              {history.length > 5 && (
                <button className="button" style={{ marginTop: 10 }} onClick={() => setTab('matches')}>
                  {t(`All ${history.length} matches`, `Alle ${history.length} Matches`)}
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
                      <span className="faint num">{shareText(g.share, t)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty">
                  {history.length < MIN_GAMES
                    ? t(
                        `Tags from ${MIN_GAMES} rated games (${MIN_GAMES - history.length} to go).`,
                        `Tags ab ${MIN_GAMES} gewerteten Spielen (noch ${MIN_GAMES - history.length}).`,
                      )
                    : census
                      ? t('No tag yet, nothing stands out.', 'Noch kein Tag, nichts sticht heraus.')
                      : t('Loading tags …', 'Tags werden geladen …')}
                </p>
              )}
            </div>
            <Preferences steps={history} dragon={dragon} />
            <div className="card">
              <h2>
                {t(`Strengths · last ${recent.length} games`, `Stärken · letzte ${recent.length} Spiele`)}
              </h2>
              {radar ? (
                <>
                  <Radar values={radar} />
                  <p className="fine">
                    {t(
                      'Dashed: what the played champion usually reaches. Further out = better.',
                      'Gestrichelt: was der gespielte Champion üblicherweise schafft. Weiter außen = besser.',
                    )}{' '}
                    {t(
                      `${Object.values(axesIn(lang)).join(', ')} make up the grade.`,
                      `${Object.values(axesIn(lang)).join(', ')} ergeben zusammen die Note.`,
                    )}
                  </p>
                </>
              ) : (
                <p className="empty">{t('No rated games yet.', 'Noch keine gewerteten Spiele.')}</p>
              )}
            </div>
            <div className="card">
              <h2>Form</h2>
              <Sparkline values={formLine(recent.map((h) => h.mark.pct))} />
              <p className="fine">
                {t(
                  `Moving average of the grades over the last ${recent.length} games.`,
                  `Gleitender Schnitt der Noten der letzten ${recent.length} Spiele.`,
                )}
              </p>
            </div>
            <div className="card">
              <h2>{t('Games missing?', 'Spiele fehlen?')}</h2>
              <p className="fine">
                {t(
                  'Only games someone uploaded show up here. Is this you? With the Collector all your Mayhem games get added, and your rank gets more accurate.',
                  'Hier stehen nur Spiele, die jemand hochgeladen hat. Bist du das? Mit dem Collector kommen alle deine Mayhem-Spiele dazu, und dein Rang wird genauer.',
                )}
              </p>
              <a className="button" href={href('/join')}>
                {t('Join', 'Mitmachen')}
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
const shareText = (share: number, t: T) => {
  const value = `${share < 0.01 ? '<1' : Math.round(share * 100)} %`;
  return share < 0.5 ? t(`only ${value}`, `nur ${value}`) : `${Math.round(share * 100)} %`;
};

/** Data Dragon's class names (English) in German. */
const CLASSES_DE: Record<string, string> = {
  Mage: 'Magier',
  Fighter: 'Kämpfer',
  Tank: 'Tank',
  Assassin: 'Assassine',
  Marksman: 'Schütze',
  Support: 'Unterstützer',
};
const className = (key: string, lang: Lang) => (lang === 'de' ? (CLASSES_DE[key] ?? key) : key);

function Preferences({ steps, dragon }: { steps: ProfileStep[]; dragon: Dragon }) {
  const augments = useAugments();
  const { lang, t } = useLang();
  if (!steps.length) return null;
  const prefs = preferencesOf(
    steps.map((h) => h.entry),
    (id) => dragon?.champions.get(id)?.tags[0],
  );
  const pct = (share: number) => `${Math.round(share * 100)} %`;
  const width = (share: number) => ({ width: `${Math.round(share * 1000) / 10}%` });
  return (
    <div className="card prefs">
      <h2>{t('Preferences', 'Vorlieben')}</h2>
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
          <h3>{t('Classes', 'Klassen')}</h3>
          <ul className="pref-bars">
            {prefs.classes.map((c) => (
              <li key={c.key}>
                <span>{className(c.key, lang)}</span>
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
          <h3>{t('Damage type', 'Schadensart')}</h3>
          <div
            className="dmg-split"
            role="img"
            aria-label={`AP ${pct(prefs.damage.ap)}, AD ${pct(prefs.damage.ad)}, ${t('true', 'absolut')} ${pct(prefs.damage.true)}`}
          >
            <span className="ap" style={width(prefs.damage.ap)} />
            <span className="ad" style={width(prefs.damage.ad)} />
            <span className="tr" style={width(prefs.damage.true)} />
          </div>
          <p className="fine num">
            AP {pct(prefs.damage.ap)} · AD {pct(prefs.damage.ad)} · {t('True', 'Absolut')} {pct(prefs.damage.true)}
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
  const { t } = useLang();
  const more = Math.min(20, props.steps.length - shown);
  return (
    <>
      <Matches {...props} steps={props.steps.slice(0, shown)} />
      {shown < props.steps.length && (
        <button className="button" style={{ marginTop: 12 }} onClick={() => setShown((s) => s + 20)}>
          {t(`Load ${more} more`, `Weitere ${more} laden`)}
        </button>
      )}
    </>
  );
}

function Matches({ steps, dragon, name }: { steps: ProfileStep[]; dragon: Dragon; name: string }) {
  const { t } = useLang();
  if (!steps.length) return <p className="empty">{t('No rated games yet.', 'Noch keine gewerteten Spiele.')}</p>;
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
  const { t, num, date } = useLang();
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
            <span className={e.win ? 'up' : 'down'}>{e.win ? t('Win', 'Sieg') : t('Loss', 'Niederlage')}</span> ·{' '}
            {duration(e.seconds)} · {date(e.at)}
          </small>
        </span>
        <span className="num">
          <b>
            {e.kills} / <span className="down">{e.deaths}</span> / {e.assists}
          </b>
          <small>
            {num(e.damage / minutes)} {t('damage/min', 'Schaden/Min')}
          </small>
        </span>
        <span className="items hide-sm">
          {e.items.filter((i) => i > 0).slice(0, 6).map((i, n) => (
            <Img key={n} className="item" src={itemImage(dragon, i)} size={22} />
          ))}
        </span>
        <span className="gain num">
          {step.gain === null ? (
            <small className="faint">{t('Placement', 'Einstufung')}</small>
          ) : (
            <span className={step.gain > 0 ? 'up' : 'down'}>
              {step.gain > 0 ? '+' : '−'}
              {Math.abs(step.gain)}
            </span>
          )}
          {step.change === 'promoted' && <small className="up">{t('Promotion', 'Aufstieg')}</small>}
          {step.change === 'demoted' && <small className="down">{t('Demotion', 'Abstieg')}</small>}
          {step.change === 'placed' && <small>{t('Placed', 'Eingestuft')}</small>}
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
  const { t, num, href } = useLang();
  const lobby = entry.lobby ?? [];
  const page = href(`/game/${entry.gameId}?p=${encodeURIComponent(entry.puuid)}`);
  if (!lobby.length)
    return (
      <div id={id} className="lobby faint">
        {t("This game lacks the others' stats.", 'Für dieses Spiel fehlen die Werte der anderen.')}{' '}
        <Link className="to-game" href={page}>
          {t('View game →', 'Spiel ansehen →')}
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
          {t('Damage', 'Schaden')}
        </span>
        <span className="k-tank">
          <i />
          {t('Damage taken', 'Eingesteckt')}
        </span>
        <span className="k-care">
          <i />
          {t('Healing & shields', 'Heilen & Schilde')}
        </span>
        <span>
          <span className="mvp">MVP</span> {t('best grade in the game', 'beste Note im Spiel')}
        </span>
        <Link className="to-game" href={page}>
          {t('View full game →', 'Ganzes Spiel ansehen →')}
        </Link>
      </div>
      <div className="teams">
        {teams.map((team) => (
          <div className="team" key={team}>
            <h3>
              {team === mine?.team ? 'Team' : t('Enemies', 'Gegner')} ·{' '}
              {(team === mine?.team) === entry.win ? t('Win', 'Sieg') : t('Loss', 'Niederlage')}
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
                    aria-label={t(
                      `${num(s.damage)} damage, ${num(s.taken + s.mitigated)} taken, ${num(s.healed + s.shielded)} healed`,
                      `${num(s.damage)} Schaden, ${num(s.taken + s.mitigated)} eingesteckt, ${num(s.healed + s.shielded)} geheilt`,
                    )}
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
  const { t, num } = useLang();
  const rows = championsOf(steps);
  if (!rows.length) return <p className="empty">{t('No rated games yet.', 'Noch keine gewerteten Spiele.')}</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Champion</th>
            <th className="right">{t('Games', 'Spiele')}</th>
            <th>{t('Avg grade', 'Note Ø')}</th>
            <th className="right hide-sm">{t('Wins', 'Siege')}</th>
            <th className="right">K / D / A</th>
            <th className="right hide-sm">{t('Damage/min', 'Schaden/Min')}</th>
            <th className="hide-sm">{t('Best game', 'Bestes Spiel')}</th>
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
  const { t, season } = useLang();
  const now = seasonOf(at);
  const rows = [
    { name: season(now) + t(' (current)', ' (läuft)'), rank: profile.rank },
    ...profile.seasons.map((s) => ({ name: season(s.season), rank: s.rank })),
  ];
  return (
    <div className="grid cols-3">
      {rows.map((r) => (
        <div className="card" key={r.name} data-tier={r.rank?.tier.id}>
          <h2>{r.name}</h2>
          <div className="rank-cell">
            <TierMark rank={r.rank} />
            <div>
              <b className="tier-text">{r.rank ? rankName(r.rank) : t('Unranked', 'Ohne Rang')}</b>
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
  const { t } = useLang();
  if (!id) return null;
  const words = meText(t);
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
