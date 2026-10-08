# Mayhem-Design

## Design „Arena“ (gewählt 07.10.2026, gebaut für App und Website)

Benutzerwahl nach drei Entwurfsrunden im Artifact „mayhemstats Design 2“ (Seite „Mix D × E“), mit Blitz
als Anregung für Aufbau und Anordnung (keine Logos oder Bilder von Blitz übernommen). Vorlage für alle
Seiten und die Mayhem-App ist die Spielerseite mit Matchverlauf („G · Spielerseite mit Matchverlauf“).
Verbindlich für die Mayhem-App und mayhemstats.lol; ersetzt seit 08.10.2026 „Tribüne“ (unten nur noch
als Geschichte).

- **Grund:** dunkles Graublau `#0e0f14`, oben ein warmer Schein (`radial-gradient` nach `#2a2216`),
  Karten `#13151c` mit Linie `#222631`, Rundung 16 px (Zeilen 12–14 px), Text `#eef0f6`, leise
  `#9aa1b5`, sehr leise `#6f768a`.
- **Akzent:** Gold `#f2c14e` (Logo-Hälfte „stats“, aktiver Reiter, Knopf „Join“, Stufe S).
  Platzierungen Gold, Silber `#c9d1d9`, Bronze `#c98a5b`. Augment-Seltenheit: Prisma einfarbig Eisblau
  `#6fd6ff`, Gold, Silber. **Kein Regenbogen- oder Prisma-Verlauf** (Benutzer: „komische
  Regenbogenfarbe muss weg“). Sieg `#7ee0a1`, Niederlage `#ff8070`.
- **Schrift:** Titel Unbounded (600/800), Text Hanken Grotesk (400/500/700), Zahlen Geist Mono; alle
  OFL, selbst hosten wie bisher.
- **Bausteine:** Zeilen wie im Matchverlauf (farbiger Rand links 4 px, Tönung von links nach rechts
  auslaufend, Bild links, Werte in der Mitte, Note bzw. Stufe rechts); Tags als Pillen (gold für den
  seltensten); Reiter mit Goldstrich; Rang-Karte mit Wappen und MP-Balken; Augment-Karten mit rundem
  Symbol, Stufen-Schild oben rechts und farbig hervorgehobenen Stichwörtern; Server-Kürzel als kleines
  Kästchen; Wappen groß; Noten als dicke Buchstaben in ihrer Farbe (`--grade-*`, Unbounded 800; SSS
  und MAYHEM kleiner, damit sie in dasselbe Feld passen – Benutzerwunsch 08.10.2026, keine
  Noten-Bilder mehr), in App (`GradeMark` in `src/mayhem/ui.tsx`) und Website (`GradeMark` in
  `app/ui/bits.tsx`).
- **Bilder:** Champion-Icons, Splash-Arts, Items und Profilsymbole von Data Dragon, Wappen aus
  `public/ranks`. Logo der Mayhem-App und der Website: das goldene „m“ auf dunkler Kachel
  (`src-tauri/icons/mayhem.svg`, eigene Zeichnung; App-Icon `mayhem.ico`, Website `public/favicon.svg`).

- **Glow** (Benutzerwahl nach Pinterest-Vorlagen): dunkle Kacheln, Licht scheint verschwommen von
  unten herein (`::before` mit `radial-gradient` und `blur`), je Kachel nur eine Farbfamilie: Prisma
  eisblau, Gold amber, Silber weißlich, Sieg grün. Zeilen leuchten links leicht in ihrer Farbe.
- **Liquid Glass** (Benutzerwunsch „diesen liquid Effekt“): halbdurchsichtige Flächen mit
  `backdrop-filter: blur(18–22px) saturate(140%)`, heller Oberkante (`inset 0 1px 0`), unten leicht
  milchig; sparsam: Kopfzeile, Champion bzw. Rang-Karte, große Ergebnis-Karten, nicht jede Zeile.
- **Bewegung** (Benutzer: „alles sehr smooth“): nur `cubic-bezier(.22,1,.36,1)` (weich auslaufen, kein
  Federn, kein Blitz), Hereingleiten aus leichter Unschärfe, gestaffelt; Aufstieg mit aufblühendem
  Licht, das alte Wappen löst sich auf, das neue tritt hervor. Alles einmal je Anlass; reduzierte
  Bewegung zeigt sofort den Endstand. Vorlage: `G · Glow, Liquid Glass und weiche Bewegung`.
- **Vorlagen:** `design/arena-design.html` (eigenständige Seite mit allen Tokens, Glow-Kachel, Liquid Glass, Zeilen, Bewegung und Aufstieg; im Browser öffnen) und die Entwürfe im Artifact „mayhemstats Design 2“ auf claude.ai (privat, nur dort).
- **Stand:** Die Mayhem-App ist umgebaut (`src/mayhem/mayhem.css`, 07.10.2026). Schriften liegen in
  `src/mayhem/fonts` (`unbounded-latin.woff2`, `hankengrotesk-latin.woff2`,
  `geistmono-latin.woff2`, je mit OFL-Text). Die Website ist seit 08.10.2026 ebenfalls umgebaut
  (`apps/mayhem-site/app/globals.css`, Schriften als Kopie in `apps/mayhem-site/public/fonts`).

### Arena auf der Website (08.10.2026)

- **Tokens:** wie die App (`--bg #07080b`, `--surface`, `--panel #0f1117`, `--panel-2`, `--line`,
  `--accent #f2c14e`, `--silver`, `--bronze #d99a66`, `--prisma`, `--up`, `--down`, Noten `--grade-*`,
  Stufen `--tier-*`). Abweichung: `--faint` ist `#858ca1` statt `#6f768a`, weil kleiner Text sonst unter
  4,5 : 1 fällt (axe). Noten und Stufen als Text werden mit Weiß aufgehellt
  (`color-mix(… 65–70 %, #fff)`), damit auch F und D lesbar bleiben.
- **Breite:** Seite bis 1600 px, Listen als Raster (`.rows.grid`, Rangliste `.rows.grid-wide`), ab 1800 px
  `zoom` 1,1, ab 2300 px 1,25 (wie die App). Auf dem Handy ist die Kopfzeile nicht klebend (zwei Zeilen
  Navigation plus Suche), das Podest steht als drei kleine Kacheln nebeneinander.
- **Bausteine (`app/ui/bits.tsx`, `app/ui/meta.tsx`):** `More` (zuerst 5 Zeilen bzw. 12 Karten, Rest hinter
  „Show n more“, lange Listen in Schritten; ein einziger Knopf, der zu „Show less“ wird, damit der
  Tastaturfokus bleibt), `Top` (goldene Marke am Besten), `Podium` (Platz 1–3 als
  Glow-Kacheln Gold/Silber/Bronze), `RankCell` (Wappen, Rang, Punktebalken, „72 points“), `MetaRow`/
  `WinValue` (Siegquote groß, Spiele klein, Rest im Tooltip), `Answer` (die Antwort im Kopf: Siegquote
  und Spiele), `SectionTabs` (Reiter statt langer Seite, Anker wie `/scoring#rank` öffnen den Reiter).
  Siegquoten stehen neutral in `--text`; Grün `--up` heißt nur „Sieg“, hervorgehoben wird das Beste
  über `Top`/Gold.
- **Ausnahmen von „zuerst 5“:** Rangliste und Startseite zeigen nach dem Podest die Plätze 4 bis 10
  (zusammen die Top 10), der Reiter „Matches“ im Profil zuerst 10 Spiele (die Übersicht daneben zeigt
  schon die letzten 5).
  Zeilen: `.row` mit Schein links (`--row`), Matchverlauf mit 4-px-Rand in Sieg/Niederlage und Tönung;
  Köpfe über Splash-Arts als dunkleres Glas (`.hero-glass`), damit Text auf hellen Bildern lesbar bleibt.
- **Wörter:** „points“ statt „MP“ auf allen Seiten (die API behält ihre Felder).
- **Bewegung:** `.in` gleitet einmal weich herein (`--i` staffelt, höchstens 10 Schritte), Balken wachsen
  einmal; `animation-fill-mode: backwards`, damit Hover-Bewegungen danach wirken. Reduzierte Bewegung
  schaltet alles ab. Nichts läuft dauerhaft.

## Abgelöst: „Tribüne“ (06.10. bis 08.10.2026)

Verbindliche Gestaltung für alles rund um ARAM: Mayhem: die Seite `apps/mayhem-site` (mayhemstats.lol)
und die geplante Mayhem-App neben blank. Die blank.-App selbst behält ihr Design „Klassisch“ (siehe
CLAUDE.md); dieses Dokument gilt nur für Mayhem.

Entstanden am 06.10.2026: „Augment-Wahl“ (Lila, Prisma-Folie, Bungee) gefiel dem Benutzer doch nicht.
Sein Auftrag: die ganze Seite samt Anordnung nach den Regeln des Taste-Skills (Leonxlnx/taste-skill,
MIT, „Anti-AI-Slop“) überarbeiten. Grundlage ist die Richtung „Tribüne“ aus der dritten Entwurfsrunde.

Ersetzt durch „Arena“ (oben): Die Werte dieses Abschnitts stehen seit 08.10.2026 nicht mehr in
`apps/mayhem-site/app/globals.css`. Gültig bleiben nur die allgemeinen Regeln weiter unten
(„Übersicht vor Vollständigkeit“, „Texte“, „Bewegung“).

## Idee

Wie eine Anzeigetafel im Stadion: fast schwarz, warm, ein einziger Goldton, große Zahlen in einer
Monospace-Schrift. Die Spieler und ihre Ränge stehen vorn (das unterscheidet die Seite von anderen
Mayhem-Seiten), Wappen und Noten-Symbole sind die einzigen Bilder neben den Splash-Arts.

## Farben

| Rolle   | Token                               | Wert                                                      |
| ------- | ----------------------------------- | --------------------------------------------------------- |
| Grund   | `--bg`                              | `#111010` (warmes Fast-Schwarz, nie `#000`)               |
| Flächen | `--panel`, `--panel-2`, `--panel-3` | `#1a1918`, `#201e1c`, `#292725`                           |
| Linien  | `--line`, `--line-strong`           | `#2b2927`, `#3d3a36`                                      |
| Text    | `--text`, `--muted`, `--faint`      | `#f1ede6`, `#b5aea3`, `#9d968b` (alle ≥ 4,5 : 1)          |
| Akzent  | `--accent`                          | `#d6a865` (Gold), Schrift darauf `--accent-ink` `#17120a` |

Nur dieser eine Akzent. Noten (F bis MAYHEM) und Stufen (D bis MAYHEM) behalten ihre eigenen Farben
(`--grade-*`, `--tier-*`), weil sie Daten sind; ebenso Sieg/Niederlage und die Seiten eines Spiels.
Rekord-Arten bekommen auf der Rekorde-Seite keine eigene Farbe mehr.

## Schrift

- Text, Titel und Namen: **Bricolage Grotesque** (variabel 400–800), Token `--font`. Titel 700–780,
  enger gesetzt (`letter-spacing` negativ), nie Großbuchstaben mit Sperrung.
- Zahlen, kleine Fakten-Zeilen, Tabellenköpfe: **IBM Plex Mono** 400/500, Token `--font-mono`.
- Beide selbst gehostet (`apps/mayhem-site/public/fonts`, SIL Open Font License, Lizenztexte
  daneben), nie über Google-Server laden (Datenschutz).

## Formen und Aufbau

- Eine Rundung für alles: `--radius` 6 px, `--radius-sm` 4 px; keine Pillen. Kreise nur für
  Profilbilder.
- Keine Kästen ohne Grund: Abschnitte trennt eine Linie und Abstand (`.card` ist nur noch das).
  Flächen haben nur Dinge, die hervorstechen sollen (Podest, Spiele des Tages, erster Rekord).
- Kein Leuchten, keine Verläufe in Schrift, keine kleinen gesperrten Großbuchstaben-Zeilen über
  Überschriften; stattdessen bei Bedarf eine Mono-Zeile darunter (`.page-sub`).
- Kopfzeile auf dem Rechner in einer Zeile; „So funktioniert's“ und „API“ stehen in der Fußzeile.
  „Mitmachen“ ist der einzige gefüllte Knopf der Navigation.
- Reiter als Wörter mit einer Goldlinie unter dem gewählten.
- Startseite: links Frage und Suche, rechts das Podest (Platz 1 groß mit Wappen, 2 und 3 darunter),
  darunter die Kennzahlen als Leiste, die Spiele des Tages (eines groß mit Splash, zwei klein), dann
  Plätze 4 bis 10 neben Noten und neuen Rekorden.
- Rangliste: Verteilung über die ganze Breite mit den zwei Apex-Linien daneben, die Tabelle über die
  ganze Breite, darunter „So zählt es“ und „Mitmachen“.
- Rekorde: eine Zeile je Kategorie (Name, Rekordhalter mit Wert, nächste Plätze).
- Symbole: Rang-Wappen nur für Ränge, Noten-Symbole nur für Noten, Tierliste mit Buchstaben S bis D.
  Die Noten-Symbole haben einen schwarzen Hintergrund: `mix-blend-mode: screen`.

## Übersicht vor Vollständigkeit (Regel für App und Website)

Benutzerregel 08.10.2026: „die Seite mit Stats wirkt überladen und erschlagend … alles übersichtlich
und easy zu checken, mache dafür eine Regel für die App und Website.“ Gilt für jede Seite, Karte und
jedes Popout der Mayhem-App und für mayhemstats.lol; bei neuen Seiten vorher prüfen.

- **Eine Frage pro Seite:** Jede Seite beantwortet zuerst eine Frage („Was spiele ich auf Yasuo?“).
  Die Antwort steht oben und ist in drei Sekunden zu sehen; alles andere kommt darunter.
- **Eine Hauptzahl pro Zeile:** Zeilen zeigen eine große Zahl (meist die Siegquote) und höchstens
  eine kleine Zusatzangabe (Spiele). Weitere Werte (Lift, Pickrate, „erwartet“, Slots) nur im Tooltip
  oder nach Aufklappen, nie alle sichtbar nebeneinander.
- **Wenig auf einmal:** höchstens drei Abschnitte sichtbar ohne Scrollen, Listen zeigen zuerst 5
  Einträge, der Rest hinter „Mehr“. Reiter statt langer Seiten.
- **Klartext statt Fachwort:** keine Abkürzungen wie „Pp“, „Lift“, „Pick“ ohne Erklärung; lieber
  Worte wie „stark“, „selten gewählt“. Rohwerte wie „1,85“ nicht zeigen, wenn ein Balken oder ein
  Wort reicht.
- **Hervorheben statt aufzählen:** das Beste einer Liste sichtbar markieren (Gold, „Top“), damit man
  nicht selbst vergleichen muss.
- **Ehrlich bleibt Pflicht:** Weniger zeigen heißt nie verfälschen. Spielzahl bei jeder Quote bleibt
  erreichbar (klein oder im Tooltip), „–“ für fehlende Werte, Quellen weiter benannt.

## Texte

Kein Gedankenstrich als Stilmittel (auch kein „–“ mitten im Satz), höchstens ein „·“ pro Zeile,
kurze sachliche Sätze. „–“ allein bleibt das Zeichen für einen fehlenden Wert.

## Bewegung

- Knöpfe geben beim Drücken 1 px nach, Zeilen hellen beim Überfahren auf.
- „Neu würfeln“ tauscht die Spiele des Tages einmal aus, wie der eine Reroll im Spiel.
- Keine Dauer-Animationen; `prefers-reduced-motion` schaltet alles ab.

## App und Website gleich halten

Beide nutzen dieselben Arena-Tokens und Schriften (`src/mayhem/mayhem.css` und
`apps/mayhem-site/app/globals.css`, `:root`). Wer an einer Stelle einen Wert ändert, ändert ihn an der
anderen mit (Ausnahme oben: `--faint` der Website). Fenster und Seite dunkel und voll deckend, Zahlen
in Geist Mono, Gold nur für das Wichtigste.
