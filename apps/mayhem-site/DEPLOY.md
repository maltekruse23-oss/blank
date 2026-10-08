# Veröffentlichen über Codex (Übergabe nach Etappe 5)

Für Codex beim Veröffentlichen der Website `apps/mayhem-site/` aus `main`. Claude veröffentlicht
nicht selbst.

## Aktueller Auftrag: Download der Mayhem-App (08.10.2026)

Stand `main` nach dem PR „Website: Download der Mayhem-App“ (`claude/website-download`). Ablauf wie
unten, dieselbe Site und Projekt-ID, **keine neue Migration**, `public/downloads/` wie immer
übernehmen. Neu ist nur ein kleiner Block „Get the Mayhem app“ (`app/ui/get-app.tsx`) unter der
Rangliste und unten auf `/join`; Adressen, API und Antworten sind gleich. Ist der Auftrag „Arena“
(unten) noch nicht veröffentlicht, geht er mit diesem zusammen live: dann auch dessen Prüfungen.

Erst veröffentlichen, wenn das neueste GitHub-Release `mayhem.exe` enthält (v0.10.0 oder später;
`gh release view --json assets`), sonst führt der Knopf ins Leere.

Zusätzlich live prüfen (Rechner und um 390 px):

1. `/leaderboard`: direkt unter der Liste (vor „How it counts“) der Block „Get the Mayhem app“ mit
   einer Zeile, was die App tut, goldenem „Download for Windows“ und der Zeile „Windows 10/11 · free ·
   not signed …“. Bei 390 px steht der Knopf unter dem Text, kein seitliches Scrollen.
2. Klick auf „Download for Windows“ lädt `mayhem.exe` von GitHub
   (`https://github.com/maltekruse23-oss/blank/releases/latest/download/mayhem.exe`, Release ab v0.10.0).
3. `/join`: derselbe Block unten unter „What the Collector does“ / „Already using blank.?“; der
   Collector-Download oben ist unverändert.

## Vorheriger Auftrag: Website im Design „Arena“ (08.10.2026)

Stand `main` nach dem PR „Website im Design Arena“ (`claude/website-arena`). Ablauf wie unten
(„Vorher“, dann veröffentlichen, dann „Danach prüfen“), dieselbe Site und Projekt-ID, **keine neue
Migration** (`drizzle/` unverändert seit 0006), `public/downloads/` wie immer übernehmen. Geändert
haben sich nur Aussehen und Anordnung der Seiten (`app/`, `public/fonts`, `public/favicon.svg`);
Adressen, Weiterleitungen, API und Antworten sind gleich. Ist der Auftrag „Website nur Englisch“
(unten) noch nicht veröffentlicht, geht er mit diesem zusammen live: dann auch dessen Prüfungen.

Zusätzlich zu „Danach prüfen“ live prüfen und dem Benutzer melden (im Browser, Rechner und Handy bzw.
schmales Fenster um 390 px):

1. `https://mayhemstats.lol/`: dunkles Graublau mit warmem Schein oben, Kopfzeile „mayhemstats“
   („stats“ gold) mit goldenem „Join“, Titel in Unbounded. Im Netzwerk-Tab laden
   `/fonts/unbounded-latin.woff2`, `/fonts/hankengrotesk-latin.woff2`, `/fonts/geistmono-latin.woff2`
   mit 200; keine Anfrage an Google Fonts.
2. `/leaderboard`: Platz 1–3 als Kacheln (Gold, Silber, Bronze), darunter Zeilen mit Wappen, Rang und
   „… points“ (nirgends „MP“), unten „Show … more“. Reiter „By rank“, „By average grade“, „Rank
   spread“ (Verteilung). `?server=euw` zeigt nur EUW mit Plätzen ab 1.
3. Ein Profil: Rang-Karte rechts oben, Reiter Overview/Matches/Champions/Play style/Seasons; Klick auf
   ein Spiel klappt Note, Items, Augments und alle zehn Spieler auf.
4. `/champions/<Name>`: Splash-Art mit Siegquote und Spielen, Reiter Build/Combos/Top players/Best games.
5. `/augments` (Karten mit Stufe S–D), `/items`, `/tier-list` (erst S und A, dann „Show all tiers“),
   `/records` (eine Kachel je Rekord), ein Spiel (`/game/<id>`, Klick auf eine Note zeigt die Werte),
   `/scoring#rank` öffnet den Reiter „The rank“.
6. Bei 390 px: nirgends seitliches Scrollen, Kopfzeile scrollt mit der Seite.
7. `GET /api/leaderboard` und `/api/players/<id>` antworten wie vorher (dieselben Felder, `server`).

Gespeicherte Antworten (`snapshots`) sind nicht betroffen, nur die Seiten haben sich geändert.

## Vorheriger Auftrag: Website nur Englisch, mit Server-Filter (08.10.2026)

Stand `main` nach PR #58 (Englisch/Deutsch), #59 (Server-Kürzel und -Filter) und dem PR
„Website nur Englisch“ (Benutzerentscheidung 08.10.2026: „Website auch Englisch only.“). Ablauf wie
unten („Vorher“, dann veröffentlichen, dann „Danach prüfen“), dieselbe Site und Projekt-ID, **keine
neue Migration** (`drizzle/` unverändert seit 0006). Neu ist nur:

- Die Website ist nur noch englisch. Es gibt keine deutschen Seiten und keinen Umschalter EN/DE mehr;
  `proxy.ts` ist entfallen. Alte deutsche Adressen leiten dauerhaft (308, Anfrage bleibt) auf die
  englische Seite weiter (`redirects.ts`, eingebunden in `next.config.ts`; muss im Deployment
  mitlaufen): `/de` → `/`, `/de/rangliste` → `/leaderboard`, `/de/rekorde` → `/records`,
  `/de/tierliste` → `/tier-list`, `/de/mitmachen` → `/join`, `/de/spiel/<id>` → `/game/<id>`,
  `/de/wertung` → `/scoring`, `/de/datenschutz` → `/privacy`, `/de/datenschutz/entfernen` →
  `/privacy/remove`, alles andere unter `/de/…` → dieselbe Adresse ohne `/de` (`/de/players/…`,
  `/de/champions/…`, `/de/api-guide` …); die ganz alten Adressen an der Wurzel (`/rangliste`,
  `/spiel/<id>` …) gehen direkt auf die englische Seite.
- Die API ist unverändert (Felder und deutsche Fehlermeldungen wie bisher, die App braucht sie).
- `/api/leaderboard` und `/api/players/<id>` haben je Spieler `server` (EUW, NA …).
- Nur Text (PR „Find my Mayhem rank“, `claude/find-my-rank`): `/privacy` nennt die Mayhem-App als
  Quelle neben blank. und dem Collector; Wieder-sichtbar-Machen nur über den Betreiber oder ein
  eigenes Hochladen mit blank. („Uploading with the Mayhem app does not unhide you.“ – Uploads über
  `/api/archive/contribute` löschen `hidden_players` nicht, nur `/api/games`). `/privacy/remove`
  sagt unter „Good to know“ „If you upload with blank. later, you will be named again.“ und „Once
  hidden, the Mayhem app no longer uploads your games by itself, and uploading with it does not
  unhide you.“ Keine API-Änderung: die Mayhem-App lädt über die bestehenden Archiv-Endpunkte des
  Collectors hoch (`/api/archive/enroll`, `/api/archive/contribute`) und liest
  `/api/players/<Name-TAG>`.

Zusätzlich zu „Danach prüfen“ live prüfen und dem Benutzer melden:

1. `https://mayhemstats.lol/` ist englisch (`<html lang="en"`, Fußzeile „isn't endorsed by Riot
   Games“), oben rechts steht kein EN/DE mehr.
2. Weiterleitungen (mit `curl.exe -sI <Adresse>`: Status 308, `Location` wie hier):
   `/de` → `/`, `/de/rangliste?server=euw` → `/leaderboard?server=euw`, `/de/spiel/<id>?p=a1` →
   `/game/<id>?p=a1`, `/de/datenschutz/entfernen` → `/privacy/remove`, `/de/players/<Name-TAG>` →
   `/players/<Name-TAG>`, `/rangliste` → `/leaderboard`. Im Browser landen sie auf der englischen Seite.
3. Englisch auf `/leaderboard`, `/records`, `/tier-list`, `/join`, `/scoring`, `/privacy`,
   `/privacy/remove`, `/api-guide`, einem Profil und einem Spiel: keine deutschen Beschriftungen
   (Rollen, Tags, Rekord-Namen, Achsen im Radar, Saisonstarts auf `/scoring`). Ausnahme: Augment-Namen
   kommen aus dem League-Client der Hochladenden und können deutsch sein (bekannt, nicht Teil dieses
   Auftrags).
4. Rangliste: Spieler tragen ein Kürzel (EUW, NA …); die Auswahl „Server“ zeigt die vorhandenen Server
   mit Spielerzahl; mit `?server=euw` stehen nur EUW-Spieler da, Plätze ab 1. Ein Profil zeigt das
   Kürzel vor Siegen/Niederlagen.
5. Eine unbekannte Adresse zeigt „Page not found“.
6. `GET /api/leaderboard`: jeder Spieler hat das Feld `server`; keine PUUIDs (nur `a123`).

Hinweis: Gespeicherte Antworten (`snapshots`) von vor dem Veröffentlichen haben noch kein `server`;
sie laufen nach höchstens 5 Minuten oder mit dem nächsten Spiel ab. Kürzel fehlen also kurz nach dem
Veröffentlichen, das ist kein Fehler.

## Ziel

- Bestehende Site: `https://blank-mayhem.maltevfx.chatgpt.site`
- Eigene Domain: `https://mayhemstats.lol` (gekauft bei Porkbun). Mit der bestehenden Site
  verbinden und dem Benutzer die nötigen DNS-Einträge nennen; er setzt sie bei Porkbun. Die
  alte Adresse soll weiter antworten (ältere App-Versionen nutzen sie). Erst wenn
  `https://mayhemstats.lol/api/leaderboard` antwortet, die App mit der neuen Adresse
  veröffentlichen.
- Bestehende Projekt-ID: `appgprj_6abe43cac45c819180fa43cf60e293e1` (`.openai/hosting.json`).
  Keine neue Site und keine neue, leere Datenbank anlegen.
- Paketname (`site-creator-vinext-starter`) nicht ändern: wrangler nimmt ihn als Worker-Namen.

## Vorher

1. `public/downloads/` aus dem bisherigen Deployment-Checkout übernehmen (Collector-EXE und
   `collector-info.txt`). Diese Dateien liegen absichtlich nicht in Git; ohne sie zeigen die
   Download-Links der Archiv-Karte und der Seite `/join` ins Leere (Dateiname in
   `app/ui/join.ts`).
2. `npm ci`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
3. Im Repo-Wurzelordner `pnpm test` (die Website-Logik wird dort mit Vitest geprüft).
4. Lokal mit frischer D1: Migrationen anwenden, `npm run start -- --port 5173`, einige Sekunden
   warten, dann `node tests/smoke.mjs` (einmal leer) und `node tests/integration.mjs`. Beide nur
   gegen die lokale Vorschau, nie gegen die echte Site. Für einen zweiten Lauf der
   Integrationstests die Vorschau mit frischer D1 neu starten. Dazu `node tests/all-players.mjs`
   (eigene Miniflare-Instanz mit frischer D1, nur lokal).

## Migrationen

Nicht von Hand anwenden: `npm run build` kopiert `drizzle/` nach `dist/.openai/drizzle`, und
ChatGPT Sites wendet beim Veröffentlichen die noch fehlenden Migrationen selbst der Reihe nach
an. Nie eine bereits angewendete Datei ändern. Alle legen nur neue Tabellen an, nichts wird gelöscht oder umgeschrieben.

| Datei | Tabelle | Wofür |
| --- | --- | --- |
| `drizzle/0003_mysterious_stepford_cuckoos.sql` | `augments` | Namen und Symbole der Augments |
| `drizzle/0004_windy_venus.sql` | `hidden_players` | Namen ausblenden (`/privacy/remove`) |
| `drizzle/0005_gorgeous_lord_tyger.sql` | `snapshots` | Gespeicherte Ergebnisse der Seiten |
| `drizzle/0006_flaky_wasp.sql` | `archive_entries`, `archive_indexed` | Alle Spieler aus dem Rohdatenarchiv (Etappe 7) |

## Danach prüfen

- `/`, `/leaderboard`, `/records`, `/champions`, `/scoring`, `/privacy` laden englisch mit echten Daten. Alte deutsche Adressen wie `/de/rangliste`, `/rangliste` oder `/de/spiel/<id>` leiten dauerhaft (308) auf die englische Seite weiter.
- Ein Profil und ein Spiel öffnen; eine unbekannte Adresse zeigt „Page not found“.
- `GET /api/leaderboard` zweimal: gleiche Antwort (zweites Mal aus `snapshots`).
- Downloads unter `/downloads/` erreichbar.
- Etappe 7: Die älteren Archivspiele baut die Seite selbst auf, bis zu 20 je Seitenaufruf. Nach dem
  Veröffentlichen `/leaderboard` einige Male neu laden, bis die Zahl der Spieler etwa der Spielerzahl
  im Kasten „Mitmachen“ entspricht. Kein Schritt von Hand nötig.
