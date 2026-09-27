# Design-System von blank.

Gestaltung, Bewegung und Anpassung von blank. (Benutzerauftrag). Ohne eigene Änderungen ergibt die
Auflösung exakt die Werte von `src/styles/tokens.css` (Test und Stilvergleich, siehe VALIDATION).
Einstellen: Settings → Darstellung (`features/settings/LookCard.tsx`).

| Datei              | Inhalt                                                                   |
| ------------------ | ------------------------------------------------------------------------ |
| `tokens.ts`        | Alle Token-Namen mit Art und CSS-Variable                                |
| `themes.ts`        | Themes mit Vererbung, die sechs Farbschemata, helle Popout-Farben        |
| `motion.ts`        | Dauern, Kurven, Federn, Staffelung; Stufen und Tempo                     |
| `customization.ts` | Gespeicherte Anpassung: Schema, Prüfung, Presets, Migrationen, Export    |
| `resolve.ts`       | Auflösung aller Schichten zu fertigen Werten, mit Herkunft je Wert       |
| `useDesign.ts`     | Schreibt die Werte als CSS-Variablen auf `<html>`, `useMotion()` für TS  |
| `design.test.ts`   | Vitest: Vollständigkeit, Gleichheit mit `tokens.css`, Prüfung, Migration |

## Tokens

Jeder Wert hat einen Namen nach Rolle (`color.surface.panel`, `radius.card`, `motion.fast`), nie nach
Aussehen. Die Farben schreiben in die bestehenden Variablen (`--bg`, `--panel`, `--accent`, …), damit das
vorhandene CSS unverändert weiterläuft; neue Skalen haben neue Variablen:

- **Farben:** Flächen von hinten nach vorn: `color.bg.app` → `color.surface.panel` → `color.surface.default`
  → `color.surface.hover`; Rahmen, Text (primär, sekundär, gedämpft), Akzent mit `soft`/`line`/`ink`,
  Fehler, Scrollbar, Töne, Avatare, Schattenfarbe.
- **Abstände:** 4-px-Raster `space.xs` … `space.2xl`; nach Dichte: `space.section` (= `--gap`, zwischen
  Karten), `space.card` (in Karten), `space.row` (über/unter Listenzeilen).
- **Radien:** `radius.subtle` 4 · `small` 6 · `control` 8 · `card` 12 · `large` 16 (= `--radius`) · `round`;
  `radius.scale` (`--radius-scale`) ist der Faktor der Rundung für Radien, die direkt im CSS stehen.
- **Schatten:** `shadow.raised` / `floating` / `overlay`, immer aus `--shadow`, damit helle Popouts passen.
- **Schrift:** Familien (`font.family`, `font.display`, `font.mono`) und Größen der Textrollen
  (`text.pageTitle` … `text.numeric`).
- **Bewegung:** `motion.instant` … `motion.emphasized` (schon mit Stufe und Tempo verrechnet),
  `easing.standard` / `enter` / `exit` / `emphasized`; `motion.travel` (`--motion-travel`) ist 1, wenn
  Wege erlaubt sind, und 0 bei „Reduziert“.

Komponenten nutzen nur Variablen, keine festen Werte (Regel aus CLAUDE.md). Im CSS heißt das:

- Radien als `var(--radius-card)`/`var(--radius)` oder `calc(9px * var(--radius-scale))`; rund (`50%`,
  `999px`) bleibt rund.
- Schatten als `var(--shadow-floating)` usw.; Abstände, die der Dichte folgen, als `var(--gap)`,
  `var(--space-card)`, `var(--space-row)`.
- Dauern als `var(--motion-normal)` (oder ein Vielfaches davon), Wege mit `var(--motion-travel)`
  multipliziert, z. B. `translateY(calc(8px * var(--motion-travel)))`; so wird „Reduziert“ zum reinen
  Überblenden.
- `html[data-motion='off']` schaltet alle Übergänge ab. Die Media-Query für Windows' „Bewegung
  reduzieren“ gilt nur noch ohne `data-motion` (Popout-Fenster, das eigene Einstellungen hat).
- Neue Variablen, die das CSS braucht, auch in `tokens.css` unter `:root` eintragen (erster Bildaufbau und
  Popout-Fenster); der Test prüft die Gleichheit.

## Themes und Farbschemata

`base` (alles außer Farben) → `dark` (dunkle Grundfarben) → `classic` („Klassisch“, das eine Design der
App). Ein Theme speichert nur, was es gegenüber dem Eltern-Theme ändert; eine Schleife in `extends` bricht
ab statt zu hängen. Die Farbschemata (Wald, Ozean, Lavendel, Glut, Rosé, Graphit) sind eine eigene
Schicht nur mit Farben. `popoutLight` sind die Farben der Popout-Farbe „hell“; das Popout-Fenster nutzt
weiter nur `tokens.css`.

`tokens.css` bleibt als erster Bildaufbau (bevor die App läuft) und muss mit `themes.ts` übereinstimmen –
der Test „stimmen mit tokens.css überein“ vergleicht jede Variable in allen sechs Farbschemata.

## Bewegung

Einstellbar ist nur an (`normal`, Standard) oder aus (`off`) – Benutzerwunsch. „An“ gilt auch, wenn die
Windows-Animationseffekte aus sind; früher gespeicherte Stufen (Wie Windows, Reduziert, Dezent, Kräftig)
werden beim Lesen zu „an“. `motion.ts` kennt intern weiter Stufen und Tempo (`resolveMotion`), sie haben
aber keine Einstellung. Für CSS gelten die `--motion-*`-Variablen und `data-motion` auf `<html>`; für Animationen in
TypeScript liefert `useMotion()` Dauern, Federn (`soft`, `default`, `snappy`, `heavy`), Staffelung und
`travel` (ob Wege erlaubt sind). Popouts haben eigene Einstellungen für Tempo und Verlauf.

Bewegungen sind mutig (Benutzerwunsch) und laufen über `motion` (die Bibliothek) oder CSS mit der Feder
`--ease-spring` (`springCurve` macht aus einer Feder eine `linear()`-Kurve, `bouncy` schwingt ~10 % über).
Wo sich etwas bewegt (alles einmalig, nie in Schleife; Grundsatz aus den Beispiel-Videos des Benutzers:
Bewegung hat einen Ursprung, Größen fließen statt zu springen):

- **Seitenleiste und Reiter:** das Feld des gewählten Eintrags gleitet mit Feder zum neuen (`layoutId`,
  `.nav-current`, `components/TabMotion.tsx` `TabPill`).
- **Karten:** die ersten sechs federn nacheinander herein; Übersichts- und Stream-Karten neigen sich zur
  Maus mit einem Lichtschein (`design/useTilt.ts`, ein Listener, höchstens ein Update pro Bild).
- **Zahlen und Balken:** große Werte zählen mit Feder hoch (`components/Ticker.tsx`, `<data>`, fehlende Werte
  bleiben „—“), Balken wachsen federnd.
- **Knöpfe und Schalter:** geben beim Klick nach und federn zurück; der Schalter-Knopf dehnt sich beim
  Drücken.
- **Meldungen:** federn von der Seite herein, rücken beim Schließen nach (`LiveToasts.tsx`, `layout`).

- **Fenster:** Beim Start und nach dem Wiederherstellen blendet der Inhalt ein (`.app.enter`), vor dem
  Minimieren und Schließen aus (`.app.leave`, dann erst der Fensterbefehl). Das Fenster selbst bleibt deckend
  (`body` malt den Hintergrund). Zurück kommt der Inhalt bei `visibilitychange`/`focus`, spätestens nach
  1,5 s. Nur beim eigenen Minimieren-Knopf, sonst würde der letzte Bildstand kurz aufblitzen.
- **Seiten:** `motion.div.page` in `main` (`AnimatePresence`, `popLayout`) kommt mit Feder aus Unschärfe von der Seite des Menüeintrags, die alte geht zur anderen;
  die ersten sechs Karten blenden gestaffelt ein (`data-stagger`, `--i`), spätere Karten (lange Listen,
  geladene Daten) erscheinen sofort. `main` schneidet mit `overflow: clip` ab, was dabei übersteht, damit eine
  genau passende Seite keine Scrollleiste zeigt.
- **Reiter:** Settings-Bereiche und Popout-Unterbereiche kommen von der Seite ihres Reiters (`TabContent`).
- **Aufklappen:** `components/Reveal.tsx` (Pro-Filter, Zusammen schauen, Kanäle, Spielauswahl, Mehr
  Einstellungen) wächst mit Feder auf seine Höhe und klappt weich wieder zu.
- **Dialog:** Umzugs-Code: Hintergrund unscharf, Karte federt herein, blendet beim Schließen aus.
- **Popout:** Das kompakte Musik-Popout wächst beim Hovern fließend zur großen Ansicht (`MORPH_MS` 180 ms,
  Web Animations, unabhängig vom Popout-Tempo), der Inhalt bleibt dabei an der Bildschirmkante stehen. Sein
  Fenster hat Platz zum Aufklappen und zeigt per Fensterumriss nur die Karte, so ändert sich beim Hovern
  nie die Fenstergröße. Siehe CLAUDE.md (Popouts).
- **Startbildschirm** (`app/StartScreen.tsx`): Partikel wirbeln herein und bilden „blank“, der Punkt
  fällt mit Druckwelle und Funken, ein Schimmer läuft über das Wort, darunter der echte Ladestand (Twitch,
  PC, Geräte); dann öffnet sich der Punkt wie ein Portal zur App (Maske `--hole`). Beim ersten Start einer
  Installation lang, später kürzer; Klick/Taste überspringt; nur mit Animationen an. Canvas nur während er
  läuft (nativ gemessen: 229 Bilder/s, kein Bild über 20 ms).

## Auflösung

`resolveDesign` legt die Schichten übereinander, die spätere gewinnt:

1. `default` – Basis-Theme
2. `theme` – Klassisch (nur Abweichungen)
3. `scheme` – Farbschema
4. `preset` – Token eines Presets (z. B. „Schlicht“ ohne Schatten)
5. `user` – eigene Einstellungen (Akzentfarbe samt Begleitfarben, Rundung, Dichte, Bewegung)
6. `preview` – nur angezeigt, nicht gespeichert (zum Ausprobieren in den Settings)

Für jeden Token und jede Einstellung steht die Herkunft fest (`tokenSource`, `settingSource`); in der
Entwicklungsvorschau liegt alles unter `window.__blankDesign`. Die Auflösung wirft nie; fehlt ein Wert,
bleibt der aus `tokens.css`.

## Gespeicherte Anpassung

Teil der Einstellungen (`preferences.customization`), damit sie mit allem anderen gespeichert, nach
`settings.json` gespiegelt, exportiert und online gesichert wird:

```ts
{ version: 1, theme: 'classic', preset: 'default', overrides: {}, advanced: false, presets: [] }
```

Gespeichert wird nur, was vom Preset abweicht (`overrides`); ein Wert gleich dem Preset löscht die eigene
Änderung. Einstellungen (`registry` in `customization.ts`, mit Kategorie, Grenzen, Standard, Text):
`density`, `motionLevel`, `motionSpeed`, `accent`, `radiusScale`, `gpuEffects`, `blur`, `transparency`.

In Settings → Darstellung wirken:

- **Stil:** Standard, Sparsam (weniger Bewegung), Schlicht (ohne Schatten, halbe Rundung, dezent) und eigene
  Stile. Wählen lässt eigene Änderungen an dem, was der Stil festlegt, weichen; alles andere bleibt.
  „Speichern“ legt das aktuelle Aussehen als eigenen Stil an (samt dem Stil, aus dem er entstand, damit
  z. B. „ohne Schatten“ mitkommt); Löschen lässt das Aussehen unverändert (als eigene Änderungen).
- **Farbschema** und **Akzentfarbe** (acht eigene Farben oder frei; zu dunkle Farben werden lesbar
  aufgehellt, `readableAccent`).
- **Dichte:** Kompakt 8/12/6 px, Normal 12/16/9 px, Luftig 14/17/12 px (zwischen Karten / in Karten /
  Listenzeilen; Zeilen in den Settings haben Zeilenabstand + 4 px). Luftig ist nativ mit echten Daten
  gemessen: mehr ließe die PC-Seite scrollen, Übersichtsseiten müssen in 860 × 640 passen. Mehr Luft gibt es
  deshalb vor allem in Listen und Settings. (Früher setzte `desktop.css` `--gap` auf `.app` fest auf 12 px,
  die Dichte wirkte dort nicht; der Standard ist jetzt der Token.)
- **Rundung** 0–2, **Animationen** an oder aus (Benutzerwunsch: keine Stufen, kein Tempo) und der
  **Startbildschirm** (`app/StartScreen.tsx`, an/aus, „Ansehen“ spielt ihn noch einmal).

`compact`/`motion` in den Einstellungen werden aus Dichte und Stufe abgeleitet (für das Popout-Fenster).
`gpuEffects`, `blur` und `transparency` sind nur beschrieben und **geplant** – ohne Oberfläche und ohne
Wirkung. Die Grafikkarte folgt „Animationen“ (`src-tauri/src/gpu.rs`, ab dem nächsten Start; aus:
`--disable-gpu --in-process-gpu`). Das Fenster bleibt fest 860 × 640 (Benutzerwahl).

Beim Lesen wird alles geprüft: falsche Typen, unbekannte Werte und Felder fallen weg, Zahlen werden
begrenzt, Farben nur als `#rrggbb`. Kaputte Daten ergeben die Standardwerte, nie einen Absturz. Eine neuere
Version (von einem späteren blank.) wird gelesen, soweit bekannt.

**Presets:** eingebaut `default` (Standard), `performance` (Sparsam) und `minimal` (Schlicht); eigene
Presets (höchstens 20, ID `a-z0-9-` aus dem Namen, Name ohne Steuerzeichen, `base` = eingebauter Stil)
werden als `user:<id>` gewählt (`choosePreset`, `savePreset`, `deletePreset`).

**Export/Import:** `exportCustomization` schreibt ein eigenes Format (`kind: 'blank.design'`) statt des
inneren Zustands; `importCustomization` prüft wie beim Lesen.

## Erweitern

- **Neue Einstellung:** in `DesignSettings` und `registry` aufnehmen (Kategorie, Art, Grenzen, Standard,
  deutscher Text; `advanced`, `restartRequired`, `requires` nach Bedarf). Wirkung in `resolve.ts` (Tokens)
  oder am Ort der Verwendung. Test für Prüfung und Standard ergänzen. Prüfung, Export und Import folgen
  aus der Registry.
- **Neuer Token:** in `tokenDefs` mit Art und CSS-Variable, Wert im Theme `base` (oder `dark`). Steht die
  Variable auch in `tokens.css`, dort gleich halten (der Test vergleicht).
- **Neues Theme:** `ThemeDef` mit `extends` und nur den Abweichungen, in `themeDefs` und `DesignThemeId`
  aufnehmen. Nur auf Benutzerauftrag (CLAUDE.md: ein Design, „Klassisch“).
- **Neues Farbschema:** Palette in `schemes`, Block `[data-theme='…']` in `tokens.css`, Eintrag in
  `features/settings/themes.ts`.
- **Neues Preset:** in `builtInPresets` mit `values` und ggf. `tokens`.
- **Inkompatible Änderung:** `CUSTOMIZATION_VERSION` erhöhen und in `migrations` einen Schritt von der alten
  zur neuen Version ergänzen (mit Test mit echten alten Daten).

Prüfen: `pnpm test`, `pnpm build`, und bei Änderungen, die nichts Sichtbares ändern sollen, der
Stilvergleich vorher/nachher (VALIDATION).
