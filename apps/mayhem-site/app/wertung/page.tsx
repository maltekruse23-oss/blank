// "So funktioniert's": how a game's grade and the rank come about, in plain words. Every number
// comes from the rating core (src/explain.ts), so the page says exactly what the calculation does.
import type { Metadata } from 'next';
import { climbing, gradeShares, RULES, seasonStarts, tiers, weights } from '../../src/explain';
import { rankOf } from '../../src/features/aram/aramRating';
import { GradeChip, GradeIcon, TierMark } from '../ui/bits';

export const metadata: Metadata = {
  title: "So funktioniert's · blank. Mayhem",
  description:
    'Wie die Note je Spiel und der Rang in blank. Mayhem entstehen: was zählt, warum der Sieg egal ist, Stufen, MP und Saisons.',
};

/** The tier in LoL's ranked ladder that is as rare (the tiers are cut from LoL's distribution). */
const LOL: Record<string, string> = {
  d: 'Iron und Bronze',
  c: 'Silver',
  b: 'Gold',
  a: 'Platinum',
  s: 'Emerald',
  ss: 'Diamond und Master',
  sss: 'Grandmaster',
  mayhem: 'Challenger',
};

const pct = (share: number) => {
  const p = share * 100;
  const digits = p >= 10 ? 0 : p >= 1 ? 1 : 2;
  return p.toLocaleString('de-DE', { maximumFractionDigits: digits }) + '\u00a0%';
};

export default function HowItWorks() {
  const grades = gradeShares();
  const axes = weights();
  const ladder = tiers();
  const strongest = Math.max(...axes.map((a) => a.weight));
  const s = ladder.findIndex((t) => t.tier.id === 's');
  const climb = climbing(s);
  const sss = ladder.find((t) => t.tier.id === 'sss');
  const mayhem = ladder.find((t) => t.tier.id === 'mayhem');
  const seasons = seasonStarts(new Date().getUTCFullYear());

  return (
    <div className="howto">
      <div className="page-head">
        <div>
          <h1>So funktioniert&apos;s</h1>
        </div>
      </div>

      <nav className="howto-toc" aria-label="Abschnitte">
        <a href="#note">Die Note</a>
        <a href="#rang">Der Rang</a>
        <a href="#mp">MP je Spiel</a>
        <a href="#saisons">Saisons</a>
        <a href="#versteckt">Was nie gezeigt wird</a>
        <a href="#fragen">Häufige Fragen</a>
      </nav>

      <section id="note" className="howto-section">
        <h2>Die Note</h2>
        <p className="lead">
          Jedes Spiel bekommt eine Note von <GradeChip grade="F" /> bis <GradeChip grade="MAYHEM" />. Sie
          misst, wie gut du gespielt hast, nicht ob dein Team gewonnen hat. Sieg oder Niederlage zählen
          nicht.
        </p>
        <div className="grid cols-2">
          <div className="card">
            <h3>Was zählt</h3>
            <p className="fine">
              Fünf Werte, jeweils als Anteil an der ganzen Lobby. Verglichen wird mit dem, was dein
              Champion üblicherweise erreicht.
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
              Einstecken zählt samt abgewehrtem Schaden, Heilen samt Schilden, Überleben heißt wenige
              Tode.
            </p>
          </div>
          <div className="card">
            <h3>Warum Supporter fair bewertet werden</h3>
            <p>
              Eine Soraka wird mit anderen Sorakas verglichen, nicht mit einer Jinx. Wer wenig Schaden
              macht, aber viel heilt, einsteckt und an fast jedem Kill beteiligt ist, bekommt genauso eine
              gute Note. Es gibt keine Plätze von 1 bis 10: Zwei fast gleich gute Spiele bekommen eine fast
              gleiche Wertung.
            </p>
            <h3>Wann es keine Note gibt</h3>
            <p>
              Spiele unter {RULES.remakeMinutes} Minuten (Remakes, frühe Aufgaben) zählen nicht. Wer
              abwesend war und kaum Gold gesammelt hat, bekommt <GradeChip grade="F" />.
            </p>
          </div>
        </div>

        <div className="card">
          <h3>Wie selten jede Note ist</h3>
          <p className="fine">
            Die Note ist ein Platz unter allen Spielen. <GradeChip grade="MAYHEM" small /> bekommen nur
            die besten {pct(grades[grades.length - 1].share)} aller Spiele.
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
          <b>Leistung Ø</b> ist der Durchschnitt deiner letzten {RULES.averageGames} Noten. Sie hängt
          nicht vom Rang ab und ist sofort sichtbar, ab dem ersten Spiel.
        </p>
      </section>

      <section id="rang" className="howto-section">
        <h2>Der Rang</h2>
        <p className="lead">
          Nach {RULES.placement} Spielen bekommst du einen Rang. Die Einstufung setzt dich höchstens auf{' '}
          {RULES.placementCap.replace(' ', '\u00a0')}, darüber kommt man nur durch Spielen.
        </p>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr">Die Stufen von D bis MAYHEM</caption>
            <thead>
              <tr>
                <th scope="col">Stufe</th>
                <th scope="col">Aufbau</th>
                <th scope="col" className="right">
                  Anteil
                </th>
                <th scope="col" className="hide-sm">
                  So selten wie
                </th>
                <th scope="col" className="right">
                  MP<span className="sr"> je Spiel</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ladder.map((t) => (
                <tr key={t.tier.id}>
                  <td>
                    <div className="rank-cell" data-tier={t.tier.id}>
                      <TierMark rank={rankOf(t.start)} size={36} />
                      <b className="tier-text">{t.tier.name}</b>
                    </div>
                  </td>
                  <td className="muted">
                    {t.apexPoints !== null
                      ? `ab ${t.apexPoints}\u00a0MP`
                      : t.tier.id === 'ss'
                        ? 'IV bis I, dann offen'
                        : 'IV bis I à 100\u00a0MP'}
                  </td>
                  <td className="right num">{pct(t.share)}</td>
                  <td className="muted hide-sm">{LOL[t.tier.id]}</td>
                  <td className="right num">±{t.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fine">
          Die Stufen sind nach der Verteilung in League of Legends geschnitten: MAYHEM ist so selten wie
          Challenger. Nach SS I geht es mit offenen MP weiter. {sss?.tier.name} beginnt bei {sss?.apexPoints}{' '}
          MP, {mayhem?.tier.name} bei {mayhem?.apexPoints} MP, beide nur, wenn deine Leistung über viele
          Spiele sicher in diesem Bereich liegt.
        </p>
      </section>

      <section id="mp" className="howto-section">
        <h2>MP je Spiel</h2>
        <p className="lead">
          Jeder Rang erwartet eine bestimmte Leistung. Liegt deine Note darüber, bekommst du MP, liegt
          sie darunter, verlierst du welche. Je weiter weg, desto mehr, höchstens ±{RULES.maxSwing} je
          Spiel und nie 0.
        </p>
        <div className="grid cols-2">
          <div className="card">
            <h3>Unterwegs nach oben</h3>
            <p>
              Spielst du über längere Zeit besser als dein Rang, bekommst du mehr und verlierst weniger:
              in S etwa +{climb.up} und −{Math.abs(climb.down)} statt ±{ladder[s].points}. Dein Profil zeigt das als
              Kletter-Hinweis. Umgekehrt gilt es genauso.
            </p>
          </div>
          <div className="card">
            <h3>Aufstieg und Abstieg</h3>
            <p>
              Mit 100 MP steigst du sofort auf, der Rest wird mitgenommen. Nach einer Einstufung und nach
              jedem Stufen-Aufstieg kannst du die Stufe {RULES.shield} Spiele lang nicht verlieren. Wer
              eine Stufe verliert, landet je nach Form bei 75, 50 oder 25 MP in der Division darunter.
            </p>
          </div>
        </div>
      </section>

      <section id="saisons" className="howto-section">
        <h2>Saisons</h2>
        <p>
          Drei Saisons im Jahr, sie beginnen am {seasons.join(', ').replace(/, ([^,]*)$/, ' und $1')}. Der
          Rang bleibt zwischen den Saisons, dein Endrang jeder Saison wird im Profil gespeichert. Zum neuen
          Jahr wird weich zurückgesetzt: Es gibt eine neue Einstufung, deine bisherige Leistung zählt
          dabei zum großen Teil weiter.
        </p>
      </section>

      <section id="versteckt" className="howto-section">
        <h2>Was nie gezeigt wird</h2>
        <p>
          Hinter dem Rang steht eine versteckte Wertung: die Schätzung, wie gut du üblicherweise spielst,
          samt ihrer Unsicherheit. Sie beginnt mit dem ersten Spiel und entscheidet über die Einstufung,
          die Größe der MP und ob {sss?.tier.name} und {mayhem?.tier.name} erreichbar sind. Sie erscheint
          nirgends, weder auf der Website noch in der App noch in der API. Auch vor der Einstufung gibt
          es deshalb keine Vorschau des Rangs.
        </p>
      </section>

      <section id="fragen" className="howto-section">
        <h2>Häufige Fragen</h2>
        <div className="faq">
          <details>
            <summary>Warum verliere ich trotz Sieg MP?</summary>
            <p>
              Weil der Sieg nicht zählt. Hat dein Team gewonnen, du selbst aber unter der Erwartung deines
              Rangs gespielt, verlierst du MP. Umgekehrt bekommst du nach einer Niederlage MP, wenn du stark
              gespielt hast.
            </p>
          </details>
          <details>
            <summary>Warum habe ich noch keinen Rang?</summary>
            <p>
              Der Rang erscheint nach {RULES.placement} gewerteten Spielen. Remakes unter{' '}
              {RULES.remakeMinutes} Minuten zählen dabei nicht mit.
            </p>
          </details>
          <details>
            <summary>Warum hat mich die Einstufung nicht höher gesetzt?</summary>
            <p>
              Die Einstufung endet bei {RULES.placementCap}, wie Emerald I in League of Legends. Was
              darüber liegt, erspielst du mit MP.
            </p>
          </details>
          <details>
            <summary>Ich habe über {sss?.apexPoints} MP, warum bin ich nicht {sss?.tier.name}?</summary>
            <p>
              {sss?.tier.name} und {mayhem?.tier.name} brauchen außer den MP eine Leistung, die über viele
              Spiele sicher in diesem Bereich liegt. Bis dahin bleibst du SS mit deinen MP.
            </p>
          </details>
          <details>
            <summary>Bekomme ich mit einem schwachen Champion schlechtere Noten?</summary>
            <p>
              Nein. Jeder Champion wird mit seinem eigenen üblichen Spiel verglichen. Hat ein Champion
              noch wenige Spiele, zählt der Schnitt seiner Rolle mit.
            </p>
          </details>
          <details>
            <summary>Ist das der offizielle Rang von Riot?</summary>
            <p>
              Nein. Ränge und Noten hier sind eine eigene Wertung für ARAM: Mayhem und haben nichts mit der
              offiziellen Rangliste oder Riots MMR zu tun.
            </p>
          </details>
        </div>
      </section>
    </div>
  );
}
