# Übergabe an Claude – Mayhem, 04.10.2026

## Neuester Stand: zusätzlicher Claude-Commit während dieser Dokumentation

Beim Push der ausführlichen Ergänzung enthielt der Remote-Branch bereits Claudes Commit
`86aaa1c5db761974c75965e3d2d07d271d1aecf6`. Er wurde per Rebase erhalten, nicht überschrieben.
Die folgenden Punkte aktualisieren die historischen Abschnitte weiter unten:

- In der vollständigen blank.-App ist Website-Upload jetzt standardmäßig aus. Der Benutzer
  aktiviert ihn über „Hochladen erlauben“. Bereits gespeicherte Aktivierung bleibt erhalten.
- Auch die Erfassung für das Rohdatenarchiv hängt dort von dieser Upload-Freigabe ab.
- Ein Fehler beim Archivieren wird als Hinweis gemeldet und bricht den Ranglisten-Abgleich
  nicht mehr ab. Diese Fehlerentkopplung stammt aus dem zusätzlichen Claude-Commit.
- App-Embleme wurden auf 256 Pixel verkleinert, ungefähr 50 KB statt ungefähr 800 KB pro Datei.
  Die Website-Kopien wurden in diesem Commit nicht verändert. Aussagen über unveränderte
  Original-PNGs beschreiben daher den vorherigen Icon-Integrationsstand, nicht diese neuen
  App-Dateigrößen. Die CSS-Behandlung des schwarzen Hintergrunds bleibt davon getrennt.
- Die eigenständige Mini-Collector-App wurde durch diesen Commit nicht auf einen vorgeschalteten
  Freigabedialog umgestellt. Ihre automatische Beteiligung und die blank.-Uploadfreigabe sind
  unterschiedliche Abläufe.
- Die unten aufgeführten vollständigen Tests und der erfolgreiche CI-Run beziehen sich auf
  `72a31cc`, vor diesem zusätzlichen Code-Commit. In der ausführlichen Dokumentationsrunde
  wurden Formatierung und Git-Diff der Notiz geprüft; keine neue vollständige Laufzeitabnahme
  dieses inzwischen erweiterten Codes behaupten.

Diese Ergänzung ist eine Dokumentationsänderung. Sie führt selbst keine neuen Produktfunktionen,
Uploads, Datenbankänderungen oder Icon-Bearbeitungen aus.

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
Rudimentäre Oberfläche mit globalen/persönlichen Zählern; Autostart standardmäßig an,
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

---

## Vollständige Arbeitsübergabe – ausführliche Ergänzung

Diese Ergänzung wurde auf ausdrücklichen Wunsch des Benutzers erneut ausgeschrieben und
mit dem veröffentlichten Quellstand abgeglichen. Sie umfasst den hier belegten Arbeitsverlauf,
einschließlich verworfener Versuche, Einschränkungen und fremder Beiträge. Sie behauptet keine
lückenlose Kenntnis von Arbeiten in anderen Aufgaben. Maßgeblich für implementiertes Verhalten
bleibt der Code; historische Messwerte sind keine aktuellen Produktionszähler.

### A. Ziel, Prioritäten und Benutzerentscheidungen

1. blank. soll langfristig ein eigenes ARAM-Mayhem-Ranking erhalten.
2. Es gibt ungefähr drei blank.-Nutzer. Eine große Nutzerzahl darf keine Voraussetzung der
   Datenbeschaffung sein. Drei ist eine Planungsannahme des Benutzers, keine Telemetriemessung.
3. Erste Priorität war die technische Frage, ob fremde PUUIDs über die lokale LCU zugängliche
   Mayhem-Histories liefern. Anfänglich waren Crawler, MMR und Datenbankumbauten ausdrücklich
   außerhalb des Testauftrags.
4. Erst danach erweiterte der Benutzer den Auftrag auf Archiv, Upload, Website-Zähler und eine
   sehr kleine Collector-App. Diese späteren Änderungen sind vom ursprünglichen isolierten
   Test zu unterscheiden.
5. Rohdaten sollen langfristig erhalten bleiben, damit Formeln und Ranggrenzen später ohne
   erneutes Sammeln geändert werden können. Ressourcenverbrauch soll gering bleiben.
6. Die bestehende Website soll weiterverwendet werden. Mit „Map“ meinte der Benutzer diese
   Website, keine Spielkarte oder neue geografische Ansicht.
7. Die Collector-Oberfläche wurde ausdrücklich vereinfacht: starten, automatisch beitragen,
   Gesamtzahlen und eigene Beiträge anzeigen, Windows-Autostart standardmäßig aktiv und
   abschaltbar. Keine Codeeingabe und kein vorgeschalteter Einwilligungsdialog im gewünschten
   Ablauf. Das ist eine Produktentscheidung, keine Aussage über rechtliche Anforderungen.
8. Externe Sicherungen wurden vom Benutzer zunächst nach hinten geschoben. Das ist kein
   Verzicht auf Sicherungen und keine Garantie für unbegrenzte Aufbewahrung.
9. Arbeiten müssen leicht rücknehmbar sein und mit Claude zusammenpassen. Größere nächste
   Schritte einzeln besprechen; bestehende Benutzeränderungen nicht überschreiben.
10. Die Rank-Assets umfassen zehn Zeichen. Die Zahl der Grafiken ist von der Anzahl aktiver
    Ladder-Stufen und den möglichen Einzelspielnoten zu unterscheiden.

### B. LCU-Proof-of-Concept: Vorgehen und Aussagekraft

Die bestehende lokale LCU-Verbindung wurde benutzt. Es wurde kein Riot-API-Schlüssel für
Match-V5 als Ersatz eingebaut. Ausgangspunkt war ein vorhandenes Mayhem-Match. Der eingeloggte
Account wurde von der Auswahl ausgeschlossen; getestet wurde die PUUID eines anderen Teilnehmers.

Der Test bestand aus History-Abfrage, Auswertung der gelieferten Match-IDs, Abruf eines weiteren
Matchdetails und separatem Timeline-Abruf. Die Rohantworten und HTTP-Ergebnisse wurden lokal
protokolliert. Die tatsächlich verwendeten Routen stehen in Abschnitt 1.

Belegte Einzelresultate:

| Prüfung                              | Historisches Ergebnis                                             |
| ------------------------------------ | ----------------------------------------------------------------- |
| Fremde PUUID akzeptiert              | HTTP 200                                                          |
| Mayhem-History                       | 21 Spiele im abgefragten Fenster                                  |
| Fremdes weiteres Match               | Eigener Account nicht enthalten                                   |
| Teilnehmeridentitäten dieses Matches | Zehn PUUIDs, davon acht gegenüber dem damaligen Ausgangspunkt neu |
| Matchdetails                         | Umfangreiche Detailantwort, nicht nur eine Ergebniszeile          |
| Timeline-Stichprobe                  | 20 Frames und 149 Events                                          |

`begIndex=0&endIndex=20` ergab in diesem Test 21 Einträge. Daraus keine allgemeine Seitengröße
oder unbegrenzte History ableiten. Es wurde keine vollständige historische Pagination bewiesen.
Der Test ist in `src-tauri/src/aram_lcu_probe.rs` als ignorierter manueller Test getrennt vom
normalen Testlauf vorhanden. Ein normaler erfolgreicher CI-Lauf führt ihn nicht live aus.

Der anschließende begrenzte Ausbreitungstest war eine Messung, kein dauerhaft laufender Crawler:

- Neun fremde Histories ergaben zusammen 110 eindeutige Mayhem-Match-IDs.
- Gegenüber dem damaligen Bestand von 54 IDs waren 71 neu. Die Zahlen beschreiben verschiedene
  Mengen; 110 ist weder die Zahl heruntergeladener Detailantworten noch der gesamte Altbestand.
- Von den neuen IDs wurden absichtlich nur 50 Matchdetails geladen.
- Diese enthielten 500 Teilnehmer-Einträge und 415 eindeutige Spieler, davon 406 neu.
- Der eigene Account war in diesen 50 Matches nicht enthalten.
- Insgesamt 60 GET-Anfragen, alle HTTP 200, etwa 129,8 Sekunden mit zweisekündigen Pausen.
- Keine automatische Rekursion, kein Dauerdienst, keine Lastgrenzenbestimmung.

Damit ist die Kette fremde PUUID → History → weitere Mayhem-Matches → weitere PUUIDs in der
Stichprobe nachgewiesen. Neue eigene Spiele waren dafür nicht erforderlich. Nicht nachgewiesen
sind weltweite Abdeckung, garantierte Abfragbarkeit jedes Accounts, beliebig alte Spiele,
serverübergreifende Reichweite, dauerhafte Stabilität oder ein bestimmtes zulässiges Abfragetempo.
Ein eingeloggter League Client bleibt Voraussetzung dieses lokalen Zugangs.

Lokale Belege im Arbeitsordner: `outputs/lcu-probe/Ergebnis.md`,
`outputs/lcu-probe/run-1/06-foreign-extra-details.json`, `outputs/spread-test/Ergebnis.md`.
Diese privaten Rohdaten sind absichtlich nicht in GitHub. Ihre Abwesenheit im Repository ist
kein fehlgeschlagener Export. Zugangsdaten, Freundeslisten und Roh-PUUID-Sammlungen nicht nachtragen.

### C. Welche Daten vorhanden sind – und welche nicht

Ein vollständiges Detail-Match ist die Sammel-Einheit, nicht ausschließlich die Zeile des
blank.-Nutzers. Ein Spiel kann daher zehn Teilnehmerdatensätze liefern. Bei wiederkehrenden
Spielern entstehen nicht jedes Mal zehn neue eindeutige Spieler.

Die geprüften Rohantworten enthalten unter anderem:

- Match-ID, Plattform, Queue, Erstellungszeit, Dauer und Spielversion.
- Teilnehmerzuordnung und PUUIDs; weitere Identitätsfelder bleiben erhalten, soweit geliefert.
- Team, Champion, Sieg/Niederlage und Summoner-Spells.
- Kills, Deaths, Assists, Multikills und weitere vom Client gelieferte Kampffelder.
- Gold, Items in den Slots 0 bis 6, Runen-/Perk-Felder und Augment-Felder 1 bis 6.
- Schadenswerte einschließlich Typen, eingehendem und gemindertem Schaden.
- Heilung, Crowd-Control, Überlebens-/Zeitwerte, Objectives und Ward-Felder, soweit geliefert.
- Unbekannte zusätzliche Felder der Originalantwort, weil die Rohantwort aufbewahrt wird.

Ein überprüftes `stats`-Objekt enthielt 118 Felder. Das ist eine Stichprobenzählung und keine
Garantie, dass jede Patch-Version dieselben 118 sinnvoll befüllten Werte liefert. Vorhandene
Nullen bedeuten nicht automatisch, dass die jeweilige Wirkung im Spiel nicht stattgefunden hat.
Ein ausdrückliches Schild-Feld wurde nicht nachgewiesen. `totalHeal` darf nicht als belegte
Verbündetenheilung interpretiert werden. Die automatische Sammlung lädt keine Timelines nach.
Die Timeline-Stichprobe ist vom normalen Matcharchiv zu unterscheiden.

### D. Speichermodell und spätere Neuberechnung

Es gibt zwei getrennte Datenpfade:

1. Bestehende reduzierte Spiel-/Rating-Daten für Website-Ranglisten.
2. Neues additives Archiv für Original-Matchdetails und gegebenenfalls gesonderte Timelines.

Das Archiv benutzt R2 für gzip-komprimierte Rohantworten und D1 für den kleinen durchsuchbaren
Index. Die Rohantwort wird nicht auf die heutige MMR-Formel zugeschnitten. Das ermöglicht spätere
Auswertung aus den ursprünglichen Daten; es erzeugt keine nachträglich fehlenden Statistiken.

Archivtabellen in `apps/mayhem-site/db/schema.ts`:

| Tabelle                | Zweck                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `archive_matches`      | Ein Match pro Plattform/ID, Zeit, Queue, Version, kanonische Detail-/Timeline-Hashes |
| `archive_players`      | Eindeutige PUUIDs mit interner numerischer ID                                        |
| `archive_participants` | Teilnehmer, Team und Champion je Match; Index für Spieler → Matches                  |
| `archive_revisions`    | Rohdatenvarianten mit Hash, Objektpfad, Größen, Zeit, Quelle und Versionen           |
| `archive_collectors`   | Installationszugänge, Token-Hashes, Widerruf und Tageskontingent                     |

Match-Schlüssel folgen dem Muster `EUW1_<gameId>`. Objekte liegen nach dem Muster
`matches/<matchKey>/<details|timeline>/<sha256>.json.gz` im Bucket. Die SHA-256-Prüfung bezieht
sich auf die Rohbytes. Identische Wiederholungen erzeugen keine zusätzlichen Unique-Matches.
Abweichende Antworten zu derselben ID werden als Revision erhalten und als Konflikt ausgewiesen;
die erste kanonische Variante wird nicht still durch eine beliebige spätere ersetzt.

Der Upload überprüft vorhandene Objekte und kann ein fehlendes Objekt bei einer Wiederholung
wiederherstellen. Upload-Bestätigungen enthalten Match-Schlüssel, Art und Hash. Ein beliebiges
HTTP 200 reicht lokal nicht aus, um eine Datei als sicher archiviert zu verbuchen.

R2 und D1 sind zwei Speichersysteme. Die implementierte Wiederholung/Reparatur ersetzt keine
externe Sicherungs- und Wiederherstellungsstrategie. „Für immer“ ist das Ziel, keine technisch
abgegebene Garantie. Ein dauerhafter Backup-Zeitplan mit regelmäßig geprüftem Restore ist offen.
Es wurde in diesem Arbeitsschritt keine Löschung historischer Matchdaten vorgenommen.

### E. Archiv-API und Grenzen im veröffentlichten Quellstand

| Route                                      | Funktion / Zugang                                           |
| ------------------------------------------ | ----------------------------------------------------------- |
| `GET /api/archive/stats`                   | Öffentliche Gesamtzahlen                                    |
| `POST /api/archive/enroll`                 | Automatische Registrierung einer Collector-Installation     |
| `POST /api/archive/contribute`             | Upload von Matchdetails mit Collector-Zugang                |
| `GET /api/archive/contributor-status`      | Gültigkeit und Kontingent des eigenen Zugangs               |
| `POST /api/archive/matches`                | Privater Import von Matchdetails                            |
| `POST /api/archive/matches/<key>/timeline` | Privater Timeline-Import zu vorhandenem Match               |
| `GET /api/archive/matches/<key>/details`   | Geschützter Rohdatenexport                                  |
| `GET /api/archive/matches/<key>/timeline`  | Geschützter Timeline-Export                                 |
| `GET /api/archive/manifest`                | Geschützte paginierte Revisionsliste, 100 Einträge je Seite |
| `GET /api/archive/collectors`              | Geschützte Übersicht der Installationen                     |
| `POST /api/archive/collectors/<id>/revoke` | Geschützter Widerruf eines Collector-Zugangs                |

Die Export-Routen können eine konkrete Revision über `sha256` auswählen. Das Manifest enthält
einen Fortsetzungszeiger. Skripte für Import und Export liegen im Website-Projekt unter `scripts/`.
Vor deren Einsatz Argumente und erforderliche Zugangsdaten im Skript prüfen; keine Geheimnisse
in Befehlsausgaben, Screenshots oder dieses Dokument aufnehmen.

Aktuelle Codegrenzen:

- Höchstens 2 MiB Rohdaten pro Archivdatei; Queue 2400 wird validiert.
- blank.-Archiv-Outbox höchstens 256 MiB, Mini-Collector-Warteschlange höchstens 128 MiB.
- Automatische Neuregistrierung: höchstens drei pro IP/Tagesfenster.
- Collector-Upload: Kontingent von 200 Anfragen pro Tag und Installation; das sind Anfragen,
  keine Zusicherung von 200 neu hinzugekommenen Spielen.
- Archivstatistik mit 30 Sekunden öffentlicher Cachezeit.
- Vorhandene allgemeine API hat zusätzlich eine 30-Anfragen-pro-Minute/IP-Regel.
  API-Grenzen sind keine Aussagen über Riot-/LCU-Rate-Limits.

Collector-Tokens werden serverseitig gehasht; öffentliche Collector-Zugänge sind zum Beitragen,
nicht zum beliebigen Lesen aller Rohdaten gedacht. Private Importe/Exporte nutzen einen getrennten
Server-Schlüssel. Eine Installation oder ein Upload-Token beweist keine echte Riot-Identität.
Diese Architektur ist kein Nachweis manipulationssicherer Ranked-Ergebnisse.

### F. Änderungen an blank. und Mini-Collector

In blank. wurden bestehende Matchdetail-Antworten vor ihrer Reduktion zur Archivierung abgegriffen.
Die automatische Archivfunktion selbst fragt keine zusätzlichen fremden Histories ab. Bereits
vollständig reduzierte alte App-Einträge werden nicht automatisch zu vollständigen Rohdaten
zurückverwandelt. Nachträgliches Backfill wäre ein eigener Auftrag.

Wichtige Dateien:

- `src-tauri/src/aram_archive.rs`: lokales Archiv, Outbox, Upload-Bestätigung, Wiederholung.
- `src-tauri/src/aram_website.rs`: bestehende Website-Anbindung und Upload-Zustand.
- `src-tauri/src/aram.rs`: Anschluss an die vorhandene Matchverarbeitung.
- `src-tauri/src/aram_lcu_probe.rs`: isolierter manueller LCU-Test.
- `src-tauri/examples/configure_archive.rs`: Pilot-Zugang über stdin in den Windows-Keyring.
- `src-tauri/src/lib.rs`, `build.rs`, Capabilities und Permissions: Registrierung der Funktionen.
- `src/features/aram/AramWebsite.tsx` und `AramShared.tsx`: Oberfläche/Status der Verbindung.

Die Mini-App liegt getrennt unter `apps/mayhem-collector/` und benutzt Tauri mit einer kleinen
HTML/JavaScript-Oberfläche, ohne eigenen React-/npm-Frontend-Build. Die Oberfläche zeigt global
Matches und Spieler sowie lokal beigetragene Matches und Spieler. Persönliche Beiträge sind
nicht automatisch global neue Matches: dieselbe Partie kann von mehreren Installationen kommen.

Sie prüft den eigenen Account als Teilnehmer und die Mayhem-Queue. Sie ist kein automatisch
rekursiver Fremdspieler-Crawler. Der lokale Sammelzyklus läuft mit 120 Sekunden Abstand;
Gesamtzahlen werden alle 30 Sekunden abgefragt. Einzelne Uploads haben fünf Sekunden Abstand.
Ein Windows-Mutex verhindert parallele Instanzen mit derselben Outbox. Lokale Schreibvorgänge
nutzen temporäre Dateien und anschließendes Umbenennen.

Korrektur gegenüber der ersten kurzen Übergabe: Die finale Mini-Oberfläche besitzt keinen
Pause-Knopf. Ihr sichtbarer Schalter ist „Mit Windows starten“. Schließen verbirgt das Fenster
im Infobereich; das Tray-Menü bietet Öffnen und Beenden. Für einen vollständigen Stopp daher
Beenden verwenden. Die Pausefunktion im blank.-Archiv ist davon zu unterscheiden.

Ein Browser allein ist in diesem Stand kein Ersatz für den lokalen Collector. Es wurde keine
browserbasierte LCU-Brücke gebaut. Ein Reddit-Post wurde nicht veröffentlicht. Eine installierte
EXE darf nicht mit dem Quellcode-Snapshot oder einer neuen signierten GitHub-Release gleichgesetzt
werden. Installer-, Signatur- und Update-Verhalten nicht ohne gesonderte Prüfung versprechen.

### G. Ranking, Supporter-Frage und Claudes bestehender Beitrag

Der Benutzer möchte das System schrittweise festlegen. Die Frage nach fairer Bewertung von
Supportern/Heilern wurde angesprochen. Aus hohen Damage-Zahlen allein lässt sich ihre Leistung
nicht fair ableiten; die tatsächliche Verfügbarkeit von Heilungs-/Schildfeldern ist begrenzt.
Es wurde durch die Archiv-/Icon-Arbeit keine neue, empirisch kalibrierte Rollenbalance bewiesen.

Beim Vorbereiten der Veröffentlichung lag Claudes Commit
`02039dfc6eb8312228209f1caec37d281cbd2436` bereits vor. Er wurde als Basis übernommen und nicht
als eigene Codex-Implementierung ausgegeben. Dazu gehören unter anderem `aramRating.ts`,
`aramPerformance.ts` und `GradeBadge.tsx`.

Im übernommenen Desktop-Code nachlesbar:

- `RATING_VERSION = 2`, fünf Platzierungsspiele, drei Schutzspiele nach relevanten Aufstiegen.
- Einzelspielnote F bis MAYHEM und kontinuierlicher Performance-Wert.
- Internes Rating mit Schätzung und Unsicherheit; nicht als MMR-Zahl in der Oberfläche.
- Sichtbare MP/Divisionen und Anpassung anhand der Abweichung vom erwarteten Rangniveau.
- Der Kommentar und die Formel beschreiben performancebasierte Wertung; Sieg/Niederlage ist
  dort nicht der eigenständige Auslöser der MP-Veränderung wie in gewöhnlichem Elo.
- Aktive Ladder: D, C, B, A, S, SS, SSS, MAYHEM. Der Code ordnet D Iron/Bronze, C Silver,
  B Gold, A Platinum, S Emerald, SS Diamond/Master, SSS Grandmaster und MAYHEM Challenger zu.

Diese Zuordnung unterscheidet sich von der frühen Grafikreferenz mit zehn getrennten klassischen
Rängen. Keine stillschweigende „Korrektur“ daran vornehmen. Zehn Assets, zehn Einzelspielnoten und
acht aktive Ladder-Tiers sind verschiedene Sachverhalte. Änderungen mit dem Benutzer abstimmen.

Die Website arbeitet noch mit ihrem bisherigen Rating-v1-Code. Weder neue MMR-Regeln noch eine
vollständige Rangparität zwischen Desktop und Website wurden durch den Icon-Austausch hergestellt.
Eine gemeinsame Berechnungsquelle, Versionierung und mögliche Neuberechnung sind offene Aufgaben.

### H. Gesamter Icon-Verlauf und endgültiger Zustand

Der Benutzer stellte zunächst eine zehnteilige Rangserie und später originale Mayhem-Augments
als Stilreferenz bereit: unter anderem Dimension Shift, Dashing, Critical Healing, Clown College,
Blade Waltz, Archmage, Apex Inventor, ADAPt, Double Strike und Don't Blink.

Wichtige Korrekturen während der Gestaltung:

1. Erst ein Beispiel, anschließend die gesamte Serie.
2. Größere Nähe zur visuellen Familie der Augments statt generischer Ranked-Wappen.
3. Mehrere Augments als Referenz, nicht dieselbe Schablone für jedes Icon.
4. Unterschiedliche Rahmen/Silhouetten wie bei den Original-Augments.
5. Trotzdem zusammengehörige, gut erkennbare Buchstaben, damit die Rangfolge lesbar bleibt.
6. Kombination der bevorzugten Buchstaben mit den neueren Rahmen.
7. Beim SSS ausschließlich die unerwünschten schwebenden Dreiecke entfernen.
8. Anschließend Integration in App und Website.

Die freigegebene Reihe liegt lokal als Augment-v3 vor. F/E wurden mitgeliefert, auch wenn die
Ladder sie derzeit nicht verwendet. `TierEmblem.tsx` und die Asset-Verzeichnisse wurden angepasst.
Die normalen Icons wurden nicht durch die später verworfenen Freistellungsversuche ersetzt.

Die erste Integration zeigte schwarze Quadrate. Es folgten Versuche echter Freistellung. Bei D
war das vermeintlich transparente Schachbrett in die RGB-Pixel eingebrannt; andere Versuche hatten
Randartefakte. Der Benutzer wies darauf hin. Diese Resultate wurden verworfen.

Endzustand: Originalbilder mit schwarzem Hintergrund und `mix-blend-mode: screen` auf den dunklen
Oberflächen. App-Regel `.rank-emblem` in `src/styles/desktop.css`; Website-Regel in
`apps/mayhem-site/app/rank-icons.css`, importiert von `app/board.tsx`. Das ist eine visuelle
Integration, keine erfolgreiche Alpha-Freistellung. Für helle Hintergründe oder universell
transparente Downloads bleibt eine echte saubere Alpha-Datei offen.

Browserprüfung belegte die Darstellung ohne schwarze Kachel. Die Windows-App wurde gebaut,
installierte EXE und Build per Hash abgeglichen, und der gestartete Prozess antwortete. Eine
erneute native Screenshotprüfung war mangels verfügbarer nativer UI-Steuerung nicht möglich.
Diese Einschränkung nicht nachträglich als bestandene native Sichtprüfung darstellen.

### I. Website-Veröffentlichung und Quellcode-Herkunft

Die bestehende Site wurde unter ihrer bisherigen Projekt-ID aktualisiert:

- Adresse: `https://blank-mayhem.maltevfx.chatgpt.site`
- Projekt: `appgprj_6abe43cac45c819180fa43cf60e293e1`
- Erfolgreiches Icon/CSS-Deployment: Version 5 am 04.10.2026.
- Deployment-ID: `appgdep_6ac212a0956081919d0731608f7619d6`.
- Website-Quellcommit: `5c687818a1d9abe8a1f3129cb895bd4b8da52423`.

Der GitHub-Unterordner `apps/mayhem-site/` ist ein Snapshot aus dem separaten bestehenden Sites-
Checkout, kein Nachweis eines automatischen GitHub-Deployments. 158 verfolgte Quelldateien wurden
übernommen; veröffentlichte Binärdownloads unter `public/downloads` sind ausgenommen. Vor einem
Deployment aus dem Snapshot müssen diese Assets erhalten oder bewusst bereitgestellt werden.
Die vorhandene Projekt-ID beibehalten. Keine zweite Produktions-Site oder neue leere Datenbank
als unbeabsichtigten Ersatz anlegen.

Beim lokalen Sites-Build gab es Windows-Werkzeugprobleme: npm-Shim-Auflösung und GNU-tar-
Behandlung von Laufwerksbuchstaben. Der erfolgreiche Ablauf verwendete den Framework-Runner
direkt mit Node und beim Verpacken Git Bash im PATH sowie `TAR_OPTIONS=--force-local`.
Das sind lokale Build-Hinweise, keine zusätzlichen Produktfunktionen. Deployment-Zugangsdaten
nicht ins Repository schreiben und abgelaufene temporäre Credentials nicht wiederverwenden.

### J. Recherche nach anderen Datenquellen

Dieser Auftrag ist begonnen, aber nicht abgeschlossen. Es wurde kein Scraper, Importer oder
zusätzlicher Hintergrunddienst daraus gebaut.

- OP.GG: Die offizielle Hilfe beschreibt nur eigene, während der Nutzung der verknüpften
  Desktop-App gespeicherte Mayhem-History. Fremde Mayhem-Histories werden dort laut Hilfe nicht
  angeboten. Das erklärt, warum diese Quelle das konkrete Ziel nicht erfüllt.
- MayhemStats: Community-Sammlung über lokale Clients, laut eigener Beschreibung ohne
  Spieler-/Accountidentitäten. Nützlich als Statistikansatz, aber kein nachgewiesener Ersatz
  für PUUID-basierte Spielerhistorien und individuelles Ranking.
- PlayARAM.gg: Kandidat mit Riot-ID-/Regionssuche und beworbenen Mayhem-Histories, allen zehn
  Spielern, Items, Augments, KDA und Schaden. Startseite und Suchformular wurden geöffnet;
  eine konkrete fremde EUW-Profilabfrage wurde angestoßen. Ein zu großer Browserauszug war
  nicht auswertbar. Deshalb bleibt das konkrete Profil samt Datenfeldern unverifiziert.

Nächster begrenzter Rechercheschritt: Ein tatsächliches Mayhem-Match dort öffnen und mit einer
bekannten lokalen Rohantwort vergleichen. Separat dokumentieren: stabile Match-ID, Plattform,
PUUIDs, Zeit, alle zehn Teilnehmer, Augments, Items und genaue Statistikfelder. Sichtbare KDA
oder Schaden allein beweisen keine Gleichwertigkeit mit 118 Rohstatistikfeldern. Zugriff,
Exportmöglichkeit und zulässige Weiterverwendung ebenfalls prüfen, bevor ein Import geplant wird.

Recherchequellen zur erneuten Prüfung:

- `https://playaram.gg/en`
- `https://help.op.gg/hc/en-us/articles/60909599637657-How-to-Check-ARAM-Mayhem-Match-History`
- `https://mayhemstats.com/download/`
- `https://mayhemstats.com/guide/`

### K. GitHub-Veröffentlichung und Tests

Der gemeinsame Quellstand wurde im separaten Worktree vorbereitet, um Claudes Arbeitsbranch
und uncommittete Benutzerarbeit zu erhalten. Veröffentlicht wurde Branch
`codex/mayhem-handoff-2026-10-04`, Commit `72a31cce0e78d8d6e04a48081fb8548c543d64a3`,
als PR Nummer 13. Diese ausführlichere Dokumentation folgt als eigener rücknehmbarer Commit.
PR-Adresse: `https://github.com/maltekruse23-oss/blank/pull/13`.

Enthalten sind App-Ergänzungen, unverändert übernommener Claude-Ranked-Basiscommit, Collector-
Quellcode, Website-Quellcode, freigegebene Icons sowie Übergabe- und Prüfnotizen. Ausgenommen sind
Rohhistories, geheime Tokens, lokale Laufzeitdaten, EXE-Dateien, Build-Caches und private
Arbeitsanweisungen. Die separaten Projekte unter `apps/` werden nicht durch Root-Prettier und
Root-ESLint mitbearbeitet; ihre Prüfungen sind eigenständig.

Verifizierte Prüfungen des Implementierungsstands:

| Bereich                | Ergebnis                                        |
| ---------------------- | ----------------------------------------------- |
| Root-Installation      | Lockfile-basierte Installation erfolgreich      |
| Root-Formatierung/Lint | Erfolgreich                                     |
| Frontend-Build         | Erfolgreich                                     |
| Frontend-Tests         | 94 bestanden in acht Dateien                    |
| Extension-Build        | Erfolgreich                                     |
| Rust-Formatierung      | Erfolgreich                                     |
| App-Rust-Tests         | 69 bestanden, drei ignoriert                    |
| App-Clippy             | Alle Targets, Warnungen als Fehler, erfolgreich |
| Mini-Collector         | Vier Tests und Clippy erfolgreich               |
| Website                | Build und Veröffentlichung erfolgreich          |
| Git-Diff-Prüfung       | Keine Whitespace-Fehler                         |
| GitHub CI              | Jobs web und rust erfolgreich, Run 37205861827  |

Diese Tests beweisen weder vollständige Live-LCU-Verfügbarkeit noch alle nativen GUI-Details.
Die ignorierten Live-Tests sind ausdrücklich nicht als zusätzliche bestandene Live-Abfragen zu
zählen. Der PR wurde in diesem Ablauf nicht mit `main` zusammengeführt. Kein neuer Release-Tag
oder neues versioniertes Gesamt-EXE-Release wurde erzeugt. Der GitHub-Push veröffentlicht
Quellcode; er aktualisiert nicht automatisch jede vorhandene Desktop-Installation.

### L. Rücknahme und lokale Übergabe

Die Ergänzungen liegen auf einem eigenen Branch und sind über Git einzeln nachvollziehbar.
Bei einer Rücknahme niemals ungeprüft `reset --hard` oder das Löschen des gesamten Arbeitsordners
verwenden: dort können neue Claude-/Benutzeränderungen liegen. Änderungen gezielt rücknehmen.

- Icon-Rücknahme: vorherige Assets, Tier-Komponente und CSS zurückbringen; hinzugefügte F/E-
  Assets nur entfernen, wenn sie nicht inzwischen anderweitig verwendet werden.
- Native Rücknahme: gesicherte vorherige EXE bei beendeter App wiederherstellen.
- Website-Rücknahme: auf bekannte vorherige Version zurückgehen; Archivdaten nicht löschen.
- Collector stoppen: im Tray beenden, Autostart bei Bedarf vorher abschalten.
- Archiv stoppen: vorhandene Steuerung verwenden; Outbox und bereits gespeicherte Rohdaten
  erhalten, solange keine ausdrückliche Löschanweisung vorliegt.
- Zugang widerrufen: vorhandene Collector-Verwaltung verwenden, keine Tokens öffentlich teilen.
- Datenbankschema: keine destruktive Rückmigration nur zur Rücknahme von UI-/Icon-Code.

Lokale Sicherung des Icon-Arbeitsschritts: `outputs/rank-icon-integration-2026-10-04/` mit alter
EXE, alten App-/Site-Dateien und `Stand-und-Ruecknahme.md`. Frühere Test-/Archivtätigkeiten haben
zusätzliche lokale Ergebnis- und Rücknahmenotizen. Diese Dokumentation ersetzt keine Sicherung
der tatsächlichen R2-Objekte und D1-Daten.

Diese Datei wird sowohl im veröffentlichten Worktree als auch im bestehenden blank.-Arbeitsrepo
abgelegt. Private absolute Benutzerpfade und lokale Matchdaten bleiben außerhalb der öffentlichen
Übergabe. Der tatsächliche Arbeitsbranch muss vor weiteren Änderungen erneut geprüft werden.

### M. Offene Arbeit – ausdrücklich nicht als erledigt ausgeben

1. PlayARAM-Profil und Datenvollständigkeit anhand eines echten Matches verifizieren.
2. Erst danach entscheiden, ob eine zusätzliche Datenquelle überhaupt Vorteile gegenüber den
   bereits bewiesenen fremden LCU-Histories bringt.
3. Echte Alpha-Freistellung der finalen Icons, falls universell transparente Dateien gewünscht sind.
4. Desktop-Rating-v2 und Website-Rating-v1 fachlich abstimmen; keine stillen Rangänderungen.
5. Support-/Rollenbalance mit tatsächlichen verfügbaren Daten evaluieren.
6. Externe Archiv-Sicherung, Wiederherstellungstest, Speicherüberwachung und Aufbewahrungsbetrieb.
7. Eventueller begrenzter, steuerbarer Backfill/Crawler nur nach separater Abstimmung; derzeit
   keine rekursive Massensammlung implementiert.
8. Vollständige native Collector-/Desktop-Abnahme und eventuell ein versioniertes Release als
   eigener Schritt; PR-Veröffentlichung allein erfüllt das nicht.
9. Reddit-Veröffentlichung und zusätzlicher Vertrieb nur auf ausdrücklichen Auftrag.

Für Claude: Zuerst den aktuellen Branch und diese Unterschiede prüfen. Nichts aus verworfenen
Bildversuchen übernehmen. Rohdaten erhalten. Keine neue Datenquelle, MMR-Änderung, Migration,
Veröffentlichung oder Massenabfrage allein aus dieser Liste als automatisch beauftragt verstehen.
