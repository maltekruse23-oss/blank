# Mayhem-Design „Augment-Wahl“

Verbindliche Gestaltung für alles rund um ARAM: Mayhem: die Seite `apps/mayhem-site` (mayhemstats.lol)
und die geplante Mayhem-App neben blank. (Benutzerwahl 06.10.2026, „2, ist richtig cool“; „die
Mayhem-App soll den gleichen Stil wie die Seite haben, deshalb Design speichern“). Die blank.-App
selbst behält ihr Design „Klassisch“ (siehe CLAUDE.md); dieses Dokument gilt nur für Mayhem.

Quelle der Werte ist `apps/mayhem-site/app/globals.css` (`:root`). Wer dort etwas ändert, ändert es
hier mit, damit die Mayhem-App dieselben Werte übernehmen kann.

## Idee

Die Oberfläche fühlt sich an wie die Augment-Auswahl im Spiel. Abgeleitet aus den eigenen Mayhem-
Symbolen (`public/grades`, `public/ranks`): Kristall-Facetten, graue Dornen-Ornamente, X-Zeichen,
Pfeilspitzen und die schillernde Prisma-Schrift von MAYHEM. Kein generischer Look: keine Inter-Schrift,
kein Neon-Grün auf Schwarz, keine kleinen gesperrten Überschriften über jeder Karte.

## Farben

| Rolle | Token | Wert |
| --- | --- | --- |
| Grund | `--bg` | `#0a0812` (Pflaume-Schwarz) |
| Flächen | `--panel`, `--panel-2`, `--panel-3` | `#130f1e`, `#181327`, `#1f1832` |
| Linien | `--line`, `--line-strong` | `#261f3a`, `#3a3058` |
| Dornen-Grau | `--slate` | `#5d5c7c` |
| Text | `--text`, `--muted`, `--faint` | `#eceaf6`, `#a6a3c0`, `#8f8bad` (alle ≥ 4,5 : 1 auf jeder Fläche) |
| Akzent | `--accent` | `#c3a0ff` (Amethyst), Schrift darauf `--accent-ink` `#120c1f` |
| Prisma-Folie | `--holo` | `linear-gradient(100deg, #ff9ed6 0%, #ffe78a 22%, #a6f7d6 42%, #8fd2ff 62%, #c7a1ff 80%, #ff9ed6 100%)` |
| Silber-Rahmen | `--frame-silver` | `linear-gradient(160deg, #ecebf6, #8d8ca6 50%, #d6d6e6)` |
| Gold-Rahmen | `--frame-gold` | `linear-gradient(160deg, #fff1b8, #d29a2b 45%, #ffe08a)` |

Noten (F–MAYHEM) und Stufen (D–MAYHEM) behalten ihre eigenen Farben (`--grade-*`, `--tier-*`).
Die Prisma-Folie nur sparsam: Markenname, Prisma-Rahmen, einzelne Höhepunkte (MAYHEM).

## Schrift

- Titel und Marke: **Bungee** (eine Stärke, nie fett setzen), Token `--font-title`.
- Text, Namen und Zahlen: **Rubik** 400–800, Tokens `--font` und `--font-display`; Zahlen mit
  `font-variant-numeric: tabular-nums`.
- Beide selbst gehostet (`apps/mayhem-site/public/fonts`, SIL Open Font License, Lizenztexte daneben),
  nie über Google-Server laden (Datenschutz).

## Formen

- Radien `--radius` 12 px, `--radius-sm` 8 px, Pillen für Knöpfe wie „Neu würfeln“.
- Augment-Karte: 3 px Rahmen in Silber, Gold oder Prisma nach der Note (MAYHEM = Prisma, SSS und
  SS = Gold, darunter Silber), innen dunkle Fläche mit dem Splash-Art des Champions oben, Noten-
  Symbol groß, Name in Bungee, Wert groß in Rubik 800. Prisma-Rahmen leuchtet leicht.
- Symbole: Rang-Wappen nur für Ränge, Noten-Symbole nur für Noten, Tierliste mit Buchstaben S–D.
  Die Noten-Symbole haben einen schwarzen Hintergrund: `mix-blend-mode: screen`.

## Bewegung

- Karten heben sich beim Überfahren leicht an; der Prisma-Rahmen läuft dabei als Folie durch.
- „Neu würfeln“ tauscht die Spiele des Tages einmal aus, wie der eine Reroll im Spiel.
- Keine Dauer-Animationen; `prefers-reduced-motion` schaltet alles ab.

## Für die Mayhem-App

Dieselben Tokens, Schriften und Karten übernehmen (am einfachsten den `:root`-Block und die
`.aug`-Regeln aus `globals.css`). Fenster dunkel und voll deckend wie die Seite. Augment-Angebote im
Spiel als Augment-Karten mit demselben Rahmen nach Seltenheit.
