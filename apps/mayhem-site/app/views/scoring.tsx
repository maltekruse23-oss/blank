// "How it works" (/scoring): how a game's grade and the rank come about, in plain
// words. Every number comes from the rating core (src/explain.ts), so the page says exactly what
// the calculation does.
import type { Metadata } from 'next';
import { climbing, gradeShares, RULES, seasonStarts, tiers, weights } from '../../src/explain';
import { rankOf } from '../../src/features/aram/aramRating';
import { GradeChip, GradeIcon, TierMark } from '../ui/bits';
import { LOCALE } from '../ui/format';

export const metadata: Metadata = {
  title: 'How it works · blank. Mayhem',
  description: "How the grade per game and the rank in blank. Mayhem come about: what counts, why winning doesn't matter, tiers, MP and seasons.",
};

/** The tier in LoL's ranked ladder that is as rare (the tiers are cut from LoL's distribution). */
const LOL: Record<string, string> = {
  d: 'Iron and Bronze',
  c: 'Silver',
  b: 'Gold',
  a: 'Platinum',
  s: 'Emerald',
  ss: 'Diamond and Master',
  sss: 'Grandmaster',
  mayhem: 'Challenger',
};

const pct = (share: number) => {
  const p = share * 100;
  const digits = p >= 10 ? 0 : p >= 1 ? 1 : 2;
  return p.toLocaleString(LOCALE, { maximumFractionDigits: digits }) + '%';
};

export default function HowItWorks() {
  const grades = gradeShares();
  const axes = weights();
  const ladder = tiers();
  const strongest = Math.max(...axes.map((a) => a.weight));
  const s = ladder.findIndex((x) => x.tier.id === 's');
  const climb = climbing(s);
  const sss = ladder.find((x) => x.tier.id === 'sss');
  const mayhem = ladder.find((x) => x.tier.id === 'mayhem');
  const seasons = seasonStarts(new Date().getUTCFullYear())
    .join(', ')
    .replace(/, ([^,]*)$/, ' and $1');

  return (
    <div className="howto">
      <div className="page-head">
        <div>
          <h1>How it works</h1>
        </div>
      </div>

      <nav className="howto-toc" aria-label="Sections">
        <a href="#grade">The grade</a>
        <a href="#rank">The rank</a>
        <a href="#points">MP per game</a>
        <a href="#seasons">Seasons</a>
        <a href="#hidden">What is never shown</a>
        <a href="#faq">FAQ</a>
      </nav>

      <section id="grade" className="howto-section">
        <h2>The grade</h2>
        <p className="lead">
          {'Every game gets a grade from '}
          <GradeChip grade="F" /> to <GradeChip grade="MAYHEM" />
          {". It measures how well you played, not whether your team won. Wins and losses don't count."}
        </p>
        <div className="grid cols-2">
          <div className="card">
            <h3>What counts</h3>
            <p className="fine">
              Five values, each as a share of the whole lobby. They are compared with what your champion usually reaches.
            </p>
            <ul className="weights">
              {axes.map((a) => (
                <li key={a.metric}>
                  <span>{a.label}</span>
                  <b className="num">{pct(a.weight)}</b>
                  <span className="weight-bar" aria-hidden>
                    <span style={{ width: `${(a.weight / strongest) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
            <p className="fine">
              Damage taken includes mitigated damage, healing includes shields, survival means few deaths.
            </p>
          </div>
          <div className="card">
            <h3>Why supports are rated fairly</h3>
            <p>
              A Soraka is compared with other Sorakas, not with a Jinx. If you deal little damage but heal a lot, soak damage and take part in almost every kill, you get just as good a grade. There are no places from 1 to 10: two almost equally good games get an almost equal rating.
            </p>
            <h3>When there is no grade</h3>
            <p>
              {`Games under ${RULES.remakeMinutes} minutes (remakes, early surrenders) don't count. If you were AFK and barely collected any gold, you get `}
              <GradeChip grade="F" />.
            </p>
          </div>
        </div>

        <div className="card">
          <h3>How rare each grade is</h3>
          <p className="fine">
            {'The grade is a place among all games. '}
            <GradeChip grade="MAYHEM" small />{' '}
            {`goes only to the best ${pct(grades[grades.length - 1].share)} of all games.`}
          </p>
          <ol className="grade-scale">
            {grades.map((g) => (
              <li key={g.grade} data-g={g.grade}>
                <GradeIcon grade={g.grade} size={52} />
                <b>{g.grade}</b>
                <span className="num">{pct(g.share)}</span>
              </li>
            ))}
          </ol>
        </div>

        <p>
          <b>Avg performance</b>{' '}
          {`is the average of your last ${RULES.averageGames} grades. It doesn't depend on your rank and is visible right away, from the first game.`}
        </p>
      </section>

      <section id="rank" className="howto-section">
        <h2>The rank</h2>
        <p className="lead">
          {`After ${RULES.placement} games you get a rank. Placement puts you at ${RULES.placementCap.replace(' ', ' ')} at most; above that you only get by playing.`}
        </p>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr">The tiers from D to MAYHEM</caption>
            <thead>
              <tr>
                <th scope="col">Tier</th>
                <th scope="col">Structure</th>
                <th scope="col" className="right">
                  Share
                </th>
                <th scope="col" className="hide-sm">
                  As rare as
                </th>
                <th scope="col" className="right">
                  MP<span className="sr">{' per game'}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ladder.map((x) => (
                <tr key={x.tier.id}>
                  <td>
                    <div className="rank-cell" data-tier={x.tier.id}>
                      <TierMark rank={rankOf(x.start)} size={36} />
                      <b className="tier-text">{x.tier.name}</b>
                    </div>
                  </td>
                  <td className="muted">
                    {x.apexPoints !== null
                      ? `from ${x.apexPoints} MP`
                      : x.tier.id === 'ss'
                        ? 'IV to I, then open'
                        : 'IV to I at 100 MP each'}
                  </td>
                  <td className="right num">{pct(x.share)}</td>
                  <td className="muted hide-sm">{LOL[x.tier.id] ?? ''}</td>
                  <td className="right num">±{x.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fine">
          {`The tiers are cut by the distribution in League of Legends: MAYHEM is as rare as Challenger. After SS I it continues with open MP. ${sss?.tier.name} starts at ${sss?.apexPoints} MP, ${mayhem?.tier.name} at ${mayhem?.apexPoints} MP, both only if your performance is reliably in that range over many games.`}
        </p>
      </section>

      <section id="points" className="howto-section">
        <h2>MP per game</h2>
        <p className="lead">
          {`Every rank expects a certain performance. If your grade is above it, you gain MP; if it is below, you lose some. The further off, the more, at most ±${RULES.maxSwing} per game and never 0.`}
        </p>
        <div className="grid cols-2">
          <div className="card">
            <h3>On the way up</h3>
            <p>
              {`If you play better than your rank for a longer time, you gain more and lose less: in S about +${climb.up} and −${Math.abs(climb.down)} instead of ±${ladder[s].points}. Your profile shows this as a climbing hint. It works the same way in reverse.`}
            </p>
          </div>
          <div className="card">
            <h3>Promotion and demotion</h3>
            <p>
              {`At 100 MP you are promoted right away, and the rest carries over. After placement and after every tier promotion you can't lose the tier for ${RULES.shield} games. If you lose a tier, you land at 75, 50 or 25 MP in the division below, depending on your form.`}
            </p>
          </div>
        </div>
      </section>

      <section id="seasons" className="howto-section">
        <h2>Seasons</h2>
        <p>
          {`Three seasons a year, starting on ${seasons}. Your rank stays between seasons, and your final rank of each season is saved in your profile. At the new year there is a soft reset: you get a new placement, and most of your previous performance still counts.`}
        </p>
      </section>

      <section id="hidden" className="howto-section">
        <h2>What is never shown</h2>
        <p>
          {`Behind the rank is a hidden rating: the estimate of how well you usually play, along with its uncertainty. It starts with the first game and decides your placement, the size of your MP and whether ${sss?.tier.name} and ${mayhem?.tier.name} are reachable. It appears nowhere, not on the website, not in the app and not in the API. That's also why there is no preview of your rank before placement.`}
        </p>
      </section>

      <section id="faq" className="howto-section">
        <h2>FAQ</h2>
        <div className="faq">
          <details>
            <summary>Why do I lose MP even though I won?</summary>
            <p>
              {"Because winning doesn't count. If your team won but you played below what your rank expects, you lose MP. The other way round, you gain MP after a loss if you played well."}
            </p>
          </details>
          <details>
            <summary>{"Why don't I have a rank yet?"}</summary>
            <p>
              {`Your rank appears after ${RULES.placement} rated games. Remakes under ${RULES.remakeMinutes} minutes don't count toward that.`}
            </p>
          </details>
          <details>
            <summary>{"Why didn't placement put me higher?"}</summary>
            <p>
              {`Placement ends at ${RULES.placementCap}, like Emerald I in League of Legends. Anything above that you earn with MP.`}
            </p>
          </details>
          <details>
            <summary>
              {`I have over ${sss?.apexPoints} MP, why am I not ${sss?.tier.name}?`}
            </summary>
            <p>
              {`Besides the MP, ${sss?.tier.name} and ${mayhem?.tier.name} need a performance that is reliably in that range over many games. Until then you stay SS with your MP.`}
            </p>
          </details>
          <details>
            <summary>Do I get worse grades with a weak champion?</summary>
            <p>
              No. Every champion is compared with its own usual game. If a champion still has few games, the average of its role counts too.
            </p>
          </details>
          <details>
            <summary>{"Is this Riot's official rank?"}</summary>
            <p>
              {"No. Ranks and grades here are a separate rating for ARAM: Mayhem and have nothing to do with the official ranked ladder or Riot's MMR."}
            </p>
          </details>
        </div>
      </section>
    </div>
  );
}
