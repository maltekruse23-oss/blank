# Notizen für die nächste KI

Übergabe zwischen KI-Sitzungen (Claude, ChatGPT/Codex …), die an blank. weiterarbeiten. Die Regeln
stehen in `CLAUDE.md` (zuerst lesen, gilt für alle), Prüfstände in `VALIDATION.md`, Bedienung in
`README.md`. Hier steht nur, **woran gerade gearbeitet wird, was entschieden ist und was offen
ist.** Bei jedem Patch und jedem Release aktualisieren und mit hochladen (Benutzerwunsch).

Stand: 30.09.2026, Version 0.9.0 (Rang-Modus veröffentlicht).

## Gerade in Arbeit: Rang-Modus für ARAM Mayhem

Wunsch des Benutzers: echte Ränge wie in einem Ranked-Modus, später vielleicht öffentlich für alle.

**Entschieden (vom Benutzer):**

- Keine LoL-Ränge (Eisen … Challenger), kein LP, keine verdeckte Skill-Wertung: Riots
  Entwickler-Richtlinien verbieten „Alternativen zur offiziellen Rangliste, z. B. MMR- oder
  Elo-Rechner“. Stattdessen „Weg B“: offene Leistungsnote je Spiel, Ladder wie Ranked, eigene Stufen.
- Stufen: **D, C, B, A, S, SS, SSS, MAYHEM**, eng an LoL-Ranked: Divisionen IV–I zu je 100 Punkten
  (MP), Auf- und Abstieg (Wahl des Benutzers), Schutz nach Aufstieg, 5 Einstufungsspiele, MAYHEM
  ohne Divisionen. Nur die Punkte je Spiel kommen aus der Note (gegen die Erwartung des Rangs).
- Immer daran denken: soll später öffentlich werden und von LoL-Spielern genutzt werden. Die Regeln
  folgen der LoL-Ranked-Referenz des Benutzers (Stand 2026); Abweichungen nur auf seine Wahl: eine
  Apex-Stufe (MAYHEM), kein Verfall, Plus/Minus aus der Note statt aus Sieg/Niederlage.
- Leistung zählt, Sieg kaum (Fun-Modus: manche Spiele sind nicht zu gewinnen). Spiel strecken,
  schnell pushen oder nichts tun darf nichts bringen.
- Wappen: der eigene SVG-Entwurf gefiel nicht. Der Benutzer lässt sie von ChatGPT malen (Kristall-
  Stil). Eingebaut als 256-px-PNGs in `src/features/aram/emblems/`, vorbereitet mit
  `node server/tools/emblems.mjs <Ordner mit 1-D.png … 8-MAYHEM.png> src/features/aram/emblems`
  (entfernt eingebranntes Schachbrett oder Magenta-Hintergrund #FF00FF, schneidet zu). D und B kamen auf Magenta nach, alle acht sind die echten Bilder. Keine
  fremden Grafiken (Riot, Overwatch, Marvel Rivals usw.) übernehmen.

**Fertig (Code im Repo, noch ohne Oberfläche):**

1. `aram.json` Version 3: je Spiel die Werte aller zehn Spieler ohne Namen/PUUIDs (`lobby` in
   `src-tauri/src/aram.rs`, Typ `AramSeat` in `src/adapters/aram.ts`), nachgeholt solange der
   Client die Spiele hat, geht über die Gruppe mit (`quality`/`gameQuality`), passt in eine
   Gruppen-Nachricht (Test).
2. Wertung `src/features/aram/aramRating.ts` (Tests in `aramRating.test.ts`): Note 0–10 je Spiel
   aus Plätzen unter allen zehn (Schaden, Team-Anteil, Beteiligung, Einstecken, Heilen, wenig Tode
   nur mit Beteiligung), Gewichte je Rolle (`championRoles.ts`), Sieg ±0,3, Ausgleich je
   Champion/Rolle (`aramBias.ts`), Ladder mit `rankOf`, `pointsFor`, `applyPoints`, `placementLadder`. `standings()` ist deterministisch (gleiche Spiele → bei allen gleiches Ergebnis).
3. Werkzeuge in `server/tools/`: `champion-roles.mjs` (Rollen aus Data Dragon neu erzeugen),
   `mark-bias.ts` (Ausgleich aus den Spielen des League-Clients neu messen, je Saison;
   `node server/tools/mark-bias.ts`, Client muss offen sein), `check-mayhem.mjs` (prüft Riots
   Web-API mit eigenem Entwickler-Schlüssel in `RIOT_API_KEY`).

4. Etappe 3: Reiter „Rang“ (erster Reiter der ARAM-Seite, `AramRank.tsx`): je Spieler Wappen, Stufe,
   Platz, Rang mit Division, MP, Fortschritt, MP der letzten 6 Spiele; in der Einstufung (< 5 Spiele) die
   vorläufige Stufe blass. Die Vorschau hat dafür erfundene Zehner-Spiele (`mockLobby` in `mock.ts`).

5. Etappe 4: Rang-Band auf der Karte nach dem Spiel (`RankStrip.tsx`, auch im Popout und im Dialog), eigener
   Rang im ARAM-Widget auf Home. Wappen einzeln in `TierEmblem.tsx` (das Popout lädt nicht die Rang-Seite).

**Nächste Schritte:**

- Etappe 5: Saisons (Start = Gruppen-Start, `RATING_VERSION` gehört zur Saison).
- Nachsehen: Aufstiegs-Animation und Popout-Karte mit Band nach einem echten Spiel (nativ noch nicht im Bild gesehen).

**Öffentliche Version: derzeit nicht möglich.** Geprüft am 30.09.2026 mit Entwickler-Schlüssel:
Riots Web-API (Match-V5) gibt ARAM-Mayhem-Spiele nicht heraus (Spielliste endet vor den
Mayhem-Spielen, Queue 2400 liefert 0). Ohne API kann ein Server die Spiele nicht selbst holen und
Uploads aus dem Client wären fälschbar. Riot-Login (RSO) gibt es nur mit Produktions-Schlüssel.
ChatGPT Sites (Cloudflare Workers + D1) kann keine geheimen Schlüssel und keine Hintergrund-Jobs.
Falls Riot Mayhem in die API aufnimmt: eigener Server (Cloudflare Workers + D1 + Cron), gleiche
Rechnung aus `aramRating.ts`, vorher Riot per Developer-Portal fragen.

## Sonst offen

- Design-Funde (noch nicht umgesetzt): Werkzeuge in die Seitenkopf-Zeile statt eigener Zeile
  (Twitch, ARAM, Devices), Home-Widget „Twitch Live“ schneidet die letzte Zeile ab, ARAM-Kategorie
  mit lauter 0 zeigt zweimal Platz 1, Devices-Karten mit großem Deko-Symbol statt Akku im
  Vordergrund, Musik-Karte nur für „Kein Mix aktiv“, ein paar feste Werte in `desktop.css`
  (`#fff`, feste Dauern) auf Tokens umstellen.
- Browser-Erweiterung in den Stores: Texte in `extension/STORE.md`, Bilder in `extension/store/`.
  Einreichen macht nur der Benutzer mit seinem Konto (Chrome 5 $, Opera kostenlos). Nach Freigabe
  Store-Links in README und Release-Text eintragen.

## Stolpersteine

- Keine persönlichen Daten in Code oder Doku (keine Riot-IDs, Kanäle, Geräte, Pfade des Benutzers).
- Nie API-Schlüssel ins Repo, in `VITE_*` oder in Chats; der Benutzer setzt sie selbst.
- Release nur mit `pnpm desktop:build` bauen, nie `cargo build --release` (siehe CLAUDE.md).
- `tsconfig.json` erlaubt `.ts`-Endungen in Importen, damit `node server/tools/*.ts` dieselben
  Dateien direkt ausführen kann (Node 24 entfernt Typen selbst).
- Der League-Client gibt je Spieler nur die letzten 20 Spiele heraus: was vorher nicht gespeichert
  wurde, ist später weg.

## Verlauf

- 01.10.2026: Release 0.9.1 (Seitenleiste neu, Rang eigene Seite, Ladder nach LoL-Referenz).

- 30.09.2026 (7): Seitenleiste neu (Benutzerwunsch): Abschnitte Übersicht · ARAM (Rang, Rekorde) · Medien (Twitch, Pros, Musik) · System; Rang als eigene Seite mit Unterreitern Rangliste · Mein Verlauf · Gruppe; Rekorde mit Rekorde · Beste Spiele; eine Unterreiter-Logik für alle (`components/SubTabs.tsx`).

- 30.09.2026 (6): Ladder nach der LoL-Ranked-Referenz des Benutzers (Datei `lol-ranked-kontext.md`, nicht im Repo): MP-Größen je Tier mit Form, Überlauf beim Abstieg, Landung 75/50/25, Einstufung bis SSS III 80, drei Saisons/Jahr mit Soft-Reset, Anzeige wie op.gg (S/N, Siegquote, Platz, Matchverlauf, frühere Saisons, Kletter-Hinweis). Wahl: nur MAYHEM als Apex, kein Verfall.

- 30.09.2026: **Release 0.9.0** (Rang-Modus). Nativ geprüft: `aram.json` v3 mit allen zehn, Rang-Reiter, Karte, Home.

- 30.09.2026 (5): Etappe 4 – MP und Aufstieg auf der Karte (auch Popout), Rang im Home-Widget.

- 30.09.2026 (4): Ladder wie LoL-Ranked statt Saisonwert (Benutzerwunsch: öffentlich für LoL-Spieler, Abstieg ja): Divisionen IV–I, 0–100 MP, Auf-/Abstieg, Schutz, Einstufung; Reiter zeigt Platz, Rang, MP und MP je Spiel.

- 30.09.2026 (3): Wappen D und B durch die echten Bilder (Magenta-Hintergrund) ersetzt.

- 30.09.2026 (2): Reiter „Rang“ mit den Wappen des Benutzers (D/B Platzhalter), Werkzeug
  `emblems.mjs`, Mock-Spiele mit allen zehn.

- 30.09.2026: Store-Bilder und Opera-Teil in `extension/STORE.md`; `aram.json` v3 (Werte aller
  zehn); Mayhem-Wertung mit Tests, Rollen und Ausgleich; Riot-API-Prüfung (kein Mayhem); diese
  Notizen angelegt.
