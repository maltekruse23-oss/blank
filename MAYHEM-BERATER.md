# Mayhem-Berater: Konzept (06.10.2026)

Benutzerwunsch, Hauptargument für den Download: Die App soll mitdenken. Ein Beispiel: Ein Champ
rollt ein Augment, das ihn umwandelt, etwa auf AD. Dann zeigt die App den besten Build für genau
dieses Augment. Sie merkt sich, dass man dieses Augment mit diesem Build spielt. Die nächsten
Angebote (Level 11, 15) rankt sie passend zum Build und zu den bisherigen Augments. Der Benutzer
will Qualität vor Tempo („ichzig ausgeklügelt, lass dir Zeit“). Dieses Dokument legt fest, wie
das gerechnet, geprüft und angezeigt wird, bevor gebaut wird.

## 1. Grundsätze

- **Nur unsere eigenen Rohspiele** (Queue 2400, Archiv und Uploads auf mayhemstats.lol). Es gibt
  keine fremden Zahlen und kein Scraping.
- **Gemessen wird die Note, nicht der Sieg.** Maßstab ist das Perzentil `pct` aus
  `aramPerformance.ts`. Es ist schon je Champion normiert, deshalb ziehen starke Champions keine
  Augments mit hoch. Die Siegquote steht nur daneben.
- **Ehrlich über die Datenlage.** Jede Zahl nennt ihre Spielzahl und ihre Ebene (siehe 4). Gibt
  es zu wenig Spiele, sagt die App das, statt zu raten.
- **Riot-Regeln.** Die App hebt Möglichkeiten hervor und diktiert nichts. Es gibt immer 2–3
  Optionen mit Zahlen und nie „nimm X“. Empfehlungen, die auf Entscheidungen im laufenden Spiel
  reagieren, sind die Grauzone der Richtlinie. Vor einer öffentlichen Version fragen wir im
  Riot-Portal nach (App 887776).
- **Jede Regel wird gegen echte Spiele geprüft (Rückblick-Test, 7).** Was den Test nicht
  besteht, wird nicht gezeigt.

## 2. Datenlage

Jedes archivierte Spiel liefert **zehn Einträge** (`archive_entries`), also alle zehn Spieler
mit Champion, Augments, Items am Ende, Note und Sieg, nicht nur den Hochladenden. Das
verzehnfacht die Stichprobe.

| Was                                  | Vorhanden                                                                            | Grenze                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Augments je Spieler                  | ja, Slot 1–6                                                                         | Dass der Slot der Wahl-Reihenfolge entspricht, ist anzunehmen und muss an Spielen geprüft werden (Augment-Level im Timeline-Test) |
| Items                                | nur Inventar am Spielende                                                            | keine Kauf-Reihenfolge, verkaufte Items fehlen                                                                                    |
| Note `pct`                           | ja, je Spieler                                                                       | ab 8 Minuten, „abwesend“ = F                                                                                                      |
| Angebotene, nicht gewählte Augments  | nein                                                                                 | nur live per Bildschirm (Etappe 2b)                                                                                               |
| Kauf-Reihenfolge, Level beim Augment | nur in Timelines (`/lol-match-history/v1/game-timelines/<id>`, im Probe-Test belegt) | wird heute **nicht** gesammelt, braucht Benutzerentscheidung (9)                                                                  |

## 3. Bausteine

### 3.1 Item-Profil und Archetyp

Jedes fertige Item bekommt aus den Data-Dragon-Werten (`stats`, `tags`) ein Profil über diese
Achsen: AP, AD, Tempo/Krit, On-Hit, Letalität, Leben/Rüstung/MR (Tank), Heilen/Schilde für
andere (Enchanter). Die Achsen ergeben sich aus den Werten, nicht aus einer Liste von Hand,
damit neue Items von selbst passen. Nur Sonderfälle werden von Hand gepflegt, mit Grund wie bei
`USELESS_ITEMS`.

Der **Archetyp eines Spiels** ist die vorherrschende Achse der fertigen Items am Ende, zum
Beispiel „AP“, „AD-Krit“, „AD-Bruiser“, „Tank“, „Enchanter“ oder „On-Hit“. Mischformen bekommen
zwei Achsen. Daraus folgt die **übliche Verteilung je Champion**: P(Archetyp | Champ).

### 3.2 Umwandler-Augments

Ein Augment A wandelt Champ C um, wenn sich mit A die Archetyp-Verteilung deutlich verschiebt:
P(AD | C, A) gegen P(AD | C).

- **Prüfung:** Beta-Binomial-Vergleich mit glaubwürdigem Intervall. Ein Umwandler muss eine
  Verschiebung von mindestens 25 Prozentpunkten haben, und die untere Grenze des
  90-%-Intervalls muss über 10 Prozentpunkten liegen.
- **Wenig Spiele auf C mit A:** Es zählt die Verschiebung von A über alle Champs derselben
  Rolle. Ein Augment, das alle Magier auf AD dreht, dreht auch den seltenen Magier.
- **Ergebnis:** eine Tabelle „A dreht Rolle/Champ von X nach Y“, die die App ohne Handarbeit
  kennt. Auf der Karte steht dann „Umwandler: spielt sich meist als AD (31 Spiele)“.

### 3.3 Leistung mit Rückfall-Ebenen (Teil-Pooling)

Alle Bewertungen sind geschrumpfte Mittelwerte von `pct`. Jede Ebene zieht zur nächst
allgemeineren:

```
Champ + Augments + Kern  →  Champ + Augments + Archetyp  →  Rolle + Augment + Archetyp
  →  Augment allgemein  →  Mittel 0,5
```

Der Schätzer ist `(Summe pct + k · Elternwert) / (n + k)`. Das `k` je Ebene wird nicht geraten,
sondern im Rückblick-Test (7) gewählt. Angezeigt wird immer die genaueste Ebene mit genug
Spielen samt ihrer Zahl, zum Beispiel „aus 14 Spielen mit Alistar + Hexenhut“ oder „aus 212
Spielen mit diesem Augment allgemein“.

### 3.4 Spieler-Bereinigung

Gute Spieler nehmen andere Augments als schwache. Ohne Ausgleich sähe ein Augment gut aus, nur
weil gute Spieler es wählen. Deshalb zählt je Spiel **pct minus übliche Leistung dieses
Spielers**, geschrumpft auf 0 bei wenigen Spielen des Spielers. Die Frage wird damit: „Spielen
Leute mit diesem Augment besser als sonst?“ Der Rückblick-Test entscheidet, ob die Bereinigung
die Vorhersage verbessert. Nur dann bleibt sie.

### 3.5 Synergien

Ein Paar (A, B) bekommt einen Synergie-Wert nur, wenn es oft genug vorkommt:

- **Mindestens 30 Spiele mit dem Paar.**
- **Paarwert:** Leistung mit beiden minus die Summe der Einzeleffekte, stark geschrumpft.

Seltene Paare zählen 0, die Augments wirken dann nur einzeln. Wenn die Daten wachsen, ersetzt
ein kleines Ridge-Modell je Rolle die Tabellen. Es nutzt Augment × Archetyp, Augment-Paare und
Item-Kerne. Es wird auf dem Server gerechnet und als kompakte Tabelle geladen. Das Modell kommt
nur, wenn es im Rückblick-Test die Tabellen schlägt.

### 3.6 Build zum Zustand

Der Zustand ist S = (Champ, gewählte Augments, ggf. schon gekaufte Items).

- **Vorschläge:** die besten 2–3 Kerne aus fertigen Items in Spielen, die zu S passen, mit den
  Rückfall-Ebenen aus 3.3.
- **Harte Regeln:**
  - Mana-Abzug (`MANA_PENALTY`) bleibt.
  - `USELESS_ITEMS` sind nie dabei.
  - Höchstens ein Paar Stiefel.
  - Keine Items aus derselben Gruppe mit einzigartigem Effekt, zum Beispiel zwei
    Letalitäts-Items mit demselben Effekt. Die Gruppen kommen aus Data Dragon, sonst aus einer
    kleinen Liste mit Grund.
- **Umwandler:** Ist das Augment ein Umwandler (3.2), kommen die Kerne aus dem Ziel-Archetyp.
  Das ist das Alistar-mit-AP-Augment-→-Stormsurge-Beispiel.

### 3.7 Angebote ranken

Bei jedem Angebot (Level 11, 15) bekommt jedes Augment X einen Wert: die erwartete Leistung im
Zustand S + X mit dem gemerkten Kern. Daraus folgen drei Anzeigen:

- **Passt zu deinem Build:** X liegt im selben Archetyp wie dein Kern und hat einen guten Wert.
- **Würde umbauen:** X ist ein Umwandler in einen anderen Archetyp. Dann zeigt die App den neuen
  Kern daneben, ehrlich mit dem Hinweis, dass bereits gekaufte Items nicht mehr passen.
- **Unsicher:** zu wenig Spiele. Es gibt nur den allgemeinen Wert, mit Zahl.

## 4. Anzeige

- **Champ-Auswahl (Etappe 1, PR #41):** die besten Augments und Kerne. Dazu kommt: „Umwandler
  für diesen Champ“ mit Ziel-Archetyp.
- **Im Spiel bei einem Angebot (Etappe 2b):** Ein kleines Overlay an den drei Karten zeigt je
  Karte die Note Ø, die Spielzahl und einen der drei Hinweise aus 3.7. Es bleibt ruhig und
  verschwindet nach der Wahl.
- **Nach der Wahl:** Das Build-Feld zeigt 2–3 Kerne für den neuen Zustand. Der gewählte Kern ist
  markiert und wird für das nächste Angebot gemerkt.
- **Welches Augment gewählt wurde:** Anfangs bestätigst du es mit einem Klick auf die Karte im
  Overlay. Später erkennt die App es, wenn das sicher geht. Riot gibt die Wahl nicht über eine
  Schnittstelle heraus.

## 5. Rechnen: Server und App

- Die Website rechnet nach jedem neuen Archiv-Stapel, höchstens stündlich, je Patch eine Tabelle
  pro Champion. Sie enthält Archetyp-Verteilung, Umwandler, Augment-Effekte je Archetyp,
  Synergie-Paare, Kerne je Archetyp und Augment, alle mit Spielzahlen. Abgerufen wird sie über
  `GET /api/advisor/<champ>`, zwischengespeichert wie die anderen Statistiken.
- Die App lädt die Tabelle in der Champ-Auswahl einmal und hält sie für das Spiel im Speicher.
  Im Spiel geht nichts mehr übers Netz, alles läuft offline.
- **Patches:** Neuere Spiele zählen mehr, mit einer Halbwertszeit von zwei Patches. Ein
  Patch-Wechsel macht die Werte nicht schlagartig leer.
- `ADVISOR_VERSION` wie `RATING_VERSION`: Jede Regeländerung bekommt eine neue Version und neue
  Tabellen.

## 6. Live-Erkennung (Etappe 2b)

- **Champion:** wie Etappe 1 aus der Champ-Auswahl, im Spiel aus der Gameflow-Sitzung.
- **Angebot:** Die App nimmt einen Bildschirmausschnitt nur des League-Fensters. Windows' eigene
  Texterkennung (`Windows.Media.Ocr`) liest die drei Kartennamen, dafür kommt keine neue
  Abhängigkeit dazu. Die Namen werden mit der Augment-Liste des Clients abgeglichen
  (unscharfer Vergleich). Ausgelöst wird das nur zu den Levels, an denen ein Angebot kommt. Den
  Level liest die App aus den Live-Spieldaten (`127.0.0.1:2999`, nur lesend), höchstens einmal
  alle 2 s und nur während eines Mayhem-Spiels.
- **Grenzen:** Das geht nur im rahmenlosen oder im Fenster-Modus. Andere Client-Sprachen
  funktionieren über die Namen in der Sprache des Clients.
- **Neue Ausnahmen in den App-Regeln (CLAUDE.md):**
  - Bildschirmausschnitt nur des League-Fensters.
  - Overlay-Fenster über dem Spiel.
  - Live-Abfrage nur während eines Mayhem-Spiels.

  Alles ist abschaltbar, und es wird nie etwas ins Spiel eingegeben oder aus dem Speicher
  gelesen.

## 7. Rückblick-Test (Pflicht vor jeder Anzeige)

- **Test:** `node server/tools/advisor-backtest.ts` trainiert auf den Spielen bis zu einem
  Stichtag und sagt für die Spiele danach die Note voraus. Er prüft:
  - Liegt der vorgeschlagene Kern/das Augment mit höherem Wert wirklich höher?
  - Gemessen wird mit der Spearman-Korrelation und der Note der Top-Wahl gegen den Durchschnitt.
  - Grundlinie ist die heutige Champ-Karte (Etappe 1).
- **Kalibrierung:** Ein angezeigtes „Note Ø A“ muss im Mittel auch etwa A bringen.
- **Wahl der Parameter:** Die `k`-Werte, die Spieler-Bereinigung, die Synergie-Schwelle und
  später das Ridge-Modell gewinnen nur, wenn sie den Test schlagen.
- **Ablage:** Ergebnisse kommen in VALIDATION.md.

## 8. Etappen

| Etappe | Inhalt                                                                                                                    | braucht                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 2a     | Item-Profile, Archetypen, Umwandler, Kerne je Augment, Rückblick-Test; Champ-Karte zeigt „Umwandler“ und Kerne je Augment | nichts Neues             |
| 2b     | Angebote im Spiel per Bildschirm + Overlay, Wahl per Klick                                                                | Regel-Ausnahmen (6)      |
| 3      | Angebote nach Zustand ranken, Synergien, Build-Feld nach jeder Wahl                                                       | 2a + 2b                  |
| 4      | Ridge-Modell, wenn die Daten reichen und der Test es zeigt                                                                | Datenmenge               |
| (opt.) | Timelines sammeln: Kauf-Reihenfolge, Level je Augment → „erst X, dann Y“                                                  | Benutzerentscheidung (9) |

## 9. Offene Entscheidungen des Benutzers

1. **Timelines mitsammeln.** Pro eigenem Spiel kommt eine Anfrage mehr an den Client, und die
   Uploads werden größer. Dafür gibt es echte Build-Pfade („nach Hexenhut zuerst Stormsurge“)
   und eine Prüfung der Augment-Reihenfolge. Ohne Timelines gibt es nur Kerne aus dem
   End-Inventar.
2. **Overlay im Spiel trotz Riot-Grauzone.** Ein privater Test unter Freunden ist gering
   riskant. Für eine öffentliche Version fragen wir vorher Riot.
