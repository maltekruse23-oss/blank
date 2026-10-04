# Notizen für die nächste KI

Aktuelle zusammenhängende Übergabe: [CLAUDE-HANDOFF-MAYHEM.md](CLAUDE-HANDOFF-MAYHEM.md).
Sie dokumentiert auch den getrennten Website-Ratingstand und die noch offene Statistikseiten-Recherche.

## Eigene Domain mayhemstats.lol — 04.10.2026

- Der Benutzer hat `mayhemstats.lol` bei Porkbun gekauft. App (`aram_website.rs`, `aram_archive.rs`), Collector (`engine.rs`), API-Anleitung, `API.md` und die Archiv-Skripte zeigen jetzt auf `https://mayhemstats.lol`. Die Website selbst nutzt nur `url.origin` und läuft unter beiden Adressen.
- Reihenfolge: Codex verbindet die Domain (`DEPLOY.md`), der Benutzer setzt die DNS-Einträge, erst wenn `https://mayhemstats.lol/api/leaderboard` antwortet, mergen und ein App-Release bauen. Die alte `*.chatgpt.site`-Adresse muss für ältere App-Versionen weiter antworten.
- Riot-Anfrage: Antragstext und Impressum-Vorlage liegen in einem Claude-Dokument des Benutzers (nicht im Repo); Product URL dort `https://mayhemstats.lol`. Riots Antwort steht noch aus.

## Etappe 6 (Teil 3): Karte nach dem Spiel mit dem Rang der Website — 04.10.2026

- Die Karte (Rang-Band `RankStrip`, Popout und Dialog, auch „Ansehen“) rechnet den Schritt jetzt aus den Spielen des eigenen Website-Profils plus den Spielen auf diesem PC, die die Website noch nicht hat (`rankGames` in `aramSite.ts`; gleicher Code, gleiche Spiele, also derselbe Schritt, den die Website nach dem Upload zeigt). Ohne Profil auf der Website oder ohne Upload-Erlaubnis wie bisher lokal ab dem Gruppenstart.
- Beim Spielende nimmt `boardForCard` (`useSiteRanks.ts`) die letzte Antwort der Website, egal wie alt (neuere Spiele kommen ja vom PC), und schaut im Hintergrund neu; ohne jede Antwort ein Blick mit höchstens 3 s Wartezeit, sonst lokal.
- Test: `aramSite.test.ts` („shows on the card after a game …“): Website ohne das neueste Spiel + neuestes Spiel vom PC = Schritt aus allen Spielen. Etappe 6 ist damit fertig; Release 0.9.2 macht der Benutzer.

## Etappe 6 (Teil 2): die App zeigt die Ränge der Website — 04.10.2026

- Mit erlaubtem Website-Upload liest die App die Ränge von der Website (eine Wahrheit für alle): Rust `aram_site_ranks` (`aram_website.rs`) holt `GET /api/leaderboard` (global, laufende Rating-Saison) und das eigene Profil `GET /api/players/<eigene PUUID>`; `aram_site_profile` holt das Profil eines Spielers für den Spieler-Dialog, die App fragt nur nach Spielern, die die öffentliche Rangliste schon zeigt. Ohne Upload-Erlaubnis geht nichts an die Website und alles bleibt lokal. Antwort ≤ 16 MB, nur GET, keine Weiterleitungen, PUUID nur aus Buchstaben, Ziffern, `-`, `_`.
- Frontend: `src/adapters/aramSite.ts`, Prüfung und Zusammenführung `src/features/aram/aramSite.ts` (`parseBoard`, `parseProfile` streng; `combine`: Website für alle, die sie kennt, sonst lokal; `Ranked` statt `Standing` in Rangliste, Mein Verlauf, Spieler-Dialog und Home-Widget), Hook `useSiteRanks.ts` (gemeinsamer Stand für Home und Rang, beim Öffnen, beim Zurückkehren höchstens alle 2 min und nach bestätigtem Upload; kein Polling, nichts bei verstecktem Fenster). Rang-Seite nennt die Quelle („Ränge von der Website · Stand“, bei Fehler der Hinweis auf die lokale Rechnung).
- Folge: der Rang ist global (alle hochgeladenen Spiele der Saison), ein Neustart der App-Gruppe setzt ihn nicht mehr zurück, solange die Website antwortet. Die Karte nach dem Spiel: siehe Teil 3.
- Website: `open`/`summary` aus `src/api.ts` nach `apps/mayhem-site/src/summary.ts` verschoben (gleiches Verhalten), damit `src/features/aram/aramSite.test.ts` die App genau gegen diese Form prüft (gleicher Rang, Spiele, Form, letzte Spiele, Verlauf).
- Geprüft: `pnpm build/lint/test`, Website tsc/lint, `cargo check` und Clippy für `x86_64-pc-windows-msvc` unter Linux (Rust-Tests nur in der CI unter Windows).

## Etappe 6 (Teil 1): neue Rang-Icons in App und Website — 04.10.2026

- Der Benutzer hat die Rangrahmen F–MAYHEM geliefert (1254 px, schwarzer Hintergrund). Freigestellt (Benutzerwunsch: Hintergrund weg, keine runde Maske) mit `node server/tools/emblems.mjs <Ordner mit 01-F.png … 10-MAYHEM.png> <Ziel>`: neuer Zweig für schwarze Matte (`unmatte`): Hintergrund = fast schwarze Flächen am Rand oder größer als 0,1 % des Bildes (Löcher in Buchstaben), feine dunkle Linien der Kunst bleiben; am Rand Alpha aus der Helligkeit gegen das hellste Nachbarpixel der Kunst und Farbe durch Alpha geteilt, deshalb kein schwarzer Saum. Geprüft auf dunklem, hellem, rotem und Schachbrett-Grund und bei 48 px.
- App: `src/features/aram/emblems/*.png` ersetzt (D–MAYHEM in `TierEmblem`; F/E liegen mit, ungenutzt – Benutzer: die neuen Icons nur für Ränge, die Noten/Leistung haben eigene Icons), `mix-blend-mode: screen` an `.rank-emblem` entfällt (die Bilder sind jetzt durchsichtig).
- Website: `TierMark` zeigt das Bild aus `public/ranks/<stufe>.png` statt der Buchstaben im Stein; ohne Rang bleibt das „?“. Die Noten-Icons (`public/grades/`, alte Wappen) bleiben unverändert, wie in PLAN.md vorgesehen.
- Lokal geprüft: Rangliste, Profil, `/wertung` bei 1400 und 375 px ohne Querscrollen, alle Rang-Bilder geladen; App-Vorschau Rang/Mein Verlauf. Auf hellem Grund verlieren helle Buchstaben (D, MAYHEM) an Kontrast; App und Website sind dunkel.

## Website Etappe 5 (Abschluss): Barrierefreiheit, Rauchtest, Übergabe — 04.10.2026

- axe (WCAG 2.1 AA + Best Practice) über alle Seiten bei 1400 und 375 px mit erfundenen Daten: einziger Befund war `--faint` (3,4–3,9 : 1), jetzt `#7e8f84` (≥ 4,5 : 1 auf allen Flächen; in der hervorgehobenen Zeile der Spiel-Seite gilt `--muted`). Suchfeld hat einen sichtbaren 2-px-Fokusring. Unbekannte Adressen zeigen `app/not-found.tsx` (deutsche Karte statt Englisch ohne CSS). Danach axe ohne Befund; Tastatur-Durchlauf: jeder Halt sichtbar und benannt. Skripte nicht im Repo (Playwright + axe-core im Scratch).
- `apps/mayhem-site/tests/smoke.mjs`: jede Seite und jeder Lese-Endpunkt, leer bzw. wie die DB ist, 404/400-Fälle, dann drei erfundene Spieler in einer Gruppe (Spiele kurz nach dem Gruppenstart), Spiel-Seite gibt nur die PUUID des Spielers mit Profil heraus, am Ende gelöscht und überall weg (auch aus den gespeicherten Seiten).
- Bekannt, auch auf main: ein zweiter Lauf von `tests/integration.mjs` gegen dieselbe laufende Vorschau scheitert mit „Your worker restarted mid-request“ (wrangler/miniflare lokal). Vorschau mit frischer D1 neu starten.
- Übergabe an Codex: `apps/mayhem-site/DEPLOY.md` (Projekt-ID behalten, `public/downloads` übernehmen, Migrationen 0003–0005, Prüfungen danach). Nächste Etappe laut PLAN.md: 6 (App zeigt Ränge von der Website, dann Release 0.9.2).

## Website Etappe 5 (Teil 2): Aufräumen — 04.10.2026

- Aus der Sites-Vorlage entfernt, weil nichts sie nutzt: `components/` (shadcn), `components.json`, `examples/`, `hooks/`, `lib/utils.ts`, drei Vorlagen-SVGs, Tailwind samt `postcss.config.mjs` (die Seite hat ihr eigenes CSS ohne Tailwind) und 21 ungenutzte Pakete. Gebautes CSS ist byte-gleich (MD5 vorher/nachher geprüft).
- Bleibt: `lib/connector*`, `build/`, `scripts/` (Sites-Hosting und Vorschau brauchen sie).
- Paketname **nicht** geändert: wrangler nimmt ihn als Worker-Namen (`dist/server/wrangler.json`), ein neuer Name könnte beim Veröffentlichen eine zweite Site anlegen. Nur zusammen mit Codex beim Veröffentlichen ändern, falls gewünscht.
- Lokale Prüfung: `wrangler d1 execute` nie gegen die laufende Vorschau (der Worker startet dann mitten in Anfragen neu); erst Server stoppen, Migrationen anwenden, starten, ein paar Sekunden warten.

## Website Etappe 5 (Teil 1): Seiten zwischenspeichern — 04.10.2026

- Rangliste, Startseite, Rekorde, Champions (auch einzeln) und Gruppenseite kommen aus der neuen Tabelle `snapshots` (Migration **0005**, beim Veröffentlichen über Codex mit anwenden). Logik `apps/mayhem-site/src/snapshot.ts` (`snapshotKey`, `isFresh`, Test `src/features/aram/siteSnapshot.test.ts`), `cached()` in `src/api.ts`.
- Gültig, solange kein neues Ereignis in `events` steht (Upload, Neustart, Ausblenden, Beitritt, Löschen) und höchstens 5 Minuten (Zeitfenster der Startseite, Namens-/Symbolwechsel ohne neues Spiel). Der Ereignis-Stand wird vor dem Rechnen gelesen, ein Upload währenddessen rechnet beim nächsten Aufruf neu. Über 1,5 MB wird nicht gespeichert. Löschen eines Spielers und Ausblenden leeren die ganze Tabelle (keine alten Daten liegen herum).
- Live-Strom fragt alle 5 s statt 2 s (PLAN.md). `tests/integration.mjs` prüft, dass ein Upload die gespeicherte Rangliste sofort ersetzt.
- Spieler- und Spielseite bleiben ungespeichert (rechnen nur einen Spieler bzw. ein Spiel).

## Website Etappe 4 (Abschluss): Leerzustände und Handy — 04.10.2026

- Alle Seiten mit leerer und gefüllter lokaler D1 bei 375 px und 320 px geprüft (Skript nicht im Repo; Playwright, Breite des Dokuments gegen Fensterbreite). Behoben: Navigation und Reiter (`.tabs`) brechen auf dem Handy um, statt Einträge unsichtbar seitlich zu verschieben; „So funktioniert's“ bei 320 px (Notenreihe, versteckte Tabellenüberschrift, `.table-wrap` jetzt `position: relative`); API-Anleitung (lange Adressen brechen um); Histogramm der Stufen zeigt auf schmalen Schirmen „M“ statt „MAYHEM“; Apex-Karten nennen je Stufe ihr LoL-Gegenstück.
- „Nicht gefunden“ (Spieler, Spiel, Gruppe, Champion, ungültige ID) ist eine eigene Karte mit „Zur Startseite“/„Zur Rangliste“ (`Problem` in `app/ui/bits.tsx`, `useLive` meldet `missing` bei 404); andere Fehler mit „Neu laden“.
- Anfragelimit (30/min je IP) nur noch für Schreibzugriffe, wie in PLAN.md vorgesehen: Lesen der Seiten lief in der Prüfung nach wenigen Seitenwechseln in 429. `tests/integration.mjs` prüft beides; API.md, API-Anleitung und Datenschutzseite angepasst.
- Etappe 4 damit fertig. Nächste: Etappe 5 (Feinschliff, Snapshots, Übergabe an Codex).

## Website Etappe 4 (Teil 3): Gruppe mit Duell — 04.10.2026

- Neue Seite `apps/mayhem-site/app/gruppe/[code]/page.tsx` (Link „Zur Gruppenseite“ auf der Rangliste, sobald ein Gruppencode gesetzt ist): Rangliste der Gruppe (Zeile `app/ui/player-row.tsx`, auch auf der Startseite), Duell zweier Mitglieder (Radar beider Spieler übereinander – `Radar` hat dafür `compare` –, wer auf welcher Achse vorn liegt, Bestwerte je Rekord-Kategorie, gemeinsame Spiele mit Note Ø und „bessere Note im selben Spiel“), Spielabende (Pause über 3 h trennt; je Spieler Spiele, MP-Bilanz, beste Note; nur Einstufung = „Einstufung“).
- Endpunkt `GET /api/gruppe/<12 Zeichen>` (`src/api.ts`, `groupPage()`), reine Logik `src/group.ts` (`membersOf`, `duelOf`, `sessionsOf`), Test `src/features/aram/siteGroup.test.ts`. Nur Mitglieder ab dem Start der Gruppe, also nur Spieler mit Profil. Keine Migration.
- Lokal geprüft mit einer erfundenen Gruppe aus vier Spielern und gemeinsamen Spielen (lokale D1): 1400 px und 375 px ohne Querscrollen, unbekannter Code zeigt „Gruppe nicht gefunden“.
- Offen in Etappe 4: Leerzustände und Handy über alle Seiten.

## Website Etappe 4 (Teil 2): Startseite — 04.10.2026

- `/` ist jetzt die Startseite (`apps/mayhem-site/app/start.tsx`), die Rangliste zieht nach `/rangliste` (Navigation, „Zur Rangliste“ nach dem Ausblenden). Profile und Spiele markieren weiter „Rangliste“ in der Navigation.
- Inhalt: große Suche (die Suche im Kopf entfällt auf `/`), Kopfzahlen (Spiele, Spieler, MAYHEM-Noten der Saison), Spiele des Tages (drei beste Noten der letzten 24 h mit Splash, Link aufs Spiel), Top 10 der Rangliste, Noten der Saison als Histogramm, neue Rekorde der Woche (Platz 1 der letzten sieben Tage, höchstens vier). Ränge sind öffentlich (Benutzerentscheidung), deshalb Top 10 nach Rang.
- Endpunkt `GET /api/start` (`src/api.ts`, `start()`), reine Logik `src/start.ts` (`startView`, `freshRecords`), Test `src/features/aram/siteStart.test.ts`. Nur Spiele aus `games`, also nur Spieler mit Profil. Keine Migration.
- Lokal geprüft mit acht erfundenen Spielern (lokale D1): leer und gefüllt, 1400 px und 375 px ohne Querscrollen.

## Website Etappe 4 (Teil 1): So funktioniert's — 04.10.2026

- Neue Seite `apps/mayhem-site/app/wertung/page.tsx` (in der Navigation, „Mehr dazu“ unter „So zählt es“ auf der Rangliste): Note (fünf Achsen mit Gewicht, Champion-Vergleich, Supporter, Remake/abwesend, Seltenheit jeder Note mit Noten-Icon), Leistung Ø, Rang (Stufen mit Aufbau, Anteil, LoL-Gegenstück, MP je Spiel), MP je Spiel (Kletter-Beispiel, Aufstieg/Abstieg, Schutz), Saisons, versteckte Wertung (nie gezeigt), häufige Fragen.
- Jede Zahl kommt aus dem Rechenkern (`apps/mayhem-site/src/explain.ts`: Anteile aus `GRADES`, Gewichte aus `WEIGHTS`, Stufen-Anfänge und Seltenheit aus `rankOf`/`muOf`/`phi`, Kletter-Beispiel aus `pointsFor`, Saisonstarts aus `seasonOf`); Test `src/features/aram/siteExplain.test.ts`. Ändert sich die Wertung, ändert sich die Seite mit; nur die LoL-Gegenstücke und Texte stehen fest in der Seite.
- Keine Daten, keine API, keine Migration. Lokal geprüft: 1400 px und 375 px ohne Querscrollen, Tabelle passt auf dem Handy.
- Nächste Teile von Etappe 4 laut PLAN.md: Startseite, Gruppe mit Duell, Leerzustände, Handy.

## Website Etappe 3 (Abschluss): Namen ausblenden — 04.10.2026

- Seite `apps/mayhem-site/app/datenschutz/entfernen/page.tsx` (Link unter jeder Spiel-Seite, `?spiel=<id>` vorausgefüllt, und von der Datenschutzseite), Endpunkt `POST /api/ausblenden` `{ gameId, name }` (`src/api.ts`, `hide()`): die Riot-ID muss in diesem hochgeladenen Spiel vorkommen (Archiv, Hochladende, ihre Freunde in `with`; Tag nötig, Groß-/Kleinschreibung egal), gespeichert wird nur die PUUID in `hidden_players` (Migration 0004, beim Veröffentlichen über Codex anwenden).
- Missbrauchssicher, weil Ausblenden nur weniger zeigt: kein Identitätsnachweis nötig. Spieler mit Profil (Zeilen in `games`) werden so nie ausgeblendet (409, sie löschen mit ihrem Schlüssel). Wer selbst hochlädt, wird wieder genannt (Upload löscht die Zeile). Wieder einblenden sonst nur der Betreiber (`DELETE FROM hidden_players WHERE puuid=…`).
- Wirkung überall: `entries()` (Rangliste, Profil, Rekorde, Champions, `/api/games`), Live-Strom, Export, Spiel-Seite (`gameView(…, hidden)`: Name `null`, Werte bleiben). Logik in `src/hidden.ts`, getestet in `src/features/aram/siteHidden.test.ts` und im Integrationstest.
- Lokal geprüft (lokale D1): Integrationstest grün, Formular mit Fehler und Erfolg, 1400 px und 375 px ohne Querscrollen.

## Website Etappe 3 (Rest): Augment-Namen und -Symbole — 04.10.2026

- Quelle bleibt der League-Client (`cherry-augments.json`, wie für die App-Karten); Data Dragon hat keine Mayhem-Augments. Die App schickt nach den Spielen die Augments bestätigter Spiele mit Name, Seltenheit und Symbol an `POST /api/augments` (`aram_website.rs`: `missing_augments`, `sendable`, bestätigte IDs in `aram-website.json` → `augments`, also nur einmal). Wirkt erst mit der nächsten App-Version; bis dahin zeigt die Website die Nummer bzw. „?“.
- Website: Tabelle `augments` (Migration 0003), `src/augments.ts` (strenge Prüfung: nur echte PNG bis 24 KB/256 px, Name ohne Steuerzeichen und `<>`, nur Augments aus hochgeladenen Spielen, erster Name bleibt), `GET /api/augments`, Symbol `GET /api/augments/<id>.png` außerhalb des Anfragelimits. Spiel-Seite: Augments aller zehn aus dem Archiv (`playerAugment1–6`), sonst der Hochladenden, unter den Items; Champion-Seite: Symbol und Name. Ring in der Farbe der Seltenheit.
- Tests: `src/features/aram/siteAugments.test.ts`, Rust-Tests in `aram_website.rs` (nur unter Windows ausführbar; unter Linux nur `cargo check`/Clippy für das Windows-Ziel geprüft).
- Lokal geprüft mit erfundenen Augments und Symbolen (lokale D1): 1400 px und 375 px ohne Querscrollen, keine Konsolenfehler.

## Website Etappe 3 (Teil 3): Champions — 04.10.2026

- Neue Seiten `apps/mayhem-site/app/champions/page.tsx` (in der Navigation) und `app/champions/[name]/page.tsx`, Endpunkte `GET /api/champions` und `GET /api/champions/<Data-Dragon-Key oder ID>` (`src/api.ts`). Zeitraum und Gruppencode wie bei den Rekorden (gemeinsam in `app/ui/filters.tsx`).
- Tabelle: Spiele, Note Ø, Anteil SSS/MAYHEM, Ø Schaden/Min, Rolle; sortierbar, Suche und Rollenfilter. Gezählt wird jeder Platz eines Spiels mit den Werten aller zehn (Lobby des vollständigsten Uploads, ohne Namen), Note nach derselben Regel wie überall (`lobbyPerformances`); Remakes nicht, Spiele ohne Lobby nur als Spiel ohne Note. Unter 5 gewerteten Spielen keine Werte („wenige Daten“, `MIN_GAMES`).
- Champion-Seite: Bestenliste, Augments nach Ø Note (nicht Siegquote) und die fünf besten Spiele, nur aus hochgeladenen Spielen, also nur Spieler mit Profil; keine anderen PUUIDs. Augments erscheinen als Nummer (Namen/Symbole kennt nur die App, offen).
- Reine Logik in `apps/mayhem-site/src/champions.ts`, getestet in `src/features/aram/siteChampions.test.ts`.
- Lokal geprüft mit erfundenen Spielern (lokale D1): 1400 px und 375 px ohne Querscrollen. Data Dragon in der Prüfumgebung gesperrt, Bilder nicht im Bild gesehen. Die Konsolenmeldung „RSC prefetch setup error“ kommt von vinext-Links und erscheint genauso auf `/rekorde`.

## Website Etappe 3 (Teil 2): Rekorde — 04.10.2026

- Neue Seite `apps/mayhem-site/app/rekorde/page.tsx` (in der Navigation) und Endpunkt `GET /api/rekorde` (`src/api.ts`, `records()`): je Kategorie eine Karte in der Farbe ihrer Art (Tokens `--game-*` wie in der App), Platz 1 groß mit Splash des gespielten Skins (Standard-Splash als Ersatzebene), Krone, Wert und „Spiel ansehen“ (`/spiel/<id>?p=<puuid>`), darunter Plätze 2–10 mit Link zum Profil und zum Spiel. Zeitraum „Alle Zeiten“ (Standard) oder „Diese Saison“ (`seasonOf`), Gruppencode wie auf der Rangliste. „Neu diese Woche“ als Leiste oben (Platz 1 aus den letzten sieben Tagen) und „Neu“ an jedem Platz.
- Reine Logik in `apps/mayhem-site/src/records.ts` (`RECORDS`, `recordsView`), getestet in `src/features/aram/siteRecords.test.ts`: gleiche Kategorien, Reihenfolge und Werte wie `recordCategories`/`ranking` der App, Gleichstand = gleicher Platz, fehlende Details nie 0, keine PUUIDs aus `with`. Neue Rekord-Kategorie in der App → auch in `RECORDS` (Test schlägt sonst fehl).
- Nur Spiele aus `games` (Hochladende), also nur Spieler mit Profil; Name und Symbol aus `players`.
- Lokal geprüft mit erfundenen Spielern (lokale D1): 1400 px und 375 px ohne Querscrollen, keine Fehler in der Konsole. Data Dragon in der Prüfumgebung gesperrt, Splash und Champion-Bilder deshalb nicht im Bild gesehen.

## Website Etappe 3 (Teil 1): Spiel-Seite — 04.10.2026

- Neue Seite `apps/mayhem-site/app/spiel/[id]/page.tsx` und Endpunkt `GET /api/spiel/<gameId>` (`src/api.ts`, `game()`): Kopf mit Kills je Seite, Sieg/Niederlage, Datum, Dauer, Patch; beide Teams untereinander mit Riot-ID, Note (gleiche Regel für jeden Sitz), MVP, K/D/A, Schaden, Gold, Items; Vergleichsbalken (Schaden, Eingesteckt, Heilen & Schilde, Gold); „Warum diese Note“ mit den fünf Achsen gegen den Champion-Schnitt, Wahl per Klick auf die Note. `?p=<puuid>` hebt einen Spieler hervor (Link aus dem Matchverlauf des Profils: „Ganzes Spiel ansehen“).
- Namen aller zehn aus dem Rohdatenarchiv (R2, gzip, `participantIdentities` mit gameName/tagLine). Ohne Archiv: Werte aus dem vollständigsten Upload, Namen nur der Hochladenden und ihrer Freunde (Hinweis auf der Seite). Nur Spiele mit mindestens einem Upload; reine Archiv-Spiele bleiben unsichtbar. PUUID nur bei Spielern mit eigenem Profil (Zeilen in `games`), sonst nie.
- Reine Logik in `apps/mayhem-site/src/game.ts` (`gameView`, `seatEntry`), getestet in `src/features/aram/siteGame.test.ts` (auch: Note je Sitz = Note der Lobby-Ansicht im Profil).
- Datenschutzseite nennt die Spiel-Seiten; Entfernen eines Namens vorerst per Issue an den Betreiber (kein Mechanismus im Code). Augment-Symbole fehlen: die Website hat nur Augment-IDs, Namen und Symbole kennt nur die App.
- Lokal geprüft mit erfundenen Spielern (lokale D1 + lokales R2, ein Spiel archiviert, eins nicht): 1400 px und 375 px ohne Querscrollen. Data Dragon war in der Prüfumgebung gesperrt, Champion- und Item-Bilder deshalb nicht im Bild gesehen.

## Website Etappe 2: neue Gestaltung, Rangliste, Profil — 04.10.2026

- `apps/mayhem-site/app/globals.css` neu: Tokens (Flächen, Text, Akzent, Farbe je Note `--grade-*` und Stufe `--tier-*`), keine festen Farben in Komponenten. Kopf mit Navigation und Spielersuche (`app/ui/header.tsx`), Fußzeile mit Riot-Hinweis (eigene Formulierung).
- Rangliste (`app/ranking.tsx`): Apex-Karten (MAYHEM ab 800 MP, SSS ab 400 MP), Tabelle nach Rang oder Leistung Ø, Champions, Form (letzte 6 Noten), Verteilung als Histogramm, „So zählt es“, Mitmachen (Archiv-Zähler, Collector).
- Profil (`app/players/[puuid]/page.tsx`): Rang-Karte, MP-Verlauf der Saison mit Stufenlinien und Auf-/Abstieg, Radar der fünf Notenachsen (Abstand zum Champion-Schnitt, letzte 20), Spielstil-Abzeichen, Form, Matchverlauf zum Aufklappen auf alle zehn (Note je Sitz nach derselben Regel, MVP = beste Note), Champions-Tabelle, Saisons.
- Reine Ansichten in `apps/mayhem-site/src/insights.ts`, getestet in `src/features/aram/siteInsights.test.ts`. API: Leaderboard liefert zusätzlich `icon` und `champions` (Top 3).
- Rang-Zeichen bis zu den neuen Rang-Icons des Benutzers: Buchstaben in einer Stein-Form in Stufenfarbe (`TierMark`). Die zehn Wappen liegen als Noten-Icons in `public/grades/` (256 px); `public/emblems` entfernt.
- Namen in einem Spiel: nur Spieler aus `with` (Freunde im Spiel) und der Spieler selbst; die anderen erscheinen mit Champion-Namen, weil `lobby` keine Riot-IDs enthält (Benutzerwunsch Riot-IDs aller zehn: braucht die Rohdaten aus dem Archiv, Etappe 3).
- Lokal geprüft mit echten Spielen aus der App (nur lokale D1): Desktop 1400 px und Handy 375 px ohne Querscrollen, Integrationstest grün, Build grün.

## Website: neue Seite geplant, Etappe 1 (gleiche Wertung wie die App) — 04.10.2026

- Plan der neuen öffentlichen Website: `apps/mayhem-site/PLAN.md` (Seiten, Gestaltung, Technik, Etappen 1–6). Benutzer: Ränge sofort öffentlich, alle zehn Spieler mit Riot-ID; die heutigen zehn Wappen werden Noten-Icons, neue Rang-Icons liefert der Benutzer.
- Etappe 1: Die Website rechnet mit einer Kopie des App-Kerns (`aramRating.ts`, `aramPerformance.ts`, `aramBase.ts`, `championRoles.ts`; `node server/tools/sync-site-core.mjs`), `siteCore.test.ts` prüft Gleichheit. Alte Kopie v1 (`aramBias.ts`) entfernt. API gibt `wins`, `placed`, `climbing`, `average`, `seasons` und je Spiel die Note statt 0–10 aus; nie `hidden`. Neue Saison-Zeile `v3` entsteht beim ersten Aufruf von selbst, alte Daten bleiben. Lokal geprüft: `tests/integration.mjs` (Parität mit `standings`/`rankResult`) grün; lokale D1 vorher mit `wrangler d1 migrations apply DB --local` (temporäre Konfiguration mit `migrations_dir: drizzle`). Veröffentlichen nur über Codex/Sites.

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
