// "How it works" (/scoring, /de/wertung): how a game's grade and the rank come about, in plain
// words. Every number comes from the rating core (src/explain.ts), so the page says exactly what
// the calculation does.
import type { Metadata } from 'next';
import { climbing, gradeShares, RULES, seasonStarts, tiers, weights } from '../../src/explain';
import { rankOf } from '../../src/features/aram/aramRating';
import { GradeChip, GradeIcon, TierMark } from '../ui/bits';
import { locale, text, type Lang } from '../ui/lang';

export const metadataOf = (lang: Lang): Metadata => {
  const t = text(lang);
  return {
    title: t('How it works · blank. Mayhem', "So funktioniert's · blank. Mayhem"),
    description: t(
      "How the grade per game and the rank in blank. Mayhem come about: what counts, why winning doesn't matter, tiers, MP and seasons.",
      'Wie die Note je Spiel und der Rang in blank. Mayhem entstehen: was zählt, warum der Sieg egal ist, Stufen, MP und Saisons.',
    ),
  };
};

/** The tier in LoL's ranked ladder that is as rare (the tiers are cut from LoL's distribution). */
const LOL: Record<string, [en: string, de: string]> = {
  d: ['Iron and Bronze', 'Iron und Bronze'],
  c: ['Silver', 'Silver'],
  b: ['Gold', 'Gold'],
  a: ['Platinum', 'Platinum'],
  s: ['Emerald', 'Emerald'],
  ss: ['Diamond and Master', 'Diamond und Master'],
  sss: ['Grandmaster', 'Grandmaster'],
  mayhem: ['Challenger', 'Challenger'],
};

const pctIn = (lang: Lang) => (share: number) => {
  const p = share * 100;
  const digits = p >= 10 ? 0 : p >= 1 ? 1 : 2;
  return p.toLocaleString(locale(lang), { maximumFractionDigits: digits }) + ' %';
};

export default function HowItWorks({ lang }: { lang: Lang }) {
  const t = text(lang);
  const pct = pctIn(lang);
  const grades = gradeShares();
  const axes = weights();
  const ladder = tiers();
  const strongest = Math.max(...axes.map((a) => a.weight));
  const s = ladder.findIndex((x) => x.tier.id === 's');
  const climb = climbing(s);
  const sss = ladder.find((x) => x.tier.id === 'sss');
  const mayhem = ladder.find((x) => x.tier.id === 'mayhem');
  const seasons = seasonStarts(new Date().getUTCFullYear(), lang)
    .join(', ')
    .replace(/, ([^,]*)$/, t(' and $1', ' und $1'));

  return (
    <div className="howto">
      <div className="page-head">
        <div>
          <h1>{t('How it works', "So funktioniert's")}</h1>
        </div>
      </div>

      <nav className="howto-toc" aria-label={t('Sections', 'Abschnitte')}>
        <a href="#note">{t('The grade', 'Die Note')}</a>
        <a href="#rang">{t('The rank', 'Der Rang')}</a>
        <a href="#mp">{t('MP per game', 'MP je Spiel')}</a>
        <a href="#saisons">{t('Seasons', 'Saisons')}</a>
        <a href="#versteckt">{t('What is never shown', 'Was nie gezeigt wird')}</a>
        <a href="#fragen">{t('FAQ', 'Häufige Fragen')}</a>
      </nav>

      <section id="note" className="howto-section">
        <h2>{t('The grade', 'Die Note')}</h2>
        <p className="lead">
          {t('Every game gets a grade from ', 'Jedes Spiel bekommt eine Note von ')}
          <GradeChip grade="F" /> {t('to', 'bis')} <GradeChip grade="MAYHEM" />
          {t(
            ". It measures how well you played, not whether your team won. Wins and losses don't count.",
            '. Sie misst, wie gut du gespielt hast, nicht ob dein Team gewonnen hat. Sieg oder Niederlage zählen nicht.',
          )}
        </p>
        <div className="grid cols-2">
          <div className="card">
            <h3>{t('What counts', 'Was zählt')}</h3>
            <p className="fine">
              {t(
                'Five values, each as a share of the whole lobby. They are compared with what your champion usually reaches.',
                'Fünf Werte, jeweils als Anteil an der ganzen Lobby. Verglichen wird mit dem, was dein Champion üblicherweise erreicht.',
              )}
            </p>
            <ul className="weights">
              {axes.map((a) => (
                <li key={a.metric}>
                  <span>{t(a.labelEn, a.label)}</span>
                  <b className="num">{pct(a.weight)}</b>
                  <span className="weight-bar" aria-hidden>
                    <span style={{ width: `${(a.weight / strongest) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
            <p className="fine">
              {t(
                'Damage taken includes mitigated damage, healing includes shields, survival means few deaths.',
                'Einstecken zählt samt abgewehrtem Schaden, Heilen samt Schilden, Überleben heißt wenige Tode.',
              )}
            </p>
          </div>
          <div className="card">
            <h3>{t('Why supports are rated fairly', 'Warum Supporter fair bewertet werden')}</h3>
            <p>
              {t(
                'A Soraka is compared with other Sorakas, not with a Jinx. If you deal little damage but heal a lot, soak damage and take part in almost every kill, you get just as good a grade. There are no places from 1 to 10: two almost equally good games get an almost equal rating.',
                'Eine Soraka wird mit anderen Sorakas verglichen, nicht mit einer Jinx. Wer wenig Schaden macht, aber viel heilt, einsteckt und an fast jedem Kill beteiligt ist, bekommt genauso eine gute Note. Es gibt keine Plätze von 1 bis 10: Zwei fast gleich gute Spiele bekommen eine fast gleiche Wertung.',
              )}
            </p>
            <h3>{t('When there is no grade', 'Wann es keine Note gibt')}</h3>
            <p>
              {t(
                `Games under ${RULES.remakeMinutes} minutes (remakes, early surrenders) don't count. If you were AFK and barely collected any gold, you get `,
                `Spiele unter ${RULES.remakeMinutes} Minuten (Remakes, frühe Aufgaben) zählen nicht. Wer abwesend war und kaum Gold gesammelt hat, bekommt `,
              )}
              <GradeChip grade="F" />.
            </p>
          </div>
        </div>

        <div className="card">
          <h3>{t('How rare each grade is', 'Wie selten jede Note ist')}</h3>
          <p className="fine">
            {t('The grade is a place among all games. ', 'Die Note ist ein Platz unter allen Spielen. ')}
            <GradeChip grade="MAYHEM" small />{' '}
            {t(
              `goes only to the best ${pct(grades[grades.length - 1].share)} of all games.`,
              `bekommen nur die besten ${pct(grades[grades.length - 1].share)} aller Spiele.`,
            )}
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
          <b>{t('Avg performance', 'Leistung Ø')}</b>{' '}
          {t(
            `is the average of your last ${RULES.averageGames} grades. It doesn't depend on your rank and is visible right away, from the first game.`,
            `ist der Durchschnitt deiner letzten ${RULES.averageGames} Noten. Sie hängt nicht vom Rang ab und ist sofort sichtbar, ab dem ersten Spiel.`,
          )}
        </p>
      </section>

      <section id="rang" className="howto-section">
        <h2>{t('The rank', 'Der Rang')}</h2>
        <p className="lead">
          {t(
            `After ${RULES.placement} games you get a rank. Placement puts you at ${RULES.placementCap.replace(' ', ' ')} at most; above that you only get by playing.`,
            `Nach ${RULES.placement} Spielen bekommst du einen Rang. Die Einstufung setzt dich höchstens auf ${RULES.placementCap.replace(' ', ' ')}, darüber kommt man nur durch Spielen.`,
          )}
        </p>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr">{t('The tiers from D to MAYHEM', 'Die Stufen von D bis MAYHEM')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('Tier', 'Stufe')}</th>
                <th scope="col">{t('Structure', 'Aufbau')}</th>
                <th scope="col" className="right">
                  {t('Share', 'Anteil')}
                </th>
                <th scope="col" className="hide-sm">
                  {t('As rare as', 'So selten wie')}
                </th>
                <th scope="col" className="right">
                  MP<span className="sr">{t(' per game', ' je Spiel')}</span>
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
                      ? t(`from ${x.apexPoints} MP`, `ab ${x.apexPoints} MP`)
                      : x.tier.id === 'ss'
                        ? t('IV to I, then open', 'IV bis I, dann offen')
                        : t('IV to I at 100 MP each', 'IV bis I à 100 MP')}
                  </td>
                  <td className="right num">{pct(x.share)}</td>
                  <td className="muted hide-sm">{LOL[x.tier.id] ? t(...LOL[x.tier.id]) : ''}</td>
                  <td className="right num">±{x.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fine">
          {t(
            `The tiers are cut by the distribution in League of Legends: MAYHEM is as rare as Challenger. After SS I it continues with open MP. ${sss?.tier.name} starts at ${sss?.apexPoints} MP, ${mayhem?.tier.name} at ${mayhem?.apexPoints} MP, both only if your performance is reliably in that range over many games.`,
            `Die Stufen sind nach der Verteilung in League of Legends geschnitten: MAYHEM ist so selten wie Challenger. Nach SS I geht es mit offenen MP weiter. ${sss?.tier.name} beginnt bei ${sss?.apexPoints} MP, ${mayhem?.tier.name} bei ${mayhem?.apexPoints} MP, beide nur, wenn deine Leistung über viele Spiele sicher in diesem Bereich liegt.`,
          )}
        </p>
      </section>

      <section id="mp" className="howto-section">
        <h2>{t('MP per game', 'MP je Spiel')}</h2>
        <p className="lead">
          {t(
            `Every rank expects a certain performance. If your grade is above it, you gain MP; if it is below, you lose some. The further off, the more, at most ±${RULES.maxSwing} per game and never 0.`,
            `Jeder Rang erwartet eine bestimmte Leistung. Liegt deine Note darüber, bekommst du MP, liegt sie darunter, verlierst du welche. Je weiter weg, desto mehr, höchstens ±${RULES.maxSwing} je Spiel und nie 0.`,
          )}
        </p>
        <div className="grid cols-2">
          <div className="card">
            <h3>{t('On the way up', 'Unterwegs nach oben')}</h3>
            <p>
              {t(
                `If you play better than your rank for a longer time, you gain more and lose less: in S about +${climb.up} and −${Math.abs(climb.down)} instead of ±${ladder[s].points}. Your profile shows this as a climbing hint. It works the same way in reverse.`,
                `Spielst du über längere Zeit besser als dein Rang, bekommst du mehr und verlierst weniger: in S etwa +${climb.up} und −${Math.abs(climb.down)} statt ±${ladder[s].points}. Dein Profil zeigt das als Kletter-Hinweis. Umgekehrt gilt es genauso.`,
              )}
            </p>
          </div>
          <div className="card">
            <h3>{t('Promotion and demotion', 'Aufstieg und Abstieg')}</h3>
            <p>
              {t(
                `At 100 MP you are promoted right away, and the rest carries over. After placement and after every tier promotion you can't lose the tier for ${RULES.shield} games. If you lose a tier, you land at 75, 50 or 25 MP in the division below, depending on your form.`,
                `Mit 100 MP steigst du sofort auf, der Rest wird mitgenommen. Nach einer Einstufung und nach jedem Stufen-Aufstieg kannst du die Stufe ${RULES.shield} Spiele lang nicht verlieren. Wer eine Stufe verliert, landet je nach Form bei 75, 50 oder 25 MP in der Division darunter.`,
              )}
            </p>
          </div>
        </div>
      </section>

      <section id="saisons" className="howto-section">
        <h2>{t('Seasons', 'Saisons')}</h2>
        <p>
          {t(
            `Three seasons a year, starting on ${seasons}. Your rank stays between seasons, and your final rank of each season is saved in your profile. At the new year there is a soft reset: you get a new placement, and most of your previous performance still counts.`,
            `Drei Saisons im Jahr, sie beginnen am ${seasons}. Der Rang bleibt zwischen den Saisons, dein Endrang jeder Saison wird im Profil gespeichert. Zum neuen Jahr wird weich zurückgesetzt: Es gibt eine neue Einstufung, deine bisherige Leistung zählt dabei zum großen Teil weiter.`,
          )}
        </p>
      </section>

      <section id="versteckt" className="howto-section">
        <h2>{t('What is never shown', 'Was nie gezeigt wird')}</h2>
        <p>
          {t(
            `Behind the rank is a hidden rating: the estimate of how well you usually play, along with its uncertainty. It starts with the first game and decides your placement, the size of your MP and whether ${sss?.tier.name} and ${mayhem?.tier.name} are reachable. It appears nowhere, not on the website, not in the app and not in the API. That's also why there is no preview of your rank before placement.`,
            `Hinter dem Rang steht eine versteckte Wertung: die Schätzung, wie gut du üblicherweise spielst, samt ihrer Unsicherheit. Sie beginnt mit dem ersten Spiel und entscheidet über die Einstufung, die Größe der MP und ob ${sss?.tier.name} und ${mayhem?.tier.name} erreichbar sind. Sie erscheint nirgends, weder auf der Website noch in der App noch in der API. Auch vor der Einstufung gibt es deshalb keine Vorschau des Rangs.`,
          )}
        </p>
      </section>

      <section id="fragen" className="howto-section">
        <h2>{t('FAQ', 'Häufige Fragen')}</h2>
        <div className="faq">
          <details>
            <summary>{t('Why do I lose MP even though I won?', 'Warum verliere ich trotz Sieg MP?')}</summary>
            <p>
              {t(
                "Because winning doesn't count. If your team won but you played below what your rank expects, you lose MP. The other way round, you gain MP after a loss if you played well.",
                'Weil der Sieg nicht zählt. Hat dein Team gewonnen, du selbst aber unter der Erwartung deines Rangs gespielt, verlierst du MP. Umgekehrt bekommst du nach einer Niederlage MP, wenn du stark gespielt hast.',
              )}
            </p>
          </details>
          <details>
            <summary>{t("Why don't I have a rank yet?", 'Warum habe ich noch keinen Rang?')}</summary>
            <p>
              {t(
                `Your rank appears after ${RULES.placement} rated games. Remakes under ${RULES.remakeMinutes} minutes don't count toward that.`,
                `Der Rang erscheint nach ${RULES.placement} gewerteten Spielen. Remakes unter ${RULES.remakeMinutes} Minuten zählen dabei nicht mit.`,
              )}
            </p>
          </details>
          <details>
            <summary>{t("Why didn't placement put me higher?", 'Warum hat mich die Einstufung nicht höher gesetzt?')}</summary>
            <p>
              {t(
                `Placement ends at ${RULES.placementCap}, like Emerald I in League of Legends. Anything above that you earn with MP.`,
                `Die Einstufung endet bei ${RULES.placementCap}, wie Emerald I in League of Legends. Was darüber liegt, erspielst du mit MP.`,
              )}
            </p>
          </details>
          <details>
            <summary>
              {t(
                `I have over ${sss?.apexPoints} MP, why am I not ${sss?.tier.name}?`,
                `Ich habe über ${sss?.apexPoints} MP, warum bin ich nicht ${sss?.tier.name}?`,
              )}
            </summary>
            <p>
              {t(
                `Besides the MP, ${sss?.tier.name} and ${mayhem?.tier.name} need a performance that is reliably in that range over many games. Until then you stay SS with your MP.`,
                `${sss?.tier.name} und ${mayhem?.tier.name} brauchen außer den MP eine Leistung, die über viele Spiele sicher in diesem Bereich liegt. Bis dahin bleibst du SS mit deinen MP.`,
              )}
            </p>
          </details>
          <details>
            <summary>{t('Do I get worse grades with a weak champion?', 'Bekomme ich mit einem schwachen Champion schlechtere Noten?')}</summary>
            <p>
              {t(
                "No. Every champion is compared with its own usual game. If a champion still has few games, the average of its role counts too.",
                'Nein. Jeder Champion wird mit seinem eigenen üblichen Spiel verglichen. Hat ein Champion noch wenige Spiele, zählt der Schnitt seiner Rolle mit.',
              )}
            </p>
          </details>
          <details>
            <summary>{t("Is this Riot's official rank?", 'Ist das der offizielle Rang von Riot?')}</summary>
            <p>
              {t(
                "No. Ranks and grades here are a separate rating for ARAM: Mayhem and have nothing to do with the official ranked ladder or Riot's MMR.",
                'Nein. Ränge und Noten hier sind eine eigene Wertung für ARAM: Mayhem und haben nichts mit der offiziellen Rangliste oder Riots MMR zu tun.',
              )}
            </p>
          </details>
        </div>
      </section>
    </div>
  );
}
