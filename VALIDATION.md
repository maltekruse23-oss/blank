# Prüfstand — 22. September 2026 (native Windows-Prüfung)

## Umgebung

Windows 11 Home 10.0.26200 (x64, 96 DPI), WebView2 153.0.4234.48, Node.js 24.19.0, pnpm 11.25.0, Rust 1.98.1 (stable-x86_64-pc-windows-msvc, rustup 1.29.1), Visual Studio Build Tools 2022 17.14 mit „Desktopentwicklung mit C++“ und Windows SDK 10.0.26100. `pnpm tauri info` meldet keine fehlenden Voraussetzungen. Aufgelöst: tauri 2.11.6, wry 0.55.1, tao 0.35.3, windows-sys 0.61.2.

## Erfolgreich

- `pnpm install --frozen-lockfile`, `pnpm build` (TypeScript strict + Vite), `pnpm format:check` und `cargo fmt --check`.
- `pnpm desktop:build`: Release-Build ohne Compiler-Warnungen, `src-tauri/target/release/blank.exe` (~8,4 MB). `Cargo.lock` erzeugt und zur Versionierung vorgesehen.
- Nativer Start im echten Desktopfenster, Titel `blank.`, keine Konsole.
- Fenstergröße: Client-Fläche beim Start 860 × 640. Grenzen beim Ziehen siehe „Rahmenloses Fenster“.
- Maximieren: `WS_MAXIMIZEBOX` fehlt, „Maximieren“ im Systemmenü deaktiviert. Kein Vollbild.
- Transparenz: `WS_EX_LAYERED` mit `LWA_ALPHA` 235 aktiv. Gemessen gegen eine helle Referenzfläche hinter dem Fenster: effektive Deckkraft 0,918–0,926 je Farbkanal (Soll 0,922). Kein Click-through (`WS_EX_TRANSPARENT` fehlt), kein Always-on-top. Die Deckkraft bleibt auch nach Aus- und Einblenden erhalten.
- Lesbarkeit: Bei Start- und Mindestgröße sind Navigation, Überschriften, Werte und Mock-Hinweis klar lesbar. Vor hellen oder textreichen Fenstern scheinen deren Inhalte schwach durch (gewollte ~8 % Transparenz); das stört die Lesbarkeit der App-Texte nicht. Bei Bedarf `WINDOW_ALPHA` erhöhen.
- Browser-Vorschau bei 720 × 520 und 860 × 640: alle sechs Bereiche ohne horizontalen Überlauf und ohne Konsolenfehler.

## Zusammen schauen im eigenen Browser, Erweiterung (Benutzerwunsch)

Geprüft am 29.09.2026 in einer Cloud-Umgebung (Linux, Chromium 141 von Playwright, ohne Windows). Nicht nativ geprüft.

- `pnpm build`, `pnpm test` (47 Tests, neu: Raum-Code mit jedem einzelnen falschen, fehlenden, zusätzlichen und vertauschten Zeichen über 20 zufällige Codes, Verschlüsselung hin und zurück, Nachrichtenprüfung, MQTT-Pakete mit denselben Bytes wie die Rust-Tests in `watch.rs`, Kanal aus Tab-Adressen), `pnpm format:check`, `pnpm extension:build` (Hintergrund 13,5 kB, Fenster 5,8 kB, unminifiziert).
- Ende-zu-Ende mit zwei getrennten Browsern, beide mit der gebauten Erweiterung: 17 von 17 Prüfungen bestanden – Raum starten; mit beiden Vermittlern verbunden; leerer Raum übernimmt den Kanal des Tabs; Beitreten (Code klein geschrieben) lädt den Raum-Kanal im Tab; beide sehen sich; Wechsel im Tab ohne Neuladen (wie Twitch selbst navigiert) und per Link gehen an den anderen, mit „… hat auf … umgeschaltet“; zwei schnelle Wechsel enden bei beiden beim letzten, kein Hin und Her; Twitch-Seiten ohne Kanal (Directory) schalten nicht um; ein Vermittler fällt aus → Umschalten geht über den anderen; „Neu synchronisieren“ lädt den Tab des anderen neu; Verlassen meldet sich ab; die Letzte löscht den gespeicherten Kanal auf dem Vermittler; Tippfehler im Code erkannt; keine Konsolenfehler.
- **Blockiert:** Die echten Vermittler (HiveMQ, Mosquitto) und twitch.tv sind aus der Cloud-Umgebung nicht erreichbar. Getestet wurde deshalb mit zwei lokal nachgebauten MQTT-Vermittlern (WebSocket, QoS 0, aufbewahrte Nachrichten) und einer Kopie der Erweiterung, deren zwei Adressen auf diese zeigen; twitch.tv wurde durch eine leere Seite ersetzt. Offen, auf Windows zu prüfen: echte Vermittler, echtes twitch.tv, gemeinsamer Raum mit der Desktop-App, Weitermachen nach einer Pause des Hintergrunds durch den Browser.

## Rahmenloses Fenster (Benutzerauftrag)

Native Titelleiste und klassische Scrollbar ersetzt: `decorations: false`, eigene 36-px-Titelleiste (`src/app/TitleBar.tsx`) mit Minimieren/Schließen (Lucide), schmale abgerundete Scrollbar ohne Pfeile, die erst unter der Titelleiste beginnt. Neue Abhängigkeit `@tauri-apps/api` 2.11.1 (passend zu tauri 2.11). Capabilities nur `core:window:allow-start-dragging`, `allow-minimize`, `allow-close`.

- Release-Build ohne Warnungen; Client-Fläche 860 × 640; `WS_EX_LAYERED` mit Alpha 235 bleibt aktiv.
- Windows-11-Ecken abgerundet. Kein DWM-Schatten (bei Layered-Fenstern systembedingt).
- Resize-Hit-Tests an allen Rändern und Ecken korrekt (links/rechts/oben/unten/Ecke), Titelleiste ist Client-Fläche.
- Minimieren-Knopf per simuliertem Klick im WebView geprüft: Fenster minimiert, Wiederherstellen funktioniert.
- Doppelklick auf die Ziehfläche startet absichtlich kein Ziehen/Maximieren (`event.detail > 1` wird ignoriert).
- Browser-Vorschau bei 860 × 640: kein Body-Scroll, Scrollbereich ab 36 px, keine Fensterknöpfe (keine wirkungslosen Buttons), Konsole fehlerfrei.
- Abweichung: tao meldet bei rahmenlosen Fenstern `WM_GETMINMAXINFO` ohne die unsichtbaren 8-px-Resize-Ränder. Effektive Client-Grenzen beim Ziehen daher ca. 704 × 511 bis 984 × 751 statt 720 × 520 bis 1000 × 760. Layout bleibt in diesem Bereich überlauffrei.
- Nicht automatisiert geprüft: Ziehen des Fensters (Windows-Verschiebeschleife folgt der echten Maus), Schließen-Knopf. Manuell prüfen.

## Update-Knopf (Benutzerauftrag)

Prüfen über die GitHub-API (neuestes Release), Installieren nur auf Klick: Download von `blank.exe` aus dem Release (nur Adressen unter `github.com/maltekruse23-oss/blank/releases/download/`), Größe, `MZ`-Kopf und SHA-256 (Windows `BCryptHash`, keine neue Abhängigkeit) müssen zu GitHubs Angabe passen; dann laufende EXE → `.old`, neue an ihre Stelle, Einzelinstanz-Sperre freigeben, neue EXE mit `--after-update <pid>` starten, alte beendet sich. Titelleisten-Chip „Update“ öffnet die Settings. Automatische Prüfung 20 s nach dem Start und dann täglich (Einstellung „Automatisch nach Updates suchen“, Standard an).

- Rust-Tests (`cargo test`: 12): Versionsvergleich (`v0.10.0` > `v0.9.9`, keine Vorabversionen), Prüfsumme (bekannter SHA-256 von „abc“, falsche Daten/fehlender `MZ`-Kopf abgelehnt), Dateinamen neben der EXE.
- GitHub-API liefert für `blank.exe` von v0.2.0 `sha256:cf694840…`, identisch mit der heruntergeladenen Datei.
- Echtes Update durchgespielt: Test-EXE als Version 0.1.9 in einem Testordner → „Nach Updates suchen“ → „Version 0.2.0 verfügbar“ und Chip „Update“ → „Jetzt aktualisieren“ → Fortschritt 0 → 95 %, alte Instanz beendet, neue startet aus demselben Ordner, `blank.exe` hat danach genau GitHubs Prüfsumme, die neue Instanz meldet „App v0.2.0“. `blank.exe.old` blieb liegen, weil v0.2.0 das Aufräumen noch nicht kennt; die neue Version mit Updater löscht `.old` beim Start (geprüft mit `--after-update` und einer nicht mehr laufenden Prozess-ID).
- Deine App danach wieder regulär als 0.2.0 gebaut und gestartet.
- **Hinweis:** Wer noch v0.1.0 oder v0.2.0 hat, muss die erste Version mit Updater einmal von Hand laden; ab dann geht es per Knopf.

## ARAM: Gruppe mit Code, Karte nach jedem Spiel, Rangliste zählt hoch (Benutzerwünsche)

- Ursache fehlender Karten: `record_eog` gab „keine Karte“, sobald das Spiel schon gespeichert war – holte ein anderer Abgleich (Seite, Zurückkehren, Client-Start) das Spiel zuerst, fiel die Karte weg; ein alter Endbildschirm eines früheren Spiels beendete den Blick. Jetzt `carded` (Rust-Tests: genau eine Karte je Spiel, übersteht Speichern/Laden), Nachholen frischer Spiele (`catch_up`).
- Gruppe nativ mit echtem Vermittler (Release-EXE, CDP): „Gruppe erstellen“ → verbunden, Code angezeigt; ein Testskript als zweites Mitglied (gleiche Ableitung aus dem Code, eigenes MQTT über WSS zu HiveMQ) fand beim Vermittler den Start und das Mitglied der App (verschlüsselt), trat bei und schickte ein Spiel → in der App: Mitglied „Testfreund“, Spiel in `aram.json` (streng geprüft übernommen), Rangliste mit ihm. Die App reichte das Spiel des Testfreunds, das nur bei HiveMQ lag, selbst bei Mosquitto nach (Auffüllen je Vermittler). „Verlassen“ entfernte den eigenen Mitglieds-Eintrag beim Vermittler. Danach alle Test-Nachrichten bei beiden Vermittlern gelöscht, Einstellungen, `settings.json` und `aram.json` zeichengleich zurück.
- Rangliste in der Vorschau: erster Blick zählt von 0 hoch (mitten im Lauf Zwischenwerte, am Ende exakt), Kronen „Kiro 3 · Nova 2 · Pax 1“; ein älterer gesehener Stand mit anderem Ersten → Hochzählen mit Überholen, „Neue Nr. 1“, „+1“ bei Pentakills. Ein verdecktes Fenster (keine Bilder) hielt das Rennen an – daher beginnt es jetzt erst mit dem ersten sichtbaren Bild.
- Tests: `aramGroup.test.ts` (6: Code-Prüfung, Nachrichten nur passend zum Unter-Topic und mit echten Zeiten, bessere Fassung, gleiche Rangliste unabhängig von der Reihenfolge der Daten, nur Spiele ab Start, Hochzählen), `aram_group.rs` (2: Unter-Topics, Topics/Nutzlast), `aram.rs` (+3: Karte einmal, Prüfung fremder Spiele, beste Fassung). `pnpm test` 52, `cargo test` 57, `tsc`, `pnpm desktop:build`.
- **Nicht geprüft:** ein echtes Spiel mit echten Freunden in der Gruppe (braucht die neue Version bei allen); das echte Format des Endbildschirms eines Mayhem-Spiels (wie zuvor).

## Aufgeräumt: ein Einstieg, nichts doppelt (Benutzerwunsch „zweimal Settings“)

- Entfernt: Settings-Knopf in der Seitenleiste, „Fertig“ im Dock (bleibt oben), Reiter „Aussehen“ (seine Zeilen nur noch in der Suche), Taskleisten-Schalter und Stellen-Knöpfe unter Popouts (dafür „Platz · Hinziehen“ zum Popout-Werkzeug; der alte Text „Links auf der Taskleiste“ stimmte nicht mehr), totes CSS der Stellen-Auswahl, tote Bedingung für die frühere Settings-Seite. „Mehr“ im Dock heißt jetzt „Einstellungen“. Neu: Hinweis mit „Einschalten“ im Popout-Werkzeug, wenn Popouts aus sind. Dock mittig über dem Inhalt (verdeckte vorher den Kontoblock).
- Vorschau (`settings-flow2`): kein Settings-Knopf, ein „Bearbeiten“, ein „Fertig“; Dock → Einstellungen öffnet bei Meldungen über dem Dock, „Fertig“ oben erreichbar; kein Reiter „Aussehen“, Reiter in einer Zeile; Suche „akzent“ → Farben → Werkzeug; Esc-Reihenfolge; Konto → Twitch. „Hinziehen“ nur nativ (Popout-Einstellungen gibt es nur in der Desktop-App): Zeile „Platz“ da, „Hinziehen“ öffnet das Popout-Werkzeug, Einstellungen unverändert. **Nicht beobachtbar:** das Zuklappen der Schublade dabei – das Test-Fenster lag verdeckt hinter einem anderen Fenster (`visibilityState` hidden, WebView zeichnet nicht, Ausblend-Animationen warten); derselbe Weg (Suche → Farben → Bearbeiten) schließt sie in der Vorschau.

## Popout-Platz: echtes Popout springt beim Ziehen sofort mit (Benutzerwunsch „instant“)

- Vorher kam das echte Popout erst nach dem Loslassen (und musste dann evtl. erst sein Fenster bauen). Jetzt: beim Öffnen des Werkzeugs sichtbar (~160 ms bis zum fertigen Fenster), jede neu eingerastete Stelle wird sofort übernommen.
- Nativ gemessen (Fensterlage alle 5 ms): Das Popout-Fenster stand an der neuen Stelle, bevor der Test die geänderte Einstellung überhaupt auslesen konnte (unter ~25 ms); Taskleiste → oben rechts → zurück in die Taskleiste folgt jeweils sofort (die Seite des Popouts wechselt dabei in die Taskleisten-Zeile und zurück). Vorschau: „schon beim Ziehen übernommen (vor dem Loslassen)“ bestanden. Einstellungen danach zeichengleich zurück.

## Popouts und Vollbild je Bildschirm (Benutzerwunsch)

- Vorher: eine Abfrage beim Anzeigen, für alle Bildschirme zusammen; ein sichtbares Popout blieb stehen, wenn danach ein Video in den Vollbildmodus ging.
- Nativ (Release-EXE, zwei Bildschirme mit unterschiedlicher Skalierung): Test-Popout auf dem Popout-Bildschirm, dann ein randloses Fenster, das diesen Bildschirm ganz deckt und vorne ist → Popout nach ~520 ms weg (gemessen ab dem Start des Test-Programms, samt dessen Aufbau); währenddessen `flyout_show` = `false`; danach wieder `true` und sichtbar. Gegentest: Vollbild auf dem anderen Bildschirm → Popout bleibt, ein neues ist erlaubt. Ein Fenster, das den skalierten Bildschirm nur zu zwei Dritteln deckte (Test-Programm ohne Skalierungs-Bewusstsein), galt richtig nicht als Vollbild.
- `fullscreen.rs`: 5 Unit-Tests (vorderstes Fenster deckt den Bildschirm; nur dieser Bildschirm; normales Fenster davor beendet es; kleines Immer-oben-Fenster davor nicht; maximiert ist nie Vollbild). `cargo check`/`clippy` ohne neue Warnungen. Einstellungen gesichert und zeichengleich zurück, `aram.json` unverändert.

## Einstellungen und Bearbeiten-Modus zusammen, Popout ziehen mit Magnet (Benutzermeldungen „buggt“)

- Gefundene Fehler: Schublade verdeckte „Fertig“, Esc beendete den Modus auch bei offenem Dialog/Schublade, im Modus kein Seitenwechsel, Entf/Rücktaste auf einem Knopf im Widget löschte das Widget, Dock verdeckte das Seitenende. Popout-Miniatur „bewegt sich ganz komisch“: `layout`-Animation von motion lief bei jeder Mausbewegung neu gegen das Ziehen; ihre Schalter blockierten das Greifen.
- Headless-Chrome (Vorschau, 860 × 640): 16 Prüfungen zu Schublade/Modus/Esc/Suche/Seitenleiste/Tasten (`settings-flow`), alle bestanden. Popout-Bühne (`stage-drag`): Knopfzeile entfernt, Miniatur folgt der Maus (größte Abweichung 0,02 px, auch neben der Mitte gegriffen), Ziel-Punkt und Umriss leuchten beim Ziehen, rastet oben links genau auf dem Punkt ein und bleibt im Bildschirm, Taskleiste leuchtet und rastet ein, Klick ohne Bewegung ändert den Platz nicht.
- `pnpm test` 46, `pnpm format:check`, `tsc`.

## Bearbeiten-Modus statt Settings-Seite (Benutzerauftrag)

- Headless-Chrome gegen die Vorschau (860 × 640, Mock): PC-Status auf Twitch gezogen → beide tauschen Platz und Größe; Widget entfernt und aus der Bibliothek wieder hinzugefügt; Rückgängig nimmt das Hinzufügen zurück; Farben, Popout-Bühne (Mini-Bildschirm, sechs Stellen, Taskleiste), „Mehr“ als Schublade, „Fertig“ ohne Rahmen und Griffe – per Bildschirmfotos geprüft. Home scrollt nicht.
- `layout.test.ts` (9): Einrasten, Tauschen (auch verschieden große), passt nicht → unverändert, Mindestgröße, freier Platz, strenge Prüfung, Reihenfolge und Ausblenden der Seitenleiste.
- `pnpm test` 46, `cargo test` 47, `pnpm format:check`, `cargo fmt --check`, `pnpm desktop:build` ohne Warnungen.
- Nativ (Release-EXE, WebView2 über CDP, echte Daten): „Bearbeiten“ auf Home, Ziehen tauscht die Widgets, Rückgängig/Wiederholen, Popout-Bühne mit zwei Bildschirmen (Taskleisten-Popout an der Seite, die Windows nimmt: `taskbar_icons_left`, nur gelesen), Schublade „Mehr“, „Fertig“ ohne Rahmen; Home scrollt nicht. Einstellungen vorher gesichert und zeichengleich zurück, `aram.json` unverändert.

## ARAM-Karte direkt nach Spielende, Vergleich mit Freunden (Benutzermeldung)

- Vorher kam die Karte erst, wenn der Spielverlauf das Spiel kannte (bis gut 2 min). Jetzt: Warten auf das Ende des Spielprozesses, dann die EoG-Werte des Clients (einmal pro Sekunde, höchstens 60 s), Karte sofort; die vorläufigen Einträge ersetzt der Abgleich nach 150 s durch die Werte aus dem Spielverlauf. Unit-Test: EoG-Werte werden vorläufige Einträge mit Platz im Schaden, Team-Anteil und Freunden im Spiel.
- Karte mit Freunden: in der Vorschau (Mock mit zwei Freunden) Balken in Gold/Silber/Bronze, K/D/A, Hinweis bei eigenem Höchstwert; Höhe der Karte wächst mit (bis zu vier Freunde).
- **Nicht geprüft:** das echte Format der EoG-Werte in einem Mayhem-Spiel (erst beim nächsten echten Spiel; fehlen sie oder sind sie leer, greift der bisherige Weg über den Spielverlauf).

## Rangliste neu gestartet, mehr Spieler, Medaillenfarben (Benutzerwunsch)

- Neustart der echten Rangliste (Wunsch des Benutzers, über den neuen Knopf mit Rückfrage): vorher 30 Spiele (inzwischen im Hintergrund gesammelt), danach „0 Spiele · seit 28.09.26“; ein Abgleich direkt danach holte keins der letzten 20 Spiele aus dem Client zurück. 146 Augment-Symbole blieben. Die alte Sammlung liegt als Kopie außerhalb des Repos.
- Bis zu neun Freunde: in der Vorschau fünf hinzugefügt („5 von 9 Freunden“), alle Kategorien zeigen sechs Balken.
- Farben: zuerst je Spieler eine eigene Farbe gebaut, auf Wunsch des Benutzers („die klassischen Farben, 1 Gold usw.“) ersetzt durch Gold, Silber, Bronze für die Plätze, neutral danach und für 0 bzw. keinen Wert; jede Kategorie mit dezentem Farbton ihrer Art. Neue Tokens in `tokens.ts`, `themes.ts` und `tokens.css` (Design-Tests grün).
- `pnpm test` 37, `cargo test` 46 (neu: Neustart-Zeitpunkt übersteht Speichern/Laden, alte Sammlung ohne ihn liest sich als nie neu gestartet), `tsc`, `pnpm desktop:build` ohne Warnungen. Einstellungen des Benutzers gesichert und zeichengleich zurück.

## Animation beim X und beim Zurückholen (Benutzerwunsch)

Beim X: die App leuchtet auf, klappt zu einer Linie zusammen, wird zum glühenden Punkt, der mit Funkenschweif nach unten rechts (zum Symbol) schießt; dann versteckt sich das Fenster. Beim Zurückholen die Gegenrichtung mit Schockwelle und Funkenregen, die App federt auf.

- Nativ vom Bildschirm gefilmt (178 bzw. 215 Bilder, Kontaktbögen): Schließen ~0,78 s, Öffnen ~0,95 s, alle Phasen sichtbar; das Fenster bleibt dabei deckend (nur der eigene dunkle Hintergrund um die Linie).
- Danach an `.app` keine Transformation, kein Filter, keine laufende Animation; Klicks kommen an (Seitenwechsel geprüft).
- Nicht einzeln geprüft: X mit „Animationen“ aus (dann wie vorher sofort, ein einfacher Zweig im Code).
- `pnpm test` 37, `cargo test` 46, `tsc`, `pnpm desktop:build` ohne Warnungen. Einstellungen des Benutzers gesichert und zeichengleich zurück.

## X versteckt in den Infobereich (Benutzerwunsch)

Das X beendet blank. nicht mehr, sondern versteckt es im Infobereich; nur „Beenden“ im Menü des Symbols beendet (wie andere Apps).

- Nativ: nach dem X Fenster unsichtbar, Prozess läuft, Seite `document.hidden = true` (spart wie minimiert). Zweiter Start holt das Fenster zurück (149 ms, Seite wieder sichtbar), dreimal im Wechsel mit dem X.
- Fehler gefunden und behoben: zuerst blendete der zweite Start das Fenster von außen ein – danach tat das nächste X nichts, weil die App ihr Fenster noch für versteckt hielt. Jetzt bittet der zweite Start die laufende App über ein benanntes Ereignis, sich selbst zu zeigen (ein wartender Faden, kein Abfragen).
- Beenden über `app.exit` (derselbe Weg wie „Beenden“ im Menü, getestet über den Neustart für die Grafikkarte): alter Prozess endet, das X-Verhalten hält es nicht auf. Das Menü des Symbols selbst ließ sich nicht automatisch anklicken.
- Hinweis: Der erste Start einer frisch gebauten EXE kann einige Sekunden dauern (Prüfung durch Windows), bis sie die laufende App erreicht.
- `cargo test` 46, `pnpm test` 37, `pnpm desktop:build` ohne Warnungen. Einstellungen des Benutzers gesichert und zeichengleich zurück.

## Rangliste als Kategorien mit Balken (Benutzerwunsch)

Statt Tabelle und Rekord-Kacheln: je Kategorie eine Karte mit einem Balken pro Spieler. Hauptkategorien nach Wunsch des Benutzers; „maximales Leben“ steht nicht in den Spieldaten (alle Felder eines echten Spiels geprüft: nur Schaden, Heilung, Eingesteckt, Abgewehrt, Multikills, Krit, CC, Gold, Türme u. Ä.) – dafür „Größter Tank“.

- Echter Client: alle Felder eines Spiels gelesen (`magicDamageDealtToChampions`, `physicalDamageDealtToChampions`, `trueDamageDealtToChampions`, `timeCCingOthers` usw.). Beim ersten Abgleich mit der neuen Version bekamen alle 19 gespeicherten Spiele ihre neuen Werte (Version 2, 19 von 19 mit Details). Die Rangliste zeigt AP- und AD-Schaden getrennt je bestes Spiel.
- Browser-Vorschau mit vier fiktiven Spielern: sechs Karten füllen die Seite ohne Scrollen (594/594), Balken wachsen gestaffelt, Gleichstand = gleicher Platz, Auswahl der Kategorien (21) bleibt gespeichert, mehr als sechs Kategorien machen die Seite zur scrollenden Liste.
- `pnpm test` 37 (neu: Bestwert mit Spiel, Summen/Schnitte/Quoten, fehlende AP/AD-Werte nie als 0, Auswahl streng geprüft, Pentakill legendär, Rekord in anderer Kategorie), `cargo test` 46 (Details kommen mit), `tsc`, `pnpm desktop:build` ohne Warnungen. Einstellungen des Benutzers gesichert und zeichengleich zurück.

## Karte nach dem ARAM-Spiel (Benutzerwunsch)

Nach einem ARAM-Mayhem-Spiel erscheint eine Karte nach dem Vorbild des Bildes des Benutzers (eigene Gestaltung, kein fremdes Logo): Splash von Data Dragon, Schaden zählt hoch, Stats, Augments und Items bauen sich gestaffelt auf; besondere Spiele bekommen Abzeichen, Glanz und Leuchtrahmen, ein Rekord oder Platz 1 zusätzlich Krone und Funken.

- Browser-Vorschau (Chrome ohne Fenster, Einzelbilder bei 0,25/0,7/1,15/1,75/2,1/3,6 s): Schaden zählt hoch (25.291 → 88.777 → 94.843 → 95.120), Abzeichen, Hinweise und Glanz erst nach dem Aufbau (ein erster Fehler – eigene Deckkraft-Übergänge ohne Verzögerung ließen Abzeichen und Hinweise sofort erscheinen – behoben), Funken bei „Neuer Rekord“, Stufen „Rekord“, „Top-Schaden“, „Bestleistung“ richtig. Hinweiszeilen über dem Bild auf eigenem dunklem Grund, weil sie sonst mit 4 Augments + 7 Items zusammenstießen.
- Nativ mit echten Daten: in der App über „Ansehen“ (Dialog, 1,3-fach) und als Popout auf dem gewählten Bildschirm (580 × 254 px samt Rand); Bildschirmaufnahme zeigt den Aufbau (Schaden bei 65.282 im Zählen) und den Endzustand mit 4 Augments und 7 Items. Mit der eingestellten Popout-Deckkraft des Benutzers schien der Hintergrund zu stark durch – die Karte ist jetzt fast deckend (96 %).
- Nicht geprüft: die Meldung nach einem echten Spielende (kein Spiel während der Prüfung). Sie nutzt denselben Abgleich wie oben, erst nach dem Ende von `League of Legends.exe` und nur bei Queue 2400.
- `pnpm test` 35 (neu: Stufen der Karte – Rekord und Platz 1 legendär, Top-Schaden ohne Rekord, erstes Spiel ohne erfundenen Rekord, Bestleistung und Platz unter den besten Spielen), `cargo test` 46, `tsc`, `pnpm build`, `pnpm desktop:build` ohne Warnungen. Einstellungen des Benutzers gesichert und zeichengleich zurück, `settings.json` zeichengleich zurückkopiert.

## ARAM-Mayhem-Rangliste (Benutzerwunsch)

Wunsch zuerst: Live-Tracker mit Live-Schaden. Geprüft und abgelehnt, weil es keinen erlaubten Weg gibt: Riots Live Client Data (Port 2999) hat keinen Schaden, die Live-Events-Schnittstelle lief nur beim Zuschauen und ist seit Patch 14.1 abgeschaltet, Riots Web-API liefert ARAM Mayhem (Queue 2400) nicht (403) und bräuchte einen Schlüssel; Speicherlesen im Spiel kommt wegen Vanguard nie in Frage. Stattdessen (Wahl des Benutzers): Rangliste und Sammlung der besten Spiele für ihn und drei Freunde, nur ARAM Mayhem, für immer, Freunde aus der Freundesliste.

- Datenaufbau vorher nur lesend geprüft (Skript, ohne Namen auszugeben): aktueller Beschwörer mit 36-stelliger PUUID; Spielverlauf 20 Spiele, davon 18 in Queue 2400 (Modus „KIWI“); `begIndex`/`endIndex` werden übergangen (0–5, 5–10, 19–39 liefern dieselben 20) – deshalb der Abgleich nach jedem Spiel; Spiel-Details mit allen zehn Spielern, `totalDamageDealtToChampions`, `playerAugment1–6` (vier belegt), Dauer in Sekunden, Version „16.19.…“; Freundesliste 31 Einträge, Spielverlauf eines Freundes lesbar (200, 21 Spiele); Augment-Namen und -Symbole aus `cherry-augments.json` (auch die Mayhem-Augments, Symbol ~1,5 KB PNG).
- Nativ mit echtem Client: Seite ARAM gleicht in 2,0 s ab: 19 Spiele, 56 Augments (alle mit Symbol, 160 KB in `aram.json`, 173 KB gesamt). Der höchste Schaden stimmt genau mit der Blitz-Karte aus dem Bild des Benutzers überein. „Beste Spiele“: 12 Karten mit Splash, Augments und Items (76 von 83 Item-Bildern bei Data Dragon vorhanden, fehlende werden ausgeblendet). Rangliste und Rekorde richtig, Freundesliste zeigt 31 Freunde (keine ausgewählt – das macht der Benutzer).
- Abgleich im Hintergrund: App bei offenem Client gestartet (18:22:35), Seite gleicht ab (18:22:43), 45 s nach Start noch einmal von selbst (18:23:21), die offene Seite übernimmt es (Stand 18:23). Nicht geprüft: der Abgleich nach einem Spielende (kein Spiel während der Prüfung); er nutzt denselben Weg, ausgelöst vom Ende des Prozesses `League of Legends.exe`.
- Ohne Client: „League-Client geschlossen“, Freundesliste mit Hinweis, keine Fehler. Browser-Vorschau mit fiktiven Spielern (Mock-Badge): Rangliste, Beste Spiele, Spieler hinzufügen und entfernen, kein Scrollen der Rangliste bei 860 × 640.
- `cargo test` 46 (neu: lockfile nur gültig mit Port/Passwort, nur Spieler der Liste mit Platz und Team-Anteil, unbekannter Champion harmlos, PUUID-Prüfung, nur PNG-Pfade der Spieldaten, Base64, Speichern und Laden samt beschädigter Datei), `pnpm test` 31 (neu: Rangliste ohne Spiele nie 0, Sortierung, Rekorde, strenge Prüfung der gespeicherten Freunde), `tsc`, `pnpm build`, `pnpm format:check`, `cargo fmt`, `pnpm desktop:build` ohne Warnungen. Einstellungen des Benutzers gesichert und zeichengleich zurück, `settings.json` zeichengleich zurückkopiert; `aram.json` mit den eigenen Spielen bleibt (Beginn der Sammlung).

## Neuigkeiten nach einem Update (Benutzerwunsch)

Nach einem Update zeigt blank. einmal „Neu in Version …“ mit dem Abschnitt „Neu in dieser Version“ aus `.github/release-notes.md` (in die App eingebaut, passt immer zur installierten Version, kein Internet). Rust merkt sich den Start mit `--after-update` (`update_news` liefert es genau einmal), die App zeigt den Dialog nach dem Startbildschirm; Settings → System → „Neuigkeiten“ öffnet ihn jederzeit.

- Release-EXE mit `--after-update 0` gestartet (wie nach einem Update): Dialog erscheint über der App, acht Punkte, fett gesetzte Stichworte, „Alles klar“ hat den Fokus. Esc schließt, Klick daneben schließt. Über Settings → System → Neuigkeiten erneut geöffnet: gleiche acht Punkte. Normaler Start ohne `--after-update`: kein Dialog.
- `pnpm test` 27 (zwei neue: der echte Release-Text liefert mindestens fünf Punkte im Muster „**Stichwort:** Text“, das Auslesen hört beim nächsten Abschnitt auf), `cargo test` 40, `pnpm build`, `pnpm format:check`, `cargo fmt`, `pnpm desktop:build` ohne Warnungen. Einstellungen des Benutzers gesichert und zeichengleich zurück, `settings.json` zeichengleich zurückkopiert.
- Hinweis: Den Dialog sieht man zum ersten Mal nach dem Update auf die nächste veröffentlichte Version; die Versionsnummer darin ist die der installierten App.

## Panel über der Taskleiste (Benutzerwunsch)

Rückmeldung: „bleibt da“ (Klick auf die Taskleiste verdeckt das Popout nicht – vom Benutzer geprüft), aber „das Ausklappen sieht nicht passend zur Taskleiste aus“. Jetzt öffnet Musik beim Hovern ein Panel über der Zeile wie die Flyouts von Windows; die Zeile bleibt und wird hervorgehoben.

- Bildschirmaufnahme bei gehaltener Maus: Panel 380 × 162 px, 16 px über der Zeile, dunkel-neutral (Windows dunkel), feiner Rand, runde Ecken, Cover, Titel, Knöpfe und Fortschritt; Zeile darunter hervorgehoben. Nach dem Wegfahren gehört die Fläche darüber wieder dem Desktop (WindowFromPoint: „Program Manager“).
- Fehler gefunden (mit vorübergehender Mitschrift in der App, danach entfernt): der Umriss wurde beim Hovern richtig freigegeben (`null`, von Windows bestätigt), das Panel blieb auf dem Bildschirm trotzdem unsichtbar, bis der Umriss nach dem Zeichnen noch einmal gesetzt wurde. Jetzt: das ganze Fenster als ausdrückliches Rechteck und ein zweites Setzen zwei Bilder später – Panel sofort sichtbar. (Eine Test-Mitschrift über `__TAURI_INTERNALS__.invoke` griff nicht, weil die Funktion nicht überschreibbar ist; ein Mitlesen per Fenstertitel traf teils ein altes, verstecktes Popout-Fenster.)
- `cargo test` 40, `pnpm test` 25, `tsc`, `pnpm build`, `pnpm format:check`, `cargo fmt` grün. Einstellungen des Benutzers gesichert und zeichengleich zurück, `settings.json` zeichengleich zurückkopiert.

## Popouts in der Taskleiste (Benutzerauftrag)

Auftrag: „versuche eine Anordnung der Popups in der Taskleiste, als wären die Popups Teil der Taskleiste“ (mit Bild eines Taskleisten-Players). Einstellung „In der Taskleiste“ (Popouts → Allgemein).

- Nativ auf dem zweiten Bildschirm (Taskleiste unten, 48 px): Karte 300 × 41 px, senkrecht mittig, ohne eigenen Hintergrund – die Taskleiste scheint durch. Erster Versuch links lag auf den Programm-Symbolen, weil die Taskleiste des Benutzers linksbündig ist (`TaskbarAl` = 0); jetzt bei linksbündigen Symbolen am rechten Ende, links neben der Uhr (dort kein lesbarer Infobereich → 100 px frei für die Uhr), bei mittigen am linken Ende. Bildschirmaufnahme: Zeile mit Cover, Titel, Künstler, Zurück/Pause/Weiter zwischen Symbolen und Uhr, Restzeit-Strich darunter.
- Hover: der volle Player (380 × 162) wächst aus der Taskleiste nach oben, mit Kartenhintergrund; zurück zur Zeile beim Verlassen.
- Unit-Tests (`cargo test` 40): Taskleiste unten/oben/ausgeblendet/seitlich/zweiter Bildschirm aus Bildschirm und Arbeitsbereich; Karte mittig in der Taskleiste, mit Platz zum Aufklappen, links bzw. 12 px vor dem Infobereich, Taskleiste oben.
- Nicht automatisch geprüft: dass ein Klick auf die Taskleiste das Popout nicht verdeckt (`EVENT_SYSTEM_FOREGROUND` holt es zurück) – dafür hätte der Test die Taskleiste aktivieren müssen, während der Benutzer spielte. Bitte von Hand prüfen.
- Kein Visualizer (tanzende Balken): echt bräuchte er eine laufende Auswertung des gesamten Tons, vorgetäuscht wäre er gegen die Regeln.
- `tsc`, `pnpm build`, `pnpm format:check`, `pnpm test` (25), `cargo fmt` grün. Einstellungen des Benutzers gesichert und zeichengleich zurück, `settings.json` zeichengleich zurückkopiert.

## Popout-Animationen (Benutzerauftrag)

Auftrag: „mache noch coole Animationen für die Pop-ups“. Umsetzung nach der Insel aus dem Beispiel-Video (`src/styles/popouts.css`, `PopoutWindow.tsx`).

- Nativ mit fünffach verlangsamten Animationen (CDP `Animation.setPlaybackRate`) aufgenommen: Musik-Popout und Meldung erscheinen als kleine Pille an der Unterkante, werden breiter, dann höher und schwingen beim Einrasten leicht über; danach federn Cover bzw. Kanalbild, Titel, Knöpfe und „Live:“ nacheinander herein. Bildschirmaufnahme in Echtzeit (380 Bilder) bestätigt den Ablauf über dem echten Hintergrund.
- Restzeit-Balken: läuft beim Vorschau-Popout über 6 s ab (`--stay` 6000 ms, gemessen bei 64 %), verschwindet unter der Maus und startet danach mit der kürzeren Restzeit neu.
- Das Hover-Aufklappen bleibt unverändert (Fenster 400 × 220, Karte 70 → 162 px in 170 ms, zurück aus der Mitte des Zuklappens ohne Sprung).
- Das Popout-Fenster trägt jetzt `data-motion` (normal/off) nach seiner eigenen Einstellung; die allgemeine Media-Query für reduzierte Bewegung greift dort nicht mehr.
- `tsc`, `pnpm build`, `pnpm format:check`, `pnpm test` (25) grün. Einstellungen des Benutzers gesichert und zeichengleich zurück, `settings.json` zeichengleich zurückkopiert.

## Mutige Animationen mit Grafikkarte und Motion (Benutzerauftrag)

Auftrag: „nicht zufrieden mit den Animationen außer der Startanimation“; Grafikkarte und eine Animations-Bibliothek erlaubt („man kann Animationen ja eh ausschalten“). Neu: `motion` 13.4.4 (MIT), `src-tauri/src/gpu.rs`, `components/Reveal.tsx`, `components/Ticker.tsx`, `components/TabMotion.tsx`, `design/useTilt.ts`.

- Grafikkarte folgt „Animationen“: nativ mit Grafikkarte eigener GPU-Prozess, kein `--disable-gpu`; `gpu.json` fehlt → an. Vergleich gleicher Ablauf (7 Seitenwechsel): mit Grafikkarte 220 MB privater Speicher aller Prozesse, 3,0 s CPU-Zeit, Bildzeiten Median 4,2 ms / p95 4,3 ms (volle 240 Hz; beim ersten Durchlauf einzelne Hänger bis 92 ms beim Aufbau schwerer Seiten, im zweiten p99 4,3 ms, schlechtestes 21 ms); ohne Grafikkarte 177 MB, 4,7 s CPU-Zeit, p95 8,3 ms (oft nur jedes zweite Bild). In Ruhe kaum Unterschied (0,22 s bzw. 0,19 s CPU in 5 s).
- Neustart: Settings → Darstellung zeigt „Grafikkarte: wird beim nächsten Start eingeschaltet“ + „Jetzt neu starten“, wenn Wahl und laufender Stand abweichen; Klick → alte Instanz beendet, genau eine neue, danach `active: true`.
- Chrome ohne Fenster: Seitenwechsel lassen genau eine Seite zurück, „Kanäle“ klappt auf 351 px auf und vollständig zu, keine Fehler; Bildfolgen zeigen Seite aus Unschärfe, gleitendes Feld in Seitenleiste und Reitern. Nativ: PC-Seite mit gestaffelt federnden Karten, hochzählenden Werten, Karte neigt sich unter der Maus.
- Stilvergleich (in Ruhe, 1,4 s nach dem Wechsel): Home, Twitch, Pros bis auf den Menüeintrag unverändert (sein Hintergrund liegt jetzt im gleitenden Feld, sichtbar gleich). Gefunden und behoben: eine alte Regel `.nav-item.current` in `app.css` schimmerte durch; die Regel `.card-summary strong span` verkleinerte die Zahl „Streams online“ (Zahlen jetzt als `<data>`).
- Die ausgeblendete Browser-Vorschau zeichnet nicht (`requestAnimationFrame` steht) – dort hängen Motion-Animationen; geprüft wird im Chrome ohne Fenster und nativ.
- `cargo fmt`, `cargo test` 38 grün (neu: strenges Lesen von `gpu.json`), `tsc`, `pnpm build`, `pnpm format:check`, `pnpm test` (25) grün. Einstellungen des Benutzers gesichert und zeichengleich zurück, `settings.json` zeichengleich zurückkopiert.

## Startbildschirm, Animationen nur an/aus, Popout-Wackeln behoben (Benutzeraufträge)

Aufträge: „einen coolen Loading Screen beim Start, er kann sehr, sehr, sehr ausgefallen sein“ (statt des GPU-Schalters, der nicht begonnen war); „lösche die mehreren Einstellungen bei den Animationen, nur an oder aus“; „beim Hovern über das Popout … buggt der Text manchmal unter das Popout, es wackelt hin und her“.

- Startbildschirm (`src/app/StartScreen.tsx`): im Browser als Bildfolge aufgenommen (Wirbel → Schriftzug aus Partikeln → Punkt mit Druckwelle und Funken → Schimmer → Wort zerstiebt, Portal öffnet die App). Nativ bei 240 Hz: 229 Bilder/s, Median 4,2 ms, schlechtestes Bild 8 ms, keines über 20 ms; CPU in den 2,3 s etwa ein Kern (nur beim Start). Ladestand echt: Twitch, PC, Geräte melden „fertig“ aus ihren Zuständen. Klick und Taste überspringen (Portal nach 0,65 s). Mit Animationen aus: kein Startbildschirm, „Ansehen“ ausgegraut.
- Animationen: nur noch ein Schalter. Die gespeicherte Stufe des Benutzers („Kräftig“) und alle anderen früheren Stufen werden als „an“ gelesen (Test); „Sparsam“ schaltet Animationen jetzt aus, „Schlicht“ ändert sie nicht mehr. Tempo, Stufen und Vorschau-Zeile entfernt.
- Popout-Wackeln, Ursache mit echter Bildschirmaufnahme gefunden (Bildschirmbereich alle ~6 ms, 611 Bilder): (1) beim Aufklappen wurde das Fenster nach oben vergrößert und Windows zeigte ein Bild lang den alten Inhalt oben – die Karte sprang ~80 px hoch und zurück; (2) während des Übergangs hing der Inhalt an der Oberkante der Karte und rutschte mit (beim Zuklappen nach unten, beim Aufklappen kam er unter der Kante hervor). Behebung: Fenster mit Platz zum Aufklappen und Fensterumriss nur um die Karte (`flyout_region`), Inhalt während des Übergangs an der Bildschirmkante. Danach (620 Bilder): kein Sprungbild mehr, Unterkante der Karte die ganze Zeit exakt gleich, Oberkante gleichmäßig; Fenster bleibt 400 × 220 beim Auf- und Zuklappen; über der kompakten Karte bekommt das Fenster dahinter die Maus (WindowFromPoint), auf der Karte das Popout.
- `cargo fmt` (zwei ältere Stellen nachformatiert), `cargo test` 37 grün, `tsc`, `pnpm build`, `pnpm format:check`, `pnpm test` (25) grün. Neues Windows-Feature `Win32_Graphics_Gdi` der vorhandenen `windows-sys` (keine neue Abhängigkeit); neuer Befehl nur in `build.rs` und `capabilities/flyout.json`. Einstellungen des Benutzers vor jedem Test gesichert, danach per Base64 zeichengleich zurück, `settings.json` zeichengleich zurückkopiert.

## Animationen nach den Video-Vorlagen (Benutzerauftrag)

Auftrag: „ja“ zur Etappe Animationen (Seitenwechsel mit Ursprung, fließendes Aufklappen des Musik-Popouts, weiches Minimieren). Liste der Bewegungen in `src/design/README.md`.

- Popout nativ, jedes Bild gemessen (240 Hz, Vorschau-Popout mit den Einstellungen des Benutzers, kompakt): Maus drauf → Umschalten nach 9 ms, Fenster groß nach 16 ms, Karte 70 → 162 px (50 % nach ~40 ms, 90 % nach ~90 ms, fertig nach 170 ms). Maus weg → 250 ms Pause (wie bisher), Karte schrumpft in ~160 ms, Fenster danach klein (445 ms). Maus zurück während des Zuklappens (bei 102 px) → wächst von dort weiter, kein Sprung. Bilder mitten im Morph (verlangsamt aufgenommen): Karte wächst aus der unteren Kante, neuer Inhalt blendet ein.
- Fenster nativ (Ereignisprotokoll): Minimieren-Knopf → `app-out` 119 ms, dann versteckt (134 ms); zweiter Start holt die App → sichtbar, `app-in` startet 11 ms später, 195 ms. Ohne Sichtbarwerden käme der Inhalt nach 1,5 s von selbst zurück.
- Seitenwechsel nativ (Animationen „Normal“, jedes Bild): keine Scrollleiste durch die Bewegung (`main` mit `overflow: clip`). Ein einzelnes Bild mit Scrollleiste beim Wechsel Home → PC gibt es auch mit Animationen „Aus“ – kommt vom ersten Aufbau der PC-Seite, war schon vorher so (4 ms).
- Fehler gefunden: `desktop.css` setzte `--gap` auf `.app` fest auf 12 px, der Kartenabstand der Dichte wirkte nie (die Messung „Luftig 24/17/12“ oben galt deshalb nur für die Karten). Jetzt ist 12 px der Token; Dichte neu gemessen: Kompakt 8/12/6, Normal 12/16/9, Luftig 14/17/12 px (16 px Kartenabstand: PC 4 px zu hoch). Home, Devices, PC, Musik scrollen in keiner Stufe. Settings-Zeilen folgen jetzt auch der Dichte (normal unverändert 13 px).
- Nur die ersten sechs Karten einer Seite werden gestaffelt eingeblendet; die Pros-Seite (über 200 Karten) animiert nicht jede Karte.
- Stilvergleich bei normaler Dichte: Home, Twitch und Pros weiterhin ohne Unterschied (auch Kartenhöhen, also Seiten füllen die Fläche wie vorher). Vorschau: alle Seiten ohne Fehler; Seiten, Reiter, Kanäle-Bereich animieren mit der richtigen Richtung.
- `tsc`, `pnpm build`, `pnpm format:check`, `pnpm test` (25) grün. Einstellungen des Benutzers vorher gesichert, danach per Base64 zeichengleich zurück, `settings.json` zeichengleich zurückkopiert.

## Design-System, Etappe „Darstellung & Bewegung“ (Benutzerauftrag)

Auftrag: Einstellungen für Darstellung und Bewegung mit Live-Vorschau, Stilen, Akzentfarbe, Rundung, Tempo und Dichte in drei Stufen; dazu die Beispiel-Videos des Benutzers ansehen und Passendes einbauen. Von den sechs Dateien waren drei leer (0 Bytes) und zwei gleich; angesehen: ein Video zu einer Windows-App mit „Dynamic Island“ und Dock, eines zu Windhawk „Windows Animations“. Übernommen: Aufbau der Settings (Gruppen-Überschriften, Zeile mit Titel, kurzer Zeile und Bedienelement, Regler mit Wert), Grundsätze für die nächste Etappe (Bewegung mit Ursprung, Morphen statt Umschalten). Nicht übernommen: dauerhafte Insel-/Dock-Fenster, Animationen fremder Fenster (bräuchte Eingriffe in andere Programme).

- CSS auf Tokens umgestellt: 43 feste Radien → `calc(Npx * var(--radius-scale))` bzw. `var(--radius-card)`, zwei Schatten → `var(--shadow-floating/overlay)`, Dauern → `var(--motion-normal)` (Vielfache für 160 und 250 ms), Wege × `var(--motion-travel)`, Kartenabstände → `--space-card`/`--space-row`; `html[data-motion]` statt `.no-motion`, die Media-Query gilt nur noch ohne `data-motion` (Popout-Fenster). Entfernt: ungenutzter Code einer früheren Startseite (`.hero`, `.orbit`, mit festen Farben) und die alten `.compact`-Regeln.
- Stilvergleich gegen den Stand vor dem Design-System (48 Zustände): **Home, Twitch und Pros ohne Unterschied** in allen sechs Farbschemata bei normaler Dichte. Unterschiede nur, wo gewollt: Settings → Darstellung ist neu (länger, die Seite scrollt; Breite deshalb 668 → 658 px) und „Kompakt“ ist jetzt wirklich kompakter (Karten 17 → 12 px, Zeilen 9 → 6 px; vorher waren Karten kompakt sogar 1 px größer als normal).
- Dichte nativ mit echten Daten: Home, Devices und PC scrollen in keiner Stufe. „Luftig“ zuerst mit 20 px in Karten: PC 14 px und Home 2 px zu hoch; ausgemessen (8 Kombinationen) → 24/17/12 px passt überall.
- `pnpm test`: 25 Tests (neu: Dichte, Rundung, Reduziert/Aus, lesbare Akzentfarbe, Stil wählen, speichern/löschen ohne Änderung des Aussehens, Namen mit Umlauten/doppelt/leer/höchstens 20).
- Vorschau im Browser: Akzent „Himmel“, Stil „Schlicht“, Rundung 0 → ganze App sofort blau und eckig; „Speichern“ legt „Blau eckig“ an (`base: minimal`, keine eigenen Änderungen mehr), Zurück-Knopf erscheint nur an geänderten Zeilen. Überlappung „Mehr Einstellungen“/„Darstellung zurücksetzen“ gefunden und behoben.
- `tsc`, `pnpm build`, `pnpm format:check` grün, Release-Build nativ gestartet. Einstellungen des Benutzers vorher gesichert, danach per Base64 zeichengleich zurück, `settings.json` zeichengleich zurückkopiert.

## Design-System, Etappe „Fundament“ (Benutzerauftrag)

Auftrag: Überarbeitung von Design, Bewegung und Anpassung; Wahl des Benutzers „Fundament zuerst“ (erst Tokens, Themes, Anpassung, Auflösung ohne sichtbare Änderung), GPU-Effekte als Schalter mit Neustart, entfernte Designs weglassen, Fenster fest mit Dichte. Neu: `src/design/` (siehe `src/design/README.md`), Vitest als einzige neue Entwicklungs-Abhängigkeit.

- `pnpm test`: 18 Tests grün – jeder Token hat in allen sechs Farbschemata einen Wert; die Auflösung gleicht `tokens.css` Variable für Variable (über 180 Vergleiche, der Test schlägt fehl, wenn er nichts vergleicht); helle Popout-Farben gleich; Vererbung und Schleifenschutz; Übernahme der früheren Schalter „Kompakte Ansicht“/„Animationen“ und danach nur eine Quelle; ungültige Werte fallen weg, Zahlen werden begrenzt, kaputte Eingaben ergeben die Standardwerte, neuere Versionen werden gelesen; eigene Presets geprüft (höchstens 20); Herkunft je Wert; Zurücksetzen je Kategorie; Bewegungsstufen und Tempo; Export/Import hin und zurück; gespeicherte Einstellungen bleiben beim erneuten Lesen gleich.
- Keine sichtbare Änderung: berechnete Stile von bis zu 35 Elementarten je Seite (18 Eigenschaften, u. a. Farben, Rahmen, Radius, Schatten, Schrift, Abstände, Größe) auf Home, Twitch, Pros und Settings in allen sechs Farbschemata, normal und kompakt (48 Zustände, 900 Elemente) in Chrome ohne Fenster bei 860 × 640 – vor und nach dem Design-System aufgenommen: **0 Unterschiede**. Gegenprobe: kompakt unterscheidet sich von normal in 4 Elementen, Ozean von Wald im Panel.
- Nativ (Release-Build): „Kompakte Ansicht“ an → `--gap` 12 px, `data-density="compact"`, gespeichert `overrides: {density: 'compact'}`; „Animationen“ aus → `motionLevel: 'off'`, Klasse `no-motion`, `--motion-normal` 0 ms; nach Neuladen unverändert; beide zurück → `overrides: {}`, `compact: false`, `motion: true`. Die Kopie `settings.json` enthält die Anpassung. Vorschau-Popout erscheint unverändert (Farbschema, Deckkraft). Einstellungen ohne Anpassung (von v0.3.0) werden ohne Änderung übernommen.
- „Wie Windows“: Umschalten von „Bewegung reduzieren“ (in Chrome nachgestellt) ändert `--motion-normal` sofort 200 → 120 → 200 ms, ohne Neuladen und ohne Abfrage (Ereignis).
- `tsc`, `pnpm build`, `pnpm format:check` grün; `pnpm test` läuft zusätzlich im Release-Ablauf. Rust unverändert (kein erneutes `cargo test`). Einstellungen des Benutzers vorher gesichert, danach per Base64 zeichengleich zurück, `settings.json` zeichengleich zurückkopiert.

## Verbesserungen nach dem Rundgang (Benutzerauftrag)

Auftrag: „geh die App nochmal durch und verbessere selbst Sachen, sag vorher, was du ändern willst“. Rundgang über alle acht Seiten mit echten Daten (nur gelesen), zehn Vorschläge; umgesetzt alle außer 5 (Threads-Angabe verschieben) und 7 („Alles mischen“) – Wunsch des Benutzers.

- 1 CPU nach dem Start: vorher bis zu 10 s „—“ (zweite Messung erst nach dem Intervall, und die Grafikkarten-Zähler brauchten beim Öffnen 1–2 s vor der ersten Messung). Jetzt: erste CPU-Zeiten sofort, erste Messung nach 0,25 s, GPU-Zähler danach; die Seite fragt, solange CPU oder GPU fehlen, alle 0,5 s nach (höchstens 5 s). Gemessen in drei Starts: CPU und GPU nach 634–680 ms ab Seitenstart (Zwischenstände 5,2 s → 2,2–2,8 s → 0,74 s). Schnelle Wiederholungen in Rust höchstens 3-mal (sollte Windows keine Zeiten liefern).
- 2 Popout zuklappen: zusätzlich `mouseleave` des ganzen Popout-Fensters. Zwei Läufe (auf, zu nach 250 ms, wieder auf, ganz raus → zu): richtig.
- 3 Home ohne Live-Kanäle: „Keiner deiner Kanäle ist live“, darunter Jensen, ismaaalol, DawidSSonek und „Alle 8 Pros live ansehen“.
- 4 Twitch-Seite: „Gerade ist keiner deiner Kanäle live.“ über den Offline-Kanälen.
- 6 „Nicht stören“ im Menü des Symbols im Infobereich (Haken, `set_tray_quiet`): Setzen des Hakens aus der App geprüft; den Klick im Windows-Menü selbst konnte der Test nicht auslösen (Menü des Infobereichs) – nicht geprüft.
- 8 Titelleiste „Im Raum · 1“ → öffnet die Twitch-Seite mit offenem Raum; nach „Verlassen“ weg.
- 9 Letzter Raum: nach „Verlassen“ zeigt das Panel „Letzter Raum“ mit demselben Code, „Wieder beitreten“ betritt ihn wieder; gespeichert als `watchLastRoom` (strenge Form-Prüfung, mit Export/Import und Online-Sichern).
- 10 Veraltete Regel „Popouts sind ein eigenes, deckendes Fenster“ in CLAUDE.md berichtigt.
- `cargo test` 37 grün, `tsc`, `pnpm build`, `pnpm format:check` grün. Einstellungen des Benutzers vorher gesichert, danach per Base64 zeichengleich zurück, `settings.json` zurückkopiert (der Raum-Test hatte Name und Raum-Code gespeichert).

## Nur noch das Design „Klassisch“ (Benutzerwunsch)

Wunsch: „entferne alle Designs außer Klassisch“.

- Entfernt: `arena.css`, `clear.css`, `hud.css`, `bento.css`, `void.css`, `orbit.css`, `axiom.css`, `designs.ts`, ihre Farbblöcke in `tokens.css`, die Design-Auswahl in Settings → Darstellung mit ihren Vorschaubildern, die Kurzzeile neben dem Seitentitel (zeigten nur Arena und HUD) und die Einstellung `design`. CSS der App 85 → 44 KB.
- Geblieben: die sechs Farbschemata; die hellen Farben von „Klar“ nur noch für die Popout-Farbe „hell“ (`data-popout-look`), sonst hätte diese vom Benutzer gewünschte Wahl (FluentFlyout-Liste) nicht mehr funktioniert.
- Alte Einstellungen: ein gespeichertes `design: 'hud'` wird ignoriert, das Farbschema (z. B. Ozean) bleibt (in der Vorschau mit den echten Modulen geprüft); Export/Import unverändert (unbekannte Felder werden übergangen).
- `tsc`, `pnpm build`, `pnpm format:check` grün; keine Reste im Code (Suche nach Design-Namen, `data-design`, `tagline`). Vorschau: Settings → Darstellung zeigt Farbe, kompakte Ansicht, Animationen, Zurücksetzen; Home unverändert. Nativ: Popout-Farbe „hell“ kurz eingestellt → Vorschau-Popout hell mit blauem Akzent; Einstellungen danach per Base64 zeichengleich zurück, `settings.json` zurückkopiert.

## Settings neu, Popouts ohne Verzögerung (Benutzerwunsch)

Wunsch: „neues Konzept für die Einstellungen, die sind zu unübersichtlich“ (Entwurf gezeigt, dann „ja, alles umsetzen“), „alle Sachen müssen live umstellbar sein, man soll live alles sehen“, Popouts „instant Feedback, kein Delay beim Hovern; im Kompakt-Modus beim Hovern ausklappen in den anderen Modus, wo man vorspulen kann“.

- Settings: sieben Reiter, Popouts mit vier Unterbereichen, „Mehr Einstellungen“ (Popouts Allgemein 3, Musik 8, Aussehen 4). Vorschau (860 × 640): Suche über alle Reiter („lautstärke“ → eine Zeile, „name“ → „Dein Name im Raum“, Unsinn → Hinweis), Reiter während der Suche ausgeblendet; jeder Reiter zeigt nur seine Karten (nur „Meldungen“ ≈ 34 px länger als die Fläche). Reiter in allen 8 Designs in einer Zeile (HUD nach dem Verschmälern mit 52 px Luft; vorher rutschte „Daten“ in HUD in eine zweite Zeile). Keine Konsolenfehler.
- Nativ, Live-Vorschau: „Fortschrittsbalken“ bzw. „Warnungen“ aus und wieder an (danach unverändert) → Vorschau-Popout mit Beispiel-Titel (kompakt, unscharfes Cover) bzw. Beispiel-Meldung erscheint, weitere Änderungen ersetzen es an Ort und Stelle.
- Nativ, Hovern über dem kompakten Popout (echte Mauseingabe per CDP in die Popout-Seite): Karte aufgeklappt nach ≈ 2 ms, Fenster in neuer Größe (400 × 90 → 400 × 182) nach 8,7–10,9 ms, also innerhalb eines Bildes; Unterkante bleibt (y 1030), wächst nach oben; Fortschrittsbalken da. Maus weg → nach 263 ms wieder kompakt; erneut drauf → auf; ganz aus dem Fenster → zu. Einmal blieb es im ersten Versuch offen; in vier Wiederholungen nicht mehr nachzustellen.
- Nativ, Knopf-Rückmeldung (erfundenes Mix-Popout, kein Mix läuft, daher keine Rückmeldung): Klick auf Pause → Knopf zeigt „Abspielen“ nach 2,2 ms, nach 3,0 s ohne Rückmeldung wieder „Pause“. „Weiter“ bewusst nicht geklickt (hätte einen echten Mix gestartet).
- Erscheinen eines Popouts, wenn sein Fenster erst entstehen muss: einmal 116 ms gemessen; die übrigen Vorher-Messungen waren durch das laufende Musik-Popout des Benutzers verfälscht und sind nicht verwertbar. Einstellungen des Benutzers vorher gesichert, danach per Base64 zeichengleich zurück, `settings.json` zurückkopiert; sein Musik-Popout (YouTube in Chrome) wurde nicht geschlossen und nichts pausiert.
- `cargo test` 37 grün, `pnpm build`, `pnpm format:check` grün.
- Nicht geprüft: Hovern mit echter Maus durch den Benutzer, Spulen im aufgeklappten Popout bei einem echten Player, Knopf-Annahme mit einem echten Player (die Rückmeldung sollte sie sofort bestätigen).

## Zusammen schauen auf Twitch (Benutzerwunsch)

Wunsch: „watch together Twitch, wo man zusammen synchron guckt und auch Channel switchen kann“. Wahl des Benutzers: Verbindung ohne Konto, alle dürfen umschalten.

- Vorab geprüft: Twitchs offizieller Player lässt sich in blank. nicht einbetten – `player.twitch.tv` antwortet mit `Content-Security-Policy: frame-ancestors https://tauri.localhost`, blank. läuft unter `http://` (Sperr-Symbol im Rahmen). Umstellen auf `https` hätte den WebView-Speicher (Einstellungen) an eine neue Herkunft gebunden, daher eigenes Fenster: als Seite selbst geladen spielt der Player (720p, 0 verworfene Bilder, ≈ 2,5 % CPU des PCs mit `--disable-gpu`).
- Vermittler geprüft (Probe mit Wegwerf-Topics, danach geleert): HiveMQ, EMQX und Mosquitto – alle verbinden in ≈ 0,5 s, Nachrichten in 25–45 ms, aufbewahrte Nachricht kommt beim Nachzügler an. Gewählt HiveMQ + Mosquitto (beide Europa), gleichzeitig.
- `cargo test`: 37 grün (neu: MQTT-Pakete bauen und lesen, auch zerstückelt und mit 2-Byte-Länge; kaputte Länge wird abgelehnt statt ewig zu warten; nur Raum-Topics, Base64 ≤ 2 KB, gültige Kanäle; Player bleibt auf `player.twitch.tv`, Kanal auch in der von Twitch umsortierten Adresse). Clippy ohne Hinweise in `watch.rs`. `pnpm build`, `pnpm format:check` grün.
- Codes (Vorschau, echte Module): Raum-Code 200 zufällige Codes zurückgelesen (klein, mit Leerzeichen, O statt 0), 153 462 Tippfehler-Varianten (falsch, fehlend, zusätzlich, vertauscht) – keine als gültig angenommen, unvollständige als „noch nicht vollständig“. Umzugs-Code nach dem Verschieben der Hilfen nach `codes.ts` unverändert: 4/4 zurück, 5 006 Varianten, keine angenommen. Schlüssel ≈ 40 ms.
- Nativ, zwei Teilnehmer (App + Testskript mit derselben Verschlüsselung direkt an beiden Vermittlern; offline Kanäle, damit kein Ton lief; Einstellungen vorher gesichert und danach per Base64 zeichengleich zurück, `settings.json` zurückkopiert): Raum starten → „Verbunden“ (erst 1, dann 2 von 2); Freund tritt bei → „Du, Freund“, er bekommt das Hallo der App sofort; Freund schaltet um → App zeigt den Kanal „umgeschaltet von Freund“, Player-Fenster öffnet sich mit dem Kanal; App schaltet per eingefügtem Link um → Freund empfängt es (Nummer 2, Anzeigename von Twitch), Player wechselt; „Neu synchronisieren“ → Freund empfängt es, eigener Player lädt neu; Lebenszeichen nach 1 min; Freund geht → nur noch „Du“; „Player schließen“ → „Player öffnen“; „Verlassen“ als Letzter → auf beiden Vermittlern nichts mehr gespeichert, keine offene Verbindung mehr. Player-Fenster: neues Fenster abgelehnt, Sprung auf fremde Seite blockiert. Öffnet mittig auf dem Bildschirm von blank.
- Fehler beim ersten Durchlauf gefunden und behoben: Die Fenster-Befehle waren synchron – unter Windows blieb das Player-Fenster bei `about:blank`, ein zweiter Aufruf hing (die App selbst reagierte weiter). Jetzt `async` wie beim Popout-Fenster. Außerdem: Twitch sortiert die Adresse um, „derselbe Kanal?“ vergleicht nun nur den Kanal.
- Panel in Klassisch, Klar, HUD und Bento aufgenommen (Design nur vorübergehend umgeschaltet): nichts läuft über.
- Nicht geprüft: zwei echte PCs mit Ton, der tatsächliche Versatz zwischen zwei Zuschauern bei Live, ein Ausfall eines Vermittlers mitten im Raum, Twitchs Vollbild-Knopf im Player-Fenster.

## Pet entfernt, Popouts wie FluentFlyout (Benutzerwunsch)

Wunsch: „entferne pet aus der app und mache so popouts wie fluent flyout wenn zum beispiel ich musik anhaben und minimiere etc“.

- Entfernt: Pet-Figuren und -Ansicht (`src/features/pet/`, `pet.css`), Pfoten-Knopf, Pet-Auswahl in Settings, `pet.rs` (Fenster-Umbau), `taskbar.rs` (UI Automation für den Taskleisten-Knopf, nur für das Pet nötig), die Fensternachricht `blank.show-app` und die Befehle `set_pet_mode`/`pet_resize`. Die gespeicherte Einstellung `pet` wird beim Lesen und Importieren ignoriert (kein neues Dateiformat nötig). Neu gespeichert: `popouts`, `popoutMusic` (Standard an; Teil von Export/Import und Online-Sicherung, weil Teil der Einstellungen).
- Neu: `media.rs` (was läuft, per Ereignis der Windows-Medienschnittstelle), `flyout.rs` (Popout-Fenster), `src/features/popouts/`, `src/platform/popout.ts`, `src/adapters/media.ts`, `src/styles/popouts.css`, `capabilities/flyout.json`. Die `windows`-Bibliothek war schon da (nur weitere Teile eingeschaltet); die UI-Automation-Teile wurden entfernt.
- `cargo clippy`: nur die vier schon vorher vorhandenen `chunks_exact`-Hinweise. `cargo test`: 29 grün (neu: App-Namen aus Windows-IDs, nur bekannte Bildformate als Cover, nur bekannte kleine Popout-Meldungen). `pnpm build` und `pnpm format:check` grün.
- Browser-Vorschau: Settings ohne Pet-Zeile, „Popouts – Nur in der Desktop-App“, „Nicht stören – Kein Ton, keine Popouts“, keine Konsolenfehler.
- Nativ, Mitlesen: Ein laufender Stream im Browser wurde erkannt (Titel, Kanal, Name des Browsers, Cover als Bild, Zurück/Weiter nicht angeboten, Pause schon). Ein stummes Testlied in einem eigenen Browser-Profil (Stille mit Titel und Cover): `media_current` wechselte auf „Testlied 1“, das Popout-Fenster entstand von selbst, Vordergrund blieb der Browser, nach 5 s ausgeblendet. Später erschien bei einem echten Kanalwechsel im Browser ein Musik-Popout von selbst.
- Nativ, Anzeige: Musik, Live (erfundener Kanal) und Warnung nacheinander: Höhe 98/66/95 px, sichtbarer Rand genau mittig und 12 px über der Taskleiste (unsichtbare Fensterränder per DWM herausgerechnet; vorher 8 px daneben), „+2“ für wartende, danach ausgeblendet. Werkzeugfenster (nicht in Alt+Tab), immer oben, beim Erscheinen kein Fokuswechsel (Vordergrund vorher und nachher gleich). Sichtbar ≈ 0,2 s nach der Meldung, auch wenn das Fenster neu entsteht.
- „Details“ mit echtem Mausklick (Mauszeiger danach zurückgesetzt): App kommt nach vorn, Seite „Devices“, Popout weg. Mit `WS_EX_NOACTIVATE` blieb die App dahinter (Windows erlaubt das Nach-vorn-Holen nur nach einem aktivierenden Klick) – deshalb aktiviert jetzt ein Klick das Popout; beim Erscheinen weiterhin nie.
- Speicher (privat, alle WebView2-Prozesse von blank.): vorher 107–123 MB; Popout sichtbar +38 bis +63 MB (ein Prozess mehr); versteckt mit niedrigem Speicherziel noch ≈ +50 MB. Deshalb wird das Fenster schon 30 s nach dem letzten Popout geschlossen (vorher 5 min): danach wieder 5 WebView2-Prozesse.
- Nicht geprüft: die Knöpfe Zurück/Pause/Weiter mit echter Wiedergabe (sie hätten die laufende Wiedergabe des Benutzers angehalten; das Test-Browserprofil wurde vorher geschlossen); Live- und Warnungs-Popouts aus echten Ereignissen (nur direkt ausgelöste Meldungen); ein Vollbild-Spiel (die Sperre nutzt Windows' eigene Abfrage `SHQueryUserNotificationState`); mehrere Bildschirme mit unterschiedlicher Skalierung.

### Nachtrag: Position wählbar, Musik-Popout auch bei Pause/Weiterspielen

Benutzerfrage: Popout „einfach in der Mitte“, wie löst FluentFlyout das; YouTube-Musik pausieren. FluentFlyout (Quellcode auf GitHub angesehen) hat eine Positions-Einstellung und eine Bildschirmwahl und reagiert per Tastatur-Hook auf Medientasten. Wahl des Benutzers: Position in Settings wie FluentFlyout; Musik-Popout zusätzlich bei Pause/Weiterspielen (statt Tastatur-Überwachung).

- `cargo test`: 30 grün (neu: `corner()` für alle sechs Stellen, zweiter Bildschirm, bleibt im Arbeitsbereich). `pnpm build` und `pnpm format:check` grün.
- Nativ, Probe-Popout an jeder Stelle (zwei Bildschirme, Taskleiste unten): unten Mitte/links/rechts und oben links/Mitte/rechts jeweils genau 12 px vom Rand bzw. genau mittig (sichtbare Grenzen per DWM gemessen); „Zweiter Bildschirm“ unten Mitte und oben rechts landen auf dem anderen Bildschirm, ebenfalls 12 px vom Rand. `flyout_screens` meldet 2.
- Settings in Klassisch, Klar, HUD, Bento und Axiom aufgenommen (Design nur vorübergehend umgeschaltet, nichts gespeichert): Raster mit sechs Stellen, „Testen“, Bildschirmwahl (nur bei mehr als einem Bildschirm) passen in die Zeile.
- Testpanne: Für die Positionen hat das Testskript die gespeicherte Darstellungs-Einstellung vorübergehend geändert und beim Zurückschreiben wegen eines Anführungszeichen-Fehlers `[object Object]` gespeichert. Sofort aus der Einstellungs-Kopie (`settings.json`, unverändert) Zeichen für Zeichen wiederhergestellt und verglichen; die App hatte die Werte ohnehin noch im Speicher. Künftige Tests nur noch per Base64 zurückschreiben.
- Nicht geprüft: Pause/Weiterspielen als Auslöser mit echter Wiedergabe (hätte die laufende Wiedergabe des Benutzers angehalten); „Wo die Maus ist“ auf dem zweiten Bildschirm (nutzt Tauris `cursor_position`/`monitor_from_point`).

### Nachtrag: durchscheinendes Gleiten, etwas durchsichtig als Standard

Benutzerwunsch: „die Popups sollen ein transparent slide haben und sollen etwas transparent auch auf Standard sein“.

- Umgesetzt: Deckkraft gilt jetzt immer (nicht nur mit Acrylic), Standard 88 %; das Popout-Fenster ist ganz durchsichtig, die Karte malt Hintergrund, Rand und Schatten selbst (10 px Rand für den Schatten), sodass alles zusammen gleitet. Hineingleiten: 18 px vom Bildschirmrand her plus Deckkraft 0 → 1 in 250 ms (Tempo und Verlauf wie bisher einstellbar), hinaus genauso. Standardmäßig auch bei ausgeschalteten Windows-Animationseffekten (neuer Schalter „Auch wenn Windows-Animationen aus sind“); „Animationen“ aus schaltet es weiter ab.
- Zwei Fehler beim echten Test gefunden und behoben: (1) Die allgemeine Regel in `app.css` (`prefers-reduced-motion` → alle Animationen `none !important`) hielt das Popout starr – gemessen Deckkraft durchgehend 1, keine Bewegung, obwohl die Klassen gesetzt waren. `enter`/`leave` setzen sich nun per `!important` durch. (2) Windows 11 zeichnete um das ganze durchsichtige Fenster eine eigene 1-px-Linie mit runden Ecken – ein zweiter Rahmen um die Karte. `windows_frame` in `flyout.rs` schaltet Linie und Rundung ohne Acrylic ab (mit Acrylic bleiben sie, dort zeichnet Windows den Rahmen). Außerdem startet das Gleiten erst, wenn das Fenster steht (vorher begann es im noch versteckten Fenster, ein Teil war nicht zu sehen).
- Nativ mit den echten Einstellungen des Benutzers gemessen (nichts emuliert, Windows-Animationseffekte aus, Einstellungen nicht verändert), Bild für Bild im Popout-Fenster: hinein ≈ 15 ms unsichtbar bis das Fenster steht, dann Deckkraft 0 → 1 und 18 → 0 px in ≈ 250 ms; hinaus 1 → 0 und 0 → 18 px in ≈ 250 ms, danach versteckt. Hintergrund der Karte mit dem gespeicherten Deckkraft-Wert (s. u.). Bildschirmaufnahme: keine Windows-Linie mehr um das Fenster (vorher an der Fensterkante 60 statt 21 Helligkeit), nur der eigene Schatten. `cargo test` 33 grün, Clippy ohne Hinweise in den geänderten Dateien, `pnpm build` und `pnpm format:check` grün.
- Hinweis: Bestehende Installationen haben meist 75 % gespeichert – den früheren Standardwert, der damals nur mit Acrylic wirkte und mit den übrigen Einstellungen gespeichert wurde. Nicht automatisch geändert (der Schieber unter Settings → Popouts → Deckkraft); der neue Standard 88 % gilt für neue Installationen.
- Nicht geprüft: Gleiten von oben (Stellen „oben …“; gleiche Regel mit umgekehrtem Vorzeichen), Acrylic nach der Rahmen-Änderung (Pfad unverändert: runde Ecken, Windows-Rahmen).

### Nachtrag: Funktionen und Einstellungen nach FluentFlyout

Benutzerwunsch: „ich habe Funktionen und Einstellungen geaddet, füge sie hinzu und änder sie“ (Funktionsliste und Bilder von FluentFlyout 2.15; nur als Vorlage, nichts davon ins Projekt kopiert).

- Übernommen: Anzeigedauer 1–30 s plus „Immer anzeigen“ (Musik, Meldungen, „Als Nächstes“), Titel zentrieren, Player-Name mit „Player öffnen“, Wiederholen- und Zufall-Knopf, andere Medien automatisch pausieren, „Als Nächstes“, App-Filter (erlauben/sperren), Farben (wie blank./dunkel/hell), Hintergründe (Cover-Schein, aufsteigender Schein, unscharfes Cover), Cover-Farbe als Akzent, Acrylic mit Deckkraft, Ein-/Ausblenden mit Tempo und Verlauf, Bildschirm „aktives Fenster“, Linksklick aufs Symbol im Infobereich, Suche in den Settings. Schon vorhanden: Position, Kompakt, Fortschritt, Vollbild, Export/Import, Autostart, Update-Hinweis.
- Nicht übernommen: Tastenzustände (Caps/Num/Scroll-Lock) – ginge nur mit Überwachung aller Tastendrücke; Taskleisten-Widget und Visualizer – dauerhaftes Fenster in der Taskleiste bzw. ständige Audio-Auswertung und Animation, gegen den geringen Verbrauch; „anonyme Nutzungsdaten“ – nie; „Lautstärketasten ausschließen“ – blank. reagiert nicht auf Lautstärketasten; Sprache – nur Deutsch. Lautstärke-Popout und Mixer: möglich (Windows meldet Lautstärkeänderungen als Ereignis), als eigener nächster Schritt angeboten.
- `cargo test`: 33 grün (neu: Player-Programm aus der Windows-ID, „Lied lief zu Ende“ nur nahe am Ende), Clippy ohne neue Hinweise; `pnpm build`, `pnpm format:check` grün. Browser-Vorschau: Suche („lautstärke“ → eine Zeile, Unsinn → Hinweis, leer → alles), keine neuen Konsolenfehler.
- Nativ mit erfundenen Daten (Einstellungen vorher gesichert, danach per Base64 zeichengenau zurück, verglichen: gleich): Standard 360×160; Wiederholen + Zufall + linksbündig 436×160 (beim Mix Wiederholen aus, Zufall an und gesperrt); hell mit unscharfem Cover und Cover-Farbe als Akzent (oranger Knopf und Balken aus dem Cover); dunkel mit aufsteigendem Schein; Cover-Schein; Kompakt 380×68; „Als Nächstes“ 330×60; Acrylic 55 % (Hintergrund scheint unscharf durch). Einstellungskarte: 31 Zeilen, keine läuft über.
- Ein-/Ausblenden (überholt, siehe Nachtrag „durchscheinendes Gleiten“): Auf dem Test-PC sind die Animationseffekte von Windows aus – die Popouts erschienen deshalb damals ohne Bewegung. Mit „Animationen an“ nur für die Popout-Seite simuliert (CDP, Windows unverändert): 2× / „kräftig“ → Deckkraft 0 → 1 in 0,4 s, 2 s sichtbar, 0,4 s Ausblenden, dann weg.
- Alte Einstellungen bleiben: `popoutMusicTime`/`popoutNoticeTime` (5/10/20 s oder 0 = „Immer“) werden in `…Seconds`/`…Always` übernommen (in der Vorschau mit echten gespeicherten Einstellungen geprüft: „Immer“ bei Musik, Stelle und Bildschirm bleiben).
- Nicht geprüft: Klick aufs Symbol im Infobereich (steckt im Überlauf-Menü), „Player öffnen“, Wiederholen/Zufall, „andere Medien pausieren“ und „Als Nächstes“ mit echter Wiedergabe (hätte die laufende Wiedergabe des Benutzers verändert), App-Filter mit echten Apps.

### Nachtrag: alles einstellbar, zuverlässig

Benutzerwunsch: „es soll auch alles einstellbar sein bei den Popups und es muss zuverlässig sein – jetzt geht das Popup immer irgendwie weg nach ein paar Sekunden“. Ursache: feste 5–12 s ohne Einstellung; dazu verschwand ein Musik-Popout sofort, sobald ein Player kurz „nichts“ meldete, und eine Meldung musste hinter Musik warten.

- Neu: Karte **Settings → Popouts** (13 Zeilen) mit Musik, Pause/Weiter, Musik-Dauer 5/10/20 s/„Immer“, Fortschrittsbalken, Layout normal/kompakt, Live, Warnungen, Meldungs-Dauer, Position, Bildschirm, „Auch bei Vollbild“, „Auch wenn blank. vorne ist“, „Testen“. Standard: Musik und Meldungen je 10 s. Alles in den Einstellungen gespeichert, gespiegelt und in Export/Import/Online-Sicherung (strenge Prüfung in `preferences.ts`).
- Nebenbei korrigiert: „Darstellung zurücksetzen“ setzte auch Nicht stören, Warnungen und Update-Prüfung zurück; jetzt nur Design, Farbe, kompakte Ansicht und Animationen.
- Nativ, Zuverlässigkeitstest mit erfundenem Mix-Titel (Einstellungen vorher gesichert, danach per Base64 zeichengenau zurückgeschrieben und verglichen: gleich):
  - Standard: sichtbar nach 0,1 s, nach 8 s noch da, nach gut 10 s weg.
  - Echter Mauszeiger auf dem Popout (danach zurückgesetzt): nach 14 s noch sichtbar, 4,6 s nach dem Wegziehen weg.
  - „Immer“: nach 16 s noch da; eine Live-Meldung erscheint sofort davor (Meldungsdauer 5 s), danach wieder die Musik.
  - `flyout_update` „Pause“: Knopf wechselt auf „Abspielen“, Höhe gleich, kein neues Aufspringen; „Mix gestoppt“: Popout sofort weg.
  - „Kompakt“ in den gespeicherten Einstellungen umgestellt: offenes Popout wechselt sofort auf die schmale Zeile (68 statt 160 px).
- Karte in der App aufgenommen: keine Zeile läuft über (`scrollWidth` geprüft), Auswahlknöpfe passen.
- `cargo test` 31 grün, Clippy ohne neue Hinweise, `pnpm build` und `pnpm format:check` grün.
- Nicht geprüft: „Auch bei Vollbild“ mit einem echten Vollbild-Spiel; echter Mix (wie oben).

### Nachtrag: eigener Mix im Popout, Fortschritt, Aufbau nach FluentFlyout

Benutzerwünsche: „die Musik, die man in meiner App laufen lässt, soll natürlich auch da angezeigt werden, wenn man die App minimiert“; „passe das Design an und nehme diese Bilder als Vorlage“ (Bilder von FluentFlyout, nur als Vorlage; nichts davon ins Projekt übernommen).

- Eigener Mix: kommt aus `useMusic` (neues Lied, Pause, Weiter) als Popout-Art `mix` mit Titel, Künstler, SoundCloud-Cover, Position und Länge; Knöpfe im Popout über `flyout_mix` → Ereignis `mix-control` → Mix in der App. Ob die WebView den Mix auch selbst an Windows meldet, ist nicht dokumentiert; deshalb werden Windows-Sitzungen, die währenddessen nach dem eigenen Mix aussehen, übergangen (keine doppelten Popouts).
- Fortschritt: `media_timeline` liest Position, Länge und Zeitpunkt nur, wenn ein Musik-Popout erscheint (und nach Pause/Weiter); `media_seek` springt. Test: laufender Twitch-Stream im Browser → kein Fortschritt (Live, keine Länge), wie gewollt. Das Hauptfenster darf `media_timeline` nicht aufrufen (von der Rechteliste abgewiesen), nur das Popout.
- `cargo test`: 31 grün (neu: Windows-Zeit → Unix-Zeit). `pnpm build`, `pnpm format:check` grün.
- Nativ, Aufbau: Musik (echter Stream im Browser, mit Cover), Mix (erfundene Daten: Titel, Farbverlauf als Cover, 1:50 von 4:03), Live und Warnung nacheinander; Höhen 120/160/76/93 px, kein Überlauf, Fortschritt nur beim Mix. Mix-Popout zusätzlich in Klar, Bento, HUD und Axiom (nur im Popout umgeschaltet): Akzentfarbe, Lesbarkeit und Abstände passen.
- Nicht geprüft: ein echter Mix im Popout und die Knöpfe mit echter Wiedergabe (hätte hörbar Musik gestartet bzw. die laufende Wiedergabe des Benutzers angehalten); Springen im Fortschritt bei Spotify/YouTube.

## Drei neue Designs Void, Orbit, Axiom (Entwürfe von ChatGPT)

Der Benutzer hat die Projektdateien an ChatGPT gegeben und zwei ZIPs zurückgebracht; die zweite (`blank-axiom.zip`) enthielt alles aus der ersten plus Axiom und wurde übernommen.

- Inhalt: Außer README/VALIDATION nur Design-Dateien geändert: `designs.ts` (drei Einträge), `main.tsx` (drei CSS-Importe), `tokens.css` (drei Paletten), `desktop.css` (Design-Auswahl bricht bei mehr als fünf Designs um, max. 390 px), neu `void.css`, `orbit.css` und `axiom.css`. Rust, Adapter, Platform, Logik, `package.json` und Lockfile sind unverändert (Datei für Datei gegen den Stand der Übergabe verglichen). README/VALIDATION aus der ZIP nicht wörtlich übernommen, sondern hier eingearbeitet.
- Regelprüfung der neuen CSS-Dateien: keine festen Farbwerte (nur Tokens und `color-mix()`), keine externen Adressen, `@import`, Schriften oder Bilder, keine `@keyframes` und kein `backdrop-filter`. Axiom hat nur kurze Übergänge (140 ms), nur bei `prefers-reduced-motion: no-preference` und eingeschalteten Animationen. Void und Orbit waren nicht mit Prettier formatiert; das wurde nachgeholt.
- `pnpm build` und `pnpm format:check`: grün.
- Browser-Vorschau bei 860 × 640 (Headless-Chrome, frisches Profil, Beispieldaten): alle 8 Seiten in allen 8 Designs (87 Aufnahmen). Kein waagrechter Überlauf; nur Settings scrollt (wie vorher, durch die zweite Reihe der Design-Auswahl ≈ 76 px länger). Die Design-Auswahl zeigt in allen acht Designs zwei Reihen à vier, auch in Klar und Bento.
- Nativ (`pnpm desktop:build`, EXE mit echten Daten des Benutzers): Void, Orbit und Axiom nur am `<html>` umgeschaltet (nichts gespeichert, danach zurückgestellt; gespeichertes Design des Benutzers unverändert), alle 8 Seiten aufgenommen. Home, Twitch, Musik, Devices und PC scrollen in keinem der drei; Pros, Apps und Settings scrollen als Listen; kein waagrechter Überlauf.
- Laut ChatGPT zusätzlich geprüft (hier nicht wiederholt): eigene Vorschau mit synthetischen Werten (sechs Streams, drei Geräte, langer Prozessorname), Tastaturfokus und „Animationen aus“ in Axiom.

## Online sichern mit Umzugs-Code, ohne Konto (Benutzerwunsch)

Wunsch: „für komplett Dumme“, keine Fehler möglich, kein USB-Stick, Einstellungen vorher hochladen und nach dem Zurücksetzen online laden, so einfach wie möglich; Wahl des Benutzers: „Code ohne Konto“.

- Verworfen: ein USB-Stick-Umzug war schon gebaut (Sicherung auf den Stick, Start vom Stick, Kopie auf den Desktop) – auf Benutzerwunsch vollständig wieder entfernt. Behalten: Vorauswahl aller installierten Programme (solange die Liste nie von Hand geändert wurde, Kennzeichen `chosen`), „Programme installieren“ oben, gemeinsames Übernehmen (`applySettings`) und sofortiges Wegschreiben der Einstellungs-Kopie (`flushMirror`).
- Befund nebenbei: Neben dem echten Datenordner `%LOCALAPPDATA%\com.blank.desktop` gab es einen zweiten, fast leeren. Er wurde genau in der Zeit benutzt, in der beim Benutzer „alle Settings weg“ waren. Der zweite Ordner liegt jetzt unbenutzt mit geändertem Namen daneben (nicht gelöscht); die echten Daten sind am normalen Ort. Wie es zu zwei Ordnern kam, ließ sich nicht klären; die Einstellungs-Kopie in `settings.json` fängt eine leere WebView künftig ab.
- Dienste geprüft (nur Test-Text „blank-test“): dpaste.com, paste.rs und catbox.moe nehmen ohne Konto an und liefern zurück. Gewählt: dpaste.com (Aufbewahrung per `expiry_days=365`), Ersatz catbox.moe.
- Verschlüsselung (Vorschau): Hin- und Rückweg identisch (≈ 56 ms), falsches Geheimnis und veränderter Text → nicht lesbar. Code-Eingabe: Groß-/Kleinschreibung, Leerzeichen, Bindestriche egal. Tippfehler-Test über vier Beispielcodes: alle einzelnen falschen Zeichen, fehlenden Zeichen, zusätzlichen Zeichen und vertauschten Nachbarn (≈ 6 400 Varianten) – keine einzige wird als anderer gültiger Code angenommen (mit nur einem Prüfzeichen rutschten ≈ 1 % durch, deshalb zwei).
- Rust-Tests: 26 grün (neu: nur eigene IDs der Dienste, fremde Adressen, `../`, falsche Endungen abgelehnt).
- Nativ mit Test-Daten (nicht mit den Einstellungen des Benutzers): verschlüsselte Test-Einstellungen über die App zu dpaste.com hochgeladen (ID `BWWB8CCGS`) und identisch zurückgeholt; WebCrypto in der App verfügbar (sicherer Kontext). Über die Oberfläche: „Code eingeben“ → Code mit falschem letzten Zeichen → „Im Code ist ein Tippfehler“; richtiger Code klein und mit Leerzeichen → „0 Musik-Einträge · 2 Programme zum Installieren“ → „Abbrechen“ → Einstellungen des Benutzers unverändert.
- Nicht geprüft: „Online sichern“ mit den echten Einstellungen des Benutzers und „Übernehmen“ – beides entscheidet der Benutzer selbst. Der automatische Dialog beim ersten Start einer frischen Installation wurde nicht nachgestellt (dafür hätten die Datenordner des Benutzers wieder beiseitegelegt werden müssen); er nutzt dieselbe Oberfläche wie „Code eingeben“.

## Reset-Helfer: Focusrite Control 2 und DPM ergänzt (Benutzerfrage)

- Frage: „warum ist Focusrite nicht dabei?“ – die erste Einschätzung „kein fester Link“ war falsch. Gründlicher gesucht: Focusrite hat `releases.focusrite.com/com.focusrite.focusrite-control/latest/Focusrite-Control-2.exe` (Signierer „FOCUSRITE AUDIO ENGINEERING LIMITED“). DPM hat keinen festen Link, aber einen Update-Dienst beim Hersteller (`app.dpm.lol/releases/nsis/win32/x64/latest.yml`, Adresse aus `resources\app-update.yml` der installierten App); er nennt Datei und SHA-512, Signierer „DPMLOL SAS“.
- Neu: Quelle `Source::Feed` – `latest.yml` vom erlaubten Server, nur schlichter `.exe`-Name im selben Ordner, danach SHA-512-Vergleich (Windows-BCrypt) und die übliche Signaturprüfung.
- Geprüft und bewusst nicht aufgenommen: Rustup (fester Link, aber **unsigniert** – blank. startet nur signierte Installer), NVIDIA App (nur Links mit Versionsnummer), HyperX NGENUITY (nur Microsoft Store), VB-CABLE (ZIP mit Treiber), Git/GitHub CLI (Download über GitHub), Visual Studio Build Tools.
- Tests: 7 grün, darunter neu Update-Dienst lesen (fremde Pfade `../`, Unterordner, `.msi`, Leerzeichen abgelehnt), base64- und SHA-512-Referenzwerte; mit echten Downloads jetzt 11 Installer inklusive Focusrite und DPM (DPM über den Update-Dienst mit Prüfsumme) – nichts ausgeführt.
- Nativ: Seite Apps zeigt DPM und Focusrite Control 2 unter „Auf diesem PC“ (13 statt 11), Desktop-Kopie aktualisiert.

## Reset-Helfer ohne winget, direkt vom Hersteller (Benutzerwunsch)

Wunsch: Programme ohne Microsoft/winget installieren – eigene Liste mit den offiziellen Download-Links, direkt von den Herstellern. winget ist komplett entfernt (auch beim Einlesen).

- Links geprüft (26.09.2026, nur Kopfzeilen): 30 offizielle „neueste Version“-Links, 29 funktionieren und enden bei Servern der Hersteller (z. B. discordapp.net, dl.google.com, steamstatic.com, riotcdn.net, scdn.co). Kein stabiler Direkt-Link: Claude (blockt automatische Abrufe), TeamSpeak (nur Webseite), NVIDIA App (nur Links mit Versionsnummer) → „Nur von Hand“. Alle Links funktionieren auch mit der ehrlichen Kennung `blank/…` (kein Browser-Vortäuschen nötig).
- Signierer gelesen, ohne etwas auszuführen: bei .exe nur der Signaturbereich per Teil-Download (PE-Kopf → Sicherheitsverzeichnis → PKCS#7), bei Opera, Roblox und den drei .msi (Chrome, Epic, Minecraft) die ganze Datei im Arbeitsordner, sofort wieder gelöscht. Alle offiziell, u. a. „Discord Inc.“, „Google LLC“, „Valve Corp.“, „Riot Games, Inc.“; auffällig, aber richtig: SteelSeries GG von „GN Hearing A/S“ (Mutterkonzern), Blitz von „Swift Media Entertainment, Inc.“, Parsec von „Unity Technologies SF“, Minecraft von „Microsoft Corporation“ (Mojang gehört zu Microsoft).
- Rust-Tests: Namenszuordnung, Liste vollständig (nur https, Server, Signierer, eindeutige IDs), Serverprüfung (`evil-discordapp.net`, `discordapp.net.evil.com` abgelehnt), Signaturprüfung durch Windows (unsignierte Datei abgelehnt, msedgewebview2.exe → „Microsoft Corporation“), Rückgabecodes. Zusätzlich mit echten Downloads (`--ignored`): Spotify, Steam, Opera GX, Roblox, Minecraft, GOG, Razer Synapse, Medal, Battle.net – über ihre Weiterleitungen geladen, Server erlaubt, Signatur gültig, Signierer wie in der Liste; nichts ausgeführt, alles gelöscht.
- Nativ (Release-Build, nur lesend): installierte Programme aus der Liste richtig erkannt, die übrigen als installierbar angeboten; unter „Nur von Hand“ z. B. Spiele, Herstellerprogramme und Entwickler-Werkzeuge.
- Nicht geprüft (bewusst): echtes Installieren und die stillen Schalter – das hätte Programme auf dem PC des Benutzers installiert oder neu installiert. Stille Schalter nur für bekannte Fälle (Discord `-s`, Steam/Ubisoft/Blitz/Mullvad `/S`, Firefox `/S`, Spotify `/silent`, Brave `/silent /install`, Opera `--silent …`, Riot `--skip-to-install`, Telegram `/VERYSILENT`, MSI `/passive`); alle anderen öffnen ihr eigenes Installer-Fenster.

## Einstellungen „weg“ und Autostart übersprungen: Fixes (Benutzermeldung)

- Befund Einstellungen: Bei einem Start zeigte die App die Standardwerte, obwohl alles im WebView-Speicher lag (`Local Storage\leveldb\…`, Stunden vorher geschrieben). Beim nächsten Start war alles wieder da. Die genaue Ursache (WebView öffnete ihren Speicher nicht) ließ sich nicht belegen; WebView2-Version unverändert, kein Absturz.
- Fix: Kopie `settings.json` neben `twitch.json` (Rust `store.rs`, geschrieben ≤ 150 ms nach jedem Speichern, erst temporär, dann umbenannt; nur gültiges JSON-Objekt ≤ 512 KB). Beim Start gewinnt die neuere Seite; fehlt etwas im WebView-Speicher, kommt es aus der Kopie. Rust-Test (Schreiben/Lesen, kaputte oder zu große Inhalte ersetzen die Kopie nie) – 23 Tests grün.
- Nativ geprüft: erster Start legt die Kopie an. Dann Einstellungen, Musik und Zeitstempel im WebView-Speicher gelöscht, App neu gestartet → Einstellungen zeichengleich wie vorher (vorher gesichert), Playlists und Design wie vorher. Sicherung des Benutzers lag bereit, wurde nicht gebraucht.
- Befund Autostart: Bei einer Anmeldung startete Windows alle eingeschalteten Programme außer blank., obwohl der Eintrag stimmte (keine Richtlinie, keine Download-Markierung, nicht im Task-Manager aus). Einziger Unterschied: keine Freigabe-Markierung (`StartupApproved\Run`) und kein Eintrag in `RunNotification`, anders als bei den übrigen Autostart-Programmen. Die eigentliche Ursache zeigt Windows nicht an.
- Fix: Einschalten schreibt die Markierung „aktiviert“ (`02` + 11 Nullbytes, wie der Task-Manager), Ausschalten löscht Eintrag und Markierung; beim App-Start ergänzt `autostart::repair` die Markierung für einen schon eingeschalteten Autostart. Nativ: Desktop-Kopie gestartet → Markierung `02 00 …` gesetzt. **Offen:** der echte Start bei der nächsten Anmeldung (prüfbar im Protokoll `Microsoft-Windows-Shell-Core/Operational`, Ereignis 9707 mit `blank.exe`).

## Reset-Helfer „Apps“, Etappe 1 (Benutzerauftrag)

Wunsch: vor dem Zurücksetzen alle Programme sehen und auswählen, nach dem Zurücksetzen blank. laden und die ausgewählten offiziellen Programme mit einem Klick installieren; auch für andere Benutzer. Entscheidung mit dem Benutzer: erst mit der Übertragungs-Datei (Etappe 1), danach automatisch online über das Microsoft-Konto (Etappe 2, braucht eine Registrierung bei Microsoft).

- winget auf dem Prüfrechner: v1.29. `winget export --source winget` (nur lesend, ≈ 18 s) erkennt pro Benutzer installierte Programme oft nicht. Deshalb die geprüfte Liste `KNOWN`: 57 Paket-IDs einzeln mit `winget show --id … --exact --source winget` bestätigt, weitere (Medal, Razer Synapse 3/4, Mullvad VPN, CurseForge) über `winget search`. Manche Programme gibt es gar nicht als winget-Paket (nur beim Hersteller oder nur im Store). Die Suche zeigte auch inoffizielle Nachbauten (z. B. mehrere „ChatGPT“-Pakete) – daher nur feste, offizielle IDs.
- Rust-Tests: 22 grün (4 neu: Namenszuordnung mit Wortgrenzen und längstem Treffer, ausgeblendete Treiber/Laufzeiten, nur saubere Paket-IDs – `--source`, Leerzeichen, Anführungszeichen abgelehnt –, winget-Rückgabecodes).
- Nativ (Release-Build, nur lesend, nichts installiert): Seite Apps liest installierbare Programme und die unter „Nur von Hand“ (Spiele, Herstellerprogramme, Werkzeuge) richtig ein; kein horizontaler Überlauf. Die Auswahl des Benutzers blieb leer (nichts angetippt).
- Vorschau mit Beispieldaten (das App-Fenster war minimiert, daher kein Bild aus der App): Klassisch und Bento (Dock mit acht Einträgen passt, 81–779 px von 860). Übertragungs-Datei: Hin- und Rückweg mit Programmliste, schädliche/kaputte Einträge herausgefiltert, doppelte IDs → erster Eintrag gilt, Datei nur mit Programmen wird angenommen.
- Nicht geprüft (bewusst): echtes Installieren – das hätte Programme auf dem PC des Benutzers installiert. Der Aufruf ist `winget install --id <id> --exact --source winget --silent --accept-package-agreements --accept-source-agreements --disable-interactivity`; der Knopftext weist auf die Lizenzannahme hin.

## SoundCloud „nicht erreichbar“ behoben (Benutzermeldung)

Meldung: „SoundCloud gerade nicht erreichbar“ beim Hinzufügen; Wunsch: beheben, und es soll nie wieder passieren.

- Ursache: Die App fragte SoundCloud (oEmbed) genau einmal, ohne Zeitlimit. Jeder kurze Aussetzer (Netz, Zeitüberschreitung, Serverfehler) endete sofort in „nicht erreichbar“, und 401/403 (private Playlist) landeten in derselben Meldung. Beim Nachtesten antwortete SoundCloud normal: von außen und aus der App 200 mit CORS, 20 Anfragen in Folge alle 200, unbekannte Namen und Seiten sauber 404. Der Fehler war also ein vorübergehender Aussetzer, den die App nicht abfing.
- Behoben: 8 s Zeitlimit je Anfrage, zwei Wiederholungen (1 s, 3 s) bei Netzfehler, Zeitüberschreitung und 5xx/429; eigene Meldungen für 404 (nicht gefunden), 401/403 (privat, Geheim-Link nötig) und Kurzlinks aus der App. Bleibt SoundCloud stumm, wird ein gültiger Link trotzdem gespeichert und automatisch nachgeprüft (Start, `online`, Mix-Start, einmal nach 60 s). Mix: ohne Internet wird gewartet und danach gestartet bzw. weitergespielt; fehlende Player-Antwort → ein automatischer Neustart vor der Fehlermeldung. Geheim-Links privater Playlists (`/s-…`, Groß-/Kleinschreibung bleibt) funktionieren jetzt.
- Vorschau, mit simulierten Ausfällen (nur `fetch`/`navigator.onLine` in der Vorschau überschrieben): zwei Netzfehler, dann Erfolg → normal hinzugefügt (≈ 4 s); dauerhafter Ausfall → nach 3 Versuchen (≈ 4 s) gespeichert als „Noch nicht geprüft – folgt automatisch“, Eingabefeld geleert; Netz zurück (`online`) → Eintrag bekommt von selbst Namen und Bild. 403 → „privat“, 503 → wiederholt. Mix ohne Internet → Wartemeldung ohne Player; Netz zurück → lädt und spielt. Verbindung weg während ein Track läuft → Wartemeldung; zurück → derselbe Track spielt weiter. Test-Mix danach gestoppt.
- Nativ (Release-Build): oEmbed aus der App 200, Musik-Seite mit deiner Playlist unverändert. Deine Liste wurde nicht verändert, kein Mix gestartet.

## „Mit Windows starten“ geprüft und verbessert (Benutzermeldung)

Meldung: Autostart „funktioniert noch nicht richtig“.

- Befund aus Windows’ eigenem Protokoll (`Microsoft-Windows-Shell-Core/Operational`, Ereignisse 9705–9708, nur gelesen): Über mehrere Tage hat Windows bei jeder Anmeldung alle anderen Autostart-Programme gestartet, blank. nie. Der Eintrag `HKCU\…\Run\blank` fehlte also bei jeder Anmeldung; der aktuelle Eintrag entstand erst nach dem Start (Schlüssel erst danach geändert). Kein Absturz im Anwendungsprotokoll, keine Deaktivierung im Task-Manager.
- Schwachstelle in der App: Der Schalter prüfte nur „zeigt der Eintrag auf genau diese Datei?“. Mit mehreren Kopien (z. B. im Download- und im Build-Ordner) stand er in einer anderen Kopie ohne Erklärung auf „aus“, und Einschalten verlegte den Autostart still auf die gerade laufende Kopie.
- Behoben: `autostart_status` (ersetzt `autostart_enabled`) meldet eingetragene Datei, andere Kopie, fehlende Datei und „im Task-Manager aus“; die Settings-Zeile zeigt das („Startet …\target\release\blank.exe“, „Startet eine andere Datei (…) – Einschalten nimmt diese hier“). Tray-Symbol und Taskleisten-Überwachung können den Start nicht mehr abbrechen. Test für das Auslesen des Programmpfads (18 Rust-Tests grün).
- Geprüft: Start genau wie bei der Anmeldung (Befehl aus dem Run-Eintrag, Arbeitsordner `C:\Windows\System32`) → Fenster sichtbar, Twitch verbunden, Live-Daten da, Zeile „Startet …“ mit Schalter an. Eine Kopie aus einem Testordner zeigt „Startet eine andere Datei“ mit Schalter aus; Run-Eintrag dabei unverändert, Kopie danach gelöscht.
- Nicht prüfbar ohne Abmelden: der echte Start bei der nächsten Anmeldung. Nachweis danach im selben Windows-Protokoll (Ereignis 9707 mit `blank.exe`).

## Gaming-Optimierung mit Rückgängig (Benutzerauftrag)

Wunsch: Windows für Spiele einstellen „so wie Atlas OS“, aber alles rückgängig machbar, mit Info, was geändert wurde, „kein Risiko“. Umgesetzt als Karte in den Settings mit fünf Benutzer-Einstellungen (Liste und Begründung in der README); Sicherheitsrelevantes und alles mit Adminrechten bewusst weggelassen.

- `cargo test`: 17 Tests grün, davon 5 neu: Einträge in `DirectXUserGlobalSettings` ändern nur sich selbst; Zustandstexte (an/aus/Windows-Standard); eindeutige Liste; Sicherung übersteht Speichern/Laden, eine beschädigte Sicherung wird gemeldet statt überschrieben; Registry-Werte kommen exakt zurück (auch „fehlte vorher“ → gelöscht). Der Registry-Test schreibt nur unter dem Wegwerf-Schlüssel `HKCU\Software\blank-test` und löscht ihn danach (geprüft: Schlüssel weg).
- Nativ (Release-Build), nur lesend: Die Karte zeigt genau die Werte, die Windows hat (per PowerShell gegengelesen): Spielmodus, Mausbeschleunigung und Kürzel „Schon so“, Fenster-Optimierung „Windows-Standard“ und Game-Bar-Aufnahmen „an“ mit „Anwenden“. „Alle anwenden“ zeigt die Bestätigung mit genau diesen zwei Punkten; „Abbrechen“ ändert nichts (Registry unverändert, keine `tweaks.json`).
- **Nicht von mir ausgeführt:** „Anwenden“ und „Rückgängig“ an deinen echten Windows-Einstellungen — das ist deine Entscheidung. Der Weg ist per Test mit dem Wegwerf-Schlüssel abgesichert; Maus und Tastenkürzel nutzen dieselben Windows-Funktionen wie die Systemsteuerung.
- Ansicht in HUD geprüft (dein aktuelles Design); die Karte nutzt nur vorhandene Bausteine und passt damit in allen Designs.

## Drei weitere Designs „Klar“, „HUD“, „Bento“ (Benutzerauftrag)

Wunsch: ein Design, das „wirklich komplett anders“ ist; aus drei Skizzen sollten alle umgesetzt werden. Wählbar unter Settings → Darstellung → Design (jetzt fünf Vorschauen, die auch zeigen, wo die Navigation sitzt). Farbschema-Punkte sind bei allen außer Klassisch deaktiviert („<Design> hat eigene Farben“). Gespeichert und exportiert wie bisher (`design` in den Präferenzen; der Import prüft gegen die Liste in `designs.ts`, deshalb kein neues `SETTINGS_FORMAT`).

- Vorbereitung: letzte feste Farben in Komponenten-CSS durch Tokens ersetzt (Avatar-Farben `--avatar-*`, Schatten `--shadow`, Hover der Navigation, Rand bei fehlgeschlagener Aktualisierung). Klassisch und Arena behalten exakt ihre Werte.
- Vorschau (860 × 640): Home, Twitch, Musik und Settings in allen drei Designs angesehen; Design über die Settings gewechselt, danach steht es in `blank.preferences.v1`.
- Nativ (Release-Build, Seiten per DevTools-Protokoll nur aus der App-Oberfläche aufgenommen): alle sieben Seiten in Klar, HUD und Bento. Home, Devices, PC und Musik ohne Überlauf; Twitch, Pros und Settings scrollen als Listen. Nirgends horizontaler Überlauf.
- Gefunden und behoben: In Bento scrollte die PC-Seite um 47 px (Dock unten kostet Höhe) → Seitentitel sitzt in Bento jetzt in der Titelleiste neben dem Logo. In HUD brachen lange Werte der Systemübersicht um (Monospace ist breiter) → Werte bleiben einzeilig mit „…“, der volle Text steht im Tooltip (gilt für alle Designs).
- Gegenprobe Klassisch und Arena: PC und Home unverändert, ohne Überlauf.
- Auslastung im Leerlauf wie vorher (etwa 0,1–0,5 % CPU, 90–120 MB); keine neuen Animationen, Raster und Leuchten in HUD sind statisch.
- Dein Design steht danach wieder auf „Arena“; die App läuft normal ohne Testzugang.

## Neues Design „Arena“ (Benutzerauftrag)

Vorlage: Screenshots einer Gaming-Begleit-App (nur Stil übernommen, keine Logos, Maskottchen oder Bilder). Zweites Design neben „Klassisch“, wählbar unter Settings → Darstellung → Design mit kleiner Vorschau je Design; bei Arena sind die Farbschema-Punkte deaktiviert („Arena hat eigene Farben“). Die Einstellung gehört zu den Präferenzen und wird mit exportiert/importiert.

- Vorschau (860 × 640): Home mit großem Titel, Trennstrich und Kurzzeile, Kartentitel in Großbuchstaben mit Indigo-Balken, dunkles Blau-Schwarz; Settings mit Design-Auswahl (Klassisch in Wald, Arena in Indigo). PC-Seite mit Beispielwerten gerendert: Symbolkacheln orange/grün/lila/gold, kein Überlauf.
- Nativ in Arena: Home, PC, Devices, Musik, Twitch ohne vertikalen oder horizontalen Überlauf. Bildschirmaufnahmen waren nicht möglich, weil ein anderes Fenster über der App lag (Aufnahmen verworfen); visuell geprüft wurde deshalb nur in der Vorschau.
- Das Design des Benutzers steht danach auf „Arena“; zurück jederzeit in den Settings.

## Pet reagiert auf Musik, zwei neue Figuren (Benutzerauftrag)

Neue Stimmung „music“ für alle Figuren (Kopfhörer mit hellem Rand über dem Kopf, geschlossene Augen, Note), neue Figuren „Katze“ und „Robo“ mit allen fünf Stimmungen. Rangfolge: Warnung > Live-Meldung > Musik > wach/schlafend. Kurzes Nicken bei neuem Track nur mit eingeschalteten Animationen, keine Daueranimation.

- Vorschau: alle 4 Figuren × 5 Stimmungen als Übersicht gezeichnet (Farbschemata Graphit und Wald, Musik zusätzlich auf hellem Hintergrund); daraufhin Kopfhörerbügel mit hellem Rand versehen (vorher auf dunklem Grund kaum sichtbar) und „besorgt“ bei Katze/Robo korrigiert (wirkte wütend). Settings: vier Figuren passen in die Zeile (208 px), Auswahl „Robo“ sofort gespeichert.
- Nativ (Mix mit Lautstärke 0): Pet-Modus mit laufendem Mix → `mood-music`, Kopfhörer und Note vorhanden, Tooltip „♪ <Track> – <Uploader> · 1 Kanal live …“; Pause → `mood-awake`, Weiterspielen → `mood-music`. Bildschirmaufnahme des Pets auf dem Desktop: Kopfhörer gut sichtbar. Musik-Lautstärke danach zurückgesetzt.

## RAM bereinigen wie Mem Reduct (Benutzerauftrag)

Knopf „Bereinigen“ in der RAM-Karte der PC-Seite. Ablauf: Die App startet sich selbst mit `runas` (`blank.exe --clean-memory`, Windows-Nachfrage), der Prozess aktiviert `SeProfileSingleProcessPrivilege` und `SeIncreaseQuotaPrivilege`, leert per `NtSetSystemInformation(SystemMemoryListInformation)` die Arbeitsspeicher aller Prozesse, leert den Dateicache (`SetSystemFileCacheSize(-1, -1)`), schreibt die geänderten Seiten weg, leert die Standby-Liste ohne Priorität und beendet sich; fehlgeschlagene Schritte stehen als Bits im Exit-Code. Die App misst belegten RAM vorher und nachher.

- Ohne Adminrechte gestartet (`blank.exe --clean-memory` direkt): endet nach ~1 s ohne Fenster und ohne App-Start, Exit-Code 23 (Rechte, Arbeitsspeicher, Dateicache, Standby abgelehnt; „geänderte Seiten wegschreiben“ geht auch ohne Rechte). Die Ablehnungsprüfung richtet sich deshalb nach fehlendem Recht plus Arbeitsspeicher.
- Nativ: Knopf neben dem RAM-Symbol, überdeckt weder Symbol noch Titel, PC-Seite ohne Überlauf.
- **Nicht automatisiert geprüft:** der eigentliche Lauf mit Adminrechten (die Windows-Nachfrage muss der Benutzer bestätigen), Abbrechen der Nachfrage („Abgebrochen – ohne Administratorrechte geht es nicht.“) und die angezeigte Menge.

## Download über GitHub (Benutzerauftrag)

Öffentliches Repository `maltekruse23-oss/blank`; vor dem Hochladen persönliche Testdetails (Hardware, Geräte, laufende Programme, Musik-Accounts) aus VALIDATION.md entfernt und alle Dateien nach Tokens, E-Mail-Adresse und Benutzerpfaden durchsucht (nichts gefunden). Commits mit der anonymen GitHub-Adresse. Nur die EXE, kein Installer (Benutzerwahl).

- GitHub Actions (Tag `v0.1.0`, windows-latest): Versionsprüfung, `pnpm install --frozen-lockfile`, `pnpm format:check`, `cargo test --locked`, `pnpm desktop:build`, Release — alle Schritte erfolgreich, EXE 13 MB.
- Die von GitHub gebaute EXE heruntergeladen und gestartet: lädt die App (`http://tauri.localhost`, nicht den Dev-Server), alle sieben Bereiche, echte Twitch-Daten.
- Auf Wunsch des Benutzers vereinfacht: Datei heißt immer `blank.exe`, README beginnt mit Download-Link und drei Schritten, Release-Text auf Deutsch, Repository-Link „Website“ zeigt auf das neueste Release.
- Hinweis: Der Projektordner gehört technisch einem anderen Windows-Konto (frühere Sitzung); Git lehnt ihn deshalb ab („dubious ownership“). Befehle liefen mit `git -c safe.directory=<Ordner>`; die globale Git-Einstellung wurde nicht geändert.

## Einstellungen übertragen (Benutzerauftrag)

Settings → Übertragen: Export schreibt `blank-einstellungen.json` (freier Name, sonst „(2)“ usw.) in den Downloads-Ordner (`SHGetKnownFolderPath`, auch verschoben) und zeigt sie im Explorer; Rust ergänzt Twitch-Kanäle und Client-ID. Import über den Windows-Dateidialog der WebView, strenge Prüfung je Teil, Übernehmen erst nach Bestätigung. Nie enthalten: Twitch-Token, Autostart.

- Rust-Tests (`cargo test`: 9): nur blank.-Objekte bis 512 KB; erster freier Dateiname.
- Vorschau: kein JSON / andere App → „Keine blank.-Einstellungsdatei.“; Format 99 → „Datei stammt aus einer neueren blank.-Version.“ Gültige Datei → Prüfanzeige „Darstellung, Pet und Benachrichtigungen · 2 Musik-Einträge · 2 Twitch-Kanäle · exportiert am …“; nach „Übernehmen“ Farbe Graphit, kompakt, ohne Animationen, Pet Blob, Nicht stören, Akku-Warnung aus, 2 Playlists mit Lautstärke 35, Kanäle mit Spielregel übernommen; ein Eintrag mit fremder Adresse und ein ungültiger Kanalname wurden verworfen.
- Nativ: Export → Datei in Downloads (4 KB) mit `app, exportedAt, format, music, preferences, twitch`, 10 Kanäle, Client-ID gesetzt, keine Token-Felder. Dieselbe Datei wieder importiert: Einstellungen, Musik (inhaltlich; Rust sortiert nur die Schlüssel) und Kanäle unverändert, Twitch-Login bleibt verbunden.

## Neutrales App-Icon (Benutzerauftrag)

Altes Icon: grünes „b.“ im Grün des Farbschemas „Wald“ auf voll gefülltem Quadrat. Neu: weißes „b.“ auf fast schwarzer, abgerundeter Kachel (#111, feiner heller Rand), außen durchsichtig; Quelle `src-tauri/icons/icon.svg`, per `pnpm tauri icon` in 16/24/32/48/64/256 px erzeugt, nur `icon.ico` übernommen.

- Vorschau aller Größen auf dunkler (#202020) und heller (#F3F3F3) Taskleistenfarbe: auch 16 px lesbar.
- Gefundener Stolperstein: Nach dem Austausch von `icon.ico` zeigte die neu gebaute EXE (geprüft an einer frisch kopierten Datei, also ohne Windows-Icon-Cache) weiter das alte Icon, das Fenster-Icon dagegen schon das neue. Tauris Build-Skript lief nicht neu. Nach Berühren von `build.rs` und erneutem `pnpm desktop:build` enthält die EXE das neue Icon.
- Echte Taskleiste nach dem Start: neues Icon am Knopf „blank. - 1 running window“; Tray-Symbol und Fenster nutzen dasselbe Icon.

## Musik: SoundCloud-Mixes (Benutzerauftrag)

Vorab geprüft: SoundClouds Nutzungsbedingungen verlangen Nennung von Uploader und SoundCloud sowie sichtbare Links auf soundcloud.com, nichts herunterladen/zwischenspeichern, Werbung nicht stören; für den eingebetteten Player keine API-Registrierung. oEmbed (`soundcloud.com/oembed`) ohne Schlüssel, mit CORS; unbekanntes Profil → 404. Das Nachrichtenformat des Players (`{method, value}` per postMessage) aus SoundClouds `api.js` gelesen; das Skript selbst wird nicht geladen.

- Browser-Vorschau (Lautstärke 0): „not a profile!!“ → „Kein SoundCloud-Profil …“, unbekanntes Profil → „Profil nicht gefunden.“, Track-Link `soundcloud.com/forss/flickermood` → Profil „Forss“ mit Bild, erneut „forss“ → „Ist schon in der Liste.“ Mix startet nach 1,7 s; „Nächster“ wechselt den Track; Pause/Weiter; Sprung kurz vor Track-Ende → nächster Zufallstrack; „Stopp“ entfernt den Player.
- Nativ (Debug-Port, Lautstärke 0): CSP lässt oEmbed, Profilbild und Player zu, Badge „SoundCloud“, Mix spielt nach 1,5 s. Weiterspielen geprüft über die Position des Players: sichtbar 18,8 s → 25 s minimiert 45,3 s → Pet-Modus 56,6 s → zurück zur App 62,1 s, gleicher Track, nie pausiert. Positionsanzeige läuft sichtbar mit (0:03 → 0:05); bei verdeckter/minimierter Seite wird sie absichtlich nicht abgefragt.
- Verbrauch minimiert (30 s): mit laufendem Mix 0,157 % CPU, 200 MB privat (Player-Prozess 68 MB); nach „Stopp“ Player-Prozess beendet, 0,007 % CPU, 132 MB.
- `soundcloud_open` lehnt fremde Hosts und `file:`-Pfade ab („Kein SoundCloud-Link“); Rust-Test `accepts_profiles_and_tracks_only_on_soundcloud` bestanden (`cargo test`: 7). Das tatsächliche Öffnen im Browser wurde nicht ausgelöst (gleiche Funktion wie bei Twitch).
- Testdaten (`blank.music.v1`) danach entfernt; Einstellungen des Benutzers unverändert.
- Nachtrag (Rückmeldung: ein Profil meldete „Keine Tracks zum Abspielen“): Das Profil hat keine eigenen Uploads (Player meldet 0 Tracks, auch nach 6 s), die Musik liegt in einer Playlist des Accounts (36 Tracks). Neu: Playlist-Links (`…/sets/…`, Tracking-Parameter werden entfernt; Titel ohne „by …“, Bild des Besitzers, Zeile „Playlist · <Besitzer>“), klarere Meldung für Profile ohne eigene Tracks. Zweiter Fehler dabei gefunden: Playlists laden Track-Daten nach und nach (5 → 20 → 36 in 6 s); ein Sprung auf einen noch nicht geladenen Track wählt ihn aus, startet ihn aber nicht (kein „play“, kein Fehler). Behoben: nach dem Sprung bis zu 4× alle 1,5 s nachfragen und erneut starten; eigenes Pause/Springen beendet das sofort. Außerdem zählt der Mix nachgeladene Tracks eines Profils mit (forss: 10 → 12).
- Geprüft (Lautstärke 0): Vorschau — Playlist-Mix startet nach 2,1 s, 5× „Nächster“ je ~0,8 s, jedes Mal wirklich spielend; eigenes Pause hält 7 s (keine Wiederholung). Nativ — Playlist über den geteilten Link hinzugefügt, Mix nach 2,6 s, „Nächster“ nach 1,6 s, spielt. Musik-Lautstärke danach wiederhergestellt.
- **Nicht geprüft:** hörbarer Ton (alle Tests mit Lautstärke 0), sehr große Accounts (der Player lädt die Trackliste selbst; gemischt wird unter den geladenen Tracks), Go+-Vorschauen.

## League-Bereich entfernt (Benutzerauftrag)

Seite `src/features/league/`, Navigationspunkt, Home-Karte „League Assistant“, Settings-Eintrag „League-Datenquelle“ (geplant) und alle nur dafür genutzten Styles entfernt. Die Pros-Seite und die Twitch-Spielregeln („nur League“) bleiben.

- Home: „Twitch Live“ jetzt zweizeilig links (bis zu 6 Live-Kanäle, dann „+N weitere live“), „Dein Setup“ und „PC-Status“ rechts. Browser-Vorschau bei 860 × 640: kein Überlauf, auch mit 6 eingefügten Zeilen plus Hinweis (Test-DOM, danach entfernt); Konsole fehlerfrei.
- Badge: Home in der Desktop-App „Live“ statt „Mock“ (nichts mehr simuliert), Settings ohne Badge; Browser-Vorschau weiterhin „Mock“. Settings-Karte „Verbindungen“ nur noch in der Browser-Vorschau („Twitch-Account · Nur in der Desktop-App“).
- Nativ (Debug-Port): Navigation Home, Twitch, Pros, Devices, PC, Settings; Home-Badge „Live“, kein Überlauf; Settings mit Darstellung, Twitch, Benachrichtigungen, System. `pnpm build`, `pnpm format:check`, `pnpm desktop:build` erfolgreich; danach normal ohne Debug-Port gestartet.

## Taskleiste zeigt die ganze App, Symbol im Infobereich (Benutzerauftrag)

- Tray-Symbol „blank.“ erscheint im Überlauf-Bereich (per UI Automation in der geöffneten Liste gefunden, neben den Symbolen anderer Programme).
- Tray-Klick (UI-Automation-„Invoke“ auf das Symbol): aus dem Pet-Modus → ganze App an alter Stelle (−1398,191, 860 × 640), Pet-Modus aus, Fenster aktiv; aus dem minimierten Zustand → wiederhergestellt und aktiv.
- Zweiter Start bei minimiertem Pet → ganze App, aktiv, weiterhin ein Prozess.
- Erkennung des eigenen Knopfs gegen die echte Taskleiste (temporärer Test, wieder entfernt): Mittelpunkt jedes der 14 Knöpfe geprüft, nur „blank. - 1 running window“ ergibt `true`, alle anderen und eine leere Stelle `false`; 13–15 ms je Prüfung. Einmal lieferte UI Automation direkt nach dem Öffnen/Schließen des Überlauf-Menüs nur die angehefteten Knöpfe ohne Fenster (vorübergehend); dann erkennt ein Klick das Pet nicht, der nächste schon.
- Gegenproben im Pet-Modus: Überlauf-Menü der Taskleiste geöffnet und geschlossen, während das Pet aktiv war → bleibt Pet (eine erste Fassung, die nur „Maus auf der Taskleiste“ prüfte, öffnete hier fälschlich die App; deshalb die Knopf-Prüfung). Minimieren per `WM_SYSCOMMAND`/`SC_MINIMIZE`, nicht vom eigenen Knopf → Pet wird normal minimiert.
- Verbrauch im Pet-Modus (30 s): 0,05 % CPU, 112 MB privat (wie vorher; Tray und Knopf-Prüfung kosten im Ruhezustand nichts).
- Neue Features: `tauri` `tray-icon` (bereits im Lockfile), `windows` zusätzlich `Win32_Foundation`, `Win32_System_Com`, `Win32_System_Ole`, `Win32_System_Variant`, `Win32_UI_Accessibility`. Keine neuen Befehle/Capabilities (`core:event:allow-listen` war vorhanden). `cargo clippy` ohne neue Hinweise, `cargo test` (6 bestanden), `pnpm build`, `pnpm desktop:build`.
- **Nicht automatisiert geprüft:** ein echter Mausklick auf den Taskleisten-Knopf und das Tray-Kontextmenü („Öffnen“/„Beenden“, Rechtsklick). Simulierte Maus-Eingaben sind in der Prüfumgebung wirkungslos (`SetCursorPos` meldet Erfolg, der Zeiger bewegt sich nicht). Geprüft sind die Teile: Windows-Nachrichten, Knopf-Erkennung an der echten Taskleiste und der Weg zur App (Tray, zweiter Start).

## Warnton und Programm schließen (Benutzerauftrag)

- Warnton: MP3 des Benutzers („warning alert“, Universfield/Pixabay) einmalig in WAV umgewandelt (44,1 kHz Stereo, 2,64 s, 465 KB), `src/assets/warning-alert.wav`; Rust-Test „warning_sound_is_a_playable_wav“ bestanden; über `play_alert_sound(…, "warning")` nativ abgespielt.
- Schutz: `close_program("explorer.exe")` und `close_program("blank.exe", force)` abgelehnt („Dieses Programm schließt blank. nicht“). Knopf nur bei Programmen mit sichtbarem Hauptfenster (Browser, Spiele-Client, Chat-Programme ja; deren Hintergrunddienste nein).
- Normal schließen: Zeichentabelle gestartet, Warnkarte mit ihr als Verursacher eingespielt → Knopf „Zeichentabelle schließen“ → „Wird geschlossen …“ → „Zeichentabelle geschlossen“, Programm beendet, Karte verschwindet. Erzwungen: `close_program("charmap.exe", force: true)` beendet 1 Prozess.
- Eine echte Überlast wurde weiterhin nicht erzeugt.

## Echter PC-Status, Überlast- und Akku-Warnungen, „Nicht stören“ (Benutzerauftrag)

- PC-Seite nativ: CPU, Grafikkarte, RAM und Systemlaufwerk mit Werten, jeweils mit „Meiste Last“ (Programmname aus der Dateibeschreibung); Systemübersicht mit Prozessor, Grafikkarte samt Videospeicher, installiertem RAM, Threads (per `Win32_Processor` bestätigt) und Windows-Version (Registry meldet „Windows 10“, per Build ≥ 22000 korrigiert). Abgleich: RAM belegt 0,2 GB Abweichung zum Windows-Zähler; CPU in drei Paaren innerhalb weniger Prozentpunkte zu `typeperf` (verschiedene Messfenster).
- Warnlogik in Rust per Unit-Test (`cargo test --lib pc::`, 3 bestanden): Warnung erst nach 30 s (GPU 60 s) über der Grenze, mit Verursacher, dann 30 min Pause; ein Einbruch unter die Grenze startet die Zeit neu; fehlende Messwerte warnen nie. Eine echte Überlast wurde nicht erzeugt (League-Client lief, keine Minute Volllast auf dem Benutzer-PC).
- Anzeige (Warnungen für den Test in den React-Zustand eingespielt): Karte „CPU bei 97 % · <Browser> 41 % · <Spiel> 28 %“, Klick öffnet die PC-Seite; Pet mit besorgtem Gesicht und Blase; Akku-Warnung „<Maus> · 12 % – Akku fast leer, bald laden“. „Nicht stören“ an: Pet bleibt hinten (`WS_EX_TOPMOST` nicht gesetzt), Symbol am Pet; aus: Pet kommt nach vorn, ohne Fokus. Glocke schaltet und speichert sofort; die vorherige Einstellung wurde danach wiederhergestellt.
- Nebenbei: Maus wieder kabellos → „<Maus> · Logitech-Funk · 69 %“ (Empfängerweg jetzt auch in der App bestätigt).
- Verbrauch: minimiert 0,03 % CPU (ganze App), Home sichtbar 0,25 % (Rust-Messung davon 0,05 %). Der erste Durchlauf nach dem Start ist teurer (Programmnamen werden einmalig gelesen und zwischengespeichert).
- Neue Abhängigkeit: `windows` 0.61 mit `Win32_Graphics_Dxgi` (bereits über wry im Lockfile). `cargo check`/`pnpm desktop:build` ohne Warnungen, `pnpm build`, `pnpm format:check`, `cargo fmt --check` erfolgreich.

## Pet-Modus (Benutzerauftrag)

Vorab geprüft: transparentes Fenster zusammen mit `--disable-gpu --in-process-gpu` — mit durchsichtiger Seite ist der Desktop dahinter zu sehen, die normale App sieht mit transparentem Fenster unverändert voll deckend aus. Dafür `backgroundColor` aus `tauri.conf.json` entfernt (Tauri malt ihn sonst deckend hinter die WebView).

- Pfoten-Taste → Fenster 104 × 96 CSS-px unten rechts im Arbeitsbereich des zweiten Monitors (−128,912 bis −24,1008, über der Taskleiste), kein Rahmen, keine Ecken, Hintergrund durchsichtig; Blob schläft (keiner live). Viewport 104 × 96, Zoom 1.
- Live-Meldung (für den Test über den React-Zustand eingespielt, da ein echter Live-Start nicht auslösbar war): Fenster wächst auf 240 × 158 mit fester unterer rechter Ecke, Sprechblase „Caedrel ist live!“, Blob mit Sternaugen und „!“. Hüpfen blieb aus, weil beim Benutzer „Animationen“ aus ist (gewollt). Meldung weg → wieder 104 × 96.
- Klick auf das Pet → App wieder an der alten Stelle (−1398,191, 860 × 640), Zoom passt, Rahmen/Schatten zurück, Pfoten-Taste in der Titelleiste.
- Auslastung im Pet-Modus (45 s): 0,017 % CPU, 107 MB privat; normale App danach 0,034 %, 109 MB.
- `cargo check`/`pnpm desktop:build` ohne Warnungen, `pnpm build`, `pnpm format:check` erfolgreich.
- Nachtrag (Benutzerauftrag): Meldungen bleiben 30 s (vorher 8 s), Sprechblase mit ×. Test: Pet minimiert, Meldung ausgelöst → wiederhergestellt, 240 × 158, `WS_EX_TOPMOST` gesetzt, nicht das Vordergrundfenster (kein Fokus genommen); Meldung weg → 104 × 96, nicht mehr oben.
- Nachtrag (Benutzerauftrag): Figur wählbar (Settings → Darstellung → Pet, Vorschau-Kacheln, sofort gespeichert; Blob → `pet: "blob"`, Minimal → `"minimal"` geprüft). Neue Standardfigur „Minimal“ (flach, abgerundet, schlichte Augen); der Blob bleibt wählbar. Nativ aufgenommen: Minimal schlafend (Striche + „z“) und bei Meldung (Bogen-Augen, Sprechblase).
- **Nicht automatisiert geprüft:** Ziehen des Pets mit der echten Maus, ein echter Live-Start im Pet-Modus (Ton + Blase), ein kurzer durchsichtiger Moment beim App-Start (Fenster erscheint, bevor die Seite gezeichnet ist).

## Echte Akkustände (Benutzerauftrag)

Vorab geprüft (Wegwerf-Testprogramm außerhalb der App, nur lesende Anfragen): Kein Bluetooth-Gerät gekoppelt; die Funkgeräte hängen an USB-Empfängern. Logitech LIGHTSPEED (046D:C54D): Gerät 1 (eine Logitech-Maus), Feature 0x1004 liefert Prozent direkt (17 %, entlädt), Antwort in 19 ms, Plätze 2–6 leer (HID++-Fehler 08); die Logitech-Software lief parallel. HyperX Cloud Alpha Wireless (03F0:098D, Sammlung FF43/0202, Report 0x21, 30 Byte): sendet von sich aus nichts; Anfrage 21 BB 0B → Antwort 21 BB 0B 46 0F 5A 01 = 70 %, 3,93 V, dreimal gleich, < 100 ms.

Umsetzung: `battery.rs` (neue Abhängigkeit `hidapi` 2 mit reinem Rust-Windows-Backend, nutzt dasselbe `windows-sys` 0.61), Befehl `device_batteries` (App-Manifest + Capability). Logitech: Empfänger nur Plätze 1–6, Kabelgeräte nur 0xFF (ein Kabelgerät antwortet auf jede Nummer — beim ersten Test erschien die Maus deshalb 7-mal, behoben); Gerätekennung = Unit-ID aus 0x0003, damit dieselbe Maus über Kabel und Empfänger ein Eintrag ist. Frontend: `adapters/devices.ts`, `useBatteries` (30 s, nur sichtbar und nur auf Home/Devices), Devices-Seite und Home-Karte; Mock-Geräte aus `mock.ts` entfernt; `RefreshButton` nimmt jetzt ein allgemeines Ergebnis.

- Nativ: „<Maus> · Logitech-Kabel · Lädt · 69 %“ (Maus hing zum Testzeitpunkt am Ladekabel; zwischen zwei Messungen 66 → 69 %) und „HyperX Cloud Alpha Wireless · HyperX-Funk · 70 %“; Home „Dein Setup“ gleich; Badge „Live“. Frische Abfrage 240–260 ms, gecachte < 5 ms. Aktualisieren-Knopf: dreht, Haken, Tooltip mit Uhrzeit.
- Browser-Vorschau: Devices und Home-Karte „Nur in der Desktop-App“, keine Konsolenfehler.
- `cargo check`/`pnpm desktop:build` ohne Warnungen, `pnpm build`, `pnpm format:check` erfolgreich.
- **Noch nicht geprüft** (Hardwarezustand nötig): Maus kabellos nach dem Laden (Empfängerweg funktionierte im Vortest), schlafende Maus („Nicht erreichbar“), ausgeschaltetes Headset — die App wertet fehlende oder unplausible Antworten (0 %, 0 V) als „Nicht erreichbar“; ob der Empfänger dann stattdessen einen alten Wert meldet, ist offen.

## Farbe sofort gespeichert, nur eine Instanz (Benutzerauftrag)

Die Farbe wurde schon beim Klick in localStorage geschrieben. Geprüft, ob WebView2 das verzögert und verliert: Testwert schreiben, App nach 0,3 s über das X schließen bzw. nach 0,3/8/30 s hart beenden, neu starten — in allen fünf Fällen erhalten. Gefundene Ursache: Die App ließ sich zweimal starten; beide Fenster lagen deckungsgleich auf dem zweiten Monitor, und das verdeckte Fenster schrieb bei der nächsten Änderung seine alte Farbe zurück (außerdem doppelte Live-Meldungen). Behoben mit einer Einzel-Instanz-Sperre in Rust (benannter Mutex, ohne neue Abhängigkeit).

- Zweiter und dritter Start bei minimiertem Fenster: weiterhin eine Instanz, das Fenster wird wiederhergestellt (vorher minimiert, danach 860 × 640 auf dem zweiten Monitor).
- Farbe in Settings wählen, 50 ms später über das X schließen, neu starten: Ozean bzw. Lavendel aktiv und gespeichert. Danach wieder die vorherige Farbe.
- `cargo check`/`pnpm desktop:build` ohne Warnungen.

## Ressourcen, Live-Auslastung, zweiter Monitor, Autostart (Benutzerauftrag)

Messung vorher/nachher mit Skript über blank.exe und alle WebView2-Unterprozesse (Prozessbaum, CPU-Zeit über das Intervall, 8 logische Kerne; „privat“ = PrivateMemorySize, Leerlauf auf Home):

|                 | vorher                                | nachher                               |
| --------------- | ------------------------------------- | ------------------------------------- |
| sichtbar, 60 s  | 0,57 % CPU, 236 MB privat, 7 Prozesse | 0,15 % CPU, 124 MB privat, 6 Prozesse |
| minimiert, 90 s | 0,31 % CPU, Arbeitssatz 467 MB        | 0,14 % CPU, Arbeitssatz 184 MB        |

Die Werte schwanken je nach Abfragezeitpunkten; währenddessen wurde die App teils bedient. Getestete WebView2-Varianten (je 45 s sichtbar): Standard 207 MB privat; `--disable-gpu` 135 MB; `--in-process-gpu` 172 MB; beide zusammen 104 MB (übernommen); `--disable-background-networking --disable-component-update` brachte nichts Messbares. Darstellung mit Software-Rendering geprüft (Home, Pros mit Vorschaubildern und Icons): unverändert.

- Minimiert (nativ per `ShowWindow`): `document.visibilityState` = hidden, Auslastungsanzeige pausiert (Wert nach 5 s unverändert), nach dem Wiederherstellen visible und Abfrage läuft weiter; Arbeitsspeicher danach 66 MB (Speicherziel „niedrig“ gibt Speicher frei).
- Live-Anzeige: `app_usage` (neuer Rust-Befehl, in `build.rs` und Capabilities freigegeben) liefert z. B. CPU 0,44 %, 80 MB privater Arbeitssatz, 6 Prozesse; Titelleiste „< 0,1 % · 78 MB“, alle 2 s aktualisiert. Tooltip-Text ist fest (vorher enthielt er die Werte und flackerte beim Hovern — vom Benutzer gemeldet und behoben); über 4 Aktualisierungen geprüft unverändert. Unlesbarer Speicher eines Prozesses ergibt „–“ statt einer Teilsumme.
- Settings → System: „Auslastung: CPU 0,4 % · Arbeitsspeicher 78 MB · 6 Prozesse“, Einstufung „Niedrig“ (Grenzen: < 1 % CPU und < 300 MB; < 5 % und < 600 MB „Mittel“; sonst „Hoch“). Browser-Vorschau: beide Zeilen „Nur in der Desktop-App“, kein Titelleisten-Wert, keine Konsolenfehler.
- Autostart: Schalter an → `HKCU\…\Run\blank` = Pfad der EXE in Anführungszeichen, `autostart_enabled` true; aus → Wert entfernt. Danach wieder aus (Benutzer entscheidet selbst). Nicht geprüft: tatsächlicher Start nach Windows-Anmeldung.
- Zweiter Monitor (links, X −1920…0, beide 1920 × 1080, 96 DPI): Fenster −1398,191 bis −522,840 = mittig im Arbeitsbereich, Client 860 × 640. Nicht geprüft: nur ein Monitor, gemischte Skalierung.
- `cargo check`/`pnpm desktop:build` ohne Warnungen, `pnpm build`, `pnpm format:check`, `cargo fmt --check` erfolgreich. Neue direkte Abhängigkeiten `webview2-com` 0.38 und `windows-core` 0.61 (bereits über Tauri/wry im Lockfile, gleiche Versionen).

## Lautstärke und Farbschemata (Benutzerauftrag)

**Lautstärke:** Regler „Lautstärke“ (0–100 %, Schritt 5, Standard 70) unter „Ton bei Live-Start“, deaktiviert bei ausgeschaltetem Ton. Das Verstellen spielt keinen Ton (auf Benutzerwunsch entfernt); Probehören nur über „Testen“, das die eingestellte Lautstärke nutzt. Nativ geprüft: Am Regler hängt nur noch `onChange` (React-Props im WebView), im Bundle kein `onPointerUp` mehr. Nativ: `play_alert_sound(volume: u8)` (kein neuer Befehl, Capabilities unverändert) skaliert die Samples einer Kopie mit (v/100)² und spielt synchron in einem eigenen Thread, damit der Puffer bis zum Ende lebt. Rust-Unit-Tests (`cargo test --lib sound`, 2 bestanden): Kopie bei 100 % identisch, bei 50 % Spitzenwert genau ein Viertel, bei 0 % still, andere Daten abgelehnt. Per Debug-Port aufgerufen: 0/35/100 ok, 150 wird auf 100 begrenzt, −1 abgelehnt. Die gehörte Lautstärke wurde nicht automatisiert gemessen.

**Farbschemata:** Wald (Standard, bisherige Farben), Ozean, Lavendel, Glut, Rosé, Graphit — Auswahl als runde Farbfelder in Settings → Darstellung (`aria-pressed`, Name darunter). Die Paletten in `tokens.css` sind aus Wald abgeleitet (gleiche Sättigung/Helligkeit, anderer Farbton; Graphit fast ohne Sättigung). 35 feste Grüntöne in `app.css`/`desktop.css` durch Tokens (`--accent-line`, `--accent-ink`) bzw. `color-mix()` ersetzt; übrig sind nur Kanal-Avatarfarben, Fehlerrot und ungenutzte alte Hero-Stile. „Darstellung zurücksetzen“ setzt auch das Farbschema zurück, Ton und Lautstärke bleiben.

- `pnpm build`, `pnpm format:check`, `cargo fmt --check`, `pnpm desktop:build` erfolgreich.
- Browser-Vorschau (860 × 640): kein horizontaler Überlauf, keine Konsolenfehler; Farbfeld „Ozean“ setzt `data-theme`, Akzent `#8cc2d5`, Hintergrund folgt, Auswahl nach Neuladen erhalten.
- Nativ: Home und Pros in allen sechs Schemata aufgenommen — Akzent, Sidebar-Markierung, Hintergrund-Tönung, Badges, Balken und Champion-Zeile wechseln einheitlich, Texte lesbar. Bestehende Einstellungen (ohne Lautstärke/Farbe gespeichert) werden übernommen: Wald, 70 %, Animationen aus blieb aus. Die Testauswahl wurde danach auf den vorherigen Stand zurückgesetzt. Normale EXE lädt die gebündelte Oberfläche.

## Pros: Champion-Icons, Lane und Filter (Benutzerauftrag)

Jeder Eintrag in `src/data/proStreamers.ts` hat jetzt Lane und bis zu drei Champions (Data-Dragon-IDs, meistgespielt zuerst); OTPs nur ihren Champion. Die Liste ist in `pros`, `oneTricks` und `highElo` aufgeteilt, daraus ergibt sich der Typ für den Filter. Quelle: einmalig im Browser auf dpm.lol abgelesen — für die DPM-Spieler Rolle und Top-3-Champions aus der Leaderboard-Zeile (erstes Konto bei mehreren); für die handverlesenen Spieler die bekannte Rolle und die Champions aus „Last 2 Weeks“ ihrer DPM-Pro-Seite (bei 0 Spielen oder ohne DPM-Seite keine Icons, nur die Lane: u. a. Rekkles, Odoamne, Froggen, Bjergsen, Sneaky, TFBlade). Stand 22.09.2026, Momentaufnahme; die App liest DPM.LOL nicht aus. Rollen ohne DPM-Signal (z. B. LS) sind eine Einschätzung.

Karte: Untertitel mit 18-px-Champion-Icons, Lane (Akzentfarbe) und Einordnung, z. B. „ADC · Ex-Pro“. Icons kommen von Riots CDN (`ddragon.leagueoflegends.com/cdn/16.18.1/img/champion/<id>.png`, in der CSP freigegeben, nicht im Repo); nicht ladbare Icons werden ausgeblendet. Filter-Knopf (Lucide `ListFilter`) als `filter-button icon-only` direkt links neben dem Aktualisieren-Knopf, öffnet ein Panel mit Lane (Alle/Top/Jungle/Mid/ADC/Support) und Typ (Alle/Pro/OTP/High Elo) samt Live-Anzahl je Option. Der Filter wird nicht gespeichert.

- `pnpm build`, `pnpm format:check`, `pnpm desktop:build` erfolgreich.
- Nativ über den WebView2-Debug-Port geprüft: 22 live; Filter- und Aktualisieren-Knopf beide 44 × 38 px, nebeneinander; Karten zeigen z. B. „loltyler1 | ADC · High Elo | Draven, Brand, Illaoi“, „Spear_Shot | Top · OTP Pantheon | Pantheon“, TFBlade/Aphromoo nur Lane; sichtbare Icons geladen (weiter unten lazy).
- Filter: Lane Mid → „10 von 22 live“, nur Mid-Karten; + Typ OTP → 4; Support + OTP → 0 mit Leerzustand „Kein Live-Spieler passt zum Filter“ und „Filter zurücksetzen“ → wieder 22. Knopf hervorgehoben, solange das Panel offen oder ein Filter aktiv ist (`aria-expanded`, `aria-pressed` an den Optionen).
- Twitch-Tab unverändert (1 live, 2 offline, Untertitel = Spielname). Normale EXE (ohne Debug-Port) lädt die gebündelte Oberfläche.

## Pro-Liste mit DPM.LOL erweitert (Benutzerauftrag)

Einmalige Recherche im Browser auf dpm.lol (Cookie-Einwilligung abgelehnt): SoloQ-Leaderboard Seiten 1–20 (Top 1000, alle Regionen) → 302 Spieler mit Team-Kürzel oder STREAMER-Kennzeichnung; OTP-Leaderboard → 50 Spieler; zusammen 334 Profile, auf jedem den verlinkten Twitch-Kanal abgelesen (nacheinander mit Pausen) → 226 mit Kanal. Champion-IDs der OTPs über Riots Data Dragon (16.18.1) in Namen übersetzt. Einordnung: Team-Kürzel → „Pro · TEAM“, OTP → „OTP Champion“, sonst „High Elo“. Doppelte entfernt; vorhandene Einträge behalten, außer Bwipo (DPM verlinkt `bwipolol` statt `bwipo`). Nativ geprüft: 254 Kandidaten, 12 bei Twitch nicht (mehr) vorhanden und entfernt → **242 Kanäle** (158 Pros, 20 Ex-Pros, 34 High Elo, 26 OTPs, 4 weitere). Zum Prüfzeitpunkt 25 live, davon 23 in League angezeigt (vorher 6), 2 in VALORANT ausgeblendet. Die App liest DPM.LOL nicht selbst aus; die Liste veraltet mit der Zeit (Teamwechsel, umbenannte Kanäle) und wird bei Bedarf von Hand aktualisiert.

## Pros-Tab (Benutzerauftrag)

Neuer Bereich „Pros“ (Sidebar unter LIVE): kuratierte Liste `src/data/proStreamers.ts`, Abfrage über die vorhandenen Befehle `twitch_live_streams`/`twitch_channels` in 100er-Paketen, nur Streams in League of Legends (`game_id` 21779), sortiert nach Zuschauern, keine Offline-Kanäle. Stream-Karte und Aktualisieren-Button sind jetzt gemeinsame Komponenten (`StreamCard`, `RefreshButton`) für Twitch und Pros.

Recherche der Liste: trackingthepros (Stream-Seite 504, Spielerliste ohne Twitch), deeplol (Pro-Seite 404), lolpros.gg und OP.GG (keine Stream-Listen), Leaguepedia-API (anonym dauerhaft rate-limitiert). Die Liste wurde deshalb von Hand aus bekannten Pros/Ex-Pros, High-Elo-Spielern und OTPs zusammengestellt und nativ geprüft: 42 Kandidaten, 39 existieren (`iwilldominate`, `biofrost`, `hashinshin` entfernt); Kategorie-ID 21779 = League of Legends bestätigt; zum Prüfzeitpunkt 8 Kanäle live, davon 6 in League angezeigt, 2 in VALORANT korrekt ausgeblendet; Badge „Twitch“; Twitch-Tab unverändert (1 live, 2 offline); normale EXE lädt korrekt. Rollenangaben nur, wo sie stabil sind.

## Eigener Live-Ton (Benutzerauftrag)

Der synthetische Zweiklang wurde durch die vom Benutzer gewählte Datei ersetzt: MP3 (1,78 s, Stereo, 44,1 kHz) einmalig mit einem temporären WASM-Decoder in 16-Bit-WAV umgewandelt, Spitzenpegel 0,39 (keine Übersteuerung). Rust bettet sie per `include_bytes!` ein; die Browser-Vorschau spielt dieselbe Datei. Nativ abgespielt. Hinweis: Ein Build schlug einmal fehl (EXE vermutlich noch gesperrt); ein Testskript lief danach wegen fehlender Fehlerbehandlung endlos und wurde beendet, das Skript bricht jetzt bei Fehlern ab.

## Live-Meldung mit Ton (Benutzerauftrag)

Rust: `twitch/eventsub.rs` hält eine EventSub-WebSocket-Verbindung (tokio-tungstenite, native-tls) und abonniert `stream.online` für die ersten 10 ausgewählten Kanäle (Twitch-Kostenlimit 10 pro Nutzer-Token). Bei einer Meldung werden Spiel und Titel über `/helix/channels` nachgeladen und als Ereignis an die Oberfläche geschickt. Neuverbindung bei Abbruch, fehlendem Keepalive oder `session_reconnect`; Neustart bei Änderung der überwachten Kanäle, Client-ID, Login oder Logout. `sound.rs` erzeugt einen kurzen Zweiklang im Speicher und spielt ihn über `PlaySoundW` (keine Audiodatei, unabhängig vom Windows-Soundschema). Frontend: `useGoLiveAlerts` meldet sofort bei Push (mit Spielregel-Prüfung) und erkennt außerdem Übergänge offline/anderes Spiel → live im 30-s-Abruf; höchstens eine Meldung pro Kanal in 10 Minuten; erster Abruf nach Start und neu hinzugefügte Kanäle lösen nichts aus. Meldung unten rechts (8 s, anklickbar, schließbar), Ton abschaltbar und testbar in Settings → Benachrichtigungen, dort auch Status der Sofort-Meldung.

Geprüft: Browser-Vorschau (Mock-Kanal zur Laufzeit live geschaltet): Meldung „quietquest ist live · Minecraft“, Karte erscheint, zweites Aktualisieren ohne doppelte Meldung, Meldung nach 8 s weg, Ton-Schalter gespeichert, Konsole fehlerfrei. Nativ: Sofort-Verbindung aktiv, Twitch hat alle 6 Kanäle abonniert (`connected: true, watched: 6`), Settings zeigt „6 Kanäle“; Oberfläche darf auf das Ereignis hören, aber nicht selbst senden (ACL); Ton über `play_alert_sound` abgespielt; normal gestartete EXE lädt korrekt.

Nicht geprüft: eine echte `stream.online`-Meldung (braucht einen tatsächlich live gehenden Kanal) und das Verhalten bei minimiertem Fenster.

## Fehler: EXE zeigte nur „127.0.0.1 refused to connect“

Ursache: Nach `pnpm desktop:build` wurde zur Warnungsprüfung noch `cargo build --release` ausgeführt. Das überschrieb `blank.exe` mit einem Build ohne `tauri/custom-protocol`, der den Dev-Server lädt. Diese EXE wurde auch verschickt. Behoben durch erneutes `pnpm desktop:build`; Fensterinhalt per `PrintWindow` geprüft (Home mit echten Twitch-Daten). Regel in CLAUDE.md ergänzt.

## Transparenz verworfen, Twitch-Suche entfernt (Benutzerauftrag)

`src-tauri/src/window_opacity.rs` gelöscht, Aufruf aus `lib.rs` entfernt; das Fenster ist voll deckend. Die älteren Abschnitte zur Transparenz unten beschreiben einen früheren Stand. Twitch-Suchleiste entfernt; „Nur live“, „Kanäle“ und Aktualisieren stehen rechtsbündig, Leerzustand „Gerade ist keiner deiner Kanäle live“ mit „Alle Kanäle zeigen“. Nativ geprüft: keine Suchleiste mehr, „Nur live“ blendet Offline-Kanäle aus und wieder ein.

## Redesign in Richtung DPM (Benutzerauftrag)

Nur Aufbau und Wirkung übernommen, keine Logos/Bilder/Farben: Farbpalette dunkler (Tokens, gleiche Namen), grüner Schimmer unten links; Sidebar ohne Rahmen mit Version, Abschnitten „Übersicht/Live/System“, aktivem Balken und Profilblock (eigenes Twitch-Profilbild über `fetchChannels`, Klick → Settings); Inhalt in eingerahmtem Panel; Seitenkopf mit Symbol-Kachel; Mock/Twitch-Badge in der Titelleiste; Leerzustände mit Symbol-Kachel; Segoe UI Variable als Schrift (Fallback Segoe UI). Seiten unverändert.

Geprüft (nativ mit echten Daten, WebView-Aufnahmen): alle sechs Seiten bei 860 × 640; Home, League, Devices, PC ohne Überlauf, Twitch/Settings scrollen; Sidebar passt ohne Überlauf. Funktionen: Profilblock → Settings, League-Auswahl, Twitch-Suche mit Leerzustand und Zurücksetzen, „Nur live“, Kanal-Panel, Aktualisieren („Aktualisiert“), Fensterknöpfe und Badge in der Titelleiste. Browser-Vorschau 720 × 540: schmale Sidebar blendet Beschriftungen/Version/Profiltext aus, kein Überlauf; „Kompakte Ansicht“ bleibt nach Neuladen gespeichert; Konsole fehlerfrei.

## Rückmeldung beim Aktualisieren (Benutzerauftrag)

Auf dem Prüfrechner sind Windows-Animationen aus (`SPI_GETCLIENTAREAANIMATION` = false, WebView meldet `prefers-reduced-motion: reduce`), daher war das Drehen nie sichtbar. `RefreshButton`: mindestens 0,7 s Ladezustand (Symbol gedimmt, mit Animationen zusätzlich drehend), danach 1,6 s grüner Haken bzw. rotes Ausrufezeichen bei Fehler (Symbol- und Farbwechsel, funktioniert ohne Animation), Screenreader-Ansage „Aktualisiert“. Nativ gemessen: 50/400 ms Laden → 900/1500 ms Haken → 2700 ms wieder normal.

## Aktualisieren lädt alles (Benutzerauftrag)

Der Button lädt jetzt Streams (Titel, Spiel, Zuschauer, Vorschaubild) und Kanaldaten (Anzeigename, Profilbild) aller ausgewählten Kanäle. Kanaldaten kommen gebündelt über den neuen Befehl `twitch_channels` (eine `/helix/users`-Anfrage für bis zu 100 Kanäle); das einmalige Nachladen fehlender Profilbilder nutzt denselben Weg. Nativ geprüft: `twitch_channels` liefert nur gültige, existierende Kanäle (ungültiger und unbekannter Name übergangen); Klick → Drehen ca. 0,4 s, Stand aktualisiert, neue Vorschaubild-Adresse, Profilbild aktuell. Grenze: Twitch selbst übernimmt Titel-/Spieländerungen in der API teils mit etwas Verzögerung, Vorschaubilder erneuert Twitch etwa alle 5 Minuten.

## Stream per Klick öffnen (Benutzerauftrag)

Live-Karten, Offline-Zeilen und Home-Einträge öffnen den Kanal im Standardbrowser (`twitch.tv/<login>`). Rust-Befehl `twitch_open_channel` baut die URL selbst aus einem geprüften Login (keine freien URLs aus dem Frontend), per App-Manifest und Capability freigegeben. Browser-Vorschau/Mock: nicht klickbar (fiktive Kanäle). Nativ geprüft: `../evil`, `https://example.com`, `a b` → „Ungültiger Kanal“; Klickfläche liegt über der ganzen Karte bzw. Zeile, Tastatur-Fokus sichtbar. Das tatsächliche Öffnen eines gültigen Kanals wurde nicht automatisiert ausgelöst (würde einen Browser-Tab beim Benutzer öffnen).

## Aktualisieren-Button (Benutzerauftrag)

Button in der Twitch-Toolbar: fragt Live-Status sofort ab (startet den 60-s-Takt neu) und hängt einen Zeitstempel an die Vorschaubild-Adresse, damit das Bild frisch geladen wird (automatisch sonst höchstens alle 5 Minuten, `t`-Parameter aus Rust). Tooltip zeigt den Stand. Nativ mit echten Daten geprüft: Symbol dreht sich und Button ist gesperrt während der Abfrage, danach neues Bild (`…?t=5967011&r=…` geladen, sichtbar andere Szene) und aktualisierte Zuschauerzahl. Drehung entfällt bei reduzierter Bewegung.

## Twitch-Karten neu gestaltet (Benutzerauftrag)

Erste echte Daten (loltyler1 live) zeigten ein beschnittenes Vorschaubild mit Spielname darüber, einen vierzeiligen Titel, Initialen statt Profilbild und die nutzlose Angabe „Alle Spiele“. Neu: volles 16:9-Vorschaubild bündig in der Karte (Ursache des Randes: `desktop.css` überschrieb `.stream-card { padding: 0 }`), Plaketten „Live“ und Zuschauerzahl, echtes Profilbild (aus `/helix/users`, beim Kanal gespeichert, ältere Auswahl einmalig nachgeladen, Rückfall auf Initialen), einzeiliger Titel mit Tooltip, Spiel darunter. Live-Kanäle nach Zuschauern sortiert; Offline-Kanäle als kompakte Zeile statt großer leerer Karten. Im nativen Fenster mit echten Daten (Vorschaubild 440 × 248, Profilbild geladen) und in der Browser-Vorschau mit Mock-Daten geprüft, Konsole fehlerfrei.

## Festes Seitenverhältnis (Benutzerauftrag)

`src-tauri/src/window_aspect.rs`: Subclass-Hook für `WM_SIZING` (gezogene Kante führt), `WM_WINDOWPOSCHANGING` (alle übrigen Größenänderungen, Minimieren ausgenommen) und `WM_GETMINMAXINFO` (DPI-genaue Grenzen inkl. unsichtbarer Ränder, ersetzt tao-Werte). WebView-Zoom = Client-Breite / 860. Im nativen Fenster (96 DPI) gemessen:

- Start 860 × 640, CSS-Viewport 860 × 640, Zoom 1,0.
- `SetWindowPos` 1400 × 800 → 1000 × 744 (Zoom 1,163); 400 × 300 → 720 × 536 (0,837); 950 × 900 → 934 × 695 (1,086). CSS-Viewport jeweils exakt 860 × 640.
- `WM_SIZING` rechter Rand +57 px → Höhe folgt (Verhältnis 1,3446); oberer Rand −40 px → Breite folgt, Unterkante bleibt (1,3441); Soll 1,3438.
- Grenzen jetzt exakt: Min-Track 736 × 545 (Client 720 × 536), Max-Track 1016 × 753 (Client 1000 × 744). Die frühere tao-Abweichung (704 × 511 bis 984 × 751) ist behoben.
- WebView-Aufnahmen bei 1000 × 744 und 720 × 536 zeigen identisches, scharf skaliertes Layout.
- Layout bei 860 × 640: Home, League (Build/Runen/Skill Order jetzt nebeneinander), Devices und PC (Symbol in der Kartenecke, Systemübersicht zweispaltig) füllen die Fläche exakt ohne Scrollen (vorher PC 184 px, League 35 px Überlauf); Twitch und Settings scrollen. Home zeigt höchstens 3 Live-Kanäle plus „+N weitere live“.
- Nicht geprüft: echtes Ziehen mit der Maus (nur per Nachricht simuliert), Aero Snap, andere DPI-Stufen.

## Echte Twitch-Anbindung (Benutzerauftrag)

Rust-Modul `src-tauri/src/twitch/` (reqwest 0.13 mit native-tls/Schannel, keyring 3 mit Windows-Backend, serde, tokio „time“). Elf Befehle, per App-Manifest in `build.rs` und `capabilities/default.json` einzeln freigegeben. Release-Build und `cargo fmt --check` ohne Warnungen.

Im nativen Fenster (per WebView2-Debug-Port nur für den Test gesteuert):

- Ohne Client-ID: `twitch_account` → nicht konfiguriert; Home „— Streams online · Nicht mit Twitch verbunden“; Twitch-Seite zeigt nur die Konto-Karte mit Client-ID-Feld; Badge „Twitch“ statt „Mock“.
- Befehle ohne Konfiguration liefern `{ kind: "not-configured" }` (typisierte Fehler kommen im Frontend an).
- Client-ID gespeichert (`%APPDATA%\com.blank.desktop\twitch.json`), „Mit Twitch verbinden“ → echte HTTPS-Anfrage an `id.twitch.tv`; Twitch lehnt die absichtlich ungültige Test-ID mit „invalid client“ ab, die Karte zeigt die Meldung (jetzt übersetzt). „Client-ID ändern“ öffnet das Feld wieder. Settings zeigt die Twitch-Karte, „Verbindungen“ nur noch geplante Punkte.
- Test-Konfiguration danach gelöscht; kein Eintrag `blank.twitch` in der Anmeldeinformationsverwaltung.
- Erste echte Nutzung: Kanalname („loltyler1“) statt Client-ID eingetragen → Twitch „invalid client“. Nachgebessert: kurze Einrichtungsschritte im Client-ID-Feld, Eingaben unter 20 Zeichen werden im Frontend und in Rust abgelehnt („Das ist keine Client-ID, sondern z. B. ein Kanalname …“), bei „invalid client“ öffnet sich das Feld wieder. Im nativen Fenster geprüft.
- Browser-Vorschau: weiter Mock-Adapter ohne Konto-Karte; neue Spielsuche (Fokus, Treffer, „Keine Treffer“), Regeländerung blendet sofort aus; Konsole fehlerfrei.

**Nicht geprüft (braucht deine Client-ID und deinen Login):** Code-Anzeige und Bestätigung im Browser, Token-Speicherung, Validierung/Refresh, echte Kanalsuche, Live-Streams mit Vorschaubildern, Trennen. Ob Twitch den Device Flow mit leerer Scope-Liste akzeptiert, ist nicht dokumentiert und muss beim ersten Login geprüft werden.

## Twitch-Kanalauswahl mit Spielfiltern (Mock, Benutzerauftrag)

Typisierter Adapter (`src/adapters/twitch.ts`) mit Mock-Umsetzung; Zustände Laden, Fehler, veraltete Daten, unbekannter Status und Offline sind modelliert (unbekannt wird nie als offline angezeigt). Kein Netzwerk, kein Login. Browser-Vorschau bei 860 × 640 und 720 × 520, Konsole fehlerfrei:

- Standardauswahl: Home „02 Streams online“ (forestbyte, pixelpilot); nightwave (Regel „nur League“, spielt Just Chatting) ausgeblendet, Kanalverwaltung zeigt „ausgeblendet“.
- Spiel zu nightwave hinzugefügt → erscheint, Live-Zähler 3; Chip entfernt → „Alle Spiele“.
- Kanal hinzufügen: emberline gefunden und live (Minecraft); unbekannter Name → „nicht gefunden (Mock-Daten)“; „ ForestByte “ → „bereits ausgewählt“ (Groß-/Kleinschreibung und Leerzeichen normalisiert).
- Auswahl bleibt nach Neuladen erhalten; Home danach „04 Streams online“.
- Suche „MINECRAFT“ → emberline; „zzz“ → Leerzustand, „Filter zurücksetzen“ funktioniert; „Nur live“ blendet Offline-Kanäle aus.
- Leerzustände „Deine Kanäle spielen gerade andere Spiele“ und „Keine Kanäle ausgewählt“ geprüft.
- Toolbar bleibt bei 720 px einzeilig, kein horizontaler Überlauf.
- Enter im Kanalfeld konnte das Testwerkzeug nicht auslösen (auch nicht bei einem neutralen Testformular); Absenden per Button und `requestSubmit()` geprüft. Bitte Enter einmal manuell prüfen.

## Behobene Fehler

1. **Transparenz wirkungslos.** tao schreibt `GWL_EXSTYLE` bei jeder Flag-Änderung (hier `window.show()`) aus seinen eigenen Flags neu und entfernt dabei `WS_EX_LAYERED`. Das Fenster war dadurch vollständig deckend, obwohl `apply` fehlerfrei durchlief. `window_opacity.rs` installiert nun zusätzlich einen `SetWindowSubclass`-Hook, der bei `WM_STYLECHANGING` das Layered-Bit beibehält. Das Fenster wird weiterhin erst mit angewendeter Deckkraft eingeblendet.
2. **„bblank.“ bei schmalem Fenster.** Unter 780 px Breite (im Desktopfenster 720–780 px) überschrieb `desktop.css` mit `.brand { font-size: 27px }` die kompakte Logo-Regel aus `app.css`; „b“ und „blank.“ erschienen gemeinsam und überlagerten die Seitenüberschrift. `desktop.css` setzt im kompakten Breakpoint jetzt ebenfalls `font-size: 0`, sodass das vorgesehene „b.“ erscheint.

## Nicht geprüft / Grenzen

- Nur 96 DPI (100 %) geprüft; Skalierung 125/150 % und mehrere Monitore noch offen.
- Maximieren per Win+Pfeil-oben und Andocken am oberen Bildschirmrand nicht automatisiert geprüft (keine Eingaben in die Benutzersitzung eingespeist); manuell nachprüfen.
- `pnpm desktop:dev` nicht separat geprüft; Release-Build und Browser-Vorschau decken beide Pfade ab.
- Keine Installer, Signierung, Updates, Autostart. Es gibt absichtlich keine externen APIs, Netzwerkanfragen aus der App, Hardware-Abfragen, Authentifizierung oder echte Spieldaten. Kein vollständiges Accessibility-Audit.

## Frühere Frontend-Prüfung (weiterhin gültig)

League-Auswahl aktualisiert den Demo-Text; Devices ohne erfundenen Akkustand beim Offline-Controller; Settings-Schalter werden persistiert und lassen sich zurücksetzen. Diese Logik wurde in dieser Runde nicht verändert.
