# Übergabe an Claude – Mayhem, 04.10.2026

## Stand und Herkunft

Dieser Veröffentlichungsstand basiert auf `02039dfc6eb8312228209f1caec37d281cbd2436`
(`claude/hidden-mmr`). Dieser bereits vorhandene Ranked-Commit wurde unverändert übernommen.
Die folgenden Ergänzungen stammen aus der Codex-Arbeit. Vorhandene lokale Benutzeränderungen
wurden in einem getrennten Worktree zusammengeführt; der Arbeitsbranch von Claude blieb erhalten.

## 1. Fremde LCU-Histories: nachgewiesen

Ein isolierter Test benutzt die bestehende LCU-Verbindung und einen fremden Teilnehmer eines
bereits vorhandenen Queue-2400-Matches. Endpunkte im Test:

- `/lol-match-history/v1/products/lol/{PUUID}/matches?begIndex=0&endIndex=20`
- `/lol-match-history/v1/games/{gameId}`
- `/lol-match-history/v1/game-timelines/{gameId}`

Fremde History lieferte HTTP 200, 21 Mayhem-Spiele; ein zusätzliches Match ohne den eigenen
Account enthielt zehn PUUIDs, davon acht neue. Eine Timeline lieferte 20 Frames / 149 Events.
Der spätere begrenzte Test mit neun fremden Histories lieferte 110 eindeutige Mayhem-Match-IDs,
davon 71 gegenüber dem damaligen Bestand neu. Von diesen wurden bewusst nur 50 Details geladen:
500 Teilnehmer-Einträge, 415 eindeutige Spieler, davon 406 neu. Alle 60 Requests HTTP 200.
Kein neuer eigener Spielabschluss war nötig. Keine Rekursion oder Pagination in diesem Test.
Dies beweist keine unbegrenzte Reichweite und kein dauerhaft garantiertes Rate-Limit.

`src-tauri/src/aram_lcu_probe.rs` ist ein ignorierter manueller Test. Rohantworten, PUUIDs,
Freundeslisten und private Prüfprotokolle werden nicht veröffentlicht. Kein Crawler eingebaut.

## 2. Dauerhaftes Rohdatenarchiv und automatische Übermittlung

- `aram_archive.rs`: bestehende Matchdetail-Antworten vor ihrer Reduktion lokal als Rohbytes sichern.
- Dauerhafte Outbox, SHA-256-Bestätigungen, Deduplizierung, Wiederholung, Pause-Schalter,
  begrenzte lokale Warteschlange. Bestätigte Uploads erhalten einen lokalen Beleg.
- `aram_website.rs`, `AramWebsite.tsx`, Erweiterung von `AramShared.tsx`: Anbindung und Status.
- `configure_archive.rs`: privater Pilot-Schlüssel ausschließlich über stdin in den Windows-
  Anmeldeinformationsspeicher. Keine Schlüssel in diesem Repository.
- Keine zusätzlichen LCU-Abfragen durch das automatische Archiv; keine Timeline-Sammlung und
  kein automatischer Rückimport bereits vollständig gespeicherter alter App-Matches.
- Website speichert Match-Rohdaten komprimiert im Objektspeicher, Metadaten/Zähler in D1.
  Daten und berechnete Ranglisten sind getrennt, damit spätere Bewertungsformeln neu rechnen können.
- Unique-Match-Zähler und persönliche Beiträge, Dublettenprüfung und konfliktbewahrende Ablage.
- 50 Matches / 415 Spieler war ein damaliger Teststand, kein zugesicherter aktueller Live-Zähler.
- Dauerhafte Speicherung ist die Absicht; automatische externe Sicherungen sind weiterhin offen.

Rohdaten umfassen Match-ID, Queue, Plattform, Zeit, Dauer, Version, alle zehn Identitäten,
Champions, Teams, Ergebnis, KDA, Gold, Items, Schaden, erlittenen/geminderten Schaden, Heilung,
CC und bis zu sechs Augment-Felder. Ein geprüftes Statistikobjekt enthält 118 Felder.
Kein explizites Schild-Feld in der Stichprobe; `totalHeal` belegt keine getrennte Verbündetenheilung.
Timelines waren nur separat in einem Proof of Concept vorhanden.

## 3. Kleine Collector-App

Quellcode unter `apps/mayhem-collector/`, eigenständige Tauri-App ohne React-Build.
Rudimentäre Oberfläche mit globalen/persönlichen Zählern und Pause; Autostart standardmäßig an,
abschaltbar. Nach Start automatische Beteiligung ohne Codeeingabe. Registrierung/Upload laufen
über die bestehende Website. Lokale Zugangsdaten bleiben lokal. Datenschutzseite beschreibt den
Datentransfer. Kein Reddit-Post erfolgt. Keine EXE oder persönlichen Laufzeitdateien im Git-Tree.

## 4. Freigegebene Rangicons

Zehn Augment-v3-Originale: F, E, D, C, B, A, S, SS, SSS, MAYHEM.
Unterschiedliche augmentartige Rahmen, kantige kristalline Buchstaben. SSS ohne die zwei
schwebenden Dreiecke. App-Dateien unter `src/features/aram/emblems/`; Website unter
`apps/mayhem-site/public/emblems/`. Aktive Tier-Zuordnung weiterhin D bis MAYHEM (acht);
F/E sind vorbereitete Assets, keine Änderung der Ranggrenzen durch diesen Patch.

Die Original-PNGs haben einen schwarzen Hintergrund. `mix-blend-mode: screen` blendet diesen
in der dunklen App und Website aus. Das ist keine echte Alpha-Konvertierung und ist auf hellen
Flächen ungeeignet. Generierte Freistellungsversuche mit Artefakten bzw. eingebranntem Schachbrett
wurden verworfen. Nicht wieder einbauen. Formen und Farben nicht neu generieren.

App lokal gebaut und installiert; Build-Hash gegen installierte EXE geprüft, Prozess antwortet.
Rangliste in Browser-Vorschau nach CSS-Korrektur ohne schwarze Kachel geprüft. Kein neuer nativer
Screenshot: native UI-Steuerung war nicht verfügbar. Alte Assets und EXE sind lokal gesichert.

## 5. Website und Bewertungsunterschied

`apps/mayhem-site/` ist ein Quellcode-Snapshot der existierenden Sites-Website inklusive ihrer
eigenen Dependencies, Archiv-API und Datenschutzhinweise. Deployment erfolgt weiter über Sites
mit bestehender Projekt-ID; kein neues Site-Projekt anlegen. Version 5 wurde am 04.10.2026
mit den Icons und der CSS-Korrektur erfolgreich veröffentlicht.

WICHTIG: Die Website enthält weiterhin ihren bisherigen Rating-v1-Stand. Claudes neuer
Hidden-MMR-Commit der Desktop-App wurde NICHT auf die Website portiert. Ein Abgleich ist eine
eigene fachliche Änderung und darf nicht als bereits erledigt gelten. Keine Datenmigration hier.
`public/downloads` ist absichtlich nicht im Snapshot: dort liegen veröffentlichte Binärdateien.
Kein Site-Deployment allein aus diesem Snapshot starten, ohne diese Deployment-Assets zu erhalten.

## 6. Offener nächster Auftrag: alternative Datenquellen

Der Benutzer möchte eine Statistikseite mit fremden Mayhem-Histories und den gleichen Rohstats
prüfen, um mehr Daten ohne eigenes Spielen zu bekommen. Recherche begonnen, kein Importer gebaut.
PlayARAM.gg ist ein Kandidat: bewirbt Riot-ID-Suche auch für EUW, alle zehn Spieler, Items,
Augments, KDA und Schaden. Startseite und Suchformular im Browser geprüft; ein konkreter Verlauf,
PUUIDs, Match-IDs, volle 118 Statistikfelder, Timeline, Export/API und Nutzungsbedingungen sind
NOCH NICHT verifiziert. Keine Vollständigkeit behaupten.
OP.GG erklärt in seiner Hilfe: nur eigene mit verknüpfter Desktop-App gespeicherte Mayhem-History,
keine fremden Histories. MayhemStats sammelt anonymisierte Community-Daten ohne Spieleridentität;
dies ersetzt keine identifizierbare Spielerhistorie für ein Ranking.

## Rücknahme / Zusammenarbeit

Prüfung dieses gemeinsamen GitHub-Snapshots: `pnpm format:check`, `pnpm lint`, `pnpm build`,
`pnpm test` (94 Tests) und `pnpm extension:build` bestanden. App-Rust: `cargo fmt --check`,
`cargo test --locked` (69 bestanden, drei manuelle/Live-Tests ignoriert), Clippy für alle Targets
mit Warnungen als Fehler bestanden. Collector: vier Tests und Clippy bestanden.
Website-Snapshot entspricht dem erfolgreich gebauten und veröffentlichten Sites-Quellstand;
nur eine überzählige Leerzeile am Dateiende wurde für die Git-Prüfung entfernt.
Die zuvor installierte lokale EXE stammt aus dem Icon-Arbeitsschritt und ist kein separat
versioniertes Release dieses gemeinsamen GitHub-Snapshots. Kein neuer Release-Tag erzeugt.

Änderungen in diesem Veröffentlichungsbranch sind per Git rücknehmbar. Keine bestehenden
Spieldaten löschen. Icons: alte acht PNGs/TierEmblem und CSS wiederherstellen; F/E entfernen.
Website kann auf die frühere veröffentlichte Version zurückgesetzt werden; Daten dabei behalten.
Collector/Website-Snapshot sind unabhängige Projekte, nicht Teil des Root-Frontend-Builds.
Root-Prettier/ESLint ignorieren `apps/`; deren Prüfungen sind separat auszuführen.
Vor weiteren MMR-Regeln, Datenmigrationen, Crawlern oder größeren Produktänderungen den Benutzer
fragen. Er möchte kurze Antworten und leicht rücknehmbare Schritte.
