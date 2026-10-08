// "How it works" (/scoring): how does the rating work? One tab per part (the grade, the rank,
// points per game, seasons, what is never shown, FAQ) instead of a long page; the old anchors
// (#grade, #rank …) open their tab. Every number comes from the rating core (src/explain.ts), so
// the page says exactly what the calculation does.
import type { Metadata } from 'next';
import { climbing, gradeShares, RULES, seasonStarts, tiers, weights } from '../../src/explain';
import { rankOf } from '../../src/features/aram/aramRating';
import { GradeChip, GradeIcon, TierMark } from '../ui/bits';
import { LOCALE } from '../ui/format';
import { SectionTabs } from '../ui/section-tabs';

export const metadata: Metadata = {
  title: 'How it works · blank. Mayhem',
  description: "How the grade per game and the rank in blank. Mayhem come about: what counts, why winning doesn't matter, tiers, points and seasons.",
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

  const grade = (
    <>
      <p className="lead">
        {'Every game gets a grade from '}
        <GradeChip grade="F" /> to <GradeChip grade="MAYHEM" />
        {". It measures how well you played, not whether your team won. Wins and losses don't count."}
      </p>
      <div className="cards">
        <div className="card">
          <h2>What counts</h2>
          <p className="fine">Five values, each as a share of the whole lobby, compared with what your champion usually reaches.</p>
          <ul className="weights">
            {axes.map((a) => (
              <li key={a.metric} data-top={a.weight === strongest}>
                <span>{a.label}</span>
                <span className="bar" aria-hidden>
                  <span style={{ width: `${(a.weight / strongest) * 100}%` }} />
                </span>
                <b>{pct(a.weight)}</b>
              </li>
            ))}
          </ul>
          <p className="fine">Damage taken includes mitigated damage, healing includes shields, survival means few deaths.</p>
        </div>
        <div className="card">
          <h2>How rare each grade is</h2>
          <p className="fine">
            {'The grade is a place among all games. MAYHEM goes only to the best '}
            {pct(grades[grades.length - 1].share)} of all games.
          </p>
          <ol className="grade-scale">
            {grades.map((g) => (
              <li key={g.grade} data-g={g.grade}>
                <GradeIcon grade={g.grade} size={48} />
                <b>{g.grade}</b>
                <span>{pct(g.share)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <details className="fold">
        <summary>Why supports are rated fairly</summary>
        <p className="fine">
          A Soraka is compared with other Sorakas, not with a Jinx. If you deal little damage but heal a lot, soak damage and take part in
          almost every kill, you get just as good a grade. There are no places from 1 to 10: two almost equally good games get an almost
          equal rating.
        </p>
      </details>
      <details className="fold">
        <summary>When there is no grade</summary>
        <p className="fine">
          {`Games under ${RULES.remakeMinutes} minutes (remakes, early surrenders) don't count. If you were AFK and barely collected any gold, you get an F.`}
        </p>
      </details>
      <details className="fold">
        <summary>Average grade</summary>
        <p className="fine">
          {`The average of your last ${RULES.averageGames} grades. It doesn't depend on your rank and is visible right away, from the first game.`}
        </p>
      </details>
    </>
  );

  const rank = (
    <>
      <p className="lead">
        {`After ${RULES.placement} games you get a rank. Placement puts you at ${RULES.placementCap} at most; above that you only get by playing.`}
      </p>
      <ul className="rows grid" aria-label="The tiers from D to MAYHEM">
        {ladder.map((x) => (
          <li
            key={x.tier.id}
            className="row"
            data-tier={x.tier.id}
            title={x.apexPoints !== null ? `From ${x.apexPoints} points` : x.tier.id === 'ss' ? 'IV to I, then open points' : 'IV to I, 100 points each'}
          >
            <TierMark rank={rankOf(x.start)} size={44} />
            <span className="who">
              <b className="tier-text">{x.tier.name}</b>
              <small>{`as rare as ${LOL[x.tier.id]}`}</small>
            </span>
            <span className="value">
              <b>{pct(x.share)}</b>
              <small>{`±${x.points} per game`}</small>
            </span>
          </li>
        ))}
      </ul>
      <p className="fine">
        {`The tiers are cut by the distribution in League of Legends: MAYHEM is as rare as Challenger. After SS I it continues with open points. ${sss?.tier.name} starts at ${sss?.apexPoints} points, ${mayhem?.tier.name} at ${mayhem?.apexPoints}, both only if your performance is reliably in that range over many games.`}
      </p>
    </>
  );

  const pointsPart = (
    <>
      <p className="lead">
        {`Every rank expects a certain performance. If your grade is above it, you gain points; if it is below, you lose some. The further off, the more, at most ±${RULES.maxSwing} per game and never 0.`}
      </p>
      <div className="cards">
        <div className="tile" data-tone="win">
          <h2>On the way up</h2>
          <p>
            {`If you play better than your rank for a longer time, you gain more and lose less: in S about +${climb.up} and −${Math.abs(climb.down)} instead of ±${ladder[s].points}. Your profile shows this as "Climbing". It works the same way in reverse.`}
          </p>
        </div>
        <div className="tile" data-tone="quiet">
          <h2>Promotion and demotion</h2>
          <p>
            {`At 100 points you are promoted right away, and the rest carries over. After placement and after every tier promotion you can't lose the tier for ${RULES.shield} games. If you lose a tier, you land at 75, 50 or 25 points in the division below, depending on your form.`}
          </p>
        </div>
      </div>
    </>
  );

  const seasonsPart = (
    <p className="lead">
      {`Three seasons a year, starting on ${seasons}. Your rank stays between seasons, and your final rank of each season is saved in your profile. At the new year there is a soft reset: you get a new placement, and most of your previous performance still counts.`}
    </p>
  );

  const hidden = (
    <p className="lead">
      {`Behind the rank is a hidden rating: the estimate of how well you usually play, along with its uncertainty. It starts with the first game and decides your placement, the size of your points per game and whether ${sss?.tier.name} and ${mayhem?.tier.name} are reachable. It appears nowhere, not on the website, not in the app and not in the API. That's also why there is no preview of your rank before placement.`}
    </p>
  );

  const faq = (
    <div className="faq">
      <details className="fold">
        <summary>Why do I lose points even though I won?</summary>
        <p className="fine">
          {"Because winning doesn't count. If your team won but you played below what your rank expects, you lose points. The other way round, you gain points after a loss if you played well."}
        </p>
      </details>
      <details className="fold">
        <summary>{"Why don't I have a rank yet?"}</summary>
        <p className="fine">{`Your rank appears after ${RULES.placement} rated games. Remakes under ${RULES.remakeMinutes} minutes don't count toward that.`}</p>
      </details>
      <details className="fold">
        <summary>{"Why didn't placement put me higher?"}</summary>
        <p className="fine">{`Placement ends at ${RULES.placementCap}, like Emerald I in League of Legends. Anything above that you earn with points.`}</p>
      </details>
      <details className="fold">
        <summary>{`I have over ${sss?.apexPoints} points, why am I not ${sss?.tier.name}?`}</summary>
        <p className="fine">
          {`Besides the points, ${sss?.tier.name} and ${mayhem?.tier.name} need a performance that is reliably in that range over many games. Until then you stay SS with your points.`}
        </p>
      </details>
      <details className="fold">
        <summary>Do I get worse grades with a weak champion?</summary>
        <p className="fine">No. Every champion is compared with its own usual game. If a champion still has few games, the average of its role counts too.</p>
      </details>
      <details className="fold">
        <summary>{"Is this Riot's official rank?"}</summary>
        <p className="fine">
          {"No. Ranks and grades here are a separate rating for ARAM: Mayhem and have nothing to do with the official ranked ladder or Riot's MMR."}
        </p>
      </details>
    </div>
  );

  return (
    <>
      <div className="page-head in">
        <div>
          <h1>How it works</h1>
          <p className="page-sub">How do grades and ranks come about? Win or lose, only how you played counts.</p>
        </div>
      </div>
      <div className="section in">
        <SectionTabs
          label="Parts"
          sections={[
            { id: 'grade', label: 'The grade', content: grade },
            { id: 'rank', label: 'The rank', content: rank },
            { id: 'points', label: 'Points per game', content: pointsPart },
            { id: 'seasons', label: 'Seasons', content: seasonsPart },
            { id: 'hidden', label: 'Never shown', content: hidden },
            { id: 'faq', label: 'FAQ', content: faq },
          ]}
        />
      </div>
    </>
  );
}
