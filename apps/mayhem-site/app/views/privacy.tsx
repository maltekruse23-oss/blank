// The privacy page (/privacy). English only since 08.10.2026; the text says the same as the earlier
// German original (/de/datenschutz, now a redirect here), nothing more and nothing less – plus the
// Mayhem app as a source of uploads ("Find my Mayhem rank", 08.10.2026).
export default function Privacy() {
  return (
    <article className="prose">
      <h1>Your data.</h1>

      <h2>What is stored</h2>
      <p>
        The leaderboard stores Riot ID, PUUID, profile icon ID and game values from ARAM Mayhem: game ID, time, champion, K/D/A, performance values, items, augments, skin and the anonymous values of the lobby. References to teammates may contain their Riot ID and PUUID. From the raw data archive, the Riot ID, profile icon and game values are prepared for the pages per game and player. Anyone who has their name hidden is only recorded with their PUUID. In addition there are the season start, time of receipt, checksums and only hashed authorization keys. Memberships from the former groups remain stored, but are neither shown nor handed out.
      </p>

      <h2>What for and how long</h2>
      <p>
        This data is used to calculate ranks, for the match history, to match multiple uploads and to show it on this publicly accessible website. Game and profile data stay stored until they are deleted. Submitted game values and identifiers can be retrieved through the public API and the export.
      </p>

      <h2>IP addresses and hosting</h2>
      <p>
        {"The application does not store IP addresses in plain text. For the rate limit of writing requests (upload, delete, hide), a hash that depends on the minute is used. It expires after one minute and is removed with the next writing API request. Just reading the pages stores none of this. Short-lived event references are cleaned up after 24 hours with the next upload. Hosting is provided by ChatGPT Sites. Its technical access logs and built-in visitor statistics are outside this application's control; no particular retention period is promised here."}
      </p>

      <h2>Who appears on the website</h2>
      <p>
        The website is a public stats and ranking site for ARAM Mayhem. Every player from an uploaded or archived game appears with Riot ID, profile icon, game values, grades and rank: in the leaderboard, in search, in records and champions and on their own player page. The games come from the League client of people who use blank., the Mayhem app or the Collector; the other nine players of a game are recorded along with them. Every player, including those who upload themselves, has a player page under their Riot ID (
        <code>/players/Name-TAG</code>
        ), like on op.gg, and under a neutral number (
        <code>/players/a123</code>
        ); the website never hands out PUUIDs. Every game page (
        <code>/game/ID</code>
        ) shows the Riot IDs of all ten players, taken from the raw data archive, along with champion, game values, items and the grade calculated from them.
      </p>
      <p>
        {'Anyone who does not want to appear can remove themselves under '}
        <a href="/privacy/remove">Hide name</a>
        : with a game they played in and their own Riot ID. Name and player page then disappear from all pages and from the API, in all games; the values stay without a name in the games of the others. Only the PUUID is stored for this. Unhiding is only possible through the operator or by uploading yourself. Players with their own profile delete as described below.
      </p>

      <h2>Delete or export data</h2>
      <p>
        {'With the personal key from the first upload, blank. can use '}
        <code>DELETE /api/players/PUUID</code>
        {' to delete the profile, your own games, upload records, former group memberships and personal references to teammates. So that the games from the archive do not reappear under a number afterwards, the player is hidden at the same time. The key belongs in the protected storage of the app. If it is lost, the assignment has to be checked by the operator. Exports already retrieved by others and hosting backups are not recalled by this.'}
      </p>
      <p>
        <a href="/api-guide">API guide</a> ·{' '}
        <a href={'/api/export'}>Export the public data as JSON</a>
      </p>

      <h2>Origin and reliability</h2>
      <p>
        {"The data comes from the user's League client and is not verified by Riot. Matching lobbies detects contradictions, but proves neither the identity of an uploader nor that a game is genuine. The app should only submit queue 2400; the existing AramEntry format itself has no queue field."}
      </p>

      <h2>Controller</h2>
      <p>
        {'This project is provided through the repository '}
        <a href="https://github.com/maltekruse23-oss/blank">maltekruse23-oss/blank</a>
        . Full operator and privacy contact details have not yet been provided for this website.
      </p>
      <p>Not affiliated with Riot Games.</p>
    </article>
  );
}
