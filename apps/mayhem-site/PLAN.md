# blank. Mayhem – Plan für die neue Website (04.10.2026)

**Entscheidungen des Benutzers (04.10.2026):** Ränge sofort öffentlich (Riot-Risiko bekannt und
bewusst in Kauf genommen; kein Schalter, keine Gruppen-Sperre). Alle zehn Spieler eines Spiels
mit Riot-ID und eigenem Profil (wie op.gg). Daraus folgt: Datenschutzseite nennt das deutlich,
jede Person kann ihre Daten entfernen lassen (Weg auf der Seite). Etappe 1 und 2 sind umgesetzt (Rangliste und Profil; Startseite folgt in Etappe 4, bis dahin ist / die Rangliste). Etappe 3 steht: Spiel-Seite `/spiel/<id>`, Rekorde `/rekorde` und Champions `/champions` mit `/champions/<name>`.

Ziel: Die Website zum ARAM-Mayhem-Rangsystem und zu den Rekorden wird neu gebaut. Sie soll
öffentlich und durchdacht sein und sich gut lesen. Der Plan stützt sich auf eine Prüfung des
heutigen Codes und auf Ideen von op.gg, u.gg, League of Graphs, Mobalytics, dpm.lol, tracker.gg
und aram.zone. Übernommen werden nur Ideen, keine Assets.

## 0. Was vor dem Bau geklärt werden muss

1. **Riot-Richtlinie (größtes Risiko).** Riot schreibt: „Products cannot create alternatives for
   official skill ranking systems such as the ranked ladder. Prohibited alternatives include MMR
   or ELO calculators.“ (developer.riotgames.com/policies/general). Eine öffentliche Rangliste mit
   Stufen fällt sehr wahrscheinlich darunter. Noten pro Spiel und Rekorde wirken weniger
   riskant, ähnlich dem OP Score von op.gg. Das ist eine Einschätzung, keine Freigabe.
   **Vorschlag:** Riot fragen (Anfrage im Developer Portal). Bis zur Antwort sind Noten,
   Rekorde und Statistiken öffentlich. Der Rang ist nur für Gruppenmitglieder zu sehen, nach
   Anmeldung mit dem eigenen Schlüssel. Ein Schalter `PUBLIC_RANKS` gibt ihn später frei, ohne
   dass etwas umgebaut werden muss.
2. **Wer erscheint.** Ein Profil bekommt nur, wer selbst hochlädt, also wer in blank. „Hochladen
   erlauben“ geklickt hat oder den Collector nutzt. Die anderen neun Spieler eines Spiels
   erscheinen nur als Champion mit Werten und Note, ohne Riot-ID und ohne Link. Grund:
   Datenschutz und Riots Regel „keine Spieler de-anonymisieren“.
3. **Pflichtangaben.**
   - Riot-Hinweis („isn't endorsed by Riot Games …“, Legal Jibber Jabber) sichtbar in der
     Fußzeile.
   - Datenschutzseite um Archiv und Collector ergänzen.
   - Ein Impressum ist für eine öffentliche Seite in Deutschland meist Pflicht. Ob das hier gilt,
     entscheidet der Betreiber.
4. **Icons.** Die heutigen zehn Wappen (F–MAYHEM) werden **Noten-Icons** für die Note pro
   Spiel und für „Leistung Ø“. Für die Ränge (D, C, B, A, S, SS, SSS, MAYHEM) liefert der
   Benutzer neue Icons. Bis dahin zeigt die Seite ein neutrales Schrift-Abzeichen in der Farbe
   der Stufe. Alle Icons kommen in 256 px und wenigen KB, mit echtem Alpha, wenn verfügbar.

## 1. Eine Rechenquelle (Voraussetzung)

- Die Website bekommt eine **Kopie** des Rechenkerns aus `src/features/aram/` (sie wird aus ihrem eigenen Ordner veröffentlicht), erzeugt mit `node server/tools/sync-site-core.mjs`; `src/features/aram/siteCore.test.ts` schlägt fehl, sobald die Kopie abweicht:
  `aramRating.ts`, `aramPerformance.ts`, `aramBase.ts`. Die veraltete Kopie (Rating v1, `aramBias.ts`)
  fällt weg. Damit rechnen App und Website mit genau demselben Code, Version 3.
- Neue Saison-Zeile `v3`. Alle vorhandenen Spiele werden mit v3 neu gerechnet. Es wird nichts
  gelöscht, auch die alte Saison `v1` bleibt lesbar.
- (Verschoben nach Etappe 5, bei ~3 Nutzern unnötig:) Ergebnisse zwischenspeichern. Nach jedem Upload oder Neustart einer Gruppe rechnet die
  Seite die Stände einmal und legt sie als JSON in eine Tabelle `snapshots`
  (Version, Saison, Gruppe). Bisher wird bei jedem Aufruf alles neu gerechnet.
- Ein Vergleichstest stellt sicher, dass App und Website für dieselben Spiele denselben Rang,
  dieselben MP und dieselbe Note liefern.

## 2. Seiten

Navigation: **Rangliste · Rekorde · Champions · So funktioniert's**, dazu eine Suche (Riot-ID).
Die Fußzeile verlinkt Datenschutz, API, GitHub und den Riot-Hinweis. Alle Adressen sind fest
und teilbar.

### Start `/`
- Große Suche nach Riot-ID. Daneben Kopfzahlen: Spiele gesamt, Spieler, MAYHEM-Noten diese
  Saison.
- Top 10 der Rangliste kompakt. Solange Ränge nicht öffentlich sind, stehen dort die Top 10
  nach „Leistung Ø“.
- „Spiele des Tages“: die drei besten Noten der letzten 24 h, mit Splash, Champion und Note.
- Neue Rekorde der Woche als Karten.
- Verteilung der Noten als Histogramm (F bis MAYHEM). Es zeigt, wie selten SSS und MAYHEM sind.

### Rangliste `/rangliste` (Filter: Saison, Gruppe, Stufe)
- Über der Tabelle Apex-Karten wie bei op.gg: Mindest-MP für MAYHEM und SSS und die Zahl der
  Spieler dort.
- Tabelle: Platz, Spieler mit Profilsymbol, Rang-Abzeichen mit MP, Leistung Ø als Noten-Icon,
  Spiele, Siege/Niederlagen als Balken (nur als Info, sie zählen nicht), meistgespielte
  Champions und die Form der letzten 6 Noten als Chips.
- Rangverteilung als Histogramm über alle Stufen, mit „Top X %“ ab 10 Eingestuften.
- Reiter **Leistung**: dieselbe Tabelle, sortiert nach Leistung Ø. Sie ist immer öffentlich.

### Profil `/spieler/<riot-id>` (Reiter)
- **Kopf:** Profilsymbol, Riot-ID, Rang-Karte mit Wappen, MP-Balken und Kletter-Hinweis, Leistung
  Ø groß, Siege/Niederlagen und die Saison-Wahl. Frühere Saisons als Reihe von Wappen.
- **Übersicht:**
  - MP-Verlauf der Saison als Linie mit Markierungen für Aufstieg und Abstieg.
  - Leistung Ø als Sparkline.
  - **Leistungs-Radar** mit den fünf Achsen der Note (Schaden, Einstecken, Heilen/Schilde,
    Kill-Beteiligung, Überleben). Jede Achse ist der Abstand zum Champion-Schnitt und erklärt,
    woher die Note kommt. Die Idee stammt von Mobalytics GPI, umgesetzt mit unseren echten Achsen.
  - **Spielstil-Abzeichen** aus echten Anteilen, z. B. „Frontliner“, „Heiler“, „Glaskanone“,
    „Überlebenskünstler“. Sie folgen festen Regeln und sind per Test geprüft. Sie werten nicht.
  - Notenserie und Form („3 × S oder besser in Folge“).
- **Matchverlauf:**
  - Jede Zeile zeigt Note-Icon, MP-Änderung, Champion, Augments, K/D/A, Schaden/Min, Dauer und
    Datum.
  - Aufklappen zeigt alle zehn Spieler mit ihren Noten und Balken für Schaden, Einstecken und
    Heilen.
  - Ein **MVP-Abzeichen** markiert die beste Note der Lobby, egal ob Sieg oder Niederlage.
- **Champions:** Tabelle mit Spielen, Ø Note, Ø Schaden/Min, KDA und bestem Spiel je Champion.
- **Rekorde:** die eigenen Bestwerte je Kategorie mit Link zum Spiel.
- **Gruppen:** Mitgliedschaften und „Gemeinsam gespielt“ (Spiele zusammen, Ø Note zusammen).

### Spiel `/spiel/<id>`
- Kopf: Dauer, Datum, Patch, Ergebnis je Team.
- Zwei Teams zu je fünf: Champion, Name (nur bei registrierten Spielern), Note-Icon, MVP, K/D/A,
  Items und Augments mit Symbol.
- Vergleichsbalken für alle zehn: Schaden, Einstecken, Heilen, Gold.
- Erklärung der eigenen Note: die fünf Achsen gegen den Champion-Schnitt.

### Rekorde `/rekorde` (Filter: Saison, Gruppe, alle Zeiten)
- Eine Karte je Kategorie in der Farbe ihrer Art. Die Kategorien kommen aus der App
  (`recordCategories`): Höchster Schaden, Schaden/Min, Pentakills, AP, AD, Meiste Kills, Größter
  Tank, Heilung, Abgewehrt, Krit, CC und weitere.
- Platz 1 groß mit Splash und Link zum Spiel, darunter die Plätze 2–10.
- „Neu diese Woche“ ist hervorgehoben.

### Champions `/champions` und `/champions/<name>`
- Tabelle: Spiele, Ø Note, Anteil MAYHEM/SSS, Ø Schaden/Min, Rolle. Sortierbar.
- Champion-Seite:
  - Bestenliste der Spieler auf diesem Champion.
  - Augments mit Ø Note: gezeigt wird Ø Note statt Siegquote, weil der Sieg bei uns nicht
    zählt.
  - Beste Spiele.
- Bei wenigen Spielen steht deutlich „wenige Daten“. Unter 5 Spielen werden keine Werte als
  Tierliste gezeigt.

### Gruppe `/gruppe/<code>`
- Interne Rangliste.
- **Duell:** zwei Spieler nebeneinander mit Radar, Rekorden und gemeinsamen Spielen.
- Die Spielabende der Gruppe als Sitzungsbericht: Spiele, MP-Bilanz, beste Note.

### So funktioniert's `/wertung`
- Die Note: was zählt, warum der Sieg egal ist und wie Supporter fair bewertet werden.
- Der Rang: Einstufung nach 5 Spielen, Stufen und ihre Seltenheit, MP, ±30 je Spiel,
  Saisons.
- Was nie gezeigt wird: die versteckte Wertung.
- Häufige Fragen, z. B. „Warum verliere ich trotz Sieg MP?“

## 3. Gestaltung

- **Farben:**
  - Dunkel, im Stil von blank.: fast schwarzes Grün, ruhige Karten, grüner Akzent.
  - Jede Note und jede Stufe hat ihre eigene Farbe.
  - Kategorien-Farbtöne wie in der App (`--game-fire/magic/physical/gold/guard`).
  - Alle Farben als Tokens.
- **Schrift:** Inter für Text, Zahlen tabellarisch. Eine markante Display-Schrift nur für die
  Noten und Ränge.
- **Ein Raster für alle Seiten:**
  - Desktop: breite Inhalte mit Seitenleiste.
  - Handy: eine Spalte, Tabellen werden zu Karten.
  - 16 px Rand, nie seitliches Scrollen.
- **Bewegung:** sparsam. Zahlen zählen beim ersten Anzeigen hoch, Balken wachsen.
  `prefers-reduced-motion` wird beachtet.
- **Barrierefreiheit:**
  - Tastatur, Fokusrahmen, echte Tabellen, Alternativtexte.
  - Farbe ist nie die einzige Information: Note und Stufe stehen immer auch als Text da.
- **Leerzustände und Fehlerzustände** sind ausdrücklich gestaltet. Fehlende Werte erscheinen
  als „–“, nie als 0.
- **Bilder:**
  - Champions, Items und Profilsymbole nur von Data Dragon.
  - Augment-Symbole aus den hochgeladenen Daten.
  - Keine Riot-Logos.

## 4. Technik

- Bleibt bei vinext auf Cloudflare (D1, R2) unter der bestehenden Projekt-ID. Keine neue Site,
  keine neue Datenbank.
- **Seitenaufbau:**
  - Seiten werden auf dem Server mit Daten gerendert. Das ist schneller, teilbar und
    suchmaschinenfreundlich.
  - Nur interaktive Teile laufen im Client, etwa Filter, Aufklappen und der Live-Strom.
- **Neue Lese-Endpunkte:** `/api/spiel/<id>`, `/api/rekorde`, `/api/champions`,
  `/api/verteilung`. Alle bedienen sich aus `snapshots`.
- **Live-Strom:** Er bleibt, fragt aber seltener die Datenbank ab (5 s statt 2 s).
- **Aufräumen:**
  - Ungenutzte Komponenten (shadcn, Connector-Beispiele) entfernen.
  - Minifizierte Einzeilen-Dateien sauber neu schreiben.
  - Paketname ändern.
- **Tests:**
  - Unit-Tests für Rekorde, Abzeichen, Snapshot und Datenschutz-Filter (fremde Spieler ohne
    Namen).
  - Vergleichstest App ↔ Website.
  - Rauchtest aller Seiten mit leerer und voller Datenbank.
- **Sicherheit:**
  - `/api/export` und `/api/games` geben keine PUUIDs von Nicht-Registrierten mehr heraus.
  - Gruppen anlegen nur mit Spieler-Schlüssel.
  - Rate-Limit nur für Schreibzugriffe.
- **Unverändert bleiben** die Upload-API für blank. und Collector und das Rohdatenarchiv.

## 5. Etappen (jede einzeln zurücknehmbar, je ein Pull Request)

1. Gemeinsamer Rechenkern v3, `snapshots`, Vergleichstest, Datenschutz-Filter. Am Aussehen ändert
   sich nichts.
2. Gestaltungssystem und Grundgerüst (Layout, Navigation, Fußzeile mit Riot-Hinweis), dann
   Rangliste und Profil.
3. Spiel-Detail, Rekorde, Champions.
4. Gruppe mit Duell, „So funktioniert's“, Startseite, Leerzustände, Handy.
5. Feinschliff: Leistung, Barrierefreiheit, Tests. Danach Übergabe an Codex zum Veröffentlichen
   (mit `public/downloads`).
6. Die App zeigt Ränge von der Website (eine Wahrheit für alle). Dann Release 0.9.2.

Was der Benutzer liefern oder entscheiden muss: die neuen Rang-Icons (8 Stück), die Freigabe
der Riot-Anfrage, das Impressum ja/nein und das Veröffentlichen (über Codex).
