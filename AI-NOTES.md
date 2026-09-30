# Notizen für die nächste KI

Übergabe zwischen KI-Sitzungen (Claude, ChatGPT/Codex …), die an blank. weiterarbeiten. Die Regeln
stehen in `CLAUDE.md` (zuerst lesen, gilt für alle), Prüfstände in `VALIDATION.md`, Bedienung in
`README.md`. Hier steht nur, **woran gerade gearbeitet wird, was entschieden ist und was offen
ist.** Bei jedem Patch und jedem Release aktualisieren und mit hochladen (Benutzerwunsch).

Stand: 30.09.2026, nach v0.8.0 (noch nicht als neue Version veröffentlicht).

## Gerade in Arbeit: Rang-Modus für ARAM Mayhem

Wunsch des Benutzers: echte Ränge wie in einem Ranked-Modus, später vielleicht öffentlich für alle.

**Entschieden (vom Benutzer):**

- Keine LoL-Ränge (Eisen … Challenger), kein LP, keine verdeckte Skill-Wertung: Riots
  Entwickler-Richtlinien verbieten „Alternativen zur offiziellen Rangliste, z. B. MMR- oder
  Elo-Rechner“. Stattdessen „Weg B“: offene Leistungsnote je Spiel, Saisonwert, eigene Stufen.
- Stufen: **D, C, B, A, S, SS, SSS, MAYHEM**.
- Leistung zählt, Sieg kaum (Fun-Modus: manche Spiele sind nicht zu gewinnen). Spiel strecken,
  schnell pushen oder nichts tun darf nichts bringen.
- Wappen: der eigene SVG-Entwurf gefiel nicht. Der Benutzer lässt sie von ChatGPT malen (Kristall-
  Stil). Eingebaut als 256-px-PNGs in `src/features/aram/emblems/`, vorbereitet mit
  `node server/tools/emblems.mjs <Ordner mit 1-D.png … 8-MAYHEM.png> src/features/aram/emblems`
  (entfernt eingebranntes Schachbrett oder Magenta-Hintergrund #FF00FF, schneidet zu). **Platzhalter:**
  D ist C in Grau, B hat Löcher im Silber – der Benutzer liefert beide neu auf Magenta. Keine
  fremden Grafiken (Riot, Overwatch, Marvel Rivals usw.) übernehmen.

**Fertig (Code im Repo, noch ohne Oberfläche):**

1. `aram.json` Version 3: je Spiel die Werte aller zehn Spieler ohne Namen/PUUIDs (`lobby` in
   `src-tauri/src/aram.rs`, Typ `AramSeat` in `src/adapters/aram.ts`), nachgeholt solange der
   Client die Spiele hat, geht über die Gruppe mit (`quality`/`gameQuality`), passt in eine
   Gruppen-Nachricht (Test).
2. Wertung `src/features/aram/aramRating.ts` (Tests in `aramRating.test.ts`): Note 0–10 je Spiel
   aus Plätzen unter allen zehn (Schaden, Team-Anteil, Beteiligung, Einstecken, Heilen, wenig Tode
   nur mit Beteiligung), Gewichte je Rolle (`championRoles.ts`), Sieg ±0,3, Ausgleich je
   Champion/Rolle (`aramBias.ts`), Saisonwert = Schnitt der besten 20 (fehlende = 3,5), Stufe ab 5
   Spielen. `standings()` ist deterministisch (gleiche Spiele → bei allen gleiches Ergebnis).
3. Werkzeuge in `server/tools/`: `champion-roles.mjs` (Rollen aus Data Dragon neu erzeugen),
   `mark-bias.ts` (Ausgleich aus den Spielen des League-Clients neu messen, je Saison;
   `node server/tools/mark-bias.ts`, Client muss offen sein), `check-mayhem.mjs` (prüft Riots
   Web-API mit eigenem Entwickler-Schlüssel in `RIOT_API_KEY`).

4. Etappe 3: Reiter „Rang“ (erster Reiter der ARAM-Seite, `AramRank.tsx`): je Spieler Wappen, Stufe,
   Saisonwert, Fortschritt zur nächsten Stufe, letzte 6 Noten; in der Einstufung (< 5 Spiele) die
   vorläufige Stufe blass. Die Vorschau hat dafür erfundene Zehner-Spiele (`mockLobby` in `mock.ts`).

**Nächste Schritte:**

- Wappen D und B ersetzen, sobald der Benutzer sie als Datei liefert.
- Etappe 4: Note und Aufstieg auf der Karte nach dem Spiel (`AramResult.tsx`), Popout, Home-Widget;
  Aufstieg einmal animiert, nie dauerhaft.
- Etappe 5: Saisons (Start = Gruppen-Start, `RATING_VERSION` gehört zur Saison).
- Prüfen nach dem nächsten Build: Die Werte aller zehn kommen wirklich in `aram.json` an.

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

- 30.09.2026 (2): Reiter „Rang“ mit den Wappen des Benutzers (D/B Platzhalter), Werkzeug
  `emblems.mjs`, Mock-Spiele mit allen zehn.

- 30.09.2026: Store-Bilder und Opera-Teil in `extension/STORE.md`; `aram.json` v3 (Werte aller
  zehn); Mayhem-Wertung mit Tests, Rollen und Ausgleich; Riot-API-Prüfung (kein Mayhem); diese
  Notizen angelegt.
