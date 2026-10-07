# Mayhem-Design

## Nächstes Design „Arena“ (gewählt 07.10.2026, noch nicht gebaut)

Benutzerwahl nach drei Entwurfsrunden im Artifact „mayhemstats Design 2“ (Seite „Mix D × E“), mit Blitz
als Anregung für Aufbau und Anordnung (keine Logos oder Bilder von Blitz übernommen). Vorlage für alle
Seiten und die Mayhem-App ist die Spielerseite mit Matchverlauf („G · Spielerseite mit Matchverlauf“).
Bis zum Umbau (ROADMAP „Als Nächstes“) gilt unten weiter „Tribüne“; danach ersetzt dieser Abschnitt sie.

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
  Kästchen; Wappen und Noten-Symbole groß.
- **Bilder:** Champion-Icons, Splash-Arts und Items von Data Dragon, Wappen und Noten-Symbole aus
  `public/ranks` und `public/grades`.

## Bisher: „Tribüne“

Verbindliche Gestaltung für alles rund um ARAM: Mayhem: die Seite `apps/mayhem-site` (mayhemstats.lol)
und die geplante Mayhem-App neben blank. Die blank.-App selbst behält ihr Design „Klassisch“ (siehe
CLAUDE.md); dieses Dokument gilt nur für Mayhem.

Entstanden am 06.10.2026: „Augment-Wahl“ (Lila, Prisma-Folie, Bungee) gefiel dem Benutzer doch nicht.
Sein Auftrag: die ganze Seite samt Anordnung nach den Regeln des Taste-Skills (Leonxlnx/taste-skill,
MIT, „Anti-AI-Slop“) überarbeiten. Grundlage ist die Richtung „Tribüne“ aus der dritten Entwurfsrunde.

Quelle der Werte ist `apps/mayhem-site/app/globals.css` (`:root`). Wer dort etwas ändert, ändert es
hier mit, damit die Mayhem-App dieselben Werte übernehmen kann.

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

## Texte

Kein Gedankenstrich als Stilmittel (auch kein „–“ mitten im Satz), höchstens ein „·“ pro Zeile,
kurze sachliche Sätze. „–“ allein bleibt das Zeichen für einen fehlenden Wert.

## Bewegung

- Knöpfe geben beim Drücken 1 px nach, Zeilen hellen beim Überfahren auf.
- „Neu würfeln“ tauscht die Spiele des Tages einmal aus, wie der eine Reroll im Spiel.
- Keine Dauer-Animationen; `prefers-reduced-motion` schaltet alles ab.

## Für die Mayhem-App

Dieselben Tokens und Schriften übernehmen (am einfachsten den `:root`-Block aus `globals.css`).
Fenster dunkel und voll deckend wie die Seite, Zahlen in Plex Mono, Gold nur für das Wichtigste.
