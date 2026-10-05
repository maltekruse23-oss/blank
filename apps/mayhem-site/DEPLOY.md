# Veröffentlichen über Codex (Übergabe nach Etappe 5)

Für Codex beim Veröffentlichen der Website `apps/mayhem-site/` aus `main`. Claude veröffentlicht
nicht selbst.

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
   Download-Links der Archiv-Karte und der Seite `/mitmachen` ins Leere (Dateiname in
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
| `drizzle/0004_windy_venus.sql` | `hidden_players` | Namen ausblenden (`/datenschutz/entfernen`) |
| `drizzle/0005_gorgeous_lord_tyger.sql` | `snapshots` | Gespeicherte Ergebnisse der Seiten |
| `drizzle/0006_flaky_wasp.sql` | `archive_entries`, `archive_indexed` | Alle Spieler aus dem Rohdatenarchiv (Etappe 7) |

## Danach prüfen

- `/`, `/rangliste`, `/rekorde`, `/champions`, `/wertung`, `/datenschutz` laden mit echten Daten.
- Ein Profil und ein Spiel öffnen; eine unbekannte Adresse zeigt „Seite nicht gefunden“.
- `GET /api/leaderboard` zweimal: gleiche Antwort (zweites Mal aus `snapshots`).
- Downloads unter `/downloads/` erreichbar.
- Etappe 7: Die älteren Archivspiele baut die Seite selbst auf, bis zu 20 je Seitenaufruf. Nach dem
  Veröffentlichen `/rangliste` einige Male neu laden, bis die Zahl der Spieler etwa der Spielerzahl
  im Kasten „Mitmachen“ entspricht. Kein Schritt von Hand nötig.
