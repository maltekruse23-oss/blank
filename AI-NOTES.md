# Notizen für die nächste KI

Aktuelle zusammenhängende Übergabe: [CLAUDE-HANDOFF-MAYHEM.md](CLAUDE-HANDOFF-MAYHEM.md).
Sie dokumentiert auch den getrennten Website-Ratingstand und die noch offene Statistikseiten-Recherche.

## MP höchstens ±30 je Spiel — 04.10.2026 (RATING_VERSION 3)

- `pointsFor` begrenzt jedes Spiel auf ±30 MP (`MAX_SWING`); vorher reichten extreme Spiele weit über dem oder unter dem Rang bis ±40. Normale Spiele (±25/±20/±30 je Stufe, +27/−13 über dem Rang) bleiben gleich. Grund: Benutzer sah −40 bei Niederlagen und Siegen. Geplant: Website-Rating auf denselben Kern bringen, App holt Ränge von der Website (Schritte 2–5 im Chat-Plan; Veröffentlichen der Website nur über Codex/Sites).

## Website-Upload nur auf Klick — 04.10.2026 (Prüfung von PR #13)

- Upload (`aram_website.rs`) ist standardmäßig **aus**; erst „Hochladen erlauben“ unter den
  ARAM-Hinweisen (`AramWebsite.tsx`, sagt, was öffentlich wird) schaltet ihn ein. Grund: jede
  blank.-Installation von Freunden hätte nach dem Update ungefragt ihre Spiele samt Freunden
  hochgeladen. Wer den Upload schon eingeschaltet hatte (`aram-website.json`), behält ihn.
- Das Rohdatenarchiv sammelt nur bei erlaubtem Upload; ein Archivfehler (voll, unvollständiges
  Spiel) erscheint nur als Hinweis – vorher brach er den ganzen Ranglisten-Abgleich ab.
- Wappen auf 256 px verkleinert (je ~50 KB statt ~800 KB; Website-Kopien unverändert).

## Rangicons — 04.10.2026

Freigegebene Augment-v3-PNGs in `src/features/aram/emblems/` eingebaut, SSS ohne die zwei
schwebenden Dreiecke. Dieselben Dateien für die bestehende Website. Zehn Assets vorhanden;
die aktuelle Berechnung verwendet weiterhin acht Stufen D bis MAYHEM. F/E sind nur vorbereitet.
Keine Änderungen an MMR, Ranggrenzen, Datenbank oder Uploads. PNGs unverändert mit schwarzem
Hintergrund, 1254 × 1254 Pixel; nicht durch das alte Aufbereitungsskript laufen lassen.
Die Darstellung nutzt `mix-blend-mode: screen` für `.rank-emblem` und auf der Website für
Emblem-Bilder: Schwarz verschwindet auf den dunklen Oberflächen. Die PNG-Dateien selbst
haben weiterhin einen schwarzen Hintergrund. Generierte Freistellungsversuche wurden wegen
Artefakten bzw. eingebranntem Schachbrett verworfen und sind nicht integriert.
Vorherige Assets und betroffene Notizen vor der Änderung extern gesichert.

## Automatisches Rohdatenarchiv — 03.10.2026

Benutzerauftrag: Sicherungen zurückstellen; neue Mayhem-Matches automatisch mit vollständigen
Rohdaten auf der bestehenden Website archivieren. `aram_archive.rs` hängt an den bereits
vorhandenen Matchdetail-Abrufen: originale Antwortbytes vor der Reduktion auf Ranglisteneinträge
in einer dauerhaften Outbox im App-Konfigurationsordner sichern. Keine zusätzlichen LCU-Abfragen,
kein Crawler, keine Timeline-Abfrage und kein MMR-Umbau. Bestehende Freunde bleiben im bisherigen
Sync-Umfang; alte bereits vollständig gespeicherte Matches werden nicht nachträglich abgefragt.

Upload mit 5 Sekunden Abstand, SHA-256-Bestätigung, Wiederholungen und bestehendem Pause-Schalter.
Outbox begrenzt auf 256 MB; bei Problemen bleiben Rohdaten erhalten. Erst nach bestätigter
Archivierung wird die lokale Warteschlangendatei durch einen kleinen Beleg ersetzt. Die UI zählt
archivierte Matches und offene Archiv-Uploads getrennt von Ranglisteneinträgen. Automatische
Backups sind weiterhin nicht eingerichtet.

Privater Pilot: Archivschlüssel nur in Windows Credential Manager (`blank.aram.archive`, `import`),
nicht in Code/EXE/Frontend. `examples/configure_archive.rs` nimmt ihn einmalig über stdin entgegen
und überschreibt keinen anderen vorhandenen Schlüssel. Für weitere Nutzer ist noch eine eigene
begrenzte Berechtigungslösung nötig; den administrativen Pilotschlüssel nicht verteilen.

Native und Frontend-Prüfungen bestanden; Live-Upload eines bereits archivierten echten Matches
bestätigt, Zähler unverändert. Windows-EXE gebaut und nach ausdrücklicher Freigabe am 03.10.2026
in die vorhandene Installation übernommen und neu gestartet. Neuer Prozess mit Fenster `blank.`
antwortet; installierte EXE stimmt per SHA-256 mit dem Build überein. Echter neuer Spielabschluss
mit dieser EXE bleibt zu prüfen. Kein Commit/Push/Release.
Vorherige Quelldateien und gezielte Rücknahme liegen im Aufgabenordner `outputs/automatic-archive`.

## Isolierter LCU-Test — 02.10.2026

Auf Benutzerauftrag wurde `src-tauri/src/aram_lcu_probe.rs` ergänzt, ausschließlich über
`#[cfg(test)]` in `aram.rs` eingebunden und standardmäßig ignoriert. Nutzt das vorhandene
`Lcu::connect()` und dessen HTTP-Client; keine Produktionslogik oder Datenstruktur geändert.
Ein manueller Lauf mit sieben GETs lieferte siebenmal HTTP 200: Ein Nicht-Freund aus einem
gespeicherten Queue-2400-Spiel hatte 21 Mayhem-Spiele in seiner History. Ein zusätzliches
Mayhem-Spiel ohne den eingeloggten Account lieferte zehn PUUIDs, davon acht außerhalb des
Seed-Spiels, Teilnehmerstatistiken und eine Timeline mit 20 Frames/149 Events.
Das belegt genau einen Entdeckungsschritt, keine flächendeckende Erfassung oder Skalierbarkeit.
Rohdaten bleiben außerhalb des öffentlichen Repos. `aram.json` war nach dem Lauf bytegleich.
Wiederholung: `BLANK_LCU_PROBE_OUTPUT` auf einen neuen externen Ordner und
`BLANK_LCU_PROBE_STORE` auf die vorhandene `aram.json` setzen, dann in `src-tauri`
`cargo test --lib foreign_mayhem_history_probe -- --ignored --nocapture` ausführen.
Entfernen: Testdatei und zugehörige vierzeilige Moduldeklaration aus `aram.rs` löschen.
Kein Crawler, kein MMR-System, kein Commit, kein Push, kein Release.

Übergabe zwischen KI-Sitzungen (Claude, ChatGPT/Codex …), die an blank. weiterarbeiten. Die Regeln
stehen in `CLAUDE.md` (zuerst lesen, gilt für alle), Prüfstände in `VALIDATION.md`, Bedienung in
`README.md`. Hier steht nur, **woran gerade gearbeitet wird, was entschieden ist und was offen
ist.** Bei jedem Patch und jedem Release aktualisieren und mit hochladen (Benutzerwunsch).

Stand: 30.09.2026, Version 0.9.0 (Rang-Modus veröffentlicht).

## Gerade in Arbeit: Rang-Modus für ARAM Mayhem

Wunsch des Benutzers: echte Ränge wie in einem Ranked-Modus, später vielleicht öffentlich für alle.

**Entschieden (vom Benutzer):**

- Neufassung 04.10.2026 (Vorgaben des Benutzers): versteckte Wertung (MMR) ab Spiel 1, nie sichtbar; sichtbarer Rang erst nach 5 Spielen, Einstufung höchstens S I (= Emerald I); SSS und MAYHEM so schwer wie Grandmaster und Challenger (Apex ohne Divisionen); Note F–MAYHEM je Spiel unabhängig vom Rang; Leistungs-Wertung = Durchschnitt der Noten; Sieg/Niederlage völlig egal; alle Stats zählen (kein Platz 1–10, damit Supporter und fast gleich gute Spieler nicht bestraft werden). Stufen D, C, B, A, S, SS, SSS, MAYHEM = Iron+Bronze, Silver, Gold, Platinum, Emerald, Diamond+Master, Grandmaster, Challenger nach Seltenheit; Divisionen IV–I zu 100 MP bis SS. Riots Richtlinien verbieten Alternativen zur offiziellen Rangliste (MMR/Elo): die versteckte Wertung ist nur intern, vor einer öffentlichen Version Riot fragen.
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
2. Note je Spiel `src/features/aram/aramPerformance.ts`: alle Stats als Anteil der Lobby, verglichen mit dem, was der Champion üblicherweise erreicht (`aramBase.ts`, erzeugt mit `node server/tools/perf-base.ts`, Client offen, je Saison neu), stufenlos, als Perzentil → F…MAYHEM. Rang `aramRating.ts`: versteckte Wertung (`updateMmr`, Kalman), Rang erst nach 5 Spielen, MP aus dem Abstand der Note zur Erwartung des Rangs, LoL-Größen, Lücke versteckte Wertung–Rang (+27/−13), Apex-Tor (`gateOf`), Saisons. `standings()` ist deterministisch. Tests: `aramRating.test.ts`.
3. Werkzeuge in `server/tools/`: `champion-roles.mjs` (Rollen aus Data Dragon), `perf-base.ts` (Tabelle der Champions aus den Spielen des Clients), `emblems.mjs`, `check-mayhem.mjs` (Riots Web-API mit eigenem Entwickler-Schlüssel in `RIOT_API_KEY`).

4. Oberfläche: Seite „Rang“ (Unterreiter Rangliste · Mein Verlauf · Gruppe), Noten-Abzeichen (`GradeBadge.tsx`) auf der Rangliste, im Verlauf und auf der Karte nach dem Spiel, Leistung Ø; vor dem Rang nur „?“ und „Einstufung n/5".

5. Etappe 4: Rang-Band auf der Karte nach dem Spiel (`RankStrip.tsx`, auch im Popout und im Dialog), eigener
   Rang im ARAM-Widget auf Home. Wappen einzeln in `TierEmblem.tsx` (das Popout lädt nicht die Rang-Seite).

**Nächste Schritte:**

- CC-Zeit (und weitere Werte) in `AramSeat`/`aram.json` v4 aufnehmen und ins Gewicht setzen (`RATING_VERSION` 3); die Rechnung läuft bisher ohne CC.
- Kalibrierung: `SKILL_SD` (0,70) und `TAU` (0,89) stammen von nur 8 Spielern mit ≥ 8 Spielen; mit mehr Daten neu messen, die Stufen hängen daran.
- Runde „Hidden MMR“ nativ prüfen, sobald die neue Version läuft (Karte nach einem echten Spiel, Popout).
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

- 04.10.2026: Rangsystem neu (Vorgaben des Benutzers): Note F–MAYHEM je Spiel nach Champion-Vergleich statt Plätze, versteckte Wertung (Kalman), Rang nach 5 Spielen, Apex-Tor für SSS/MAYHEM, Leistungs-Wertung; `aramBias.ts` und `mark-bias.ts` ersetzt durch `aramBase.ts` und `perf-base.ts`.

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
