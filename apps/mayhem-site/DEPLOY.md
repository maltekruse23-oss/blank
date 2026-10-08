# Veröffentlichen über Codex (Übergabe nach Etappe 5)

Für Codex beim Veröffentlichen der Website `apps/mayhem-site/` aus `main`. Claude veröffentlicht
nicht selbst.

## Aktueller Auftrag: Website nur Englisch, mit Server-Filter (08.10.2026)

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
  Quelle neben blank. und dem Collector, `/privacy/remove` hat unter „Good to know“ die Zeile „The
  Mayhem app then no longer uploads your games by itself.“ Keine API-Änderung: die Mayhem-App lädt
  über die bestehenden Archiv-Endpunkte des Collectors hoch (`/api/archive/enroll`,
  `/api/archive/contribute`) und liest `/api/players/<Name-TAG>`.

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
