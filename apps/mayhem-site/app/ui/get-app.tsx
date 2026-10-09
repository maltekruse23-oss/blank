// The compact "Get the Mayhem app" block under the leaderboard and on /join (user wish 08.10.2026).
import { MAYHEM_APP } from './join';

export default function GetApp() {
  return (
    <section className="card get-app in" aria-labelledby="get-app">
      <div>
        <h2 id="get-app">Get the Mayhem app</h2>
        <p className="fine">Builds and augment tiers in champion select, your rank, and a card after every game.</p>
        <p className="fine">{'Windows 10/11 · free · not signed: if Windows warns, "More info" → "Run anyway"'}</p>
      </div>
      <p>
        <a className="button primary" href={MAYHEM_APP}>
          Download for Windows
        </a>
      </p>
    </section>
  );
}
