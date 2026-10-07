// The privacy page (/privacy, /de/datenschutz). The German text is the original; the English one
// says the same, nothing more.
import { href, text, type Lang } from '../ui/lang';

export default function Privacy({ lang }: { lang: Lang }) {
  const t = text(lang);
  const link = (path: string) => href(lang, path);
  const players = lang === 'de' ? '/de/players' : '/players';
  const game = lang === 'de' ? '/de/spiel/ID' : '/game/ID';
  return (
    <article className="prose">
      <h1>{t('Your data.', 'Deine Daten.')}</h1>

      <h2>{t('What is stored', 'Was gespeichert wird')}</h2>
      <p>
        {t(
          'The leaderboard stores Riot ID, PUUID, profile icon ID and game values from ARAM Mayhem: game ID, time, champion, K/D/A, performance values, items, augments, skin and the anonymous values of the lobby. References to teammates may contain their Riot ID and PUUID. From the raw data archive, the Riot ID, profile icon and game values are prepared for the pages per game and player. Anyone who has their name hidden is only recorded with their PUUID. In addition there are the season start, time of receipt, checksums and only hashed authorization keys. Memberships from the former groups remain stored, but are neither shown nor handed out.',
          'Die Rangliste speichert Riot-ID, PUUID, Profilsymbol-ID und Spielwerte aus ARAM Mayhem: Spiel-ID, Zeitpunkt, Champion, K/D/A, Leistungswerte, Gegenstände, Augments, Skin und die anonymen Werte der Lobby. Mitspieler-Verweise enthalten gegebenenfalls deren Riot-ID und PUUID. Aus dem Rohdatenarchiv werden je Spiel und Spieler Riot-ID, Profilsymbol und Spielwerte für die Seiten aufbereitet. Wer seinen Namen ausblenden lässt, wird nur mit seiner PUUID vermerkt. Hinzu kommen Saisonstart, Empfangszeit, Prüfsummen und ausschließlich gehashte Berechtigungsschlüssel. Mitgliedschaften aus den früheren Gruppen bleiben gespeichert, werden aber weder angezeigt noch herausgegeben.',
        )}
      </p>

      <h2>{t('What for and how long', 'Wofür und wie lange')}</h2>
      <p>
        {t(
          'This data is used to calculate ranks, for the match history, to match multiple uploads and to show it on this publicly accessible website. Game and profile data stay stored until they are deleted. Submitted game values and identifiers can be retrieved through the public API and the export.',
          'Diese Daten dienen der Rangberechnung, dem Spielverlauf, dem Abgleich mehrfacher Uploads und der Anzeige auf dieser öffentlich zugänglichen Website. Spiel- und Profildaten bleiben bis zur Löschung gespeichert. Übermittelte Spielwerte und Identifikatoren sind über die öffentliche API und den Export abrufbar.',
        )}
      </p>

      <h2>{t('IP addresses and hosting', 'IP-Adressen und Hosting')}</h2>
      <p>
        {t(
          "The application does not store IP addresses in plain text. For the rate limit of writing requests (upload, delete, hide), a hash that depends on the minute is used. It expires after one minute and is removed with the next writing API request. Just reading the pages stores none of this. Short-lived event references are cleaned up after 24 hours with the next upload. Hosting is provided by ChatGPT Sites. Its technical access logs and built-in visitor statistics are outside this application's control; no particular retention period is promised here.",
          'Die Anwendung speichert keine IP-Adressen im Klartext. Für das Anfragelimit schreibender Anfragen (Hochladen, Löschen, Ausblenden) wird ein minutenabhängiger Hash verwendet. Dieser verfällt nach einer Minute und wird bei der nächsten schreibenden API-Anfrage entfernt. Beim reinen Lesen der Seiten wird nichts davon gespeichert. Kurzlebige Ereignisverweise werden nach 24 Stunden beim nächsten Upload bereinigt. Das Hosting erfolgt durch ChatGPT Sites. Dessen technische Zugriffsprotokolle und eingebaute Besuchsstatistik liegen außerhalb der Kontrolle dieser Anwendung; eine bestimmte Aufbewahrungsdauer wird hier nicht zugesichert.',
        )}
      </p>

      <h2>{t('Who appears on the website', 'Wer auf der Website erscheint')}</h2>
      <p>
        {t(
          'The website is a public stats and ranking site for ARAM Mayhem. Every player from an uploaded or archived game appears with Riot ID, profile icon, game values, grades and rank: in the leaderboard, in search, in records and champions and on their own player page. The games come from the League client of people who use blank. or the Collector; the other nine players of a game are recorded along with them. Every player, including those who upload themselves, has a player page under their Riot ID (',
          'Die Website ist eine öffentliche Statistik- und Rangseite für ARAM Mayhem. Jeder Spieler aus einem hochgeladenen oder archivierten Spiel erscheint mit Riot-ID, Profilsymbol, Spielwerten, Noten und Rang: in der Rangliste, in der Suche, bei Rekorden und Champions und auf einer eigenen Spielerseite. Die Spiele kommen vom League-Client derer, die blank. oder den Collector nutzen; die anderen neun Spieler eines Spiels werden dabei mit erfasst. Jeder Spieler, auch wer selbst hochlädt, hat eine Spielerseite unter seiner Riot-ID (',
        )}
        <code>{players}/Name-TAG</code>
        {t('), like on op.gg, and under a neutral number (', '), wie bei op.gg, und unter einer neutralen Nummer (')}
        <code>{players}/a123</code>
        {t('); the website never hands out PUUIDs. Every game page (', '); PUUIDs gibt die Website nie heraus. Jede Spiel-Seite (')}
        <code>{game}</code>
        {t(
          ') shows the Riot IDs of all ten players, taken from the raw data archive, along with champion, game values, items and the grade calculated from them.',
          ') zeigt die Riot-IDs aller zehn Spieler, entnommen aus dem Rohdatenarchiv, dazu Champion, Spielwerte, Gegenstände und die daraus berechnete Note.',
        )}
      </p>
      <p>
        {t('Anyone who does not want to appear can remove themselves under ', 'Wer nicht erscheinen möchte, kann sich unter ')}
        <a href={link('/privacy/remove')}>{t('Hide name', 'Namen ausblenden')}</a>
        {t(
          ': with a game they played in and their own Riot ID. Name and player page then disappear from all pages and from the API, in all games; the values stay without a name in the games of the others. Only the PUUID is stored for this. Unhiding is only possible through the operator or by uploading yourself. Players with their own profile delete as described below.',
          ' selbst entfernen: mit einem Spiel, in dem er mitgespielt hat, und der eigenen Riot-ID. Name und Spielerseite verschwinden dann von allen Seiten und aus der API, in allen Spielen; die Werte bleiben ohne Namen in den Spielen der anderen. Gespeichert wird dafür nur die PUUID. Wieder eingeblendet wird nur über den Betreiber oder durch eigenes Hochladen. Spieler mit eigenem Profil löschen wie unten beschrieben.',
        )}
      </p>

      <h2>{t('Delete or export data', 'Daten löschen oder exportieren')}</h2>
      <p>
        {t('With the personal key from the first upload, blank. can use ', 'Mit dem persönlichen Schlüssel aus dem ersten Upload kann blank. über ')}
        <code>DELETE /api/players/PUUID</code>
        {t(
          ' to delete the profile, your own games, upload records, former group memberships and personal references to teammates. So that the games from the archive do not reappear under a number afterwards, the player is hidden at the same time. The key belongs in the protected storage of the app. If it is lost, the assignment has to be checked by the operator. Exports already retrieved by others and hosting backups are not recalled by this.',
          ' das Profil, die eigenen Spiele, Upload-Nachweise, frühere Gruppenmitgliedschaften und personenbezogene Mitspieler-Verweise löschen. Damit die Spiele aus dem Archiv danach nicht unter einer Nummer wieder erscheinen, wird der Spieler zugleich ausgeblendet. Der Schlüssel gehört in den geschützten Speicher der App. Ist er verloren, muss die Zuordnung durch den Betreiber geprüft werden. Bereits von anderen abgerufene Exporte und Hosting-Backups werden dadurch nicht zurückgerufen.',
        )}
      </p>
      <p>
        <a href={link('/api-guide')}>{t('API guide', 'API-Anleitung')}</a> ·{' '}
        <a href={'/api/export'}>{t('Export the public data as JSON', 'Öffentlichen Datenbestand als JSON exportieren')}</a>
      </p>

      <h2>{t('Origin and reliability', 'Herkunft und Zuverlässigkeit')}</h2>
      <p>
        {t(
          "The data comes from the user's League client and is not verified by Riot. Matching lobbies detects contradictions, but proves neither the identity of an uploader nor that a game is genuine. The app should only submit queue 2400; the existing AramEntry format itself has no queue field.",
          'Die Daten kommen aus dem League-Client des Nutzers und sind nicht von Riot geprüft. Lobby-Abgleich erkennt Widersprüche, beweist aber weder die Identität eines Uploaders noch die Echtheit eines Spiels. Die App sollte nur Queue 2400 übermitteln; das vorhandene AramEntry-Format enthält selbst kein Queue-Feld.',
        )}
      </p>

      <h2>{t('Controller', 'Verantwortlicher')}</h2>
      <p>
        {t('This project is provided through the repository ', 'Dieses Projekt wird über das Repository ')}
        <a href="https://github.com/maltekruse23-oss/blank">maltekruse23-oss/blank</a>
        {t(
          '. Full operator and privacy contact details have not yet been provided for this website.',
          ' bereitgestellt. Vollständige Betreiber- und Datenschutz-Kontaktdaten wurden für diese Website noch nicht hinterlegt.',
        )}
      </p>
      <p>{t('Not affiliated with Riot Games.', 'Nicht mit Riot Games verbunden.')}</p>
    </article>
  );
}
